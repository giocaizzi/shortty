import { forwardRef } from 'react';
import type { SearchResults } from '../hooks/useSearch';
import { SectionHeader } from './SectionHeader';
import { SourceRow } from './SourceRow';
import { ShortcutRow } from './ShortcutRow';
import { CommandRow } from './CommandRow';

interface ResultsContainerProps {
  results: SearchResults;
  selectedIndex: number;
  copyFlashIndex: number | null;
  showAllSources?: boolean;
  showAllShortcuts?: boolean;
  showAllCommands?: boolean;
  onToggleShowAll: (section: 'sources' | 'shortcuts' | 'commands') => void;
}

export const ResultsContainer = forwardRef<
  HTMLDivElement,
  ResultsContainerProps
>(function ResultsContainer(
  {
    results,
    selectedIndex,
    copyFlashIndex,
    showAllSources,
    showAllShortcuts,
    showAllCommands,
    onToggleShowAll,
  },
  ref,
) {
  const { sources, shortcuts, commands, totalShortcuts, totalCommands } =
    results;

  const isEmpty =
    sources.length === 0 && shortcuts.length === 0 && commands.length === 0;

  if (isEmpty) return null;

  let globalIndex = 0;

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto py-0.5"
      role="listbox"
      aria-label="Search results"
    >
      {/* Sources section */}
      {sources.length > 0 && (
        <div>
          <SectionHeader
            title="Sources"
            count={sources.length}
            showAll={showAllSources}
            onToggleShowAll={() => onToggleShowAll('sources')}
          />
          {sources.map(({ meta, count }) => {
            const idx = globalIndex++;
            return (
              <SourceRow
                key={meta.id}
                icon={meta.icon}
                label={meta.label}
                count={count}
                selected={idx === selectedIndex}
                dataIndex={idx}
              />
            );
          })}
        </div>
      )}

      {/* Shortcuts section */}
      {shortcuts.length > 0 && (
        <div>
          <SectionHeader
            title="Shortcuts"
            count={shortcuts.length}
            totalCount={totalShortcuts}
            showAll={showAllShortcuts}
            onToggleShowAll={() => onToggleShowAll('shortcuts')}
          />
          {shortcuts.map((shortcut) => {
            const idx = globalIndex++;
            return (
              <ShortcutRow
                key={shortcut.id}
                shortcut={shortcut}
                selected={idx === selectedIndex}
                dataIndex={idx}
                copyFlash={copyFlashIndex === idx}
              />
            );
          })}
        </div>
      )}

      {/* Commands section */}
      {commands.length > 0 && (
        <div>
          <SectionHeader
            title="Commands"
            count={commands.length}
            totalCount={totalCommands}
            showAll={showAllCommands}
            onToggleShowAll={() => onToggleShowAll('commands')}
          />
          {commands.map((command) => {
            const idx = globalIndex++;
            return (
              <CommandRow
                key={command.name}
                command={command}
                selected={idx === selectedIndex}
                dataIndex={idx}
                copyFlash={copyFlashIndex === idx}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});
