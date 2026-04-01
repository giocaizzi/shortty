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
        return [{ source: null, label: null, items: keybindings }];
      }

      const groups = new Map<
        string,
        { label: string; items: Keybinding[] }
      >();

      for (const kb of keybindings) {
        let group = groups.get(kb.source);
        if (!group) {
          group = { label: kb.sourceLabel, items: [] };
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
        className="flex-1 overflow-y-auto py-1"
        role="listbox"
        aria-label="Keybinding results"
      >
        {grouped.map((group) => (
          <div key={group.source ?? 'all'}>
            {group.label && (
              <div className="sticky top-0 flex items-center gap-1.5 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/35">
                <span>{group.label}</span>
                <span className="text-white/25">{group.items.length}</span>
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
