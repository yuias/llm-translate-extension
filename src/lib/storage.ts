import { storage } from '#imports';
import { DEFAULT_LANG } from './languages';
import { DEFAULT_TONE, TONES } from './tones';
import {
  DEFAULT_POPUP_SIZE,
  DEFAULT_THEME,
  type Provider,
  type Settings,
  type Tone,
} from './types';

const DEFAULT_SETTINGS: Settings = {
  providers: [],
  activeProviderId: null,
  targetLang: DEFAULT_LANG,
  popupSize: DEFAULT_POPUP_SIZE,
  theme: DEFAULT_THEME,
  tone: DEFAULT_TONE,
};

// API keys live in local storage only, never synced to the cloud.
export const settingsStorage = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

function isTone(value: unknown): value is Tone {
  return TONES.some((t) => t.id === value);
}

/**
 * Fill fields that settings saved by older versions lack, and replace invalid
 * values. WXT's fallback only covers a missing key, not a missing field.
 */
export function normalizeSettings(raw: Settings): Settings {
  return { ...DEFAULT_SETTINGS, ...raw, tone: isTone(raw.tone) ? raw.tone : DEFAULT_TONE };
}

export async function getSettings(): Promise<Settings> {
  return normalizeSettings(await settingsStorage.getValue());
}

export async function getActiveProvider(): Promise<Provider | null> {
  const { providers, activeProviderId } = await getSettings();
  return providers.find((p) => p.id === activeProviderId) ?? providers[0] ?? null;
}
