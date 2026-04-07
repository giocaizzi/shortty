import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { ParserRegistry, SourceInfo } from './parsers/registry';
import type { AppSettings } from '../shared/settings';
import { getSettings, setSetting } from './settings-store';

export function registerIpcHandlers(
  registry: ParserRegistry,
  callbacks: {
    openPreferences: () => void;
  },
): void {
  ipcMain.handle(IPC_CHANNELS.GET_SOURCES, () => {
    return registry.getSources();
  });

  ipcMain.handle(IPC_CHANNELS.GET_AVAILABLE_SOURCES, () => {
    return registry.getAvailableSources();
  });

  ipcMain.handle(IPC_CHANNELS.GET_ALL_SOURCES, (): SourceInfo[] => {
    return registry.getAllSources();
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
}
