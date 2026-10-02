import type { LangCode } from './languages';

/** A single OpenAI-compatible LLM endpoint configured by the user. */
export interface Provider {
  id: string;
  displayName: string;
  /** Full chat-completions URL, e.g. https://api.openai.com/v1/chat/completions */
  endpoint: string;
  model: string;
  apiKey: string;
  /** Raw JSON object text merged into every request body, e.g. {"reasoning_effort":"low"}. */
  extraBody?: string;
}

export interface PopupSize {
  width: number;
  height: number;
}

/** Color scheme preference; 'system' follows the OS setting. */
export type ThemeMode = 'system' | 'dark' | 'light';

/** Register the translation is written in; see tones.ts for the prompt clauses. */
export type Tone = 'normal' | 'polite' | 'business' | 'casual' | 'x' | 'plain';

export interface Settings {
  providers: Provider[];
  activeProviderId: string | null;
  targetLang: LangCode;
  popupSize: PopupSize;
  theme: ThemeMode;
  tone: Tone;
}

export const DEFAULT_POPUP_SIZE: PopupSize = { width: 360, height: 280 };
export const DEFAULT_THEME: ThemeMode = 'system';
