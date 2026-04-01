import { existsSync } from 'node:fs';
import type { Keybinding, ParserMeta } from '../../shared/types';
import { getConfigPaths } from '../platform/paths';
import { BaseParser } from './base-parser';

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

        keybindings.push(
          this.makeKeybinding({
            key: this.normalizeZshKey(sequence),
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

  private normalizeZshKey(sequence: string): string {
    return sequence
      .replace(/\^\[/g, '⌥')
      .replace(/\^/g, '⌃')
      .replace(/\\e\[A/g, '↑')
      .replace(/\\e\[B/g, '↓')
      .replace(/\\e\[C/g, '→')
      .replace(/\\e\[D/g, '←')
      .replace(/\\e/g, '⌥');
  }

  private humanizeWidget(widget: string): string {
    return widget
      .replace(/-/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
}
