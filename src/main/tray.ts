import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;

interface TrayCallbacks {
  onToggle: () => void;
  onPreferences: () => void;
}

/**
 * macOS draws a monochrome template image in the menu bar; the Windows and
 * Linux trays show the full-colour app icon (ICO on Windows, which nativeImage
 * reads only there), readable on light and dark taskbars alike.
 */
function getTrayIconPath(): string {
  const file =
    process.platform === 'darwin'
      ? 'tray-iconTemplate.png'
      : process.platform === 'win32'
        ? 'icon.ico'
        : 'icon.png';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, file);
  }
  return path.join(app.getAppPath(), 'src/assets', file);
}

function createTray(callbacks: TrayCallbacks): void {
  if (tray) return;
  const icon = nativeImage.createFromPath(getTrayIconPath());

  tray = new Tray(icon);
  tray.setToolTip('Shortty');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide', click: callbacks.onToggle },
    { type: 'separator' },
    { label: 'Preferences...', click: callbacks.onPreferences },
    { type: 'separator' },
    { label: 'Quit Shortty', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  // Windows convention: left-click opens the app, right-click the menu.
  if (process.platform === 'win32') tray.on('click', callbacks.onToggle);
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

/** Create or destroy the menu-bar (system tray) icon to match the "Show in Menu Bar" setting. */
export function syncTray(visible: boolean, callbacks: TrayCallbacks): void {
  if (visible) {
    createTray(callbacks);
  } else {
    destroyTray();
  }
}

export function isTrayVisible(): boolean {
  return tray !== null;
}
