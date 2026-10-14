import { existsSync } from 'node:fs';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { type NormalizedKey, type ParsedKey, normalizeSequence, parseKeyCombo } from './key-normalizer';
import { usKeyForCode } from '../../shared/keys';

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
    return this.getConfigPaths().some((p) => existsSync(p));
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Shortcut[]> {
    const keybindings: Shortcut[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      const entries = this.parseJsonc(content);
      for (const entry of entries) {
        if (typeof entry.command !== 'string' || !entry.command) continue;
        const isUnbound = entry.command.startsWith('-');
        // Removal rules may omit the key ("remove every binding of X").
        const rawKey = typeof entry.key === 'string' ? entry.key : '';
        if (!rawKey && !isUnbound) continue;
        if (this.isImpossibleWhen(entry.when)) continue;

        const { displayKey, searchKey, strokes } = this.normalizeVscodeKey(rawKey);

        keybindings.push(
          this.makeShortcut({
            key: displayKey,
            searchKey,
            strokes,
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

  /** Strip JSONC comments and trailing commas (string-aware), then parse. */
  private parseJsonc(content: string): VscodeKeybinding[] {
    try {
      const parsed: unknown = JSON.parse(stripJsonc(content));
      return Array.isArray(parsed) ? (parsed as VscodeKeybinding[]) : [];
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

  /**
   * Parse a VS Code key: whitespace-separated chords of `mod+key`, where the
   * key is either a key name (`a`, `[`, `enter`, `numpad1`), resolved by
   * VS Code against the active layout, or a scan code in brackets
   * (`[BracketLeft]`, `[KeyA]`), which is a fixed physical position.
   */
  private normalizeVscodeKey(key: string): NormalizedKey {
    const chords = key.trim().split(/\s+/).filter(Boolean);
    const parsed: ParsedKey[] = chords.map((chord) => {
      const scan = chord.match(/^(.*?)\[(\w+)\]$/i);
      if (!scan) return parseKeyCombo(chord);
      const mods = parseKeyCombo(`${scan[1]}x`).modifiers;
      const code = scan[2];
      return { modifiers: mods, key: usKeyForCode(code) ?? code, code };
    });
    return normalizeSequence(parsed);
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
  key?: unknown;
  command?: unknown;
  when?: string;
}

/** Remove line and block comments and trailing commas outside of strings. */
export function stripJsonc(content: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += content[++i] ?? '';
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && content[i + 1] === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && content[i + 1] === '*') {
      const end = content.indexOf('*/', i + 2);
      i = end === -1 ? content.length : end + 1;
    } else {
      out += ch;
    }
  }
  return out.replace(/,(\s*[\]}])/g, '$1');
}
