/** Modifier key identifiers in canonical Apple HIG order: ⌃ ⌥ ⇧ ⌘ */
export enum Modifier {
  Control = 0,
  Option = 1,
  Shift = 2,
  Command = 3,
}

/** Structured representation of a key combination. */
export interface ParsedKey {
  modifiers: Modifier[];
  key: string;
  prefix?: string;
}

const MODIFIER_GLYPHS: Record<Modifier, string> = {
  [Modifier.Control]: '⌃',
  [Modifier.Option]: '⌥',
  [Modifier.Shift]: '⇧',
  [Modifier.Command]: '⌘',
};

const MODIFIER_SEARCH_NAMES: Record<Modifier, string> = {
  [Modifier.Control]: 'ctrl',
  [Modifier.Option]: 'opt',
  [Modifier.Shift]: 'shift',
  [Modifier.Command]: 'cmd',
};

const MODIFIER_WORDS: Record<string, Modifier> = {
  commandorcontrol: Modifier.Command,
  cmd: Modifier.Command,
  command: Modifier.Command,
  meta: Modifier.Command,
  super: Modifier.Command,
  ctrl: Modifier.Control,
  control: Modifier.Control,
  shift: Modifier.Shift,
  alt: Modifier.Option,
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

/** Sort modifiers into canonical Apple HIG order: ⌃ ⌥ ⇧ ⌘ */
function sortModifiers(mods: Modifier[]): Modifier[] {
  return [...new Set(mods)].sort((a, b) => a - b);
}

/** Convert sorted modifiers to glyph string. */
function modifiersToGlyphs(mods: Modifier[]): string {
  return sortModifiers(mods).map((m) => MODIFIER_GLYPHS[m]).join('');
}

/** Convert sorted modifiers to search-friendly text. */
function modifiersToSearchText(mods: Modifier[]): string {
  return sortModifiers(mods).map((m) => MODIFIER_SEARCH_NAMES[m]).join(' ');
}

/** Produce display and search strings from a ParsedKey. */
export function normalizeToCanonical(parsed: ParsedKey): {
  displayKey: string;
  searchKey: string;
} {
  const modGlyphs = modifiersToGlyphs(parsed.modifiers);
  const modSearch = modifiersToSearchText(parsed.modifiers);
  const keySearch = keyToSearchName(parsed.key);

  const prefixDisplay = parsed.prefix ? `${parsed.prefix} ` : '';
  const prefixSearch = parsed.prefix ? `${parsed.prefix} ` : '';

  return {
    displayKey: `${prefixDisplay}${modGlyphs}${parsed.key}`,
    searchKey: `${prefixSearch}${modSearch}${modSearch ? ' ' : ''}${keySearch}`.trim(),
  };
}

/**
 * Parse a raw key combo string (e.g. "Ctrl+Shift+A", "Command-B") into a
 * structured ParsedKey. Handles the edge case where the base key is "+".
 */
export function parseKeyCombo(
  raw: string,
  separator = '+',
): ParsedKey {
  const modifiers: Modifier[] = [];
  const parts = raw.split(separator);

  // Edge case: if the raw string ends with the separator (e.g. "Ctrl++"),
  // the split produces an empty last element — the base key is the separator itself.
  // Also handle "Ctrl+Plus" explicitly.
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
      // It's a modifier (but only if it's not the last segment)
      modifiers.push(mod);
    } else {
      // It's the base key
      baseKey = part;
    }
  }

  return { modifiers, key: baseKey };
}

/**
 * Convert a macOS plist char code to a displayable key name.
 * Returns null for non-printable codes (caller should fall back to keyCode map).
 */
export function charCodeToKeyName(charCode: number): string | null {
  if (charCode >= 32 && charCode < 127) {
    return String.fromCharCode(charCode).toUpperCase();
  }
  return null;
}

/** Map a key name to a search-friendly string. */
function keyToSearchName(key: string): string {
  const specialKeys: Record<string, string> = {
    '+': 'plus',
    '-': 'minus',
    '=': 'equals',
    '←': 'left',
    '→': 'right',
    '↑': 'up',
    '↓': 'down',
  };
  return specialKeys[key] ?? key.toLowerCase();
}
