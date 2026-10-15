import { BrowserWindow } from 'electron';
import path from 'node:path';

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

export function openPreferencesWindow(): void {
  if (preferencesWindow && !preferencesWindow.isDestroyed()) {
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
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const { devUrl, file } = preferencesLocation();
  if (devUrl) {
    preferencesWindow.loadURL(devUrl);
  } else {
    preferencesWindow.loadFile(file);
  }

  preferencesWindow.on('closed', () => {
    preferencesWindow = null;
  });
}
