import { useState, useEffect } from 'react';
import type { AppSettings } from '../../../shared/settings';

interface CommandsTabProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => Promise<{ success: boolean; error?: string }>;
}

interface CommandsStats {
  total: number;
  enriched: number;
  running: boolean;
}

export function CommandsTab({ settings, onUpdate }: CommandsTabProps) {
  const [stats, setStats] = useState<CommandsStats>({ total: 0, enriched: 0, running: false });

  useEffect(() => {
    window.electronAPI.getCommandsStats().then(setStats);

    // Poll for stats while running
    const interval = setInterval(() => {
      window.electronAPI.getCommandsStats().then(setStats);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const progressPercent = stats.total > 0
    ? Math.round((stats.enriched / stats.total) * 100)
    : 0;

  const statusText = !settings.commandsEnabled
    ? 'Disabled'
    : stats.running
      ? 'Running in background'
      : stats.enriched === stats.total && stats.total > 0
        ? 'Complete'
        : 'Paused';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Commands
      </h2>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Manage CLI command discovery and enrichment
      </div>

      {/* Enable/Disable toggle */}
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Enable Commands
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Discover and index CLI commands from your PATH
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.commandsEnabled}
          onChange={(e) => onUpdate('commandsEnabled', e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>

      {/* Enrichment progress */}
      {settings.commandsEnabled && (
        <div
          className="p-4 rounded-lg space-y-3"
          style={{ background: 'var(--bg-secondary)' }}
        >
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            Enrichment Progress
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPercent}%`,
                background: 'var(--accent)',
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {stats.enriched} of {stats.total} commands enriched
            </div>
            <div
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                background: stats.running
                  ? 'rgba(0,122,255,0.15)'
                  : statusText === 'Complete'
                    ? 'rgba(52,199,89,0.15)'
                    : 'rgba(142,142,147,0.15)',
                color: stats.running
                  ? 'var(--accent)'
                  : statusText === 'Complete'
                    ? '#34c759'
                    : 'var(--text-secondary)',
              }}
            >
              {statusText}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
