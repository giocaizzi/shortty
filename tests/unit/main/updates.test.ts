import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('../../../src/main/logger', () => ({ default: { info: vi.fn(), warn: vi.fn() } }));

const {
  Updater,
  canAutoUpdate,
  fetchLatestVersion,
  isNewer,
  parseVersion,
  releasePage,
  FIRST_CHECK_DELAY_MS,
} = await import('../../../src/main/updates');
type Deps = ConstructorParameters<typeof Updater>[0];

describe('version comparison', () => {
  it('parses X.Y.Z with an optional v, nothing else', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('0.10.0')).toEqual([0, 10, 0]);
    expect(parseVersion('1.2.3-beta.1')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
  });

  it.each([
    ['0.2.0', '0.1.0', true],
    ['0.10.0', '0.9.9', true],
    ['1.0.0', '0.99.99', true],
    ['v0.1.1', '0.1.0', true],
    ['0.1.0', '0.1.0', false],
    ['0.1.0', '0.2.0', false],
    ['garbage', '0.1.0', false],
  ])('%s newer than %s: %s', (candidate, current, expected) => {
    expect(isNewer(candidate, current)).toBe(expected);
  });
});

describe('canAutoUpdate', () => {
  const never = () => false;
  const noCodesign = vi.fn(async () => '');

  it('Windows: only a Squirrel install (Update.exe above app-x.y.z)', async () => {
    const exe = 'C:\\Users\\me\\AppData\\Local\\shortty\\app-0.1.0\\shortty.exe';
    const exists = vi.fn((p: string) => p === 'C:\\Users\\me\\AppData\\Local\\shortty\\Update.exe');
    expect(await canAutoUpdate('win32', exe, exists, noCodesign)).toBe(true);
    expect(await canAutoUpdate('win32', 'D:\\Shortty\\shortty.exe', exists, noCodesign)).toBe(false);
  });

  it('macOS: only a Developer ID signed bundle', async () => {
    const exe = '/Applications/Shortty.app/Contents/MacOS/shortty';
    const codesign = vi.fn(async () =>
      'Executable=...\nAuthority=Developer ID Application: Someone (TEAM123)\nAuthority=Apple Root CA\n',
    );
    expect(await canAutoUpdate('darwin', exe, never, codesign)).toBe(true);
    expect(codesign).toHaveBeenCalledWith('/Applications/Shortty.app');

    const adhoc = vi.fn(async () => 'Executable=...\nSignature=adhoc\n');
    expect(await canAutoUpdate('darwin', exe, never, adhoc)).toBe(false);
    expect(await canAutoUpdate('darwin', exe, never, noCodesign)).toBe(false);
  });

  it('Linux: never', async () => {
    expect(await canAutoUpdate('linux', '/usr/lib/shortty/shortty', () => true, noCodesign)).toBe(false);
  });
});

describe('fetchLatestVersion', () => {
  const respond = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

  it('reads the latest release tag from the GitHub API', async () => {
    const fetchFn = respond({ tag_name: 'v0.3.0', draft: false, prerelease: false });
    expect(await fetchLatestVersion(fetchFn)).toBe('0.3.0');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.github.com/repos/giocaizzi/shortty/releases/latest',
      expect.anything(),
    );
  });

  it.each([
    ['a draft', { tag_name: 'v0.3.0', draft: true }],
    ['a prerelease', { tag_name: 'v0.3.0', prerelease: true }],
    ['a non-semver tag', { tag_name: 'nightly' }],
    ['no tag', {}],
  ])('ignores %s', async (_name, body) => {
    expect(await fetchLatestVersion(respond(body))).toBeNull();
  });

  it('fails silently on HTTP errors and offline', async () => {
    expect(await fetchLatestVersion(respond({}, false))).toBeNull();
    expect(await fetchLatestVersion(vi.fn(async () => Promise.reject(new Error('offline'))))).toBeNull();
  });
});

class FakeAutoUpdater extends EventEmitter {
  setFeedURL = vi.fn();
  checkForUpdates = vi.fn();
  quitAndInstall = vi.fn();
}

