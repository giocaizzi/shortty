import { useState, useEffect, useCallback, useRef } from 'react';
import type { Command } from '../../shared/types';
import { getElectronAPI } from '../lib/ipc';

interface CommandsStats {
  total: number;
  enriched: number;
  running: boolean;
}

interface UseCommandsReturn {
  commands: Command[];
  loading: boolean;
  stats: CommandsStats;
  refresh: () => Promise<void>;
}

const RETRY_MS = 500;
const MAX_RETRIES = 5;

/**
 * The command index for the launcher.
 *
 * The full index can hold thousands of enriched commands, so it crosses IPC
 * once (retried if the main process is not ready yet) and is then patched by
 * `onCommandsUpdate` batches. A show only fetches the stats and reloads the
 * index when its size changed (PATH rescan).
 */
export function useCommands(): UseCommandsReturn {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CommandsStats>({
    total: 0,
    enriched: 0,
    running: false,
  });
  const countRef = useRef(0);
  const loadedRef = useRef(false);

  const loadData = useCallback(async (): Promise<boolean> => {
    const api = getElectronAPI();
    try {
      const [cmds, cmdStats] = await Promise.all([api.getAllCommands(), api.getCommandsStats()]);
      countRef.current = cmds.length;
      loadedRef.current = true;
      setCommands(cmds);
      setStats(cmdStats);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('Failed to load commands:', err);
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const api = getElectronAPI();
    const cmds = await api.refreshCommands();
    countRef.current = cmds.length;
    setCommands(cmds);
    const cmdStats = await api.getCommandsStats();
    setStats(cmdStats);
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

    const unsubUpdate = api.onCommandsUpdate((updatedBatch) => {
      setCommands((prev) => {
        const updated = new Map(updatedBatch.map((c) => [c.name, c]));
        const next = prev.map((c) => {
          const fresh = updated.get(c.name);
          if (fresh) updated.delete(c.name);
          return fresh ?? c;
        });
        // Commands the renderer has not seen yet (a rescan added them).
        next.push(...updated.values());
        countRef.current = next.length;
        return next;
      });
      api.getCommandsStats().then(setStats).catch(() => undefined);
    });

    const unsubShown = api.onWindowShown(() => {
      if (!loadedRef.current) {
        loadData();
        return;
      }
      api
        .getCommandsStats()
        .then((latest) => {
          setStats(latest);
          if (latest.total !== countRef.current) loadData();
        })
        .catch((err) => console.error('Failed to check commands:', err));
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubUpdate();
      unsubShown();
    };
  }, [loadData]);

  return { commands, loading, stats, refresh };
}
