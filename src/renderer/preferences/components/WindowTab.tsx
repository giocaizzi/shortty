import type { AppSettings } from '../../../shared/settings';

interface WindowTabProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => Promise<{ success: boolean; error?: string }>;
}

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

export function WindowTab({ settings, onUpdate }: WindowTabProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Window
      </h2>

      <div>
        <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
          Position
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
    </div>
  );
}
