import { useState } from 'react';
import { useSettings } from './hooks/useSettings';
import { GeneralTab } from './components/GeneralTab';
import { AppearanceTab } from './components/AppearanceTab';
import { ParsersTab } from './components/ParsersTab';
import { SearchTab } from './components/SearchTab';
import { WindowTab } from './components/WindowTab';

type Tab = 'general' | 'appearance' | 'parsers' | 'search' | 'window';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'parsers', label: 'Parsers' },
  { id: 'search', label: 'Search' },
  { id: 'window', label: 'Window' },
];

export function PreferencesApp() {
  const { settings, loading, updateSetting } = useSettings();
  const [activeTab, setActiveTab] = useState<Tab>('general');

  if (loading || !settings) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: 'var(--text-secondary)' }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <nav
        className="w-44 shrink-0 pt-10 pb-4 px-3 space-y-0.5 border-r"
        style={{
          background: 'var(--bg-primary)',
          borderColor: 'var(--border)',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{
              background:
                activeTab === tab.id ? 'var(--accent)' : 'transparent',
              color:
                activeTab === tab.id ? '#ffffff' : 'var(--text-primary)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main
        className="flex-1 p-6 pt-10 overflow-y-auto"
        style={{ background: 'var(--bg-primary)' }}
      >
        {activeTab === 'general' && (
          <GeneralTab settings={settings} onUpdate={updateSetting} />
        )}
        {activeTab === 'appearance' && (
          <AppearanceTab settings={settings} onUpdate={updateSetting} />
        )}
        {activeTab === 'parsers' && (
          <ParsersTab settings={settings} onUpdate={updateSetting} />
        )}
        {activeTab === 'search' && (
          <SearchTab settings={settings} onUpdate={updateSetting} />
        )}
        {activeTab === 'window' && (
          <WindowTab settings={settings} onUpdate={updateSetting} />
        )}
      </main>
    </div>
  );
}
