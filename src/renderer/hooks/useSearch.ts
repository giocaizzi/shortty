import { useMemo, useState, useCallback } from 'react';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Shortcut, ParserMeta, Command } from '../../shared/types';
import { useAppSettings } from '../context/SettingsContext';

export interface SearchResults {
  sources: { meta: ParserMeta; count: number }[];
  shortcuts: Shortcut[];
  commands: Command[];
  totalShortcuts: number;
  totalCommands: number;
}

const EMPTY_RESULTS: SearchResults = {
  sources: [],
  shortcuts: [],
  commands: [],
  totalShortcuts: 0,
  totalCommands: 0,
};

interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResults;
}

export function useSearch(
  shortcuts: Shortcut[],
  commands: Command[],
  sources: ParserMeta[],
): UseSearchReturn {
  const [query, setQuery] = useState('');
  const {
    search: searchSettings,
    commandPrefixMode,
    resultLimits,
  } = useAppSettings();

  const shortcutFuseOptions = useMemo(
    (): IFuseOptions<Shortcut> => ({
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
    }),
    [searchSettings],
  );

  const commandFuseOptions = useMemo(
    (): IFuseOptions<Command> => ({
      keys: [
        { name: 'name', weight: 0.5 },
        { name: 'description', weight: 0.3 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      includeScore: true,
    }),
    [],
  );

  const shortcutFuse = useMemo(
    () => new Fuse(shortcuts, shortcutFuseOptions),
    [shortcuts, shortcutFuseOptions],
  );

  const commandFuse = useMemo(
    () => new Fuse(commands, commandFuseOptions),
    [commands, commandFuseOptions],
  );

  const results = useMemo((): SearchResults => {
    const trimmed = query.trim();
    if (!trimmed) return EMPTY_RESULTS;

    const isCommandOnly = commandPrefixMode && trimmed.startsWith('>');
    const searchTerm = isCommandOnly ? trimmed.slice(1).trim() : trimmed;

    if (!searchTerm) return EMPTY_RESULTS;

    // Search commands
    const allCommandResults = commandFuse
      .search(searchTerm)
      .map((r) => r.item);

    if (isCommandOnly) {
      return {
        sources: [],
        shortcuts: [],
        commands: allCommandResults.slice(0, resultLimits.commands),
        totalShortcuts: 0,
        totalCommands: allCommandResults.length,
      };
    }

    // Search shortcuts
    const allShortcutResults = shortcutFuse
      .search(searchTerm)
      .map((r) => r.item);

    // Match sources by label
    const lowerSearch = searchTerm.toLowerCase();
    const matchedSources = sources
      .filter((s) => s.label.toLowerCase().includes(lowerSearch))
      .map((meta) => ({
        meta,
        count: shortcuts.filter((s) => s.source === meta.id).length,
      }));

    return {
      sources: matchedSources.slice(0, resultLimits.sources),
      shortcuts: allShortcutResults.slice(0, resultLimits.shortcuts),
      commands: allCommandResults.slice(0, resultLimits.commands),
      totalShortcuts: allShortcutResults.length,
      totalCommands: allCommandResults.length,
    };
  }, [
    query,
    commandPrefixMode,
    resultLimits,
    shortcutFuse,
    commandFuse,
    sources,
    shortcuts,
  ]);

  const handleSetQuery = useCallback((q: string) => {
    setQuery(q);
  }, []);

  return { query, setQuery: handleSetQuery, results };
}
