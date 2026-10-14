import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Command, SubcommandDetail, CommandDetail, FlagDetail, ArgumentDetail } from '../../shared/types';
import { Row } from './Row';
import { SectionHeader } from './SectionHeader';

type DetailData = Pick<
  Command | SubcommandDetail,
  'description' | 'subcommands' | 'flags'
> & {
  name?: string;
  enrichment: string;
  enrichedFrom?: Command['enrichedFrom'];
  synopsis?: string;
  longDescription?: string;
  arguments?: ArgumentDetail[];
};

interface CommandDetailViewProps {
  data: DetailData;
  filterQuery: string;
  selectedIndex: number;
  copyFlashIndex: number | null;
  loading?: boolean;
}

const ENRICHMENT_SOURCES: Record<NonNullable<Command['enrichedFrom']>, string> = {
  man: 'man page',
  help: '--help',
  'zsh-completion': 'zsh completion',
  'bash-completion': 'bash completion',
};

function Placeholder({ children }: { children: string }) {
  return (
    <div className="flex flex-1 items-center justify-center pb-10 text-[13px] text-fg-3">
      {children}
    </div>
  );
}

export function CommandDetailView({
  data,
  filterQuery,
  selectedIndex,
  copyFlashIndex,
  loading,
}: CommandDetailViewProps) {
  const filteredArguments = useMemo(
    () => filterArguments(data.arguments ?? [], filterQuery),
    [data.arguments, filterQuery],
  );

  const filteredSubcommands = useMemo(
    () => filterSubcommands(data.subcommands, filterQuery),
    [data.subcommands, filterQuery],
  );

  const filteredFlags = useMemo(
    () => filterFlags(data.flags, filterQuery),
    [data.flags, filterQuery],
  );

  const isEnriching = data.enrichment === 'basic' || data.enrichment === 'none';

  const argsOffset = 0;
  const subcommandsOffset = filteredArguments.length;
  const flagsOffset = filteredArguments.length + filteredSubcommands.length;
  const itemCount = flagsOffset + filteredFlags.length;

  if (loading) return <Placeholder>Loading...</Placeholder>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: what this command is */}
      <div className="shrink-0 space-y-2 px-[18px] pb-2 pt-1">
        {(data.description || isEnriching) && (
          <p className="text-[13px] leading-snug text-fg-2">
            {data.description}
            {isEnriching && itemCount > 0 && <span className="ml-2 text-[12px] text-fg-4">— Enriching...</span>}
          </p>
        )}
        {data.synopsis && (
          <pre className="overflow-x-auto rounded-[8px] bg-fill-quiet px-3 py-2 font-mono text-[12px] leading-relaxed text-fg-2">
            {data.synopsis}
          </pre>
        )}
        {data.longDescription && (
          <p className="line-clamp-2 text-[12px] leading-relaxed text-fg-3">{data.longDescription}</p>
        )}
      </div>

      <div data-scroll className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {filteredArguments.length > 0 && (
          <div role="group" aria-label="Arguments">
            <SectionHeader title="Arguments" count={filteredArguments.length} />
            {filteredArguments.map((arg, i) => {
              const idx = argsOffset + i;
              return (
                <Row
                  key={arg.name}
                  dataIndex={idx}
                  selected={idx === selectedIndex}
                  copyFlash={copyFlashIndex === idx}
                  testId="argument-row"
                >
                  <span className="shrink-0 font-mono text-[13px] font-medium text-fg">
                    {'<'}{arg.name}{'>'}
                  </span>
                  {arg.variadic && <span className="shrink-0 font-mono text-[12px] text-fg-3">...</span>}
                  <span
                    className={`shrink-0 rounded-[5px] px-1.5 py-px text-[11px] font-medium ${
                      arg.required ? 'bg-warning-fill text-warning' : 'bg-fill-quiet text-fg-3'
                    }`}
                  >
                    {arg.required ? 'required' : 'optional'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{arg.description}</span>
                </Row>
              );
            })}
          </div>
        )}

        {filteredSubcommands.length > 0 && (
          <div role="group" aria-label="Subcommands">
            <SectionHeader title="Subcommands" count={filteredSubcommands.length} />
            {filteredSubcommands.map((sc, i) => {
              const idx = subcommandsOffset + i;
              return (
                <Row
                  key={sc.name}
                  dataIndex={idx}
                  selected={idx === selectedIndex}
                  copyFlash={copyFlashIndex === idx}
                  testId="subcommand-row"
                >
                  <span className="shrink-0 font-mono text-[13px] font-medium text-fg">{sc.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{sc.description}</span>
                  <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-4" />
                </Row>
              );
            })}
          </div>
        )}

        {filteredFlags.length > 0 && (
          <div role="group" aria-label="Flags">
            <SectionHeader title="Flags" count={filteredFlags.length} />
            {filteredFlags.map((flag, i) => {
              const idx = flagsOffset + i;
              const flagName = flag.long ?? flag.short ?? '';
              return (
                <Row
                  key={`${flagName}:${idx}`}
                  dataIndex={idx}
                  selected={idx === selectedIndex}
                  copyFlash={copyFlashIndex === idx}
                  testId="flag-row"
                >
                  <span className="flex shrink-0 items-baseline gap-1 font-mono text-[13px] font-medium text-fg">
                    {flag.short && <span>{flag.short}</span>}
                    {flag.short && flag.long && <span className="-ml-1 text-fg-4">,</span>}
                    {flag.long && <span>{flag.long}</span>}
                    {flag.arg && <span className="font-normal italic text-fg-3">{flag.arg}</span>}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{flag.description}</span>
                </Row>
              );
            })}
          </div>
        )}

        {itemCount === 0 && filterQuery && (
          <div className="flex items-center justify-center py-8 text-[13px] text-fg-3">
            No matches for &ldquo;{filterQuery}&rdquo;
          </div>
        )}

        {itemCount === 0 && !filterQuery && (
          <div className="flex items-center justify-center py-8 text-[13px] text-fg-3">
            {isEnriching ? 'Enriching...' : 'No subcommands or flags documented'}
          </div>
        )}

        {data.enrichedFrom && (
          <p data-testid="detail-source" className="px-2.5 pt-3 text-[11px] text-fg-4">
            Source: {ENRICHMENT_SOURCES[data.enrichedFrom]}
          </p>
        )}
      </div>
    </div>
  );
}


