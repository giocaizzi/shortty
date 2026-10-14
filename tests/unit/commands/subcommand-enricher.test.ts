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
    const detail = await enrichSubcommand('/usr/bin/x', name, cache);
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
    const detail = await enrichSubcommand('/usr/local/bin/docker', 'docker compose up', cache);
    expect(mockMan).toHaveBeenCalledWith('docker compose up');
    expect(mockHelp).toHaveBeenCalledWith('/usr/local/bin/docker', ['compose', 'up'], 'docker compose up');
    expect(detail.enrichment).toBe('full');
    expect(cache.writeSubcommandDetail).toHaveBeenCalledWith('docker compose up', detail);
  });
});
