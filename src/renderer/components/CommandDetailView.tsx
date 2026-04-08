import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Command, SubcommandDetail, CommandDetail, FlagDetail } from '../../shared/types';

type DetailData = Pick<Command | SubcommandDetail, 'description' | 'subcommands' | 'flags'> & {
  enrichment: string;
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '8px 12px' }}>
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

        {filteredSubcommands.length === 0 &&
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
  data: Pick<DetailData, 'subcommands' | 'flags'>,
  filterQuery: string,
): number {
  return filterSubcommands(data.subcommands, filterQuery).length +
    filterFlags(data.flags, filterQuery).length;
}

/** Get the copyable text for a given index in a detail view. */
export function getDetailCopyText(
  data: Pick<DetailData, 'subcommands' | 'flags'>,
  filterQuery: string,
  index: number,
): string | null {
  const subcommands = filterSubcommands(data.subcommands, filterQuery);
  const flags = filterFlags(data.flags, filterQuery);

  if (index < subcommands.length) {
    return subcommands[index].name;
  }
  const flagIndex = index - subcommands.length;
  if (flagIndex < flags.length) {
    const flag = flags[flagIndex];
    return flag.long ?? flag.short ?? '';
  }
  return null;
}

/** Check if item at index is a subcommand (not a flag). */
export function isSubcommandAtIndex(
  data: Pick<DetailData, 'subcommands' | 'flags'>,
  filterQuery: string,
  index: number,
): boolean {
  return index < filterSubcommands(data.subcommands, filterQuery).length;
}

