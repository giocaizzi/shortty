import { useId, type ReactNode } from 'react';

/** Page title shown in the toolbar strip, level with the traffic lights. */
export function PaneHeader({ title }: { title: string }) {
  return <h1 className="pf-pane-title">{title}</h1>;
}

/** An inset, rounded group of rows (System Settings style). */
export function Section({
  title,
  footer,
  children,
  dimmed = false,
  label,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
  dimmed?: boolean;
  label?: string;
}) {
  const id = useId();
  return (
    <section
      className="pf-section"
      aria-labelledby={title ? id : undefined}
      aria-label={title ? undefined : label}
    >
      {title && (
        <h2 id={id} className="pf-section-title">
          {title}
        </h2>
      )}
      <div className={`pf-group${dimmed ? ' pf-group-dimmed' : ''}`}>{children}</div>
      {footer && <div className="pf-section-footer">{footer}</div>}
    </section>
  );
}

/** One row: label and optional description on the left, control on the right. */
export function Row({
  label,
  description,
  control,
  labelId,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  labelId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="pf-row">
      <div className="pf-row-main">
        <div className="pf-row-text">
          <div className="pf-row-label" id={labelId}>
            {label}
          </div>
          {description && <div className="pf-row-description">{description}</div>}
        </div>
        {control && <div className="pf-row-control">{control}</div>}
      </div>
      {children}
    </div>
  );
}

/** A labelled on/off switch row. */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Row
      label={label}
      labelId={id}
      description={description}
      control={
        <Switch checked={checked} onChange={onChange} labelledBy={id} disabled={disabled} />
      }
    />
  );
}

export function Switch({
  checked,
  onChange,
  labelledBy,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={label}
      disabled={disabled}
      className="pf-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="pf-switch-thumb" />
    </button>
  );
}

/** Segmented control backed by native radio inputs (arrow keys work). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <div className="pf-segmented" role="radiogroup" aria-label={label}>
      {options.map((opt) => (
        <label key={opt.value} className="pf-segment">
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

export function Keycaps({ keys }: { keys: string[] }) {
  return (
    <span className="pf-keycaps">
      {keys.map((k, i) => (
        <kbd key={`${i}-${k}`} className="pf-keycap">
          {k}
        </kbd>
      ))}
    </span>
  );
}

export type Tone = 'ok' | 'warn' | 'error' | 'info' | 'muted';

/** Small coloured status pill. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pf-badge pf-tone-${tone}`}>{children}</span>;
}

/** Inline message under a control. */
export function Message({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={`pf-message pf-tone-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
