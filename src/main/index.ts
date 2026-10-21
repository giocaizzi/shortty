// Must stay first: redirects app paths before settings-store reads them.
import { isE2E, exposeE2EControls } from './e2e';
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  autoUpdater,
  nativeTheme,
  net,
  screen,
  shell,
} from 'electron';
import path from 'node:path';
import os from 'node:os';
import started from 'electron-squirrel-startup';
import log from './logger';
import { registerIpcHandlers } from './ipc';
import { ParserRegistry } from './parsers/registry';
import { startWatching, stopWatching, restartWatching } from './watcher';
import {
  getSettings,
  getSetting,
  onSettingsChange,
  repairSettings,
  resetSettings,
} from './settings-store';
import { syncTray, destroyTray, isTrayVisible, setTrayUpdate } from './tray';
import { openPreferencesWindow, preferencesLocation } from './preferences-window';
import { guardWebContents, type AppLocations } from './navigation-guard';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { AppSettings } from '../shared/settings';
import { CommandsEngine } from './commands/engine';
import {
  WINDOW_WIDTH,
  SEARCH_BAR_HEIGHT,
  computeWindowPosition,
  resizeBounds,
} from './window-geometry';
import { WindowHider } from './window-hider';
import { importLoginShellPath } from './shell-env';
import { buildAppMenuTemplate } from './app-menu';
import { focusLauncher, launcherMaterial, SOLID_PANEL_CSS } from './launcher-window';
import { loginItemSettings } from './login-item';
import { Updater, canAutoUpdate, fetchLatestVersion } from './updates';

// `shortty --reset-settings` (docs/spec.md §9.1 escape hatch): restore defaults and quit.
const resetRequested = process.argv.includes('--reset-settings');

// One Shortty per user data dir: a second launch shows the running panel
// instead of starting another tray, watcher set and commands engine.
const isPrimaryInstance = !started && app.requestSingleInstanceLock();

if (started) {
  app.quit();
} else if (resetRequested) {
  if (isPrimaryInstance) {
    resetSettings();
    log.info('Settings reset to defaults (--reset-settings)');
    app.exit(0);
  } else {
    log.error('--reset-settings: Shortty is running; quit it first');
    app.exit(1);
  }
} else if (!isPrimaryInstance) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let commandsEngine: CommandsEngine | null = null;
/** Set on before-quit: only then may the launcher window really close. */
let quitting = false;
const parserRegistry = new ParserRegistry();

const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;

const LAUNCHER_HTML = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);

// Every renderer (launcher, preferences) only ever shows the app's own pages.
const appLocations: AppLocations = {
  devOrigins: [MAIN_WINDOW_VITE_DEV_SERVER_URL, preferencesLocation().devUrl]
    .filter((u): u is string => !!u)
    .map((u) => new URL(u).origin),
  files: [LAUNCHER_HTML, preferencesLocation().file],
};
app.on('web-contents-created', (_event, contents) => {
  // App windows only: DevTools (development) runs its own devtools:// pages
  if (contents.getType() === 'window') guardWebContents(contents, appLocations);
});

/** Upper bound for the renderer's exit animation (80ms, docs/spec.md §10.9) plus IPC. */
const HIDE_ANIMATION_TIMEOUT_MS = 120;

const updater = new Updater({
  enabled: app.isPackaged && !isE2E,
  currentVersion: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  canAutoUpdate: () => canAutoUpdate(),
  fetchLatestVersion: () => fetchLatestVersion(net.fetch),
  autoUpdater,
  openExternal: (url) => void shell.openExternal(url),
  // quitAndInstall closes the windows before before-quit fires.
  beforeInstall: () => {
    quitting = true;
  },
  onStatus: (status) => {
    setTrayUpdate(status);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.UPDATES_ON_STATUS, status);
    }
  },
});

const trayCallbacks = {
  onToggle: () => toggleWindow(),
  onPreferences: () => openPreferences(),
  onAbout: () => openPreferences('about'),
  onInstallUpdate: () => updater.install(),
};

