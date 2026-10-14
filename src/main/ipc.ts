import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { ParserRegistry } from './parsers/registry';
import type { AppSettings } from '../shared/settings';
import type { SourceStatus } from '../shared/types';
import { getSettings, setSetting } from './settings-store';
import type { CommandsEngine } from './commands/engine';

let registered = false;

export interface IpcCallbacks {
  openPreferences: () => void;
  /**
   * Apply a new global shortcut before it is saved. Returns an error message
   * when the accelerator cannot be registered (the old one stays active).
   */
  changeGlobalShortcut: (accelerator: string) => string | null;
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
    (_event, key: keyof AppSettings, value: unknown) => {
      try {
        if (key === 'globalShortcut') {
          if (typeof value !== 'string' || !value) {
            return { success: false, error: 'Invalid shortcut' };
          }
          const error = callbacks.changeGlobalShortcut(value);
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
    return getCommandsEngine()?.getDetail(name) ?? null;
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
}
