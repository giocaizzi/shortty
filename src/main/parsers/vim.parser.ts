import { existsSync } from 'node:fs';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { type NormalizedKey, type ParsedKey, Modifier, normalizeSequence } from './key-normalizer';

/** Vim mode prefix → context label. */
const MODE_MAP: Record<string, string> = {
  n: 'normal',
  v: 'visual',
  i: 'insert',
  c: 'command',
  o: 'operator-pending',
  x: 'visual',
  s: 'select',
  t: 'terminal',
  l: 'lang-arg',
};

/** Modes covered by `map` / `noremap` without a prefix, and by `map!`. */
const NVO_CONTEXT = 'normal, visual, operator-pending';
const BANG_CONTEXT = 'insert, command';

/** Vim special key names (`:h key-notation`) → canonical key names. */
const VIM_SPECIAL_KEYS: Record<string, string> = {
  cr: 'Return',
  return: 'Return',
  enter: 'Return',
  esc: 'Escape',
  tab: 'Tab',
  space: 'Space',
  bs: 'Backspace',
  del: 'Delete',
  insert: 'Insert',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  lt: '<',
  bar: '|',
  bslash: '\\',
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
  /^(n|v|i|c|o|x|s|t|l)?(nore)?(?:map)(!?)\s+(.+)$/;

/** Regex for unmap commands. */
const UNMAP_RE =
  /^(n|v|i|c|o|x|s|t|l)?unmap(!?)\s+(?:<buffer>\s+|<silent>\s+|<nowait>\s+)*(\S+)/i;

/** Regex to detect leader / local leader assignment. */
const LEADER_RE =
  /^let\s+(?:g:)?(map(?:local)?leader)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'([^']*)')/;

/** Options that can appear before the LHS in a map command. */
const MAP_OPTIONS = new Set([
  '<buffer>',
  '<silent>',
  '<nowait>',
  '<expr>',
  '<unique>',
  '<script>',
  '<special>',
]);

/** Normalize a leader value to vim key notation (" " / "\<Space>" → <Space>). */
function leaderToNotation(value: string): string {
  if (value === ' ') return '<Space>';
  const special = value.match(/^\\<([^>]+)>$/);
  if (special) return `<${special[1]}>`;
  if (value === '\\\\') return '\\';
  return value;
}

export class VimParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'vim',
      label: 'vim',
      icon: '📝',
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

      // The leader applies to mappings defined after it (vim semantics).
      let leader = '\\';
      let localLeader = '\\';

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('"')) continue;

        const leaderMatch = trimmed.match(LEADER_RE);
        if (leaderMatch) {
          const value = leaderToNotation(leaderMatch[2] ?? leaderMatch[3] ?? '\\');
          if (leaderMatch[1] === 'mapleader') leader = value;
          else localLeader = value;
          continue;
        }
        const leaders = { leader, localLeader };

        const unmapMatch = trimmed.match(UNMAP_RE);
        if (unmapMatch) {
          const [, modePrefix, bang, rawKey] = unmapMatch;
          const context = modePrefix
            ? MODE_MAP[modePrefix]
            : bang ? BANG_CONTEXT : NVO_CONTEXT;
          const { displayKey, searchKey, strokes } = this.normalizeVimKey(rawKey, leaders);

          keybindings.push(
            this.makeShortcut({
              key: displayKey,
              searchKey,
              strokes,
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

        const mapMatch = trimmed.match(MAP_RE);
        if (!mapMatch) continue;

        const [, modePrefix, , bang, rest] = mapMatch;
        const context = modePrefix
          ? MODE_MAP[modePrefix]
          : bang ? BANG_CONTEXT : NVO_CONTEXT;

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
        // <Plug> mappings are internal names, not keys a user presses.
        if (/^<plug>/i.test(rawLhs)) continue;

        const { displayKey, searchKey, strokes } = this.normalizeVimKey(rawLhs, leaders);
        const isNop = /^<nop>$/i.test(rawRhs.trim());

        keybindings.push(
          this.makeShortcut({
            key: displayKey,
            searchKey,
            strokes,
            command: isNop ? 'Disabled' : this.humanizeCommand(rawRhs),
            rawCommand: trimmed,
            context,
            isDefault: false,
            isUnbound: isNop,
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  /**
   * Normalize vim key notation (`<leader>w`, `<C-S-k>`, `gcc`, `<Space>f`)
   * into strokes. Plain characters stay literal (vim is case-sensitive:
   * `W` is not `w`); `<…>` keys become named keys or modifier combos.
   */
  private normalizeVimKey(
    raw: string,
    leaders: { leader: string; localLeader: string },
  ): NormalizedKey {
    const substituted = raw
      .replace(/<leader>/gi, leaders.leader)
      .replace(/<localleader>/gi, leaders.localLeader);

    const parsed: ParsedKey[] = [];
    let remaining = substituted;
    while (remaining.length > 0) {
      const bracketMatch = remaining.match(/^<([^<>\s]+)>/);
      if (bracketMatch) {
        parsed.push(this.parseAngleBracketKey(bracketMatch[1]));
        remaining = remaining.slice(bracketMatch[0].length);
      } else {
        const ch = [...remaining][0];
        parsed.push(ch === ' '
          ? { modifiers: [], key: 'Space' }
          : { modifiers: [], key: ch, literal: true });
        remaining = remaining.slice(ch.length);
      }
    }
    return normalizeSequence(parsed);
  }

  /** Parse the content inside <...> into a key. */
  private parseAngleBracketKey(inner: string): ParsedKey {
    const modifiers: Modifier[] = [];
    let keyPart = inner;

    // Consume modifier prefixes: "C-", "S-", "M-", "A-", "D-"
    while (keyPart.length > 2 && keyPart[1] === '-') {
      const mod = VIM_MODIFIER_MAP[keyPart[0].toLowerCase()];
      if (mod === undefined) break;
      modifiers.push(mod);
      keyPart = keyPart.slice(2);
    }

    const specialKey = VIM_SPECIAL_KEYS[keyPart.toLowerCase()];
    if (specialKey) return { modifiers, key: specialKey };
    if (modifiers.length === 0) {
      // Unknown <name>: keep verbatim.
      return { modifiers, key: `<${inner}>`, literal: true };
    }
    return { modifiers, key: keyPart.toUpperCase() };
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
