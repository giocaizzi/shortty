import { useState, useEffect, useCallback, useRef } from 'react';
import { useKeybindings } from './hooks/useKeybindings';
import { useSearch } from './hooks/useSearch';
import { LauncherPanel } from './components/LauncherPanel';
import { SearchInput } from './components/SearchInput';
import { FilterPills } from './components/FilterPills';
import { KeybindingList } from './components/KeybindingList';
import { EmptyState } from './components/EmptyState';

export function App() {
  const { keybindings, sources, loading } = useKeybindings();
  const { query, setQuery, results } = useSearch(keybindings);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredResults = activeFilter
    ? results.filter((kb) => kb.source === activeFilter)
    : results;

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredResults.length, query, activeFilter]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredResults.length - 1),
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter': {
          e.preventDefault();
          const selected = filteredResults[selectedIndex];
          if (selected) {
            navigator.clipboard.writeText(selected.key);
          }
          break;
        }
      }
    },
    [filteredResults, selectedIndex],
  );

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selectedEl = list.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <LauncherPanel onKeyDown={handleKeyDown}>
      <SearchInput query={query} onChange={setQuery} />
      {sources.length > 0 && (
        <FilterPills
          sources={sources}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      )}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-white/30">
          Loading shortcuts...
        </div>
      ) : filteredResults.length > 0 ? (
        <KeybindingList
          ref={listRef}
          keybindings={filteredResults}
          selectedIndex={selectedIndex}
          groupBySource={!activeFilter}
        />
      ) : (
        <EmptyState
          type={keybindings.length === 0 ? 'no-configs' : 'no-results'}
          query={query}
        />
      )}
    </LauncherPanel>
  );
}
