import { useState, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Command } from '../../shared/types';

interface CommandDetailViewProps {
  command: Command;
  filterQuery: string;
  selectedIndex: number;
  copyFlashIndex: number | null;
}

export function CommandDetailView({
  command,
  filterQuery,
  selectedIndex,
  copyFlashIndex,
}: CommandDetailViewProps) {
  const [activeTab] = useState<'subcommands' | 'flags'>('subcommands');

  const filteredSubcommands = useMemo(() => {
    if (!filterQuery) return command.subcommands;
    const lower = filterQuery.toLowerCase();
    return command.subcommands.filter(
      (sc) =>
        sc.name.toLowerCase().includes(lower) ||
        sc.description.toLowerCase().includes(lower),
    );
  }, [command.subcommands, filterQuery]);

  const filteredFlags = useMemo(() => {
    if (!filterQuery) return command.flags;
    const lower = filterQuery.toLowerCase();
    return command.flags.filter(
      (f) =>
        (f.long?.toLowerCase().includes(lower) ?? false) ||
        (f.short?.toLowerCase().includes(lower) ?? false) ||
        f.description.toLowerCase().includes(lower),
    );
  }, [command.flags, filterQuery]);

  const isEnriching = command.enrichment === 'basic' || command.enrichment === 'partial';

  let globalIndex = 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/8 px-5 py-2">
        <ArrowLeft className="h-3.5 w-3.5 text-white/30" />
        <span className="font-mono text-sm font-medium text-white/80">
          {command.name}
        </span>
      </div>
      {command.description && (
        <div className="px-5 py-1.5 text-[12px] text-white/40">
          {command.description}
        </div>
      )}

      {isEnriching && (
        <div className="px-5 py-1.5 text-[11px] text-white/25 italic">
          Enriching...
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-0.5">
        {/* Subcommands */}
        {(activeTab === 'subcommands' || filteredSubcommands.length > 0) &&
          filteredSubcommands.length > 0 && (
            <div>
              <div className="sticky top-0 bg-black/20 px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30 backdrop-blur-sm">
                Subcommands{' '}
                <span className="text-white/25">
                  {filteredSubcommands.length}
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
                    className={`
                      mx-1.5 flex items-center gap-3
                      rounded-md px-3.5 py-[5px] text-[13px]
                      transition-colors
                      ${copyFlashIndex === idx ? 'copy-flash' : ''}
                      ${idx === selectedIndex ? 'bg-white/10' : 'hover:bg-white/6'}
                    `}
                  >
                    <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white/80">
                      {sc.name}
                    </span>
                    <span className="truncate text-white/50">
                      {sc.description}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

        {/* Flags */}
        {filteredFlags.length > 0 && (
          <div>
            <div className="sticky top-0 bg-black/20 px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30 backdrop-blur-sm">
              Flags{' '}
              <span className="text-white/25">{filteredFlags.length}</span>
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
                    mx-1.5 flex items-center gap-3
                    rounded-md px-3.5 py-[5px] text-[13px]
                    transition-colors
                    ${copyFlashIndex === idx ? 'copy-flash' : ''}
                    ${idx === selectedIndex ? 'bg-white/10' : 'hover:bg-white/6'}
                  `}
                >
                  <span className="flex shrink-0 items-center gap-1">
                    {flag.short && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white/80">
                        {flag.short}
                      </span>
                    )}
                    {flag.long && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white/80">
                        {flag.long}
                      </span>
                    )}
                    {flag.arg && (
                      <span className="text-[11px] text-white/30 italic">
                        {flag.arg}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-white/50">
                    {flag.description}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {filteredSubcommands.length === 0 &&
          filteredFlags.length === 0 &&
          filterQuery && (
            <div className="flex items-center justify-center py-8 text-[12px] text-white/20">
              No matches for "{filterQuery}"
            </div>
          )}
      </div>
    </div>
  );
}

/** Get total number of navigable items in a command detail view. */
export function getCommandDetailItemCount(
  command: Command,
  filterQuery: string,
): number {
  const lower = filterQuery.toLowerCase();
  const subcommands = filterQuery
    ? command.subcommands.filter(
        (sc) =>
          sc.name.toLowerCase().includes(lower) ||
          sc.description.toLowerCase().includes(lower),
      )
    : command.subcommands;
  const flags = filterQuery
    ? command.flags.filter(
        (f) =>
          (f.long?.toLowerCase().includes(lower) ?? false) ||
          (f.short?.toLowerCase().includes(lower) ?? false) ||
          f.description.toLowerCase().includes(lower),
      )
    : command.flags;
  return subcommands.length + flags.length;
}

/** Get the copyable text for a given index in command detail view. */
export function getCommandDetailCopyText(
  command: Command,
  filterQuery: string,
  index: number,
): string | null {
  const lower = filterQuery.toLowerCase();
  const subcommands = filterQuery
    ? command.subcommands.filter(
        (sc) =>
          sc.name.toLowerCase().includes(lower) ||
          sc.description.toLowerCase().includes(lower),
      )
    : command.subcommands;
  const flags = filterQuery
    ? command.flags.filter(
        (f) =>
          (f.long?.toLowerCase().includes(lower) ?? false) ||
          (f.short?.toLowerCase().includes(lower) ?? false) ||
          f.description.toLowerCase().includes(lower),
      )
    : command.flags;

  if (index < subcommands.length) {
    return `${command.name} ${subcommands[index].name}`;
  }
  const flagIndex = index - subcommands.length;
  if (flagIndex < flags.length) {
    const flag = flags[flagIndex];
    return flag.long ?? flag.short ?? '';
  }
  return null;
}
