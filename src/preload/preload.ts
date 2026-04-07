import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { Keybinding, ParserMeta, Command, SourceStatus } from '../shared/types';
import type { AppSettings } from '../shared/settings';

const electronAPI = {
  getSources(): Promise<ParserMeta[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SOURCES);
  },

  getAvailableSources(): Promise<ParserMeta[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_AVAILABLE_SOURCES);
  },

  getAllSources(): Promise<SourceStatus[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_SOURCES);
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

  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL);
  },

  setSetting(
    key: keyof AppSettings,
    value: unknown,
  ): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value);
  },

  onSettingsChange(cb: (settings: AppSettings) => void): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      settings: AppSettings,
    ) => cb(settings);
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_ON_CHANGE, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_ON_CHANGE, handler);
  },

  openPreferences(): void {
    ipcRenderer.send(IPC_CHANNELS.OPEN_PREFERENCES);
  },

  getAllCommands(): Promise<Command[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_GET_ALL);
  },

  getCommandDetail(name: string): Promise<Command | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_GET_DETAIL, name);
  },

  refreshCommands(): Promise<Command[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_REFRESH);
  },

  onCommandsUpdate(callback: (commands: Command[]) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, commands: Command[]) =>
      callback(commands);
    ipcRenderer.on(IPC_CHANNELS.COMMANDS_ON_UPDATE, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.COMMANDS_ON_UPDATE, handler);
  },

  getCommandsStats(): Promise<{ total: number; enriched: number; running: boolean }> {
    return ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_GET_STATS);
  },

  setWindowHeight(height: number): void {
    ipcRenderer.send(IPC_CHANNELS.SET_WINDOW_HEIGHT, height);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
