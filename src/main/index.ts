import {
  app,
  BrowserWindow,
  globalShortcut,
  nativeTheme,
  screen,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
import { ParserRegistry } from './parsers/registry';
import { startWatching, stopWatching, restartWatching } from './watcher';
import { getSettings, getSetting, setSetting, onSettingsChange } from './settings-store';
import { createTray, destroyTray } from './tray';
import { openPreferencesWindow } from './preferences-window';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { AppSettings } from '../shared/settings';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
const parserRegistry = new ParserRegistry();

const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;

function getWindowPosition(
  windowWidth: number,
  windowHeight: number,
): { x: number; y: number } {
  const position = getSetting('windowPosition');

  if (position === 'mouse') {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x: dx, y: dy, width: dw, height: dh } = display.workArea;

    return {
      x: Math.min(
        Math.max(cursor.x - windowWidth / 2, dx),
        dx + dw - windowWidth,
      ),
      y: Math.min(
        Math.max(cursor.y - windowHeight / 2, dy),
        dy + dh - windowHeight,
      ),
    };
  }

  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  if (position === 'center') {
    return {
      x: Math.round((screenWidth - windowWidth) / 2),
      y: Math.round((screenHeight - windowHeight) / 2),
    };
  }

  // top-center (default)
  return {
    x: Math.round((screenWidth - windowWidth) / 2),
    y: Math.round(screenHeight * 0.2),
  };
}

function createWindow(): BrowserWindow {
  const windowWidth = 680;
  const windowHeight = 500;
  const { x, y } = getWindowPosition(windowWidth, windowHeight);

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Hide from mission control
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setWindowButtonVisibility(false);
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Dismiss on blur (skip in dev so DevTools doesn't cause hiding)
  if (!isDev) {
    win.on('blur', () => {
      hideWindow();
    });
  }

  return win;
}

function showWindow(): void {
  if (!mainWindow) return;

  // Reposition window each time it's shown
  const windowWidth = 680;
  const windowHeight = 500;
  const { x, y } = getWindowPosition(windowWidth, windowHeight);
  mainWindow.setPosition(x, y);

  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('window:shown');
}

function hideWindow(): void {
  if (!mainWindow) return;
  mainWindow.hide();
  mainWindow.webContents.send('window:hidden');
}

function toggleWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    hideWindow();
  } else {
    showWindow();
  }
}

function registerGlobalShortcut(accelerator: string): boolean {
  return globalShortcut.register(accelerator, toggleWindow);
}

function broadcastSettingsChange(settings: AppSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.SETTINGS_ON_CHANGE, settings);
    }
  }
}

function applyInitialSettings(): void {
  const settings = getSettings();

  // Theme
  nativeTheme.themeSource = settings.theme;

  // Dock visibility (macOS)
  if (process.platform === 'darwin' && app.dock) {
    if (settings.showDockIcon) {
      app.dock.show();
    } else {
      app.dock.hide();
    }
  }

  // Launch at login
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtLogin,
    openAsHidden: true,
  });

  // Global shortcut
  registerGlobalShortcut(settings.globalShortcut);
}

function setupSettingsChangeListener(): void {
  onSettingsChange((newSettings, oldSettings) => {
    // Theme
    if (newSettings.theme !== oldSettings.theme) {
      nativeTheme.themeSource = newSettings.theme;
    }

    // Dock visibility (macOS)
    if (
      newSettings.showDockIcon !== oldSettings.showDockIcon &&
      process.platform === 'darwin' &&
      app.dock
    ) {
      if (newSettings.showDockIcon) {
        app.dock.show();
      } else {
        app.dock.hide();
      }
    }

    // Launch at login
    if (newSettings.launchAtLogin !== oldSettings.launchAtLogin) {
      app.setLoginItemSettings({
        openAtLogin: newSettings.launchAtLogin,
        openAsHidden: true,
      });
    }

    // Global shortcut
    if (newSettings.globalShortcut !== oldSettings.globalShortcut) {
      globalShortcut.unregister(oldSettings.globalShortcut);
      const registered = registerGlobalShortcut(newSettings.globalShortcut);
      if (!registered) {
        // Revert to old shortcut if new one fails
        registerGlobalShortcut(oldSettings.globalShortcut);
        setSetting('globalShortcut', oldSettings.globalShortcut);
      }
    }

    // Parser enable/disable or path overrides change
    if (
      JSON.stringify(newSettings.disabledParsers) !==
        JSON.stringify(oldSettings.disabledParsers) ||
      JSON.stringify(newSettings.sourcePathOverrides) !==
        JSON.stringify(oldSettings.sourcePathOverrides)
    ) {
      parserRegistry
        .updateActiveParsers(newSettings.disabledParsers, newSettings.sourcePathOverrides)
        .then(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            restartWatching(parserRegistry, mainWindow);
          }
        });
    }

    // Broadcast to all renderer windows
    broadcastSettingsChange(newSettings);
  });
}

function openPreferences(): void {
  openPreferencesWindow();
}

app.on('ready', async () => {
  mainWindow = createWindow();

  // Apply initial settings (shortcut, dock, theme, login items)
  applyInitialSettings();

  // Listen for settings changes
  setupSettingsChangeListener();

  // System tray
  createTray({
    onToggle: toggleWindow,
    onPreferences: openPreferences,
  });

  // Register IPC handlers
  registerIpcHandlers(parserRegistry, { openPreferences });

  // Initialize parsers (respecting disabled list and path overrides) and start file watching
  const disabledParsers = getSetting('disabledParsers');
  const pathOverrides = getSetting('sourcePathOverrides');
  await parserRegistry.initialize(disabledParsers, pathOverrides);
  startWatching(parserRegistry, mainWindow);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopWatching();
  destroyTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});
