import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { Keybinding, ParserMeta } from '../shared/types';

const electronAPI = {
  getSources(): Promise<ParserMeta[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SOURCES);
  },

  getAllKeybindings(): Promise<Keybinding[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_ALL);
  },

  getKeybindingsBySource(sourceId: string): Promise<Keybinding[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_BY_SOURCE, sourceId);
  },

  refreshKeybindings(): Promise<Keybinding[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.REFRESH);
  },

  onKeybindingsUpdate(
    cb: (data: { sourceId: string; keybindings: Keybinding[] }) => void,
  ): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { sourceId: string; keybindings: Keybinding[] },
    ) => cb(data);
    ipcRenderer.on(IPC_CHANNELS.ON_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_UPDATE, handler);
  },

  onWindowShown(cb: () => void): () => void {
    const handler = () => cb();
    ipcRenderer.on('window:shown', handler);
    return () => ipcRenderer.removeListener('window:shown', handler);
  },

  onWindowHidden(cb: () => void): () => void {
    const handler = () => cb();
    ipcRenderer.on('window:hidden', handler);
    return () => ipcRenderer.removeListener('window:hidden', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
