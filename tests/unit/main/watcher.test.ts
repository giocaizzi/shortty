// Config file watcher: real chokidar on a temp dir, with its listeners also
// captured so a test can fire an event directly.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import type { ParserRegistry } from '../../../src/main/parsers/registry';
import type { Shortcut } from '../../../src/shared/types';
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels';
import { withPlatform } from '../../helpers';

type Listener = (path: string) => Promise<void>;
const listeners = new Map<string, Listener>();
vi.mock('chokidar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('chokidar')>();
  return {
    ...actual,
    watch: (...args: Parameters<typeof actual.watch>) => {
      const watcher = actual.watch(...args);
      const on = watcher.on.bind(watcher);
      watcher.on = ((event: string, fn: Listener) => {
        listeners.set(event, fn);
        return on(event as never, fn as never);
      }) as typeof watcher.on;
      return watcher;
    },
  };
});
vi.mock('../../../src/main/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { startWatching, stopWatching, restartWatching } = await import('../../../src/main/watcher');

function fakeWindow() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } };
}

describe('startWatching', () => {
  afterEach(() => stopWatching());

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
  });
});

describe('startWatching on Windows', () => {
  withPlatform('win32');
  afterEach(() => stopWatching());

  it('matches an event to its source across separators and case', async () => {
    const registry = {
      getWatchPaths: () => new Map([['vscode', ['C:/Users/Me/AppData/Roaming/Code/User/keybindings.json']]]),
      parseSingleSource: vi.fn(async () => []),
    };
    startWatching(registry as never, () => fakeWindow() as never);
    await listeners.get('change')!('c:\\users\\me\\AppData\\Roaming\\Code\\User\\keybindings.json');
    expect(registry.parseSingleSource).toHaveBeenCalledWith('vscode');
  });
});

/**
 * Time for chokidar to set up its watches and for macOS to deliver the late
 * event of the fixture file written just before, which the tests then ignore.
 */
const READY_MS = 700;
/** awaitWriteFinish (300ms) + fs event latency. */
const EVENT_TIMEOUT = 4000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('config file watcher on disk', () => {
  let dir: string;
  let zshrc: string;
  let inputrc: string;
  let registry: { getWatchPaths: ReturnType<typeof vi.fn>; parseSingleSource: ReturnType<typeof vi.fn> };
  let send: ReturnType<typeof vi.fn>;
  let destroyed: boolean;
  let window: BrowserWindow;
  const getWindow = () => window;

  const parsed = (sourceId: string): Shortcut[] => [{ id: `${sourceId}-1` } as Shortcut];

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'shortty-watcher-')));
    zshrc = join(dir, '.zshrc');
    inputrc = join(dir, '.inputrc');
    writeFileSync(zshrc, "bindkey '^R' history-incremental-search-backward\n");
    registry = {
      // .inputrc does not exist yet: the registry passes paths of configs that may be created later
      getWatchPaths: vi.fn(() => new Map([['zsh', [zshrc]], ['bash', [inputrc]]])),
      parseSingleSource: vi.fn(async (id: string) => parsed(id)),
    };
    send = vi.fn();
    destroyed = false;
    window = { isDestroyed: () => destroyed, webContents: { send } } as unknown as BrowserWindow;
  });

  afterEach(() => {
    stopWatching();
    rmSync(dir, { recursive: true, force: true });
  });

  async function start(): Promise<void> {
    startWatching(registry as unknown as ParserRegistry, getWindow);
    await sleep(READY_MS);
    registry.parseSingleSource.mockClear();
    send.mockClear();
  }

  it('re-parses the source on change and pushes the result to the renderer', async () => {
    await start();
    writeFileSync(zshrc, "bindkey '^P' up-line-or-history\n");

    await vi.waitFor(() => expect(send).toHaveBeenCalled(), { timeout: EVENT_TIMEOUT });
    expect(registry.parseSingleSource).toHaveBeenCalledWith('zsh');
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.ON_UPDATE, { sourceId: 'zsh', keybindings: parsed('zsh') });
  });

  it('picks up a config file created after startup', async () => {
    await start();
    writeFileSync(inputrc, '"\\C-a": beginning-of-line\n');

    await vi.waitFor(() => expect(registry.parseSingleSource).toHaveBeenCalledWith('bash'), { timeout: EVENT_TIMEOUT });
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(IPC_CHANNELS.ON_UPDATE, { sourceId: 'bash', keybindings: parsed('bash') }));
  });

  it('re-parses when a config file is deleted', async () => {
    await start();
    unlinkSync(zshrc);

    await vi.waitFor(() => expect(registry.parseSingleSource).toHaveBeenCalledWith('zsh'), { timeout: EVENT_TIMEOUT });
  });

  it('debounces a burst of writes into one re-parse', async () => {
    await start();
    for (let i = 0; i < 5; i++) {
      writeFileSync(zshrc, `# edit ${i}\n`);
      await sleep(30);
    }

    await vi.waitFor(() => expect(send).toHaveBeenCalled(), { timeout: EVENT_TIMEOUT });
    // Give a second (wrong) event time to arrive before counting.
    await sleep(800);
    expect(registry.parseSingleSource).toHaveBeenCalledTimes(1);
  });

  it('does not push to a destroyed window', async () => {
    await start();
    destroyed = true;
    writeFileSync(zshrc, '# changed\n');

    await vi.waitFor(() => expect(registry.parseSingleSource).toHaveBeenCalled(), { timeout: EVENT_TIMEOUT });
    await sleep(50);
    expect(send).not.toHaveBeenCalled();
  });

  it('stops reacting after stopWatching and follows new paths after restartWatching', async () => {
    await start();
    stopWatching();
    writeFileSync(zshrc, '# ignored\n');
    await sleep(800);
    expect(registry.parseSingleSource).not.toHaveBeenCalled();

    registry.getWatchPaths.mockReturnValue(new Map([['bash', [inputrc]]]));
    restartWatching(registry as unknown as ParserRegistry, getWindow);
    await sleep(READY_MS);
    registry.parseSingleSource.mockClear();
    writeFileSync(zshrc, '# still ignored\n');
    writeFileSync(inputrc, 'TAB: complete\n');

    await vi.waitFor(() => expect(registry.parseSingleSource).toHaveBeenCalledWith('bash'), { timeout: EVENT_TIMEOUT });
    await sleep(500);
    expect(registry.parseSingleSource).not.toHaveBeenCalledWith('zsh');
  });

  it('watches nothing when no source has a path', () => {
    registry.getWatchPaths.mockReturnValue(new Map());
    expect(() => startWatching(registry as unknown as ParserRegistry, getWindow)).not.toThrow();
  });
});
