import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import {
  type NormalizedKey,
  type ParsedKey,
  Modifier,
  normalizeToCanonical,
} from './key-normalizer';
import { TMUX_COMMAND_LABELS } from './data/tmux-commands';

/** tmux key names (tmux(1) KEY BINDINGS) → canonical key names. */
const TMUX_SPECIAL_KEYS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  BSpace: 'Backspace',
  DC: 'Delete',
  IC: 'Insert',
  NPage: 'PageDown',
  PageDown: 'PageDown',
  PgDn: 'PageDown',
  PPage: 'PageUp',
  PageUp: 'PageUp',
  PgUp: 'PageUp',
  Enter: 'Return',
  Escape: 'Escape',
  Space: 'Space',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
};

/** Default tmux prefix in tmux notation. */
const DEFAULT_PREFIX = 'C-b';

/** One parsed `bind-key` / `unbind-key`. */
interface TmuxBinding {
  table: string;
  key: string;
  command: string;
  unbind: boolean;
  /** `bind -N "note"`: the user's own description of the binding. */
  note?: string;
}

/**
 * Split a tmux config line into words, honouring '…', "…" and backslash
 * escapes. Returns each word with the offset just past it so the command
 * can be taken verbatim from the rest of the line.
 */
function tokenize(line: string): { word: string; end: number }[] {
  const out: { word: string; end: number }[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    let word = '';
    while (i < line.length && !/\s/.test(line[i])) {
      const ch = line[i];
      if (ch === "'" || ch === '"') {
        const close = line.indexOf(ch, i + 1);
        const stop = close === -1 ? line.length : close;
        word += line.slice(i + 1, stop);
        i = stop + 1;
      } else if (ch === '\\' && i + 1 < line.length) {
        word += line[i + 1];
        i += 2;
      } else {
        word += ch;
        i++;
      }
    }
    out.push({ word, end: i });
  }
  return out;
}

/**
 * Parse `bind-key [-nr] [-N note] [-T table] key command…` and
 * `unbind-key [-anq] [-T table] key`, as written in tmux.conf or printed
 * by `tmux list-keys`. Returns null for anything else.
 */
export function parseBindLine(line: string): TmuxBinding | null {
  const trimmed = line.trim();
  if (!/^(?:bind|bind-key|unbind|unbind-key)\s/.test(trimmed)) return null;
  const tokens = tokenize(trimmed);
  const unbind = tokens[0].word.startsWith('unbind');
  let table = 'prefix';
  let note: string | undefined;
  let i = 1;
  while (i < tokens.length && tokens[i].word.startsWith('-') && tokens[i].word.length > 1) {
    const flags = tokens[i].word.slice(1);
    i++;
    for (const flag of flags) {
      if (flag === 'n') table = 'root';
      else if (flag === 'T') table = tokens[i++]?.word ?? table;
      else if (flag === 'N') note = tokens[i++]?.word;
      else if (flag === 'a' && unbind) return null; // unbind -a: all keys
    }
  }
  const keyToken = tokens[i];
  if (!keyToken) return null;
  const command = trimmed.slice(keyToken.end).trim();
  if (!unbind && !command) return null;
  return { table, key: keyToken.word, command, unbind, note };
}

/** Parse tmux key notation (C-a, M-x, C-M-v, S-Up, ^A, BTab, %) into a ParsedKey. */
export function parseTmuxKey(rawKey: string): ParsedKey {
  const modifiers: Modifier[] = [];
  let remaining = rawKey;

  for (;;) {
    if (remaining.length > 2 && /^[CMS]-/.test(remaining)) {
      modifiers.push(
        remaining[0] === 'C' ? Modifier.Control
          : remaining[0] === 'M' ? Modifier.Option
            : Modifier.Shift,
      );
      remaining = remaining.slice(2);
    } else if (remaining.length === 2 && remaining[0] === '^') {
      modifiers.push(Modifier.Control);
      remaining = remaining.slice(1);
    } else {
      break;
    }
  }

  if (remaining === 'BTab') {
    return { modifiers: [...modifiers, Modifier.Shift], key: 'Tab' };
  }
  const special = TMUX_SPECIAL_KEYS[remaining];
  if (special) return { modifiers, key: special };
  if (/^F\d{1,2}$/.test(remaining)) return { modifiers, key: remaining };
  if (/^KP/.test(remaining)) return { modifiers, key: `Numpad${remaining.slice(2)}` };

  if (remaining.length === 1 && /[a-z]/i.test(remaining)) {
    // tmux keys are characters: `N` is Shift+n. Ctrl+letter ignores case.
    const isUpper = remaining !== remaining.toLowerCase();
    if (isUpper && !modifiers.includes(Modifier.Control)) modifiers.push(Modifier.Shift);
    return { modifiers, key: remaining.toUpperCase() };
  }
  return { modifiers, key: remaining };
}

