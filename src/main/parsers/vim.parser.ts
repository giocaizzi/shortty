import { existsSync } from 'node:fs';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { type ParsedKey, Modifier, formatParsedKey } from './key-normalizer';

/** Vim mode prefix → context label. */
const MODE_MAP: Record<string, string> = {
  n: 'normal',
  v: 'visual',
  i: 'insert',
  c: 'command',
  o: 'operator-pending',
  x: 'visual',
  s: 'select',
};

/** Vim special key names → display names. */
const VIM_SPECIAL_KEYS: Record<string, string> = {
  cr: 'Return',
  return: 'Return',
  enter: 'Return',
  esc: 'Escape',
  tab: 'Tab',
  space: 'Space',
  bs: 'Backspace',
  del: 'Delete',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  f1: 'F1',
  f2: 'F2',
  f3: 'F3',
  f4: 'F4',
  f5: 'F5',
  f6: 'F6',
  f7: 'F7',
  f8: 'F8',
  f9: 'F9',
  f10: 'F10',
  f11: 'F11',
  f12: 'F12',
};

/** Vim modifier prefix → Modifier enum. */
const VIM_MODIFIER_MAP: Record<string, Modifier> = {
  c: Modifier.Control,
  s: Modifier.Shift,
  m: Modifier.Option,
  a: Modifier.Option,
  d: Modifier.Command,
};

/**
 * Regex to match vim map lines.
 * Groups: 1=mode prefix, 2="nore" (non-recursive), 3="!" suffix,
 * 4=options+lhs+rhs (captured loosely, parsed further).
 */
const MAP_RE =
  /^(n|v|i|c|o|x|s)?(nore)?(?:map)(!?)\s+(.+)$/;

/** Regex for unmap commands. */
const UNMAP_RE =
  /^(n|v|i|c|o|x|s)?unmap(!?)\s+(?:<buffer>\s+|<silent>\s+|<nowait>\s+)*(\S+)/;

/** Regex to detect leader key assignment. */
const LEADER_RE =
  /^let\s+(?:g:)?mapleader\s*=\s*["'](.+?)["']/;

/** Options that can appear before the LHS in a map command. */
const MAP_OPTIONS = new Set([
  '<buffer>',
  '<silent>',
  '<nowait>',
  '<expr>',
  '<unique>',
]);

export class VimParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'vim',
      label: 'vim',
      icon: '📝',
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

      const lines = content.split('\n');

      // First pass: detect leader key
      let leader = '\\';
      for (const line of lines) {
        const leaderMatch = line.trim().match(LEADER_RE);
        if (leaderMatch) {
          leader = leaderMatch[1];
        }
      }

      // Second pass: parse mappings
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('"')) continue;

        // Skip leader assignment lines
        if (LEADER_RE.test(trimmed)) continue;

        // Try unmap
        const unmapMatch = trimmed.match(UNMAP_RE);
        if (unmapMatch) {
          const [, modePrefix, , rawKey] = unmapMatch;
          const context = modePrefix ? MODE_MAP[modePrefix] : 'normal';
          const { displayKey, searchKey } = this.normalizeVimKey(
            rawKey,
            leader,
          );

          keybindings.push(
            this.makeShortcut({
              key: displayKey,
              searchKey,
              command: 'Unmap',
              rawCommand: trimmed,
              context,
              isDefault: false,
              isUnbound: true,
              filePath,
            }),
          );
          continue;
        }

        // Try map/noremap
        const mapMatch = trimmed.match(MAP_RE);
        if (!mapMatch) continue;

        const [, modePrefix, , , rest] = mapMatch;
        const context = modePrefix ? MODE_MAP[modePrefix] : 'normal';

        // Parse rest: skip options, then LHS, then RHS
        const parts = rest.split(/\s+/);
        let idx = 0;
        while (idx < parts.length && MAP_OPTIONS.has(parts[idx].toLowerCase())) {
          idx++;
        }

        if (idx >= parts.length) continue;
        const rawLhs = parts[idx];
        const rawRhs = parts.slice(idx + 1).join(' ');
        if (!rawRhs) continue;

        const { displayKey, searchKey } = this.normalizeVimKey(rawLhs, leader);
        const command = this.humanizeCommand(rawRhs);

        keybindings.push(
          this.makeShortcut({
            key: displayKey,
            searchKey,
            command,
            rawCommand: trimmed,
            context,
            isDefault: false,
            isUnbound: false,
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  /** Normalize a vim key notation string into display and search forms. */
  private normalizeVimKey(
    raw: string,
    leader: string,
  ): { displayKey: string; searchKey: string } {
    // Substitute <leader> with actual leader key
    const substituted = raw.replace(/<leader>/gi, leader);

    // Try to parse as a single <...> notation
    const angleBracket = substituted.match(/^<([^>]+)>$/);
    if (angleBracket) {
      return this.parseAngleBracketKey(angleBracket[1]);
    }

    // Check for sequences containing angle brackets mixed with plain keys
    const segments: string[] = [];
    let remaining = substituted;
    while (remaining.length > 0) {
      const bracketMatch = remaining.match(/^<([^>]+)>/);
      if (bracketMatch) {
        const parsed = this.parseAngleBracketKey(bracketMatch[1]);
        segments.push(parsed.displayKey);
        remaining = remaining.slice(bracketMatch[0].length);
      } else {
        segments.push(remaining[0]);
        remaining = remaining.slice(1);
      }
    }

    if (segments.length === 1) {
      return { displayKey: segments[0], searchKey: segments[0].toLowerCase() };
    }

    const display = segments.join(' ');
    return { displayKey: display, searchKey: display.toLowerCase() };
  }

  /** Parse the content inside <...> into display/search key. */
  private parseAngleBracketKey(inner: string): {
    displayKey: string;
    searchKey: string;
  } {
    // Check for modifier pattern: C-x, S-x, M-x, A-x, D-x, or combos like C-S-x
    const modifiers: Modifier[] = [];
    let keyPart = inner;

    // Consume modifier prefixes: "C-", "S-", "M-", "A-", "D-"
    while (keyPart.length > 2 && keyPart[1] === '-') {
      const mod = VIM_MODIFIER_MAP[keyPart[0].toLowerCase()];
      if (mod !== undefined) {
        modifiers.push(mod);
        keyPart = keyPart.slice(2);
      } else {
        break;
      }
    }

    // Resolve the key part
    const specialKey = VIM_SPECIAL_KEYS[keyPart.toLowerCase()];
    const resolvedKey = specialKey ?? keyPart.toUpperCase();

    if (modifiers.length > 0) {
      const parsed: ParsedKey = { modifiers, key: resolvedKey };
      return formatParsedKey(parsed);
    }

    // No modifiers - just a special key name
    return {
      displayKey: resolvedKey,
      searchKey: resolvedKey.toLowerCase(),
    };
  }

  /** Try to humanize a vim command RHS. */
  private humanizeCommand(rhs: string): string {
    // Strip leading colon and trailing <CR>
    const cmd = rhs.replace(/<CR>$/i, '').replace(/^:/, '');
    if (cmd !== rhs) {
      // Was an ex command
      return cmd.trim() || rhs;
    }
    return rhs;
  }
}
