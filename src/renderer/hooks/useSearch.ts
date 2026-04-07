import { useMemo, useState, useCallback } from 'react';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Keybinding } from '../../shared/types';
import { useAppSettings } from '../context/SettingsContext';

interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: Keybinding[];
}

export function useSearch(keybindings: Keybinding[]): UseSearchReturn {
  const [query, setQuery] = useState('');
  const { search: searchSettings } = useAppSettings();

  const fuseOptions = useMemo((): IFuseOptions<Keybinding> => ({
    keys: [
      { name: 'key', weight: searchSettings.keyWeight / 2 },
      { name: 'searchKey', weight: searchSettings.keyWeight / 2 },
      { name: 'command', weight: searchSettings.commandWeight },
      { name: 'sourceLabel', weight: searchSettings.sourceWeight },
      { name: 'context', weight: searchSettings.contextWeight },
    ],
    threshold: searchSettings.threshold,
    ignoreLocation: true,
    includeScore: true,
  }), [searchSettings]);

  const fuse = useMemo(
    () => new Fuse(keybindings, fuseOptions),
    [keybindings, fuseOptions],
  );

  const results = useMemo(() => {
    if (!query.trim()) return keybindings;
    return fuse.search(query).map((r) => r.item);
  }, [query, keybindings, fuse]);

  const handleSetQuery = useCallback((q: string) => {
    setQuery(q);
  }, []);

  return { query, setQuery: handleSetQuery, results };
}
