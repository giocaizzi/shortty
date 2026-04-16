import type { Command, SubcommandDetail } from '../../shared/types';
import log from '../logger';
import { scanPath } from './path-scanner';
import { readWhatis } from './whatis-reader';
import { CommandCache } from './cache';
import { EnrichmentWorker } from './enrichment-worker';
import { enrichSubcommand } from './subcommand-enricher';

type CommandsUpdateCallback = (commands: Command[]) => void;

export class CommandsEngine {
  private commands: Command[] = [];
  private cache: CommandCache;
  private worker: EnrichmentWorker;
  private updateCallback: CommandsUpdateCallback | null = null;

  constructor(userDataPath: string) {
    this.cache = new CommandCache(userDataPath);
    this.worker = new EnrichmentWorker(this.cache, (updated) => {
      this.handleEnrichmentBatch(updated);
    });
  }

  async initialize(): Promise<Command[]> {
    if (await this.cache.isValid()) {
      const cached = this.cache.readIndex();
      if (cached) {
        log.info(`Commands loaded from cache: ${cached.length} commands`);
        this.commands = cached;
        this.reconcileWithDetails();
        this.startEnrichment();
        return this.commands;
      }
    }

    log.info('Commands cache miss, performing full scan');
    return this.fullScan();
  }

  async fullScan(): Promise<Command[]> {
    const scanned = await scanPath();
    const descriptions = readWhatis();

    this.commands = scanned.map((s) => ({
      name: s.name,
      description: descriptions.get(s.name) ?? '',
      bin: s.bin,
      mtime: s.mtime,
      enrichment: 'basic' as const,
      hasManPage: false,
      hasCompletion: false,
      subcommands: [],
      flags: [],
      arguments: [],
    }));

    log.info(`Commands scan complete: ${this.commands.length} commands found`);
    this.cache.writeIndex(this.commands);
    this.cache.writeMeta({
      pathHash: await this.cache.computePathHash(),
      timestamp: new Date().toISOString(),
      commandCount: this.commands.length,
      enrichedCount: 0,
    });

    this.startEnrichment();

    return this.commands;
  }

  async checkAndRefresh(): Promise<boolean> {
    if (await this.cache.isValid()) return false;
    await this.fullScan();
    return true;
  }

  getAll(): Command[] {
    return this.commands;
  }

  getDetail(name: string): Command | null {
    return this.commands.find(c => c.name === name) ?? this.cache.readDetail(name);
  }

  onUpdate(callback: CommandsUpdateCallback): void {
    this.updateCallback = callback;
  }

  async getSubcommandDetail(qualifiedName: string): Promise<SubcommandDetail> {
    const baseName = qualifiedName.split(' ')[0];
    const cmd = this.commands.find(c => c.name === baseName);
    const binPath = cmd?.bin ?? baseName;
    return enrichSubcommand(binPath, qualifiedName, this.cache);
  }

  stop(): void {
    this.worker.stop();
  }

  getEnrichmentStats(): { total: number; enriched: number; running: boolean } {
    return {
      total: this.commands.length,
      enriched: this.commands.filter(c => c.enrichment !== 'basic').length,
      running: this.worker.isRunning,
    };
  }

  private reconcileWithDetails(): void {
    const detailNames = this.cache.listDetailNames();
    if (detailNames.size === 0) return;

    let reconciled = 0;
    for (let i = 0; i < this.commands.length; i++) {
      const cmd = this.commands[i];
      if (cmd.enrichment !== 'basic') continue;
      if (!detailNames.has(cmd.name)) continue;

      const detail = this.cache.readDetail(cmd.name);
      if (detail && detail.enrichment !== 'basic') {
        this.commands[i] = { ...cmd, ...detail };
        reconciled++;
      }
    }

    if (reconciled > 0) {
      log.info(`Reconciled ${reconciled} commands from detail cache`);
      this.cache.writeIndex(this.commands);
      const meta = this.cache.readMeta();
      if (meta) {
        meta.enrichedCount = this.commands.filter(c => c.enrichment !== 'basic').length;
        meta.timestamp = new Date().toISOString();
        this.cache.writeMeta(meta);
      }
    }
  }

  private startEnrichment(): void {
    const unenriched = this.commands.filter(c => c.enrichment === 'basic');
    if (unenriched.length > 0) {
      this.worker.start(this.commands);
    }
  }

  private handleEnrichmentBatch(updated: Command[]): void {
    for (const cmd of updated) {
      const idx = this.commands.findIndex(c => c.name === cmd.name);
      if (idx !== -1) {
        this.commands[idx] = cmd;
      }
    }

    this.cache.writeIndex(this.commands);

    const meta = this.cache.readMeta();
    if (meta) {
      meta.enrichedCount = this.commands.filter(c => c.enrichment !== 'basic').length;
      meta.timestamp = new Date().toISOString();
      this.cache.writeMeta(meta);
    }

    this.updateCallback?.(updated);
  }
}
