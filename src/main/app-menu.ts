import type { MenuItemConstructorOptions } from 'electron';

/**
 * Application menu template. Electron's default menu binds ⌘W (close),
 * ⌘R (reload) and ⌥⌘I (devtools) in every window, so ⌘W in the launcher would
 * destroy it. This menu keeps only what the windows need: the Edit roles
 * (undo/redo/cut/copy/paste/select all in text fields) and, on macOS, the
 * standard app menu (Settings ⌘,, Hide, Quit), elsewhere a File menu (Settings
 * Ctrl+,, Quit). Reload and devtools stay available in
 * unpackaged (development) builds only.
 */
export function buildAppMenuTemplate(
  appName: string,
  isPackaged: boolean,
  openSettings: () => void,
  platform: NodeJS.Platform = process.platform,
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];
  if (platform === 'darwin') {
    // On macOS the first submenu always becomes the app menu.
    template.push({
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CommandOrControl+,', click: openSettings },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  } else {
    // Hidden menu bar (autoHideMenuBar): it only carries the Ctrl+, accelerator.
    template.push({
      label: 'File',
      submenu: [
        { label: 'Settings…', accelerator: 'CommandOrControl+,', click: openSettings },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  });
  if (!isPackaged) {
    template.push({
      label: 'Develop',
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }],
    });
  }
  return template;
}
