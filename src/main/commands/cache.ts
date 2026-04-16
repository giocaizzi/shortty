import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Command, SubcommandDetail } from '../../shared/types';

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
    mkdirSync(join(this.cacheDir, 'details', 'sub'), { recursive: true });
  }

  async computePathHash(): Promise<string> {
    const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean);
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

  private subFilename(qualifiedName: string): string {
    return qualifiedName.replace(/ /g, '__') + '.json';
  }

  readSubcommandDetail(qualifiedName: string): SubcommandDetail | null {
    try {
      const raw = readFileSync(
        join(this.cacheDir, 'details', 'sub', this.subFilename(qualifiedName)),
        'utf-8',
      );
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  writeSubcommandDetail(qualifiedName: string, detail: SubcommandDetail): void {
    writeFileSync(
      join(this.cacheDir, 'details', 'sub', this.subFilename(qualifiedName)),
      JSON.stringify(detail),
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
