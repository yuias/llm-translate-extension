// Output languages: G7 nations + China + Russia. Source language is auto-detected.
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'de', label: 'German', native: 'Deutsch' },
  { code: 'it', label: 'Italian', native: 'Italiano' },
  { code: 'ja', label: 'Japanese', native: '日本語' },
  { code: 'zh', label: 'Chinese', native: '中文' },
  { code: 'ru', label: 'Russian', native: 'Русский' },
] as const;

export type LangCode = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANG: LangCode = 'ja';

export function languageLabel(code: LangCode): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
