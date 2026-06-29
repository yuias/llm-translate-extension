import type { LangCode } from './languages';

/** Long-lived port used to stream a translation from background to content. */
export const TRANSLATE_PORT = 'llm-translate:stream';

/** Request opening a stream: either a single selection or a batch of segments. */
export type StreamRequest =
  | { kind: 'text'; text: string; targetLang: LangCode }
  | { kind: 'batch'; segments: string[]; targetLang: LangCode };

export type StreamMessage =
  // 'text' mode: token deltas to append; 'batch' mode: a completed segment.
  | { type: 'chunk'; delta: string }
  | { type: 'segment'; index: number; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** Commands sent from the popup to the active tab's content script. */
export type PageCommand =
  | { type: 'translatePage' }
  | { type: 'restorePage' }
  | { type: 'getPageState' };

export type PageState = 'original' | 'translating' | 'translated';
