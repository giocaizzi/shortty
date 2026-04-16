import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Shortcut } from '../../shared/types';
import { generateShortcutId } from '../../shared/types';
import type { ParserPlugin } from './types';

export abstract class BaseParser implements ParserPlugin {
  private _configPaths: string[] = [];

  abstract get meta(): ParserPlugin['meta'];
  abstract isAvailable(): Promise<boolean>;
  abstract getWatchPaths(): string[];
  abstract parse(): Promise<Shortcut[]>;

  /** Set config paths for this parser (called by registry). */
  setConfigPaths(paths: string[]): void {
    this._configPaths = paths;
  }

  /** Get the config paths for this parser. */
  getConfigPaths(): string[] {
    return this._configPaths;
  }

  protected async readFileIfExists(filePath: string): Promise<string | null> {
    if (!existsSync(filePath)) return null;
    return readFile(filePath, 'utf-8');
  }

  protected makeShortcut(
    partial: Omit<Shortcut, 'id' | 'source' | 'sourceLabel' | 'origin'> &
      Partial<Pick<Shortcut, 'origin'>>,
  ): Shortcut {
    return {
      ...partial,
      id: generateShortcutId(this.meta.id, partial.rawCommand),
      source: this.meta.id,
      sourceLabel: this.meta.label,
      origin: partial.origin ?? 'user-config',
    };
  }

}
