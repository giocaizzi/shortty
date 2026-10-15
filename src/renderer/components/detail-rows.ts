import type {
  ArgumentDetail,
  Command,
  CommandDetail,
  EnvVarDetail,
  ExampleDetail,
  FlagDetail,
  HelpExtras,
  SubcommandDetail,
} from '../../shared/types';

/** What the command detail view shows (a command or a drilled-into subcommand). */
export type DetailData = Pick<Command | SubcommandDetail, 'description' | 'subcommands' | 'flags'> & HelpExtras & {
  name?: string;
  enrichment: string;
  enrichedFrom?: Command['enrichedFrom'];
  synopsis?: string;
  longDescription?: string;
  arguments?: ArgumentDetail[];
};

/** A selectable row of the detail view, in display order. */
export type DetailRow =
  | { kind: 'argument'; argument: ArgumentDetail }
  | { kind: 'subcommand'; subcommand: CommandDetail }
  | { kind: 'example'; example: ExampleDetail }
  | { kind: 'flag'; flag: FlagDetail }
  | { kind: 'environment'; variable: EnvVarDetail };

/** A titled run of rows; `offset` is the index of its first row. */
export interface DetailGroup {
  key: string;
  title: string;
  rows: DetailRow[];
  offset: number;
}

function matches(query: string, ...fields: (string | undefined)[]): boolean {
  return fields.some(f => f?.toLowerCase().includes(query));
}

/**
 * Section titles as printed by the CLI ("INHERITED FLAGS", "Global Options",
 * "The commands are") in sentence case.
 */
export function groupTitle(title: string): string {
  const t = title.trim().replace(/:$/, '');
  if (t === t.toUpperCase()) return t.charAt(0) + t.slice(1).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Split rows into runs of the same `group`. One group (or none) gets the
 * section's plain title; several get their own titles.
 */
function grouped<T>(
  items: T[],
  groupOf: (item: T) => string | undefined,
  toRow: (item: T) => DetailRow,
  key: string,
  title: string,
): { key: string; title: string; rows: DetailRow[] }[] {
  if (items.length === 0) return [];
  const distinct = new Set(items.map(groupOf));
  if (distinct.size <= 1) return [{ key, title, rows: items.map(toRow) }];
  const runs: { key: string; title: string; rows: DetailRow[] }[] = [];
  let current: string | undefined;
  for (const item of items) {
    const group = groupOf(item) ?? '';
    if (runs.length > 0 && group === current) {
      runs[runs.length - 1].rows.push(toRow(item));
      continue;
    }
    current = group;
    runs.push({ key: `${key}:${runs.length}:${group}`, title: group ? groupTitle(group) : title, rows: [toRow(item)] });
  }
  return runs;
}

/**
 * The detail view's selectable rows, grouped and filtered by `query`:
 * arguments, subcommands, examples, flags, environment variables. The
 * order here is the keyboard order (getDetailItemCount, getDetailCopyText).
 */
export function buildDetailGroups(data: Pick<DetailData, 'subcommands' | 'flags' | 'arguments' | 'examples' | 'environment'>, query: string): DetailGroup[] {
  const q = query.toLowerCase();
  const args = (data.arguments ?? []).filter(a => !q || matches(q, a.name, a.description));
  const subs = data.subcommands.filter(s => !q || matches(q, s.name, s.description));
  const examples = (data.examples ?? []).filter(e => !q || matches(q, e.command, e.description));
  const flags = data.flags.filter(f => !q || matches(q, f.long, f.short, f.description));
  const env = (data.environment ?? []).filter(v => !q || matches(q, v.name, v.description));

  const groups = [
    ...grouped(args, () => undefined, argument => ({ kind: 'argument', argument }), 'arguments', 'Arguments'),
    ...grouped(subs, s => s.group, subcommand => ({ kind: 'subcommand', subcommand }), 'subcommands', 'Subcommands'),
    ...grouped(examples, () => undefined, example => ({ kind: 'example', example }), 'examples', 'Examples'),
    ...grouped(flags, f => f.group, flag => ({ kind: 'flag', flag }), 'flags', 'Flags'),
    ...grouped(env, () => undefined, variable => ({ kind: 'environment', variable }), 'environment', 'Environment'),
  ];

  let offset = 0;
  return groups.map((g) => {
    const group = { ...g, offset };
    offset += g.rows.length;
    return group;
  });
}

function rowAt(data: Pick<DetailData, 'subcommands' | 'flags' | 'arguments' | 'examples' | 'environment'>, query: string, index: number): DetailRow | undefined {
  for (const group of buildDetailGroups(data, query)) {
    if (index >= group.offset && index < group.offset + group.rows.length) return group.rows[index - group.offset];
  }
  return undefined;
}

/** Text Enter copies for a row. */
function rowCopyText(row: DetailRow): string {
  switch (row.kind) {
    case 'argument':
      return `<${row.argument.name}>`;
    case 'subcommand':
      return row.subcommand.name;
    case 'example':
      return row.example.command;
    case 'flag':
      return row.flag.long ?? row.flag.short ?? '';
    case 'environment':
      return row.variable.name;
  }
}

type RowSource = Pick<DetailData, 'name' | 'subcommands' | 'flags' | 'arguments' | 'examples' | 'environment'>;

/** Get total number of navigable items in a detail view. */
export function getDetailItemCount(data: RowSource, filterQuery: string): number {
  return buildDetailGroups(data, filterQuery).reduce((n, g) => n + g.rows.length, 0);
}

/**
 * Get the copyable text for a given index in a detail view. Flags and
 * arguments carry the command path (`gh auth login --hostname`); subcommand
 * names and examples already do, and environment variables stand alone.
 */
export function getDetailCopyText(data: RowSource, filterQuery: string, index: number): string | null {
  const row = rowAt(data, filterQuery, index);
  if (!row) return null;
  const text = rowCopyText(row);
  const needsPath = (row.kind === 'flag' || row.kind === 'argument') && data.name && text;
  return needsPath ? `${data.name} ${text}` : text;
}

/** Check if item at index is a subcommand (not an argument, example, flag or variable). */
export function isSubcommandAtIndex(data: RowSource, filterQuery: string, index: number): boolean {
  return rowAt(data, filterQuery, index)?.kind === 'subcommand';
}
