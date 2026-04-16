import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { parseModifierWord, normalizeToCanonical } from './key-normalizer';

export class ObsidianParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'obsidian',
      label: 'Obsidian',
      icon: '💎',
      platforms: ['darwin', 'win32', 'linux'],
    };
  }

  async isAvailable(): Promise<boolean> {
    // If no config paths were set by the registry, discover vaults
    if (this.getConfigPaths().length === 0) {
      this.setConfigPaths(ObsidianParser.discoverVaults());
    }
    return this.getConfigPaths().some((p) => existsSync(p));
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  /** Discover Obsidian vaults by scanning common directories. */
  static discoverVaults(): string[] {
    const home = homedir();
    const vaults: string[] = [];
    const searchDirs = [
      join(home, 'Documents'),
      join(home, 'Desktop'),
      home,
    ];

    for (const dir of searchDirs) {
      if (!existsSync(dir)) continue;
      try {
        for (const entry of readdirSync(dir)) {
          if (entry.startsWith('.')) continue;
          const entryPath = join(dir, entry);
          try {
            if (!statSync(entryPath).isDirectory()) continue;
            const obsidianDir = join(entryPath, '.obsidian');
            if (existsSync(obsidianDir)) {
              const hotkeysPath = join(obsidianDir, 'hotkeys.json');
              if (existsSync(hotkeysPath)) {
                vaults.push(hotkeysPath);
              }
            }
          } catch {
            // Skip inaccessible entries
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }

    return vaults;
  }

  async parse(): Promise<Shortcut[]> {
    const keybindings: Shortcut[] = [];

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
            this.makeShortcut({
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
            this.makeShortcut({
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
