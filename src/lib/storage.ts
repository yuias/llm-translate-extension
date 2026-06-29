import { storage } from '#imports';
import { DEFAULT_LANG } from './languages';
import { DEFAULT_POPUP_SIZE, type Provider, type Settings } from './types';

const DEFAULT_SETTINGS: Settings = {
  providers: [],
  activeProviderId: null,
  targetLang: DEFAULT_LANG,
  popupSize: DEFAULT_POPUP_SIZE,
};

// API keys live in local storage only, never synced to the cloud.
export const settingsStorage = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function getSettings(): Promise<Settings> {
  return settingsStorage.getValue();
}

export async function getActiveProvider(): Promise<Provider | null> {
  const { providers, activeProviderId } = await getSettings();
  return providers.find((p) => p.id === activeProviderId) ?? providers[0] ?? null;
}