export class TmuxParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'tmux',
      label: 'tmux',
      icon: '🖥️',
      platforms: ['darwin', 'linux'],
    };
  }

  async isAvailable(): Promise<boolean> {
    return (await this.runTmux(['-V'])) !== null;
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  /**
   * Defaults (from a throw-away tmux server started without any config)
   * merged with the user's tmux.conf: a config `bind` replaces the default
   * bound to the same table+key, an `unbind` marks it unbound.
   */
  async parse(): Promise<Shortcut[]> {
    const prefix = this.detectPrefix();
    const defaults = await this.runTmux([
      '-L', `shortty-defaults-${process.pid}`, '-f', '/dev/null',
      'start-server', ';', 'list-keys', ';', 'kill-server',
    ]);
    const defaultShortcuts = defaults ? this.parseTmuxListKeys(defaults, prefix) : [];
    const configShortcuts = await this.parseConfigFiles(prefix);
    return this.mergeWithDefaults(defaultShortcuts, configShortcuts);
  }

  /**
   * Run tmux, resolving to stdout or null when tmux is missing or fails.
   * Asynchronous: parsing runs on the main process, which must not block.
   */
  protected runTmux(args: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      const child = execFile(
        'tmux',
        args,
        { encoding: 'utf-8', timeout: 5000, killSignal: 'SIGKILL' },
        (err, stdout) => resolve(err ? null : stdout),
      );
      child.stdin?.end();
    });
  }

  /** The prefix key: tmux.conf `set -g prefix`, else default C-b. */
  detectPrefix(): ParsedKey {
    for (const filePath of this.getConfigPaths()) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        let found: string | undefined;
        for (const m of content.matchAll(
          /^\s*set(?:-option)?\s+(?:-[a-zA-Z]+\s+)*prefix\s+(\S+)/gm,
        )) {
          found = m[1];
        }
        if (found && found !== 'None') return parseTmuxKey(found.replace(/^['"]|['"]$/g, ''));
      } catch { /* file not found */ }
    }
    return parseTmuxKey(DEFAULT_PREFIX);
  }

  mergeWithDefaults(defaults: Shortcut[], config: Shortcut[]): Shortcut[] {
    const identity = (s: Shortcut) => `${s.context ?? ''}\u0000${s.key}`;
    const byIdentity = new Map<string, Shortcut>();
    for (const s of defaults) byIdentity.set(identity(s), s);
    for (const s of config) {
      const id = identity(s);
      const existing = byIdentity.get(id);
      if (s.isUnbound) {
        if (existing) byIdentity.set(id, { ...existing, isUnbound: true, isDefault: false, origin: 'user-config', filePath: s.filePath });
        continue;
      }
      byIdentity.set(id, s);
    }
    return Array.from(byIdentity.values());
  }

  private async parseConfigFiles(prefix: ParsedKey): Promise<Shortcut[]> {
    const keybindings: Shortcut[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      for (const line of content.split('\n')) {
        const binding = parseBindLine(line);
        if (!binding) continue;
        const shortcut = this.toShortcut(binding, prefix, {
          isDefault: false,
          filePath,
          origin: 'user-config',
        });
        if (shortcut) keybindings.push(shortcut);
      }
    }

    return keybindings;
  }

  /** Tables that produce noise (copy-mode vi/emacs bindings). */
  private static readonly IGNORED_TABLES = new Set([
    'copy-mode',
    'copy-mode-vi',
  ]);

  /** Keys that are mouse events rather than keyboard shortcuts. */
  private static readonly MOUSE_KEY_RE =
    /^(?:[CMS]-)*(?:Mouse|WheelUp|WheelDown|DoubleClick|TripleClick|SecondClick|DragEnd)/;

  parseTmuxListKeys(
    output: string,
    prefix: ParsedKey = parseTmuxKey(DEFAULT_PREFIX),
  ): Shortcut[] {
    const keybindings: Shortcut[] = [];
    for (const line of output.split('\n')) {
      const binding = parseBindLine(line);
      if (!binding || binding.unbind) continue;
      const shortcut = this.toShortcut(binding, prefix, {
        isDefault: true,
        filePath: 'tmux list-keys',
        origin: 'app-defaults',
      });
      if (shortcut) keybindings.push(shortcut);
    }
    return keybindings;
  }

  private toShortcut(
    binding: TmuxBinding,
    prefix: ParsedKey,
    meta: Pick<Shortcut, 'isDefault' | 'filePath' | 'origin'>,
  ): Shortcut | null {
    const { table, key, command, unbind, note } = binding;
    if (TmuxParser.IGNORED_TABLES.has(table)) return null;
    if (TmuxParser.MOUSE_KEY_RE.test(key)) return null;

    const parsed = parseTmuxKey(key);
    const normalized: NormalizedKey = normalizeToCanonical(
      table === 'prefix' ? { ...parsed, prefix } : parsed,
    );
    return this.makeShortcut({
      key: normalized.displayKey,
      searchKey: normalized.searchKey,
      strokes: normalized.strokes,
      command: unbind ? 'Unbind' : note ?? this.humanizeCommand(command),
      rawCommand: unbind ? `unbind ${table} ${key}` : command,
      context: table !== 'prefix' && table !== 'root' ? table : undefined,
      isUnbound: unbind,
      ...meta,
    });
  }

  private humanizeCommand(command: string): string {
    // Prompts and confirmations: describe the command they end up running.
    const inner = command.match(/^(?:command-prompt|confirm-before)\b.*?(?:\{\s*([\w-]+)[^}]*\}|\s([a-z]+-[a-z-]+)\s*$)/);
    if (inner && (inner[1] ?? inner[2])) return this.humanizeCommand(inner[1] ?? inner[2]);
    const [cmd, ...args] = command.trim().split(/\s+/);
    const base = TMUX_COMMAND_LABELS[cmd]
      ?? cmd.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
    if (cmd === 'split-window' || cmd === 'splitw') {
      return args.includes('-h') ? `${base} Horizontally` : `${base} Vertically`;
    }
    if (cmd === 'select-pane' || cmd === 'resize-pane') {
      const dir = args.find((a) => /^-[UDLR]$/.test(a));
      const names: Record<string, string> = { '-U': 'Up', '-D': 'Down', '-L': 'Left', '-R': 'Right' };
      if (dir) return `${base} ${names[dir]}`;
      if (cmd === 'resize-pane' && args.includes('-Z')) return 'Zoom Pane';
    }
    return base;
  }
}
