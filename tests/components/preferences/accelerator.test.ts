import { makeLayout } from '../../../src/renderer/lib/keyboard-layout';
import { layoutMapOf } from '../../../src/renderer/lib/keyboard-layouts.data';
import {
  acceleratorHint,
  acceleratorToGlyphs,
  canonicalAccelerator,
  heldModifierGlyphs,
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
    expect(recordChord(chord('Space', { metaKey: true, shiftKey: true }), 'darwin')).toEqual({
      kind: 'ok',
      accelerator: 'Shift+Command+Space',
    });
  });

  it('keeps Control and Command distinct', () => {
    const result = recordChord(chord('KeyK', { ctrlKey: true, metaKey: true }), 'darwin');
    expect(result).toEqual({ kind: 'ok', accelerator: 'Control+Command+K' });
  });

  it('uses the physical key with Option held (e.key would be a symbol)', () => {
    // Option+Shift+K types "Ò" on Italian and "" on US layouts.
    expect(recordChord(chord('KeyK', { altKey: true, shiftKey: true }), 'darwin')).toEqual({
      kind: 'ok',
      accelerator: 'Alt+Shift+K',
    });
  });

  it('uses the US name of the position for Italian Shift+3 (e.key "£")', () => {
    expect(recordChord(chord('Digit3', { ctrlKey: true, shiftKey: true }), 'darwin')).toEqual({
      kind: 'ok',
      accelerator: 'Control+Shift+3',
    });
  });

  it('keeps listening while only modifiers are held', () => {
    expect(recordChord(chord('MetaLeft', { metaKey: true }), 'darwin')).toEqual({ kind: 'modifiers' });
    expect(recordChord(chord('AltRight', { altKey: true }), 'darwin')).toEqual({ kind: 'modifiers' });
  });

  it('cancels on a plain Escape', () => {
    expect(recordChord(chord('Escape'), 'darwin')).toEqual({ kind: 'cancel' });
  });

  it('requires a non-Shift modifier, except for function keys', () => {
    expect(recordChord(chord('KeyK'), 'darwin').kind).toBe('invalid');
    expect(recordChord(chord('KeyK', { shiftKey: true }), 'darwin').kind).toBe('invalid');
    expect(recordChord(chord('F13'), 'darwin')).toEqual({ kind: 'ok', accelerator: 'F13' });
  });

  it('refuses shortcuts macOS reserves', () => {
    const result = recordChord(chord('Space', { metaKey: true }), 'darwin');
    expect(result).toEqual({
      kind: 'invalid',
      reason: 'macOS uses ⌘Space for Spotlight. Choose another shortcut.',
    });
    expect(recordChord(chord('Digit4', { metaKey: true, shiftKey: true }), 'darwin').kind).toBe(
      'invalid',
    );
  });

  it('rejects keys without an accelerator name', () => {
    expect(recordChord(chord('IntlBackslash', { metaKey: true }), 'darwin').kind).toBe('invalid');
  });
});

describe('recordChord (Windows/Linux)', () => {
  it('maps the Windows key to Super and does not apply macOS reservations', () => {
    expect(recordChord(chord('Space', { metaKey: true }), 'linux')).toEqual({
      kind: 'ok',
      accelerator: 'Super+Space',
    });
  });

  it.each([
    [chord('Tab', { altKey: true }), 'Windows uses Alt+Tab for switching windows. Choose another shortcut.'],
    [chord('F4', { altKey: true }), 'Windows uses Alt+F4 for closing windows. Choose another shortcut.'],
    [chord('Escape', { ctrlKey: true, shiftKey: true }), 'Windows uses Ctrl+Shift+Esc for Task Manager. Choose another shortcut.'],
    [chord('Delete', { ctrlKey: true, altKey: true }), 'Windows uses Ctrl+Alt+Delete for the security screen. Choose another shortcut.'],
    [chord('KeyE', { metaKey: true }), 'Windows uses Win+E for the system. Choose another shortcut.'],
  ])('refuses shortcuts Windows reserves', (c, reason) => {
    expect(recordChord(c, 'win32')).toEqual({ kind: 'invalid', reason });
  });

  it('allows them on Linux', () => {
    expect(recordChord(chord('Tab', { altKey: true }), 'linux')).toEqual({ kind: 'ok', accelerator: 'Alt+Tab' });
  });

  it.each([
    ['darwin', 'Include ⌘, ⌃ or ⌥ so the shortcut doesn\'t block typing.'],
    ['win32', 'Include Ctrl, Alt or Win so the shortcut doesn\'t block typing.'],
    ['linux', 'Include Ctrl, Alt or Super so the shortcut doesn\'t block typing.'],
  ] as const)('names the modifiers of %s when one is missing', (platform, reason) => {
    expect(recordChord(chord('KeyK'), platform)).toEqual({ kind: 'invalid', reason });
  });
});

