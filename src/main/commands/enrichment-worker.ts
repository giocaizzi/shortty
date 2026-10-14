import type { Command } from '../../shared/types';
import log from '../logger';
import { parseManPage } from './parsers/man-parser';
import { parseHelp, isBlocklisted } from './parsers/help-parser';
import type { CommandCache } from './cache';

type EnrichmentCallback = (updated: Command[]) => void;

/** Man pages are read 3 at a time; `--help` processes run one at a time (docs/spec.md §7.5). */
const MAN_CONCURRENCY = 3;
const BATCH_SIZE = 50;

export class EnrichmentWorker {
  private running = false;
  private paused = false;
  /** Bumped by start/stop so a superseded loop exits instead of running alongside. */
  private generation = 0;
  private resumeWaiters: (() => void)[] = [];
  private helpQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private cache: CommandCache,
    private onBatchComplete: EnrichmentCallback,
  ) {}

  /** Enrich every 'basic' command; restarts if a previous run is still going. */
  async start(commands: Command[]): Promise<void> {
    const generation = ++this.generation;
    this.running = true;
    const isCurrent = () => generation === this.generation;

    const unenriched = commands
      .filter(c => c.enrichment === 'basic')
      .sort((a, b) => Number(b.hasManPage) - Number(a.hasManPage));
    log.info(`Enrichment started: ${unenriched.length} commands to enrich`);

    let enrichedCount = 0;
    let batch: Command[] = [];

    for (let i = 0; i < unenriched.length && isCurrent(); i += MAN_CONCURRENCY) {
      await this.waitWhilePaused();
      if (!isCurrent()) break;

      const chunk = unenriched.slice(i, i + MAN_CONCURRENCY);
      const results = await Promise.all(chunk.map(cmd => this.enrichCommand(cmd)));
      if (!isCurrent()) break;

      for (const enriched of results) {
        batch.push(enriched);
        this.cache.writeDetail(enriched.name, enriched);
        enrichedCount++;
      }

      if (batch.length >= BATCH_SIZE) {
        log.debug(`Enriched ${enrichedCount}/${unenriched.length} commands`);
        this.onBatchComplete(batch);
        batch = [];
      }
    }

    if (batch.length > 0 && isCurrent()) this.onBatchComplete(batch);

    log.info(`Enrichment ${isCurrent() ? 'complete' : 'superseded'}: ${enrichedCount}/${unenriched.length} commands processed`);
    if (isCurrent()) this.running = false;
  }

  /** Serialize `--help` spawns: at most one help process at a time. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.helpQueue.then(fn, fn);
    this.helpQueue = next.catch(() => undefined);
    return next;
  }

  private async enrichCommand(cmd: Command): Promise<Command> {
    const manResult = await parseManPage(cmd.name);
    if (manResult && (manResult.subcommands.length > 0 || manResult.flags.length > 0 || manResult.arguments.length > 0)) {
      return {
        ...cmd,
        description: manResult.description ?? cmd.description,
        synopsis: manResult.synopsis,
        longDescription: manResult.longDescription,
        subcommands: manResult.subcommands,
        flags: manResult.flags,
        arguments: manResult.arguments,
        enrichment: 'full',
        enrichedFrom: 'man',
        enrichedAt: new Date().toISOString(),
        hasManPage: true,
      };
    }

    if (!isBlocklisted(cmd.name)) {
      const helpResult = await this.exclusive(() => parseHelp(cmd.name, cmd.bin));
      if (helpResult && (helpResult.subcommands.length > 0 || helpResult.flags.length > 0 || helpResult.arguments.length > 0)) {
        return {
          ...cmd,
          // A man page with only a NAME line (npm) still gives the best one-liner
          description: cmd.description || manResult?.description || '',
          synopsis: helpResult.synopsis,
          longDescription: helpResult.longDescription,
          subcommands: helpResult.subcommands,
          flags: helpResult.flags,
          arguments: helpResult.arguments,
          enrichment: 'full',
          enrichedFrom: 'help',
          enrichedAt: new Date().toISOString(),
          hasManPage: Boolean(manResult),
        };
      }
    }

    return {
      ...cmd,
      description: cmd.description || manResult?.description || '',
      enrichment: 'failed',
      enrichedAt: new Date().toISOString(),
    };
  }

  private waitWhilePaused(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise(resolve => this.resumeWaiters.push(resolve));
  }

  /** Hold enrichment (e.g. while the launcher is visible); in-flight work finishes. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const resolve of waiters) resolve();
  }

  stop(): void {
    this.generation++;
    this.running = false;
    this.resume();
  }

  get isRunning(): boolean {
    return this.running;
  }
}
