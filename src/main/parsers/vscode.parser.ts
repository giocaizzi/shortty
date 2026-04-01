import { existsSync } from 'node:fs';
import type { Keybinding, ParserMeta } from '../../shared/types';
import { getConfigPaths } from '../platform/paths';
import { BaseParser } from './base-parser';

export class VscodeParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'vscode',
      label: 'VS Code',
      icon: '💻',
      platforms: ['darwin', 'win32', 'linux'],
    };
  }

  async isAvailable(): Promise<boolean> {
    return getConfigPaths('vscode').some((p) => existsSync(p));
  }

  getWatchPaths(): string[] {
    return getConfigPaths('vscode').filter((p) => existsSync(p));
  }

  async parse(): Promise<Keybinding[]> {
    const keybindings: Keybinding[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      const entries = this.parseJsonc(content);
      for (const entry of entries) {
        if (!entry.key || !entry.command) continue;

        const isUnbound = entry.command.startsWith('-');
        const rawCommand = isUnbound ? entry.command.slice(1) : entry.command;

        keybindings.push(
          this.makeKeybinding({
            key: this.normalizeVscodeKey(entry.key),
            command: this.humanizeCommand(rawCommand),
            rawCommand: entry.command,
            context: entry.when,
            isDefault: false,
            isUnbound,
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  /** Strip JSONC comments and trailing commas, then parse. */
  private parseJsonc(content: string): VscodeKeybinding[] {
    const stripped = content
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,\s*([\]}])/g, '$1');

    try {
      return JSON.parse(stripped);
    } catch {
      return [];
    }
  }

  private normalizeVscodeKey(key: string): string {
    // Handle multi-chord keys like "cmd+k cmd+s"
    return key
      .split(' ')
      .map((chord) => this.normalizeKey(chord))
      .join(' ');
  }

  private humanizeCommand(command: string): string {
    return command
      .replace(/^workbench\.action\./, '')
      .replace(/^editor\.action\./, '')
      .replace(/\./g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase());
  }
}

interface VscodeKeybinding {
  key: string;
  command: string;
  when?: string;
}
