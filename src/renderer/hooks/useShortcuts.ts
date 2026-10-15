import { useState, useEffect, useCallback, useRef } from 'react';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { getElectronAPI } from '../lib/ipc';

interface UseShortcutsReturn {
  shortcuts: Shortcut[];
  sources: ParserMeta[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const RETRY_MS = 500;
const MAX_RETRIES = 5;

function sameIds(a: ParserMeta[], b: ParserMeta[]): boolean {
  return a.length === b.length && a.every((s, i) => s.id === b[i]?.id);
}

/**
 * Shortcuts and sources for the launcher.
 *
 * Loaded once (retried if the main process has not registered its IPC
 * handlers yet), then kept current by `onKeybindingsUpdate` pushes. A show
 * only re-checks the small source list and reloads when it changed (a source
 * enabled or disabled), so the hotkey never ships every shortcut over IPC.
 */
export function useShortcuts(): UseShortcutsReturn {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [sources, setSources] = useState<ParserMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const sourcesRef = useRef<ParserMeta[]>([]);
  const loadedRef = useRef(false);

  const loadData = useCallback(async (): Promise<boolean> => {
    const api = getElectronAPI();
    try {
      const [srcData, kbData] = await Promise.all([api.getSources(), api.getAllKeybindings()]);
      sourcesRef.current = srcData;
      loadedRef.current = true;
      setSources(srcData);
      setShortcuts(kbData);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('Failed to load shortcuts:', err);
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const api = getElectronAPI();
    const data = await api.refreshKeybindings();
    setShortcuts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const api = getElectronAPI();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loadWithRetry = async (attempt: number) => {
      const ok = await loadData();
      if (!ok && !cancelled && attempt < MAX_RETRIES) {
        timer = setTimeout(() => loadWithRetry(attempt + 1), RETRY_MS);
      }
    };
    loadWithRetry(0);

    const unsubUpdate = api.onKeybindingsUpdate(({ keybindings: updated, sourceId }) => {
      setShortcuts((prev) => [...prev.filter((kb) => kb.source !== sourceId), ...updated]);
    });

    const unsubShown = api.onWindowShown(() => {
      if (!loadedRef.current) {
        loadData();
        return;
      }
      api
        .getSources()
        .then((latest) => {
          if (!sameIds(latest, sourcesRef.current)) loadData();
        })
        .catch((err) => console.error('Failed to check sources:', err));
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubUpdate();
      unsubShown();
    };
  }, [loadData]);

  return { shortcuts, sources, loading, refresh };
}
