import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Check } from 'lucide-react';
import type { Command, Shortcut } from '../shared/types';
import { useShortcuts } from './hooks/useShortcuts';
import { useCommands } from './hooks/useCommands';
import { useSearch } from './hooks/useSearch';
import { useSubcommandDetail } from './hooks/useSubcommandDetail';
import { isImeComposing } from './lib/ime';
import { useAppSettings } from './context/SettingsContext';
import { resolveStrokes, useKeyboardLayout, type KeyboardLayout } from './lib/keyboard-layout';
import { LauncherPanel } from './components/LauncherPanel';
import { SearchInput, formatAccelerator } from './components/SearchInput';
import { ResultsContainer } from './components/ResultsContainer';
import { PanelFooter, type FooterHint } from './components/PanelFooter';
import { SourceIcon } from './components/SourceIcon';
import { optionId } from './components/Row';
import {
  buildResultGroups,
  flattenGroups,
  plural,
  NONE_EXPANDED,
  type ExpandedSections,
} from './components/result-rows';
import {
  CommandDetailView,
  getDetailItemCount,
  getDetailCopyText,
  isSubcommandAtIndex,
} from './components/CommandDetailView';
import { KeyboardHelp } from './components/KeyboardHelp';

const WINDOW_HEIGHT_EXPANDED = 580;
const WINDOW_HEIGHT_EMPTY_STATE = 180;
const WINDOW_HEIGHT_COLLAPSED = 72;
const COPY_FLASH_MS = 300;
const COPIED_STATUS_MS = 1500;
const EXIT_ANIMATION_MS = 80;
const NO_COMMANDS: Command[] = [];

type NavLevel =
  | { kind: 'flat' }
  | { kind: 'drilled-source'; sourceId: string; sourceLabel: string }
  | { kind: 'command'; command: Command }
  | { kind: 'subcommand'; qualifiedName: string; baseBinPath: string };

/** One level of the navigation stack, with what to restore when coming back. */
interface StackEntry {
  level: NavLevel;
  selectedIndex: number;
  query: string;
  expanded: ExpandedSections;
}

const ROOT: StackEntry = {
  level: { kind: 'flat' },
  selectedIndex: 0,
  query: '',
  expanded: NONE_EXPANDED,
};

function isDetailLevel(level: NavLevel): level is NavLevel & { kind: 'command' | 'subcommand' } {
  return level.kind === 'command' || level.kind === 'subcommand';
}

/**
 * The key combo as the row shows it on the user's layout (KeyCombo), so the
 * clipboard gets "⌘Ò" on an Italian keyboard rather than the US "⌘;".
 */
function shortcutLabel(shortcut: Shortcut, layout: KeyboardLayout): string {
  if (!shortcut.strokes?.length) return shortcut.key;
  return resolveStrokes(shortcut.strokes, layout)
    .map((s) => s.text)
    .join(' ');
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}


