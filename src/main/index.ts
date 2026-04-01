import { app, BrowserWindow, globalShortcut, screen } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
import { ParserRegistry } from './parsers/registry';
import { startWatching, stopWatching } from './watcher';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
const parserRegistry = new ParserRegistry();

function createWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  const windowWidth = 680;
  const windowHeight = 500;

  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.round((screenWidth - windowWidth) / 2),
    y: Math.round(screenHeight * 0.2),
    frame: false,
    transparent: true,
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

  // Dismiss on blur
  win.on('blur', () => {
    hideWindow();
  });

  return win;
}

function showWindow(): void {
  if (!mainWindow) return;
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

app.on('ready', async () => {
  mainWindow = createWindow();

  // Register global shortcut
  globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow);

  // Register IPC handlers
  registerIpcHandlers(parserRegistry);

  // Initialize parsers and start file watching
  await parserRegistry.initialize();
  startWatching(parserRegistry, mainWindow);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopWatching();
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

// Hide dock icon on macOS
if (process.platform === 'darwin') {
  app.dock?.hide();
}
