import { vi } from 'vitest';
import type { ElectronAPI } from '../../../src/preload/preload';
import type { AppSettings } from '../../../src/shared/settings';
import { DEFAULT_SETTINGS } from '../../../src/shared/settings';
import type { SourceStatus, UpdateStatus } from '../../../src/shared/types';

/**
 * In-memory stand-in for window.electronAPI: setSetting writes to `store` and
 * broadcasts the result to onSettingsChange listeners, like the main process.
 */
export function installMockApi(
  initial: Partial<AppSettings> = {},
  platform: NodeJS.Platform = 'darwin',
) {
  const store: AppSettings = structuredClone({ ...DEFAULT_SETTINGS, ...initial });
  const listeners = new Set<(s: AppSettings) => void>();
  const statusListeners = new Set<(s: UpdateStatus) => void>();

  const api = {
    getSources: vi.fn(async () => []),
    getAvailableSources: vi.fn(async () => []),
    getAllSources: vi.fn(async (): Promise<SourceStatus[]> => []),
    getAllKeybindings: vi.fn(async () => []),
    getKeybindingsBySource: vi.fn(async () => []),
    refreshKeybindings: vi.fn(async () => []),
    onKeybindingsUpdate: vi.fn(() => () => undefined),
    onWindowShown: vi.fn(() => () => undefined),
    onWindowHidden: vi.fn(() => () => undefined),
    getSettings: vi.fn(async () => structuredClone(store)),
    setSetting: vi.fn(async (key: keyof AppSettings, value: unknown): Promise<{ success: boolean; error?: string }> => {
      Object.assign(store, { [key]: value });
      listeners.forEach((l) => l(structuredClone(store)));
      return { success: true };
    }),
    onSettingsChange: vi.fn((cb: (s: AppSettings) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
    openPreferences: vi.fn(),
    getAllCommands: vi.fn(async () => []),
    getCommandDetail: vi.fn(async () => null),
    refreshCommands: vi.fn(async () => []),
    onCommandsUpdate: vi.fn(() => () => undefined),
    getSubcommandDetail: vi.fn(async () => null),
    getCommandsStats: vi.fn(async () => ({ total: 0, enriched: 0, running: false })),
    rebuildIndex: vi.fn(async () => undefined),
    getUpdateStatus: vi.fn(async (): Promise<UpdateStatus> => ({ current: '0.1.0', state: 'up-to-date' })),
    checkForUpdates: vi.fn(async () => undefined),
    installUpdate: vi.fn(async () => undefined),
    onUpdateStatus: vi.fn((cb: (s: UpdateStatus) => void) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    }),
    setWindowHeight: vi.fn(),
    platform,
    hideWindow: vi.fn(),
    onWindowWillHide: vi.fn(() => () => undefined),
    pickPath: vi.fn(async (): Promise<string | null> => null),
    getIcon: vi.fn(async (): Promise<string | null> => null),
    getAppInfo: vi.fn(async () => ({
      version: '0.2.1',
      arch: 'arm64',
      platform,
      os: 'macOS 26.0',
      electron: '44.7.0',
      chrome: '150.0.0.0',
      node: '24.0.0',
    })),
    openAboutLink: vi.fn(),
    onShowTab: vi.fn(() => () => undefined),
    checkPaths: vi.fn(async (paths: string[]) =>
      paths.map((p) => ({
        path: p,
        resolved: p === '~/' ? '/home/me' : p,
        exists: !p.includes('missing'),
      })),
    ),
  } satisfies ElectronAPI;

  window.electronAPI = api;
  return {
    api,
    store,
    emit: (s: AppSettings) => listeners.forEach((l) => l(s)),
    emitUpdateStatus: (s: UpdateStatus) => statusListeners.forEach((l) => l(s)),
  };
}

export function makeSource(overrides: Partial<SourceStatus> = {}): SourceStatus {
  return {
    id: 'ghostty',
    label: 'Ghostty',
    icon: '👻',
    platforms: ['darwin'],
    hasParser: true,
    enabled: true,
    detected: true,
    configPaths: ['/home/me/.config/ghostty/config'],
    shortcutCount: 42,
    ...overrides,
  };
}

/** list[i], failing the test when it is missing. */
export function nth<T>(list: T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`expected an item at index ${i}`);
  return item;
}
