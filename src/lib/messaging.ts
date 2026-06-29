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
