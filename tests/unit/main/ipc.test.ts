import { describe, it, expect, vi, beforeAll } from 'vitest';
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels';

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => handlers.set(channel, fn),
  },
}));

const setSetting = vi.fn();
vi.mock('../../../src/main/settings-store', () => ({
  getSettings: () => ({}),
  setSetting: (...args: unknown[]) => setSetting(...args),
}));

const { registerIpcHandlers } = await import('../../../src/main/ipc');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const shortcuts = deferred();
const commands = deferred();
const registry = {
  getSources: vi.fn(() => [{ id: 'vscode' }]),
  getAllCached: vi.fn(() => [{ id: 'k1' }]),
};
const engine = { getAll: vi.fn(() => [{ name: 'git' }]) };
const changeGlobalShortcut = vi.fn<(accelerator: string) => string | null>(() => null);

beforeAll(() => {
  registerIpcHandlers(
    registry as never,
    { openPreferences: vi.fn(), changeGlobalShortcut },
    () => engine as never,
    { shortcuts: shortcuts.promise, commands: commands.promise },
  );
});

async function isSettled(p: Promise<unknown>): Promise<boolean> {
  let settled = false;
  p.then(() => (settled = true));
  await new Promise((r) => setTimeout(r, 0));
  return settled;
}

describe('registerIpcHandlers (cold start)', () => {
  it('registers every data handler synchronously, before the engines are ready', () => {
    for (const channel of [
      IPC_CHANNELS.GET_SOURCES,
      IPC_CHANNELS.GET_ALL,
      IPC_CHANNELS.COMMANDS_GET_ALL,
      IPC_CHANNELS.SETTINGS_GET_ALL,
    ]) {
      expect(handlers.has(channel)).toBe(true);
    }
  });

  it('a call made while parsers load resolves with data once they are ready', async () => {
    const pending = handlers.get(IPC_CHANNELS.GET_ALL)!({}) as Promise<unknown>;
    expect(await isSettled(pending)).toBe(false);
    shortcuts.resolve();
    await expect(pending).resolves.toEqual([{ id: 'k1' }]);
  });

  it('commands wait for the commands engine independently', async () => {
    const pending = handlers.get(IPC_CHANNELS.COMMANDS_GET_ALL)!({}) as Promise<unknown>;
    expect(await isSettled(pending)).toBe(false);
    commands.resolve();
    await expect(pending).resolves.toEqual([{ name: 'git' }]);
  });
});

describe('SETTINGS_SET globalShortcut', () => {
  const set = (key: string, value: unknown) => handlers.get(IPC_CHANNELS.SETTINGS_SET)!({}, key, value);

  it('saves the shortcut only after it registered', () => {
    setSetting.mockClear();
    expect(set('globalShortcut', 'Alt+Space')).toEqual({ success: true });
    expect(changeGlobalShortcut).toHaveBeenCalledWith('Alt+Space');
    expect(setSetting).toHaveBeenCalledWith('globalShortcut', 'Alt+Space');
  });

  it('returns the registration error and does not save', () => {
    setSetting.mockClear();
    changeGlobalShortcut.mockReturnValueOnce('Cmd+Space is already in use');
    expect(set('globalShortcut', 'Cmd+Space')).toEqual({
      success: false,
      error: 'Cmd+Space is already in use',
    });
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('rejects invalid values and unknown keys before applying or saving them', () => {
    setSetting.mockClear();
    changeGlobalShortcut.mockClear();
    for (const [key, value] of [
      ['theme', 'bogus'],
      ['globalShortcut', ''],
      ['globalShortcut', 7],
      ['resultLimits', { sources: -1 }],
      ['notASetting', true],
    ] as const) {
      expect(set(key, value)).toEqual({ success: false, error: expect.any(String) });
    }
    expect(changeGlobalShortcut).not.toHaveBeenCalled();
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('other settings are saved directly', () => {
    setSetting.mockClear();
    changeGlobalShortcut.mockClear();
    expect(set('showMenuBar', false)).toEqual({ success: true });
    expect(changeGlobalShortcut).not.toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('showMenuBar', false);
  });
});
