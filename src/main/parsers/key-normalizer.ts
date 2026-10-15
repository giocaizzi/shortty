import {
  type KeyModifier,
  type KeyStroke,
  NAMED_KEY_SEARCH,
  SYMBOL_NAMES,
  sortMods,
  strokeToDisplay,
} from '../../shared/keys';

/** Modifier key identifiers in canonical Apple HIG order: ⌃ ⌥ ⇧ ⌘ */
export enum Modifier {
  Control = 0,
  Option = 1,
  Shift = 2,
  Command = 3,
}

/**
 * Structured representation of one key combination.
 * `code` marks a physical key position (KeyboardEvent.code); `literal`
 * marks verbatim text (vim sequences). `prefix` is a leading stroke
 * (tmux prefix key).
 */
export interface ParsedKey {
  modifiers: Modifier[];
  key: string;
  code?: string;
  literal?: boolean;
  prefix?: ParsedKey;
}

/** Display, search and structured forms of a key sequence. */
export interface NormalizedKey {
  displayKey: string;
  searchKey: string;
  strokes: KeyStroke[];
}

const MODIFIER_NAMES: Record<Modifier, KeyModifier> = {
  [Modifier.Control]: 'ctrl',
  [Modifier.Option]: 'opt',
  [Modifier.Shift]: 'shift',
  [Modifier.Command]: 'cmd',
};

const MODIFIER_WORDS: Record<string, Modifier> = {
  commandorcontrol: Modifier.Command,
  cmdorctrl: Modifier.Command,
  cmd: Modifier.Command,
  command: Modifier.Command,
  meta: Modifier.Command,
  super: Modifier.Command,
  win: Modifier.Command,
  ctrl: Modifier.Control,
  control: Modifier.Control,
  macctrl: Modifier.Control,
  shift: Modifier.Shift,
  alt: Modifier.Option,
  opt: Modifier.Option,
  option: Modifier.Option,
};

/** Parse a text word into a Modifier, handling platform-aware "Mod". */
export function parseModifierWord(word: string): Modifier | null {
  const lower = word.toLowerCase();
  if (lower === 'mod') {
    return process.platform === 'darwin' ? Modifier.Command : Modifier.Control;
  }
  return MODIFIER_WORDS[lower] ?? null;
}

/** Key names (as used across config formats) → canonical named key. */
const NAMED_WORDS: Record<string, string> = {
  enter: 'Return',
  return: 'Return',
  cr: 'Return',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  space: 'Space',
  spacebar: 'Space',
  backspace: 'Backspace',
  bs: 'Backspace',
  bspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  up: '↑',
  arrowup: '↑',
  uparrow: '↑',
  down: '↓',
  arrowdown: '↓',
  downarrow: '↓',
  left: '←',
  arrowleft: '←',
  leftarrow: '←',
  right: '→',
  arrowright: '→',
  rightarrow: '→',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pgup: 'PageUp',
  pagedown: 'PageDown',
  pgdn: 'PageDown',
  insert: 'Insert',
  ins: 'Insert',
  capslock: 'CapsLock',
  help: 'Help',
  plus: '+',
  minus: '-',
  backtick: '`',
  comma: ',',
  period: '.',
};

/**
 * Canonicalize a key name: single characters are upper-cased (letters),
 * named keys get one spelling (`enter`/`return`/`cr` → `Return`,
 * `arrowup`/`up` → `↑`), function and numpad keys are normalized.
 * Unknown names are returned unchanged.
 */
export function canonicalKeyName(raw: string): string {
  if ([...raw].length === 1) {
    const upper = raw.toUpperCase();
    return [...upper].length === 1 ? upper : raw;
  }
  const lower = raw.toLowerCase().replace(/[_\s]/g, '');
  if (NAMED_WORDS[lower]) return NAMED_WORDS[lower];
  const fn = lower.match(/^f(\d{1,2})$/);
  if (fn) return `F${fn[1]}`;
  const numpad = lower.match(/^(?:numpad|kp)(\w+)$/);
  if (numpad) return `Numpad${numpad[1].replace(/^./, (c) => c.toUpperCase())}`;
  return raw;
}

