import { useState, useEffect, useCallback } from 'react';
import type { AppSettings } from '../../../shared/settings';

const api = window.electronAPI;

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });

    const unsubscribe = api.onSettingsChange((newSettings) => {
      setSettings(newSettings);
    });

    return unsubscribe;
  }, []);

  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(
      key: K,
      value: AppSettings[K],
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await api.setSetting(key, value);
      return result;
    },
    [],
  );

  return { settings, loading, updateSetting };
}
