import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { type NormalizedKey, Modifier, canonicalKeyName, normalizeSequence } from './key-normalizer';
import { normalizeTerminalKey } from './terminal-keys';
import { shellWords } from './zsh.parser';
import { findOnPath, shellDefaults } from './shell-defaults';

/** Readline functions that are not shortcuts worth listing. */
const NOISE_FUNCTIONS = new Set([
  'self-insert',
  'do-lowercase-version',
  'digit-argument',
  'bracketed-paste-begin',
]);

/** Where default bindings come from, shown as their file path. */
const DEFAULTS_SOURCE = 'bash bind -p';

/** Keymaps that are the emacs keymap under another name. */
const EMACS_KEYMAPS = new Set(['emacs', 'emacs-standard']);

/** Readline symbolic key names (readline(3) "Key Bindings"). */
const READLINE_KEY_NAMES: Record<string, string> = {
  rubout: 'Backspace',
  del: 'Backspace',
  esc: 'Escape',
  escape: 'Escape',
  lfd: 'J',
  newline: 'J',
  ret: 'Return',
  return: 'Return',
  spc: 'Space',
  space: 'Space',
  tab: 'Tab',
};

interface ReadlineBinding {
  key: NormalizedKey;
  value: string;
  isMacro: boolean;
}

/**
 * Parse one readline binding: `"\C-x\C-e": edit-and-execute-command`,
 * `Control-u: unix-line-discard`, `Meta-Rubout: backward-kill-word`,
 * `"\C-xq": "macro text"`.
 */
export function parseReadlineBinding(text: string): ReadlineBinding | null {
  const quoted = text.match(/^"((?:\\.|[^"\\])*)"\s*:\s*(.+)$/);
  if (quoted) {
    const value = quoted[2].trim();
    return {
      key: normalizeTerminalKey(quoted[1], { caret: false }),
      value: value.replace(/^"(.*)"$/, '$1'),
      isMacro: value.startsWith('"') || value.startsWith("'"),
    };
  }

  const named = text.match(/^([A-Za-z][\w-]*)\s*:\s*(.+)$/);
  if (!named) return null;
  const parts = named[1].split('-');
  const modifiers: Modifier[] = [];
  for (const part of parts.slice(0, -1)) {
    const lower = part.toLowerCase();
    if (lower === 'control' || lower === 'c') modifiers.push(Modifier.Control);
    else if (lower === 'meta' || lower === 'm') modifiers.push(Modifier.Option);
    else return null;
  }
  const last = parts[parts.length - 1];
  const nameKey = READLINE_KEY_NAMES[last.toLowerCase()];
  if (!nameKey && last.length !== 1) return null;
  if (last.toLowerCase() === 'lfd' || last.toLowerCase() === 'newline') modifiers.push(Modifier.Control);
  const value = named[2].trim();
  return {
    key: normalizeSequence([{ modifiers, key: nameKey ?? canonicalKeyName(last) }]),
    value: value.replace(/^"(.*)"$/, '$1'),
    isMacro: value.startsWith('"'),
  };
}

/**
 * Bash readline bindings: the emacs-mode defaults (`bind -p` of a bash
 * started without rc files or inputrc) merged with ~/.inputrc and the
 * `bind` lines in ~/.bashrc.
 */
