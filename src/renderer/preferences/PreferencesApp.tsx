import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSettings } from './hooks/useSettings';
import { GeneralTab } from './components/GeneralTab';
import { SourcesTab } from './components/SourcesTab';
import { SearchTab } from './components/SearchTab';
import { CommandsTab } from './components/CommandsTab';

type Tab = 'general' | 'sources' | 'search' | 'commands';

/** 16x16 white glyphs drawn on the coloured sidebar tiles. */
const ICONS: Record<Tab, ReactNode> = {
  general: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M6.9 1.5h2.2l.35 1.75c.4.14.77.35 1.1.62l1.7-.57 1.1 1.9-1.35 1.18a4.6 4.6 0 0 1 0 1.24l1.35 1.18-1.1 1.9-1.7-.57c-.33.27-.7.48-1.1.62L9.1 14.5H6.9l-.35-1.75a4.3 4.3 0 0 1-1.1-.62l-1.7.57-1.1-1.9L4 9.62a4.6 4.6 0 0 1 0-1.24L2.65 7.2l1.1-1.9 1.7.57c.33-.27.7-.48 1.1-.62L6.9 1.5ZM8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z"
      />
    </svg>
  ),
  sources: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M8 1.8 14.5 5 8 8.2 1.5 5 8 1.8Z" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        d="M2.2 8 8 10.9 13.8 8M2.2 10.9 8 13.8l5.8-2.9"
      />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="6.8" cy="6.8" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="m10 10 3.6 3.6" />
    </svg>
  ),
  commands: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m3 4.5 3.5 3.5L3 11.5M8.5 12h4.5"
      />
    </svg>
  ),
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'sources', label: 'Sources' },
  { id: 'search', label: 'Search' },
  { id: 'commands', label: 'Commands' },
];

export function PreferencesApp() {
  const { settings, loading, updateSetting } = useSettings();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const navRef = useRef<HTMLElement>(null);

  // Up/Down move through the sidebar like a native source list.
  const handleNavKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const index = TABS.findIndex((t) => t.id === activeTab);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next = TABS[(index + step + TABS.length) % TABS.length];
    if (!next) return;
    setActiveTab(next.id);
    navRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  };

  return (
    <div className="pf-window">
      <nav
        ref={navRef}
        className="pf-sidebar"
        aria-label="Preferences sections"
        onKeyDown={handleNavKeyDown}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-tab={tab.id}
            className="pf-nav-item"
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={`pf-nav-icon pf-nav-icon-${tab.id}`}>{ICONS[tab.id]}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="pf-content">
        {loading || !settings ? (
          <div className="pf-loading">Loading settings…</div>
        ) : (
          <>
            {activeTab === 'general' && <GeneralTab settings={settings} onUpdate={updateSetting} />}
            {activeTab === 'sources' && <SourcesTab settings={settings} onUpdate={updateSetting} />}
            {activeTab === 'search' && <SearchTab settings={settings} onUpdate={updateSetting} />}
            {activeTab === 'commands' && (
              <CommandsTab settings={settings} onUpdate={updateSetting} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