describe('acceleratorToGlyphs', () => {
  it('renders the default in macOS order', () => {
    expect(acceleratorToGlyphs('CommandOrControl+Shift+Space', 'darwin')).toEqual(['⇧', '⌘', 'Space']);
  });

  it('orders modifiers ⌃⌥⇧⌘ regardless of input order', () => {
    expect(acceleratorToGlyphs('Command+Shift+Alt+Control+K', 'darwin')).toEqual([
      '⌃',
      '⌥',
      '⇧',
      '⌘',
      'K',
    ]);
  });

  it('uses words on other platforms', () => {
    expect(acceleratorToGlyphs('CommandOrControl+Shift+Space', 'win32')).toEqual([
      'Ctrl',
      'Shift',
      'Space',
    ]);
  });

  it('names the Super key Win on Windows and Super on Linux', () => {
    expect(acceleratorToGlyphs('Control+Alt+Shift+Super+K', 'win32')).toEqual(['Ctrl', 'Alt', 'Shift', 'Win', 'K']);
    expect(acceleratorToGlyphs('Control+Alt+Shift+Super+K', 'linux')).toEqual(['Ctrl', 'Alt', 'Shift', 'Super', 'K']);
    expect(acceleratorToGlyphs('Super+K', 'darwin')).toEqual(['⌘', 'K']);
  });

  it('draws named keys as glyphs', () => {
    expect(acceleratorToGlyphs('Alt+Return', 'darwin')).toEqual(['⌥', '↩']);
  });

  it('names named keys with words on other platforms', () => {
    expect(acceleratorToGlyphs('Alt+Return', 'win32')).toEqual(['Alt', 'Enter']);
    expect(acceleratorToGlyphs('Control+Escape', 'win32')).toEqual(['Ctrl', 'Esc']);
  });
});

describe('heldModifierGlyphs', () => {
  const held = { metaKey: true, ctrlKey: true, altKey: false, shiftKey: false };

  it.each([
    ['darwin', ['⌃', '⌘']],
    ['win32', ['Ctrl', 'Win']],
    ['linux', ['Ctrl', 'Super']],
  ] as const)('labels the held modifiers on %s', (platform, labels) => {
    expect(heldModifierGlyphs(held, platform)).toEqual(labels);
  });
});

describe('keycaps on the user\'s layout', () => {
  const italian = makeLayout(layoutMapOf('it'));

  it('labels a punctuation key as printed on an Italian keyboard', () => {
    // Electron's "-" is the US Minus position, which is the "'" key on Italian.
    expect(acceleratorToGlyphs('Control+Alt+-', 'darwin', italian)).toEqual(['⌃', '⌥', "'"]);
    expect(acceleratorHint('Control+Alt+-', true, italian)).toMatch(/Physical key/);
  });

  it('keeps letters, digits and named keys unchanged', () => {
    expect(acceleratorToGlyphs('Alt+Shift+K', 'darwin', italian)).toEqual(['⌥', '⇧', 'K']);
    expect(acceleratorToGlyphs('Control+Shift+3', 'darwin', italian)).toEqual(['⌃', '⇧', '3']);
    expect(acceleratorToGlyphs('Shift+Command+Space', 'darwin', italian)).toEqual(['⇧', '⌘', 'Space']);
    expect(acceleratorHint('Alt+Shift+K', true, italian)).toBeUndefined();
  });

  it('uses the US labels by default', () => {
    expect(acceleratorToGlyphs('Control+Alt+-', 'darwin')).toEqual(['⌃', '⌥', '-']);
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
