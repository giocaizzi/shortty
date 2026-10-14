import { type ParsedKey, type NormalizedKey, Modifier, normalizeSequence } from './key-normalizer';

/**
 * Decoding of terminal key sequences as written in zsh `bindkey` and
 * readline (`.inputrc`, bash `bind`): caret notation (`^X`, `^[`, `^?`),
 * backslash escapes (`\e`, `\C-x`, `\M-x`, `\t`), and the CSI/SS3 escape
 * sequences terminals send for arrows, Home/End and function keys.
 *
 * Meta/Escape-prefixed keys are shown with ⌥, matching macOS terminals
 * configured with "Option as Meta".
 */

/** One decoded input unit before grouping. */
type Unit =
  | { kind: 'esc' }
  | { kind: 'char'; char: string; ctrl: boolean };

const CSI_FINAL: Record<string, string> = {
  A: '↑', B: '↓', C: '→', D: '←', H: 'Home', F: 'End',
  P: 'F1', Q: 'F2', R: 'F3', S: 'F4',
};

const CSI_TILDE: Record<string, string> = {
  1: 'Home', 7: 'Home', 4: 'End', 8: 'End', 2: 'Insert', 3: 'Delete',
  5: 'PageUp', 6: 'PageDown',
  11: 'F1', 12: 'F2', 13: 'F3', 14: 'F4', 15: 'F5', 17: 'F6', 18: 'F7',
  19: 'F8', 20: 'F9', 21: 'F10', 23: 'F11', 24: 'F12',
};

/** Control characters with a key of their own. */
const CONTROL_NAMES: Record<string, string> = {
  I: 'Tab',
  M: 'Return',
  '?': 'Backspace',
};

/** xterm modifier parameter (1 + bitmask: 1 shift, 2 alt, 4 ctrl). */
function xtermMods(param: string | undefined): Modifier[] {
  const n = param ? parseInt(param, 10) - 1 : 0;
  const mods: Modifier[] = [];
  if (n & 4) mods.push(Modifier.Control);
  if (n & 2) mods.push(Modifier.Option);
  if (n & 1) mods.push(Modifier.Shift);
  return mods;
}

function tokenize(seq: string, caret: boolean): Unit[] {
  const units: Unit[] = [];
  let ctrl = false;
  const push = (char: string) => {
    if (char === '\x1b' && !ctrl) {
      units.push({ kind: 'esc' });
    } else {
      units.push({ kind: 'char', char, ctrl });
    }
    ctrl = false;
  };

  for (let i = 0; i < seq.length; i++) {
    const ch = seq[i];
    if (caret && ch === '^' && i + 1 < seq.length) {
      const next = seq[++i];
      if (next === '[') push('\x1b');
      else if (next === '?') { units.push({ kind: 'char', char: '?', ctrl: true }); ctrl = false; }
      else { ctrl = true; push(next); }
      continue;
    }
    if (ch === '\\' && i + 1 < seq.length) {
      const next = seq[i + 1];
      if ((next === 'C' || next === 'M') && seq[i + 2] === '-') {
        // `\M-x` is ESC x (readline's convert-meta), so `\M-[A` decodes as ↑.
        if (next === 'C') ctrl = true;
        else units.push({ kind: 'esc' });
        i += 2;
        continue;
      }
      i++;
      switch (next) {
        case 'e': case 'E': push('\x1b'); break;
        case 't': units.push({ kind: 'char', char: 'I', ctrl: true }); break;
        case 'n': case 'r': units.push({ kind: 'char', char: 'M', ctrl: true }); break;
        case 'd': units.push({ kind: 'char', char: '?', ctrl: true }); break;
        default: push(next);
      }
      continue;
    }
    push(ch);
  }
  return units;
}

function unitToKey(unit: Extract<Unit, { kind: 'char' }>, extraMeta: boolean): ParsedKey {
  const modifiers: Modifier[] = [];
  if (extraMeta) modifiers.push(Modifier.Option);
  if (unit.ctrl) {
    const upper = unit.char.toUpperCase();
    if (CONTROL_NAMES[upper]) return { modifiers, key: CONTROL_NAMES[upper] };
    if (unit.char === '@' || unit.char === ' ') {
      return { modifiers: [...modifiers, Modifier.Control], key: 'Space' };
    }
    modifiers.push(Modifier.Control);
    return { modifiers, key: upper };
  }
  if (unit.char === ' ') return { modifiers, key: 'Space' };
  if (unit.char === '\x7f') return { modifiers, key: 'Backspace' };
  if (/^[a-z]$/i.test(unit.char)) {
    // Terminal keys are characters: an uppercase letter means Shift.
    if (unit.char !== unit.char.toLowerCase()) modifiers.push(Modifier.Shift);
    return { modifiers, key: unit.char.toUpperCase() };
  }
  return { modifiers, key: unit.char };
}

/**
 * Try to read a CSI (`ESC [ … final`) or SS3 (`ESC O final`) sequence
 * starting at units[i] (the unit after ESC). Returns the key and the
 * number of units consumed, or null.
 */
function readEscapeSequence(units: Unit[], i: number): { key: ParsedKey; used: number } | null {
  const first = units[i];
  if (!first || first.kind !== 'char' || first.ctrl) return null;
  if (first.char !== '[' && first.char !== 'O') return null;

  let body = '';
  let j = i + 1;
  while (j < units.length) {
    const u = units[j];
    if (u.kind !== 'char' || u.ctrl) return null;
    body += u.char;
    j++;
    if (/[A-Za-z~]/.test(u.char)) break;
  }
  const m = body.match(/^(?:(\d+)(?:;(\d+))?)?([A-Za-z~])$/);
  if (!m) return null;
  const [, num, modParam, final] = m;
  if (final === 'Z' && first.char === '[') {
    return { key: { modifiers: [Modifier.Shift], key: 'Tab' }, used: j - i };
  }
  if (final === '~') {
    const name = num ? CSI_TILDE[num] : undefined;
    if (!name) return null;
    return { key: { modifiers: xtermMods(modParam), key: name }, used: j - i };
  }
  const name = CSI_FINAL[final];
  if (!name) return null;
  // `ESC [ 1 ; 5 C`: the first number is a placeholder, the second the modifiers.
  return { key: { modifiers: xtermMods(modParam), key: name }, used: j - i };
}

/** Decode a terminal key sequence into keystrokes. */
function parseTerminalSequence(
  sequence: string,
  { caret }: { caret: boolean },
): ParsedKey[] {
  const units = tokenize(sequence, caret);
  const keys: ParsedKey[] = [];
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit.kind === 'esc') {
      const escape = readEscapeSequence(units, i + 1);
      if (escape) {
        keys.push(escape.key);
        i += escape.used;
        continue;
      }
      const next = units[i + 1];
      if (next && next.kind === 'char') {
        keys.push(unitToKey(next, true));
        i++;
      } else if (next && next.kind === 'esc') {
        keys.push({ modifiers: [Modifier.Option], key: 'Escape' });
        i++;
      } else {
        keys.push({ modifiers: [], key: 'Escape' });
      }
      continue;
    }
    keys.push(unitToKey(unit, false));
  }
  return keys;
}

export function normalizeTerminalKey(
  sequence: string,
  options: { caret: boolean },
): NormalizedKey {
  return normalizeSequence(parseTerminalSequence(sequence, options));
}
