import { useRef, useEffect } from 'react';
import { Search } from 'lucide-react';

type NavMode = 'flat' | 'drilled-source' | 'command-detail';

interface SearchInputProps {
  query: string;
  onChange: (value: string) => void;
  navMode: NavMode;
  sourceLabel?: string;
  breadcrumbs?: string[];
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
  breadcrumbs,
  commandPrefixActive,
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
    <div style={{ padding: '20px 28px' }} className="shrink-0 border-b border-white/[0.06]">
      <div className="flex items-center gap-3">
        <Search className="h-5 w-5 shrink-0 text-white/25" />
        {commandPrefixActive && (
          <span className="shrink-0 rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs text-white/50">
            {'>'}
          </span>
        )}
        {navMode === 'drilled-source' && sourceLabel && (
          <span className="shrink-0 rounded-md bg-white/[0.08] px-2.5 py-1 text-sm font-medium text-white/70">
            {sourceLabel}
          </span>
        )}
        {navMode === 'command-detail' && breadcrumbs && breadcrumbs.length > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-[10px] text-white/20">{'>'}</span>}
                <span className="rounded-md bg-white/[0.08] px-2 py-0.5 font-mono text-xs font-medium text-white/70">
                  {crumb}
                </span>
              </span>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder={getPlaceholder(navMode, sourceLabel)}
          className="
            flex-1 bg-transparent text-xl font-light text-white
            placeholder-white/20 outline-none
          "
          role="searchbox"
          aria-label="Search shortcuts"
        />
      </div>
    </div>
  );
}
