import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MacosSystemParser } from '../../../src/main/parsers/macos-system.parser';

describe('MacosSystemParser', () => {
  let parser: MacosSystemParser;

  beforeEach(() => {
    parser = new MacosSystemParser();
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('macos-system');
    expect(parser.meta.label).toBe('macOS');
    expect(parser.meta.platforms).toEqual(['darwin']);
  });

  if (process.platform === 'darwin') {
    it('detects availability on macOS', async () => {
      const available = await parser.isAvailable();
      expect(available).toBe(true);
    });

    it('parses system shortcuts from plist', async () => {
      const result = await parser.parse();
      // Should find at least some known shortcuts
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((kb) => kb.source === 'macos-system')).toBe(true);
    });

    it('includes known shortcuts like Spotlight and Mission Control', async () => {
      const result = await parser.parse();
      const names = result.map((kb) => kb.command);
      // At least some of these should be present
      const knownNames = [
        'Spotlight: Show Spotlight search',
        'Mission Control',
        'Show Desktop',
      ];
      const found = knownNames.filter((n) => names.includes(n));
      expect(found.length).toBeGreaterThan(0);
    });

    it('formats modifier glyphs correctly', async () => {
      const result = await parser.parse();
      // All keys should contain valid modifier glyphs
      for (const kb of result) {
        expect(kb.key).toMatch(/[⌘⌥⌃⇧A-Za-z0-9←→↑↓\s]/);
      }
    });
  } else {
    it('is not available on non-macOS platforms', async () => {
      const available = await parser.isAvailable();
      expect(available).toBe(false);
    });
  }
});
