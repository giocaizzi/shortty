import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { ParserRegistry } from './parsers/registry';

export function registerIpcHandlers(registry: ParserRegistry): void {
  ipcMain.handle(IPC_CHANNELS.GET_SOURCES, () => {
    return registry.getSources();
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
}
