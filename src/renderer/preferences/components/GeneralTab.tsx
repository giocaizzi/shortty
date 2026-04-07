import { useState } from 'react';
import type { AppSettings } from '../../../shared/settings';

interface GeneralTabProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => Promise<{ success: boolean; error?: string }>;
}

export function GeneralTab({ settings, onUpdate }: GeneralTabProps) {
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [recordingShortcut, setRecordingShortcut] = useState(false);

  const handleShortcutKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore modifier-only presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    // Map key names to Electron accelerator format
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
            onChange={(e) => onUpdate('showDockIcon', e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
      )}

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
            : settings.globalShortcut.replace(/CommandOrControl/g, '⌘').replace(/Shift/g, '⇧').replace(/Alt/g, '⌥').replace(/\+/g, '')}
        </button>
        {shortcutError && (
          <div className="text-xs text-red-500 mt-1">{shortcutError}</div>
        )}
      </div>
    </div>
  );
}
