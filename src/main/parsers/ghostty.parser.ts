import { existsSync } from 'node:fs';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { US_LAYOUT, usCodeForChar, usKeyForCode } from '../../shared/keys';
import { BaseParser } from './base-parser';
import {
  type NormalizedKey,
  type ParsedKey,
  Modifier,
  canonicalKeyName,
  normalizeSequence,
} from './key-normalizer';

/** Ghostty modifier names and aliases (src/input/key_mods.zig). */
const GHOSTTY_MODS: Record<string, Modifier> = {
  shift: Modifier.Shift,
  ctrl: Modifier.Control,
  control: Modifier.Control,
  alt: Modifier.Option,
  opt: Modifier.Option,
  option: Modifier.Option,
  super: Modifier.Command,
  cmd: Modifier.Command,
  command: Modifier.Command,
};

/** Trigger flags that may prefix a keybind (`global:ctrl+a=...`). */
const FLAG_PREFIXES = new Set(['all', 'global', 'unconsumed', 'performable']);

/** Ghostty 1.1 key names kept for backwards compatibility. */
const LEGACY_UNICODE: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  plus: '+', apostrophe: "'",
};
const LEGACY_PHYSICAL: Record<string, string> = {
  grave_accent: 'Backquote',
  left_bracket: 'BracketLeft',
  right_bracket: 'BracketRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

/** snake_case or CamelCase W3C key code → canonical KeyboardEvent.code. */
function w3cCode(name: string): string | null {
  const camel = name.includes('_') || /^[a-z]/.test(name)
    ? name.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
    : name;
  if (camel in US_LAYOUT || usKeyForCode(camel)) return camel;
  return null;
}

/**
 * Parses Ghostty `keybind = trigger=action` lines (Ghostty 1.2+ syntax,
 * plus the 1.1 names it still accepts). See docs/keyboard-layouts.md for
 * how physical (`key_a`, `bracket_left`) and unicode (`a`, `[`) triggers
 * are displayed.
 */
export class GhosttyParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'ghostty',
      label: 'Ghostty',
      icon: '👻',
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
        const parsed = this.parseLine(line);
        if (!parsed) continue;
        const { key, action, flags, table } = parsed;
        const isUnbound = action === 'unbind';
        const context = [table, ...flags].filter(Boolean).join(', ') || undefined;

        keybindings.push(
          this.makeShortcut({
            key: key.displayKey,
            searchKey: key.searchKey,
            strokes: key.strokes,
            command: isUnbound ? 'Unbind' : this.humanizeAction(action),
            // Matches the cheatsheet ids ("ghostty.new_tab").
            rawCommand: `ghostty.${action}`,
            context,
            isDefault: false,
            isUnbound,
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  /** Parse one config line; null for non-keybind lines, `clear` and `chain`. */
  parseLine(line: string): {
    key: NormalizedKey;
    action: string;
    flags: string[];
    table?: string;
  } | null {
    const match = line.trim().match(/^keybind\s*=\s*(.+)$/);
    if (!match) return null;
    let value = match[1].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);

    const eqIdx = findActionSeparator(value);
    if (eqIdx === -1) return null;
    let trigger = value.slice(0, eqIdx).trim();
    const action = value.slice(eqIdx + 1).trim();
    if (!trigger || !action || trigger === 'chain') return null;

    // Key tables: `table/trigger=action` ('/' only before the '=').
    let table: string | undefined;
    const slash = trigger.indexOf('/');
    if (slash > 0) {
      table = trigger.slice(0, slash);
      trigger = trigger.slice(slash + 1);
    }

    const flags: string[] = [];
    for (;;) {
      const colon = trigger.indexOf(':');
      if (colon <= 0 || !FLAG_PREFIXES.has(trigger.slice(0, colon))) break;
      flags.push(trigger.slice(0, colon));
      trigger = trigger.slice(colon + 1);
    }

    const parts = trigger.split('>').map((t) => this.parseTrigger(t));
    if (parts.some((p) => p === null)) return null;
    return { key: normalizeSequence(parts as ParsedKey[]), action, flags, table };
  }

  /** Parse a single trigger such as `ctrl+shift+a`, `super+==`, `physical:one`. */
  private parseTrigger(raw: string): ParsedKey | null {
    const modifiers: Modifier[] = [];
    let keyPart: string | null = null;
    // Ghostty 1.1 allowed `physical:` before the whole trigger.
    const physical = raw.startsWith('physical:');
    const parts = (physical ? raw.slice('physical:'.length) : raw).split('+');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const mod = GHOSTTY_MODS[part];
      if (mod !== undefined && i < parts.length - 1) {
        modifiers.push(mod);
      } else if (part === '') {
        // An empty part is a literal `+` key.
        keyPart = '+';
      } else {
        keyPart = part;
      }
    }
    if (!keyPart) return null;
    const name = physical && !keyPart.startsWith('physical:') ? `physical:${keyPart}` : keyPart;
    return { modifiers, ...this.parseKeyName(name) };
  }

  private parseKeyName(name: string): { key: string; code?: string } {
    const physicalPrefix = name.startsWith('physical:');
    const bare = physicalPrefix ? name.slice('physical:'.length) : name;

    // Unicode codepoint triggers match the produced character.
    if (!physicalPrefix && [...bare].length === 1) {
      return { key: canonicalKeyName(bare) };
    }
    if (!physicalPrefix && LEGACY_UNICODE[bare]) {
      return { key: LEGACY_UNICODE[bare] };
    }

    const legacy = LEGACY_PHYSICAL[bare];
    const digit = LEGACY_UNICODE[bare];
    const code = legacy
      ?? (digit && /\d/.test(digit) ? `Digit${digit}` : null)
      ?? (bare === 'apostrophe' ? 'Quote' : null)
      ?? ([...bare].length === 1 ? usCodeForChar(bare) : null)
      ?? w3cCode(bare);
    if (code) {
      const key = usKeyForCode(code) ?? code;
      // Named keys (enter, arrows, F-keys) are layout-independent anyway.
      return code in US_LAYOUT ? { key, code } : { key };
    }
    return { key: canonicalKeyName(bare) };
  }

  private humanizeAction(action: string): string {
    return action
      .replace(/_/g, ' ')
      .replace(/:(.+)/, ' ($1)')
      .replace(/^./, (c) => c.toUpperCase());
  }
}

/**
 * Index of the `=` separating trigger and action. Like Ghostty's parser, an
 * `=` followed by `+` or `=` belongs to the trigger (`super+==action`,
 * `=+ctrl`).
 */
function findActionSeparator(value: string): number {
  let offset = 0;
  for (;;) {
    const idx = value.indexOf('=', offset);
    if (idx === -1) return -1;
    if (idx < value.length - 1 && (value[idx + 1] === '+' || value[idx + 1] === '=')) {
      offset = idx + 1;
      continue;
    }
    return idx;
  }
}
