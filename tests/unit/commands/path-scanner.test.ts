import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanPath } from '../../../src/main/commands/path-scanner';

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
