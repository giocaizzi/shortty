import { useState, useEffect } from 'react';
import type { AppSettings } from '../../../shared/settings';
import type { UpdateSetting } from '../hooks/useSettings';
import { Badge, PaneHeader, Row, Section, SwitchRow, type Tone } from './controls';

interface CommandsTabProps {
  settings: AppSettings;
  onUpdate: UpdateSetting;
}

interface CommandsStats {
  total: number;
  enriched: number;
  running: boolean;
}

const POLL_MS = 3000;

function enrichmentStatus(stats: CommandsStats): { text: string; tone: Tone } {
  if (stats.running) return { text: 'Running in background', tone: 'info' };
  if (stats.total > 0 && stats.enriched >= stats.total) return { text: 'Complete', tone: 'ok' };
  return { text: 'Paused', tone: 'muted' };
}

export function CommandsTab({ settings, onUpdate }: CommandsTabProps) {
  const [stats, setStats] = useState<CommandsStats>({ total: 0, enriched: 0, running: false });
  const [rebuilding, setRebuilding] = useState(false);

  const rebuild = async () => {
    setRebuilding(true);
    try {
      await window.electronAPI.rebuildIndex();
      setStats(await window.electronAPI.getCommandsStats());
    } catch (err) {
      console.error('Rebuild failed:', err);
    } finally {
      setRebuilding(false);
    }
  };

  useEffect(() => {
    if (!settings.commandsEnabled) return;
    const load = () => {
      window.electronAPI.getCommandsStats().then(setStats).catch(() => undefined);
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [settings.commandsEnabled]);

  const percent = stats.total > 0 ? Math.round((stats.enriched / stats.total) * 100) : 0;
  const status = enrichmentStatus(stats);

  return (
    <div className="pf-pane">
      <PaneHeader title="Commands" />

      <Section label="Shell commands">
        <SwitchRow
          label="Search shell commands"
          description="Find CLI commands from your PATH alongside shortcuts."
          checked={settings.commandsEnabled}
          onChange={(v) => void onUpdate('commandsEnabled', v)}
        />
      </Section>

      {settings.commandsEnabled && (
        <Section
          title="Descriptions"
          footer="Shortty reads each command's --help and man page in the background to fill in subcommands and flags."
        >
          <div className="pf-row">
            <div className="pf-progress-head">
              <span className="pf-row-label">
                {stats.enriched.toLocaleString()} of {stats.total.toLocaleString()} commands
              </span>
              <Badge tone={status.tone}>{status.text}</Badge>
            </div>
            <div
              className="pf-progress"
              role="progressbar"
              aria-label="Command descriptions"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="pf-progress-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </Section>
      )}

      <Section footer="Use it after installing tools or editing config files, or when results look stale. Command details are read again in the background.">
        <Row
          label="Rebuild index"
          description="Clear cached command help and re-read every command and shortcut source."
          control={
            <button type="button" className="pf-button" disabled={rebuilding} onClick={() => void rebuild()}>
              {rebuilding ? 'Rebuilding…' : 'Rebuild'}
            </button>
          }
        />
      </Section>
    </div>
  );
}
