import Store from 'electron-store';
import type { AppSettings } from '../shared/settings';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { sanitizeSettings } from './settings-validation';

const store = new Store<AppSettings>({
  defaults: DEFAULT_SETTINGS,
});

export function getSettings(): AppSettings {
  return store.store;
}

export function getSetting<K extends keyof AppSettings>(
  key: K,
): AppSettings[K] {
  return store.get(key);
}

export function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): void {
  store.set(key, value);
}

/**
 * Replace invalid stored values (e.g. a hand-edited config.json) with their
 * defaults before anything applies them. Returns the repaired keys.
 */
export function repairSettings(): string[] {
  const repaired = sanitizeSettings(store.store as unknown as Record<string, unknown>);
  const keys = Object.keys(repaired);
  if (keys.length > 0) store.set({ ...store.store, ...repaired });
  return keys;
}

/** Restore every setting to its default (`shortty --reset-settings`). */
export function resetSettings(): void {
  store.clear();
}

export function onSettingsChange(
  callback: (newValue: AppSettings, oldValue: AppSettings) => void,
): () => void {
  const unsubscribe = store.onDidAnyChange((newVal, oldVal) => {
    if (newVal && oldVal) {
      callback(newVal as AppSettings, oldVal as AppSettings);
    }
  });
  return unsubscribe;
}
