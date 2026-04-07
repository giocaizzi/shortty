import type { AppSettings, SearchSettings } from '../../../shared/settings';

interface SearchTabProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => Promise<{ success: boolean; error?: string }>;
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function SliderField({ label, value, min, max, step, onChange }: SliderFieldProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
        {label}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-28 accent-[var(--accent)]"
        />
        <span
          className="text-xs font-mono w-8 text-right"
          style={{ color: 'var(--text-secondary)' }}
        >
          {value.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

export function SearchTab({ settings, onUpdate }: SearchTabProps) {
  const updateSearch = (key: keyof SearchSettings, value: number) => {
    onUpdate('search', { ...settings.search, [key]: value });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Search
      </h2>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Fine-tune how search results are ranked
      </div>

      <div
        className="p-4 rounded-lg space-y-4"
        style={{ background: 'var(--bg-secondary)' }}
      >
        <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          Field Weights
        </div>
        <SliderField
          label="Shortcut key"
          value={settings.search.keyWeight}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateSearch('keyWeight', v)}
        />
        <SliderField
          label="Command name"
          value={settings.search.commandWeight}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateSearch('commandWeight', v)}
        />
        <SliderField
          label="Source app"
          value={settings.search.sourceWeight}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateSearch('sourceWeight', v)}
        />
        <SliderField
          label="Context"
          value={settings.search.contextWeight}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateSearch('contextWeight', v)}
        />
      </div>

      <div
        className="p-4 rounded-lg space-y-4"
        style={{ background: 'var(--bg-secondary)' }}
      >
        <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          Fuzziness
        </div>
        <SliderField
          label="Threshold"
          value={settings.search.threshold}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateSearch('threshold', v)}
        />
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Lower values require closer matches. 0 = exact match only.
        </div>
      </div>
    </div>
  );
}
