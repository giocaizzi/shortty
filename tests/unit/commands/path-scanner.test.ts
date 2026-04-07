import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanPath } from '../../../src/main/commands/path-scanner';

vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { X_OK: 1 },
}));

import { readdirSync, statSync, accessSync } from 'node:fs';

const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);
const mockAccessSync = vi.mocked(accessSync);

describe('scanPath', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('scans directories from PATH and returns executables', () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/usr/bin:/usr/local/bin';

    mockReaddirSync.mockImplementation((dir) => {
      if (dir === '/usr/bin') return ['git', 'ls'] as unknown as ReturnType<typeof readdirSync>;
      if (dir === '/usr/local/bin') return ['node'] as unknown as ReturnType<typeof readdirSync>;
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    mockAccessSync.mockImplementation(() => undefined);
    mockStatSync.mockImplementation(() => ({
      isFile: () => true,
      mtimeMs: 1000,
    }) as unknown as ReturnType<typeof statSync>);

    const result = scanPath();

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: 'git', bin: '/usr/bin/git', mtime: 1000 });
    expect(result[1]).toEqual({ name: 'ls', bin: '/usr/bin/ls', mtime: 1000 });
    expect(result[2]).toEqual({ name: 'node', bin: '/usr/local/bin/node', mtime: 1000 });

    process.env.PATH = origPath;
  });

  it('deduplicates commands (first in PATH wins)', () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/usr/bin:/usr/local/bin';

    mockReaddirSync.mockImplementation((dir) => {
      if (dir === '/usr/bin') return ['git'] as unknown as ReturnType<typeof readdirSync>;
      if (dir === '/usr/local/bin') return ['git'] as unknown as ReturnType<typeof readdirSync>;
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    mockAccessSync.mockImplementation(() => undefined);
    mockStatSync.mockImplementation(() => ({
      isFile: () => true,
      mtimeMs: 1000,
    }) as unknown as ReturnType<typeof statSync>);

    const result = scanPath();

    expect(result).toHaveLength(1);
    expect(result[0].bin).toBe('/usr/bin/git');

    process.env.PATH = origPath;
  });

  it('skips hidden and internal files', () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/usr/bin';

    mockReaddirSync.mockReturnValue(['.hidden', '_internal', 'git'] as unknown as ReturnType<typeof readdirSync>);
    mockAccessSync.mockImplementation(() => undefined);
    mockStatSync.mockImplementation(() => ({
      isFile: () => true,
      mtimeMs: 1000,
    }) as unknown as ReturnType<typeof statSync>);

    const result = scanPath();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('git');

    process.env.PATH = origPath;
  });

  it('skips directories (non-file entries)', () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/usr/bin';

    mockReaddirSync.mockReturnValue(['subdir', 'git'] as unknown as ReturnType<typeof readdirSync>);
    mockAccessSync.mockImplementation(() => undefined);
    mockStatSync.mockImplementation((fullPath) => ({
      isFile: () => !String(fullPath).endsWith('subdir'),
      mtimeMs: 1000,
    }) as unknown as ReturnType<typeof statSync>);

    const result = scanPath();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('git');

    process.env.PATH = origPath;
  });

  it('skips unreadable directories', () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/nonexistent:/usr/bin';

    mockReaddirSync.mockImplementation((dir) => {
      if (dir === '/nonexistent') throw new Error('ENOENT');
      return ['git'] as unknown as ReturnType<typeof readdirSync>;
    });

    mockAccessSync.mockImplementation(() => undefined);
    mockStatSync.mockImplementation(() => ({
      isFile: () => true,
      mtimeMs: 1000,
    }) as unknown as ReturnType<typeof statSync>);

    const result = scanPath();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('git');

    process.env.PATH = origPath;
  });

  it('skips non-executable files', () => {
    const origPath = process.env.PATH;
    process.env.PATH = '/usr/bin';

    mockReaddirSync.mockReturnValue(['noexec', 'git'] as unknown as ReturnType<typeof readdirSync>);
    mockAccessSync.mockImplementation((fullPath) => {
      if (String(fullPath).endsWith('noexec')) throw new Error('EACCES');
    });
    mockStatSync.mockImplementation(() => ({
      isFile: () => true,
      mtimeMs: 1000,
    }) as unknown as ReturnType<typeof statSync>);

    const result = scanPath();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('git');

    process.env.PATH = origPath;
  });

  it('returns empty array for empty PATH', () => {
    const origPath = process.env.PATH;
    process.env.PATH = '';

    const result = scanPath();
    expect(result).toEqual([]);

    process.env.PATH = origPath;
  });
});
