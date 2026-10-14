interface KeyboardHelpProps {
  /** Close on a click outside the sheet. Keys are handled by the panel (App). */
  onDismiss: () => void;
  /** Activation shortcut glyphs, e.g. ["⌘", "⇧", "Space"]. */
  hotkey?: string[];
}

const KEYS: { keys: string[]; description: string }[] = [
  { keys: ['↑', '↓'], description: 'Navigate results' },
  { keys: ['↩'], description: 'Copy, open a source or show all' },
  { keys: ['⇥'], description: 'Open command details' },
  { keys: ['esc'], description: 'Clear, go back or close' },
  { keys: ['>'], description: 'Search commands only (prefix mode)' },
];

/**
 * Keyboard help sheet (SCREENS §3). Any key closes it; the panel's keydown
 * handler does that, so the "?" that opened it can't also close it.
 */
export function KeyboardHelp({ onDismiss, hotkey }: KeyboardHelpProps) {
  const rows = hotkey?.length
    ? [...KEYS, { keys: hotkey, description: 'Show or hide Shortty' }]
    : KEYS;
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts help"
      onMouseDown={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="w-[340px] rounded-[14px] border border-sheet-border bg-sheet px-5 pb-4 pt-4 shadow-[0_12px_40px_rgba(0,0,0,0.28)]">
        <h2 className="mb-3 text-[13px] font-semibold text-fg">Keyboard Shortcuts</h2>
        <dl className="space-y-2">
          {rows.map(({ keys, description }) => (
            <div key={description} className="flex items-center justify-between gap-4">
              <dt className="text-[13px] text-fg-2">{description}</dt>
              <dd className="flex shrink-0 gap-1">
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-center text-[11px] text-fg-4">Press any key to close</p>
      </div>
    </div>
  );
}
