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

export function createTray(callbacks: TrayCallbacks): Tray {
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

  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
