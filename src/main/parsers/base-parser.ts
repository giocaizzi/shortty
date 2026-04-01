import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Keybinding } from '../../shared/types';
import { generateKeybindingId } from '../../shared/types';
import type { ParserPlugin } from './types';

export abstract class BaseParser implements ParserPlugin {
  abstract get meta(): ParserPlugin['meta'];
  abstract isAvailable(): Promise<boolean>;
  abstract getWatchPaths(): string[];
  abstract parse(): Promise<Keybinding[]>;

  protected async readFileIfExists(filePath: string): Promise<string | null> {
    if (!existsSync(filePath)) return null;
    return readFile(filePath, 'utf-8');
  }

  protected makeKeybinding(
    partial: Omit<Keybinding, 'id' | 'source' | 'sourceLabel'>,
  ): Keybinding {
    return {
      ...partial,
      id: generateKeybindingId(this.meta.id, partial.key, partial.rawCommand, partial.context),
      source: this.meta.id,
      sourceLabel: this.meta.label,
    };
  }

  /** Normalize key string to macOS glyph format. */
  protected normalizeKey(key: string): string {
    return key
      .replace(/\bCommandOrControl\b/gi, '⌘')
      .replace(/\bCmd\b/gi, '⌘')
      .replace(/\bCommand\b/gi, '⌘')
      .replace(/\bCtrl\b/gi, '⌃')
      .replace(/\bControl\b/gi, '⌃')
      .replace(/\bShift\b/gi, '⇧')
      .replace(/\bAlt\b/gi, '⌥')
      .replace(/\bOption\b/gi, '⌥')
      .replace(/\bMeta\b/gi, '⌘')
      .replace(/\bSuper\b/gi, '⌘')
      .replace(/\bMod\b/gi, process.platform === 'darwin' ? '⌘' : '⌃')
      .replace(/\+/g, '');
  }
}
