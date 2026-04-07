import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Keybinding } from '../../shared/types';
import { generateKeybindingId } from '../../shared/types';
import type { ParserPlugin } from './types';
import {
  type ParsedKey,
  parseKeyCombo,
  normalizeToCanonical,
} from './key-normalizer';

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
    partial: Omit<Keybinding, 'id' | 'source' | 'sourceLabel' | 'origin'> &
      Partial<Pick<Keybinding, 'origin'>>,
  ): Keybinding {
    return {
      ...partial,
      id: generateKeybindingId(this.meta.id, partial.key, partial.rawCommand, partial.context),
      source: this.meta.id,
      sourceLabel: this.meta.label,
      origin: partial.origin ?? 'user-config',
    };
  }

  /**
   * Parse a raw key combo string and return both display and search formats.
   * Handles canonical modifier ordering and edge cases (e.g. "+" as a key).
   */
  protected formatKeyCombo(
    raw: string,
    separator = '+',
  ): { displayKey: string; searchKey: string } {
    const parsed = parseKeyCombo(raw, separator);
    return normalizeToCanonical(parsed);
  }

  /**
   * Produce display/search strings from a pre-built ParsedKey.
   * Use when the parser needs custom parsing before normalization.
   */
  protected formatParsedKey(parsed: ParsedKey): {
    displayKey: string;
    searchKey: string;
  } {
    return normalizeToCanonical(parsed);
  }
}
