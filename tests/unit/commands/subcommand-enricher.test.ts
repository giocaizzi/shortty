import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichSubcommand } from '../../../src/main/commands/subcommand-enricher';
import type { CommandCache } from '../../../src/main/commands/cache';

vi.mock('../../../src/main/commands/parsers/man-parser', () => ({
  parseSubcommandManPage: vi.fn(),
}));
vi.mock('../../../src/main/commands/parsers/help-parser', () => ({
  parseSubcommandHelp: vi.fn(),
}));

import { parseSubcommandManPage } from '../../../src/main/commands/parsers/man-parser';
import { parseSubcommandHelp } from '../../../src/main/commands/parsers/help-parser';

const mockMan = vi.mocked(parseSubcommandManPage);
const mockHelp = vi.mocked(parseSubcommandHelp);

function fakeCache() {
  return {
    readSubcommandDetail: vi.fn().mockReturnValue(null),
    writeSubcommandDetail: vi.fn(),
  } as unknown as CommandCache & {
    readSubcommandDetail: ReturnType<typeof vi.fn>;
    writeSubcommandDetail: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMan.mockResolvedValue(null);
  mockHelp.mockResolvedValue(null);
});

describe('enrichSubcommand', () => {
  it.each([
    'git ../../etc/passwd',
    'rm -rf /',
    'docker $(reboot)',
    'git',
    'git  commit',
  ])('rejects unsafe qualified name %j without running or caching anything', async (name) => {
    const cache = fakeCache();
    const detail = await enrichSubcommand({ bin: '/usr/bin/x', mtime: 1 }, name, cache);
    expect(detail.enrichment).toBe('failed');
    expect(mockMan).not.toHaveBeenCalled();
    expect(mockHelp).not.toHaveBeenCalled();
    expect(cache.readSubcommandDetail).not.toHaveBeenCalled();
    expect(cache.writeSubcommandDetail).not.toHaveBeenCalled();
  });

  it('tries man first, then --help with the subcommand path', async () => {
    const cache = fakeCache();
    mockHelp.mockResolvedValue({
      name: 'docker compose up', description: 'Create and start containers',
      subcommands: [], flags: [{ long: '--build', description: 'Build images' }], arguments: [],
    });
    const base = { bin: '/usr/local/bin/docker', mtime: 5 };
    const detail = await enrichSubcommand(base, 'docker compose up', cache);
    expect(mockMan).toHaveBeenCalledWith('docker compose up');
    expect(mockHelp).toHaveBeenCalledWith('/usr/local/bin/docker', ['compose', 'up'], 'docker compose up');
    expect(detail.enrichment).toBe('full');
    expect(cache.writeSubcommandDetail).toHaveBeenCalledWith('docker compose up', base, detail);
  });

  it('does not cache a failure, so the next request retries', async () => {
    const cache = fakeCache();
    const base = { bin: '/usr/bin/git', mtime: 1 };
    expect((await enrichSubcommand(base, 'git commit', cache)).enrichment).toBe('failed');
    expect(cache.writeSubcommandDetail).not.toHaveBeenCalled();

    mockMan.mockResolvedValue({
      name: 'git commit', description: 'Record changes', subcommands: [], flags: [{ short: '-m', description: '' }], arguments: [],
    });
    expect((await enrichSubcommand(base, 'git commit', cache)).enrichment).toBe('full');
  });

  it('a man page without subcommands is compared with --help (gh auth)', async () => {
    const cache = fakeCache();
    const base = { bin: '/opt/homebrew/bin/x', mtime: 1 };
    mockMan.mockResolvedValue({
      name: 'x auth', description: 'Authenticate', subcommands: [], flags: [{ long: '--host', description: '' }], arguments: [],
    });
    mockHelp.mockResolvedValue({
      name: 'x auth', description: '', subcommands: [{ name: 'x auth login', description: 'Log in' }], flags: [], arguments: [],
    });
    const detail = await enrichSubcommand(base, 'x auth', cache);
    expect(detail).toMatchObject({
      description: 'Authenticate', subcommands: [{ name: 'x auth login' }], flags: [{ long: '--host' }],
    });

    // one that lists subcommands is used as is
    mockHelp.mockClear();
    mockMan.mockResolvedValue({ name: 'x pr', description: '', subcommands: [{ name: 'x pr list', description: '' }], flags: [], arguments: [] });
    await enrichSubcommand(base, 'x pr', cache);
    expect(mockHelp).not.toHaveBeenCalled();
  });

  it('uses a cached detail without spawning anything', async () => {
    const cache = fakeCache();
    const cached = {
      name: 'git commit', description: 'Record changes', enrichment: 'full',
      subcommands: [], flags: [], arguments: [],
    };
    cache.readSubcommandDetail.mockReturnValue(cached);
    const base = { bin: '/usr/bin/git', mtime: 1 };
    expect(await enrichSubcommand(base, 'git commit', cache)).toBe(cached);
    expect(cache.readSubcommandDetail).toHaveBeenCalledWith('git commit', base);
    expect(mockMan).not.toHaveBeenCalled();
  });
});
