import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ nativeImage: {} }));

const execFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFile(...args),
}));

const existing = new Set<string>();
const links = new Map<string, string>();
vi.mock('node:fs', () => ({
  existsSync: (p: string) => existing.has(p),
  realpathSync: (p: string) => {
    if (!links.has(p)) throw new Error('ENOENT');
    return links.get(p);
  },
}));

const { findAppBundle, appBundleOfBinary, createIconService, defaultBundleSearch } = await import(
  '../../../src/main/icons'
);

/** execFile(cmd, argv, opts, cb) answering mdfind with `stdout`. */
function mdfindReturns(stdout: string | Error) {
  execFile.mockImplementation((_cmd, _argv, _opts, cb: (e: Error | null, r?: unknown) => void) => {
    if (stdout instanceof Error) cb(stdout);
    else cb(null, { stdout, stderr: '' });
  });
}

const CHROME = { bundleId: 'com.google.Chrome', name: 'Google Chrome' };
const search = { spotlight: true, roots: ['/Applications', '/Users/me/Applications'] };

beforeEach(() => {
  execFile.mockReset();
  existing.clear();
  links.clear();
});

describe('findAppBundle', () => {
  it('asks Spotlight by bundle id with an argv query and a timeout', async () => {
    mdfindReturns('/Applications/Google Chrome.app\n');
    await expect(findAppBundle(CHROME, search)).resolves.toBe('/Applications/Google Chrome.app');
    const [cmd, argv, opts] = execFile.mock.calls[0];
    expect(cmd).toBe('mdfind');
    expect(argv).toEqual(["kMDItemCFBundleIdentifier == 'com.google.Chrome'"]);
    expect(opts).toMatchObject({ timeout: 2000 });
  });

  it('prefers an installed copy over a DMG or backup hit', async () => {
    mdfindReturns('/Volumes/Chrome/Google Chrome.app\n/Users/me/Applications/Google Chrome.app\n');
    await expect(findAppBundle(CHROME, search)).resolves.toBe('/Users/me/Applications/Google Chrome.app');
  });

  it('falls back to the folders by name when Spotlight fails', async () => {
    mdfindReturns(new Error('timeout'));
    existing.add('/Users/me/Applications/Google Chrome.app');
    await expect(findAppBundle(CHROME, search)).resolves.toBe('/Users/me/Applications/Google Chrome.app');
  });

  it('never runs mdfind with a bundle id that could escape the query', async () => {
    await findAppBundle({ bundleId: "x' || true || '", name: 'X' }, search);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('rejects names with a path separator', async () => {
    existing.add('/Applications/../etc.app');
    await expect(findAppBundle({ bundleId: 'a.b', name: '../etc' }, { spotlight: false, roots: ['/Applications'] }))
      .resolves.toBeNull();
  });

  it('is hermetic in e2e: no Spotlight, only the fake HOME', () => {
    const e2e = defaultBundleSearch(true);
    expect(e2e.spotlight).toBe(false);
    expect(e2e.roots).toHaveLength(1);
    expect(e2e.roots[0]).toMatch(/Applications$/);
    expect(e2e.roots).not.toContain('/Applications');
  });
});

describe('appBundleOfBinary', () => {
  it('resolves a symlinked binary into its .app', () => {
    links.set('/usr/local/bin/code', '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code');
    expect(appBundleOfBinary('/usr/local/bin/code')).toBe('/Applications/Visual Studio Code.app');
  });

  it('returns null outside a bundle or for a missing file', () => {
    links.set('/opt/homebrew/bin/git', '/opt/homebrew/Cellar/git/2.50/bin/git');
    expect(appBundleOfBinary('/opt/homebrew/bin/git')).toBeNull();
    expect(appBundleOfBinary('/nope')).toBeNull();
  });
});

describe('createIconService', () => {
  function service() {
    const toDataUrl = vi.fn(async (bundle: string) => `data:${bundle}`);
    const getIcon = createIconService({
      sourceApp: (id) => (id === 'chrome' ? CHROME : id === 'tmux' ? null : undefined),
      commandBin: (name) => (name === 'code' ? '/usr/local/bin/code' : undefined),
      search: { spotlight: false, roots: ['/Applications'] },
      toDataUrl,
    });
    return { getIcon, toDataUrl };
  }

  it('resolves a source icon once and caches it', async () => {
    existing.add('/Applications/Google Chrome.app');
    const { getIcon, toDataUrl } = service();
    await expect(getIcon('source', 'chrome')).resolves.toBe('data:/Applications/Google Chrome.app');
    await getIcon('source', 'chrome');
    expect(toDataUrl).toHaveBeenCalledTimes(1);
  });

  it('resolves commands through their binary', async () => {
    links.set('/usr/local/bin/code', '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code');
    const { getIcon } = service();
    await expect(getIcon('command', 'code')).resolves.toBe('data:/Applications/Visual Studio Code.app');
  });

  it('returns null for sources without an app, unknown names and bad input', async () => {
    const { getIcon, toDataUrl } = service();
    await expect(getIcon('source', 'tmux')).resolves.toBeNull();
    await expect(getIcon('source', '/Applications/Evil.app')).resolves.toBeNull();
    await expect(getIcon('command', 'nope')).resolves.toBeNull();
    await expect(getIcon('path', '/etc/passwd')).resolves.toBeNull();
    await expect(getIcon('source', 42)).resolves.toBeNull();
    expect(toDataUrl).not.toHaveBeenCalled();
  });
});
