import { useRef, useEffect } from 'react';
import { Search } from 'lucide-react';

interface SearchInputProps {
  query: string;
  onChange: (value: string) => void;
}

export function SearchInput({ query, onChange }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Re-focus on window shown
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
    <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
      <Search className="h-5 w-5 shrink-0 text-neutral-400" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search shortcuts..."
        className="
          flex-1 bg-transparent text-base text-neutral-900
          placeholder-neutral-400 outline-none
          dark:text-neutral-100
        "
        role="searchbox"
        aria-label="Search shortcuts"
      />
      <kbd className="text-xs text-neutral-400">⌘⇧Space</kbd>
    </div>
  );
}
