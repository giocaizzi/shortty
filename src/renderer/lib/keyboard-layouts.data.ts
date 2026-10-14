/**
 * Character layers of common macOS keyboard layouts, keyed by
 * KeyboardEvent.code. `navigator.keyboard.getLayoutMap()` only exposes the
 * unshifted layer, so this table is what lets Shortty say how to *type* a
 * character that is not on a base key (e.g. `[` on Italian is ⌥è).
 *
 * It is also used to recognise the active layout from its base layer
 * (see detectLayout) and as fake layout maps in tests. Layouts whose base
 * layer equals another's (British vs U.S.) cannot be told apart this way;
 * they resolve as the first match.
 *
 * Codes follow Chromium on macOS: on ISO keyboards the key left of 1 is
 * `IntlBackslash` and the key left of Z is `Backquote`. Those two keys are
 * excluded from layout detection because the ANSI/ISO mapping varies.
 */

/** Physical key rows: number row, top, home, bottom (ISO). */
const ROWS: readonly (readonly string[])[] = [
  ['IntlBackslash', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
    'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO',
    'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL',
    'Semicolon', 'Quote'],
  ['Backquote', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM',
    'Comma', 'Period', 'Slash'],
];

export interface KnownLayout {
  id: string;
  name: string;
  /** code → unshifted character */
  base: ReadonlyMap<string, string>;
  /** code → character with ⇧ / ⌥ / ⌥⇧ (only where known) */
  shift: ReadonlyMap<string, string>;
  alt: ReadonlyMap<string, string>;
  shiftAlt: ReadonlyMap<string, string>;
}

/** Build a code → char map from per-row strings (one character per key). */
function rowsToMap(rows: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  rows.forEach((row, r) => {
    [...row].forEach((ch, i) => {
      const code = ROWS[r][i];
      if (code && ch !== ' ') map.set(code, ch);
    });
  });
  return map;
}

function layout(
  id: string,
  name: string,
  base: readonly string[],
  shift: readonly string[] | null,
  alt: Record<string, string> = {},
  shiftAlt: Record<string, string> = {},
): KnownLayout {
  return {
    id,
    name,
    base: rowsToMap(base),
    shift: shift ? rowsToMap(shift) : new Map(),
    alt: new Map(Object.entries(alt)),
    shiftAlt: new Map(Object.entries(shiftAlt)),
  };
}

const KNOWN_LAYOUTS: readonly KnownLayout[] = [
  layout('us', 'U.S.',
    ['§1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", '`zxcvbnm,./'],
    ['±!@#$%^&*()_+', 'QWERTYUIOP{}|', 'ASDFGHJKL:"', '~ZXCVBNM<>?']),
  layout('it', 'Italian',
    ["\\1234567890'ì", 'qwertyuiopè+ù', 'asdfghjklòà', '<zxcvbnm,.-'],
    ['|!"£$%&/()=?^', 'QWERTYUIOPé*§', 'ASDFGHJKLç°', '>ZXCVBNM;:_'],
    { BracketLeft: '[', BracketRight: ']', Semicolon: '@', Quote: '#', Digit5: '~', IntlBackslash: '`' },
    { BracketLeft: '{', BracketRight: '}' }),
  layout('de', 'German',
    ['^1234567890ß´', 'qwertzuiopü+#', 'asdfghjklöä', '<yxcvbnm,.-'],
    ['°!"§$%&/()=?`', "QWERTZUIOPÜ*'", 'ASDFGHJKLÖÄ', '>YXCVBNM;:_'],
    { Digit5: '[', Digit6: ']', Digit8: '{', Digit9: '}', Digit7: '|', KeyL: '@', KeyN: '~' },
    { Digit7: '\\' }),
  layout('fr', 'French',
    ['@&é"\'(§è!çà)-', 'azertyuiop^$`', 'qsdfghjklmù', '<wxcvbn,;:='],
    ['#1234567890°_', 'AZERTYUIOP¨*£', 'QSDFGHJKLM%', '>WXCVBN?./+'],
    { Digit5: '{', Minus: '}', KeyN: '~' },
    { Digit5: '[', Minus: ']', KeyL: '|', Period: '\\' }),
  layout('es', 'Spanish',
    ["º1234567890'¡", 'qwertyuiop`+ç', 'asdfghjklñ´', '<zxcvbnm,.-'],
    ['ª!"·$%&/()=?¿', 'QWERTYUIOP^*Ç', 'ASDFGHJKLÑ¨', '>ZXCVBNM;:_'],
    {
      BracketLeft: '[', BracketRight: ']', Quote: '{', Backslash: '}', Digit1: '|',
      IntlBackslash: '\\', Digit2: '@', Digit3: '#', Semicolon: '~',
    }),
  layout('dvorak', 'Dvorak',
    ['§1234567890[]', "',.pyfgcrl/=\\", 'aoeuidhtns-', '`;qjkxbmwvz'],
    ['±!@#$%^&*(){}', '"<>PYFGCRL?+|', 'AOEUIDHTNS_', '~:QJKXBMWVZ']),
  layout('ru', 'Russian',
    ['>1234567890-=', 'йцукенгшщзхъё', 'фывапролджэ', ']ячсмитьбю/'],
    null),
];

/** Codes used to recognise a layout (layout-specific, ANSI/ISO-stable). */
const FINGERPRINT_CODES = [
  'KeyQ', 'KeyW', 'KeyY', 'KeyZ', 'KeyA', 'KeyM', 'KeyC', 'KeyE',
  'Semicolon', 'Quote', 'BracketLeft', 'BracketRight', 'Minus', 'Equal',
  'Slash', 'Comma', 'Period', 'Digit1', 'Digit2',
];

/**
 * Identify a known layout from a code → char map (as returned by
 * getLayoutMap). Returns null when no known layout matches closely.
 */
export function detectLayout(map: ReadonlyMap<string, string>): KnownLayout | null {
  let best: KnownLayout | null = null;
  let bestScore = 0;
  for (const known of KNOWN_LAYOUTS) {
    let compared = 0;
    let matched = 0;
    for (const code of FINGERPRINT_CODES) {
      const actual = map.get(code);
      const expected = known.base.get(code);
      if (actual === undefined || expected === undefined) continue;
      compared++;
      if (actual.toLowerCase() === expected) matched++;
    }
    const score = compared >= 10 ? matched / compared : 0;
    if (score > bestScore) {
      best = known;
      bestScore = score;
    }
  }
  return bestScore >= 0.9 ? best : null;
}

/** The base layer of a known layout as a getLayoutMap()-style map (tests, fallback). */
export function layoutMapOf(id: string): ReadonlyMap<string, string> {
  const known = KNOWN_LAYOUTS.find((l) => l.id === id);
  if (!known) throw new Error(`unknown layout ${id}`);
  return known.base;
}
