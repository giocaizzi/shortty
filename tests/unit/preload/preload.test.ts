import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels';
import type { ElectronAPI } from '../../../src/preload/preload';

type Listener = (event: unknown, ...args: unknown[]) => void;
const listeners = new Map<string, Listener[]>();
const send = vi.fn();
let exposed: ElectronAPI;

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_key: string, api: ElectronAPI) => {
      exposed = api;
    },
  },
  ipcRenderer: {
    send: (...args: unknown[]) => send(...args),
    invoke: vi.fn(),
    on: (channel: string, fn: Listener) => {
      listeners.set(channel, [...(listeners.get(channel) ?? []), fn]);
    },
    removeListener: vi.fn(),
  },
}));

await import('../../../src/preload/preload');

function emit(channel: string, ...args: unknown[]): void {
  for (const fn of listeners.get(channel) ?? []) fn({}, ...args);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('preload window lifecycle API', () => {
  beforeEach(() => send.mockClear());

  it('exposes the OS platform to the renderer', () => {
    expect(exposed.platform).toBe(process.platform);
  });

  it('hideWindow() sends the hide request to main', () => {
    exposed.hideWindow();
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_HIDE);
  });

  it('acks a will-hide request immediately when nothing listens', async () => {
    emit(IPC_CHANNELS.WINDOW_WILL_HIDE, 7);
    await flush();
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_HIDE_READY, 7);
  });

  it('waits for the exit animation listener before acking', async () => {
    let finish!: () => void;
    const unsubscribe = exposed.onWindowWillHide(
      () => new Promise<void>((r) => (finish = r)),
    );

    emit(IPC_CHANNELS.WINDOW_WILL_HIDE, 8);
    await flush();
    expect(send).not.toHaveBeenCalled();

    finish();
    await flush();
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_HIDE_READY, 8);
    unsubscribe();
  });

  it('a throwing listener does not block the hide', async () => {
    const unsubscribe = exposed.onWindowWillHide(() => {
      throw new Error('boom');
    });
    emit(IPC_CHANNELS.WINDOW_WILL_HIDE, 9);
    await flush();
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_HIDE_READY, 9);
    unsubscribe();
  });
});
