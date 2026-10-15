import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;

interface TrayCallbacks {
  onToggle: () => void;
  onPreferences: () => void;
}

function getTrayIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tray-iconTemplate.png');
  }
  return path.join(app.getAppPath(), 'src/assets/tray-iconTemplate.png');
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
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

/** Create or destroy the menu-bar icon to match the "Show in Menu Bar" setting. */
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
