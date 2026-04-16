import { useState, useEffect, useCallback, useRef } from 'react';
import type { Command, Shortcut } from '../shared/types';
import { useShortcuts } from './hooks/useShortcuts';
import { useCommands } from './hooks/useCommands';
import { useSearch } from './hooks/useSearch';
import { useSubcommandDetail } from './hooks/useSubcommandDetail';
import { useAppSettings } from './context/SettingsContext';
import { LauncherPanel } from './components/LauncherPanel';
import { SearchInput } from './components/SearchInput';
import { ResultsContainer } from './components/ResultsContainer';
import {
  CommandDetailView,
  getDetailItemCount,
  getDetailCopyText,
  isSubcommandAtIndex,
} from './components/CommandDetailView';
import { KeyboardHelp } from './components/KeyboardHelp';

const WINDOW_HEIGHT_EXPANDED = 580;
const WINDOW_HEIGHT_COLLAPSED = 72;

type NavLevel =
  | { kind: 'flat' }
  | { kind: 'drilled-source'; sourceId: string; sourceLabel: string }
  | { kind: 'command'; command: Command }
  | { kind: 'subcommand'; qualifiedName: string; baseBinPath: string };

interface StackEntry {
  level: NavLevel;
  selectedIndex: number;
}

function isDetailLevel(level: NavLevel): level is NavLevel & { kind: 'command' | 'subcommand' } {
  return level.kind === 'command' || level.kind === 'subcommand';
}

