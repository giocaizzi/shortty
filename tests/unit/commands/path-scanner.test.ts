import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanPath, windowsExecutableExtensions } from '../../../src/main/commands/path-scanner';
import { withPlatform } from '../../helpers';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
  constants: { X_OK: 1 },
}));

import { readdir, stat, access } from 'node:fs/promises';

const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const mockAccess = vi.mocked(access);

describe('scanPath', () => {
  withPlatform('darwin');

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('scans directories from PATH and returns executables', async () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/usr/bin:/usr/local/bin';

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === '/usr/bin') return ['git', 'ls'] as unknown as Awaited<ReturnType<typeof readdir>>;
      if (dir === '/usr/local/bin') return ['node'] as unknown as Awaited<ReturnType<typeof readdir>>;
      return [] as unknown as Awaited<ReturnType<typeof readdir>>;
    });

    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({
      isFile: () => true,
      mtimeMs: 1000,
    } as unknown as Awaited<ReturnType<typeof stat>>);

    const result = await scanPath();

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: 'git', bin: '/usr/bin/git', mtime: 1000 });
    expect(result[1]).toEqual({ name: 'ls', bin: '/usr/bin/ls', mtime: 1000 });
    expect(result[2]).toEqual({ name: 'node', bin: '/usr/local/bin/node', mtime: 1000 });

    process.env.PATH = origPath;
  });

  it('deduplicates commands (first in PATH wins)', async () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/usr/bin:/usr/local/bin';

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === '/usr/bin') return ['git'] as unknown as Awaited<ReturnType<typeof readdir>>;
      if (dir === '/usr/local/bin') return ['git'] as unknown as Awaited<ReturnType<typeof readdir>>;
      return [] as unknown as Awaited<ReturnType<typeof readdir>>;
    });

    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({
      isFile: () => true,
      mtimeMs: 1000,
    } as unknown as Awaited<ReturnType<typeof stat>>);

    const result = await scanPath();

    expect(result).toHaveLength(1);
    expect(result[0].bin).toBe('/usr/bin/git');

    process.env.PATH = origPath;
  });

  it('skips hidden and internal files', async () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/usr/bin';

    mockReaddir.mockResolvedValue(['.hidden', '_internal', 'git'] as unknown as Awaited<ReturnType<typeof readdir>>);
    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({
      isFile: () => true,
      mtimeMs: 1000,
    } as unknown as Awaited<ReturnType<typeof stat>>);

    const result = await scanPath();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('git');

    process.env.PATH = origPath;
  });

  it('skips directories (non-file entries)', async () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/usr/bin';

    mockReaddir.mockResolvedValue(['subdir', 'git'] as unknown as Awaited<ReturnType<typeof readdir>>);
    mockAccess.mockResolvedValue(undefined);
    mockStat.mockImplementation(async (fullPath) => ({
      isFile: () => !String(fullPath).endsWith('subdir'),
      mtimeMs: 1000,
    }) as unknown as Awaited<ReturnType<typeof stat>>);

    const result = await scanPath();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('git');

    process.env.PATH = origPath;
  });

  it('skips unreadable directories', async () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/nonexistent:/usr/bin';

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === '/nonexistent') throw new Error('ENOENT');
      return ['git'] as unknown as Awaited<ReturnType<typeof readdir>>;
    });

    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({
      isFile: () => true,
      mtimeMs: 1000,
    } as unknown as Awaited<ReturnType<typeof stat>>);

    const result = await scanPath();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('git');

    process.env.PATH = origPath;
  });

  it('skips non-executable files', async () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/usr/bin';

    mockReaddir.mockResolvedValue(['noexec', 'git'] as unknown as Awaited<ReturnType<typeof readdir>>);
    mockAccess.mockImplementation(async (fullPath) => {
      if (String(fullPath).endsWith('noexec')) throw new Error('EACCES');
    });
    mockStat.mockResolvedValue({
      isFile: () => true,
      mtimeMs: 1000,
    } as unknown as Awaited<ReturnType<typeof stat>>);

    const result = await scanPath();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('git');

    process.env.PATH = origPath;
  });

  it('returns empty array for empty PATH', async () => {
    const origPath = process.env.PATH;
    process.env.PATH = '';

    const result = await scanPath();
    expect(result).toEqual([]);

    process.env.PATH = origPath;
  });
});

describe('scanPath on Windows', () => {
  withPlatform('win32');

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lists PATHEXT files by name without extension; first directory, then PATHEXT order wins', async () => {
    const origPath = process.env.PATH;
    const origExt = process.env.PATHEXT;
    process.env.PATH = 'C:\\a;C:\\b';
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

    mockReaddir.mockImplementation(async (dir) => {
      if (dir === 'C:\\a') return ['foo.cmd', 'foo.exe', 'bar.cmd', 'baz.dll', 'Qux.EXE'] as unknown as Awaited<ReturnType<typeof readdir>>;
      if (dir === 'C:\\b') return ['QUX.exe', 'tool.ps1', 'noext'] as unknown as Awaited<ReturnType<typeof readdir>>;
      return [] as unknown as Awaited<ReturnType<typeof readdir>>;
    });
    mockStat.mockResolvedValue({ isFile: () => true, mtimeMs: 1000 } as unknown as Awaited<ReturnType<typeof stat>>);

    const result = await scanPath();

    expect(result.map(c => [c.name, c.bin])).toEqual([
      ['foo', 'C:\\a\\foo.exe'],
      ['Qux', 'C:\\a\\Qux.EXE'],
      ['bar', 'C:\\a\\bar.cmd'],
      ['tool', 'C:\\b\\tool.ps1'],
    ]);
    // Windows has no execute bit to check
    expect(mockAccess).not.toHaveBeenCalled();

    process.env.PATH = origPath;
    process.env.PATHEXT = origExt;
  });

  it('reads PATHEXT case-insensitively and always includes .ps1', () => {
    expect(windowsExecutableExtensions('.COM;.EXE; .Bat ;;cmd')).toEqual(['.com', '.exe', '.bat', '.ps1']);
    expect(windowsExecutableExtensions('.EXE;.PS1')).toEqual(['.exe', '.ps1']);
  });
});