function makeUpdater(overrides: Partial<Deps> = {}) {
  const autoUpdater = new FakeAutoUpdater();
  const deps: Deps = {
    enabled: true,
    currentVersion: '0.1.0',
    platform: 'darwin',
    arch: 'arm64',
    canAutoUpdate: vi.fn(async () => false),
    fetchLatestVersion: vi.fn(async () => '0.2.0'),
    autoUpdater,
    openExternal: vi.fn(),
    beforeInstall: vi.fn(),
    onStatus: vi.fn(),
    ...overrides,
  };
  return { updater: new Updater(deps), deps, autoUpdater };
}

describe('Updater', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('never checks when disabled (development, e2e)', async () => {
    const { updater, deps } = makeUpdater({ enabled: false });
    await updater.start(true);
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS * 10);
    await updater.check();
    expect(updater.getStatus().state).toBe('disabled');
    expect(deps.fetchLatestVersion).not.toHaveBeenCalled();
    expect(deps.canAutoUpdate).not.toHaveBeenCalled();
  });

  it('notify only: checks the latest release after the startup delay, then opens its page', async () => {
    const { updater, deps, autoUpdater } = makeUpdater();
    await updater.start(true);
    expect(deps.fetchLatestVersion).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(updater.getStatus()).toEqual({ current: '0.1.0', state: 'available', version: '0.2.0' });
    expect(deps.onStatus).toHaveBeenLastCalledWith(updater.getStatus());
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled();

    updater.install();
    expect(deps.openExternal).toHaveBeenCalledWith(releasePage('0.2.0'));
    expect(releasePage('0.2.0')).toBe('https://github.com/giocaizzi/shortty/releases/tag/v0.2.0');
  });

  it('notify only: checks again every 24 hours', async () => {
    const { updater, deps } = makeUpdater();
    await updater.start(false);
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS + 24 * 60 * 60 * 1000);
    expect(deps.fetchLatestVersion).toHaveBeenCalledTimes(2);
  });

  it('notify only: up to date, or an error state when offline', async () => {
    const { updater, deps } = makeUpdater({ fetchLatestVersion: vi.fn(async () => '0.1.0') });
    await updater.start(false, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(updater.getStatus().state).toBe('up-to-date');

    vi.mocked(deps.fetchLatestVersion).mockResolvedValueOnce(null);
    await updater.check();
    expect(updater.getStatus().state).toBe('error');
  });

  it('auto: points Squirrel at update.electronjs.org and restarts into the download', async () => {
    const { updater, deps, autoUpdater } = makeUpdater({ canAutoUpdate: vi.fn(async () => true) });
    await updater.start(true);
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      url: 'https://update.electronjs.org/giocaizzi/shortty/darwin-arm64/0.1.0',
    });

    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    expect(deps.fetchLatestVersion).not.toHaveBeenCalled();

    autoUpdater.emit('update-available');
    expect(updater.getStatus().state).toBe('downloading');
    autoUpdater.emit('update-downloaded', {}, 'notes', 'v0.2.0', new Date(), 'url');
    expect(updater.getStatus()).toEqual({ current: '0.1.0', state: 'ready', version: '0.2.0' });

    updater.install();
    expect(deps.beforeInstall).toHaveBeenCalled();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
  });

  it('auto: falls back to the release check when Squirrel fails', async () => {
    const { updater, autoUpdater } = makeUpdater({ canAutoUpdate: vi.fn(async () => true) });
    await updater.start(true);
    autoUpdater.emit('error', new Error('read-only volume'));
    await vi.advanceTimersByTimeAsync(0);
    expect(updater.getStatus().state).toBe('available');
  });

  it('autoUpdate off: notify only even where Squirrel works', async () => {
    const { updater, deps, autoUpdater } = makeUpdater({ canAutoUpdate: vi.fn(async () => true) });
    await updater.start(false, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled();
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(deps.fetchLatestVersion).toHaveBeenCalledOnce();
  });
});
