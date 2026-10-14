import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { formatKeyCombo } from './key-normalizer';

/**
 * Extension keyboard shortcuts from Chrome's profile `Preferences`
 * (`extensions.commands`, keyed "<platform>:<accelerator>"). Extension
 * names and command descriptions come from the manifests stored in the
 * profile's `Secure Preferences` (or `Preferences` on older versions).
 */
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
    return this.getConfigPaths().some((p) => existsSync(p));
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Shortcut[]> {
    const keybindings: Shortcut[] = [];

    for (const filePath of this.getWatchPaths()) {
      const prefs = await this.readJson(filePath);
      if (!prefs) continue;
      const secure = await this.readJson(join(dirname(filePath), 'Secure Preferences'));
      const settings = {
        ...(prefs.extensions?.settings ?? {}),
        ...(secure?.extensions?.settings ?? {}),
      };

      const commands = prefs.extensions?.commands ?? {};
      const platformPrefix = this.getPlatformPrefix();

      for (const [shortcutKey, shortcutData] of Object.entries(commands)) {
        if (!shortcutKey.startsWith(`${platformPrefix}:`)) continue;

        const keyCombo = shortcutKey.slice(platformPrefix.length + 1);
        if (!keyCombo || !shortcutData) continue;

        const manifest = shortcutData.extension
          ? settings[shortcutData.extension]?.manifest
          : undefined;
        const commandName = this.resolveCommandName(shortcutData, manifest);
        if (!commandName) continue;

        const { displayKey, searchKey, strokes } = formatKeyCombo(keyCombo);

        keybindings.push(
          this.makeShortcut({
            key: displayKey,
            searchKey,
            strokes,
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

  private async readJson(filePath: string): Promise<ChromePrefs | null> {
    try {
      const content = await this.readFileIfExists(filePath);
      return content ? (JSON.parse(content) as ChromePrefs) : null;
    } catch {
      return null;
    }
  }

  /** Built-in extension commands and what they do. */
  private static readonly BUILTIN_COMMANDS: Record<string, string> = {
    _execute_action: 'Activate the extension',
    _execute_browser_action: 'Activate the extension',
    _execute_page_action: 'Activate the extension',
    _execute_sidebar_action: 'Open the side panel',
  };

  /** "Extension name: description", with fallbacks when the manifest is unknown. */
  private resolveCommandName(
    data: ChromeCommand,
    manifest: ChromeManifest | undefined,
  ): string | null {
    const name = data.command_name;
    const manifestCommand = name ? manifest?.commands?.[name] : undefined;
    const description = data.description
      ?? manifestCommand?.description
      ?? (name ? ChromeParser.BUILTIN_COMMANDS[name] : undefined)
      ?? name?.replace(/^_+/, '').replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());
    if (!description) return null;

    const extName = manifest?.name && !manifest.name.startsWith('__MSG_')
      ? manifest.name
      : undefined;
    return extName ? `${extName}: ${description}` : description;
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
}

interface ChromeCommand {
  command_name?: string;
  description?: string;
  extension?: string;
  global?: boolean;
}

interface ChromeManifest {
  name?: string;
  commands?: Record<string, { description?: string }>;
}

interface ChromePrefs {
  extensions?: {
    commands?: Record<string, ChromeCommand | undefined>;
    settings?: Record<string, { manifest?: ChromeManifest } | undefined>;
  };
}
