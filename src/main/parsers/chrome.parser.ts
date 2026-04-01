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

        const commandName = this.resolveCommandName(shortcutData);
        if (!commandName) continue;

        keybindings.push(
          this.makeKeybinding({
            key: this.normalizeChromeKey(keyCombo),
            command: commandName,
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

  /** Internal Chrome command names that aren't useful to show. */
  private static readonly INTERNAL_COMMANDS = new Set([
    '_execute_action',
    '_execute_browser_action',
    '_execute_page_action',
    '_execute_sidebar_action',
  ]);

  private resolveCommandName(data: {
    command_name?: string;
    description?: string;
  }): string | null {
    // Prefer human-readable description
    if (data.description) return data.description;

    // Skip entries with only an internal Chrome command name
    if (!data.command_name || ChromeParser.INTERNAL_COMMANDS.has(data.command_name)) {
      return null;
    }

    // Humanize the command name (e.g. "toggle_pause" → "Toggle Pause")
    return data.command_name
      .replace(/^_+/, '')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
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
