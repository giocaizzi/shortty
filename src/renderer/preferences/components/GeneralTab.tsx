import { useState } from 'react';
import type { AppSettings } from '../../../shared/settings';

interface GeneralTabProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => Promise<{ success: boolean; error?: string }>;
}

const THEMES: { value: AppSettings['theme']; label: string; description: string }[] = [
  { value: 'system', label: 'System', description: 'Follow macOS appearance' },
  { value: 'light', label: 'Light', description: 'Always use light theme' },
  { value: 'dark', label: 'Dark', description: 'Always use dark theme' },
];

const POSITIONS: {
  value: AppSettings['windowPosition'];
  label: string;
  description: string;
}[] = [
  {
    value: 'top-center',
    label: 'Top Center',
    description: 'Centered horizontally, near the top of the screen',
  },
  {
    value: 'center',
    label: 'Center',
    description: 'Centered on the screen',
  },
  {
    value: 'mouse',
    label: 'Near Cursor',
    description: 'Appears near the mouse cursor position',
  },
];

export function GeneralTab({ settings, onUpdate }: GeneralTabProps) {
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [showBothOffDialog, setShowBothOffDialog] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<'showDockIcon' | 'showMenuBar' | null>(null);

  const handleShortcutKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    parts.push(key);

    const accelerator = parts.join('+');
    setRecordingShortcut(false);

    onUpdate('globalShortcut', accelerator).then((result) => {
      if (!result.success) {
        setShortcutError(result.error ?? 'Shortcut is already in use');
      } else {
        setShortcutError(null);
      }
    });
  };

  const handleVisibilityToggle = (key: 'showDockIcon' | 'showMenuBar', newValue: boolean) => {
    const otherKey = key === 'showDockIcon' ? 'showMenuBar' : 'showDockIcon';
    if (!newValue && !settings[otherKey]) {
      setPendingToggle(key);
      setShowBothOffDialog(true);
      return;
    }
    onUpdate(key, newValue);
  };

  const confirmBothOff = () => {
    if (pendingToggle) {
      onUpdate(pendingToggle, false);
    }
    setShowBothOffDialog(false);
    setPendingToggle(null);
  };

  const cancelBothOff = () => {
    setShowBothOffDialog(false);
    setPendingToggle(null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        General
      </h2>

      {/* Launch at Login */}
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Launch at Login
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Start Shortty when you log in
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.launchAtLogin}
          onChange={(e) => onUpdate('launchAtLogin', e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>

      {/* Show in Dock */}
      {process.platform === 'darwin' && (
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Show in Dock
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Display Shortty icon in the macOS Dock
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.showDockIcon}
            onChange={(e) => handleVisibilityToggle('showDockIcon', e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
      )}

      {/* Show in Menu Bar */}
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Show in Menu Bar
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Display Shortty icon in the system menu bar
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.showMenuBar}
          onChange={(e) => handleVisibilityToggle('showMenuBar', e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>

      {/* Dismiss After Copy */}
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Dismiss After Copy
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Hide the window after copying a shortcut to clipboard
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.dismissAfterCopy}
          onChange={(e) => onUpdate('dismissAfterCopy', e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>

      {/* Global Shortcut */}
      <div>
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
          Activation Shortcut
        </div>
        <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          Global keyboard shortcut to toggle Shortty
        </div>
        <button
          type="button"
          onClick={() => setRecordingShortcut(true)}
          onKeyDown={recordingShortcut ? handleShortcutKeyDown : undefined}
          onBlur={() => setRecordingShortcut(false)}
          className="px-3 py-1.5 text-sm rounded-md border focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          style={{
            background: 'var(--bg-secondary)',
            borderColor: recordingShortcut ? 'var(--accent)' : 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {recordingShortcut
            ? 'Press shortcut...'
            : settings.globalShortcut.replace(/CommandOrControl/g, '\u2318').replace(/Shift/g, '\u21e7').replace(/Alt/g, '\u2325').replace(/\+/g, '')}
        </button>
        {shortcutError && (
          <div className="text-xs text-red-500 mt-1">{shortcutError}</div>
        )}
      </div>

      {/* Window Position */}
      <div>
        <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
          Window Position
        </div>
        <div className="space-y-2">
          {POSITIONS.map((pos) => (
            <label
              key={pos.value}
              className="flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors"
              style={{
                background:
                  settings.windowPosition === pos.value
                    ? 'var(--accent)'
                    : 'var(--bg-secondary)',
                borderColor:
                  settings.windowPosition === pos.value
                    ? 'var(--accent)'
                    : 'var(--border)',
                color:
                  settings.windowPosition === pos.value
                    ? '#ffffff'
                    : 'var(--text-primary)',
              }}
            >
              <input
                type="radio"
                name="windowPosition"
                value={pos.value}
                checked={settings.windowPosition === pos.value}
                onChange={() => onUpdate('windowPosition', pos.value)}
                className="sr-only"
              />
              <div>
                <div className="text-sm font-medium">{pos.label}</div>
                <div
                  className="text-xs"
                  style={{
                    color:
                      settings.windowPosition === pos.value
                        ? 'rgba(255,255,255,0.7)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {pos.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div>
        <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
          Theme
        </div>
        <div className="space-y-2">
          {THEMES.map((theme) => (
            <label
              key={theme.value}
              className="flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors"
              style={{
                background:
                  settings.theme === theme.value
                    ? 'var(--accent)'
                    : 'var(--bg-secondary)',
                borderColor:
                  settings.theme === theme.value
                    ? 'var(--accent)'
                    : 'var(--border)',
                color:
                  settings.theme === theme.value
                    ? '#ffffff'
                    : 'var(--text-primary)',
              }}
            >
              <input
                type="radio"
                name="theme"
                value={theme.value}
                checked={settings.theme === theme.value}
                onChange={() => onUpdate('theme', theme.value)}
                className="sr-only"
              />
              <div>
                <div className="text-sm font-medium">{theme.label}</div>
                <div
                  className="text-xs"
                  style={{
                    color:
                      settings.theme === theme.value
                        ? 'rgba(255,255,255,0.7)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {theme.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Both-off safety dialog */}
      {showBothOffDialog && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <div
            className="rounded-xl p-5 max-w-sm shadow-lg space-y-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Are you sure?
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              You&apos;ll only be able to access Shortty via the keyboard shortcut. Are you sure?
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelBothOff}
                className="px-3 py-1.5 text-sm rounded-md border"
                style={{
                  background: 'var(--bg-primary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBothOff}
                className="px-3 py-1.5 text-sm rounded-md text-white"
                style={{ background: 'var(--accent)' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
