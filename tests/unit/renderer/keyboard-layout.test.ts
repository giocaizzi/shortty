import { describe, it, expect } from 'vitest';
import type { KeyStroke } from '../../../src/shared/keys';
import {
  type KeyboardLayout,
  US_KEYBOARD,
  layoutSearchText,
  makeLayout,
  resolveStroke,
} from '../../../src/renderer/lib/keyboard-layout';
import { detectLayout, layoutMapOf } from '../../../src/renderer/lib/keyboard-layouts.data';
import { GhosttyParser } from '../../../src/main/parsers/ghostty.parser';
import { MacosSystemParser } from '../../../src/main/parsers/macos-system.parser';
import { formatKeyCombo, normalizeToCanonical } from '../../../src/main/parsers/key-normalizer';
import { parseTmuxKey } from '../../../src/main/parsers/tmux.parser';

// Strokes exactly as the parsers produce them.
const ghostty = new GhosttyParser();
const ghosttyStroke = (trigger: string): KeyStroke => {
  const parsed = ghostty.parseLine(`keybind = ${trigger}=new_tab`);
  if (!parsed) throw new Error(trigger);
  return parsed.key.strokes[0];
};
const comboStroke = (combo: string): KeyStroke => formatKeyCombo(combo).strokes[0];
const macHotkey = (keyCode: number, flags: number): KeyStroke => {
  const [s] = new MacosSystemParser().parsePlist(
    { AppleSymbolicHotKeys: { 98: { enabled: true, value: { parameters: [65535, keyCode, flags] } } } },
    'test',
  );
  return s.strokes?.[0] as KeyStroke;
};

const S = {
  /** Ghostty `super+bracket_left`: physical BracketLeft */
  physBracket: ghosttyStroke('super+bracket_left'),
  /** Ghostty `super+[`: the character [ */
  charBracket: ghosttyStroke('super+['),
  /** macOS hotkey ⇧⌘ + keycode 44 (US /) */
  physSlash: macHotkey(44, 0x120000),
  /** VS Code `cmd+/` */
  charSlash: comboStroke('cmd+/'),
  /** Ghostty `ctrl+key_y` */
  physY: ghosttyStroke('ctrl+key_y'),
  /** Ghostty `ctrl+key_c` */
  physC: ghosttyStroke('ctrl+key_c'),
  /** Ghostty `ctrl+semicolon` */
  physSemicolon: ghosttyStroke('ctrl+semicolon'),
  charZ: comboStroke('cmd+z'),
  charC: comboStroke('cmd+c'),
  char1: comboStroke('cmd+1'),
  charEquals: comboStroke('cmd+='),
  /** tmux `%` */
  tmuxPercent: normalizeToCanonical(parseTmuxKey('%')).strokes[0],
};

type Case = [keyof typeof S, string, 'hint' | null];

const layouts: Record<string, KeyboardLayout> = {
  US: US_KEYBOARD,
  IT: makeLayout(layoutMapOf('it')),
  DE: makeLayout(layoutMapOf('de')),
  FR: makeLayout(layoutMapOf('fr')),
  ES: makeLayout(layoutMapOf('es')),
  // The Mac British base layer equals U.S.: getLayoutMap() cannot tell them apart.
  UK: makeLayout(layoutMapOf('us')),
  Dvorak: makeLayout(layoutMapOf('dvorak')),
  RU: makeLayout(layoutMapOf('ru')),
};

const expectations: Record<string, Case[]> = {
  US: [
    ['physBracket', '⌘[', null],
    ['charBracket', '⌘[', null],
    ['physSlash', '⇧⌘/', null],
    ['charSlash', '⌘/', null],
    ['physY', '⌃Y', null],
    ['charZ', '⌘Z', null],
    ['char1', '⌘1', null],
    ['charEquals', '⌘=', null],
    ['tmuxPercent', '%', null],
    ['physSemicolon', '⌃;', null],
  ],
  IT: [
    ['physBracket', '⌘È', 'hint'],
    ['charBracket', '⌘[', 'hint'],
    ['physSlash', '⇧⌘-', 'hint'],
    ['charSlash', '⌘/', 'hint'],
    ['physY', '⌃Y', null],
    ['charZ', '⌘Z', null],
    ['char1', '⌘1', null],
    ['charEquals', '⌘=', 'hint'],
    ['tmuxPercent', '%', null],
    ['physSemicolon', '⌃Ò', 'hint'],
  ],
  DE: [
    ['physBracket', '⌘Ü', 'hint'],
    ['charBracket', '⌘[', 'hint'],
    ['charSlash', '⌘/', 'hint'],
    ['physY', '⌃Z', 'hint'],
    ['charZ', '⌘Z', null],
    ['char1', '⌘1', null],
    ['tmuxPercent', '%', null],
    ['physSemicolon', '⌃Ö', 'hint'],
  ],
  FR: [
    ['physBracket', '⌘^', 'hint'],
    ['charBracket', '⌘[', 'hint'],
    ['physSlash', '⇧⌘=', 'hint'],
    ['physY', '⌃Y', null],
    ['physC', '⌃C', null],
    ['charZ', '⌘Z', null],
    ['char1', '⌘1', 'hint'],
    ['charEquals', '⌘=', null],
    ['tmuxPercent', '%', 'hint'],
    ['physSemicolon', '⌃M', 'hint'],
  ],
  ES: [
    ['physBracket', '⌘`', 'hint'],
    ['charBracket', '⌘[', 'hint'],
    ['charSlash', '⌘/', 'hint'],
    ['charEquals', '⌘=', 'hint'],
    ['physSemicolon', '⌃Ñ', 'hint'],
    ['char1', '⌘1', null],
  ],
  UK: [
    ['physBracket', '⌘[', null],
    ['charBracket', '⌘[', null],
    ['tmuxPercent', '%', null],
  ],
  Dvorak: [
    ['physBracket', '⌘/', 'hint'],
    ['charBracket', '⌘[', null],
    ['physY', '⌃F', 'hint'],
    ['physC', '⌃J', 'hint'],
    ['charC', '⌘C', null],
    ['charZ', '⌘Z', null],
  ],
  // Non-Latin: shortcuts keep Latin letters at the US position, as macOS does.
  RU: [
    ['physY', '⌃Y', null],
    ['physC', '⌃C', null],
    ['physBracket', '⌘[', null],
    ['charC', '⌘C', null],
    ['charBracket', '⌘[', 'hint'],
  ],
};

