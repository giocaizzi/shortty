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
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (PREFERENCES_WINDOW_VITE_DEV_SERVER_URL) {
    preferencesWindow.loadURL(PREFERENCES_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    preferencesWindow.loadFile(
      path.join(
        __dirname,
        `../renderer/${PREFERENCES_WINDOW_VITE_NAME}/index.html`,
      ),
    );
  }

  preferencesWindow.on('closed', () => {
    preferencesWindow = null;
  });
}
