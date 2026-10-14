import { BrowserWindow } from 'electron';
import path from 'node:path';

declare const PREFERENCES_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const PREFERENCES_WINDOW_VITE_NAME: string;

let preferencesWindow: BrowserWindow | null = null;

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

  // The preferences renderer is built from preferences.html
  // (vite.preferences.config.mts), not the launcher's index.html.
  if (PREFERENCES_WINDOW_VITE_DEV_SERVER_URL) {
    preferencesWindow.loadURL(
      new URL('preferences.html', `${PREFERENCES_WINDOW_VITE_DEV_SERVER_URL}/`).toString(),
    );
  } else {
    preferencesWindow.loadFile(
      path.join(
        __dirname,
        `../renderer/${PREFERENCES_WINDOW_VITE_NAME}/preferences.html`,
      ),
    );
  }

  preferencesWindow.on('closed', () => {
    preferencesWindow = null;
  });
}
