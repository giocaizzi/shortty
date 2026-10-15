import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { AppSettings } from '../../../shared/settings';
import type { SourceStatus } from '../../../shared/types';
import type { PathCheck } from '../../../preload/preload';
import type { UpdateSetting } from '../hooks/useSettings';
import { SourceIcon } from '../../components/SourceIcon';
import { Badge, Message, PaneHeader, Section, Switch } from './controls';
import { isImeComposing } from '../../lib/ime';

interface SourcesTabProps {
  settings: AppSettings;
  onUpdate: UpdateSetting;
}

/** The registry re-parses asynchronously after a settings change; re-read its status after this delay too. */
export const SOURCES_SETTLE_MS = 600;

/** Resolving "~/" through the main process yields the home folder. */
const HOME_PROBE = ['~/'];

function overrideText(override: string | string[] | undefined): string {
  if (override === undefined) return '';
  return Array.isArray(override) ? override.join(', ') : override;
}

function StatusBadge({ source }: { source: SourceStatus }) {
  if (!source.hasParser) return <Badge tone="info">Cheatsheet only</Badge>;
  if (source.detected) return <Badge tone="ok">Detected</Badge>;
  return <Badge tone="warn">Not detected</Badge>;
}

/** Show paths under the home folder as ~/..., like Finder and the shell. */
function tildify(path: string, home: string | undefined): string {
  if (!home || home === '/') return path;
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/** Path text that truncates at the start, so the file name stays visible. */
function PathText({ path }: { path: string }) {
  return (
    <span className="pf-path" title={path}>
      <span dir="ltr">{path}</span>
    </span>
  );
}

function ExistsMark({ exists }: { exists: boolean | undefined }) {
  if (exists === undefined) return <span className="pf-exists" aria-hidden="true" />;
  return (
    <span
      className={`pf-exists ${exists ? 'pf-tone-ok' : 'pf-tone-error'}`}
      role="img"
      aria-label={exists ? 'Exists' : 'Missing'}
    >
      {exists ? '✓' : '✗'}
    </span>
  );
}

/** Resolve paths through the main process (expands ~ and env vars) and report existence. */
function usePathChecks(paths: string[], delayMs = 0): Map<string, PathCheck> {
  const [checks, setChecks] = useState<Map<string, PathCheck>>(new Map());
  const key = paths.join('\n');

  useEffect(() => {
    const list = key === '' ? [] : key.split('\n');
    if (list.length === 0) {
      setChecks(new Map());
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      window.electronAPI
        .checkPaths(list)
        .then((result) => {
          if (!cancelled) setChecks(new Map(result.map((c) => [c.path, c])));
        })
        .catch(() => undefined);
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, delayMs]);

  return checks;
}

interface SourceCardProps {
  source: SourceStatus;
  enabled: boolean;
  override: string | string[] | undefined;
  onToggle: (enabled: boolean) => void;
  onCommitOverride: (path: string) => void;
}

function SourceCard({ source, enabled, override, onToggle, onCommitOverride }: SourceCardProps) {
  const current = overrideText(override);
  const hasOverride = override !== undefined;
  const [draft, setDraft] = useState(current);
  const [editing, setEditing] = useState(false);
  const cancelEdit = useRef(false);
  const titleId = useId();
  const inputId = useId();
  const hintId = useId();

  // Follow external changes (Reset, another window) unless the user is typing.
  useEffect(() => {
    if (!editing) setDraft(current);
  }, [current, editing]);

  const configChecks = usePathChecks(source.configPaths);
  const home = usePathChecks(HOME_PROBE).get('~/')?.resolved;
  const trimmedDraft = draft.trim();
  const draftChecks = usePathChecks(trimmedDraft ? [trimmedDraft] : [], 200);
  const draftCheck = draftChecks.get(trimmedDraft);

  const commit = (value: string) => {
    const next = value.trim();
    setDraft(next);
    if (next !== current) onCommitOverride(next);
  };

  // Enter commits at once (blur never fires on a field that has already lost
  // focus); Escape reverts. Both skip the blur commit.
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isImeComposing(e)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditing(false);
      commit(e.currentTarget.value);
      cancelEdit.current = true; // blur() runs handleBlur synchronously, if focused
      e.currentTarget.blur();
      cancelEdit.current = false;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit.current = true;
      setDraft(current);
      e.currentTarget.blur();
    }
  };

  const handleBlur = () => {
    setEditing(false);
    if (cancelEdit.current) {
      cancelEdit.current = false;
      return;
    }
    commit(draft);
  };

  const browse = async () => {
    const picked = await window.electronAPI.pickPath(trimmedDraft || source.configPaths[0]);
    if (picked) commit(picked);
  };

  const reset = () => {
    setDraft('');
    setEditing(false);
    onCommitOverride('');
  };

  const pathsLabel = hasOverride
    ? 'Reading from'
    : source.detected
      ? 'Detected at'
      : 'Expected at';

  return (
    <div className="pf-source" data-testid="source-card">
      <div className="pf-row pf-source-header">
        <div className="pf-row-main">
          <SourceIcon id={source.id} label={source.label} size={26} />
          <div className="pf-row-text">
            <div className="pf-source-title">
              <span className="pf-row-label" id={titleId}>
                {source.label}
              </span>
              <StatusBadge source={source} />
            </div>
            {source.shortcutCount > 0 && (
              <div className="pf-row-description">
                {source.shortcutCount.toLocaleString()} built-in shortcuts
              </div>
            )}
          </div>
          <div className="pf-row-control">
            <Switch
              checked={enabled}
              onChange={onToggle}
              label={`Use ${source.label}`}
            />
          </div>
        </div>
      </div>

      <div className={`pf-source-body${enabled ? '' : ' pf-group-dimmed'}`}>
        {!source.hasParser ? (
          <div className="pf-row">
            <div className="pf-row-description">
              Built-in cheatsheet, no config file to read.
            </div>
          </div>
        ) : (
          <>
            {source.configPaths.length > 0 && (
              <div className="pf-row pf-paths">
                <div className="pf-paths-label">{pathsLabel}</div>
                <ul className="pf-path-list">
                  {source.configPaths.map((p) => (
                    <li key={p} className="pf-path-item" data-testid="config-path">
                      <ExistsMark exists={configChecks.get(p)?.exists} />
                      <PathText path={tildify(p, home)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pf-row">
              <div className="pf-override">
                <label className="pf-paths-label" htmlFor={inputId}>
                  Custom path
                </label>
                <div className="pf-override-line">
                  <input
                    id={inputId}
                    type="text"
                    className="pf-text-field"
                    value={draft}
                    placeholder={
                      source.configPaths[0] ? tildify(source.configPaths[0], home) : '~/path/to/config'
                    }
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    aria-describedby={hintId}
                    onFocus={() => setEditing(true)}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                  />
                  <button type="button" className="pf-button" onClick={() => void browse()}>
                    Browse…
                  </button>
                  {hasOverride && (
                    <button type="button" className="pf-button" onClick={reset}>
                      Reset
                    </button>
                  )}
                </div>
                <div id={hintId}>
                  {trimmedDraft !== '' && draftCheck && !draftCheck.exists ? (
                    <Message tone="warn">
                      Nothing exists at this path yet. Shortty saves it anyway and reads it once
                      the file appears.
                    </Message>
                  ) : (
                    <div className="pf-row-description">
                      Leave empty to use the detected path. Supports ~, $HOME and
                      $XDG_CONFIG_HOME.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function SourcesTab({ settings, onUpdate }: SourcesTabProps) {
  const [sources, setSources] = useState<SourceStatus[] | null>(null);

  const refresh = useCallback(() => {
    window.electronAPI
      .getAllSources()
      .then(setSources)
      .catch(() => setSources((s) => s ?? []));
  }, []);

  // Re-read detection status whenever the source settings change: once now,
  // and once the registry has finished re-parsing.
  const settingsKey = JSON.stringify([settings.disabledParsers, settings.sourcePathOverrides]);
  useEffect(() => {
    refresh();
    const timer = setTimeout(refresh, SOURCES_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settingsKey, refresh]);

  const toggleSource = (sourceId: string, enabled: boolean) => {
    const disabled = new Set(settings.disabledParsers);
    if (enabled) disabled.delete(sourceId);
    else disabled.add(sourceId);
    void onUpdate('disabledParsers', Array.from(disabled));
  };

  const commitOverride = (sourceId: string, path: string) => {
    const overrides = { ...settings.sourcePathOverrides };
    if (path === '') delete overrides[sourceId];
    else overrides[sourceId] = path;
    void onUpdate('sourcePathOverrides', overrides);
  };

  return (
    <div className="pf-pane">
      <PaneHeader title="Sources" />
      <p className="pf-pane-intro">
        Choose which apps Shortty reads shortcuts from. Sources you don&apos;t have installed still
        show their built-in cheatsheet.
      </p>

      {sources === null ? null : sources.length === 0 ? (
        <Section label="Sources">
          <div className="pf-row">
            <div className="pf-row-description">
              No sources are available. Restart Shortty to scan again.
            </div>
          </div>
        </Section>
      ) : (
        <div className="pf-source-list">
          {sources.map((source) => (
            <Section key={source.id} label={source.label}>
              <SourceCard
                source={source}
                enabled={!settings.disabledParsers.includes(source.id)}
                override={settings.sourcePathOverrides[source.id]}
                onToggle={(enabled) => toggleSource(source.id, enabled)}
                onCommitOverride={(path) => commitOverride(source.id, path)}
              />
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
