/**
 * Layout-independent key vocabulary shared by the main process (parsers)
 * and the renderer (layout-aware display). Pure data + pure functions only:
 * this module must not import Node or DOM APIs.
 *
 * See docs/keyboard-layouts.md for the design.
 */

export type KeyModifier = 'ctrl' | 'opt' | 'shift' | 'cmd';

/** Canonical Apple HIG order: ⌃ ⌥ ⇧ ⌘ */
const MODIFIER_ORDER: readonly KeyModifier[] = ['ctrl', 'opt', 'shift', 'cmd'];

const MODIFIER_GLYPHS: Record<KeyModifier, string> = {
  ctrl: '⌃',
  opt: '⌥',
  shift: '⇧',
  cmd: '⌘',
};

/**
 * One keystroke of a shortcut. A shortcut is a sequence of strokes
 * (VS Code chords `cmd+k cmd+s`, Ghostty `ctrl+a>n`, tmux prefix + key).
 *
 * - `key` is the canonical key as the *source* defines it: an uppercase
 *   letter (`A`), a character (`[`, `%`, `ò`), or a named key
 *   (`Return`, `Tab`, `↑`, `F5`, see NAMED_KEY_GLYPHS).
 * - `code` is set only when the source binds a *physical* key position
 *   (KeyboardEvent.code, e.g. `BracketLeft`): VS Code `[BracketLeft]`,
 *   Ghostty `bracket_left`/`key_a`, macOS virtual keycodes. `key` then holds
 *   the US-layout label of that position.
 * - `literal` marks free-form text that is shown verbatim (vim sequences
 *   such as `dd`, `:wq`, `ci(`); case is significant and it is never
 *   resolved through the keyboard layout unless it is a single character.
 */
export interface KeyStroke {
  mods: KeyModifier[];
  key: string;
  code?: string;
  literal?: boolean;
}

/** Named (non-character) keys → macOS glyph used for display. */
export const NAMED_KEY_GLYPHS: Record<string, string> = {
  Return: '↩',
  Tab: '⇥',
  Space: 'Space',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: '⎋',
  '↑': '↑',
  '↓': '↓',
  '←': '←',
  '→': '→',
  Home: '↖',
  End: '↘',
  PageUp: '⇞',
  PageDown: '⇟',
  Insert: 'Ins',
  CapsLock: '⇪',
  Help: 'Help',
};

/** Named keys → words used in the search index. */
export const NAMED_KEY_SEARCH: Record<string, string> = {
  '↑': 'up',
  '↓': 'down',
  '←': 'left',
  '→': 'right',
  Return: 'return enter',
  Backspace: 'backspace delete',
  Delete: 'forward delete',
  Escape: 'escape esc',
  PageUp: 'pageup',
  PageDown: 'pagedown',
};

/** Spoken names for punctuation, so "plus" / "comma" / "slash" queries match. */
export const SYMBOL_NAMES: Record<string, string> = {
  '+': 'plus',
  '-': 'minus',
  '=': 'equals',
  ',': 'comma',
  '.': 'period',
  '/': 'slash',
  '\\': 'backslash',
  ';': 'semicolon',
  "'": 'quote',
  '`': 'backquote backtick',
  '[': 'bracketleft',
  ']': 'bracketright',
  '?': 'question',
};

/**
 * US ANSI layout: KeyboardEvent.code → [unshifted, shifted].
 * This is the reference layout every source assumes when it names a
 * character key (VS Code, Chrome, Ghostty defaults, ...).
 */
