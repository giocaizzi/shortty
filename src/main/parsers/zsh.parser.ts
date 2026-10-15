import { existsSync } from 'node:fs';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { normalizeTerminalKey } from './terminal-keys';
import { findOnPath, shellDefaults } from './shell-defaults';

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

/** Built-in widgets that are not shortcuts worth listing. */
const NOISE_WIDGETS = new Set([
  'self-insert',
  'self-insert-unmeta',
  'bracketed-paste',
  'digit-argument',
  'beep',
  'undefined-key',
]);

/** Where default bindings come from, shown as their file path. */
const DEFAULTS_SOURCE = 'zsh bindkey -L';

/**
 * zsh line-editor bindings: the built-in defaults of the keymap the user
 * selects (`zsh -f` + `bindkey -L`, emacs unless the rc says `bindkey -v`)
 * merged with the `bindkey` lines of .zshrc.
 */
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
    return this.getConfigPaths().some((p) => existsSync(p)) || (await findOnPath('zsh')) !== null;
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Shortcut[]> {
    const config: Shortcut[] = [];
    let viMode = false;

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      for (const line of content.split('\n')) {
        const mode = line.match(/^\s*bindkey\s+-([ev])\s*(?:#.*)?$/);
        if (mode) viMode = mode[1] === 'v';
        const shortcut = this.parseLine(line, filePath);
        if (shortcut) config.push(shortcut);
      }
    }

    const output = await this.loadDefaults(viMode);
    const defaults = output ? this.parseDefaults(output) : [];
    return this.mergeWithDefaults(defaults, config, viMode);
  }

  /** `bindkey -L` of a zsh started without rc files; null when zsh is missing. */
  protected loadDefaults(viMode: boolean): Promise<string | null> {
    const script = viMode ? 'bindkey -L -M viins; bindkey -L -M vicmd' : 'bindkey -L';
    return shellDefaults('zsh', ['-f', '-c', script]);
  }

  /**
   * Parse `bindkey -L` output into default shortcuts, dropping self-insert
   * ranges, digit arguments, vi's internal macros and other noise, the
   * `ESC <Letter>` duplicates
   * of `ESC <letter>`, and repeated keys (`^[OA` and `^[[A` are both ↑).
   */
  parseDefaults(output: string): Shortcut[] {
    const lines = output.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('bindkey '));
    const widgetBySequence = new Map<string, string>();
    for (const line of lines) {
      const words = shellWords(line);
      widgetBySequence.set(words.slice(0, -1).join('\0'), words[words.length - 1]);
    }

    const seen = new Set<string>();
    const result: Shortcut[] = [];
    for (const line of lines) {
      const words = shellWords(line);
      const widget = words[words.length - 1];
      if (NOISE_WIDGETS.has(widget) || words.slice(1, -2).includes('-s')) continue;
      const sequence = words[words.length - 2];
      const upper = sequence.match(/^\^\[([A-Z])$/);
      if (upper) {
        const lower = [...words.slice(0, -2), `^[${upper[1].toLowerCase()}`].join('\0');
        if (widgetBySequence.get(lower) === widget) continue;
      }
      const shortcut = this.parseLine(line, DEFAULTS_SOURCE, true);
      if (!shortcut) continue;
      const id = `${shortcut.context ?? ''}\0${shortcut.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(shortcut);
    }
    return result;
  }

  /**
   * A config `bindkey` replaces the default bound to the same keymap + key,
   * `bindkey -r` marks it unbound; new keys are appended. Bindings without
   * `-M` belong to the main keymap (viins in vi mode, emacs otherwise).
   */
  mergeWithDefaults(defaults: Shortcut[], config: Shortcut[], viMode: boolean): Shortcut[] {
    const main = viMode ? 'viins' : 'emacs';
    const identity = (s: Shortcut) =>
      `${!s.context || s.context === 'main' ? main : s.context}\0${s.key}`;
    const byIdentity = new Map<string, Shortcut>();
    for (const s of defaults) byIdentity.set(identity(s), s);
    for (const s of config) {
      const id = identity(s);
      const existing = byIdentity.get(id);
      if (s.isUnbound && existing) {
        byIdentity.set(id, { ...existing, isUnbound: true, isDefault: false, origin: 'user-config', filePath: s.filePath });
      } else {
        byIdentity.set(id, s);
      }
    }
    return Array.from(byIdentity.values());
  }

  /**
   * `bindkey [-M keymap] [-s|-r] in-string [widget|out-string]`.
   * Keymap-selection forms (`bindkey -e`, `bindkey -v`) and lines using
   * parameter expansion (`"${terminfo[kcuu1]}"`) are skipped.
   */
  private parseLine(line: string, filePath: string, isDefault = false): Shortcut | null {
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
        else if (flag === 'a') keymap = 'vicmd';
        else if (flag === 's') isMacro = true;
        else if (flag === 'r') isRemove = true;
        else if (flag === 'R' || flag === 'l' || flag === 'L' || flag === 'D' || flag === 'A' || flag === 'N') return null;
      }
    }

    if (words[i] === '--') i++;
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
      isDefault,
      isUnbound: isRemove,
      filePath,
      origin: isDefault ? 'app-defaults' : 'user-config',
    });
  }

  private humanizeWidget(widget: string): string {
    return widget
      .replace(/-/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
}
