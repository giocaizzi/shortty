import type { Command, ParserMeta, Shortcut } from '../../shared/types';
import type { ResultLimits } from '../../shared/settings';
import type { SearchResults } from '../hooks/useSearch';

export type ResultSection = 'sources' | 'shortcuts' | 'commands';

/** A selectable row. Its position in the flattened list is its index. */
export type ResultItem =
  | { type: 'source'; meta: ParserMeta; count: number }
  | { type: 'shortcut'; shortcut: Shortcut }
  | { type: 'command'; command: Command }
  | { type: 'show-all'; section: ResultSection; total: number };

export interface ResultGroup {
  key: string;
  title: string;
  /** Matches in the group, including the rows hidden behind "Show all". */
  total: number;
  items: ResultItem[];
}

export type ExpandedSections = Readonly<Record<ResultSection, boolean>>;

export const NONE_EXPANDED: ExpandedSections = {
  sources: false,
  shortcuts: false,
  commands: false,
};

const SECTION_TITLES: Record<ResultSection, string> = {
  sources: 'Sources',
  shortcuts: 'Shortcuts',
  commands: 'Commands',
};

const UNCATEGORIZED = 'Other';

function section(
  name: ResultSection,
  rows: ResultItem[],
  limit: number,
  expanded: boolean,
): ResultGroup | null {
  if (rows.length === 0) return null;
  if (expanded || rows.length <= limit) {
    return { key: name, title: SECTION_TITLES[name], total: rows.length, items: rows };
  }
  const showAll: ResultItem = { type: 'show-all', section: name, total: rows.length };
  const items = [...rows.slice(0, limit), showAll];
  return { key: name, title: SECTION_TITLES[name], total: rows.length, items };
}

/** Group a source's shortcuts by cheatsheet category, in first-seen order. */
function byCategory(shortcuts: Shortcut[]): ResultGroup[] {
  const groups = new Map<string, Shortcut[]>();
  for (const s of shortcuts) {
    const category = s.category ?? UNCATEGORIZED;
    const list = groups.get(category);
    if (list) list.push(s);
    else groups.set(category, [s]);
  }
  if (groups.size === 1 && groups.has(UNCATEGORIZED)) {
    return [toGroup('shortcuts', SECTION_TITLES.shortcuts, shortcuts)];
  }
  // "Other" goes last, whatever position its first entry had.
  const ordered = [...groups.entries()].sort(
    ([a], [b]) => Number(a === UNCATEGORIZED) - Number(b === UNCATEGORIZED),
  );
  return ordered.map(([category, list]) => toGroup(`category:${category}`, category, list));
}

function toGroup(key: string, title: string, shortcuts: Shortcut[]): ResultGroup {
  return {
    key,
    title,
    total: shortcuts.length,
    items: shortcuts.map((shortcut) => ({ type: 'shortcut', shortcut })),
  };
}

/**
 * Turn search results into display groups.
 *
 * Flat mode: Sources, Shortcuts, Commands in fixed order, each cut at its
 * limit with a selectable "Show all N" row unless expanded. Drilled into a
 * source: no limits; an empty query lists every entry grouped by category,
 * a query lists the ranked matches.
 */
export function buildResultGroups(
  results: SearchResults,
  opts: {
    limits: ResultLimits;
    expanded: ExpandedSections;
    drilled: boolean;
    query: string;
  },
): ResultGroup[] {
  if (opts.drilled) {
    if (results.shortcuts.length === 0) return [];
    return opts.query.trim()
      ? [toGroup('shortcuts', 'Matches', results.shortcuts)]
      : byCategory(results.shortcuts);
  }

  const { limits, expanded } = opts;
  return [
    section(
      'sources',
      results.sources.map(({ meta, count }) => ({ type: 'source', meta, count })),
      limits.sources,
      expanded.sources,
    ),
    section(
      'shortcuts',
      results.shortcuts.map((shortcut) => ({ type: 'shortcut', shortcut })),
      limits.shortcuts,
      expanded.shortcuts,
    ),
    section(
      'commands',
      results.commands.map((command) => ({ type: 'command', command })),
      limits.commands,
      expanded.commands,
    ),
  ].filter((g): g is ResultGroup => g !== null);
}

/** Every selectable row, in display order. */
export function flattenGroups(groups: ResultGroup[]): ResultItem[] {
  return groups.flatMap((g) => g.items);
}

/** "1 shortcut", "2 shortcuts". */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
