import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Command, SubcommandDetail, CommandDetail, FlagDetail, ArgumentDetail } from '../../shared/types';

type DetailData = Pick<
  Command | SubcommandDetail,
  'description' | 'subcommands' | 'flags'
> & {
  enrichment: string;
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

export function CommandDetailView({
  data,
  filterQuery,
  selectedIndex,
  copyFlashIndex,
  loading,
}: CommandDetailViewProps) {
  const args = data.arguments ?? [];

  const filteredArguments = useMemo(() => {
    if (!filterQuery) return args;
    const lower = filterQuery.toLowerCase();
    return args.filter(
      (a) =>
        a.name.toLowerCase().includes(lower) ||
        a.description.toLowerCase().includes(lower),
    );
  }, [args, filterQuery]);

  const filteredSubcommands = useMemo(() => {
    if (!filterQuery) return data.subcommands;
    const lower = filterQuery.toLowerCase();
    return data.subcommands.filter(
      (sc) =>
        sc.name.toLowerCase().includes(lower) ||
        sc.description.toLowerCase().includes(lower),
    );
  }, [data.subcommands, filterQuery]);

  const filteredFlags = useMemo(() => {
    if (!filterQuery) return data.flags;
    const lower = filterQuery.toLowerCase();
    return data.flags.filter(
      (f) =>
        (f.long?.toLowerCase().includes(lower) ?? false) ||
        (f.short?.toLowerCase().includes(lower) ?? false) ||
        f.description.toLowerCase().includes(lower),
    );
  }, [data.flags, filterQuery]);

  const isEnriching = data.enrichment === 'basic' || data.enrichment === 'partial' || data.enrichment === 'none';

  let globalIndex = 0;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-[12px] text-white/20 italic">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Description + status bar */}
      {(data.description || isEnriching) && (
        <div style={{ padding: '8px 28px' }} className="text-[12px] text-white/35">
          {data.description}
          {isEnriching && (
            <span className="ml-2 text-[11px] text-white/20 italic">— Enriching...</span>
          )}
        </div>
      )}

      {/* Synopsis */}
      {data.synopsis && (
        <div style={{ padding: '0 28px 8px' }}>
          <pre className="overflow-x-auto rounded-lg bg-white/[0.03] px-3 py-2 font-mono text-[11px] leading-relaxed text-white/40">
            {data.synopsis}
          </pre>
        </div>
      )}

      {/* Long description */}
      {data.longDescription && (
        <div style={{ padding: '0 28px 8px' }} className="line-clamp-3 text-[11px] leading-relaxed text-white/25">
          {data.longDescription}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '8px 12px' }}>
        {/* Arguments */}
        {filteredArguments.length > 0 && (
          <div>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-black/30 px-5 py-2 text-[11px] font-semibold uppercase tracking-widest text-white/30 backdrop-blur-md">
              <span>Arguments</span>
              <span className="font-normal text-white/20">
                {filteredArguments.length} {filteredArguments.length === 1 ? 'argument' : 'arguments'}
              </span>
            </div>
            {filteredArguments.map((arg) => {
              const idx = globalIndex++;
              return (
                <div
                  key={arg.name}
                  data-index={idx}
                  role="option"
                  aria-selected={idx === selectedIndex}
                  className={`
                    mx-2 flex items-center gap-4
                    rounded-lg px-3.5 py-2.5 text-[13px]
                    transition-colors
                    ${copyFlashIndex === idx ? 'copy-flash' : ''}
                    ${idx === selectedIndex ? 'bg-white/[0.07] ring-1 ring-inset ring-white/[0.06]' : 'hover:bg-white/[0.04]'}
                  `}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5">
                      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-white/70">
                        {'<'}{arg.name}{'>'}
                      </span>
                      {arg.variadic && (
                        <span className="text-[10px] text-white/25">...</span>
                      )}
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${
                        arg.required
                          ? 'bg-amber-500/15 text-amber-400/60'
                          : 'bg-white/[0.04] text-white/25'
                      }`}>
                        {arg.required ? 'required' : 'optional'}
                      </span>
                    </span>
                    {arg.description && (
                      <span className="truncate text-[12px] text-white/40">
                        {arg.description}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Subcommands */}
        {filteredSubcommands.length > 0 && (
          <div>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-black/30 px-5 py-2 text-[11px] font-semibold uppercase tracking-widest text-white/30 backdrop-blur-md">
              <span>Subcommands</span>
              <span className="font-normal text-white/20">
                {filteredSubcommands.length} subcommands
              </span>
            </div>
            {filteredSubcommands.map((sc) => {
              const idx = globalIndex++;
              return (
                <div
                  key={sc.name}
                  data-index={idx}
                  role="option"
                  aria-selected={idx === selectedIndex}
                  style={{ padding: '12px 28px' }}
                  className={`
                    flex items-center gap-5
                    rounded-xl text-[13px]
                    transition-colors
                    ${copyFlashIndex === idx ? 'copy-flash' : ''}
                    ${idx === selectedIndex ? 'bg-white/[0.07] ring-1 ring-inset ring-white/[0.06]' : 'hover:bg-white/[0.04]'}
                  `}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-mono text-[12px] font-medium text-white/85">
                      {sc.name}
                    </span>
                    <span className="truncate text-[12px] text-white/40">
                      {sc.description}
                    </span>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/15" />
                </div>
              );
            })}
          </div>
        )}

        {/* Flags */}
        {filteredFlags.length > 0 && (
          <div>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-black/30 px-5 py-2 text-[11px] font-semibold uppercase tracking-widest text-white/30 backdrop-blur-md">
              <span>Flags</span>
              <span className="font-normal text-white/20">
                {filteredFlags.length} flags
              </span>
            </div>
            {filteredFlags.map((flag) => {
              const idx = globalIndex++;
              const flagName = flag.long ?? flag.short ?? '';
              return (
                <div
                  key={flagName}
                  data-index={idx}
                  role="option"
                  aria-selected={idx === selectedIndex}
                  className={`
                    mx-2 flex items-center gap-4
                    rounded-lg px-3.5 py-2.5 text-[13px]
                    transition-colors
                    ${copyFlashIndex === idx ? 'copy-flash' : ''}
                    ${idx === selectedIndex ? 'bg-white/[0.07] ring-1 ring-inset ring-white/[0.06]' : 'hover:bg-white/[0.04]'}
                  `}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5">
                      {flag.short && (
                        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-white/70">
                          {flag.short}
                        </span>
                      )}
                      {flag.long && (
                        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-white/70">
                          {flag.long}
                        </span>
                      )}
                      {flag.arg && (
                        <span className="text-[11px] text-white/25 italic">
                          {flag.arg}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-[12px] text-white/40">
                      {flag.description}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredArguments.length === 0 &&
          filteredSubcommands.length === 0 &&
          filteredFlags.length === 0 &&
          filterQuery && (
            <div className="flex items-center justify-center py-8 text-[12px] text-white/20">
              No matches for &ldquo;{filterQuery}&rdquo;
            </div>
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
