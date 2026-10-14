import { useEffect, useId, useState } from 'react';
import type { AppSettings, SearchSettings, ResultLimits } from '../../../shared/settings';
import type { UpdateSetting } from '../hooks/useSettings';
import { PaneHeader, Row, Section, SwitchRow } from './controls';

interface SearchTabProps {
  settings: AppSettings;
  onUpdate: UpdateSetting;
}

function SliderRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <Row
      label={label}
      labelId={id}
      description={description}
      control={
        <div className="pf-slider">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value}
            aria-labelledby={id}
            onChange={(e) => onChange(Math.round(parseFloat(e.target.value) * 100) / 100)}
          />
          <output className="pf-slider-value">{value.toFixed(2)}</output>
        </div>
      }
    />
  );
}

/** Integer field that commits on blur or Enter, clamped to [min, max]. */
function NumberRow({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <Row
      label={label}
      labelId={id}
      description={description}
      control={
        <input
          type="number"
          className="pf-text-field pf-number-field"
          min={min}
          max={max}
          value={draft}
          aria-labelledby={id}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      }
    />
  );
}

export function SearchTab({ settings, onUpdate }: SearchTabProps) {
  const updateSearch = (key: keyof SearchSettings, value: number) => {
    void onUpdate('search', { ...settings.search, [key]: value });
  };

  const updateResultLimits = (key: keyof ResultLimits, value: number) => {
    void onUpdate('resultLimits', { ...settings.resultLimits, [key]: value });
  };

  return (
    <div className="pf-pane">
      <PaneHeader title="Search" />

      <Section label="Command prefix">
        <SwitchRow
          label="Command prefix mode"
          description="Search only shortcuts by default. Start a query with > to search commands."
          checked={settings.commandPrefixMode}
          onChange={(v) => void onUpdate('commandPrefixMode', v)}
        />
      </Section>

      <Section
        title="Shortcut ranking"
        footer="Fields with a higher weight count more when ordering shortcut results."
      >
        <SliderRow
          label="Key combination"
          value={settings.search.keyWeight}
          onChange={(v) => updateSearch('keyWeight', v)}
        />
        <SliderRow
          label="Shortcut name"
          value={settings.search.commandWeight}
          onChange={(v) => updateSearch('commandWeight', v)}
        />
        <SliderRow
          label="App name"
          value={settings.search.sourceWeight}
          onChange={(v) => updateSearch('sourceWeight', v)}
        />
        <SliderRow
          label="Context"
          value={settings.search.contextWeight}
          onChange={(v) => updateSearch('contextWeight', v)}
        />
      </Section>

      <Section footer="Lower values only match close spellings. 0 matches exact text only.">
        <SliderRow
          label="Fuzziness"
          value={settings.search.threshold}
          onChange={(v) => updateSearch('threshold', v)}
        />
      </Section>

      <Section title="Results per section">
        <NumberRow
          label="Sources"
          value={settings.resultLimits.sources}
          min={1}
          max={20}
          onChange={(v) => updateResultLimits('sources', v)}
        />
        <NumberRow
          label="Shortcuts"
          value={settings.resultLimits.shortcuts}
          min={1}
          max={50}
          onChange={(v) => updateResultLimits('shortcuts', v)}
        />
        <NumberRow
          label="Commands"
          value={settings.resultLimits.commands}
          min={1}
          max={50}
          onChange={(v) => updateResultLimits('commands', v)}
        />
      </Section>
    </div>
  );
}
