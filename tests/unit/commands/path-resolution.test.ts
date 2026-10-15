// PATH resolution against a real temporary filesystem (no fs mocks).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, rmSync, utimesSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanPath, pathDirectories } from '../../../src/main/commands/path-scanner';
import { CommandCache } from '../../../src/main/commands/cache';
import { withPlatform } from '../../helpers';

// HOME drives "~" here; os.homedir() ignores it on a Windows host
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, homedir: () => process.env.HOME ?? os.homedir() };
});

const posix = process.platform !== 'win32';
let root: string;
let savedPath: string | undefined;
let savedHome: string | undefined;

function exe(dir: string, name: string, mode = 0o755): string {
  const path = join(dir, name);
  writeFileSync(path, '#!/bin/sh\necho hi\n');
  chmodSync(path, mode);
  return path;
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'shortty-path-')));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  savedPath = process.env.PATH;
  savedHome = process.env.HOME;
});

afterEach(() => {
  process.env.PATH = savedPath;
  process.env.HOME = savedHome;
});

describe('pathDirectories', () => {
  withPlatform('linux');

  it('expands ~, drops relative and empty entries, removes duplicates and trailing slashes', () => {
    process.env.HOME = '/home/u';
    expect(pathDirectories('~/bin::.:bin:/usr/bin:/usr/bin/:~:/opt/x')).toEqual(['/home/u/bin', '/usr/bin', '/home/u', '/opt/x']);
  });
});

describe('pathDirectories on Windows', () => {
  withPlatform('win32');

  it('splits on ";", unquotes, drops relative entries, normalizes and dedupes case-insensitively', () => {
    const path = 'C:\\Tools;;.;bin;"C:\\Program Files\\Git\\cmd";c:\\tools\\;C:\\Windows\\System32;D:/x/;D:\\';
    expect(pathDirectories(path)).toEqual(['C:\\Tools', 'C:\\Program Files\\Git\\cmd', 'C:\\Windows\\System32', 'D:\\x', 'D:\\']);
  });
});

describe.runIf(!posix)('scanPath on Windows (real filesystem)', () => {
  it('lists PATHEXT files without their extension, first directory then PATHEXT order wins', async () => {
    const a = join(root, 'wa');
    const b = join(root, 'wb');
    for (const d of [a, b]) mkdirSync(d, { recursive: true });
    for (const name of ['foo.cmd', 'foo.exe', 'bar.cmd', 'baz.dll', 'Qux.EXE', 'readme.txt']) writeFileSync(join(a, name), '');
    writeFileSync(join(b, 'QUX.exe'), '');
    writeFileSync(join(b, 'tool.ps1'), '');
    mkdirSync(join(b, 'dir.exe'));
    process.env.PATH = [a, b].join(';');
    const savedExt = process.env.PATHEXT;
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
    try {
      const byName = new Map((await scanPath()).map(c => [c.name, c.bin]));
      expect([...byName.keys()].sort()).toEqual(['Qux', 'bar', 'foo', 'tool']);
      expect(byName.get('foo')).toBe(join(a, 'foo.exe'));
      expect(byName.get('Qux')).toBe(join(a, 'Qux.EXE'));
      expect(byName.get('tool')).toBe(join(b, 'tool.ps1'));
    } finally {
      process.env.PATHEXT = savedExt;
    }
  });
});

describe.runIf(posix)('scanPath (real filesystem)', () => {
  it('resolves names like the shell: first PATH entry wins, symlinks followed, junk skipped', async () => {
    const a = join(root, 'a');
    const b = join(root, 'b');
    const home = join(root, 'home');
    const homeBin = join(home, 'bin');
    for (const d of [a, b, homeBin]) mkdirSync(d, { recursive: true });

    exe(a, 'tool');
    exe(b, 'tool'); // shadowed by a/tool
    exe(b, 'only-b');
    exe(b, 'not-exec', 0o644);
    mkdirSync(join(b, 'a-directory'));
    symlinkSync(join(b, 'only-b'), join(a, 'linked')); // symlink to an executable
    symlinkSync(join(root, 'nowhere'), join(a, 'dangling'));
    symlinkSync(b, join(a, 'dirlink'));
    exe(a, '.hidden');
    exe(a, '_internal');
    exe(homeBin, 'mine');

    process.env.HOME = home;
    process.env.PATH = [a, join(root, 'missing'), b, a, '~/bin', '.'].join(':');

    const result = await scanPath();
    const byName = new Map(result.map(c => [c.name, c.bin]));

    expect([...byName.keys()].sort()).toEqual(['linked', 'mine', 'only-b', 'tool']);
    expect(byName.get('tool')).toBe(join(a, 'tool'));
    expect(byName.get('linked')).toBe(join(a, 'linked'));
    expect(byName.get('mine')).toBe(join(homeBin, 'mine'));
    // order follows PATH order
    expect(result.map(c => c.name).indexOf('tool')).toBeLessThan(result.map(c => c.name).indexOf('only-b'));
  });
});

describe.runIf(posix)('CommandCache PATH hash (invalidation)', () => {
  it('changes when PATH changes or a PATH directory changes (binary added/removed)', async () => {
    const dir = join(root, 'hashdir');
    mkdirSync(dir, { recursive: true });
    const cache = new CommandCache(join(root, 'userData'));

    process.env.PATH = dir;
    const h1 = await cache.computePathHash();
    expect(await cache.computePathHash()).toBe(h1);

    // adding a binary bumps the directory mtime
    exe(dir, 'newtool');
    utimesSync(dir, new Date(), new Date(Date.now() + 5000));
    const h2 = await cache.computePathHash();
    expect(h2).not.toBe(h1);

    process.env.PATH = `${dir}:/usr/bin`;
    expect(await cache.computePathHash()).not.toBe(h2);
  });
});
