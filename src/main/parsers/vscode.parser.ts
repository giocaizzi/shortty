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
        if (this.isImpossibleWhen(entry.when)) continue;

        const isUnbound = entry.command.startsWith('-');

        keybindings.push(
          this.makeKeybinding({
            key: this.normalizeVscodeKey(entry.key),
            command: this.humanizeCommand(
              isUnbound ? entry.command.slice(1) : entry.command,
            ),
            rawCommand: entry.command,
            context: this.cleanWhenClause(entry.when),
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

  /** Filter out `when` conditions that are impossible on the current platform. */
  private isImpossibleWhen(when?: string): boolean {
    if (!when) return false;

    const isMac = process.platform === 'darwin';
    const isWindows = process.platform === 'win32';
    const isLinux = process.platform === 'linux';

    // Check for platform conditions that contradict the current OS.
    // These are simple top-level checks — VS Code uses `&&` to combine.
    const clauses = when.split(/\s*&&\s*/);
    for (const clause of clauses) {
      const trimmed = clause.trim();
      if (isMac && trimmed === '!isMac') return true;
      if (isMac && trimmed === 'isWindows') return true;
      if (isMac && trimmed === 'isLinux') return true;
      if (isWindows && trimmed === '!isWindows') return true;
      if (isWindows && trimmed === 'isMac') return true;
      if (isLinux && trimmed === '!isLinux') return true;
      if (isLinux && trimmed === 'isMac') return true;
    }

    return false;
  }

  /** Strip redundant platform clauses and simplify `when` for display. */
  private cleanWhenClause(when?: string): string | undefined {
    if (!when) return undefined;

    const isMac = process.platform === 'darwin';
    const isWindows = process.platform === 'win32';
    const isLinux = process.platform === 'linux';

    // Remove clauses that are always true on the current platform
    const alwaysTrue = new Set<string>();
    if (isMac) alwaysTrue.add('isMac').add('!isWindows').add('!isLinux');
    if (isWindows) alwaysTrue.add('isWindows').add('!isMac').add('!isLinux');
    if (isLinux) alwaysTrue.add('isLinux').add('!isMac').add('!isWindows');

    const filtered = when
      .split(/\s*&&\s*/)
      .map((c) => c.trim())
      .filter((c) => !alwaysTrue.has(c));

    if (filtered.length === 0) return undefined;
    return filtered.join(' && ');
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
      .replace(/^terminal\./, 'Terminal: ')
      .replace(/^editor\./, 'Editor: ')
      .replace(/\./g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

interface VscodeKeybinding {
  key: string;
  command: string;
  when?: string;
}