export function App() {
  const { shortcuts, sources, loading } = useShortcuts();
  const { commands } = useCommands();
  const { commandPrefixMode, dismissAfterCopy, commandsEnabled } =
    useAppSettings();

  const [navStack, setNavStack] = useState<StackEntry[]>([
    { level: { kind: 'flat' }, selectedIndex: 0 },
  ]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copyFlashIndex, setCopyFlashIndex] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showAll, setShowAll] = useState<{
    sources: boolean;
    shortcuts: boolean;
    commands: boolean;
  }>({ sources: false, shortcuts: false, commands: false });

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevNavStackLengthRef = useRef(navStack.length);

  const currentLevel = navStack[navStack.length - 1].level;

  // Subcommand detail fetching (only when on a subcommand level)
  const subcommandName = currentLevel.kind === 'subcommand' ? currentLevel.qualifiedName : null;
  const { detail: subcommandDetail, loading: subcommandLoading } = useSubcommandDetail(subcommandName);

  // Get the detail data for the current level (if in a detail view)
  const detailData = (() => {
    if (currentLevel.kind === 'command') return currentLevel.command;
    if (currentLevel.kind === 'subcommand' && subcommandDetail) return subcommandDetail;
    return null;
  })();

  // Filter shortcuts when drilled into a source
  const activeShortcuts =
    currentLevel.kind === 'drilled-source'
      ? shortcuts.filter((s) => s.source === currentLevel.sourceId)
      : shortcuts;

  const activeCommands = commandsEnabled ? commands : [];

  const { query, setQuery, results } = useSearch(
    activeShortcuts,
    activeCommands,
    sources,
  );

  // Reset state on window show
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const unsub = api.onWindowShown(() => {
      setNavStack([{ level: { kind: 'flat' }, selectedIndex: 0 }]);
      setQuery('');
      setSelectedIndex(0);
      setCopyFlashIndex(null);
      setShowHelp(false);
      setShowAll({ sources: false, shortcuts: false, commands: false });
    });
    return unsub;
  }, [setQuery]);

  // Reset selection on results change
  useEffect(() => {
    setSelectedIndex(0);
    setCopyFlashIndex(null);
  }, [query, currentLevel]);

  // Restore selectedIndex when navigating back (pop)
  useEffect(() => {
    if (navStack.length < prevNavStackLengthRef.current) {
      const top = navStack[navStack.length - 1];
      setSelectedIndex(top.selectedIndex);
    }
    prevNavStackLengthRef.current = navStack.length;
  }, [navStack]);

  // Resize window: compact when empty in flat mode, expand when results exist
  const hasResults = !['flat'].includes(currentLevel.kind) ||
    results.sources.length > 0 ||
    results.shortcuts.length > 0 ||
    results.commands.length > 0;

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    if (hasResults) {
      api.setWindowHeight(WINDOW_HEIGHT_EXPANDED);
    } else {
      api.setWindowHeight(WINDOW_HEIGHT_COLLAPSED);
    }
  }, [hasResults]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selectedEl = list.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const triggerCopyFlash = useCallback(
    (index: number) => {
      setCopyFlashIndex(index);
      setTimeout(() => setCopyFlashIndex(null), 300);
      if (dismissAfterCopy) {
        setTimeout(() => window.blur(), 300);
      }
    },
    [dismissAfterCopy],
  );

  const getTotalItemCount = useCallback((): number => {
    if (isDetailLevel(currentLevel) && detailData) {
      return getDetailItemCount(detailData, query);
    }
    return (
      results.sources.length + results.shortcuts.length + results.commands.length
    );
  }, [currentLevel, detailData, results, query]);

  const getItemAtIndex = useCallback(
    (
      index: number,
    ):
      | { type: 'source'; sourceId: string; sourceLabel: string }
      | { type: 'shortcut'; shortcut: Shortcut }
      | { type: 'command'; command: Command }
      | null => {
      let offset = 0;

      if (results.sources.length > 0) {
        if (index < offset + results.sources.length) {
          const src = results.sources[index - offset];
          return {
            type: 'source',
            sourceId: src.meta.id,
            sourceLabel: src.meta.label,
          };
        }
        offset += results.sources.length;
      }

      if (results.shortcuts.length > 0) {
        if (index < offset + results.shortcuts.length) {
          return { type: 'shortcut', shortcut: results.shortcuts[index - offset] };
        }
        offset += results.shortcuts.length;
      }

      if (results.commands.length > 0) {
        if (index < offset + results.commands.length) {
          return { type: 'command', command: results.commands[index - offset] };
        }
      }

      return null;
    },
    [results],
  );

  const pushLevel = useCallback((level: NavLevel) => {
    setNavStack((prev) => {
      const updated = [...prev];
      // Save current selectedIndex in the current stack entry
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        selectedIndex,
      };
      return [...updated, { level, selectedIndex: 0 }];
    });
    setSelectedIndex(0);
    setQuery('');
  }, [selectedIndex, setQuery]);

  const popLevel = useCallback(() => {
    setNavStack((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
    setQuery('');
  }, [setQuery]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showHelp) return;

      // Let system shortcuts through (Cmd+A, Cmd+C, Cmd+V, etc.)
      if (e.metaKey || e.ctrlKey) return;

      if (e.key === '?' && !query) {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      const totalItems = getTotalItemCount();

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            totalItems > 0 ? (prev + 1) % totalItems : 0,
          );
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            totalItems > 0 ? (prev - 1 + totalItems) % totalItems : 0,
          );
          break;

        case 'Enter': {
          e.preventDefault();

          if (isDetailLevel(currentLevel) && detailData) {
            const text = getDetailCopyText(detailData, query, selectedIndex);
            if (text) {
              navigator.clipboard.writeText(text);
              triggerCopyFlash(selectedIndex);
            }
            return;
          }

          const item = getItemAtIndex(selectedIndex);
          if (!item) return;

          if (item.type === 'source') {
            pushLevel({
              kind: 'drilled-source',
              sourceId: item.sourceId,
              sourceLabel: item.sourceLabel,
            });
          } else if (item.type === 'shortcut') {
            navigator.clipboard.writeText(item.shortcut.key);
            triggerCopyFlash(selectedIndex);
          } else if (item.type === 'command') {
            navigator.clipboard.writeText(item.command.name);
            triggerCopyFlash(selectedIndex);
          }
          break;
        }

        case 'Tab':
        case 'ArrowRight': {
          // ArrowRight: only drill when cursor is at end of input (preserve cursor movement)
          if (e.key === 'ArrowRight') {
            const input = inputRef.current;
            if (input && input.selectionStart !== null && input.selectionStart < input.value.length) {
              break;
            }
          }

          // Drill into command from flat/drilled-source
          if (currentLevel.kind === 'flat' || currentLevel.kind === 'drilled-source') {
            const item = getItemAtIndex(selectedIndex);
            if (item?.type === 'command') {
              e.preventDefault();
              pushLevel({ kind: 'command', command: item.command });
            }
            break;
          }

          // Drill deeper into subcommand from detail view
          if (isDetailLevel(currentLevel) && detailData) {
            if (isSubcommandAtIndex(detailData, query, selectedIndex)) {
              e.preventDefault();
              const subName = getDetailCopyText(detailData, query, selectedIndex);
              if (subName) {
                const baseBin = currentLevel.kind === 'command'
                  ? currentLevel.command.bin
                  : currentLevel.baseBinPath;
                pushLevel({
                  kind: 'subcommand',
                  qualifiedName: subName,
                  baseBinPath: baseBin,
                });
              }
            }
          }
          break;
        }

        case 'ArrowLeft': {
          const input = inputRef.current;
          const atStart = !input || input.selectionStart === 0 || input.value.length === 0;
          if (atStart && navStack.length > 1) {
            e.preventDefault();
            popLevel();
          }
          break;
        }

        case 'Backspace': {
          if (e.defaultPrevented) break;
          if (navStack.length > 1 && !query) {
            e.preventDefault();
            popLevel();
          }
          break;
        }

        case 'Escape':
          e.preventDefault();
          if (query) {
            setQuery('');
          } else if (navStack.length > 1) {
            popLevel();
          } else {
            window.blur();
          }
          break;
      }
    },
    [
      showHelp,
      query,
      navStack,
      currentLevel,
      detailData,
      selectedIndex,
      getTotalItemCount,
      getItemAtIndex,
      setQuery,
      triggerCopyFlash,
      pushLevel,
      popLevel,
    ],
  );

  const handleToggleShowAll = useCallback(
    (section: 'sources' | 'shortcuts' | 'commands') => {
      setShowAll((prev) => ({ ...prev, [section]: !prev[section] }));
    },
    [],
  );

  const commandPrefixActive =
    commandPrefixMode && query.startsWith('>');

  // Build breadcrumb names from nav stack
  const breadcrumbs = navStack
    .map((entry) => {
      switch (entry.level.kind) {
        case 'command': return entry.level.command.name;
        case 'subcommand': {
          // Show only the last part of the qualified name
          const parts = entry.level.qualifiedName.split(' ');
          return parts[parts.length - 1];
        }
        case 'drilled-source': return entry.level.sourceLabel;
        default: return null;
      }
    })
    .filter((b): b is string => b !== null);

  const navMode = isDetailLevel(currentLevel)
    ? 'command-detail' as const
    : currentLevel.kind === 'drilled-source'
      ? 'drilled-source' as const
      : 'flat' as const;

  const navAnnouncement = (() => {
    switch (currentLevel.kind) {
      case 'drilled-source':
        return `Drilled into ${currentLevel.sourceLabel} shortcuts`;
      case 'command':
        return `Viewing ${currentLevel.command.name} command details`;
      case 'subcommand':
        return `Viewing ${currentLevel.qualifiedName} subcommand details`;
      default:
        return 'Search all shortcuts';
    }
  })();

  return (
    <LauncherPanel onKeyDown={handleKeyDown}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {navAnnouncement}
      </div>
      <SearchInput
        query={query}
        onChange={setQuery}
        navMode={navMode}
        sourceLabel={
          currentLevel.kind === 'drilled-source' ? currentLevel.sourceLabel : undefined
        }
        breadcrumbs={breadcrumbs}
        commandPrefixActive={commandPrefixActive}
        onHelpToggle={() => setShowHelp((v) => !v)}
        inputRef={inputRef}
      />
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-white/30">
          Loading shortcuts...
        </div>
      ) : isDetailLevel(currentLevel) ? (
        <CommandDetailView
          data={detailData ?? { description: '', subcommands: [], flags: [], arguments: [], enrichment: 'none' }}
          filterQuery={query}
          selectedIndex={selectedIndex}
          copyFlashIndex={copyFlashIndex}
          loading={currentLevel.kind === 'subcommand' && subcommandLoading}
        />
      ) : (
        <ResultsContainer
          ref={listRef}
          results={results}
          selectedIndex={selectedIndex}
          copyFlashIndex={copyFlashIndex}
          showAllSources={showAll.sources}
          showAllShortcuts={showAll.shortcuts}
          showAllCommands={showAll.commands}
          onToggleShowAll={handleToggleShowAll}
        />
      )}
      {showHelp && (
        <KeyboardHelp onDismiss={() => setShowHelp(false)} />
      )}
    </LauncherPanel>
  );
}
