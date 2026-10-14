import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { type NormalizedKey, Modifier, canonicalKeyName, normalizeSequence } from './key-normalizer';
import { normalizeTerminalKey } from './terminal-keys';
import { shellWords } from './zsh.parser';

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

/** Bash readline bindings from ~/.inputrc and `bind` lines in ~/.bashrc. */
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
      isDefault: false,
      isUnbound: false,
      filePath,
    });
  }

  /** Humanize a readline function name. */
  private humanizeFunction(fn: string): string {
    return fn
      .replace(/-/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
}