function filterArguments(args: ArgumentDetail[], query: string): ArgumentDetail[] {
  if (!query) return args;
  const lower = query.toLowerCase();
  return args.filter(
    (a) =>
      a.name.toLowerCase().includes(lower) ||
      a.description.toLowerCase().includes(lower),
  );
}

function filterSubcommands(subcommands: CommandDetail[], query: string): CommandDetail[] {
  if (!query) return subcommands;
  const lower = query.toLowerCase();
  return subcommands.filter(
    (sc) =>
      sc.name.toLowerCase().includes(lower) ||
      sc.description.toLowerCase().includes(lower),
  );
}

function filterFlags(flags: FlagDetail[], query: string): FlagDetail[] {
  if (!query) return flags;
  const lower = query.toLowerCase();
  return flags.filter(
    (f) =>
      (f.long?.toLowerCase().includes(lower) ?? false) ||
      (f.short?.toLowerCase().includes(lower) ?? false) ||
      f.description.toLowerCase().includes(lower),
  );
}

/** Get total number of navigable items in a detail view. */
export function getDetailItemCount(
  data: Pick<DetailData, 'subcommands' | 'flags' | 'arguments'>,
  filterQuery: string,
): number {
  return filterArguments(data.arguments ?? [], filterQuery).length +
    filterSubcommands(data.subcommands, filterQuery).length +
    filterFlags(data.flags, filterQuery).length;
}

/** Get the copyable text for a given index in a detail view. */
export function getDetailCopyText(
  data: Pick<DetailData, 'subcommands' | 'flags' | 'arguments'>,
  filterQuery: string,
  index: number,
): string | null {
  const args = filterArguments(data.arguments ?? [], filterQuery);
  const subcommands = filterSubcommands(data.subcommands, filterQuery);
  const flags = filterFlags(data.flags, filterQuery);

  // Arguments come first
  if (index < args.length) {
    return `<${args[index].name}>`;
  }
  let offset = args.length;

  // Then subcommands
  if (index < offset + subcommands.length) {
    return subcommands[index - offset].name;
  }
  offset += subcommands.length;

  // Then flags
  const flagIndex = index - offset;
  if (flagIndex < flags.length) {
    const flag = flags[flagIndex];
    return flag.long ?? flag.short ?? '';
  }
  return null;
}

/** Check if item at index is a subcommand (not an argument or flag). */
export function isSubcommandAtIndex(
  data: Pick<DetailData, 'subcommands' | 'flags' | 'arguments'>,
  filterQuery: string,
  index: number,
): boolean {
  const argsCount = filterArguments(data.arguments ?? [], filterQuery).length;
  const subcommandsCount = filterSubcommands(data.subcommands, filterQuery).length;
  return index >= argsCount && index < argsCount + subcommandsCount;
}
