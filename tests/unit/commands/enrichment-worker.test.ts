import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Command } from '../../../src/shared/types';
import type { CommandCache } from '../../../src/main/commands/cache';

vi.mock('../../../src/main/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../src/main/commands/parsers/man-parser', () => ({ parseManPage: vi.fn() }));
vi.mock('../../../src/main/commands/parsers/help-parser', () => ({
  parseHelp: vi.fn(),
  isBlocklisted: (name: string) => name === 'rm',
}));

import { EnrichmentWorker } from '../../../src/main/commands/enrichment-worker';
import { parseManPage } from '../../../src/main/commands/parsers/man-parser';
import { parseHelp } from '../../../src/main/commands/parsers/help-parser';

const mockMan = vi.mocked(parseManPage);
const mockHelp = vi.mocked(parseHelp);
const cache = { writeDetail: vi.fn() } as unknown as CommandCache;

function cmd(name: string): Command {
  return {
    name, description: '', bin: `/bin/${name}`, mtime: 1, enrichment: 'basic',
    hasManPage: false, hasCompletion: false, subcommands: [], flags: [], arguments: [],
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeEach(() => {
  vi.clearAllMocks();
  mockHelp.mockResolvedValue(null);
});

describe('EnrichmentWorker', () => {
  it('runs at most one --help process at a time', async () => {
    mockMan.mockResolvedValue(null);
    let active = 0;
    let maxActive = 0;
    mockHelp.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(5);
      active--;
      return { subcommands: [], flags: [{ long: '--x', description: '' }], arguments: [] };
    });
    const batches: Command[][] = [];
    const worker = new EnrichmentWorker(cache, b => batches.push(b));
    await worker.start(['a', 'b', 'c', 'd', 'e'].map(cmd));
    expect(maxActive).toBe(1);
    expect(batches.flat().map(c => c.enrichedFrom)).toEqual(['help', 'help', 'help', 'help', 'help']);
  });

  it('never runs --help for blocklisted commands and keeps the man NAME description', async () => {
    mockMan.mockResolvedValue({ description: 'javascript package manager', subcommands: [], flags: [], arguments: [] });
    mockHelp.mockResolvedValue({ subcommands: [{ name: 'npm install', description: '' }], flags: [], arguments: [] });
    const batches: Command[][] = [];
    const worker = new EnrichmentWorker(cache, b => batches.push(b));
    await worker.start([cmd('rm'), cmd('npm')]);
    expect(mockHelp).toHaveBeenCalledTimes(1);
    expect(mockHelp).toHaveBeenCalledWith('npm', '/bin/npm');
    const [rm, npm] = batches.flat();
    expect(rm.enrichment).toBe('failed');
    expect(npm).toMatchObject({ enrichment: 'full', enrichedFrom: 'help', description: 'javascript package manager' });
  });

  it('runs --help after a man page without subcommands and keeps the richer result', async () => {
    const manFlags = Array.from({ length: 3 }, (_, i) => ({ long: `--m${i}`, description: '' }));
    mockMan.mockResolvedValue({
      description: 'The Kubernetes package manager', subcommands: [], flags: manFlags, arguments: [],
      examples: [{ command: 'helm ls', description: '' }],
    });
    mockHelp.mockResolvedValue({
      subcommands: [{ name: 'helm install', description: 'install a chart' }],
      flags: [{ long: '--debug', description: '' }], arguments: [],
    });
    const worker = new EnrichmentWorker(cache, () => undefined);
    const helm = await worker.enrichNow(cmd('helm'));
    expect(helm).toMatchObject({
      enrichedFrom: 'help', hasManPage: true, description: 'The Kubernetes package manager',
      subcommands: [{ name: 'helm install', description: 'install a chart' }],
      // subcommands from help, the longer flag list and the examples from the man page
      flags: manFlags, examples: [{ command: 'helm ls', description: '' }],
    });
  });

  it('keeps a man page with more flags over a thinner --help (ffmpeg)', async () => {
    mockMan.mockResolvedValue({ subcommands: [], flags: [{ short: '-i', description: '' }, { short: '-y', description: '' }], arguments: [] });
    mockHelp.mockResolvedValue({ subcommands: [], flags: [{ short: '-h', description: '' }], arguments: [] });
    const worker = new EnrichmentWorker(cache, () => undefined);
    const ffmpeg = await worker.enrichNow(cmd('ffmpeg'));
    expect(mockHelp).toHaveBeenCalledTimes(1);
    expect(ffmpeg).toMatchObject({ enrichedFrom: 'man', flags: [{ short: '-i' }, { short: '-y' }] });
  });

  it('does not run --help when the man page lists subcommands', async () => {
    mockMan.mockResolvedValue({ subcommands: [{ name: 'git commit', description: '' }], flags: [], arguments: [] });
    const worker = new EnrichmentWorker(cache, () => undefined);
    expect(await worker.enrichNow(cmd('git'))).toMatchObject({ enrichedFrom: 'man' });
    expect(mockHelp).not.toHaveBeenCalled();
  });

  it('holds while paused and continues on resume', async () => {
    mockMan.mockResolvedValue({ subcommands: [], flags: [{ short: '-x', description: '' }], arguments: [] });
    const batches: Command[][] = [];
    const worker = new EnrichmentWorker(cache, b => batches.push(b));
    worker.pause();
    const run = worker.start([cmd('a')]);
    await sleep(20);
    expect(mockMan).not.toHaveBeenCalled();
    worker.resume();
    await run;
    expect(batches.flat()).toHaveLength(1);
  });

  it('a restart supersedes the previous run (no two loops in parallel)', async () => {
    mockMan.mockImplementation(async () => {
      await sleep(5);
      return { subcommands: [], flags: [{ short: '-x', description: '' }], arguments: [] };
    });
    const batches: Command[][] = [];
    const worker = new EnrichmentWorker(cache, b => batches.push(b));
    const first = worker.start(Array.from({ length: 30 }, (_, i) => cmd(`old${i}`)));
    await sleep(8);
    const second = worker.start([cmd('new')]);
    await Promise.all([first, second]);
    const names = batches.flat().map(c => c.name);
    expect(names).toContain('new');
    expect(names.filter(n => n.startsWith('old')).length).toBeLessThan(30);
    expect(worker.isRunning).toBe(false);
  });

  describe('enrichNow (drill-in)', () => {
    it('enriches a command while the background loop is paused and caches it', async () => {
      mockMan.mockResolvedValue({ subcommands: [], flags: [{ short: '-x', description: '' }], arguments: [] });
      const batches: Command[][] = [];
      const worker = new EnrichmentWorker(cache, b => batches.push(b));
      worker.pause();
      const run = worker.start([cmd('a'), cmd('b'), cmd('c'), cmd('d')]);

      const enriched = await worker.enrichNow(cmd('d'));
      expect(enriched).toMatchObject({ name: 'd', enrichment: 'full', enrichedFrom: 'man' });
      expect(cache.writeDetail).toHaveBeenCalledWith('d', enriched);
      expect(mockMan.mock.calls.map(c => c[0])).toEqual(['d']);

      // the background loop does not enrich it a second time
      worker.resume();
      await run;
      expect(batches.flat().map(c => c.name)).toEqual(['a', 'b', 'c']);
      expect(mockMan).toHaveBeenCalledTimes(4);
    });

    it('shares an enrichment the background loop already started', async () => {
      let release!: () => void;
      mockMan.mockImplementation(() => new Promise((resolve) => {
        release = () => resolve({ subcommands: [], flags: [{ short: '-x', description: '' }], arguments: [] });
      }));
      const worker = new EnrichmentWorker(cache, () => undefined);
      const run = worker.start([cmd('a')]);
      await sleep(5);
      const now = worker.enrichNow(cmd('a'));
      release();
      await Promise.all([run, now]);
      expect(mockMan).toHaveBeenCalledTimes(1);
    });

    it('keeps --help one at a time alongside the background loop', async () => {
      mockMan.mockResolvedValue(null);
      let active = 0;
      let maxActive = 0;
      mockHelp.mockImplementation(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(5);
        active--;
        return { subcommands: [], flags: [{ long: '--x', description: '' }], arguments: [] };
      });
      const worker = new EnrichmentWorker(cache, () => undefined);
      const run = worker.start(['a', 'b', 'c'].map(cmd));
      await Promise.all([run, worker.enrichNow(cmd('z'))]);
      expect(maxActive).toBe(1);
      expect(mockHelp).toHaveBeenCalledWith('z', '/bin/z');
    });
  });
});
