import { useState, useEffect, useCallback } from 'react';
import type { Keybinding, ParserMeta } from '../../shared/types';
import { getElectronAPI } from '../lib/ipc';

interface UseKeybindingsReturn {
  keybindings: Keybinding[];
  sources: ParserMeta[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useKeybindings(): UseKeybindingsReturn {
  const [keybindings, setKeybindings] = useState<Keybinding[]>([]);
  const [sources, setSources] = useState<ParserMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const api = getElectronAPI();
    const [srcData, kbData] = await Promise.all([
      api.getSources(),
      api.getAllKeybindings(),
    ]);
    setSources(srcData);
    setKeybindings(kbData);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const api = getElectronAPI();
    const data = await api.refreshKeybindings();
    setKeybindings(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();

    const api = getElectronAPI();

    // Listen for live updates from file watcher
    const unsubUpdate = api.onKeybindingsUpdate(({ keybindings: updated, sourceId }) => {
      setKeybindings((prev) => {
        const filtered = prev.filter((kb) => kb.source !== sourceId);
        return [...filtered, ...updated];
      });
    });

    // Refresh data when window becomes visible
    const unsubShown = api.onWindowShown(() => {
      loadData();
    });

    return () => {
      unsubUpdate();
      unsubShown();
    };
  }, [loadData]);

  return { keybindings, sources, loading, refresh };
}
