import { describe, it, expect } from 'vitest';
import {
  Modifier,
  parseKeyCombo,
  normalizeToCanonical,
  parseModifierWord,
  canonicalKeyName,
  formatCheatsheetKey,
  formatKeyCombo,
} from '../../../src/main/parsers/key-normalizer';

describe('KeyNormalizer', () => {
  describe('parseKeyCombo', () => {
    it('parses simple modifier+key combos', () => {
      const result = parseKeyCombo('Ctrl+A');
      expect(result.modifiers).toEqual([Modifier.Control]);
      expect(result.key).toBe('A');
    });

    it('parses multiple modifiers', () => {
      const result = parseKeyCombo('Cmd+Shift+T');
      expect(result.modifiers).toContain(Modifier.Command);
      expect(result.modifiers).toContain(Modifier.Shift);
      expect(result.key).toBe('T');
    });

    it('handles the + key edge case (Ctrl++)', () => {
      const result = parseKeyCombo('Ctrl++');
      expect(result.modifiers).toEqual([Modifier.Control]);
      expect(result.key).toBe('+');
    });

    it('handles single key without modifiers', () => {
      const result = parseKeyCombo('F5');
      expect(result.modifiers).toEqual([]);
      expect(result.key).toBe('F5');
    });

    it('handles custom separator', () => {
      const result = parseKeyCombo('Command-Shift-L', '-');
      expect(result.modifiers).toContain(Modifier.Command);
      expect(result.modifiers).toContain(Modifier.Shift);
      expect(result.key).toBe('L');
    });

    it('recognizes all modifier variants', () => {
      for (const [word, expected] of [
        ['Cmd', Modifier.Command],
        ['Command', Modifier.Command],
        ['Meta', Modifier.Command],
        ['Super', Modifier.Command],
        ['Ctrl', Modifier.Control],
        ['Control', Modifier.Control],
        ['Alt', Modifier.Option],
        ['Option', Modifier.Option],
        ['Shift', Modifier.Shift],
      ] as const) {
        const result = parseKeyCombo(`${word}+X`);
        expect(result.modifiers).toContain(expected);
      }
    });
  });

  describe('normalizeToCanonical', () => {
    it('produces canonical modifier order: ⌃⌥⇧⌘', () => {
      const result = normalizeToCanonical({
        modifiers: [Modifier.Command, Modifier.Shift, Modifier.Control, Modifier.Option],
        key: 'A',
      });
      expect(result.displayKey).toBe('⌃⌥⇧⌘A');
    });

    it('produces search-friendly text', () => {
      const result = normalizeToCanonical({
        modifiers: [Modifier.Command, Modifier.Shift],
        key: 'T',
      });
      expect(result.searchKey).toBe('shift cmd t');
    });

    it('handles a prefix stroke for tmux-style keys', () => {
      const result = normalizeToCanonical({
        modifiers: [],
        key: 'C',
        prefix: { modifiers: [Modifier.Control], key: 'B' },
      });
      expect(result.displayKey).toBe('⌃B C');
      expect(result.searchKey).toBe('ctrl b c');
      expect(result.strokes).toEqual([
        { mods: ['ctrl'], key: 'B' },
        { mods: [], key: 'C' },
      ]);
    });

    it('handles special key search names', () => {
      const result = normalizeToCanonical({
        modifiers: [Modifier.Control],
        key: '←',
      });
      expect(result.searchKey).toBe('ctrl left');
    });

    it('deduplicates modifiers', () => {
      const result = normalizeToCanonical({
        modifiers: [Modifier.Command, Modifier.Command],
        key: 'A',
      });
      expect(result.displayKey).toBe('⌘A');
    });

    it('handles key without modifiers', () => {
      const result = normalizeToCanonical({
        modifiers: [],
        key: 'Space',
      });
      expect(result.displayKey).toBe('Space');
      expect(result.searchKey).toBe('space');
    });
  });

  describe('parseModifierWord', () => {
    it('recognizes standard modifier names', () => {
      expect(parseModifierWord('Ctrl')).toBe(Modifier.Control);
      expect(parseModifierWord('Shift')).toBe(Modifier.Shift);
      expect(parseModifierWord('Alt')).toBe(Modifier.Option);
      expect(parseModifierWord('Cmd')).toBe(Modifier.Command);
    });

    it('is case-insensitive', () => {
      expect(parseModifierWord('ctrl')).toBe(Modifier.Control);
      expect(parseModifierWord('SHIFT')).toBe(Modifier.Shift);
    });

    it('handles Mod platform-aware', () => {
      const result = parseModifierWord('Mod');
      if (process.platform === 'darwin') {
        expect(result).toBe(Modifier.Command);
      } else {
        expect(result).toBe(Modifier.Control);
      }
    });

    it('returns null for non-modifier words', () => {
      expect(parseModifierWord('A')).toBeNull();
      expect(parseModifierWord('F5')).toBeNull();
      expect(parseModifierWord('Space')).toBeNull();
    });
  });

  describe('canonicalKeyName', () => {
    it('upper-cases single characters, including accented letters', () => {
      expect(canonicalKeyName('a')).toBe('A');
      expect(canonicalKeyName('ò')).toBe('Ò');
      expect(canonicalKeyName('[')).toBe('[');
      // ß upper-cases to two letters: keep it
      expect(canonicalKeyName('ß')).toBe('ß');
    });

    it('gives named keys one spelling', () => {
      expect(canonicalKeyName('enter')).toBe('Return');
      expect(canonicalKeyName('Escape')).toBe('Escape');
      expect(canonicalKeyName('esc')).toBe('Escape');
      expect(canonicalKeyName('ArrowUp')).toBe('↑');
      expect(canonicalKeyName('pagedown')).toBe('PageDown');
      expect(canonicalKeyName('backspace')).toBe('Backspace');
      expect(canonicalKeyName('delete')).toBe('Delete');
      expect(canonicalKeyName('f12')).toBe('F12');
      expect(canonicalKeyName('numpad_add')).toBe('NumpadAdd');
      expect(canonicalKeyName('Period')).toBe('.');
      expect(canonicalKeyName('MediaPlayPause')).toBe('MediaPlayPause');
    });

    it('understands Windows Terminal and PSReadLine key names', () => {
      expect(canonicalKeyName('minus')).toBe('-');
      expect(canonicalKeyName('plus')).toBe('+');
      expect(canonicalKeyName('backtick')).toBe('`');
      expect(canonicalKeyName('pgup')).toBe('PageUp');
      expect(canonicalKeyName('pgdn')).toBe('PageDown');
      expect(canonicalKeyName('numpad_plus')).toBe('NumpadPlus');
      expect(canonicalKeyName('numpad_0')).toBe('Numpad0');
      expect(canonicalKeyName('UpArrow')).toBe('↑');
      expect(canonicalKeyName('LeftArrow')).toBe('←');
      expect(canonicalKeyName('Spacebar')).toBe('Space');
      expect(parseKeyCombo('win+alt+shift+minus')).toEqual({
        modifiers: [Modifier.Command, Modifier.Option, Modifier.Shift], key: '-',
      });
    });
  });

  describe('formatKeyCombo', () => {
    it('normalizes lowercase config keys to keycap letters', () => {
      expect(formatKeyCombo('cmd+shift+t').displayKey).toBe('⇧⌘T');
      expect(formatKeyCombo('ctrl+alt+delete').displayKey).toBe('⌃⌥Delete');
    });

    it('adds symbol names to the search key', () => {
      expect(formatKeyCombo('Cmd+,').searchKey).toBe('cmd , comma');
      expect(formatKeyCombo('Ctrl++').searchKey).toBe('ctrl + plus');
    });
  });

  describe('formatCheatsheetKey', () => {
    it('normalizes "Mod+Key" chords to glyphs like the parsers do', () => {
      expect(formatCheatsheetKey('Cmd+Shift+P').displayKey).toBe('⇧⌘P');
      expect(formatCheatsheetKey('Cmd+K Cmd+S').displayKey).toBe('⌘K ⌘S');
      expect(formatCheatsheetKey('Cmd+K Z').displayKey).toBe('⌘K Z');
      expect(formatCheatsheetKey('Shift+Alt+Up').displayKey).toBe('⌥⇧↑');
      expect(formatCheatsheetKey('F5').displayKey).toBe('F5');
      expect(formatCheatsheetKey('Cmd+=').searchKey).toBe('cmd = equals');
    });

    it('keeps vim text verbatim when literalText is set', () => {
      const literal = { literalText: true };
      expect(formatCheatsheetKey('dd', literal).displayKey).toBe('dd');
      expect(formatCheatsheetKey('Ctrl+W s', literal).displayKey).toBe('⌃W s');
      expect(formatCheatsheetKey(':wq', literal).strokes).toEqual([{ mods: [], key: ':wq', literal: true }]);
      expect(formatCheatsheetKey('Escape', literal).strokes).toEqual([{ mods: [], key: 'Escape' }]);
      expect(formatCheatsheetKey('W', literal).displayKey).toBe('W');
    });
  });
});
