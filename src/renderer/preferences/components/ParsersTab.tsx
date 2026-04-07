import { useState, useEffect } from 'react';
import type { AppSettings } from '../../../shared/settings';
import type { ParserMeta } from '../../../shared/types';

interface ParsersTabProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => Promise<{ success: boolean; error?: string }>;
}

export function ParsersTab({ settings, onUpdate }: ParsersTabProps) {
  const [sources, setSources] = useState<ParserMeta[]>([]);

  useEffect(() => {
    window.electronAPI.getAvailableSources().then(setSources);
  }, []);

  const toggleParser = (parserId: string) => {
    const disabled = new Set(settings.disabledParsers);
    if (disabled.has(parserId)) {
      disabled.delete(parserId);
    } else {
      disabled.add(parserId);
    }
    onUpdate('disabledParsers', Array.from(disabled));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Parsers
      </h2>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Enable or disable keybinding sources
      </div>

      <div className="space-y-1">
        {sources.map((source) => {
          const isEnabled = !settings.disabledParsers.includes(source.id);
          return (
            <label
              key={source.id}
              className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors"
              style={{ background: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{source.icon}</span>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {source.label}
                </div>
              </div>
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={() => toggleParser(source.id)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>
          );
        })}
        {sources.length === 0 && (
          <div className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            No parsers detected
          </div>
        )}
      </div>
    </div>
  );
}
