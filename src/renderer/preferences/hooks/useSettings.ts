import { useState, useEffect, useCallback } from 'react';
import type { AppSettings } from '../../../shared/settings';

type UpdateResult = { success: boolean; error?: string };

export type UpdateSetting = <K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
) => Promise<UpdateResult>;

/** Message used when the main process stored something other than the requested value. */
export const NOT_APPLIED = 'not-applied';

/**
 * Settings for the Preferences window. Every write is read back from the
 * store: the main process may revert a value it could not apply (a global
 * shortcut that failed to register), and that revert is reported as an error.
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

  const updateSetting = useCallback<UpdateSetting>(async (key, value) => {
    const api = window.electronAPI;
    const result = await api.setSetting(key, value);
    const fresh = await api.getSettings();
    setSettings(fresh);
    if (result.success && JSON.stringify(fresh[key]) !== JSON.stringify(value)) {
      return { success: false, error: NOT_APPLIED };
    }
    return result;
  }, []);

  return { settings, loading, updateSetting };
}
