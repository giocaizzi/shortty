import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import {
  type ParsedKey,
  Modifier,
  normalizeToCanonical,
} from './key-normalizer';
import { TMUX_COMMAND_LABELS } from './data/tmux-commands';

/** Map tmux special key names to display glyphs/names. */
const TMUX_SPECIAL_KEYS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  BSpace: 'Delete',
  NPage: 'PageDown',
  PPage: 'PageUp',
  Enter: 'Return',
  Space: 'Space',
  Tab: 'Tab',
  Escape: 'Escape',
  DC: 'Delete',
  IC: 'Insert',
  Home: 'Home',
  End: 'End',
};

/** Default tmux prefix in tmux notation. */
const DEFAULT_PREFIX = 'C-b';

/** Pre-computed display form of the default prefix. */
const DEFAULT_PREFIX_DISPLAY = normalizeToCanonical({
  modifiers: [Modifier.Control],
  key: 'B',
}).displayKey;

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
    try {
      execSync('which tmux', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Shortcut[]> {
    const resolvedPrefix = this.detectPrefix();
    const configKeybindings = await this.parseConfigFiles(resolvedPrefix);
    if (configKeybindings.length > 0) return configKeybindings;
    return this.parseLiveKeys(resolvedPrefix);
  }

  /** Detect the user's tmux prefix key and return its normalized display form. */
  private detectPrefix(): string {
    // Try live tmux first
    try {
      const raw = execSync('tmux show-option -gv prefix 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 2000,
      }).trim();
      if (raw) {
        const { displayKey } = this.normalizeTmuxKey(raw);
        return displayKey;
      }
    } catch { /* tmux not running */ }

    // Fall back to parsing config files
    for (const filePath of this.getConfigPaths()) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const match = content.match(/^\s*set(?:-option)?\s+(?:-g\s+)?prefix\s+(\S+)/m);
        if (match) {
          const { displayKey } = this.normalizeTmuxKey(match[1]);
          return displayKey;
        }
      } catch { /* file not found */ }
    }

    // Default tmux prefix
    const { displayKey } = this.normalizeTmuxKey(DEFAULT_PREFIX);
    return displayKey;
  }

  private async parseConfigFiles(resolvedPrefix: string): Promise<Shortcut[]> {
    const keybindings: Shortcut[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const match = trimmed.match(
          /^(?:bind-key|bind)\s+(?:-([nrT])\s+)?(?:(\S+)\s+)?(\S+)\s+(.+)$/,
        );
        if (!match) continue;

        const [, flag, tableOrKey, keyOrCmd, rest] = match;
        const isRoot = flag === 'n';
        let key: string;
        let command: string;

        if (flag === 'T') {
          if (tableOrKey && TmuxParser.IGNORED_TABLES.has(tableOrKey)) continue;
          key = keyOrCmd;
          command = rest;
        } else if (isRoot) {
          key = tableOrKey ?? keyOrCmd;
          command = rest;
        } else {
          key = tableOrKey ?? keyOrCmd;
          command = `${keyOrCmd} ${rest}`.trim();
        }

        if (TmuxParser.MOUSE_KEY_RE.test(key)) continue;

        const prefixKey = isRoot ? undefined : resolvedPrefix;
        const { displayKey, searchKey } = this.normalizeTmuxKey(key, prefixKey);

        keybindings.push(
          this.makeShortcut({
            key: displayKey,
            searchKey,
            command: this.humanizeCommand(command),
            rawCommand: command,
            isDefault: false,
            isUnbound: false,
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  private parseLiveKeys(resolvedPrefix: string): Shortcut[] {
    try {
      const output = execSync('tmux list-keys 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return this.parseTmuxListKeys(output, resolvedPrefix);
    } catch {
      return [];
    }
  }

  /** Tables that produce noise (copy-mode vi/emacs bindings, mouse events). */
  private static readonly IGNORED_TABLES = new Set([
    'copy-mode',
    'copy-mode-vi',
  ]);

  /** Keys that are mouse events rather than keyboard shortcuts. */
  private static readonly MOUSE_KEY_RE =
    /^(?:Mouse|WheelUp|WheelDown|DoubleClick|TripleClick|DragEnd|SecondClick)/;

  parseTmuxListKeys(
    output: string,
    resolvedPrefix: string = DEFAULT_PREFIX_DISPLAY,
  ): Shortcut[] {
    const keybindings: Shortcut[] = [];

    for (const line of output.split('\n')) {
      const match = line.match(
        /^bind-key\s+-T\s+(\S+)\s+(\S+)\s+(.+)$/,
      );
      if (!match) continue;

      const [, table, key, command] = match;

      if (TmuxParser.IGNORED_TABLES.has(table)) continue;
      if (TmuxParser.MOUSE_KEY_RE.test(key)) continue;

      const prefixKey = table === 'root' ? undefined : resolvedPrefix;
      const { displayKey, searchKey } = this.normalizeTmuxKey(key, prefixKey);

      keybindings.push(
        this.makeShortcut({
          key: displayKey,
          searchKey,
          command: this.humanizeCommand(command),
          rawCommand: command,
          context: table !== 'prefix' && table !== 'root' ? table : undefined,
          isDefault: true,
          isUnbound: false,
          filePath: 'tmux list-keys',
        }),
      );
    }

    return keybindings;
  }

  /** Parse tmux key notation (C-a, M-x, C-M-v) into a normalized form. */
  private normalizeTmuxKey(
    rawKey: string,
    prefix?: string,
  ): { displayKey: string; searchKey: string } {
    const modifiers: Modifier[] = [];
    let remaining = rawKey;

    // Parse chained modifier prefixes: C-, M-, S-
    while (remaining.length > 2) {
      if (remaining.startsWith('C-')) {
        modifiers.push(Modifier.Control);
        remaining = remaining.slice(2);
      } else if (remaining.startsWith('M-')) {
        modifiers.push(Modifier.Option);
        remaining = remaining.slice(2);
      } else if (remaining.startsWith('S-')) {
        modifiers.push(Modifier.Shift);
        remaining = remaining.slice(2);
      } else {
        break;
      }
    }

    // Map special key names or uppercase single letters
    const keyName = TMUX_SPECIAL_KEYS[remaining] ?? (
      remaining.length === 1 ? remaining.toUpperCase() : remaining
    );

    const parsed: ParsedKey = { modifiers, key: keyName, prefix };
    return normalizeToCanonical(parsed);
  }

  private humanizeCommand(command: string): string {
    const cmd = command.trim().split(/\s+/)[0];
    if (TMUX_COMMAND_LABELS[cmd]) return TMUX_COMMAND_LABELS[cmd];
    return cmd.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }
}
