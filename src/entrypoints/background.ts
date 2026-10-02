import { browser } from 'wxt/browser';
import { TRANSLATE_PORT, type StreamMessage, type StreamRequest } from '../lib/messaging';
import { getActiveProvider, getSettings } from '../lib/storage';
import { translateSegmentsStream, translateTextStream } from '../lib/translator';

// Must stay well under Chrome's 30 s service-worker idle timeout.
const HEARTBEAT_MS = 20_000;
const THINKING_THROTTLE_MS = 5_000;

export default defineBackground(() => {
  // Network calls to user-defined LLM endpoints run here in the service worker
  // to bypass page-level CORS restrictions. Streaming uses a long-lived port so
  // the worker stays alive while chunks (or heartbeat pings) are flowing. Both
  // single-selection and full-page (batch) translation share this port;
  // full-page opens one per batch.
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
      // Pings keep the worker alive during silent stretches (header wait, retry
      // sleeps, reasoning) that would otherwise hit Chrome's idle timeout.
      const heartbeat = setInterval(() => send({ type: 'ping' }), HEARTBEAT_MS);
      try {
        try {
          const [provider, { tone }] = await Promise.all([getActiveProvider(), getSettings()]);
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
              tone,
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
                // Streaming returns headers immediately, so a reasoning model's
                // thinking time doesn't count toward Chrome's fetch-response limit.
                let text = '';
                for await (const d of translateTextStream(
                  provider,
                  msg.segments[i]!,
                  msg.targetLang,
                  tone,
                  controller.signal,
                )) {
                  if (d.kind === 'content') text += d.text;
                }
                // An empty result (e.g. the stream ended after reasoning only)
                // would blank the node; leave the original text instead.
                if (text.trim()) send({ type: 'segment', index: i, text: text.trim() });
              } catch {
                if (controller.signal.aborted) return;
                // Leave just this segment untranslated rather than failing the batch.
              }
            }
          } else {
            let lastThinkingAt = 0;
            for await (const d of translateTextStream(
              provider,
              msg.text,
              msg.targetLang,
              tone,
              controller.signal,
            )) {
              if (d.kind === 'content') {
                send({ type: 'chunk', delta: d.text });
              } else if (Date.now() - lastThinkingAt >= THINKING_THROTTLE_MS) {
                lastThinkingAt = Date.now();
                send({ type: 'thinking' });
              }
            }
          }
          send({ type: 'done' });
        } catch (e) {
          if (controller.signal.aborted) return;
          send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      } finally {
        clearInterval(heartbeat);
      }
    });
  });
});
