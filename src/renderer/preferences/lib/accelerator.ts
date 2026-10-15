import { usCodeForChar } from '../../../shared/keys';
import { resolveStroke, US_KEYBOARD, type KeyboardLayout } from '../../lib/keyboard-layout';

/**
 * Electron accelerator helpers for the global-shortcut recorder.
 *
 * Recording reads KeyboardEvent.code (the physical key) instead of .key (the
 * produced character): on non-US layouts, and with Option held on macOS,
 * .key yields dead keys and symbols ("Ò", "£", "Dead") that are not valid
 * accelerators. Electron registers global shortcuts by key position, using the
 * US-layout name of the key, which is exactly what .code describes.
 */

/** The parts of a KeyboardEvent the recorder needs. */
export interface KeyChord {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type RecordResult =
  | { kind: 'modifiers' }
  | { kind: 'cancel' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'ok'; accelerator: string };

type Modifier = 'Control' | 'Alt' | 'Shift' | 'Command' | 'Super';

/** macOS display order: ⌃ ⌥ ⇧ ⌘. */
const MODIFIER_ORDER: Modifier[] = ['Control', 'Alt', 'Shift', 'Command', 'Super'];

const MODIFIER_CODES = new Set([
  'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight',
  'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight',
  'ShiftLeft', 'ShiftRight',
  'CapsLock', 'Fn', 'FnLock',
]);

/** Physical key code -> Electron accelerator key name (US positions). */
const NAMED_CODES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Return',
  NumpadEnter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Escape: 'Escape',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadDecimal: 'numdec',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
};

/** Map a physical key code to its accelerator key, or null if unsupported. */
export function keyFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1] ?? null;
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1] ?? null;
  const numpad = /^Numpad([0-9])$/.exec(code);
  if (numpad) return `num${numpad[1]}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED_CODES[code] ?? null;
}

function isFunctionKey(key: string): boolean {
  return /^F\d+$/.test(key);
}

function modifiersOf(chord: KeyChord, mac: boolean): Modifier[] {
  const mods: Modifier[] = [];
  if (chord.ctrlKey) mods.push('Control');
  if (chord.altKey) mods.push('Alt');
  if (chord.shiftKey) mods.push('Shift');
  if (chord.metaKey) mods.push(mac ? 'Command' : 'Super');
  return mods;
}

/**
 * Shortcuts macOS keeps for itself. Registering them either fails or breaks
 * a system feature, so the recorder refuses them up front.
 */
const MAC_RESERVED: Record<string, string> = {
  'Command+Space': 'Spotlight',
  'Alt+Command+Space': 'Finder search',
  'Control+Space': 'switching input sources',
  'Control+Alt+Space': 'switching input sources',
  'Command+Tab': 'the app switcher',
  'Shift+Command+Tab': 'the app switcher',
  'Command+Q': 'quitting apps',
  'Command+W': 'closing windows',
  'Command+H': 'hiding apps',
  'Command+M': 'minimizing windows',
  'Command+`': 'switching windows',
  'Shift+Command+3': 'screenshots',
  'Shift+Command+4': 'screenshots',
  'Shift+Command+5': 'screenshots',
  'Control+Command+Q': 'locking the screen',
  'Alt+Command+Escape': 'Force Quit',
};

/**
 * Normalize an accelerator for comparison: aliases resolved, modifiers in a
 * fixed order. `CommandOrControl` becomes Command on macOS, Control elsewhere.
 */
export function canonicalAccelerator(accelerator: string, mac: boolean): string {
  const parts = splitAccelerator(accelerator);
  const mods = new Set<Modifier>();
  let key = '';
  for (const part of parts) {
    const mod = modifierFromToken(part, mac);
    if (mod) mods.add(mod);
    else key = part.length === 1 ? part.toUpperCase() : part;
  }
  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join('+');
}

/** Whether two accelerators name the same shortcut (Electron ignores case). */
export function sameAccelerator(a: string, b: string, mac: boolean): boolean {
  return canonicalAccelerator(a, mac).toLowerCase() === canonicalAccelerator(b, mac).toLowerCase();
}

function splitAccelerator(accelerator: string): string[] {
  // "Command++" would mean the "+" key; Electron spells it "Plus", so a plain split is safe.
  return accelerator.split('+').filter((p) => p !== '');
}

function modifierFromToken(token: string, mac: boolean): Modifier | null {
  switch (token.toLowerCase()) {
    case 'command':
    case 'cmd':
      return 'Command';
    case 'commandorcontrol':
    case 'cmdorctrl':
      return mac ? 'Command' : 'Control';
    case 'control':
    case 'ctrl':
      return 'Control';
    case 'alt':
    case 'option':
    case 'altgr':
      return 'Alt';
    case 'shift':
      return 'Shift';
    case 'super':
    case 'meta':
      return mac ? 'Command' : 'Super';
    default:
      return null;
  }
}

