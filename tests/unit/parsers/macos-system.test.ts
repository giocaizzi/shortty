import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MacosSystemParser, parseKeyEquivalent } from '../../../src/main/parsers/macos-system.parser';
import { normalizeToCanonical } from '../../../src/main/parsers/key-normalizer';
import { FIXTURES, rows } from './parser-helpers';

const HOTKEYS = join(FIXTURES, 'macos-symbolichotkeys.json');
const GLOBAL_PREFS = join(FIXTURES, 'macos-global-preferences.json');
const load = (p: string) => JSON.parse(readFileSync(p, 'utf-8'));

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

  it('parses symbolic hotkeys by virtual keycode with exact names', () => {
    const result = parser.parsePlist(load(HOTKEYS), HOTKEYS);
    expect(rows(result)).toEqual([
      ['⇧⌘3', 'Screenshots: Save picture of screen as a file', null, false],
      ['⇧⌘4', 'Screenshots: Save picture of selected area as a file', null, false],
      ['⌃↑', 'Mission Control', null, false],
      ['F11', 'Mission Control: Show Desktop', null, false],
      ['⌃Space', 'Input Sources: Select the previous input source', null, false],
      // disabled in System Settings
      ['⌃⌥Space', 'Input Sources: Select next source in Input menu', null, true],
      ['⌘Space', 'Spotlight: Show Spotlight search', null, false],
      ['⌃←', 'Mission Control: Move left a space', null, false],
      ['⇧⌘/', 'Keyboard: Show Help menu', null, false],
      ['⌃1', 'Mission Control: Switch to Desktop 1', null, false],
      ['⌥⌘F5', 'Accessibility: Show Accessibility controls', null, false],
      // 163 has no key (65535/65535); 999 is not a known id
    ]);
  });

  it('carries the physical key position for character keys', () => {
    const result = parser.parsePlist(load(HOTKEYS), HOTKEYS);
    const screenshot = result.find((kb) => kb.rawCommand === 'symbolichotkey:28');
    expect(screenshot?.strokes).toEqual([{ mods: ['shift', 'cmd'], key: '3', code: 'Digit3' }]);
    const help = result.find((kb) => kb.rawCommand === 'symbolichotkey:98');
    expect(help?.strokes?.[0].code).toBe('Slash');
  });

  it('parses NSUserKeyEquivalents app shortcuts', () => {
    const result = parser.parsePlist(load(GLOBAL_PREFS), GLOBAL_PREFS);
    expect(rows(result)).toEqual([
      ['⌥⌘Z', 'Zoom', 'App Shortcuts', false],
      ['⇧⌘M', 'Merge All Windows', 'App Shortcuts', false],
      ['⌃⌥←', 'Window › Move Window to Left Side of Screen', 'App Shortcuts', false],
      ['⌃⇧⌘S', 'Show Sidebar', 'App Shortcuts', false],
      ['⌥⇧⌘V', 'Paste and Match Style', 'App Shortcuts', false],
      ['⌃⌘Q', 'Lock Screen', 'App Shortcuts', false],
    ]);
  });

  it('reads JSON fixtures through parse()', async () => {
    Object.defineProperty(process, 'platform', { value: process.platform });
    parser.setConfigPaths([HOTKEYS, GLOBAL_PREFS]);
    const result = await parser.parse();
    expect(result).toHaveLength(17);
    expect(new Set(result.map((kb) => kb.id)).size).toBe(17);
  });

  it.runIf(process.platform === 'darwin')('decodes binary plists with plutil, asynchronously', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shortty-plist-'));
    try {
      const plists = [HOTKEYS, GLOBAL_PREFS].map((json, i) => {
        const out = join(dir, `${i}.plist`);
        execFileSync('plutil', ['-convert', 'binary1', '-o', out, json]);
        return out;
      });
      parser.setConfigPaths(plists);
      const pending = parser.parse();
      expect(pending).toBeInstanceOf(Promise);
      expect(await pending).toHaveLength(17);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('parseKeyEquivalent', () => {
  const display = (v: string) => {
    const parsed = parseKeyEquivalent(v);
    return parsed ? normalizeToCanonical(parsed).displayKey : null;
  };

  it('decodes modifier prefixes and function keys', () => {
    expect(display('@k')).toBe('⌘K');
    expect(display('@$k')).toBe('⇧⌘K');
    expect(display('@K')).toBe('⇧⌘K');
    expect(display('^~@')).toBe('⌃⌥⌘→');
    expect(display('@')).toBe('⌘F1');
    expect(display('@\u007f')).toBe('⌘Backspace');
    expect(display('@')).toBe('@');
    expect(display('')).toBeNull();
  });
});
