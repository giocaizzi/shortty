import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolvePath } from './utils/path-resolver';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { ParserRegistry } from './parsers/registry';
import type { AppSettings } from '../shared/settings';
import type { SourceStatus, UpdateStatus } from '../shared/types';
import { getSettings, setSetting } from './settings-store';
import { isSettingKey, validateSetting } from './settings-validation';
import type { CommandsEngine } from './commands/engine';
import { isE2E } from './e2e';
import { createIconService, defaultBundleSearch } from './icons';

let registered = false;

export interface IpcCallbacks {
  openPreferences: () => void;
  /**
   * Apply a new global shortcut before it is saved. Returns an error message
   * when the accelerator cannot be registered (the old one stays active).
   */
  changeGlobalShortcut: (accelerator: string) => string | null;
  /** Drop the commands cache and index commands and shortcut sources again. */
  rebuildIndex: () => Promise<void>;
  getUpdateStatus: () => UpdateStatus;
  checkForUpdates: () => Promise<void>;
  /** Restart into a downloaded update, or open the newer release's page. */
  installUpdate: () => void;
}

/**
 * Startup milestones the data handlers wait for. Handlers are registered
 * before any startup await (so the renderer never hits "No handler
 * registered"); a call made while the engines are still loading resolves once
 * they are ready instead of returning empty data. Both must never reject.
 */
export interface IpcReadiness {
  shortcuts: Promise<unknown>;
  commands: Promise<unknown>;
}

export function registerIpcHandlers(
  registry: ParserRegistry,
  callbacks: IpcCallbacks,
  getCommandsEngine: () => CommandsEngine | null,
  ready: IpcReadiness,
): void {
  if (registered) return;
  registered = true;
  ipcMain.handle(IPC_CHANNELS.GET_SOURCES, async () => {
    await ready.shortcuts;
    return registry.getSources();
  });

  ipcMain.handle(IPC_CHANNELS.GET_AVAILABLE_SOURCES, async () => {
    await ready.shortcuts;
    return registry.getAvailableSources();
  });

  ipcMain.handle(IPC_CHANNELS.GET_ALL_SOURCES, async (): Promise<SourceStatus[]> => {
    await ready.shortcuts;
    return registry.getAllSources().map((s) => ({
      id: s.id,
      label: s.label,
      icon: s.icon,
      platforms: s.platforms,
      hasParser: s.parser !== null,
      enabled: s.enabled,
      detected: s.detected,
      configPaths: s.configPaths,
      shortcutCount: s.cheatsheet?.shortcuts.length ?? 0,
    }));
  });

  ipcMain.handle(IPC_CHANNELS.GET_ALL, async () => {
    await ready.shortcuts;
    return registry.getAllCached();
  });

  ipcMain.handle(IPC_CHANNELS.GET_BY_SOURCE, async (_event, sourceId: string) => {
    await ready.shortcuts;
    return registry.getCachedBySource(sourceId);
  });

  ipcMain.handle(IPC_CHANNELS.REFRESH, async () => {
    await ready.shortcuts;
    return registry.parseAll();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    return getSettings();
  });

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    (_event, key: unknown, value: unknown) => {
      try {
        // Validate before anything is applied or persisted
        const invalid = validateSetting(key, value);
        if (invalid !== null || !isSettingKey(key)) {
          return { success: false, error: invalid ?? 'Invalid setting' };
        }
        if (key === 'globalShortcut') {
          const error = callbacks.changeGlobalShortcut(value as string);
          if (error) return { success: false, error };
        }
        setSetting(key, value as AppSettings[typeof key]);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  );

  ipcMain.on(IPC_CHANNELS.OPEN_PREFERENCES, () => {
    callbacks.openPreferences();
  });

  // Commands handlers
  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET_ALL, async () => {
    await ready.commands;
    return getCommandsEngine()?.getAll() ?? [];
  });

  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET_DETAIL, async (_event, name: string) => {
    await ready.commands;
    return (await getCommandsEngine()?.enrichNow(name)) ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.COMMANDS_REFRESH, async () => {
    const engine = getCommandsEngine();
    if (!engine) return [];
    await engine.fullScan();
    return engine.getAll();
  });

  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET_SUBCOMMAND_DETAIL, async (_event, qualifiedName: string) => {
    const engine = getCommandsEngine();
    if (!engine) return null;
    return engine.getSubcommandDetail(qualifiedName);
  });

  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET_STATS, () => {
    return getCommandsEngine()?.getEnrichmentStats() ?? { total: 0, enriched: 0, running: false };
  });

  const getIcon = createIconService({
    sourceApp: (id) => {
      const source = registry.getAllSources().find((s) => s.id === id);
      return source ? (source.cheatsheet?.app ?? null) : undefined;
    },
    commandBin: (name) => getCommandsEngine()?.getDetail(name)?.bin,
    search: defaultBundleSearch(isE2E),
  });

  ipcMain.handle(IPC_CHANNELS.ICONS_GET, async (_event, kind: unknown, name: unknown) => {
    if (process.platform !== 'darwin' && process.platform !== 'win32') return null;
    await (kind === 'command' ? ready.commands : ready.shortcuts);
    return getIcon(kind, name);
  });

  // --- Preferences window (WP-F) ---

  ipcMain.handle(IPC_CHANNELS.PREFS_REBUILD_INDEX, async () => {
    await Promise.all([ready.shortcuts, ready.commands]);
    await callbacks.rebuildIndex();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATES_GET_STATUS, () => callbacks.getUpdateStatus());
  ipcMain.handle(IPC_CHANNELS.UPDATES_CHECK, () => callbacks.checkForUpdates());
  ipcMain.handle(IPC_CHANNELS.UPDATES_INSTALL, () => callbacks.installUpdate());

  ipcMain.handle(IPC_CHANNELS.PREFS_PICK_PATH, async (event, defaultPath: unknown) => {
    let start: string | undefined;
    if (typeof defaultPath === 'string' && defaultPath.trim() !== '') {
      const resolved = resolvePath(defaultPath.trim());
      start = existsSync(resolved) ? resolved : dirname(resolved);
    }
    // Only macOS lets one dialog pick a file or a folder; elsewhere
    // openDirectory wins, so Windows and Linux pick a file.
    const mac = process.platform === 'darwin';
    const options: OpenDialogOptions = {
      title: mac ? 'Choose a config file or folder' : 'Choose a config file',
      buttonLabel: 'Use',
      defaultPath: start,
      properties: mac ? ['openFile', 'openDirectory', 'showHiddenFiles'] : ['openFile', 'showHiddenFiles'],
    };
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC_CHANNELS.PREFS_CHECK_PATHS, (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return [];
    return paths
      .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
      .map((p) => {
        const resolved = resolvePath(p.trim());
        return { path: p, resolved, exists: existsSync(resolved) };
      });
  });
}