/**
 * Turn a keydown into a recorder outcome. Modifier-only presses keep the
 * recorder listening; a plain Escape cancels.
 */
export function recordChord(chord: KeyChord, mac: boolean): RecordResult {
  if (MODIFIER_CODES.has(chord.code)) return { kind: 'modifiers' };

  const mods = modifiersOf(chord, mac);
  if (chord.code === 'Escape' && mods.length === 0) return { kind: 'cancel' };

  const key = keyFromCode(chord.code);
  if (!key) {
    return { kind: 'invalid', reason: "This key can't be used in a shortcut. Try a letter, number or Space." };
  }

  const hasNonShiftModifier = mods.some((m) => m !== 'Shift');
  if (!hasNonShiftModifier && !isFunctionKey(key)) {
    const options = mac ? '⌘, ⌃ or ⌥' : 'Ctrl, Alt or Win';
    return { kind: 'invalid', reason: `Include ${options} so the shortcut doesn't block typing.` };
  }

  const accelerator = [...MODIFIER_ORDER.filter((m) => mods.includes(m)), key].join('+');

  if (mac) {
    const owner = MAC_RESERVED[canonicalAccelerator(accelerator, mac)];
    if (owner) {
      return {
        kind: 'invalid',
        reason: `macOS uses ${acceleratorToGlyphs(accelerator, mac).join('')} for ${owner}. Choose another shortcut.`,
      };
    }
  }

  return { kind: 'ok', accelerator };
}

const MAC_MODIFIER_GLYPHS: Record<Modifier, string> = {
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Command: '⌘',
  Super: '⌘',
};

const OTHER_MODIFIER_LABELS: Record<Modifier, string> = {
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Command: 'Win',
  Super: 'Win',
};

const KEY_GLYPHS: Record<string, string> = {
  Return: '↩',
  Enter: '↩',
  Tab: '⇥',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: '⎋',
  Esc: '⎋',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  PageUp: '⇞',
  PageDown: '⇟',
  Home: '↖',
  End: '↘',
  Plus: '+',
};

/**
 * A character key of an accelerator names a US key position (Electron
 * registers by position). Label it with what that key prints on the user's
 * layout: Italian "-" (US Minus) is the "'" key.
 */
function physicalKey(key: string, layout: KeyboardLayout): { text: string; hint?: string } | null {
  if ([...key].length !== 1) return null;
  const code = usCodeForChar(key);
  if (!code) return null;
  return resolveStroke({ mods: [], key: key.toUpperCase(), code }, layout);
}

function keyLabel(key: string, layout: KeyboardLayout): string {
  const glyph = KEY_GLYPHS[key];
  if (glyph) return glyph;
  const numpad = /^num(\d)$/.exec(key);
  if (numpad) return `Num ${numpad[1]}`;
  const physical = physicalKey(key, layout);
  if (physical) return physical.text;
  return key.length === 1 ? key.toUpperCase() : key;
}

function acceleratorKey(accelerator: string, mac: boolean): string | undefined {
  return splitAccelerator(accelerator).find((part) => !modifierFromToken(part, mac));
}

/**
 * Keycap labels for an accelerator, modifiers first in platform order, the
 * key as printed on the user's layout:
 * "CommandOrControl+Shift+Space" -> ["⇧", "⌘", "Space"] on macOS.
 */
export function acceleratorToGlyphs(
  accelerator: string,
  mac: boolean,
  layout: KeyboardLayout = US_KEYBOARD,
): string[] {
  const canonical = splitAccelerator(canonicalAccelerator(accelerator, mac));
  const labels = mac ? MAC_MODIFIER_GLYPHS : OTHER_MODIFIER_LABELS;
  return canonical.map((part) => {
    const mod = modifierFromToken(part, mac);
    return mod ? labels[mod] : keyLabel(part, layout);
  });
}

/** Explains a key whose label on the user's layout differs from the US one. */
export function acceleratorHint(
  accelerator: string,
  mac: boolean,
  layout: KeyboardLayout,
): string | undefined {
  const key = acceleratorKey(accelerator, mac);
  return key ? physicalKey(key, layout)?.hint : undefined;
}

/** Keycap labels for the modifiers currently held while recording. */
export function heldModifierGlyphs(chord: Omit<KeyChord, 'code'>, mac: boolean): string[] {
  const labels = mac ? MAC_MODIFIER_GLYPHS : OTHER_MODIFIER_LABELS;
  return modifiersOf({ ...chord, code: '' }, mac).map((m) => labels[m]);
}
