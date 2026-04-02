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
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search shortcuts..."
        className="
          flex-1 bg-transparent text-lg text-white
          placeholder-white/30 outline-none
        "
        role="searchbox"
        aria-label="Search shortcuts"
      />
      <span className="flex items-center gap-0.5 text-white/30">
        <kbd>⌘</kbd>
        <kbd>⇧</kbd>
        <kbd>Space</kbd>
      </span>
    </div>
  );
}
