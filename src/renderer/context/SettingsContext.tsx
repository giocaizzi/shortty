import { createContext, useContext, useState, useEffect } from 'react';
import type { AppSettings } from '../../shared/settings';
import { DEFAULT_SETTINGS } from '../../shared/settings';

const SettingsContext = createContext<AppSettings>(DEFAULT_SETTINGS);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    api.getSettings().then(setSettings);
    const unsubscribe = api.onSettingsChange(setSettings);
    return unsubscribe;
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettings {
  return useContext(SettingsContext);
}