describe('layout-aware key display', () => {
  for (const [name, cases] of Object.entries(expectations)) {
    describe(name, () => {
      for (const [stroke, text, hint] of cases) {
        it(`${stroke} → ${text}${hint ? ' (hint)' : ''}`, () => {
          const resolved = resolveStroke(S[stroke], layouts[name]);
          expect(resolved.text).toBe(text);
          expect(Boolean(resolved.hint)).toBe(hint === 'hint');
        });
      }
    });
  }

  it('explains how to type a character that needs Option', () => {
    expect(resolveStroke(S.charBracket, layouts.IT).hint).toBe('Type “[” with ⌥È on your keyboard.');
    expect(resolveStroke(S.charBracket, layouts.DE).hint).toBe('Type “[” with ⌥5 on your keyboard.');
    expect(resolveStroke(S.charBracket, layouts.FR).hint).toBe('Type “[” with ⌥⇧( on your keyboard.');
    expect(resolveStroke(S.charSlash, layouts.IT).hint).toBe('Type “/” with ⇧7 on your keyboard.');
  });

  it('explains physical keys in terms of the US key', () => {
    expect(resolveStroke(S.physBracket, layouts.IT).hint)
      .toBe('Physical key: “È” on your keyboard is the “[” key of a US keyboard.');
  });

  it('leaves named keys and literal vim text alone', () => {
    const named: KeyStroke = { mods: ['cmd'], key: 'Return' };
    expect(resolveStroke(named, layouts.IT).text).toBe('⌘↩');
    expect(resolveStroke({ mods: [], key: 'gg', literal: true }, layouts.DE).text).toBe('gg');
    expect(resolveStroke({ mods: [], key: 'w', literal: true }, layouts.FR).text).toBe('w');
  });
});

describe('detectLayout', () => {
  it.each(['us', 'it', 'de', 'fr', 'es', 'dvorak', 'ru'])('recognises %s from its base layer', (id) => {
    expect(detectLayout(layoutMapOf(id))?.id).toBe(id);
  });

  it('recognises a real getLayoutMap() result (Italian, Electron 44 on macOS)', () => {
    const real = new Map(Object.entries({
      IntlYen: '\\', KeyK: 'k', KeyG: 'g', Digit2: '2', Digit0: '0', KeyV: 'v', KeyA: 'a', Backquote: '<',
      KeyL: 'l', IntlBackslash: '\\', Quote: 'à', KeyW: 'w', Digit8: '8', KeyM: 'm', KeyH: 'h', Period: '.',
      Digit7: '7', Digit1: '1', KeyP: 'p', KeyD: 'd', KeyF: 'f', KeyO: 'o', KeyQ: 'q', KeyC: 'c', KeyN: 'n',
      BracketLeft: 'è', KeyZ: 'z', KeyY: 'y', Digit3: '3', Digit6: '6', Digit5: '5', KeyX: 'x', Slash: '-',
      Backslash: 'ù', Comma: ',', Minus: "'", Digit4: '4', KeyB: 'b', KeyT: 't', Digit9: '9', KeyS: 's',
      KeyI: 'i', KeyU: 'u', IntlRo: '<', Equal: 'ì', KeyJ: 'j', Semicolon: 'ò', KeyR: 'r', BracketRight: '+',
      KeyE: 'e',
    }));
    expect(detectLayout(real)?.id).toBe('it');
    // the built-in table agrees with the real map on every key it lists
    for (const [code, ch] of layoutMapOf('it')) expect(real.get(code), code).toBe(ch);
    expect(resolveStroke(S.charBracket, makeLayout(real)).hint).toBe('Type “[” with ⌥È on your keyboard.');
  });

  it('returns null for an unknown layout', () => {
    const map = new Map(layoutMapOf('us'));
    for (const code of ['KeyQ', 'KeyW', 'Semicolon', 'Quote', 'BracketLeft']) map.set(code, 'x');
    expect(detectLayout(map)).toBeNull();
  });
});

describe('layoutSearchText', () => {
  it('lets Italian users find keys by what is printed on their keycaps', () => {
    expect(layoutSearchText([S.physSemicolon], layouts.IT)).toContain('ò');
    expect(layoutSearchText([S.physBracket], layouts.IT)).toContain('è');
    // a char key typed with ⌥è is found by "è" too
    expect(layoutSearchText([S.charBracket], layouts.IT)).toContain('è');
  });

  it('adds the US shifted character of ⇧+key strokes ("?" finds ⇧/)', () => {
    const shiftSlash = formatKeyCombo('cmd+shift+/').strokes;
    expect(layoutSearchText(shiftSlash, US_KEYBOARD)).toContain('?');
    expect(layoutSearchText(shiftSlash, US_KEYBOARD)).toContain('question');
  });

  it('is empty without strokes', () => {
    expect(layoutSearchText(undefined, US_KEYBOARD)).toBe('');
  });
});
