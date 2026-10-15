import { BrowserWindow } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS } from '../shared/ipc-channels';

declare const PREFERENCES_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const PREFERENCES_WINDOW_VITE_NAME: string;

let preferencesWindow: BrowserWindow | null = null;

/**
 * Where the preferences page is served from: the Vite dev server in
 * development, else the built preferences.html (built by
 * vite.preferences.config.mts, not the launcher's index.html).
 */
export function preferencesLocation(): { devUrl?: string; file: string } {
  return {
    devUrl: PREFERENCES_WINDOW_VITE_DEV_SERVER_URL
      ? new URL('preferences.html', `${PREFERENCES_WINDOW_VITE_DEV_SERVER_URL}/`).toString()
      : undefined,
    file: path.join(__dirname, `../renderer/${PREFERENCES_WINDOW_VITE_NAME}/preferences.html`),
  };
}

/** Open (or focus) Preferences, optionally on a tab such as `about`. */
export function openPreferencesWindow(tab?: string): void {
  if (preferencesWindow && !preferencesWindow.isDestroyed()) {
    if (tab) preferencesWindow.webContents.send(IPC_CHANNELS.PREFS_SHOW_TAB, tab);
    preferencesWindow.focus();
    return;
  }

  preferencesWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'Shortty Preferences',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 } }
      : // Native frame; the File/Edit menu stays reachable with Alt and keeps its accelerators.
        { autoHideMenuBar: true }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const { devUrl, file } = preferencesLocation();
  // A new window starts on the tab named in the URL hash.
  if (devUrl) {
    preferencesWindow.loadURL(tab ? `${devUrl}#${tab}` : devUrl);
  } else {
    preferencesWindow.loadFile(file, tab ? { hash: tab } : undefined);
  }

  preferencesWindow.on('closed', () => {
    preferencesWindow = null;
  });
}
