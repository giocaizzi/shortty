import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommandCache } from '../../../src/main/commands/cache';
import type { Command, SubcommandDetail } from '../../../src/shared/types';

describe('CommandCache', () => {
  let tempDir: string;
  let cache: CommandCache;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shortty-cache-test-'));
    cache = new CommandCache(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates cache directories on construction', () => {
    expect(existsSync(join(tempDir, 'cache'))).toBe(true);
    expect(existsSync(join(tempDir, 'cache', 'details'))).toBe(true);
  });

  it('writes and reads meta', () => {
    const meta = {
      pathHash: 'abc123',
      timestamp: new Date().toISOString(),
      commandCount: 10,
      enrichedCount: 5,
    };

    cache.writeMeta(meta);
    const result = cache.readMeta();

    expect(result).toEqual(meta);
  });

  it('returns null for missing meta', () => {
    const freshDir = mkdtempSync(join(tmpdir(), 'shortty-cache-test2-'));
    const freshCache = new CommandCache(freshDir);
    expect(freshCache.readMeta()).toBeNull();
    rmSync(freshDir, { recursive: true, force: true });
  });

  it('writes and reads command index', () => {
    const commands: Command[] = [
      {
        name: 'git',
        description: 'the stupid content tracker',
        bin: '/usr/bin/git',
        mtime: 1000,
        enrichment: 'basic',
        hasManPage: true,
        hasCompletion: false,
        subcommands: [],
        flags: [],
        arguments: [],
      },
    ];

    cache.writeIndex(commands);
    const result = cache.readIndex();

    expect(result).toEqual(commands);
  });

  it('returns null for missing index', () => {
    expect(cache.readIndex()).toBeNull();
  });

  it('writes and reads command detail', () => {
    const detail: Command = {
      name: 'git',
      description: 'the stupid content tracker',
      bin: '/usr/bin/git',
      mtime: 1000,
      enrichment: 'full',
      enrichedFrom: 'man',
      enrichedAt: new Date().toISOString(),
      hasManPage: true,
      hasCompletion: false,
      subcommands: [{ name: 'git commit', description: 'Record changes' }],
      flags: [{ short: '-m', long: '--message', arg: '<msg>', description: 'Commit message' }],
      arguments: [],
    };

    cache.writeDetail('git', detail);
    const result = cache.readDetail('git');

    expect(result).toEqual(detail);
  });

  describe('subcommand details', () => {
    const detail = (name: string): SubcommandDetail => ({
      name, description: name, enrichment: 'full', subcommands: [], flags: [], arguments: [],
    });
    const git = { bin: '/usr/bin/git', mtime: 1000 };

    it('round-trips for the same binary', () => {
      cache.writeSubcommandDetail('git commit', git, detail('git commit'));
      expect(cache.readSubcommandDetail('git commit', git)).toEqual(detail('git commit'));
    });

    it('is invalidated when the base binary changed (path or mtime)', () => {
      cache.writeSubcommandDetail('git commit', git, detail('git commit'));
      expect(cache.readSubcommandDetail('git commit', { ...git, mtime: 2000 })).toBeNull();
      expect(cache.readSubcommandDetail('git commit', { ...git, bin: '/opt/homebrew/bin/git' })).toBeNull();
    });

    it('keeps names that differ only in spaces vs "__" apart', () => {
      cache.writeSubcommandDetail('a b__c', git, detail('a b__c'));
      cache.writeSubcommandDetail('a b c', git, detail('a b c'));
      expect(cache.readSubcommandDetail('a b__c', git)?.name).toBe('a b__c');
      expect(cache.readSubcommandDetail('a b c', git)?.name).toBe('a b c');
    });

    it('ignores entries in the old unversioned format', () => {
      writeFileSync(join(tempDir, 'cache', 'details', 'sub', encodeURIComponent('git push') + '.json'), JSON.stringify(detail('git push')));
      expect(cache.readSubcommandDetail('git push', git)).toBeNull();
    });
  });

  it('returns null for missing detail', () => {
    expect(cache.readDetail('nonexistent')).toBeNull();
  });

  it('computes a path hash', async () => {
    const hash = await cache.computePathHash();
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('isValid returns false when no meta exists', async () => {
    expect(await cache.isValid()).toBe(false);
  });

  it('isValid returns true when pathHash matches', async () => {
    const hash = await cache.computePathHash();
    cache.writeMeta({
      pathHash: hash,
      timestamp: new Date().toISOString(),
      commandCount: 0,
      enrichedCount: 0,
    });

    expect(await cache.isValid()).toBe(true);
  });

  it('isValid returns false when pathHash differs', async () => {
    cache.writeMeta({
      pathHash: 'stale-hash',
      timestamp: new Date().toISOString(),
      commandCount: 0,
      enrichedCount: 0,
    });

    expect(await cache.isValid()).toBe(false);
  });
});
