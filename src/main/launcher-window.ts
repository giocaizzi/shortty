import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

/** Windows 11 22H2: the first build that draws system backdrop materials. */
const WINDOWS_BACKDROP_BUILD = 22621;

/**
 * The native material behind the launcher: vibrancy on macOS, acrylic on
 * Windows 11 22H2+ (`release` is os.release(), e.g. "10.0.22631"). Null
 * elsewhere: the renderer then paints a solid panel (SOLID_PANEL_CSS).
 */
export function launcherMaterial(
  platform: NodeJS.Platform,
  release: string,
): BrowserWindowConstructorOptions | null {
  if (platform === 'darwin') return { vibrancy: 'under-window', visualEffectState: 'active' };
  if (platform === 'win32' && Number(release.split('.')[2]) >= WINDOWS_BACKDROP_BUILD) {
    return { backgroundMaterial: 'acrylic' };
  }
  return null;
}

/** Without a native material the translucent panel tint would sit on nothing. */
export const SOLID_PANEL_CSS = '.panel-bg { background: var(--panel-solid); }';

/**
 * Give the just-shown launcher keyboard focus, so typing lands in the search
 * field and blur-to-hide can fire. macOS must activate the app first; on
 * Windows app.focus() would focus the app's first window (possibly
 * Preferences), so the launcher is raised itself instead.
 */
export function focusLauncher(
  win: BrowserWindow,
  platform: NodeJS.Platform,
  activateApp: () => void,
): void {
  if (platform === 'darwin') activateApp();
  if (platform === 'win32') win.moveTop();
  win.focus();
  win.webContents.focus();
}
