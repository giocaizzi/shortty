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
  const { sources, shortcuts, commands, totalSources, totalShortcuts, totalCommands } =
    results;

  const isEmpty =
    sources.length === 0 && shortcuts.length === 0 && commands.length === 0;

  if (isEmpty) return null;

  const sourcesOffset = 0;
  const shortcutsOffset = sources.length;
  const commandsOffset = sources.length + shortcuts.length;

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto"
      role="listbox"
      aria-label="Search results"
    >
      <div style={{ padding: '8px 12px' }}>
      {/* Sources section */}
      {sources.length > 0 && (
        <div className="mb-1">
          <SectionHeader
            title="Sources"
            count={sources.length}
            totalCount={totalSources}
            showAll={showAllSources}
            onToggleShowAll={() => onToggleShowAll('sources')}
          />
          {sources.map(({ meta, count }, i) => {
            const idx = sourcesOffset + i;
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
        <div className="mb-1">
          <SectionHeader
            title="Shortcuts"
            count={shortcuts.length}
            totalCount={totalShortcuts}
            showAll={showAllShortcuts}
            onToggleShowAll={() => onToggleShowAll('shortcuts')}
          />
          {shortcuts.map((shortcut, i) => {
            const idx = shortcutsOffset + i;
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
        <div className="mb-1">
          <SectionHeader
            title="Commands"
            count={commands.length}
            totalCount={totalCommands}
            showAll={showAllCommands}
            onToggleShowAll={() => onToggleShowAll('commands')}
          />
          {commands.map((command, i) => {
            const idx = commandsOffset + i;
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
    </div>
  );
});
