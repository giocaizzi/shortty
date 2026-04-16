import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  nativeTheme,
  screen,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import log from './logger';
import { registerIpcHandlers } from './ipc';
import { ParserRegistry } from './parsers/registry';
import { startWatching, stopWatching, restartWatching } from './watcher';
import { getSettings, getSetting, setSetting, onSettingsChange } from './settings-store';
import { createTray, destroyTray } from './tray';
import { openPreferencesWindow } from './preferences-window';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { AppSettings } from '../shared/settings';
import { CommandsEngine } from './commands/engine';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let commandsEngine: CommandsEngine | null = null;
const parserRegistry = new ParserRegistry();

const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;

const WINDOW_WIDTH = 750;
const SEARCH_BAR_HEIGHT = 72;
const MAX_WINDOW_HEIGHT = 580;

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
  const { x, y } = getWindowPosition(WINDOW_WIDTH, MAX_WINDOW_HEIGHT);

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: SEARCH_BAR_HEIGHT,
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
    show: false,
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
    // Retry on connection refused — Vite dev server may not be ready yet
    let retries = 0;
    win.webContents.on('did-fail-load', (_event, errorCode) => {
      if (errorCode === -102 && retries < 10) { // ERR_CONNECTION_REFUSED
        retries++;
        setTimeout(() => win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL), 500);
      }
    });
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (isDev && process.env.DEVTOOLS === '1') {
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

  // Reposition and reset to compact search bar height
  const { x, y } = getWindowPosition(WINDOW_WIDTH, MAX_WINDOW_HEIGHT);
  mainWindow.setBounds({ x, y, width: WINDOW_WIDTH, height: SEARCH_BAR_HEIGHT });

  mainWindow.show();
  app.focus({ steal: true });
  mainWindow.focus();
  mainWindow.webContents.focus();
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
  const registered = globalShortcut.register(accelerator, toggleWindow);
  if (registered) {
    log.info(`Global shortcut registered: ${accelerator}`);
  } else {
    log.warn(`Failed to register global shortcut: ${accelerator}`);
  }
  return registered;
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
      log.info(`Theme changed: ${oldSettings.theme} -> ${newSettings.theme}`);
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
      log.info(`Global shortcut changing: ${oldSettings.globalShortcut} -> ${newSettings.globalShortcut}`);
      globalShortcut.unregister(oldSettings.globalShortcut);
      const registered = registerGlobalShortcut(newSettings.globalShortcut);
      if (!registered) {
        // Revert to old shortcut if new one fails
        log.warn(`Reverting to previous shortcut: ${oldSettings.globalShortcut}`);
        registerGlobalShortcut(oldSettings.globalShortcut);
        setSetting('globalShortcut', oldSettings.globalShortcut);
      }
    }

    // Commands engine toggle
    if (newSettings.commandsEnabled !== oldSettings.commandsEnabled) {
      log.info(`Commands engine ${newSettings.commandsEnabled ? 'enabled' : 'disabled'}`);
      if (newSettings.commandsEnabled && !commandsEngine) {
        commandsEngine = new CommandsEngine(app.getPath('userData'));
        commandsEngine.onUpdate((updated) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.COMMANDS_ON_UPDATE, updated);
          }
        });
        commandsEngine.initialize();
      } else if (!newSettings.commandsEnabled && commandsEngine) {
        commandsEngine.stop();
        commandsEngine = null;
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

ipcMain.on(IPC_CHANNELS.SET_WINDOW_HEIGHT, (_event, height: number) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const clamped = Math.min(Math.max(height, SEARCH_BAR_HEIGHT), MAX_WINDOW_HEIGHT);
  const [x, y] = mainWindow.getPosition();
  mainWindow.setBounds({ x, y, width: WINDOW_WIDTH, height: clamped }, true);
});

app.on('ready', async () => {
  log.info('App starting');
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

  // Initialize commands engine if enabled
  if (getSetting('commandsEnabled')) {
    try {
      commandsEngine = new CommandsEngine(app.getPath('userData'));
      commandsEngine.onUpdate((updated) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.COMMANDS_ON_UPDATE, updated);
        }
      });
      await commandsEngine.initialize();
      log.info(`Commands engine initialized with ${commandsEngine.getAll().length} commands`);
    } catch (err) {
      log.error('Commands engine failed to initialize', err);
      commandsEngine = null;
    }
  }

  // Register IPC handlers
  registerIpcHandlers(parserRegistry, { openPreferences }, () => commandsEngine);

  // Initialize parsers (respecting disabled list and path overrides) and start file watching
  const disabledParsers = getSetting('disabledParsers');
  const pathOverrides = getSetting('sourcePathOverrides');
  try {
    await parserRegistry.initialize(disabledParsers, pathOverrides);
  } catch (err) {
    log.error('Parser registry initialization failed', err);
  }
  startWatching(parserRegistry, mainWindow);

  log.info('App ready');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopWatching();
  destroyTray();
  commandsEngine?.stop();
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
