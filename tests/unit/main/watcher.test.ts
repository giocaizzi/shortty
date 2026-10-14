import { describe, it, expect, vi } from 'vitest';
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels';

type Listener = (path: string) => Promise<void>;
const listeners = new Map<string, Listener>();
vi.mock('chokidar', () => ({
  watch: () => ({
    on: (event: string, fn: Listener) => listeners.set(event, fn),
    close: vi.fn(),
  }),
}));
vi.mock('../../../src/main/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { startWatching, stopWatching } = await import('../../../src/main/watcher');

function fakeWindow() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } };
}

describe('startWatching', () => {
  it('sends updates to the launcher window current at change time', async () => {
    const registry = {
      getWatchPaths: () => new Map([['vscode', ['/cfg/keybindings.json']]]),
      parseSingleSource: vi.fn(async () => [{ id: 'k' }]),
    };
    const first = fakeWindow();
    const second = fakeWindow();
    let current: ReturnType<typeof fakeWindow> | null = first;
    startWatching(registry as never, () => current as never);

    // The launcher was recreated after the watcher started
    current = second;
    await listeners.get('change')!('/cfg/keybindings.json');

    expect(first.webContents.send).not.toHaveBeenCalled();
    expect(second.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.ON_UPDATE, {
      sourceId: 'vscode',
      keybindings: [{ id: 'k' }],
    });

    // No launcher at all: nothing is sent, nothing throws
    current = null;
    await expect(listeners.get('change')!('/cfg/keybindings.json')).resolves.toBeUndefined();
    stopWatching();
  });
});
