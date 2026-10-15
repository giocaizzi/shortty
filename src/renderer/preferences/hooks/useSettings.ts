import { useState, useEffect, useCallback } from 'react';
import type { AppSettings } from '../../../shared/settings';

type UpdateResult = { success: boolean; error?: string };

export type UpdateSetting = <K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
) => Promise<UpdateResult>;

/**
 * Settings for the Preferences window. Writes go to the main-process store,
 * which broadcasts the new settings to every window; a write main refuses
 * (e.g. a global shortcut that cannot be registered) resolves with an error.
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const api = window.electronAPI;
    let cancelled = false;
    api
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('Failed to load settings:', err);
      });

    const unsubscribe = api.onSettingsChange((newSettings) => {
      setSettings(newSettings);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const updateSetting = useCallback<UpdateSetting>(
    (key, value) => window.electronAPI.setSetting(key, value),
    [],
  );

  return { settings, loading, updateSetting };
}
