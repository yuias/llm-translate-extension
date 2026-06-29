import type { LangCode } from './languages';

/** Long-lived port used to stream a translation from background to content. */
export const TRANSLATE_PORT = 'llm-translate:stream';

export interface TranslateRequest {
  text: string;
  targetLang: LangCode;
}

export type StreamMessage =
  | { type: 'chunk'; delta: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** Background request to translate a batch of segments in one shot (no stream). */
export interface BatchTranslateMessage {
  type: 'translateBatch';
  segments: string[];
  targetLang: LangCode;
}

export type BatchTranslateResponse =
  | { ok: true; result: string[] }
  | { ok: false; error: string };

/** Commands sent from the popup to the active tab's content script. */
export type PageCommand =
  | { type: 'translatePage' }
  | { type: 'restorePage' }
  | { type: 'getPageState' };

export type PageState = 'original' | 'translating' | 'translated';
