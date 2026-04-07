import { useRef, useEffect } from 'react';
import { Search, HelpCircle } from 'lucide-react';

type NavMode = 'flat' | 'drilled-source' | 'command-detail';

interface SearchInputProps {
  query: string;
  onChange: (value: string) => void;
  navMode: NavMode;
  sourceLabel?: string;
  commandPrefixActive?: boolean;
  onHelpToggle: () => void;
}

function getPlaceholder(
  navMode: NavMode,
  sourceLabel?: string,
): string {
  switch (navMode) {
    case 'drilled-source':
      return `Search in ${sourceLabel ?? 'source'}...`;
    case 'command-detail':
      return 'Filter subcommands and flags...';
    default:
      return 'Search shortcuts and commands...';
  }
}

export function SearchInput({
  query,
  onChange,
  navMode,
  sourceLabel,
  commandPrefixActive,
  onHelpToggle,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const unsub = api.onWindowShown(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return unsub;
  }, []);

  return (
    <div className="relative z-10 flex shrink-0 items-center gap-3 border-b border-white/8 bg-white/5 px-5 py-3">
      <Search className="h-5 w-5 shrink-0 text-white/40" />
      {commandPrefixActive && (
        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white/50">
          {'>'}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={getPlaceholder(navMode, sourceLabel)}
        className="
          flex-1 bg-transparent text-lg text-white
          placeholder-white/30 outline-none
        "
        role="searchbox"
        aria-label="Search shortcuts"
      />
      <button
        onClick={onHelpToggle}
        className="shrink-0 text-white/20 hover:text-white/40"
        aria-label="Keyboard shortcuts help"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <span className="flex items-center gap-0.5 text-white/30">
        <kbd>&#8984;</kbd>
        <kbd>&#8679;</kbd>
        <kbd>Space</kbd>
      </span>
    </div>
  );
}
