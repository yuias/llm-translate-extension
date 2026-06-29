import { browser } from 'wxt/browser';
import {
  TRANSLATE_PORT,
  type BatchTranslateMessage,
  type BatchTranslateResponse,
  type StreamMessage,
  type TranslateRequest,
} from '../lib/messaging';
import { getActiveProvider } from '../lib/storage';
import { translateSegments, translateTextStream } from '../lib/translator';

export default defineBackground(() => {
  // Network calls to user-defined LLM endpoints run here in the service worker
  // to bypass page-level CORS restrictions. Streaming uses a long-lived port so
  // the worker stays alive while chunks are flowing.
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== TRANSLATE_PORT) return;

    const controller = new AbortController();
    port.onDisconnect.addListener(() => controller.abort());

    port.onMessage.addListener(async (msg: TranslateRequest) => {
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
        for await (const delta of translateTextStream(
          provider,
          msg.text,
          msg.targetLang,
          controller.signal,
        )) {
          send({ type: 'chunk', delta });
        }
        send({ type: 'done' });
      } catch (e) {
        if (controller.signal.aborted) return;
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    });
  });

  // One-shot batch translation used by full-page translation. Returns true to
  // keep the message channel open for the async sendResponse.
  browser.runtime.onMessage.addListener(
    (msg: BatchTranslateMessage, _sender, sendResponse: (r: BatchTranslateResponse) => void) => {
      if (msg?.type !== 'translateBatch') return;
      (async () => {
        try {
          const provider = await getActiveProvider();
          if (!provider) {
            sendResponse({ ok: false, error: 'No translation provider is configured.' });
            return;
          }
          const result = await translateSegments(provider, msg.segments, msg.targetLang);
          sendResponse({ ok: true, result });
        } catch (e) {
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      })();
      return true;
    },
  );
});
