import { useEffect, useRef, type ReactNode, type KeyboardEvent, type MouseEvent } from 'react';

interface LauncherPanelProps {
  children: ReactNode;
  onKeyDown: (e: KeyboardEvent) => void;
  onMouseDown?: (e: MouseEvent) => void;
  onClick?: (e: MouseEvent) => void;
  /** Play the hide animation (a dismiss started by the renderer). */
  exiting?: boolean;
}

/**
 * Panel root. The window is reused between shows, so the show animation is
 * restarted on every `window:shown` instead of running once at mount.
 */
export function LauncherPanel({ children, onKeyDown, onMouseDown, onClick, exiting }: LauncherPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    return api.onWindowShown(() => {
      const el = ref.current;
      if (!el) return;
      el.classList.remove('panel-enter', 'panel-exit');
      // Force a style flush so re-adding the class restarts the animation.
      void el.offsetWidth;
      el.classList.add('panel-enter');
    });
  }, []);

  return (
    <div
      ref={ref}
      className={`panel-bg relative flex h-screen w-screen flex-col overflow-hidden ${
        exiting ? 'panel-exit' : 'panel-enter'
      }`}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onClick={onClick}
      role="dialog"
      aria-label="Shortty — Keybinding Search"
    >
      {children}
    </div>
  );
}
