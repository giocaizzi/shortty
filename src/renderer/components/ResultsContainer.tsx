import type { ResultGroup, ResultItem } from './result-rows';
import { SectionHeader } from './SectionHeader';
import { SourceRow } from './SourceRow';
import { ShortcutRow } from './ShortcutRow';
import { CommandRow } from './CommandRow';
import { ShowAllRow } from './ShowAllRow';

interface ResultsContainerProps {
  groups: ResultGroup[];
  selectedIndex: number;
  copyFlashIndex: number | null;
  /** Drilled into a source: rows omit the (redundant) source icon and label. */
  drilled?: boolean;
}

function itemKey(item: ResultItem, index: number): string {
  switch (item.type) {
    case 'source':
      return `source:${item.meta.id}`;
    case 'shortcut':
      // Shortcut ids are not unique across every cheatsheet; the index is.
      return `shortcut:${item.shortcut.id}:${index}`;
    case 'command':
      return `command:${item.command.name}`;
    case 'show-all':
      return `show-all:${item.section}`;
  }
}

export function ResultsContainer({
  groups,
  selectedIndex,
  copyFlashIndex,
  drilled = false,
}: ResultsContainerProps) {
  if (groups.length === 0) return null;

  let index = 0;
  return (
    <div
      data-scroll
      className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      role="listbox"
      aria-label="Search results"
    >
      {groups.map((group) => (
        <div key={group.key} role="group" aria-label={group.title}>
          <SectionHeader title={group.title} count={group.total} />
          {group.items.map((item) => {
            const idx = index++;
            const selected = idx === selectedIndex;
            const copyFlash = copyFlashIndex === idx;
            const key = itemKey(item, idx);
            switch (item.type) {
              case 'source':
                return (
                  <SourceRow
                    key={key}
                    sourceId={item.meta.id}
                    label={item.meta.label}
                    count={item.count}
                    selected={selected}
                    dataIndex={idx}
                  />
                );
              case 'shortcut':
                return (
                  <ShortcutRow
                    key={key}
                    shortcut={item.shortcut}
                    selected={selected}
                    dataIndex={idx}
                    copyFlash={copyFlash}
                    showSource={!drilled}
                  />
                );
              case 'command':
                return (
                  <CommandRow
                    key={key}
                    command={item.command}
                    selected={selected}
                    dataIndex={idx}
                    copyFlash={copyFlash}
                  />
                );
              case 'show-all':
                return (
                  <ShowAllRow
                    key={key}
                    section={item.section}
                    total={item.total}
                    selected={selected}
                    dataIndex={idx}
                  />
                );
            }
          })}
        </div>
      ))}
    </div>
  );
}
