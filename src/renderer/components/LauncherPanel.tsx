import type { ReactNode, KeyboardEvent } from 'react';

interface LauncherPanelProps {
  children: ReactNode;
  onKeyDown: (e: KeyboardEvent) => void;
}

export function LauncherPanel({ children, onKeyDown }: LauncherPanelProps) {
  return (
    <div
      className="panel-enter panel-bg flex h-screen w-screen items-start justify-center"
      onKeyDown={onKeyDown}
    >
      <div
        className="
          flex h-full w-full flex-col overflow-hidden
        "
        role="dialog"
        aria-label="Shortty — Keybinding Search"
      >
        {children}
      </div>
    </div>
  );
}
