import { useEffect, useId, useState } from 'react';
import type { AppSettings } from '../../../shared/settings';
import { DEFAULT_SETTINGS } from '../../../shared/settings';
import type { UpdateStatus } from '../../../shared/types';
import { useKeyboardLayout } from '../../lib/keyboard-layout';
import { acceleratorToGlyphs } from '../lib/accelerator';
import { keyPlatform, resetSettingsCommand } from '../lib/platform';
import type { UpdateSetting } from '../hooks/useSettings';
import { Keycaps, PaneHeader, Row, Section, Segmented, SwitchRow } from './controls';
import { ShortcutRecorder } from './ShortcutRecorder';

export interface GeneralTabProps {
  settings: AppSettings;
  onUpdate: UpdateSetting;
}

const POSITIONS: { value: AppSettings['windowPosition']; label: string }[] = [
  { value: 'top-center', label: 'Top Center' },
  { value: 'center', label: 'Center' },
  { value: 'mouse', label: 'Near Cursor' },
];

const RESETS: { value: AppSettings['resetLauncher']; label: string }[] = [
  { value: 'immediately', label: 'Immediately' },
  { value: '90s', label: 'After 90 s' },
  { value: 'never', label: 'Never' },
];

const THEMES: { value: AppSettings['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

type VisibilityKey = 'showDockIcon' | 'showMenuBar';

function updateStatusText({ state, version }: UpdateStatus): string {
  switch (state) {
    case 'disabled':
      return 'Updates are checked in installed builds only.';
    case 'idle':
      return 'Not checked yet.';
    case 'checking':
      return 'Checking…';
    case 'up-to-date':
      return 'Up to date.';
    case 'available':
      return `Version ${version} is available.`;
    case 'downloading':
      return 'Downloading the update…';
    case 'ready':
      return `${version ? `Version ${version}` : 'The update'} is ready. Restart to update.`;
    case 'error':
      return "Couldn't check for updates.";
  }
}

/** Updates row: current version, status and the one action that fits it (also on About). */
export function UpdatesSection({ settings, onUpdate }: GeneralTabProps) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    window.electronAPI.getUpdateStatus().then(setStatus).catch(() => undefined);
    return window.electronAPI.onUpdateStatus(setStatus);
  }, []);

  if (!status) return null;
  const { state } = status;
  const button =
    state === 'ready' ? (
      <button type="button" className="pf-button pf-button-primary" onClick={() => void window.electronAPI.installUpdate()}>
        Restart to Update
      </button>
    ) : state === 'available' ? (
      <button type="button" className="pf-button" onClick={() => void window.electronAPI.installUpdate()}>
        Download…
      </button>
    ) : (
      <button
        type="button"
        className="pf-button"
        disabled={state === 'disabled' || state === 'checking' || state === 'downloading'}
        onClick={() => void window.electronAPI.checkForUpdates()}
      >
        Check Now
      </button>
    );

  // Only a copy Squirrel can update (docs/spec.md §12.4) gets the switch.
  const selfUpdate = status.canAutoUpdate === true;
  return (
    <Section
      label="Updates"
      footer={
        selfUpdate
          ? 'Updates install in the background and apply when you restart.'
          : "This copy can't update itself. Shortty will tell you when a new version is out and link to the download."
      }
    >
      <Row label={`Shortty ${status.current}`} description={updateStatusText(status)} control={button} />
      {selfUpdate && (
        <SwitchRow
          label="Download updates automatically"
          description="Off: only tell me when a new version is out."
          checked={settings.autoUpdate}
          onChange={(v) => void onUpdate('autoUpdate', v)}
        />
      )}
    </Section>
  );
}

