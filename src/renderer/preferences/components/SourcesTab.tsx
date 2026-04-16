import { useState, useEffect } from 'react';
import type { AppSettings } from '../../../shared/settings';
import type { SourceStatus } from '../../../shared/types';

interface SourcesTabProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => Promise<{ success: boolean; error?: string }>;
}

function StatusBadge({ source }: { source: SourceStatus }) {
  if (!source.hasParser) {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
        style={{ background: 'rgba(0,122,255,0.15)', color: 'var(--accent)' }}
      >
        Cheatsheet Only
      </span>
    );
  }
  if (source.detected) {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
        style={{ background: 'rgba(52,199,89,0.15)', color: '#34c759' }}
      >
        Detected
      </span>
    );
  }
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
      style={{ background: 'rgba(255,204,0,0.15)', color: '#cc8800' }}
    >
      Not Detected
    </span>
  );
}

function SourceRow({
  source,
  isEnabled,
  pathOverride,
  onToggle,
  onPathOverride,
  onResetPath,
}: {
  source: SourceStatus;
  isEnabled: boolean;
  pathOverride: string | string[] | undefined;
  onToggle: () => void;
  onPathOverride: (path: string) => void;
  onResetPath: () => void;
}) {
  const hasOverride = pathOverride !== undefined;
  const overrideValue = Array.isArray(pathOverride)
    ? pathOverride.join(', ')
    : pathOverride ?? '';
  const detectedPath = source.configPaths.length > 0
    ? source.configPaths.join(', ')
    : null;

  return (
    <div
      className="p-3 rounded-lg space-y-2"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{source.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {source.label}
              </span>
              <StatusBadge source={source} />
            </div>
            {source.shortcutCount > 0 && (
              <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                {source.shortcutCount} shortcuts
              </div>
            )}
          </div>
        </div>
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={onToggle}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </div>

      {/* Path display */}
      {source.hasParser && (
        <div className="space-y-1.5 pl-8">
          {hasOverride && detectedPath && (
            <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              Auto-detected: {detectedPath}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={hasOverride ? overrideValue : (detectedPath ?? '')}
              placeholder="Config path..."
              onChange={(e) => onPathOverride(e.target.value)}
              className="flex-1 px-2 py-1 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'var(--border)',
                color: hasOverride ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            />
            {hasOverride && (
              <button
                type="button"
                onClick={onResetPath}
                className="px-2 py-1 text-[10px] rounded border"
                style={{
                  background: 'var(--bg-primary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cheatsheet-only: no config file */}
      {!source.hasParser && (
        <div className="pl-8">
          <div className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>
            (no config file)
          </div>
        </div>
      )}
    </div>
  );
}

export function SourcesTab({ settings, onUpdate }: SourcesTabProps) {
  const [sources, setSources] = useState<SourceStatus[]>([]);

  useEffect(() => {
    window.electronAPI.getAllSources().then(setSources);
  }, []);

  const toggleSource = (sourceId: string) => {
    const disabled = new Set(settings.disabledParsers);
    if (disabled.has(sourceId)) {
      disabled.delete(sourceId);
    } else {
      disabled.add(sourceId);
    }
    onUpdate('disabledParsers', Array.from(disabled));
  };

  const setPathOverride = (sourceId: string, path: string) => {
    const overrides = { ...settings.sourcePathOverrides };
    if (path.trim() === '') {
      delete overrides[sourceId];
    } else {
      overrides[sourceId] = path;
    }
    onUpdate('sourcePathOverrides', overrides);
  };

  const resetPathOverride = (sourceId: string) => {
    const overrides = { ...settings.sourcePathOverrides };
    delete overrides[sourceId];
    onUpdate('sourcePathOverrides', overrides);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Sources
      </h2>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Manage keybinding sources and their config paths
      </div>

      <div className="space-y-2">
        {sources.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            isEnabled={!settings.disabledParsers.includes(source.id)}
            pathOverride={settings.sourcePathOverrides[source.id]}
            onToggle={() => toggleSource(source.id)}
            onPathOverride={(path) => setPathOverride(source.id, path)}
            onResetPath={() => resetPathOverride(source.id)}
          />
        ))}
        {sources.length === 0 && (
          <div className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            No sources detected
          </div>
        )}
      </div>
    </div>
  );
}