function launcherAlive(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

const hider = new WindowHider({
  timeoutMs: HIDE_ANIMATION_TIMEOUT_MS,
  requestExit: (id) => {
    launcherAlive()?.webContents.send(IPC_CHANNELS.WINDOW_WILL_HIDE, id);
  },
  hide: () => {
    const win = launcherAlive();
    if (!win) return;
    win.hide();
    win.webContents.send(IPC_CHANNELS.WINDOW_HIDDEN);
  },
});

/** Launcher position on the display under the cursor, per the windowPosition setting. */
function getWindowPosition(): { x: number; y: number } {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  return computeWindowPosition(getSetting('windowPosition'), cursor, display.workArea);
}

function createWindow(): BrowserWindow {
  const { x, y } = getWindowPosition();
  const material = launcherMaterial(process.platform, os.release());

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: SEARCH_BAR_HEIGHT,
    x,
    y,
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    ...material,
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
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Hide from mission control
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setWindowButtonVisibility(false);
  }
  if (!material) {
    win.webContents.on('dom-ready', () => void win.webContents.insertCSS(SOLID_PANEL_CSS));
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
    win.loadFile(LAUNCHER_HTML);
  }

  if (isDev && process.env.DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // The launcher lives for the whole session: a close request (⌘W, a
  // window-manager close) hides it instead, except while the app quits.
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    hideWindow();
  });

  // Dismiss on blur (skip in dev so DevTools doesn't cause hiding)
  if (!isDev) {
    win.on('blur', () => {
      hideWindow();
    });
  }

  return win;
}

function showWindow(): void {
  const win = launcherAlive();
  if (!win) return;
  // Showing again during the exit animation aborts the pending hide.
  hider.cancel();

  // Reposition on the display under the cursor. The height stays: the renderer
  // collapses it when it resets, and keeps it when it resumes its last screen.
  const { x, y } = getWindowPosition();
  win.setBounds({ x, y, width: WINDOW_WIDTH, height: win.getBounds().height });

  win.show();
  focusLauncher(win, process.platform, () => app.focus({ steal: true }));
  win.webContents.send(IPC_CHANNELS.WINDOW_SHOWN);
  commandsEngine?.onWindowShown();
}

/** Dismiss the launcher: the renderer plays its exit animation, then it hides. */
function hideWindow(): void {
  const win = launcherAlive();
  if (!win || !win.isVisible()) return;
  hider.hide();
  commandsEngine?.onWindowHidden();
}

function toggleWindow(): void {
  const win = launcherAlive();
  if (!win) return;
  if (win.isVisible() && !hider.hiding) {
    hideWindow();
  } else {
    showWindow();
  }
}

function registerGlobalShortcut(accelerator: string): boolean {
  let registered = false;
  try {
    registered = globalShortcut.register(accelerator, toggleWindow);
  } catch (err) {
    // Malformed accelerators throw instead of returning false
    log.warn(`Invalid global shortcut: ${accelerator}`, err);
  }
  if (registered) {
    log.info(`Global shortcut registered: ${accelerator}`);
  } else {
    log.warn(`Failed to register global shortcut: ${accelerator}`);
  }
  return registered;
}

/**
 * Swap the global shortcut before the new value is saved (SETTINGS_SET).
 * On failure the previous shortcut is re-registered and an error returned.
 */
function changeGlobalShortcut(accelerator: string): string | null {
  const current = getSetting('globalShortcut');
  if (accelerator === current || isE2E) return null;
  log.info(`Global shortcut changing: ${current} -> ${accelerator}`);
  globalShortcut.unregister(current);
  if (registerGlobalShortcut(accelerator)) return null;
  log.warn(`Keeping previous shortcut: ${current}`);
  registerGlobalShortcut(current);
  return `${accelerator} is already in use or is not a valid shortcut`;
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

  // Menu bar / system tray icon
  syncTray(settings.showMenuBar, trayCallbacks);

  // e2e runs must not register login items or grab the developer's hotkey
  if (isE2E) {
    log.info('E2E mode: skipping login item and global shortcut registration');
    return;
  }

  // Launch at login (only a packaged app: a dev run would register the bare Electron binary)
  if (app.isPackaged) {
    app.setLoginItemSettings(loginItemSettings(settings.launchAtLogin));
  }

  // Global shortcut
  registerGlobalShortcut(settings.globalShortcut);
}