export class BashParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'bash',
      label: 'Bash',
      icon: '🐚',
      platforms: ['darwin', 'linux'],
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.getConfigPaths().some((p) => existsSync(p)) || (await findOnPath('bash')) !== null;
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Shortcut[]> {
    const config = await this.parseConfig();
    const output = await this.loadDefaults();
    const defaults = output ? this.parseDefaults(output) : [];
    return this.mergeWithDefaults(defaults, config);
  }

  /** `bind -p` of an interactive bash without rc files; null when bash is missing. */
  protected loadDefaults(): Promise<string | null> {
    return shellDefaults(
      'bash',
      ['--norc', '--noprofile', '-i', '-c', 'bind -p'],
      { INPUTRC: '/dev/null', HISTFILE: '/dev/null' },
    );
  }

  /**
   * Parse `bind -p` output into default shortcuts, dropping unbound
   * functions, self-insert, digit arguments, the `do-lowercase-version`
   * aliases and repeated keys (`\M-OA` and `\M-[A` are both ↑).
   */
  parseDefaults(output: string): Shortcut[] {
    const seen = new Set<string>();
    const result: Shortcut[] = [];
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('"')) continue;
      const binding = parseReadlineBinding(trimmed);
      if (!binding || binding.isMacro || NOISE_FUNCTIONS.has(binding.value)) continue;
      if (seen.has(binding.key.displayKey)) continue;
      seen.add(binding.key.displayKey);
      result.push(this.toShortcut(binding, trimmed, undefined, DEFAULTS_SOURCE, false, true));
    }
    return result;
  }

  /**
   * A config binding replaces the default bound to the same keymap + key, an
   * unbind (`bind -r`) marks it unbound; new keys are appended.
   */
  mergeWithDefaults(defaults: Shortcut[], config: Shortcut[]): Shortcut[] {
    const identity = (s: Shortcut) =>
      `${!s.context || EMACS_KEYMAPS.has(s.context) ? 'emacs' : s.context}\0${s.key}`;
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

  private async parseConfig(): Promise<Shortcut[]> {
    const keybindings: Shortcut[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      const isInputrc = basename(filePath).includes('inputrc');
      let editingMode: string | undefined;
      let keymap: string | undefined;
      const conditions: string[] = [];

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (isInputrc) {
          const modeMatch = trimmed.match(/^set\s+editing-mode\s+(\S+)/);
          if (modeMatch) {
            editingMode = modeMatch[1];
            continue;
          }
          const keymapMatch = trimmed.match(/^set\s+keymap\s+(\S+)/);
          if (keymapMatch) {
            keymap = keymapMatch[1];
            continue;
          }
          const ifMatch = trimmed.match(/^\$if\s+(.+)$/);
          if (ifMatch) {
            conditions.push(ifMatch[1].trim());
            continue;
          }
          if (/^\$endif\b/.test(trimmed)) {
            conditions.pop();
            continue;
          }
          if (trimmed.startsWith('$')) continue; // $else, $include

          const binding = parseReadlineBinding(trimmed);
          if (!binding) continue;
          const context = keymap ?? this.conditionContext(conditions) ?? editingMode;
          keybindings.push(this.toShortcut(binding, trimmed, context, filePath, false));
          continue;
        }

        const shortcut = this.parseBindCommand(trimmed, filePath);
        if (shortcut) keybindings.push(shortcut);
      }
    }

    return keybindings;
  }

  /** `$if mode=vi` / `$if Bash` → a context label. */
  private conditionContext(conditions: string[]): string | undefined {
    const mode = conditions.map((c) => c.match(/^mode=(\S+)/)?.[1]).find(Boolean);
    return mode ?? undefined;
  }

  /** `bind [-m keymap] [-x] [-r keyseq] 'binding'` in .bashrc. */
  private parseBindCommand(line: string, filePath: string): Shortcut | null {
    if (!/^bind\s/.test(line)) return null;
    const words = shellWords(line);
    let keymap: string | undefined;
    let isShellCommand = false;
    let i = 1;
    while (i < words.length && /^-[a-zA-Z]+$/.test(words[i])) {
      const flags = words[i++].slice(1);
      for (const flag of flags) {
        if (flag === 'm') keymap = words[i++];
        else if (flag === 'x') isShellCommand = true;
        else if (flag === 'r') {
          const seq = words[i++];
          if (!seq) return null;
          const key = normalizeTerminalKey(seq.replace(/^"(.*)"$/, '$1'), { caret: false });
          return this.makeShortcut({
            key: key.displayKey,
            searchKey: key.searchKey,
            strokes: key.strokes,
            command: 'Unbind',
            rawCommand: line,
            context: keymap,
            isDefault: false,
            isUnbound: true,
            filePath,
          });
        } else if ('pPsSvVlqu'.includes(flag)) {
          return null; // query/listing forms
        }
      }
    }
    const spec = words[i];
    if (!spec || spec.startsWith('set ')) return null;
    const binding = parseReadlineBinding(spec);
    if (!binding) return null;
    return this.toShortcut(binding, line, keymap, filePath, isShellCommand);
  }

  private toShortcut(
    binding: ReadlineBinding,
    rawCommand: string,
    context: string | undefined,
    filePath: string,
    isShellCommand: boolean,
    isDefault = false,
  ): Shortcut {
    const command = isShellCommand
      ? `Run: ${binding.value}`
      : binding.isMacro
        ? `Type “${binding.value}”`
        : this.humanizeFunction(binding.value);
    return this.makeShortcut({
      key: binding.key.displayKey,
      searchKey: binding.key.searchKey,
      strokes: binding.key.strokes,
      command,
      rawCommand,
      context,
      isDefault,
      isUnbound: false,
      filePath,
      origin: isDefault ? 'app-defaults' : 'user-config',
    });
  }

  /** Humanize a readline function name. */
  private humanizeFunction(fn: string): string {
    return fn
      .replace(/-/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
}
