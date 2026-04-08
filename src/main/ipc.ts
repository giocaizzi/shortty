import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { ParserRegistry } from './parsers/registry';
import type { AppSettings } from '../shared/settings';
import type { SourceStatus } from '../shared/types';
import { getSettings, setSetting } from './settings-store';
import type { CommandsEngine } from './commands/engine';

export function registerIpcHandlers(
  registry: ParserRegistry,
  callbacks: {
    openPreferences: () => void;
  },
  commandsEngine?: CommandsEngine | null,
): void {
  ipcMain.handle(IPC_CHANNELS.GET_SOURCES, () => {
    return registry.getSources();
  });

  ipcMain.handle(IPC_CHANNELS.GET_AVAILABLE_SOURCES, () => {
    return registry.getAvailableSources();
  });

  ipcMain.handle(IPC_CHANNELS.GET_ALL_SOURCES, (): SourceStatus[] => {
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

  ipcMain.handle(IPC_CHANNELS.GET_ALL, () => {
    return registry.getAllCached();
  });

  ipcMain.handle(IPC_CHANNELS.GET_BY_SOURCE, (_event, sourceId: string) => {
    return registry.getCachedBySource(sourceId);
  });

  ipcMain.handle(IPC_CHANNELS.REFRESH, async () => {
    return registry.parseAll();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    return getSettings();
  });

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    (_event, key: keyof AppSettings, value: unknown) => {
      try {
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
  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET_ALL, () => {
    return commandsEngine?.getAll() ?? [];
  });

  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET_DETAIL, (_event, name: string) => {
    return commandsEngine?.getDetail(name) ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.COMMANDS_REFRESH, async () => {
    if (!commandsEngine) return [];
    await commandsEngine.fullScan();
    return commandsEngine.getAll();
  });

  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET_SUBCOMMAND_DETAIL, async (_event, qualifiedName: string) => {
    if (!commandsEngine) return null;
    return commandsEngine.getSubcommandDetail(qualifiedName);
  });

  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET_STATS, () => {
    return commandsEngine?.getEnrichmentStats() ?? { total: 0, enriched: 0, running: false };
  });
}
