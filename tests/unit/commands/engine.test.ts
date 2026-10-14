import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from '../../../src/shared/types';

vi.mock('../../../src/main/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../src/main/commands/path-scanner', () => ({
  scanPath: vi.fn(),
  pathDirectories: () => [],
}));
vi.mock('../../../src/main/commands/whatis-reader', () => ({
  readWhatis: vi.fn(),
}));
const workerStart = vi.fn();
const workerPause = vi.fn();
const workerResume = vi.fn();
vi.mock('../../../src/main/commands/enrichment-worker', () => ({
  EnrichmentWorker: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.start = workerStart;
    this.pause = workerPause;
    this.resume = workerResume;
    this.stop = vi.fn();
    this.isRunning = false;
  }),
}));
vi.mock('../../../src/main/commands/subcommand-enricher', () => ({
  enrichSubcommand: vi.fn(),
}));

import { CommandsEngine } from '../../../src/main/commands/engine';
import { scanPath } from '../../../src/main/commands/path-scanner';
import { readWhatis } from '../../../src/main/commands/whatis-reader';
import { enrichSubcommand } from '../../../src/main/commands/subcommand-enricher';
import { EnrichmentWorker } from '../../../src/main/commands/enrichment-worker';
import { CommandCache } from '../../../src/main/commands/cache';

const mockScan = vi.mocked(scanPath);
const mockWhatis = vi.mocked(readWhatis);

let userData: string;

