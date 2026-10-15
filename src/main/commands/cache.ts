import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathDirectories } from './path-scanner';
import type { Command, SubcommandDetail } from '../../shared/types';

interface CacheMeta {
  pathHash: string;
  timestamp: string;
  commandCount: number;
  enrichedCount: number;
}

/** The base binary a cached subcommand detail was produced from. */
export interface BinaryIdentity {
  bin: string;
  mtime: number;
}

interface SubcommandCacheEntry extends BinaryIdentity {
  detail: SubcommandDetail;
}

/**
 * Directory under userData. Not "cache": on case-insensitive APFS that is
 * Chromium's own userData/Cache (HTTP cache).
 */
const CACHE_DIR_NAME = 'commands-cache';

/**
 * Bump when a parser change alters what gets cached: a cache written by an
 * older version is dropped at start, so fixes reach already-enriched commands.
 */
const CACHE_VERSION = '4';

/**
 * Remove what earlier versions wrote into userData/cache, and nothing else:
 * that directory is Chromium's userData/Cache on case-insensitive volumes.
 */
async function removeLegacyCache(userDataPath: string): Promise<void> {
  const legacy = join(userDataPath, 'cache');
  await Promise.all(
    ['meta.json', 'commands-index.json', 'details'].map((name) =>
      rm(join(legacy, name), { recursive: true, force: true }),
    ),
  );
}

function dropIfOutdated(cacheDir: string): void {
  const versionFile = join(cacheDir, 'version');
  let version = '';
  try {
    version = readFileSync(versionFile, 'utf-8').trim();
  } catch {
    // no version file: written before versioning, drop it
  }
  if (version === CACHE_VERSION) return;
  for (const name of ['meta.json', 'commands-index.json', 'details']) {
    rmSync(join(cacheDir, name), { recursive: true, force: true });
  }
  writeFileSync(versionFile, CACHE_VERSION);
}

export class CommandCache {
  private cacheDir: string;
  /** Settles when the legacy cache files are gone (tests). */
  readonly legacyRemoved: Promise<void>;

  constructor(userDataPath: string) {
    this.cacheDir = join(userDataPath, CACHE_DIR_NAME);
    mkdirSync(this.cacheDir, { recursive: true });
    dropIfOutdated(this.cacheDir);
    mkdirSync(join(this.cacheDir, 'details'), { recursive: true });
    mkdirSync(join(this.cacheDir, 'details', 'sub'), { recursive: true });
    // The old index is not migrated: the next start rescans PATH.
    this.legacyRemoved = removeLegacyCache(userDataPath).catch(() => undefined);
  }

  async computePathHash(): Promise<string> {
    const pathDirs = pathDirectories();
    const parts: string[] = [process.env.PATH ?? ''];

    const stats = await Promise.all(
      pathDirs.map(async (dir) => {
        try {
          const s = await stat(dir);
          return `${dir}:${s.mtimeMs}`;
        } catch {
          return `${dir}:missing`;
        }
      }),
    );
    parts.push(...stats);

    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
  }

  readMeta(): CacheMeta | null {
    try {
      const raw = readFileSync(join(this.cacheDir, 'meta.json'), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  writeMeta(meta: CacheMeta): void {
    writeFileSync(join(this.cacheDir, 'meta.json'), JSON.stringify(meta, null, 2));
  }

  readIndex(): Command[] | null {
    try {
      const raw = readFileSync(join(this.cacheDir, 'commands-index.json'), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  writeIndex(commands: Command[]): void {
    writeFileSync(join(this.cacheDir, 'commands-index.json'), JSON.stringify(commands));
  }

  /**
   * Save the index and the enrichment stats in meta.json without blocking
   * the main process. Each file is written to a temp name, then renamed, so
   * a quit mid-write never leaves a truncated index.
   */
  async saveEnrichmentAsync(commands: Command[], enrichedCount: number): Promise<void> {
    await this.writeAtomic('commands-index.json', JSON.stringify(commands));
    let meta: CacheMeta;
    try {
      meta = JSON.parse(await readFile(join(this.cacheDir, 'meta.json'), 'utf-8'));
    } catch {
      return; // no meta yet: the next scan writes it
    }
    meta.enrichedCount = enrichedCount;
    meta.timestamp = new Date().toISOString();
    await this.writeAtomic('meta.json', JSON.stringify(meta, null, 2));
  }

  private async writeAtomic(name: string, content: string): Promise<void> {
    const target = join(this.cacheDir, name);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, content);
    await rename(temp, target);
  }

  readDetail(name: string): Command | null {
    try {
      const raw = readFileSync(join(this.cacheDir, 'details', `${name}.json`), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  writeDetail(name: string, detail: Command): void {
    writeFileSync(join(this.cacheDir, 'details', `${name}.json`), JSON.stringify(detail));
  }

  /** Injective file name: "a b__c" and "a b c" must not share an entry. */
  private subFilename(qualifiedName: string): string {
    return encodeURIComponent(qualifiedName) + '.json';
  }

  /**
   * A subcommand detail, only if it was produced from the same base binary
   * (path and mtime): an upgraded tool gets fresh details.
   */
  readSubcommandDetail(qualifiedName: string, source: BinaryIdentity): SubcommandDetail | null {
    try {
      const raw = readFileSync(
        join(this.cacheDir, 'details', 'sub', this.subFilename(qualifiedName)),
        'utf-8',
      );
      const entry = JSON.parse(raw) as Partial<SubcommandCacheEntry>;
      if (entry.bin !== source.bin || entry.mtime !== source.mtime || !entry.detail) return null;
      return entry.detail;
    } catch {
      return null;
    }
  }

  writeSubcommandDetail(qualifiedName: string, source: BinaryIdentity, detail: SubcommandDetail): void {
    const entry: SubcommandCacheEntry = { bin: source.bin, mtime: source.mtime, detail };
    writeFileSync(
      join(this.cacheDir, 'details', 'sub', this.subFilename(qualifiedName)),
      JSON.stringify(entry),
    );
  }

  listDetailNames(): Set<string> {
    try {
      const files = readdirSync(join(this.cacheDir, 'details'));
      return new Set(
        files.filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)),
      );
    } catch {
      return new Set();
    }
  }

  async isValid(): Promise<boolean> {
    const meta = this.readMeta();
    if (!meta) return false;
    return meta.pathHash === await this.computePathHash();
  }
}
