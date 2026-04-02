import { existsSync } from 'node:fs';
import type { Keybinding, ParserMeta } from '../../shared/types';
import { discoverObsidianVaults } from '../platform/paths';
import { BaseParser } from './base-parser';
import { parseModifierWord, normalizeToCanonical } from './key-normalizer';

export class ObsidianParser extends BaseParser {
  private vaultPaths: string[] = [];

  get meta(): ParserMeta {
    return {
      id: 'obsidian',
      label: 'Obsidian',
      icon: '💎',
      platforms: ['darwin', 'win32', 'linux'],
    };
  }

  async isAvailable(): Promise<boolean> {
    this.vaultPaths = discoverObsidianVaults();
    return this.vaultPaths.length > 0;
  }

  getWatchPaths(): string[] {
    return this.vaultPaths.filter((p) => existsSync(p));
  }

  async parse(): Promise<Keybinding[]> {
    const keybindings: Keybinding[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      let hotkeys: Record<string, ObsidianHotkey[]>;
      try {
        hotkeys = JSON.parse(content);
      } catch {
        continue;
      }

      for (const [commandId, bindings] of Object.entries(hotkeys)) {
        // Empty array means explicitly unbound
        if (bindings.length === 0) {
          keybindings.push(
            this.makeKeybinding({
              key: '',
              searchKey: '',
              command: this.humanizeCommand(commandId),
              rawCommand: commandId,
              isDefault: false,
              isUnbound: true,
              filePath,
            }),
          );
          continue;
        }

        for (const binding of bindings) {
          const { displayKey, searchKey } = this.normalizeObsidianKey(binding);
          keybindings.push(
            this.makeKeybinding({
              key: displayKey,
              searchKey,
              command: this.humanizeCommand(commandId),
              rawCommand: commandId,
              isDefault: false,
              isUnbound: false,
              filePath,
            }),
          );
        }
      }
    }

    return keybindings;
  }

  private normalizeObsidianKey(hotkey: ObsidianHotkey): {
    displayKey: string;
    searchKey: string;
  } {
    const modifiers = (hotkey.modifiers ?? [])
      .map((m) => parseModifierWord(m))
      .filter((m): m is NonNullable<typeof m> => m !== null);

    return normalizeToCanonical({ modifiers, key: hotkey.key });
  }

  private humanizeCommand(commandId: string): string {
    const parts = commandId.split(':');
    const name = parts[parts.length - 1];
    return name
      .replace(/-/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
}

interface ObsidianHotkey {
  modifiers: string[];
  key: string;
}
