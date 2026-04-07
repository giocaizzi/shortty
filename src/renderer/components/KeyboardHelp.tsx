import { useEffect } from 'react';

interface KeyboardHelpProps {
  onDismiss: () => void;
}

const SHORTCUTS = [
  { keys: '↑ ↓', description: 'Navigate results' },
  { keys: 'Enter', description: 'Copy / drill into source' },
  { keys: 'Tab / →', description: 'Drill into command details' },
  { keys: 'Esc', description: 'Go back / dismiss' },
  { keys: '> prefix', description: 'Search commands only' },
  { keys: '?', description: 'Toggle this help' },
] as const;

export function KeyboardHelp({ onDismiss }: KeyboardHelpProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-8 w-full max-w-xs rounded-lg border border-white/10 bg-black/80 p-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Keyboard Shortcuts
        </h2>
        <div className="space-y-2">
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={keys} className="flex items-center justify-between">
              <span className="text-[12px] text-white/50">{description}</span>
              <kbd className="text-[11px]">{keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