function setupSettingsChangeListener(): void {
  onSettingsChange((newSettings, oldSettings) => {
    // A throw here would be an uncaught exception in the store's emitter
    try {
      applySettingsChange(newSettings, oldSettings);
    } catch (err) {
      log.error('Failed to apply settings change', err);
    }
    // Broadcast to all renderer windows
    broadcastSettingsChange(newSettings);
  });
}

function applySettingsChange(newSettings: AppSettings, oldSettings: AppSettings): void {
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

  // Menu bar / system tray icon
  if (newSettings.showMenuBar !== oldSettings.showMenuBar) {
    syncTray(newSettings.showMenuBar, trayCallbacks);
  }

  // Launch at login (never registered by e2e or dev runs)
  if (newSettings.launchAtLogin !== oldSettings.launchAtLogin && !isE2E && app.isPackaged) {
    app.setLoginItemSettings(loginItemSettings(newSettings.launchAtLogin));
  }

  // The global shortcut is applied by changeGlobalShortcut() before saving.

  if (newSettings.autoUpdate !== oldSettings.autoUpdate) {
    void updater.start(newSettings.autoUpdate, 0);
  }

  // Commands engine toggle
  if (newSettings.commandsEnabled !== oldSettings.commandsEnabled) {
    log.info(`Commands engine ${newSettings.commandsEnabled ? 'enabled' : 'disabled'}`);
    if (newSettings.commandsEnabled && !commandsEngine) {
      commandsEngine = createCommandsEngine();
      commandsEngine.initialize().catch((err) => {
        log.error('Commands engine failed to initialize', err);
      });
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
      .then((repathed) => {
        restartWatching(parserRegistry, launcherAlive);
        // A source pointed at another file keeps its id, so the launcher
        // (which reloads only when the source list changes) needs a push.
        const win = launcherAlive();
        for (const sourceId of repathed) {
          win?.webContents.send(IPC_CHANNELS.ON_UPDATE, {
            sourceId,
            keybindings: parserRegistry.getCachedBySource(sourceId),
          });
        }
      })
      .catch((err) => log.error('Failed to update active parsers', err));
  }
}

/**
 * Preferences → Commands → Rebuild index: re-detect and re-parse every
 * shortcut source, then drop the commands cache and scan PATH from scratch.
 */
async function rebuildIndex(): Promise<void> {
  log.info('Rebuilding index');
  for (const { id } of parserRegistry.getAllSources()) {
    const keybindings = await parserRegistry.parseSingleSource(id);
    launcherAlive()?.webContents.send(IPC_CHANNELS.ON_UPDATE, { sourceId: id, keybindings });
  }
  restartWatching(parserRegistry, launcherAlive);
  if (commandsEngine) {
    const commands = await commandsEngine.rebuild();
    launcherAlive()?.webContents.send(IPC_CHANNELS.COMMANDS_ON_UPDATE, commands);
  }
}

function openPreferences(tab?: string): void {
  openPreferencesWindow(tab);
}

// --- Launcher window IPC (renderer -> main) ---

function fromLauncher(event: Electron.IpcMainEvent): BrowserWindow | null {
  const win = launcherAlive();
  return win && event.sender === win.webContents ? win : null;
}

ipcMain.on(IPC_CHANNELS.SET_WINDOW_HEIGHT, (event, height: unknown) => {
  const win = fromLauncher(event);
  if (!win) return;
  const current = win.getBounds();
  const next = resizeBounds(current, height, screen.getDisplayMatching(current).workArea);
  if (!next) return;
  // Animate only a visible window (macOS); a hidden one just snaps.
  win.setBounds(next, win.isVisible());
});

ipcMain.on(IPC_CHANNELS.WINDOW_HIDE, (event) => {
  if (fromLauncher(event)) hideWindow();
});

ipcMain.on(IPC_CHANNELS.WINDOW_HIDE_READY, (event, id: unknown) => {
  if (fromLauncher(event) && typeof id === 'number') hider.ack(id);
});

function createCommandsEngine(): CommandsEngine {
  const engine = new CommandsEngine(app.getPath('userData'));
  engine.onUpdate((updated) => {
    launcherAlive()?.webContents.send(IPC_CHANNELS.COMMANDS_ON_UPDATE, updated);
  });
  return engine;
}

/** Load parsers (respecting disabled list and path overrides), then watch their files. */
async function initShortcuts(): Promise<void> {
  try {
    await parserRegistry.initialize(
      getSetting('disabledParsers'),
      getSetting('sourcePathOverrides'),
    );
  } catch (err) {
    log.error('Parser registry initialization failed', err);
  }
  startWatching(parserRegistry, launcherAlive);
}

async function initCommands(): Promise<void> {
  if (!getSetting('commandsEnabled')) return;
  try {
    commandsEngine = createCommandsEngine();
    await commandsEngine.initialize();
    log.info(`Commands engine initialized with ${commandsEngine.getAll().length} commands`);
  } catch (err) {
    log.error('Commands engine failed to initialize', err);
    commandsEngine = null;
  }
}

async function startup(): Promise<void> {
  log.info('App starting');

  // A hand-edited config.json must not make the app unusable: bad values
  // fall back to their defaults (per key) before anything reads them.
  const repaired = repairSettings();
  if (repaired.length > 0) log.warn(`Invalid settings reset to defaults: ${repaired.join(', ')}`);

  Menu.setApplicationMenu(Menu.buildFromTemplate(buildAppMenuTemplate(app.name, app.isPackaged, () => openPreferences(), () => openPreferences('about'))));

  // Environment setup that must finish before the engines read PATH/HOME
  // (e.g. importing the login-shell PATH) chains in here.
  // Finder/login launches only get launchd's minimal PATH; never rejects.
  const environmentReady: Promise<void> = importLoginShellPath();

  // Both engines load in parallel; neither promise rejects.
  const shortcutsReady = environmentReady.then(initShortcuts);
  const commandsReady = environmentReady.then(initCommands);

  // Register IPC before any await so an early renderer never hits
  // "No handler registered"; data handlers wait for the engines.
  registerIpcHandlers(
    parserRegistry,
    {
      openPreferences,
      changeGlobalShortcut,
      rebuildIndex,
      getUpdateStatus: () => updater.getStatus(),
      checkForUpdates: () => updater.check(),
      installUpdate: () => updater.install(),
    },
    () => commandsEngine,
    { shortcuts: shortcutsReady, commands: commandsReady },
  );

  mainWindow = createWindow();

  // Apply initial settings (theme, dock, menu bar, login item, shortcut)
  applyInitialSettings();
  setupSettingsChangeListener();
  void updater.start(getSetting('autoUpdate'));

  await Promise.all([shortcutsReady, commandsReady]);

  exposeE2EControls({
    show: showWindow,
    hide: hideWindow,
    toggle: toggleWindow,
    openPreferences,
    isTrayVisible,
  });

  log.info('App ready');
}

app.on('ready', () => {
  if (started || resetRequested || !isPrimaryInstance) return;
  void startup();
});

app.on('second-instance', () => {
  if (mainWindow) showWindow();
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('will-quit', () => {
  // A quit before ready (second instance, an early close) has nothing
  // registered, and globalShortcut throws before ready.
  if (app.isReady()) globalShortcut.unregisterAll();
  stopWatching();
  updater.stop();
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
