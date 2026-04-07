import type { Command } from '../../shared/types';
import log from '../logger';
import { parseManPage } from './parsers/man-parser';
import { parseHelp, isBlocklisted } from './parsers/help-parser';
import type { CommandCache } from './cache';

type EnrichmentCallback = (updated: Command[]) => void;

export class EnrichmentWorker {
  private running = false;
  private paused = false;
  private batchCount = 0;

  constructor(
    private cache: CommandCache,
    private onBatchComplete: EnrichmentCallback,
  ) {}

  async start(commands: Command[]): Promise<void> {
    if (this.running) return;
    this.running = true;

    const sorted = [...commands].sort((a, b) => {
      if (a.hasManPage && !b.hasManPage) return -1;
      if (!a.hasManPage && b.hasManPage) return 1;
      return 0;
    });

    const unenriched = sorted.filter(c => c.enrichment === 'basic');
    log.info(`Enrichment started: ${unenriched.length} commands to enrich`);
    let enrichedCount = 0;
    const batch: Command[] = [];

    for (const cmd of unenriched) {
      if (!this.running) break;

      while (this.paused && this.running) {
        await new Promise(r => setTimeout(r, 500));
      }

      // Yield to event loop between commands to avoid starving other async work
      await new Promise(r => setImmediate(r));

      const enriched = this.enrichCommand(cmd);
      if (enriched) {
        batch.push(enriched);
        this.cache.writeDetail(enriched.name, enriched);
      }

      this.batchCount++;
      enrichedCount++;
      if (this.batchCount >= 50) {
        log.debug(`Enriched ${enrichedCount}/${unenriched.length} commands`);
        this.onBatchComplete(batch.splice(0));
        this.batchCount = 0;
      }
    }

    if (batch.length > 0) {
      this.onBatchComplete(batch);
    }

    log.info(`Enrichment complete: ${enrichedCount}/${unenriched.length} commands processed`);
    this.running = false;
  }

  private enrichCommand(cmd: Command): Command | null {
    const manResult = parseManPage(cmd.name);
    if (manResult && (manResult.subcommands.length > 0 || manResult.flags.length > 0)) {
      return {
        ...cmd,
        description: manResult.description ?? cmd.description,
        subcommands: manResult.subcommands,
        flags: manResult.flags,
        enrichment: 'full',
        enrichedFrom: 'man',
        enrichedAt: new Date().toISOString(),
      };
    }

    if (!isBlocklisted(cmd.name)) {
      const helpResult = parseHelp(cmd.name, cmd.bin);
      if (helpResult && (helpResult.subcommands.length > 0 || helpResult.flags.length > 0)) {
        return {
          ...cmd,
          subcommands: helpResult.subcommands,
          flags: helpResult.flags,
          enrichment: 'full',
          enrichedFrom: 'help',
          enrichedAt: new Date().toISOString(),
        };
      }
    }

    return {
      ...cmd,
      enrichment: 'failed',
      enrichedAt: new Date().toISOString(),
    };
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.running = false;
    this.paused = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isPaused(): boolean {
    return this.paused;
  }
}
