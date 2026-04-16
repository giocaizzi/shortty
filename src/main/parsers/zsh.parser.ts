import { existsSync } from 'node:fs';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { Modifier } from './key-normalizer';
import { normalizeTerminalKey } from './terminal-keys';

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
    return this.getConfigPaths().some((p) => existsSync(p));
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Shortcut[]> {
    const keybindings: Shortcut[] = [];

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
          this.makeShortcut({
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

  private normalizeZshKey(sequence: string): {
    displayKey: string;
    searchKey: string;
  } {
    return normalizeTerminalKey(sequence, (seq) => {
      const modifiers: Modifier[] = [];
      let remaining = seq;

      if (remaining.startsWith('^[')) {
        modifiers.push(Modifier.Option);
        remaining = remaining.slice(2);
      } else if (remaining.startsWith('\\e')) {
        modifiers.push(Modifier.Option);
        remaining = remaining.slice(2);
      }

      if (remaining.startsWith('^')) {
        modifiers.push(Modifier.Control);
        remaining = remaining.slice(1);
      }

      return { modifiers, remaining };
    });
  }

  private humanizeWidget(widget: string): string {
    return widget
      .replace(/-/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
}