export function App() {
  const { shortcuts, sources, loading } = useShortcuts();
  const { commands } = useCommands();
  const { commandPrefixMode, dismissAfterCopy, commandsEnabled, resultLimits, globalShortcut } =
    useAppSettings();
  const layout = useKeyboardLayout();

  const [navStack, setNavStack] = useState<StackEntry[]>([ROOT]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expanded, setExpanded] = useState<ExpandedSections>(NONE_EXPANDED);
  const [copyFlashIndex, setCopyFlashIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [exiting, setExiting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const currentLevel = (navStack[navStack.length - 1] ?? ROOT).level;
  const drilledSourceId = currentLevel.kind === 'drilled-source' ? currentLevel.sourceId : null;

  // Subcommand detail fetching (only when on a subcommand level)
  const subcommandName = currentLevel.kind === 'subcommand' ? currentLevel.qualifiedName : null;
  const { detail: subcommandDetail, loading: subcommandLoading } = useSubcommandDetail(subcommandName);

  // Get the detail data for the current level (if in a detail view)
  const detailData = (() => {
    // Look the command up again: the level holds a snapshot taken before enrichment finished
    if (currentLevel.kind === 'command') return commands.find(c => c.name === currentLevel.command.name) ?? currentLevel.command;
    if (currentLevel.kind === 'subcommand' && subcommandDetail) return subcommandDetail;
    return null;
  })();

  const activeShortcuts = useMemo(
    () => (drilledSourceId ? shortcuts.filter((s) => s.source === drilledSourceId) : shortcuts),
    [shortcuts, drilledSourceId],
  );
  const activeCommands = commandsEnabled ? commands : NO_COMMANDS;

  const { query, setQuery, results } = useSearch(activeShortcuts, activeCommands, sources, {
    scoped: drilledSourceId !== null,
  });

  const groups = useMemo(
    () =>
      buildResultGroups(results, {
        limits: resultLimits,
        expanded,
        drilled: drilledSourceId !== null,
        query,
      }),
    [results, resultLimits, expanded, drilledSourceId, query],
  );
  const items = useMemo(() => flattenGroups(groups), [groups]);

  const inDetail = isDetailLevel(currentLevel);
  const totalItems = inDetail
    ? detailData
      ? getDetailItemCount(detailData, query)
      : 0
    : items.length;
  // Pushed updates can shrink the list under the selection.
  const sel = totalItems === 0 ? 0 : Math.min(selectedIndex, totalItems - 1);

  const commandPrefixActive = commandPrefixMode && query.startsWith('>');
  const searchTerm = (commandPrefixActive ? query.slice(1) : query).trim();

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  // Full reset (docs/spec.md §10.1). Done when the window hides, so the old query
  // never flashes on the next show, and again on show for safety.
  const resetAll = useCallback(() => {
    clearTimers();
    setNavStack([ROOT]);
    setQuery('');
    setSelectedIndex(0);
    setExpanded(NONE_EXPANDED);
    setCopyFlashIndex(null);
    setCopied(null);
    setShowHelp(false);
    setExiting(false);
  }, [setQuery, clearTimers]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const unsubShown = api.onWindowShown(resetAll);
    const unsubHidden = api.onWindowHidden(resetAll);
    // Every hide (Esc, copy, blur, hotkey) plays the exit animation first;
    // main waits for this promise (or ~120ms) before hiding.
    const unsubWillHide = api.onWindowWillHide(() => {
      if (prefersReducedMotion()) return;
      setExiting(true);
      return new Promise<void>((resolve) => setTimeout(resolve, EXIT_ANIMATION_MS));
    });
    return () => {
      unsubShown();
      unsubHidden();
      unsubWillHide();
    };
  }, [resetAll]);

  useEffect(() => clearTimers, [clearTimers]);

  const changeQuery = useCallback(
    (q: string) => {
      setQuery(q);
      setSelectedIndex(0);
      setExpanded(NONE_EXPANDED);
      setCopyFlashIndex(null);
    },
    [setQuery],
  );

  // Window height: a bare search bar until there is something to show.
  const isBlank = currentLevel.kind === 'flat' && !searchTerm;
  const noResults = !inDetail && !isBlank && items.length === 0 && !loading;
  const windowHeight = showHelp
    ? WINDOW_HEIGHT_EXPANDED
    : inDetail || items.length > 0
      ? WINDOW_HEIGHT_EXPANDED
      : noResults
        ? WINDOW_HEIGHT_EMPTY_STATE
        : WINDOW_HEIGHT_COLLAPSED;

  useEffect(() => {
    window.electronAPI?.setWindowHeight(windowHeight);
  }, [windowHeight]);

  // Keep the selected row visible; at the top, show its section header too.
  // Scrolling forces a layout, so do it in the next frame (with the paint)
  // instead of on the keystroke's critical path.
  useEffect(() => {
    const scroll = () => {
      const root = contentRef.current;
      if (!root) return;
      const el = root.querySelector(`[role="option"][data-index="${sel}"]`);
      if (!(el instanceof HTMLElement)) return;
      const scroller = el.closest('[data-scroll]');
      if (sel === 0 && scroller instanceof HTMLElement) {
        scroller.scrollTop = 0;
      } else if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    };
    if (typeof requestAnimationFrame !== 'function') {
      scroll();
      return;
    }
    const frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [sel, groups, navStack, detailData]);

  /** Hide the panel; main asks for the exit animation (onWindowWillHide). */
  const dismiss = useCallback(() => {
    clearTimers();
    window.electronAPI?.hideWindow();
  }, [clearTimers]);

  const copy = useCallback(
    (text: string, index: number) => {
      navigator.clipboard.writeText(text).catch((err) => console.error('Copy failed:', err));
      clearTimers();
      setCopyFlashIndex(index);
      setCopied(text);
      later(() => {
        setCopyFlashIndex(null);
        if (dismissAfterCopy) dismiss();
      }, COPY_FLASH_MS);
      later(() => setCopied(null), COPIED_STATUS_MS);
    },
    [clearTimers, later, dismissAfterCopy, dismiss],
  );

  const pushLevel = useCallback(
    (level: NavLevel) => {
      setNavStack((prev) => {
        const updated = [...prev];
        const top = updated[updated.length - 1] ?? ROOT;
        updated[updated.length - 1] = { ...top, selectedIndex: sel, query, expanded };
        return [...updated, { level, selectedIndex: 0, query: '', expanded: NONE_EXPANDED }];
      });
      setQuery('');
      setSelectedIndex(0);
      setExpanded(NONE_EXPANDED);
      setCopyFlashIndex(null);
    },
    [sel, query, expanded, setQuery],
  );

  /** Go back one level, restoring its query, expanded sections and selection. */
  const popLevel = useCallback(() => {
    const back = navStack[navStack.length - 2];
    if (!back) return;
    setNavStack(navStack.slice(0, -1));
    setQuery(back.query);
    setExpanded(back.expanded);
    setSelectedIndex(back.selectedIndex);
    setCopyFlashIndex(null);
  }, [navStack, setQuery]);

  /** Enter (or click) on the row at `index`. */
  const activate = useCallback(
    (index: number) => {
      if (inDetail) {
        const text = detailData ? getDetailCopyText(detailData, query, index) : null;
        if (text) copy(text, index);
        return;
      }
      const item = items[index];
      if (!item) return;
      switch (item.type) {
        case 'source':
          pushLevel({ kind: 'drilled-source', sourceId: item.meta.id, sourceLabel: item.meta.label });
          break;
        case 'shortcut':
          if (item.shortcut.key && !item.shortcut.isUnbound) {
            copy(shortcutLabel(item.shortcut, layout), index);
          }
          break;
        case 'command':
          copy(item.command.name, index);
          break;
        case 'show-all':
          // The first hidden row takes the place of "Show all", so the
          // selection lands on it.
          setExpanded((prev) => ({ ...prev, [item.section]: true }));
          break;
      }
    },
    [inDetail, detailData, query, items, copy, pushLevel, layout],
  );

  /** Tab / → on the row at `index`. Returns whether it drilled in. */
  const drillIn = useCallback(
    (index: number): boolean => {
      if (!inDetail) {
        const item = items[index];
        if (item?.type !== 'command') return false;
        pushLevel({ kind: 'command', command: item.command });
        return true;
      }
      if (!detailData || !isSubcommandAtIndex(detailData, query, index)) return false;
      const subName = getDetailCopyText(detailData, query, index);
      if (!subName) return false;
      const baseBinPath =
        currentLevel.kind === 'command' ? currentLevel.command.bin
        : currentLevel.kind === 'subcommand' ? currentLevel.baseBinPath
        : '';
      pushLevel({ kind: 'subcommand', qualifiedName: subName, baseBinPath });
      return true;
    },
    [inDetail, items, detailData, query, currentLevel, pushLevel],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Keys typed into an IME composition belong to the IME.
      if (isImeComposing(e)) return;

      if (showHelp) {
        // Any key closes the help sheet, and does nothing else.
        if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
        e.preventDefault();
        setShowHelp(false);
        return;
      }

      // Let system shortcuts through (Cmd+A, Cmd+C, Cmd+V, etc.)
      if (e.metaKey || e.ctrlKey) return;

      if (e.key === '?' && !query) {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (totalItems > 0) setSelectedIndex((sel + 1) % totalItems);
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (totalItems > 0) setSelectedIndex((sel - 1 + totalItems) % totalItems);
          break;

        case 'Enter':
          e.preventDefault();
          activate(sel);
          break;

        case 'Tab':
          // Never let Tab move focus out of the search field.
          e.preventDefault();
          drillIn(sel);
          break;

        case 'ArrowRight': {
          // Only drill when the caret is at the end, so → still moves the caret.
          const input = inputRef.current;
          const atEnd = !input || input.selectionStart === null || input.selectionStart >= input.value.length;
          if (atEnd && drillIn(sel)) e.preventDefault();
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

        case 'Backspace':
          if (e.defaultPrevented) break;
          if (navStack.length > 1 && !query) {
            e.preventDefault();
            popLevel();
          }
          break;

        case 'Escape':
          e.preventDefault();
          if (query) changeQuery('');
          else if (navStack.length > 1) popLevel();
          else dismiss();
          break;
      }
    },
    [showHelp, query, totalItems, sel, navStack.length, activate, drillIn, popLevel, changeQuery, dismiss],
  );

  const optionIndexOf = (target: EventTarget): number | null => {
    if (!(target instanceof Element)) return null;
    const row = target.closest('[role="option"][data-index]');
    const index = Number(row?.getAttribute('data-index'));
    return row && Number.isInteger(index) ? index : null;
  };

  // Clicking a row selects and activates it; the search field keeps focus.
  const handleMouseDown = (e: React.MouseEvent) => {
    if (optionIndexOf(e.target) !== null) e.preventDefault();
  };
  const handleClick = (e: React.MouseEvent) => {
    const index = optionIndexOf(e.target);
    if (index === null) return;
    setSelectedIndex(index);
    activate(index);
    inputRef.current?.focus();
  };

  // Build breadcrumb names from nav stack
  const breadcrumbs = navStack
    .map((entry) => {
      switch (entry.level.kind) {
        case 'command':
          return entry.level.command.name;
        case 'subcommand': {
          // Show only the last part of the qualified name
          const parts = entry.level.qualifiedName.split(' ');
          return parts[parts.length - 1] ?? entry.level.qualifiedName;
        }
        case 'drilled-source':
          return entry.level.sourceLabel;
        default:
          return null;
      }
    })
    .filter((b): b is string => b !== null);

  const navMode: 'flat' | 'drilled-source' | 'command-detail' = inDetail
    ? 'command-detail'
    : currentLevel.kind === 'drilled-source'
      ? 'drilled-source'
      : 'flat';

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

  const hints = ((): FooterHint[] => {
    const back: FooterHint = {
      label: query ? 'Clear' : navStack.length > 1 ? 'Back' : 'Close',
      keys: ['esc'],
    };
    if (inDetail) {
      if (totalItems === 0) return [back];
      return detailData && isSubcommandAtIndex(detailData, query, sel)
        ? [{ label: 'Copy', keys: ['↩'] }, { label: 'Open', keys: ['⇥'] }, back]
        : [{ label: 'Copy', keys: ['↩'] }, back];
    }
    switch (items[sel]?.type) {
      case 'source':
        return [{ label: 'Open', keys: ['↩'] }, back];
      case 'shortcut':
        return [{ label: 'Copy keys', keys: ['↩'] }, back];
      case 'command':
        return [{ label: 'Copy', keys: ['↩'] }, { label: 'Details', keys: ['⇥'] }, back];
      case 'show-all':
        return [{ label: 'Show all', keys: ['↩'] }, back];
      default:
        return [back];
    }
  })();

  const status = copied ? (
    <>
      <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.5} />
      <span>Copied</span>
      <span className="truncate font-medium text-fg-2">{copied}</span>
    </>
  ) : currentLevel.kind === 'drilled-source' ? (
    <>
      <SourceIcon id={currentLevel.sourceId} label={currentLevel.sourceLabel} size={14} />
      <span className="font-medium text-fg-2">{currentLevel.sourceLabel}</span>
      <span>{plural(activeShortcuts.length, 'shortcut')}</span>
    </>
  ) : !inDetail && items.length > 0 ? (
    <span>{plural(results.sources.length + results.shortcuts.length + results.commands.length, 'result')}</span>
  ) : null;

  const emptyState = (() => {
    if (!noResults) return null;
    if (currentLevel.kind === 'drilled-source' && !searchTerm) {
      return { title: `${currentLevel.sourceLabel} has no shortcuts yet`, hint: 'Check its config path in Preferences' };
    }
    const title = `No matches for “${searchTerm}”`;
    if (currentLevel.kind === 'drilled-source') return { title, hint: 'Esc to search all sources' };
    if (commandPrefixActive) return { title, hint: 'Backspace the > to search shortcuts instead' };
    if (commandPrefixMode) return { title, hint: 'Type > first to search commands' };
    return { title, hint: 'Try an action like “split pane” or a key like ⌘K' };
  })();

  const hotkeyGlyphs = formatAccelerator(globalShortcut);
  const expandedPanel = windowHeight === WINDOW_HEIGHT_EXPANDED;

  return (
    <LauncherPanel
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      exiting={exiting}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {navAnnouncement}
      </div>
      <SearchInput
        query={query}
        onChange={changeQuery}
        navMode={navMode}
        sourceLabel={currentLevel.kind === 'drilled-source' ? currentLevel.sourceLabel : undefined}
        sourceId={drilledSourceId ?? undefined}
        breadcrumbs={breadcrumbs}
        commandPrefixActive={commandPrefixActive}
        onHelpToggle={() => setShowHelp((v) => !v)}
        hotkey={globalShortcut}
        activeDescendant={totalItems > 0 ? optionId(sel) : undefined}
        inputRef={inputRef}
      />
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col border-t border-separator">
        {inDetail ? (
          <CommandDetailView
            data={detailData ?? { description: '', subcommands: [], flags: [], arguments: [], enrichment: 'none' }}
            filterQuery={query}
            selectedIndex={sel}
            copyFlashIndex={copyFlashIndex}
            loading={currentLevel.kind === 'subcommand' && subcommandLoading}
          />
        ) : emptyState ? (
          <div data-testid="empty-state" className="flex flex-1 flex-col items-center justify-center gap-1 pb-1 text-center">
            <p className="text-[14px] font-medium text-fg-2">{emptyState.title}</p>
            <p className="text-[12px] text-fg-3">{emptyState.hint}</p>
          </div>
        ) : (
          <ResultsContainer
            groups={groups}
            selectedIndex={sel}
            copyFlashIndex={copyFlashIndex}
            drilled={drilledSourceId !== null}
          />
        )}
      </div>
      {expandedPanel && !showHelp && <PanelFooter status={status} hints={hints} />}
      {showHelp && <KeyboardHelp onDismiss={() => setShowHelp(false)} hotkey={hotkeyGlyphs} />}
    </LauncherPanel>
  );
}