export const US_LAYOUT: Record<string, readonly [string, string]> = {
  Backquote: ['`', '~'],
  Digit1: ['1', '!'],
  Digit2: ['2', '@'],
  Digit3: ['3', '#'],
  Digit4: ['4', '$'],
  Digit5: ['5', '%'],
  Digit6: ['6', '^'],
  Digit7: ['7', '&'],
  Digit8: ['8', '*'],
  Digit9: ['9', '('],
  Digit0: ['0', ')'],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  KeyQ: ['q', 'Q'],
  KeyW: ['w', 'W'],
  KeyE: ['e', 'E'],
  KeyR: ['r', 'R'],
  KeyT: ['t', 'T'],
  KeyY: ['y', 'Y'],
  KeyU: ['u', 'U'],
  KeyI: ['i', 'I'],
  KeyO: ['o', 'O'],
  KeyP: ['p', 'P'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  KeyA: ['a', 'A'],
  KeyS: ['s', 'S'],
  KeyD: ['d', 'D'],
  KeyF: ['f', 'F'],
  KeyG: ['g', 'G'],
  KeyH: ['h', 'H'],
  KeyJ: ['j', 'J'],
  KeyK: ['k', 'K'],
  KeyL: ['l', 'L'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  KeyZ: ['z', 'Z'],
  KeyX: ['x', 'X'],
  KeyC: ['c', 'C'],
  KeyV: ['v', 'V'],
  KeyB: ['b', 'B'],
  KeyN: ['n', 'N'],
  KeyM: ['m', 'M'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
  IntlBackslash: ['§', '±'],
};

/** Non-character KeyboardEvent.code values → canonical named key. */
const NAMED_CODES: Record<string, string> = {
  Enter: 'Return',
  NumpadEnter: 'Return',
  Tab: 'Tab',
  Space: 'Space',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Escape: 'Escape',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  CapsLock: 'CapsLock',
  Help: 'Help',
};

/**
 * Canonical key label for a KeyboardEvent.code on the US layout:
 * `KeyA` → `A`, `BracketLeft` → `[`, `ArrowUp` → `↑`, `F5` → `F5`,
 * `Numpad1` → `Numpad1`. Returns null for unknown codes.
 */
export function usKeyForCode(code: string): string | null {
  const us = US_LAYOUT[code];
  if (us) return us[0].toUpperCase();
  if (NAMED_CODES[code]) return NAMED_CODES[code];
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^Numpad\w+$/.test(code)) return code;
  return null;
}

/** Reverse lookup: unshifted US character → KeyboardEvent.code. */
export function usCodeForChar(char: string): string | null {
  const lower = char.toLowerCase();
  for (const [code, [base]] of Object.entries(US_LAYOUT)) {
    if (base === lower && code !== 'IntlBackslash') return code;
  }
  return null;
}

/**
 * macOS virtual keycodes (Carbon kVK_*) → KeyboardEvent.code, following
 * Chromium's mapping so the result can be looked up in
 * `navigator.keyboard.getLayoutMap()`.
 */
export const MAC_KEYCODE_TO_CODE: Record<number, string> = {
  0: 'KeyA', 1: 'KeyS', 2: 'KeyD', 3: 'KeyF', 4: 'KeyH', 5: 'KeyG',
  6: 'KeyZ', 7: 'KeyX', 8: 'KeyC', 9: 'KeyV', 10: 'IntlBackslash',
  11: 'KeyB', 12: 'KeyQ', 13: 'KeyW', 14: 'KeyE', 15: 'KeyR', 16: 'KeyY',
  17: 'KeyT', 18: 'Digit1', 19: 'Digit2', 20: 'Digit3', 21: 'Digit4',
  22: 'Digit6', 23: 'Digit5', 24: 'Equal', 25: 'Digit9', 26: 'Digit7',
  27: 'Minus', 28: 'Digit8', 29: 'Digit0', 30: 'BracketRight', 31: 'KeyO',
  32: 'KeyU', 33: 'BracketLeft', 34: 'KeyI', 35: 'KeyP', 36: 'Enter',
  37: 'KeyL', 38: 'KeyJ', 39: 'Quote', 40: 'KeyK', 41: 'Semicolon',
  42: 'Backslash', 43: 'Comma', 44: 'Slash', 45: 'KeyN', 46: 'KeyM',
  47: 'Period', 48: 'Tab', 49: 'Space', 50: 'Backquote', 51: 'Backspace',
  53: 'Escape', 64: 'F17', 65: 'NumpadDecimal', 67: 'NumpadMultiply',
  69: 'NumpadAdd', 75: 'NumpadDivide', 76: 'NumpadEnter',
  78: 'NumpadSubtract', 79: 'F18', 80: 'F19', 81: 'NumpadEqual',
  82: 'Numpad0', 83: 'Numpad1', 84: 'Numpad2', 85: 'Numpad3', 86: 'Numpad4',
  87: 'Numpad5', 88: 'Numpad6', 89: 'Numpad7', 90: 'F20', 91: 'Numpad8',
  92: 'Numpad9', 96: 'F5', 97: 'F6', 98: 'F7', 99: 'F3', 100: 'F8',
  101: 'F9', 103: 'F11', 105: 'F13', 106: 'F16', 107: 'F14', 109: 'F10',
  111: 'F12', 113: 'F15', 114: 'Help', 115: 'Home', 116: 'PageUp',
  117: 'Delete', 118: 'F4', 119: 'End', 120: 'F2', 121: 'PageDown',
  122: 'F1', 123: 'ArrowLeft', 124: 'ArrowRight', 125: 'ArrowDown',
  126: 'ArrowUp',
};

/** Display string for a stroke using the key as the source defines it. */
export function strokeToDisplay(stroke: KeyStroke): string {
  return `${modsToGlyphs(stroke.mods)}${stroke.key}`;
}

function modsToGlyphs(mods: readonly KeyModifier[]): string {
  return sortMods(mods).map((m) => MODIFIER_GLYPHS[m]).join('');
}

export function sortMods(mods: readonly KeyModifier[]): KeyModifier[] {
  return MODIFIER_ORDER.filter((m) => mods.includes(m));
}
