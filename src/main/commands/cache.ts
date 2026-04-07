import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Command } from '../../shared/types';

interface CacheMeta {
  pathHash: string;
  timestamp: string;
  commandCount: number;
  enrichedCount: number;
}

export class CommandCache {
  private cacheDir: string;

  constructor(userDataPath: string) {
    this.cacheDir = join(userDataPath, 'cache');
    mkdirSync(this.cacheDir, { recursive: true });
    mkdirSync(join(this.cacheDir, 'details'), { recursive: true });
  }

  computePathHash(): string {
    const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean);
    const parts: string[] = [process.env.PATH ?? ''];

    for (const dir of pathDirs) {
      try {
        const stat = statSync(dir);
        parts.push(`${dir}:${stat.mtimeMs}`);
      } catch {
        parts.push(`${dir}:missing`);
      }
    }

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

  isValid(): boolean {
    const meta = this.readMeta();
    if (!meta) return false;
    return meta.pathHash === this.computePathHash();
  }
}
