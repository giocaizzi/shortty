import { useState, useEffect, useCallback, useRef } from 'react';
import type { Command, Shortcut } from '../shared/types';
import { useShortcuts } from './hooks/useShortcuts';
import { useCommands } from './hooks/useCommands';
import { useSearch } from './hooks/useSearch';
import { useAppSettings } from './context/SettingsContext';
import { LauncherPanel } from './components/LauncherPanel';
import { SearchInput } from './components/SearchInput';
import { ResultsContainer } from './components/ResultsContainer';
import {
  CommandDetailView,
  getCommandDetailItemCount,
  getCommandDetailCopyText,
} from './components/CommandDetailView';
import { KeyboardHelp } from './components/KeyboardHelp';

type NavState =
  | { mode: 'flat' }
  | { mode: 'drilled-source'; sourceId: string; sourceLabel: string }
  | { mode: 'command-detail'; command: Command };

export function App() {
  const { shortcuts, sources, loading } = useShortcuts();
  const { commands } = useCommands();
  const { commandPrefixMode, dismissAfterCopy, commandsEnabled } =
    useAppSettings();

  const [nav, setNav] = useState<NavState>({ mode: 'flat' });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copyFlashIndex, setCopyFlashIndex] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showAll, setShowAll] = useState<{
    sources: boolean;
    shortcuts: boolean;
    commands: boolean;
  }>({ sources: false, shortcuts: false, commands: false });

  const listRef = useRef<HTMLDivElement>(null);

  // Filter shortcuts when drilled into a source
  const activeShortcuts =
    nav.mode === 'drilled-source'
      ? shortcuts.filter((s) => s.source === nav.sourceId)
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
      setNav({ mode: 'flat' });
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
  }, [query, nav]);

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
        // Blurring the window triggers the main process hideWindow() handler
        setTimeout(() => window.blur(), 300);
      }
    },
    [dismissAfterCopy],
  );

  const getTotalItemCount = useCallback((): number => {
    if (nav.mode === 'command-detail') {
      return getCommandDetailItemCount(nav.command, query);
    }
    return (
      results.sources.length + results.shortcuts.length + results.commands.length
    );
  }, [nav, results, query]);

  /** Resolve what item the current selectedIndex points to. */
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showHelp) return; // KeyboardHelp handles its own dismissal

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

          if (nav.mode === 'command-detail') {
            const text = getCommandDetailCopyText(
              nav.command,
              query,
              selectedIndex,
            );
            if (text) {
              navigator.clipboard.writeText(text);
              triggerCopyFlash(selectedIndex);
            }
            return;
          }

          const item = getItemAtIndex(selectedIndex);
          if (!item) return;

          if (item.type === 'source') {
            setNav({
              mode: 'drilled-source',
              sourceId: item.sourceId,
              sourceLabel: item.sourceLabel,
            });
            setQuery('');
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
          if (nav.mode === 'flat' || nav.mode === 'drilled-source') {
            const item = getItemAtIndex(selectedIndex);
            if (item?.type === 'command') {
              e.preventDefault();
              setNav({ mode: 'command-detail', command: item.command });
              setQuery('');
            }
          }
          break;
        }

        case 'Escape':
          e.preventDefault();
          if (nav.mode === 'command-detail') {
            setNav({ mode: 'flat' });
            setQuery('');
          } else if (nav.mode === 'drilled-source') {
            setNav({ mode: 'flat' });
            setQuery('');
          }
          break;
      }
    },
    [
      showHelp,
      query,
      nav,
      selectedIndex,
      getTotalItemCount,
      getItemAtIndex,
      setQuery,
      triggerCopyFlash,
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

  const navAnnouncement = (() => {
    switch (nav.mode) {
      case 'drilled-source':
        return `Drilled into ${nav.sourceLabel} shortcuts`;
      case 'command-detail':
        return `Viewing ${nav.command.name} command details`;
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
        navMode={nav.mode}
        sourceLabel={
          nav.mode === 'drilled-source' ? nav.sourceLabel : undefined
        }
        commandPrefixActive={commandPrefixActive}
        onHelpToggle={() => setShowHelp((v) => !v)}
      />
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-white/30">
          Loading shortcuts...
        </div>
      ) : nav.mode === 'command-detail' ? (
        <CommandDetailView
          command={nav.command}
          filterQuery={query}
          selectedIndex={selectedIndex}
          copyFlashIndex={copyFlashIndex}
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
