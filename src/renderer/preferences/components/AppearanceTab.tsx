import type { AppSettings } from '../../../shared/settings';

interface AppearanceTabProps {
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

export function AppearanceTab({ settings, onUpdate }: AppearanceTabProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Appearance
      </h2>

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
    </div>
  );
}
