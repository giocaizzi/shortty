import { forwardRef, useMemo } from 'react';
import type { Keybinding } from '../../shared/types';
import { KeybindingRow } from './KeybindingRow';

interface KeybindingListProps {
  keybindings: Keybinding[];
  selectedIndex: number;
  groupBySource: boolean;
}

export const KeybindingList = forwardRef<HTMLDivElement, KeybindingListProps>(
  function KeybindingList({ keybindings, selectedIndex, groupBySource }, ref) {
    const grouped = useMemo(() => {
      if (!groupBySource) {
        return [{ source: null, label: null, icon: null, items: keybindings }];
      }

      const groups = new Map<
        string,
        { label: string; icon: string; items: Keybinding[] }
      >();

      for (const kb of keybindings) {
        let group = groups.get(kb.source);
        if (!group) {
          group = { label: kb.sourceLabel, icon: '', items: [] };
          groups.set(kb.source, group);
        }
        group.items.push(kb);
      }

      return Array.from(groups.entries()).map(([source, data]) => ({
        source,
        ...data,
      }));
    }, [keybindings, groupBySource]);

    let globalIndex = 0;

    return (
      <div
        ref={ref}
        className="flex-1 overflow-y-auto"
        role="listbox"
        aria-label="Keybinding results"
      >
        {grouped.map((group) => (
          <div key={group.source ?? 'all'}>
            {group.label && (
              <div className="sticky top-0 flex items-center gap-2 bg-white/60 px-4 py-1.5 text-xs font-semibold text-neutral-500 backdrop-blur-sm dark:bg-neutral-900/60 dark:text-neutral-400">
                <span>{group.label}</span>
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] dark:bg-white/10">
                  {group.items.length}
                </span>
              </div>
            )}
            {group.items.map((kb) => {
              const idx = globalIndex++;
              return (
                <KeybindingRow
                  key={kb.id}
                  keybinding={kb}
                  selected={idx === selectedIndex}
                  dataIndex={idx}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  },
);
