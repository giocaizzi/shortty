import { useState, useEffect, useCallback } from 'react';
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

export function useCommands(): UseCommandsReturn {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CommandsStats>({
    total: 0,
    enriched: 0,
    running: false,
  });

  const loadData = useCallback(async () => {
    const api = getElectronAPI();
    const [cmds, cmdStats] = await Promise.all([
      api.getAllCommands(),
      api.getCommandsStats(),
    ]);
    setCommands(cmds);
    setStats(cmdStats);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const api = getElectronAPI();
    const cmds = await api.refreshCommands();
    setCommands(cmds);
    const cmdStats = await api.getCommandsStats();
    setStats(cmdStats);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();

    const api = getElectronAPI();

    const unsubUpdate = api.onCommandsUpdate((updatedCommands) => {
      setCommands(updatedCommands);
      api.getCommandsStats().then(setStats);
    });

    const unsubShown = api.onWindowShown(() => {
      loadData();
    });

    return () => {
      unsubUpdate();
      unsubShown();
    };
  }, [loadData]);

  return { commands, loading, stats, refresh };
}
