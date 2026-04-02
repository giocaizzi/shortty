import { useMemo, useState, useCallback } from 'react';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Keybinding } from '../../shared/types';

interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: Keybinding[];
}

const FUSE_OPTIONS: IFuseOptions<Keybinding> = {
  keys: [
    { name: 'key', weight: 0.3 },
    { name: 'searchKey', weight: 0.3 },
    { name: 'command', weight: 0.3 },
    { name: 'sourceLabel', weight: 0.05 },
    { name: 'context', weight: 0.05 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true,
};

export function useSearch(keybindings: Keybinding[]): UseSearchReturn {
  const [query, setQuery] = useState('');

  const fuse = useMemo(
    () => new Fuse(keybindings, FUSE_OPTIONS),
    [keybindings],
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