beforeEach(() => {
  vi.clearAllMocks();
  userData = mkdtempSync(join(tmpdir(), 'shortty-engine-'));
  mockWhatis.mockResolvedValue(new Map());
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

/** The callback the engine passed to the worker for finished batches. */
function batchCallback(): (cmds: Command[]) => void {
  return vi.mocked(EnrichmentWorker).mock.calls.at(-1)?.[1] as (cmds: Command[]) => void;
}

describe('CommandsEngine', () => {
  it('indexes immediately and fills whatis descriptions asynchronously', async () => {
    mockScan.mockResolvedValue([{ name: 'git', bin: '/opt/homebrew/bin/git', mtime: 1 }]);
    let resolveWhatis: (m: Map<string, string>) => void = () => undefined;
    mockWhatis.mockReturnValue(new Promise(r => { resolveWhatis = r; }));

    const engine = new CommandsEngine(userData);
    const updates: Command[][] = [];
    engine.onUpdate(c => updates.push(c));

    const commands = await engine.initialize();
    expect(commands.map(c => [c.name, c.description])).toEqual([['git', '']]);

    resolveWhatis(new Map([['git', 'the stupid content tracker']]));
    await engine.descriptionsLoaded;
    expect(engine.getAll()[0].description).toBe('the stupid content tracker');
    expect(updates.at(-1)?.map(c => c.description)).toEqual(['the stupid content tracker']);
  });

  it('a rescan keeps enrichment of unchanged binaries and re-enriches changed ones', async () => {
    mockScan.mockResolvedValue([
      { name: 'git', bin: '/opt/homebrew/bin/git', mtime: 1 },
      { name: 'jq', bin: '/opt/homebrew/bin/jq', mtime: 1 },
    ]);
    const engine = new CommandsEngine(userData);
    await engine.initialize();

    const enriched = engine.getAll().map(c => ({ ...c, enrichment: 'full' as const, flags: [{ long: '--x', description: '' }] }));
    batchCallback()(enriched);
    expect(engine.getEnrichmentStats().enriched).toBe(2);

    // jq upgraded in place (mtime changed), fd added, git untouched
    mockScan.mockResolvedValue([
      { name: 'git', bin: '/opt/homebrew/bin/git', mtime: 1 },
      { name: 'jq', bin: '/opt/homebrew/bin/jq', mtime: 2 },
      { name: 'fd', bin: '/opt/homebrew/bin/fd', mtime: 1 },
    ]);
    await engine.fullScan();

    const byName = new Map(engine.getAll().map(c => [c.name, c]));
    expect(byName.get('git')?.enrichment).toBe('full');
    expect(byName.get('jq')?.enrichment).toBe('basic');
    expect(byName.get('fd')?.enrichment).toBe('basic');
    // only the basic ones are left for the worker to enrich
    expect(workerStart).toHaveBeenLastCalledWith(engine.getAll());
  });

  it('ignores a finished enrichment for a binary that was replaced meanwhile', async () => {
    mockScan.mockResolvedValue([{ name: 'jq', bin: '/opt/homebrew/bin/jq', mtime: 1 }]);
    const engine = new CommandsEngine(userData);
    await engine.initialize();
    const stale = { ...engine.getAll()[0], enrichment: 'full' as const };

    mockScan.mockResolvedValue([{ name: 'jq', bin: '/usr/local/bin/jq', mtime: 5 }]);
    await engine.fullScan();
    batchCallback()([stale]);
    expect(engine.getAll()[0]).toMatchObject({ bin: '/usr/local/bin/jq', enrichment: 'basic' });
  });

  it('does not reuse a cached detail after the binary changed (warm start)', async () => {
    mockScan.mockResolvedValue([{ name: 'jq', bin: '/opt/homebrew/bin/jq', mtime: 1 }]);
    const first = new CommandsEngine(userData);
    await first.initialize();
    // a detail written for an older jq binary
    const cacheDir = join(userData, 'commands-cache', 'details');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(cacheDir, 'jq.json'), JSON.stringify({ ...first.getAll()[0], mtime: 0, enrichment: 'full' }));

    const second = new CommandsEngine(userData);
    // pathHash is computed over pathDirectories() (mocked to []) so the cache is valid
    await second.initialize();
    expect(second.getAll()[0].enrichment).toBe('basic');
  });

  it('refuses drill-in for a command that is not on PATH', async () => {
    mockScan.mockResolvedValue([{ name: 'git', bin: '/opt/homebrew/bin/git', mtime: 1 }]);
    const engine = new CommandsEngine(userData);
    await engine.initialize();

    expect((await engine.getSubcommandDetail('evil sub')).enrichment).toBe('failed');
    expect(enrichSubcommand).not.toHaveBeenCalled();

    await engine.getSubcommandDetail('git commit');
    expect(enrichSubcommand).toHaveBeenCalledWith({ bin: '/opt/homebrew/bin/git', mtime: 1 }, 'git commit', expect.anything());
  });

  it('pauses enrichment while the launcher is visible, resuming on hide', async () => {
    mockScan.mockResolvedValue([]);
    const engine = new CommandsEngine(userData);
    await engine.initialize();
    engine.onWindowShown();
    expect(workerPause).toHaveBeenCalled();
    engine.onWindowHidden();
    expect(workerResume).toHaveBeenCalled();
    engine.stop();
  });

  describe('saving enrichment batches', () => {
    const indexFile = () => join(userData, 'commands-cache', 'commands-index.json');
    const savedEnrichment = () =>
      (JSON.parse(readFileSync(indexFile(), 'utf-8')) as Command[]).map(c => c.enrichment);

    async function enrichedEngine() {
      mockScan.mockResolvedValue([
        { name: 'git', bin: '/opt/homebrew/bin/git', mtime: 1 },
        { name: 'jq', bin: '/opt/homebrew/bin/jq', mtime: 1 },
      ]);
      const engine = new CommandsEngine(userData);
      await engine.initialize();
      await engine.descriptionsLoaded;
      return engine;
    }

    it('does not write the index synchronously per batch; one debounced async save covers them', async () => {
      const engine = await enrichedEngine();
      vi.useFakeTimers();
      const write = vi.spyOn(CommandCache.prototype, 'saveEnrichmentAsync');
      try {
        const [git, jq] = engine.getAll();
        batchCallback()([{ ...git, enrichment: 'full' }]);
        batchCallback()([{ ...jq, enrichment: 'failed' }]);
        expect(savedEnrichment()).toEqual(['basic', 'basic']);
        expect(write).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(2000);
        vi.useRealTimers();
        await engine.flush();
        expect(write).toHaveBeenCalledTimes(1);
        expect(savedEnrichment()).toEqual(['full', 'failed']);
        expect(JSON.parse(readFileSync(join(userData, 'commands-cache', 'meta.json'), 'utf-8')).enrichedCount).toBe(2);
      } finally {
        write.mockRestore();
        vi.useRealTimers();
      }
    });

    it('stop() writes a pending save before quitting', async () => {
      const engine = await enrichedEngine();
      const [git] = engine.getAll();
      batchCallback()([{ ...git, enrichment: 'full' }]);
      engine.stop();
      expect(savedEnrichment()).toEqual(['full', 'basic']);
    });
  });
});
