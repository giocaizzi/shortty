import type { ReactNode } from 'react';

export interface FooterHint {
  label: string;
  keys: string[];
}

interface PanelFooterProps {
  /** Status on the left: copy confirmation, current source, enrichment source. */
  status?: ReactNode;
  /** What the keys do for the selected row, right-aligned. */
  hints: FooterHint[];
}

export function PanelFooter({ status, hints }: PanelFooterProps) {
  return (
    <div
      data-testid="panel-footer"
      className="flex h-9 shrink-0 items-center gap-4 border-t border-separator px-[18px] text-[12px] text-fg-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate" aria-live="polite">
        {status}
      </div>
      {hints.map(({ label, keys }) => (
        <span key={label} className="flex shrink-0 items-center gap-1.5">
          <span>{label}</span>
          <span className="flex gap-0.5">
            {keys.map((k) => (
              <kbd key={k} className="kbd-sm">
                {k}
              </kbd>
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}