function toStroke(parsed: ParsedKey): KeyStroke {
  const stroke: KeyStroke = {
    mods: sortMods(parsed.modifiers.map((m) => MODIFIER_NAMES[m])),
    key: parsed.key,
  };
  if (parsed.code) stroke.code = parsed.code;
  if (parsed.literal) stroke.literal = true;
  return stroke;
}

/** Search words for a single stroke, e.g. "shift cmd t" or "cmd + plus". */
function strokeToSearch(stroke: KeyStroke): string {
  const words: string[] = [...stroke.mods];
  const key = stroke.key;
  if (NAMED_KEY_SEARCH[key]) {
    words.push(NAMED_KEY_SEARCH[key]);
  } else if (SYMBOL_NAMES[key]) {
    words.push(key, SYMBOL_NAMES[key]);
  } else {
    words.push(key.toLowerCase());
  }
  return words.join(' ');
}

/** Build display/search/structured forms from a list of strokes. */
function fromStrokes(strokes: KeyStroke[]): NormalizedKey {
  return {
    displayKey: strokes.map(strokeToDisplay).join(' '),
    searchKey: strokes.map(strokeToSearch).join(' ').trim(),
    strokes,
  };
}

/** Normalize a sequence of key combinations (chords). */
export function normalizeSequence(parsed: ParsedKey[]): NormalizedKey {
  const strokes: KeyStroke[] = [];
  for (const p of parsed) {
    if (p.prefix) strokes.push(toStroke(p.prefix));
    strokes.push(toStroke(p));
  }
  return fromStrokes(strokes);
}

/** Produce display, search and structured forms from a ParsedKey. */
export function normalizeToCanonical(parsed: ParsedKey): NormalizedKey {
  return normalizeSequence([parsed]);
}

/**
 * Parse a raw key combo string (e.g. "Ctrl+Shift+A", "Command-B") into a
 * structured ParsedKey. Handles the edge case where the base key is the
 * separator itself ("Ctrl++"). The base key is canonicalized.
 */
export function parseKeyCombo(
  raw: string,
  separator = '+',
): ParsedKey {
  const modifiers: Modifier[] = [];
  const parts = raw.split(separator);
  let baseKey = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();

    // Empty part means consecutive separators — the key IS the separator
    if (part === '') {
      if (i === parts.length - 1) {
        baseKey = separator;
      }
      continue;
    }

    const mod = parseModifierWord(part);
    if (mod !== null && i < parts.length - 1) {
      modifiers.push(mod);
    } else {
      baseKey = part;
    }
  }

  return { modifiers, key: canonicalKeyName(baseKey) };
}

/** Normalize a single "Mod+Mod+Key" combo. */
export function formatKeyCombo(
  raw: string,
  separator = '+',
): NormalizedKey {
  return normalizeToCanonical(parseKeyCombo(raw, separator));
}

/** Whether a token names a non-character key (Escape, F5, Up, Numpad0...). */
function isNamedKey(token: string): boolean {
  if ([...token].length === 1) return false;
  const lower = token.toLowerCase().replace(/[_\s]/g, '');
  return lower in NAMED_WORDS || /^f\d{1,2}$/.test(lower) || /^(?:numpad|kp)\w+$/.test(lower);
}

/** Whether a token is a "Mod+Key" combo. */
function isComboToken(token: string): boolean {
  if (token.length < 2 || !token.includes('+')) return false;
  return parseModifierWord(token.split('+')[0]) !== null;
}

/**
 * Normalize a cheatsheet key string: space-separated chords of
 * "Mod+Key" combos ("Cmd+K Cmd+S", "Cmd+K Z").
 *
 * With `literalText` (vim), tokens that are neither combos nor named keys
 * are kept verbatim as literal strokes ("Ctrl+W s", "dd", ":wq"), because
 * vim sequences are case-sensitive text rather than keycaps.
 */
export function formatCheatsheetKey(
  raw: string,
  { literalText = false }: { literalText?: boolean } = {},
): NormalizedKey {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const parsed: ParsedKey[] = tokens.map((token) => {
    if (isComboToken(token)) return parseKeyCombo(token);
    if (literalText && !isNamedKey(token)) {
      return { modifiers: [], key: token, literal: true };
    }
    return { modifiers: [], key: canonicalKeyName(token) };
  });
  return normalizeSequence(parsed);
}
