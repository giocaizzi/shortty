import { useMemo, useState } from 'react';
import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Shortcut, ParserMeta, Command } from '../../shared/types';
import { useAppSettings } from '../context/SettingsContext';
import { layoutSearchText, useKeyboardLayout } from '../lib/keyboard-layout';

/** Shortcut plus the key text as it reads on the user's keyboard layout. */
type IndexedShortcut = Shortcut & { layoutKey: string };

/**
 * Untruncated search results. Section limits and "Show all" are applied by
 * the row model (components/result-rows.ts), so expanding a section never
 * needs another search.
 */
export interface SearchResults {
  sources: { meta: ParserMeta; count: number }[];
  shortcuts: Shortcut[];
  commands: Command[];
}

const EMPTY_RESULTS: SearchResults = { sources: [], shortcuts: [], commands: [] };

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

interface UseSearchOptions {
  /**
   * Drilled into a source: `shortcuts` is already that source's list. An empty
   * query lists every entry in order, and sources/commands are never searched.
   */
  scoped?: boolean;
}

interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResults;
}

/** Lowercase and drop everything but letters and digits: "VS Code" -> "vscode". */
function compact(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Source names match space- and punctuation-insensitively against the label
 * and the id, so "vsc", "vscode" and "vs code" all find VS Code.
 */
function matchesSource(meta: ParserMeta, term: string): boolean {
  const q = compact(term);
  if (!q) return false;
  return compact(meta.label).includes(q) || compact(meta.id).includes(q);
}

export function useSearch(
  shortcuts: Shortcut[],
  commands: Command[],
  sources: ParserMeta[],
  { scoped = false }: UseSearchOptions = {},
): UseSearchReturn {
  const [query, setQuery] = useState('');
  const { search: searchSettings, commandPrefixMode } = useAppSettings();
  const layout = useKeyboardLayout();

  const shortcutFuseOptions = useMemo(
    (): IFuseOptions<IndexedShortcut> => ({
      keys: [
        { name: 'key', weight: searchSettings.keyWeight / 3 },
        { name: 'searchKey', weight: searchSettings.keyWeight / 3 },
        // e.g. "ò", "è", "⌥è" on an Italian keyboard (docs/keyboard-layouts.md)
        { name: 'layoutKey', weight: searchSettings.keyWeight / 3 },
        { name: 'command', weight: searchSettings.commandWeight },
        { name: 'sourceLabel', weight: searchSettings.sourceWeight },
        { name: 'context', weight: searchSettings.contextWeight },
      ],
      threshold: searchSettings.threshold,
      ignoreLocation: true,
    }),
    [searchSettings],
  );

  const indexedShortcuts = useMemo(
    (): IndexedShortcut[] =>
      shortcuts.map((s) => ({ ...s, layoutKey: layoutSearchText(s.strokes, layout) })),
    [shortcuts, layout],
  );

  const shortcutFuse = useMemo(
    () => new Fuse(indexedShortcuts, shortcutFuseOptions),
    [indexedShortcuts, shortcutFuseOptions],
  );

  const commandFuse = useMemo(() => new Fuse(commands, COMMAND_FUSE_OPTIONS), [commands]);

  const countsBySource = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of shortcuts) counts.set(s.source, (counts.get(s.source) ?? 0) + 1);
    return counts;
  }, [shortcuts]);

  const results = useMemo((): SearchResults => {
    const trimmed = query.trim();

    if (scoped) {
      if (!trimmed) return { sources: [], shortcuts, commands: [] };
      return {
        sources: [],
        shortcuts: shortcutFuse.search(trimmed).map((r) => r.item),
        commands: [],
      };
    }

    if (!trimmed) return EMPTY_RESULTS;

    // Prefix mode: ">" searches commands only, anything else shortcuts only.
    // Unified mode: one query searches everything.
    const prefixed = commandPrefixMode && trimmed.startsWith('>');
    const searchTerm = prefixed ? trimmed.slice(1).trim() : trimmed;
    if (!searchTerm) return EMPTY_RESULTS;

    const includeCommands = !commandPrefixMode || prefixed;
    const includeShortcuts = !prefixed;

    return {
      sources: includeShortcuts
        ? sources
            .filter((meta) => matchesSource(meta, searchTerm))
            .map((meta) => ({ meta, count: countsBySource.get(meta.id) ?? 0 }))
        : [],
      shortcuts: includeShortcuts ? shortcutFuse.search(searchTerm).map((r) => r.item) : [],
      commands: includeCommands ? searchCommands(commandFuse, searchTerm) : [],
    };
  }, [
    query,
    scoped,
    commandPrefixMode,
    shortcutFuse,
    commandFuse,
    sources,
    shortcuts,
    countsBySource,
  ]);

  return { query, setQuery, results };
}
