import { existsSync } from 'node:fs';
import type { Keybinding, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';

export class GhosttyParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'ghostty',
      label: 'Ghostty',
      icon: '👻',
      platforms: ['darwin', 'linux'],
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.getConfigPaths().some((p) => existsSync(p));
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Keybinding[]> {
    const keybindings: Keybinding[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const match = trimmed.match(/^keybind\s*=\s*(.+)$/);
        if (!match) continue;

        const value = match[1].trim();
        const eqIdx = value.indexOf('=');
        if (eqIdx === -1) continue;

        const keyPart = value.slice(0, eqIdx).trim();
        const action = value.slice(eqIdx + 1).trim();
        const { displayKey, searchKey } = this.normalizeGhosttyKey(keyPart);

        keybindings.push(
          this.makeKeybinding({
            key: displayKey,
            searchKey,
            command: this.humanizeAction(action),
            rawCommand: action,
            isDefault: false,
            isUnbound: action === 'unbind',
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  private normalizeGhosttyKey(key: string): {
    displayKey: string;
    searchKey: string;
  } {
    // Ghostty uses > for leader sequences: ctrl+a>h
    const segments = key.split('>');
    const displays: string[] = [];
    const searches: string[] = [];

    for (const segment of segments) {
      const { displayKey, searchKey } = this.formatKeyCombo(segment);
      displays.push(displayKey);
      searches.push(searchKey);
    }

    return {
      displayKey: displays.join('>'),
      searchKey: searches.join(' '),
    };
  }

  private humanizeAction(action: string): string {
    return action
      .replace(/_/g, ' ')
      .replace(/:(.+)/, ' ($1)')
      .replace(/^./, (c) => c.toUpperCase());
  }
}