export function GeneralTab({ settings, onUpdate }: GeneralTabProps) {
  const platform = keyPlatform();
  const mac = platform === 'darwin';
  const trayName = mac ? 'menu bar' : 'system tray';
  const layout = useKeyboardLayout();
  const [pendingHide, setPendingHide] = useState<VisibilityKey | null>(null);
  const shortcutLabelId = useId();

  const handleVisibilityToggle = (key: VisibilityKey, newValue: boolean) => {
    const otherKey: VisibilityKey = key === 'showDockIcon' ? 'showMenuBar' : 'showDockIcon';
    // The Dock toggle only exists on macOS; elsewhere only the menu bar counts.
    const otherVisible = mac ? settings[otherKey] : false;
    if (!newValue && !otherVisible) {
      setPendingHide(key);
      return;
    }
    void onUpdate(key, newValue);
  };

  const confirmHide = () => {
    if (pendingHide) void onUpdate(pendingHide, false);
    setPendingHide(null);
  };

  // Main registers the new shortcut before saving it and returns an error
  // (keeping the old one) when another app or macOS already owns it.
  const saveShortcut = async (accelerator: string): Promise<string | null> => {
    const result = await onUpdate('globalShortcut', accelerator);
    if (result.success) return null;
    const wanted = acceleratorToGlyphs(accelerator, platform, layout).join('');
    const kept = acceleratorToGlyphs(settings.globalShortcut, platform, layout).join('');
    return `Couldn't register ${wanted}. Another app or a system shortcut already uses it. Shortty kept ${kept}.`;
  };

  return (
    <div className="pf-pane">
      <PaneHeader title="General" />

      <Section label="Startup and visibility">
        <SwitchRow
          label="Launch at login"
          description="Start Shortty when you log in."
          checked={settings.launchAtLogin}
          onChange={(v) => void onUpdate('launchAtLogin', v)}
        />
        {mac && (
          <SwitchRow
            label="Show in Dock"
            description="Keep the Shortty icon in the Dock."
            checked={settings.showDockIcon}
            onChange={(v) => handleVisibilityToggle('showDockIcon', v)}
          />
        )}
        <SwitchRow
          label={`Show in ${trayName}`}
          description={`Add a Shortty icon to the ${trayName}.`}
          checked={settings.showMenuBar}
          onChange={(v) => handleVisibilityToggle('showMenuBar', v)}
        />
        <SwitchRow
          label="Hide after copying"
          description="Close the launcher once a shortcut or command is copied."
          checked={settings.dismissAfterCopy}
          onChange={(v) => void onUpdate('dismissAfterCopy', v)}
        />
        <Row
          label="Start blank"
          description="When a reopened launcher clears its search instead of showing the last screen."
          control={
            <Segmented
              label="Start blank"
              value={settings.resetLauncher}
              options={RESETS}
              onChange={(v) => void onUpdate('resetLauncher', v)}
            />
          }
        />
      </Section>

      <Section label="Activation">
        <Row
          label="Activation shortcut"
          labelId={shortcutLabelId}
          description="Opens and closes the launcher from any app."
          control={
            <ShortcutRecorder
              value={settings.globalShortcut}
              defaultValue={DEFAULT_SETTINGS.globalShortcut}
              platform={platform}
              layout={layout}
              onSave={saveShortcut}
              labelledBy={shortcutLabelId}
            />
          }
        />
      </Section>

      <Section
        label="Appearance"
        footer={`Position is where the launcher opens. System appearance follows ${mac ? 'macOS' : 'the system'} light and dark mode.`}
      >
        <Row
          label="Position"
          control={
            <Segmented
              label="Position"
              value={settings.windowPosition}
              options={POSITIONS}
              onChange={(v) => void onUpdate('windowPosition', v)}
            />
          }
        />
        <Row
          label="Appearance"
          control={
            <Segmented
              label="Appearance"
              value={settings.theme}
              options={THEMES}
              onChange={(v) => void onUpdate('theme', v)}
            />
          }
        />
      </Section>

      <UpdatesSection settings={settings} onUpdate={onUpdate} />

      {pendingHide && (
        <div
          className="pf-sheet-backdrop"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPendingHide(null);
          }}
        >
          <div
            className="pf-sheet"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pf-hide-title"
            aria-describedby="pf-hide-body"
          >
            <div className="pf-sheet-icon" aria-hidden="true">
              <Keycaps keys={acceleratorToGlyphs(settings.globalShortcut, platform, layout)} />
            </div>
            <h2 id="pf-hide-title" className="pf-sheet-title">
              Hide Shortty everywhere?
            </h2>
            <p id="pf-hide-body" className="pf-sheet-body">
              You&apos;ll only be able to open Shortty with the keyboard shortcut. Are you sure?
              To undo this later, quit Shortty and run{' '}
              <code>{resetSettingsCommand(window.electronAPI.platform)}</code>.
            </p>
            <div className="pf-sheet-actions">
              <button
                type="button"
                className="pf-button"
                autoFocus
                onClick={() => setPendingHide(null)}
              >
                Cancel
              </button>
              <button type="button" className="pf-button pf-button-primary" onClick={confirmHide}>
                Hide Icon
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
