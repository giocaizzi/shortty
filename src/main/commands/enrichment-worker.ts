import type { Command } from '../../shared/types';
import log from '../logger';
import { parseManPage } from './parsers/man-parser';
import { parseHelp, isBlocklisted } from './parsers/help-parser';
import type { CommandCache } from './cache';

type EnrichmentCallback = (updated: Command[]) => void;

const CONCURRENCY = 8;
const BATCH_SIZE = 50;

export class EnrichmentWorker {
  private running = false;

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
    let batch: Command[] = [];
    let i = 0;

    while (i < unenriched.length && this.running) {

      // Take a chunk of CONCURRENCY commands and process in parallel
      const chunk = unenriched.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(cmd => this.enrichCommand(cmd)));

      for (const enriched of results) {
        if (!this.running) break;
        if (enriched) {
          batch.push(enriched);
          this.cache.writeDetail(enriched.name, enriched);
        }
        enrichedCount++;
      }

      i += chunk.length;

      if (batch.length >= BATCH_SIZE) {
        log.debug(`Enriched ${enrichedCount}/${unenriched.length} commands`);
        this.onBatchComplete(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      this.onBatchComplete(batch);
    }

    log.info(`Enrichment complete: ${enrichedCount}/${unenriched.length} commands processed`);
    this.running = false;
  }

  private async enrichCommand(cmd: Command): Promise<Command | null> {
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
      const helpResult = await parseHelp(cmd.name, cmd.bin);
      if (helpResult && (helpResult.subcommands.length > 0 || helpResult.flags.length > 0 || helpResult.arguments.length > 0)) {
        return {
          ...cmd,
          synopsis: helpResult.synopsis,
          longDescription: helpResult.longDescription,
          subcommands: helpResult.subcommands,
          flags: helpResult.flags,
          arguments: helpResult.arguments,
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

  stop(): void {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
