import { existsSync } from 'node:fs';
import type { Keybinding, ParserMeta } from '../../shared/types';
import { getConfigPaths } from '../platform/paths';
import { BaseParser } from './base-parser';

export class ChromeParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'chrome',
      label: 'Chrome',
      icon: '🌐',
      platforms: ['darwin', 'win32', 'linux'],
    };
  }

  async isAvailable(): Promise<boolean> {
    return getConfigPaths('chrome').some((p) => existsSync(p));
  }

  getWatchPaths(): string[] {
    return getConfigPaths('chrome').filter((p) => existsSync(p));
  }

  async parse(): Promise<Keybinding[]> {
    const keybindings: Keybinding[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      let prefs: Record<string, unknown>;
      try {
        prefs = JSON.parse(content);
      } catch {
        continue;
      }

      const commands = (prefs as ChromePrefs).extensions?.commands ?? {};
      const platformPrefix = this.getPlatformPrefix();

      for (const [shortcutKey, shortcutData] of Object.entries(commands)) {
        if (!shortcutKey.startsWith(`${platformPrefix}:`)) continue;

        const keyCombo = shortcutKey.slice(platformPrefix.length + 1);
        if (!keyCombo) continue;

        const extensionName =
          shortcutData.description ||
          shortcutData.command_name ||
          'Unknown Extension';

        keybindings.push(
          this.makeKeybinding({
            key: this.normalizeChromeKey(keyCombo),
            command: `${extensionName}`,
            rawCommand: shortcutKey,
            context: shortcutData.global ? 'global' : undefined,
            isDefault: false,
            isUnbound: false,
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  private getPlatformPrefix(): string {
    switch (process.platform) {
      case 'darwin':
        return 'mac';
      case 'win32':
        return 'windows';
      default:
        return 'linux';
    }
  }

  private normalizeChromeKey(key: string): string {
    return this.normalizeKey(key.replace(/-/g, '+'));
  }
}

interface ChromePrefs {
  extensions?: {
    commands?: Record<
      string,
      {
        command_name?: string;
        description?: string;
        extension?: string;
        global?: boolean;
      }
    >;
  };
}
