import { settingsStorage } from './storage';
import type { Settings } from './types';

/**
 * Reactive wrapper around the persisted settings. `watch` keeps every
 * extension context (popup, options, content) in sync via storage events.
 */
class SettingsStore {
  value = $state<Settings | null>(null);
  loading = $state(true);

  constructor() {
    settingsStorage.getValue().then((v) => {
      this.value = v;
      this.loading = false;
    });
    settingsStorage.watch((v) => {
      if (v) this.value = v;
    });
  }

  /** Persist a mutated copy of the current settings. */
  async save(next: Settings): Promise<void> {
    this.value = next;
    await settingsStorage.setValue(next);
  }
}

export const settings = new SettingsStore();
