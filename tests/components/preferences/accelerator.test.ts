import { makeLayout } from '../../../src/renderer/lib/keyboard-layout';
import { layoutMapOf } from '../../../src/renderer/lib/keyboard-layouts.data';
import {
  acceleratorHint,
  acceleratorToGlyphs,
  canonicalAccelerator,
  keyFromCode,
  recordChord,
  sameAccelerator,
  type KeyChord,
} from '../../../src/renderer/preferences/lib/accelerator';

function chord(code: string, mods: Partial<Omit<KeyChord, 'code'>> = {}): KeyChord {
  return { code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods };
}

describe('keyFromCode', () => {
  it.each([
    ['KeyK', 'K'],
    ['Digit3', '3'],
    ['Space', 'Space'],
    ['Enter', 'Return'],
    ['ArrowUp', 'Up'],
    ['F13', 'F13'],
    ['Minus', '-'],
    ['BracketLeft', '['],
    ['Numpad7', 'num7'],
  ])('%s -> %s', (code, key) => {
    expect(keyFromCode(code)).toBe(key);
  });

  it('rejects keys Electron cannot register', () => {
    expect(keyFromCode('IntlBackslash')).toBeNull();
    expect(keyFromCode('Unidentified')).toBeNull();
  });
});

describe('recordChord (macOS)', () => {
  it('records the default Cmd+Shift+Space', () => {
    expect(recordChord(chord('Space', { metaKey: true, shiftKey: true }), true)).toEqual({
      kind: 'ok',
      accelerator: 'Shift+Command+Space',
    });
  });

  it('keeps Control and Command distinct', () => {
    const result = recordChord(chord('KeyK', { ctrlKey: true, metaKey: true }), true);
    expect(result).toEqual({ kind: 'ok', accelerator: 'Control+Command+K' });
  });

  it('uses the physical key with Option held (e.key would be a symbol)', () => {
    // Option+Shift+K types "Ò" on Italian and "" on US layouts.
    expect(recordChord(chord('KeyK', { altKey: true, shiftKey: true }), true)).toEqual({
      kind: 'ok',
      accelerator: 'Alt+Shift+K',
    });
  });

  it('uses the US name of the position for Italian Shift+3 (e.key "£")', () => {
    expect(recordChord(chord('Digit3', { ctrlKey: true, shiftKey: true }), true)).toEqual({
      kind: 'ok',
      accelerator: 'Control+Shift+3',
    });
  });

  it('keeps listening while only modifiers are held', () => {
    expect(recordChord(chord('MetaLeft', { metaKey: true }), true)).toEqual({ kind: 'modifiers' });
    expect(recordChord(chord('AltRight', { altKey: true }), true)).toEqual({ kind: 'modifiers' });
  });

  it('cancels on a plain Escape', () => {
    expect(recordChord(chord('Escape'), true)).toEqual({ kind: 'cancel' });
  });

  it('requires a non-Shift modifier, except for function keys', () => {
    expect(recordChord(chord('KeyK'), true).kind).toBe('invalid');
    expect(recordChord(chord('KeyK', { shiftKey: true }), true).kind).toBe('invalid');
    expect(recordChord(chord('F13'), true)).toEqual({ kind: 'ok', accelerator: 'F13' });
  });

  it('refuses shortcuts macOS reserves', () => {
    const result = recordChord(chord('Space', { metaKey: true }), true);
    expect(result).toEqual({
      kind: 'invalid',
      reason: 'macOS uses ⌘Space for Spotlight. Choose another shortcut.',
    });
    expect(recordChord(chord('Digit4', { metaKey: true, shiftKey: true }), true).kind).toBe(
      'invalid',
    );
  });

  it('rejects keys without an accelerator name', () => {
    expect(recordChord(chord('IntlBackslash', { metaKey: true }), true).kind).toBe('invalid');
  });
});

describe('recordChord (Windows/Linux)', () => {
  it('maps the Windows key to Super and does not apply macOS reservations', () => {
    expect(recordChord(chord('Space', { metaKey: true }), false)).toEqual({
      kind: 'ok',
      accelerator: 'Super+Space',
    });
  });
});

describe('acceleratorToGlyphs', () => {
  it('renders the default in macOS order', () => {
    expect(acceleratorToGlyphs('CommandOrControl+Shift+Space', true)).toEqual(['⇧', '⌘', 'Space']);
  });

  it('orders modifiers ⌃⌥⇧⌘ regardless of input order', () => {
    expect(acceleratorToGlyphs('Command+Shift+Alt+Control+K', true)).toEqual([
      '⌃',
      '⌥',
      '⇧',
      '⌘',
      'K',
    ]);
  });

  it('uses words on other platforms', () => {
    expect(acceleratorToGlyphs('CommandOrControl+Shift+Space', false)).toEqual([
      'Ctrl',
      'Shift',
      'Space',
    ]);
  });

  it('draws named keys as glyphs', () => {
    expect(acceleratorToGlyphs('Alt+Return', true)).toEqual(['⌥', '↩']);
  });
});

describe('keycaps on the user\'s layout', () => {
  const italian = makeLayout(layoutMapOf('it'));

  it('labels a punctuation key as printed on an Italian keyboard', () => {
    // Electron's "-" is the US Minus position, which is the "'" key on Italian.
    expect(acceleratorToGlyphs('Control+Alt+-', true, italian)).toEqual(['⌃', '⌥', "'"]);
    expect(acceleratorHint('Control+Alt+-', true, italian)).toMatch(/Physical key/);
  });

  it('keeps letters, digits and named keys unchanged', () => {
    expect(acceleratorToGlyphs('Alt+Shift+K', true, italian)).toEqual(['⌥', '⇧', 'K']);
    expect(acceleratorToGlyphs('Control+Shift+3', true, italian)).toEqual(['⌃', '⇧', '3']);
    expect(acceleratorToGlyphs('Shift+Command+Space', true, italian)).toEqual(['⇧', '⌘', 'Space']);
    expect(acceleratorHint('Alt+Shift+K', true, italian)).toBeUndefined();
  });

  it('uses the US labels by default', () => {
    expect(acceleratorToGlyphs('Control+Alt+-', true)).toEqual(['⌃', '⌥', '-']);
  });
});

describe('canonicalAccelerator / sameAccelerator', () => {
  it('normalizes aliases and modifier order', () => {
    expect(canonicalAccelerator('CmdOrCtrl+Option+k', true)).toBe('Alt+Command+K');
  });

  it('treats aliases, order and case as the same shortcut', () => {
    expect(sameAccelerator('CmdOrCtrl+Shift+space', 'Shift+Command+Space', true)).toBe(true);
    expect(sameAccelerator('Control+Shift+Space', 'Shift+Command+Space', true)).toBe(false);
  });
});
