import type { Command, SubcommandDetail } from '../../shared/types';
import log from '../logger';
import { scanPath } from './path-scanner';
import { readWhatis } from './whatis-reader';
import { CommandCache } from './cache';
import { EnrichmentWorker } from './enrichment-worker';
import { enrichSubcommand } from './subcommand-enricher';

type CommandsUpdateCallback = (commands: Command[]) => void;

const RESUME_AFTER_MS = 5000;

export class CommandsEngine {
  private commands: Command[] = [];
  private cache: CommandCache;
  private worker: EnrichmentWorker;
  private updateCallback: CommandsUpdateCallback | null = null;
  private resumeTimer: NodeJS.Timeout | undefined;
  /** Settles when the background whatis read of the last scan is done (tests). */
  descriptionsLoaded: Promise<void> = Promise.resolve();

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

  /**
   * Rescan PATH. Commands whose binary is unchanged (same path and mtime) keep
   * their enrichment, so a PATH change only enriches what is new or changed.
   * Descriptions from apropos/whatis arrive asynchronously (a few seconds on
   * macOS) and are pushed through onUpdate.
   */
  async fullScan(): Promise<Command[]> {
    const scanned = await scanPath();
    const previous = new Map(
      (this.commands.length > 0 ? this.commands : this.cache.readIndex() ?? []).map(c => [c.name, c]),
    );

    let kept = 0;
    this.commands = scanned.map((s) => {
      const prev = previous.get(s.name);
      if (prev && prev.bin === s.bin && prev.mtime === s.mtime) {
        kept++;
        return prev;
      }
      return {
        name: s.name,
        description: prev?.description ?? '',
        bin: s.bin,
        mtime: s.mtime,
        enrichment: 'basic' as const,
        hasManPage: false,
        hasCompletion: false,
        subcommands: [],
        flags: [],
        arguments: [],
      };
    });

    log.info(`Commands scan complete: ${this.commands.length} commands found (${kept} unchanged)`);
    this.cache.writeIndex(this.commands);
    this.cache.writeMeta({
      pathHash: await this.cache.computePathHash(),
      timestamp: new Date().toISOString(),
      commandCount: this.commands.length,
      enrichedCount: this.commands.filter(c => c.enrichment !== 'basic').length,
    });

    this.descriptionsLoaded = this.loadDescriptions();
    this.startEnrichment();

    return this.commands;
  }

  /** Fill empty descriptions from the whatis database without blocking the scan. */
  private async loadDescriptions(): Promise<void> {
    let descriptions: Map<string, string>;
    try {
      descriptions = await readWhatis();
    } catch (err) {
      log.warn('Reading whatis descriptions failed', err);
      return;
    }
    const changed: Command[] = [];
    this.commands = this.commands.map((cmd) => {
      const desc = descriptions.get(cmd.name);
      if (cmd.description || !desc) return cmd;
      const updated = { ...cmd, description: desc };
      changed.push(updated);
      return updated;
    });
    if (changed.length === 0) return;
    log.info(`Descriptions loaded for ${changed.length} commands`);
    this.cache.writeIndex(this.commands);
    this.updateCallback?.(changed);
  }

  /** PATH hash check (cheap); rescans only when PATH or a PATH directory changed. */
  async checkAndRefresh(): Promise<boolean> {
    if (await this.cache.isValid()) return false;
    await this.fullScan();
    this.updateCallback?.(this.commands);
    return true;
  }

  /**
   * Launcher shown: re-check PATH (docs/spec.md §11.3) and hold enrichment so it does
   * not compete with the UI; it resumes on hide or after 5s.
   */
  onWindowShown(): void {
    this.worker.pause();
    clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => this.worker.resume(), RESUME_AFTER_MS);
    this.checkAndRefresh().catch(err => log.warn('Commands PATH check failed', err));
  }

  onWindowHidden(): void {
    clearTimeout(this.resumeTimer);
    this.worker.resume();
  }

  getAll(): Command[] {
    return this.commands;
  }

  getDetail(name: string): Command | null {
    return this.commands.find(c => c.name === name) ?? null;
  }

  onUpdate(callback: CommandsUpdateCallback): void {
    this.updateCallback = callback;
  }

  async getSubcommandDetail(qualifiedName: string): Promise<SubcommandDetail> {
    const baseName = qualifiedName.split(' ')[0];
    const cmd = this.commands.find(c => c.name === baseName);
    // Only drill into commands the PATH scan found, via their resolved binary
    if (!cmd) {
      return { name: qualifiedName, description: '', enrichment: 'failed', subcommands: [], flags: [], arguments: [] };
    }
    return enrichSubcommand({ bin: cmd.bin, mtime: cmd.mtime }, qualifiedName, this.cache);
  }

  stop(): void {
    clearTimeout(this.resumeTimer);
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
      // Per-command details are only valid for the same binary (docs/spec.md §7.3)
      if (detail && detail.enrichment !== 'basic' && detail.bin === cmd.bin && detail.mtime === cmd.mtime) {
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
    const applied: Command[] = [];
    for (const cmd of updated) {
      const idx = this.commands.findIndex(c => c.name === cmd.name);
      // Skip results for a binary that a rescan replaced meanwhile
      if (idx !== -1 && this.commands[idx].bin === cmd.bin && this.commands[idx].mtime === cmd.mtime) {
        // Keep a description that arrived from whatis while this command was being enriched
        this.commands[idx] = { ...cmd, description: cmd.description || this.commands[idx].description };
        applied.push(this.commands[idx]);
      }
    }

    this.cache.writeIndex(this.commands);

    const meta = this.cache.readMeta();
    if (meta) {
      meta.enrichedCount = this.commands.filter(c => c.enrichment !== 'basic').length;
      meta.timestamp = new Date().toISOString();
      this.cache.writeMeta(meta);
    }

    this.updateCallback?.(applied);
  }
}
