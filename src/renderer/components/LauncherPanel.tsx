import type { ReactNode, KeyboardEvent } from 'react';

interface LauncherPanelProps {
  children: ReactNode;
  onKeyDown: (e: KeyboardEvent) => void;
}

export function LauncherPanel({ children, onKeyDown }: LauncherPanelProps) {
  return (
    <div
      className="panel-enter flex h-screen w-screen items-start justify-center pt-0"
      onKeyDown={onKeyDown}
    >
      <div
        className="
          flex max-h-[500px] w-[680px] flex-col overflow-hidden
          rounded-2xl border border-white/18
          bg-[var(--glass-bg-light)]
          shadow-[var(--glass-shadow)]
          [backdrop-filter:var(--glass-blur)]
          [box-shadow:var(--glass-shadow),var(--glass-highlight)]
          dark:bg-[var(--glass-bg-dark)]
        "
        role="dialog"
        aria-label="Shortty — Keybinding Search"
      >
        {children}
      </div>
    </div>
  );
}
