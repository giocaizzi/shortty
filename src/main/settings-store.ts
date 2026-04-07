import Store from 'electron-store';
import type { AppSettings } from '../shared/settings';
import { DEFAULT_SETTINGS } from '../shared/settings';

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
