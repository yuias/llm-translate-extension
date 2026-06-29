import { browser } from 'wxt/browser';
import { TRANSLATE_PORT, type StreamMessage, type StreamRequest } from '../lib/messaging';
import { getActiveProvider } from '../lib/storage';
import { translateSegmentsStream, translateTextStream } from '../lib/translator';

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
          let count = 0;
          for await (const seg of translateSegmentsStream(
            provider,
            msg.segments,
            msg.targetLang,
            controller.signal,
          )) {
            send({ type: 'segment', index: seg.index, text: seg.text });
            count++;
          }
          if (count !== msg.segments.length) {
            send({
              type: 'error',
              message: `Batch size mismatch: expected ${msg.segments.length}, got ${count}`,
            });
            return;
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
