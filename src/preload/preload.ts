import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { Shortcut, ParserMeta, Command, SubcommandDetail, SourceStatus } from '../shared/types';
import type { AppSettings } from '../shared/settings';

// Exit-animation listeners (see onWindowWillHide). The preload answers every
// will-hide request itself, once all listeners settled, so main never waits
// for its timeout when nothing animates.
const willHideListeners = new Set<() => void | Promise<void>>();
ipcRenderer.on(IPC_CHANNELS.WINDOW_WILL_HIDE, (_event, id: number) => {
  const pending = Array.from(willHideListeners, (cb) => {
    try {
      return Promise.resolve(cb());
    } catch {
      return Promise.resolve();
    }
  });
  Promise.allSettled(pending).then(() => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW_HIDE_READY, id);
  });
});

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

  getAllKeybindings(): Promise<Shortcut[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_ALL);
  },

  getKeybindingsBySource(sourceId: string): Promise<Shortcut[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_BY_SOURCE, sourceId);
  },

  refreshKeybindings(): Promise<Shortcut[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.REFRESH);
  },

  onKeybindingsUpdate(
    cb: (data: { sourceId: string; keybindings: Shortcut[] }) => void,
  ): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { sourceId: string; keybindings: Shortcut[] },
    ) => cb(data);
    ipcRenderer.on(IPC_CHANNELS.ON_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_UPDATE, handler);
  },

  onWindowShown(cb: () => void): () => void {
    const handler = () => cb();
    ipcRenderer.on(IPC_CHANNELS.WINDOW_SHOWN, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_SHOWN, handler);
  },

  onWindowHidden(cb: () => void): () => void {
    const handler = () => cb();
    ipcRenderer.on(IPC_CHANNELS.WINDOW_HIDDEN, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_HIDDEN, handler);
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

  getSubcommandDetail(qualifiedName: string): Promise<SubcommandDetail | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_GET_SUBCOMMAND_DETAIL, qualifiedName);
  },

  getCommandsStats(): Promise<{ total: number; enriched: number; running: boolean }> {
    return ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_GET_STATS);
  },

  setWindowHeight(height: number): void {
    ipcRenderer.send(IPC_CHANNELS.SET_WINDOW_HEIGHT, height);
  },

  // --- Launcher window lifecycle (main-process package) ---

  /** OS platform (`process` itself is not available in the renderers). */
  platform: process.platform,

  /** Dismiss the launcher. Main plays the exit animation, then hides. */
  hideWindow(): void {
    ipcRenderer.send(IPC_CHANNELS.WINDOW_HIDE);
  },

  /**
   * Called when the launcher is about to hide. Return a promise to delay the
   * hide until it settles (e.g. an 80ms exit animation); main hides anyway
   * after ~120ms. Returns an unsubscribe function.
   */
  onWindowWillHide(cb: () => void | Promise<void>): () => void {
    willHideListeners.add(cb);
    return () => {
      willHideListeners.delete(cb);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
