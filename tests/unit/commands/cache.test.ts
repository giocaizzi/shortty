import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommandCache } from '../../../src/main/commands/cache';
import type { Command } from '../../../src/shared/types';

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
