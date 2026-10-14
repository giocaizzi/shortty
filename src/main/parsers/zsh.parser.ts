import { existsSync } from 'node:fs';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { normalizeTerminalKey } from './terminal-keys';

/** Split a shell line into words, removing '…' / "…" quoting. */
export function shellWords(line: string): string[] {
  const words: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length || line[i] === '#') break;
    let word = '';
    while (i < line.length && !/\s/.test(line[i])) {
      const ch = line[i];
      if (ch === "'") {
        const close = line.indexOf("'", i + 1);
        const stop = close === -1 ? line.length : close;
        word += line.slice(i + 1, stop);
        i = stop + 1;
      } else if (ch === '"') {
        let j = i + 1;
        while (j < line.length && line[j] !== '"') {
          // Inside "…" only \" and \\ are shell escapes; keep \e, \C-x etc.
          if (line[j] === '\\' && (line[j + 1] === '"' || line[j + 1] === '\\')) {
            word += line[j + 1];
            j += 2;
          } else {
            word += line[j++];
          }
        }
        i = j + 1;
      } else {
        word += ch;
        i++;
      }
    }
    words.push(word);
  }
  return words;
}

/** zsh `bindkey` lines from .zshrc. */
export class ZshParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'zsh',
      label: 'Zsh',
      icon: '🐚',
      platforms: ['darwin', 'linux'],
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

      for (const line of content.split('\n')) {
        const shortcut = this.parseLine(line, filePath);
        if (shortcut) keybindings.push(shortcut);
      }
    }

    return keybindings;
  }

  /**
   * `bindkey [-M keymap] [-s|-r] in-string [widget|out-string]`.
   * Keymap-selection forms (`bindkey -e`, `bindkey -v`) and lines using
   * parameter expansion (`"${terminfo[kcuu1]}"`) are skipped.
   */
  private parseLine(line: string, filePath: string): Shortcut | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('bindkey')) return null;
    const words = shellWords(trimmed);
    if (words[0] !== 'bindkey') return null;

    let keymap: string | undefined;
    let isMacro = false;
    let isRemove = false;
    let i = 1;
    while (i < words.length && /^-[A-Za-z]+$/.test(words[i])) {
      const flags = words[i++].slice(1);
      for (const flag of flags) {
        if (flag === 'M') keymap = words[i++];
        else if (flag === 's') isMacro = true;
        else if (flag === 'r') isRemove = true;
        else if (flag === 'R' || flag === 'l' || flag === 'L' || flag === 'D' || flag === 'A' || flag === 'N') return null;
      }
    }

    const sequence = words[i];
    const target = words[i + 1];
    if (!sequence || sequence.includes('$')) return null;
    if (!isRemove && !target) return null;

    const { displayKey, searchKey, strokes } = normalizeTerminalKey(sequence, { caret: true });
    const command = isRemove
      ? 'Unbind'
      : isMacro
        ? `Type “${target}”`
        : this.humanizeWidget(target);

    return this.makeShortcut({
      key: displayKey,
      searchKey,
      strokes,
      command,
      rawCommand: trimmed,
      context: keymap,
      isDefault: false,
      isUnbound: isRemove,
      filePath,
    });
  }

  private humanizeWidget(widget: string): string {
    return widget
      .replace(/-/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
}
