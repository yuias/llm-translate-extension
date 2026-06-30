import { browser } from 'wxt/browser';
import { TRANSLATE_PORT, type StreamMessage, type StreamRequest } from '../lib/messaging';
import { getActiveProvider } from '../lib/storage';
import { translateSegmentsStream, translateText, translateTextStream } from '../lib/translator';

export default defineBackground(() => {
  // Network calls to user-defined LLM endpoints run here in the service worker
  // to bypass page-level CORS restrictions. Streaming uses a long-lived port so
  // the worker stays alive while chunks are flowing. Both single-selection and
  // full-page (batch) translation share this port; full-page opens one per batch.
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== TRANSLATE_PORT) return;

    const controller = new AbortController();
    port.onDisconnect.addListener(() => controller.abort());

    port.onMessage.addListener(async (msg: StreamRequest) => {
      const send = (m: StreamMessage) => {
        try {
          port.postMessage(m);
        } catch {
          // Port already closed by the content side; nothing to do.
        }
      };
      try {
        const provider = await getActiveProvider();
        if (!provider) {
          send({ type: 'error', message: 'No translation provider is configured.' });
          return;
        }
        if (msg.kind === 'batch') {
          // Each segment carries its own id, so the model merging or dropping
          // items only leaves those nodes untranslated — the rest still land on
          // the right node. No all-or-nothing count check needed.
          const seen = new Set<number>();
          for await (const seg of translateSegmentsStream(
            provider,
            msg.segments,
            msg.targetLang,
            controller.signal,
          )) {
            seen.add(seg.index);
            send({ type: 'segment', index: seg.index, text: seg.text });
          }
          // Patch the gaps: any segment the model merged away, dropped, or
          // truncated gets retried on its own. A lone string can't be folded
          // into its neighbours, so this guarantees coverage (and doubles as a
          // fallback when the model ignores the array format entirely).
          for (let i = 0; i < msg.segments.length; i++) {
            if (controller.signal.aborted) return;
            if (seen.has(i) || !msg.segments[i]!.trim()) continue;
            try {
              const text = await translateText(
                provider,
                msg.segments[i]!,
                msg.targetLang,
                controller.signal,
              );
              send({ type: 'segment', index: i, text });
            } catch {
              if (controller.signal.aborted) return;
              // Leave just this segment untranslated rather than failing the batch.
            }
          }
        } else {
          for await (const delta of translateTextStream(
            provider,
            msg.text,
            msg.targetLang,
            controller.signal,
          )) {
            send({ type: 'chunk', delta });
          }
        }
        send({ type: 'done' });
      } catch (e) {
        if (controller.signal.aborted) return;
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    });
  });
});
