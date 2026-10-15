import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommandCache, cacheFilename } from '../../../src/main/commands/cache';
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
    expect(existsSync(join(tempDir, 'commands-cache'))).toBe(true);
    expect(existsSync(join(tempDir, 'commands-cache', 'details'))).toBe(true);
  });

  it('drops a cache written by an older version, keeps a current one', () => {
    const dir = join(tempDir, 'commands-cache');
    cache.writeIndex([{ name: 'gh' } as Command]);
    expect(new CommandCache(tempDir).readIndex()).toHaveLength(1);
    writeFileSync(join(dir, 'version'), '1');
    expect(new CommandCache(tempDir).readIndex()).toBeNull();
    expect(existsSync(join(dir, 'details', 'sub'))).toBe(true);
  });

  it('lives outside userData/cache (Chromium\'s Cache on case-insensitive APFS)', () => {
    expect(existsSync(join(tempDir, 'cache'))).toBe(false);
  });

  it('removes only the files earlier versions wrote into userData/cache', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shortty-cache-legacy-'));
    const legacy = join(dir, 'cache');
    mkdirSync(join(legacy, 'details', 'sub'), { recursive: true });
    mkdirSync(join(legacy, 'Cache_Data'), { recursive: true });
    writeFileSync(join(legacy, 'meta.json'), '{}');
    writeFileSync(join(legacy, 'commands-index.json'), '[]');
    writeFileSync(join(legacy, 'details', 'git.json'), '{}');
    writeFileSync(join(legacy, 'Cache_Data', 'index'), 'chromium');

    await new CommandCache(dir).legacyRemoved;

    expect(existsSync(join(legacy, 'meta.json'))).toBe(false);
    expect(existsSync(join(legacy, 'commands-index.json'))).toBe(false);
    expect(existsSync(join(legacy, 'details'))).toBe(false);
    expect(existsSync(join(legacy, 'Cache_Data', 'index'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
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
      writeFileSync(join(tempDir, 'commands-cache', 'details', 'sub', encodeURIComponent('git push') + '.json'), JSON.stringify(detail('git push')));
      expect(cache.readSubcommandDetail('git push', git)).toBeNull();
    });
  });

  it('stores details of names Windows reserves or that differ only in case apart', () => {
    const names = ['con', 'NUL', 'com1', 'lpt9.x', 'Git', 'git', 'a.', 'what*', 'a/b'];
    for (const name of names) cache.writeDetail(name, { name } as Command);
    for (const name of names) expect(cache.readDetail(name)?.name).toBe(name);
    expect(cache.listDetailNames()).toEqual(new Set(names));
  });

  it('encodes file names reversibly and without characters NTFS rejects or folds', () => {
    for (const name of ['con', 'Con', 'aux.txt', 'Git', 'git push', 'a.', '100%', 'x*?"<>|:', 'ü']) {
      const file = cacheFilename(name);
      expect(file).toMatch(/^[a-z0-9%_.-]+\.json$/);
      expect(file).not.toMatch(/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/);
      expect(file.slice(0, -5)).not.toMatch(/\.$/);
      expect(decodeURIComponent(file.slice(0, -5))).toBe(name);
    }
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
