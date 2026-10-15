import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'node:path';
import type { UpdateStatus } from '../shared/types';

let tray: Tray | null = null;
let trayCallbacks: TrayCallbacks | null = null;
let update: UpdateStatus | null = null;

interface TrayCallbacks {
  onToggle: () => void;
  onPreferences: () => void;
  /** Restart into a downloaded update or open the newer release's page. */
  onInstallUpdate: () => void;
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
  trayCallbacks = callbacks;
  buildMenu();
  // Windows convention: left-click opens the app, right-click the menu.
  if (process.platform === 'win32') tray.on('click', callbacks.onToggle);
}

/** Tray menu label for an update the user can act on, or null. */
function updateMenuLabel(status: UpdateStatus | null): string | null {
  if (status?.state === 'ready') return 'Restart to Update';
  if (status?.state === 'available') return `Update Available (v${status.version})...`;
  return null;
}

function buildMenu(): void {
  if (!tray || !trayCallbacks) return;
  const callbacks = trayCallbacks;
  const updateLabel = updateMenuLabel(update);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...(updateLabel
        ? [{ label: updateLabel, click: callbacks.onInstallUpdate }, { type: 'separator' as const }]
        : []),
      { label: 'Show/Hide', click: callbacks.onToggle },
      { type: 'separator' },
      { label: 'Preferences...', click: callbacks.onPreferences },
      { type: 'separator' },
      { label: 'Quit Shortty', click: () => app.quit() },
    ]),
  );
}

/** Show (or drop) the update item at the top of the tray menu. */
export function setTrayUpdate(status: UpdateStatus): void {
  const changed = updateMenuLabel(status) !== updateMenuLabel(update);
  update = status;
  if (changed) buildMenu();
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
