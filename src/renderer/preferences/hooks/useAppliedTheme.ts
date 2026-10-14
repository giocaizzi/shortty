import { useEffect, useState } from 'react';
import type { AppSettings } from '../../../shared/settings';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

/**
 * Apply the Theme setting to this window as data-theme="light|dark" on <html>.
 * "system" follows prefers-color-scheme and updates when macOS switches.
 */
export function useAppliedTheme(theme: AppSettings['theme'] | undefined): void {
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = theme === 'dark' || (theme !== 'light' && systemDark) ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);
}
