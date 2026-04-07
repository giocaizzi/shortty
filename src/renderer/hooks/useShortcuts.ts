import { useState, useEffect, useCallback } from 'react';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { getElectronAPI } from '../lib/ipc';

interface UseShortcutsReturn {
  shortcuts: Shortcut[];
  sources: ParserMeta[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useShortcuts(): UseShortcutsReturn {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [sources, setSources] = useState<ParserMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const api = getElectronAPI();
    const [srcData, kbData] = await Promise.all([
      api.getSources(),
      api.getAllKeybindings(),
    ]);
    setSources(srcData);
    setShortcuts(kbData);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const api = getElectronAPI();
    const data = await api.refreshKeybindings();
    setShortcuts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();

    const api = getElectronAPI();

    const unsubUpdate = api.onKeybindingsUpdate(
      ({ keybindings: updated, sourceId }) => {
        setShortcuts((prev) => {
          const filtered = prev.filter((kb) => kb.source !== sourceId);
          return [...filtered, ...updated];
        });
      },
    );

    const unsubShown = api.onWindowShown(() => {
      loadData();
    });

    return () => {
      unsubUpdate();
      unsubShown();
    };
  }, [loadData]);

  return { shortcuts, sources, loading, refresh };
}
