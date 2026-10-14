import { useEffect } from 'react';

interface KeyboardHelpProps {
  onDismiss: () => void;
}

const SHORTCUTS = [
  { keys: '↑ ↓', description: 'Navigate results' },
  { keys: 'Enter', description: 'Copy / drill into source' },
  { keys: 'Tab / →', description: 'Drill into command details' },
  { keys: '← / Backspace', description: 'Go back (when input empty)' },
  { keys: 'Esc', description: 'Clear search / go back / dismiss' },
  { keys: '> prefix', description: 'Search commands only' },
  { keys: '?', description: 'Toggle this help' },
] as const;

export function KeyboardHelp({ onDismiss }: KeyboardHelpProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts help"
    >
      <div className="mx-8 w-full max-w-xs rounded-xl border border-white/[0.06] bg-black/80 p-5 backdrop-blur-lg">
        <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-widest text-white/30">
          Keyboard Shortcuts
        </h2>
        <div className="space-y-2.5">
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={keys} className="flex items-center justify-between">
              <span className="text-[12px] text-white/45">{description}</span>
              <kbd className="text-[11px]">{keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
