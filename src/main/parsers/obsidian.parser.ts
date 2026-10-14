import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { type NormalizedKey, canonicalKeyName, parseModifierWord, normalizeToCanonical } from './key-normalizer';

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

  /**
   * Discover vault hotkey files: first from Obsidian's own vault registry
   * (obsidian.json), then by scanning common directories.
   */
  static discoverVaults(): string[] {
    const home = homedir();
    const vaults: string[] = [];
    for (const registry of ObsidianParser.registryPaths(home)) {
      try {
        const data = JSON.parse(readFileSync(registry, 'utf-8')) as {
          vaults?: Record<string, { path?: string }>;
        };
        for (const vault of Object.values(data.vaults ?? {})) {
          if (!vault?.path) continue;
          const hotkeysPath = join(vault.path, '.obsidian', 'hotkeys.json');
          if (existsSync(hotkeysPath) && !vaults.includes(hotkeysPath)) vaults.push(hotkeysPath);
        }
      } catch {
        // No registry on this machine
      }
    }
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
              if (existsSync(hotkeysPath) && !vaults.includes(hotkeysPath)) {
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

  /** Locations of Obsidian's obsidian.json vault registry per platform. */
  private static registryPaths(home: string): string[] {
    const xdg = process.env.XDG_CONFIG_HOME || join(home, '.config');
    return [
      join(home, 'Library/Application Support/obsidian/obsidian.json'),
      join(xdg, 'obsidian/obsidian.json'),
      ...(process.env.APPDATA ? [join(process.env.APPDATA, 'obsidian/obsidian.json')] : []),
    ];
  }

  /** Vault name for a `<vault>/.obsidian/hotkeys.json` path. */
  private static vaultName(filePath: string): string | undefined {
    const configDir = dirname(filePath);
    return basename(configDir) === '.obsidian' ? basename(dirname(configDir)) : undefined;
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
      const context = ObsidianParser.vaultName(filePath);

      for (const [commandId, bindings] of Object.entries(hotkeys)) {
        if (!Array.isArray(bindings)) continue;
        // Empty array means the default hotkey was removed
        if (bindings.length === 0) {
          keybindings.push(
            this.makeShortcut({
              key: '',
              searchKey: '',
              command: this.humanizeCommand(commandId),
              rawCommand: commandId,
              context,
              isDefault: false,
              isUnbound: true,
              filePath,
            }),
          );
          continue;
        }

        for (const binding of bindings) {
          if (!binding || typeof binding.key !== 'string') continue;
          const { displayKey, searchKey, strokes } = this.normalizeObsidianKey(binding);
          keybindings.push(
            this.makeShortcut({
              key: displayKey,
              searchKey,
              strokes,
              command: this.humanizeCommand(commandId),
              rawCommand: commandId,
              context,
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

  /** Obsidian modifiers are "Mod" (⌘ on macOS, Ctrl elsewhere), "Ctrl", "Meta", "Alt", "Shift". */
  private normalizeObsidianKey(hotkey: ObsidianHotkey): NormalizedKey {
    const modifiers = (hotkey.modifiers ?? [])
      .map((m) => parseModifierWord(m))
      .filter((m): m is NonNullable<typeof m> => m !== null);

    return normalizeToCanonical({ modifiers, key: canonicalKeyName(hotkey.key) });
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
