import { describe, it, expect } from 'vitest';
import {
  Modifier,
  parseKeyCombo,
  normalizeToCanonical,
  parseModifierWord,
  charCodeToKeyName,
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

    it('handles prefix for tmux-style keys', () => {
      const result = normalizeToCanonical({
        modifiers: [],
        key: 'C',
        prefix: 'prefix',
      });
      expect(result.displayKey).toBe('prefix C');
      expect(result.searchKey).toBe('prefix c');
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

  describe('charCodeToKeyName', () => {
    it('converts printable ASCII to uppercase character', () => {
      expect(charCodeToKeyName(65)).toBe('A');
      expect(charCodeToKeyName(97)).toBe('A');
      expect(charCodeToKeyName(49)).toBe('1');
      expect(charCodeToKeyName(32)).toBe(' ');
    });

    it('returns null for non-printable codes', () => {
      expect(charCodeToKeyName(0)).toBeNull();
      expect(charCodeToKeyName(127)).toBeNull();
      expect(charCodeToKeyName(0xFFFF)).toBeNull();
    });
  });
});
