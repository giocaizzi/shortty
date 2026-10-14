import { useMemo, useState } from 'react';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Shortcut, ParserMeta, Command } from '../../shared/types';
import { useAppSettings } from '../context/SettingsContext';

export interface SearchResults {
  sources: { meta: ParserMeta; count: number }[];
  shortcuts: Shortcut[];
  commands: Command[];
  totalSources: number;
  totalShortcuts: number;
  totalCommands: number;
}

const EMPTY_RESULTS: SearchResults = {
  sources: [],
  shortcuts: [],
  commands: [],
  totalSources: 0,
  totalShortcuts: 0,
  totalCommands: 0,
};

/** Command search weights (SPECS §8.3): name, description, subcommand names. */
export const COMMAND_FUSE_OPTIONS: IFuseOptions<Command> = {
  keys: [
    { name: 'name', weight: 0.5 },
    { name: 'description', weight: 0.3 },
    // "commit" finds git via "git commit", "compose" finds docker
    { name: 'subcommands.name', weight: 0.2 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true,
};

/**
 * Fuse scores "ls" inside "gnutls-cli" as well as the ls command itself
 * (ignoreLocation), so rank an exact name first, then name prefixes, then
 * the Fuse order.
 */
export function searchCommands(fuse: Fuse<Command>, term: string): Command[] {
  const lower = term.toLowerCase();
  const tier = (name: string) => {
    const n = name.toLowerCase();
    if (n === lower) return 0;
    if (n.startsWith(lower)) return 1;
    return 2;
  };
  return fuse
    .search(term)
    .map((r, i) => ({ item: r.item, tier: tier(r.item.name), i }))
    .sort((a, b) => a.tier - b.tier || a.i - b.i)
    .map((r) => r.item);
}

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

  const shortcutFuse = useMemo(
    () => new Fuse(shortcuts, shortcutFuseOptions),
    [shortcuts, shortcutFuseOptions],
  );

  const commandFuse = useMemo(
    () => new Fuse(commands, COMMAND_FUSE_OPTIONS),
    [commands],
  );

  const results = useMemo((): SearchResults => {
    const trimmed = query.trim();
    if (!trimmed) return EMPTY_RESULTS;

    const isCommandOnly = commandPrefixMode && trimmed.startsWith('>');
    const searchTerm = isCommandOnly ? trimmed.slice(1).trim() : trimmed;

    if (!searchTerm) return EMPTY_RESULTS;

    // Search commands
    const allCommandResults = searchCommands(commandFuse, searchTerm);

    if (isCommandOnly) {
      return {
        sources: [],
        shortcuts: [],
        commands: allCommandResults.slice(0, resultLimits.commands),
        totalSources: 0,
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
      totalSources: matchedSources.length,
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

  return { query, setQuery, results };
}
