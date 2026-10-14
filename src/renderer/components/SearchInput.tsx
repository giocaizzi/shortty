import { useRef, useEffect, type RefObject } from 'react';
import { ChevronRight, CircleHelp, Search } from 'lucide-react';
import { SourceIcon } from './SourceIcon';
import { isImeComposing } from '../lib/ime';

type NavMode = 'flat' | 'drilled-source' | 'command-detail';

interface SearchInputProps {
  query: string;
  onChange: (value: string) => void;
  navMode: NavMode;
  sourceLabel?: string;
  sourceId?: string;
  breadcrumbs?: string[];
  commandPrefixActive?: boolean;
  onHelpToggle: () => void;
  /** Global activation shortcut as an Electron accelerator, shown as a hint. */
  hotkey?: string;
  /** id of the selected option, for aria-activedescendant. */
  activeDescendant?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}

function getPlaceholder(navMode: NavMode, sourceLabel?: string): string {
  switch (navMode) {
    case 'drilled-source':
      return `Search in ${sourceLabel ?? 'source'}...`;
    case 'command-detail':
      return 'Filter subcommands and flags...';
    default:
      return 'Search shortcuts and commands...';
  }
}

const ACCELERATOR_GLYPHS: Record<string, string> = {
  commandorcontrol: '⌘',
  cmdorctrl: '⌘',
  command: '⌘',
  cmd: '⌘',
  super: '⌘',
  meta: '⌘',
  control: '⌃',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  space: 'Space',
  return: '↩',
  enter: '↩',
  tab: '⇥',
  escape: 'Esc',
  esc: 'Esc',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

/** "CommandOrControl+Shift+Space" -> ["⌘", "⇧", "Space"]. */
export function formatAccelerator(accelerator: string): string[] {
  return accelerator
    .split('+')
    .filter(Boolean)
    .map((part) => ACCELERATOR_GLYPHS[part.toLowerCase()] ?? part.toUpperCase());
}

export function SearchInput({
  query,
  onChange,
  navMode,
  sourceLabel,
  sourceId,
  breadcrumbs,
  commandPrefixActive,
  onHelpToggle,
  hotkey,
  activeDescendant,
  inputRef: externalRef,
}: SearchInputProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;

  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const unsub = api.onWindowShown(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return unsub;
  }, [inputRef]);

  return (
    <div className="flex h-[72px] shrink-0 items-center gap-3 px-[18px]">
      <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-fg-3" strokeWidth={2} />
      {commandPrefixActive && (
        <span className="shrink-0 rounded-[6px] bg-fill-selected px-1.5 py-0.5 font-mono text-[13px] font-semibold text-fg-2">
          {'>'}
        </span>
      )}
      {navMode === 'drilled-source' && sourceLabel && (
        <span className="flex shrink-0 items-center gap-1.5 rounded-[7px] bg-fill-selected py-1 pl-1 pr-2 text-[13px] font-medium text-fg">
          <SourceIcon id={sourceId ?? sourceLabel} label={sourceLabel} size={18} />
          {sourceLabel}
        </span>
      )}
      {navMode === 'command-detail' && breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex shrink-0 items-center gap-1">
          {breadcrumbs.map((crumb, i) => (
            <span key={`${i}:${crumb}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden="true" className="h-3 w-3 text-fg-4" />}
              <span className="rounded-[6px] bg-fill-selected px-2 py-0.5 font-mono text-[12.5px] font-medium text-fg">
                {crumb}
              </span>
            </span>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        value={commandPrefixActive ? query.slice(1) : query}
        onChange={(e) => {
          const val = e.target.value;
          // Keep the > prefix in the underlying state
          onChange(commandPrefixActive ? '>' + val : val);
        }}
        onKeyDown={(e) => {
          if (isImeComposing(e)) return;
          // Backspace on empty input with prefix active → deactivate prefix
          if (commandPrefixActive && e.key === 'Backspace' && query === '>') {
            e.preventDefault();
            onChange('');
          }
        }}
        placeholder={getPlaceholder(navMode, sourceLabel)}
        className="min-w-0 flex-1 bg-transparent text-[21px] font-normal tracking-[-0.01em] text-fg outline-none"
        role="searchbox"
        aria-label="Search shortcuts"
        aria-activedescendant={activeDescendant}
        spellCheck={false}
        autoComplete="off"
      />
      {hotkey && (
        <span className="flex shrink-0 items-center gap-0.5" title="Show or hide Shortty">
          {formatAccelerator(hotkey).map((glyph, i) => (
            <kbd key={`${i}:${glyph}`} className="kbd-sm">
              {glyph}
            </kbd>
          ))}
        </span>
      )}
      <button
        type="button"
        onClick={onHelpToggle}
        onMouseDown={(e) => e.preventDefault()}
        tabIndex={-1}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-3 hover:bg-fill-hover hover:text-fg-2"
      >
        <CircleHelp aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}
