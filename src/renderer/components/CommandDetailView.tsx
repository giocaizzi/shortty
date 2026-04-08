import { useState, useMemo } from 'react';
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
      {/* Description + status bar */}
      {(command.description || isEnriching) && (
        <div style={{ padding: '8px 28px' }} className="text-[12px] text-white/35">
          {command.description}
          {isEnriching && (
            <span className="ml-2 text-[11px] text-white/20 italic">— Enriching...</span>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '8px 12px' }}>
        {/* Subcommands */}
        {(activeTab === 'subcommands' || filteredSubcommands.length > 0) &&
          filteredSubcommands.length > 0 && (
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
    return subcommands[index].name;
  }
  const flagIndex = index - subcommands.length;
  if (flagIndex < flags.length) {
    const flag = flags[flagIndex];
    return flag.long ?? flag.short ?? '';
  }
  return null;
}
