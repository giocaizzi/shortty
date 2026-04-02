import { existsSync } from 'node:fs';
import type { Keybinding, ParserMeta } from '../../shared/types';
import { getConfigPaths } from '../platform/paths';
import { BaseParser } from './base-parser';
import {
  type ParsedKey,
  Modifier,
  normalizeToCanonical,
} from './key-normalizer';

/** Map terminal escape sequences to structured key representations. */
const ESCAPE_SEQUENCES: Array<{ pattern: RegExp; toKey: ParsedKey }> = [
  // Ctrl+Arrow keys (xterm style: \e[1;5A-D)
  { pattern: /^\\e\[1;5A$/, toKey: { modifiers: [Modifier.Control], key: '↑' } },
  { pattern: /^\\e\[1;5B$/, toKey: { modifiers: [Modifier.Control], key: '↓' } },
  { pattern: /^\\e\[1;5C$/, toKey: { modifiers: [Modifier.Control], key: '→' } },
  { pattern: /^\\e\[1;5D$/, toKey: { modifiers: [Modifier.Control], key: '←' } },
  // Alt+Arrow keys (xterm style: \e[1;3A-D)
  { pattern: /^\\e\[1;3A$/, toKey: { modifiers: [Modifier.Option], key: '↑' } },
  { pattern: /^\\e\[1;3B$/, toKey: { modifiers: [Modifier.Option], key: '↓' } },
  { pattern: /^\\e\[1;3C$/, toKey: { modifiers: [Modifier.Option], key: '→' } },
  { pattern: /^\\e\[1;3D$/, toKey: { modifiers: [Modifier.Option], key: '←' } },
  // Arrow keys (basic: \e[A-D)
  { pattern: /^\\e\[A$/, toKey: { modifiers: [], key: '↑' } },
  { pattern: /^\\e\[B$/, toKey: { modifiers: [], key: '↓' } },
  { pattern: /^\\e\[C$/, toKey: { modifiers: [], key: '→' } },
  { pattern: /^\\e\[D$/, toKey: { modifiers: [], key: '←' } },
  // Editing keys
  { pattern: /^\\e\[3~$/, toKey: { modifiers: [], key: 'Delete' } },
  { pattern: /^\\e\[2~$/, toKey: { modifiers: [], key: 'Insert' } },
  { pattern: /^\\e\[5~$/, toKey: { modifiers: [], key: 'PageUp' } },
  { pattern: /^\\e\[6~$/, toKey: { modifiers: [], key: 'PageDown' } },
  // Home/End (multiple terminal variants)
  { pattern: /^\\eOH$/, toKey: { modifiers: [], key: 'Home' } },
  { pattern: /^\\eOF$/, toKey: { modifiers: [], key: 'End' } },
  { pattern: /^\\e\[H$/, toKey: { modifiers: [], key: 'Home' } },
  { pattern: /^\\e\[F$/, toKey: { modifiers: [], key: 'End' } },
  { pattern: /^\\e\[1~$/, toKey: { modifiers: [], key: 'Home' } },
  { pattern: /^\\e\[4~$/, toKey: { modifiers: [], key: 'End' } },
];

export class ZshParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'zsh',
      label: 'Zsh',
      icon: '🐚',
      platforms: ['darwin', 'linux'],
    };
  }

  async isAvailable(): Promise<boolean> {
    return getConfigPaths('zsh').some((p) => existsSync(p));
  }

  getWatchPaths(): string[] {
    return getConfigPaths('zsh').filter((p) => existsSync(p));
  }

  async parse(): Promise<Keybinding[]> {
    const keybindings: Keybinding[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Match: bindkey [-M keymap] 'sequence' widget
        const match = trimmed.match(
          /^bindkey\s+(?:-M\s+(\S+)\s+)?['"]([^'"]+)['"]\s+(\S+)/,
        );
        if (!match) continue;

        const [, keymap, sequence, widget] = match;
        const { displayKey, searchKey } = this.normalizeZshKey(sequence);

        keybindings.push(
          this.makeKeybinding({
            key: displayKey,
            searchKey,
            command: this.humanizeWidget(widget),
            rawCommand: trimmed,
            context: keymap,
            isDefault: false,
            isUnbound: false,
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  /** Parse zsh key sequences into structured form. */
  private normalizeZshKey(sequence: string): {
    displayKey: string;
    searchKey: string;
  } {
    // First try known escape sequences
    for (const { pattern, toKey } of ESCAPE_SEQUENCES) {
      if (pattern.test(sequence)) {
        return normalizeToCanonical(toKey);
      }
    }

    // Parse ^[ (Alt) and ^ (Ctrl) prefixes
    const modifiers: Modifier[] = [];
    let remaining = sequence;

    // ^[ = Alt/Option
    if (remaining.startsWith('^[')) {
      modifiers.push(Modifier.Option);
      remaining = remaining.slice(2);
    } else if (remaining.startsWith('\\e')) {
      // \e not followed by [ is also Alt
      modifiers.push(Modifier.Option);
      remaining = remaining.slice(2);
    }

    // ^ = Control (after Alt prefix is consumed)
    if (remaining.startsWith('^')) {
      modifiers.push(Modifier.Control);
      remaining = remaining.slice(1);
    }

    const key = remaining.length === 1 ? remaining.toUpperCase() : remaining;
    return normalizeToCanonical({ modifiers, key });
  }

  private humanizeWidget(widget: string): string {
    return widget
      .replace(/-/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
}
