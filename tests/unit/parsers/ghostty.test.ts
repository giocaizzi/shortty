import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { GhosttyParser } from '../../../src/main/parsers/ghostty.parser';
import { FIXTURES, rows } from './parser-helpers';

const FIXTURE_PATH = join(FIXTURES, 'ghostty-config');

describe('GhosttyParser', () => {
  let parser: GhosttyParser;

  beforeEach(() => {
    parser = new GhosttyParser();
    parser.setConfigPaths([FIXTURE_PATH]);
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('ghostty');
    expect(parser.meta.label).toBe('Ghostty');
  });

  it('parses every keybind with exact key, command, context and unbound flag', async () => {
    const result = await parser.parse();
    expect(rows(result)).toEqual([
      ['⌘T', 'New tab', null, false],
      ['⇧⌘D', 'New split (down)', null, false],
      ['⇧⌘R', 'New split (right)', null, false],
      ['⌘W', 'Close surface', null, false],
      ['⌃A H', 'Goto split (left)', null, false],
      ['⌃A L', 'Goto split (right)', null, false],
      ['⌃A J', 'Goto split (bottom)', null, false],
      ['⌃A K', 'Goto split (top)', null, false],
      ['⇧⌘Return', 'Toggle fullscreen', null, false],
      ['⌘=', 'Increase font size (1)', null, false],
      ['⌘-', 'Decrease font size (1)', null, false],
      ['⌘0', 'Reset font size', null, false],
      ['⌃⌘=', 'Equalize splits', null, false],
      ['⌘+', 'Increase font size (2)', null, false],
      ['⌃`', 'Toggle quick terminal', 'global', false],
      ['⌃⇧C', 'Copy to clipboard', 'unconsumed, performable', false],
      ['⌘[', 'Goto split (previous)', null, false],
      ['⌘]', 'Goto split (next)', null, false],
      ['⌃1', 'Goto tab (1)', null, false],
      ['⌃A ⌃A C', 'New window', null, false],
      ['J', 'Scroll page lines (1)', 'vim', false],
      ['⇧⌘↑', 'Jump to prompt (-1)', null, false],
      ['⌘Backspace', 'Text (\\x15)', null, false],
      ['⌘K', 'Unbind', null, true],
    ]);
  });

  it('uses cheatsheet-compatible rawCommand ids', async () => {
    const result = await parser.parse();
    expect(result[0].rawCommand).toBe('ghostty.new_tab');
    expect(result.at(-1)?.rawCommand).toBe('ghostty.unbind');
  });

  it('distinguishes physical (W3C code) triggers from unicode triggers', async () => {
    const result = await parser.parse();
    const strokesOf = (raw: string) => result.find((kb) => kb.rawCommand === raw)?.strokes;
    // `equal`, `minus`, `grave_accent`, `key_c`, `bracket_left`, `physical:one` are physical
    expect(strokesOf('ghostty.increase_font_size:1')).toEqual([{ mods: ['cmd'], key: '=', code: 'Equal' }]);
    expect(strokesOf('ghostty.toggle_quick_terminal')).toEqual([{ mods: ['ctrl'], key: '`', code: 'Backquote' }]);
    expect(strokesOf('ghostty.copy_to_clipboard')).toEqual([{ mods: ['ctrl', 'shift'], key: 'C', code: 'KeyC' }]);
    expect(strokesOf('ghostty.goto_split:previous')).toEqual([{ mods: ['cmd'], key: '[', code: 'BracketLeft' }]);
    expect(strokesOf('ghostty.goto_tab:1')).toEqual([{ mods: ['ctrl'], key: '1', code: 'Digit1' }]);
    // single codepoints match the produced character
    expect(strokesOf('ghostty.goto_split:next')).toEqual([{ mods: ['cmd'], key: ']' }]);
    expect(strokesOf('ghostty.equalize_splits')).toEqual([{ mods: ['ctrl', 'cmd'], key: '=' }]);
    expect(strokesOf('ghostty.new_tab')).toEqual([{ mods: ['cmd'], key: 'T' }]);
  });

  it('parses a single line', () => {
    expect(parser.parseLine('keybind = clear')).toBeNull();
    expect(parser.parseLine('keybind = chain=new_tab')).toBeNull();
    expect(parser.parseLine('font-size = 14')).toBeNull();
    expect(parser.parseLine('keybind = alt+arrow_left=esc:b')?.key.displayKey).toBe('⌥←');
    expect(parser.parseLine('keybind = ctrl+shift+page_up=jump_to_prompt:-1')?.key.displayKey).toBe('⌃⇧PageUp');
    expect(parser.parseLine('keybind = super+digit_1=goto_tab:1')?.key.strokes).toEqual([
      { mods: ['cmd'], key: '1', code: 'Digit1' },
    ]);
    expect(parser.parseLine('keybind = ctrl+ò=new_tab')?.key.displayKey).toBe('⌃Ò');
  });

  it('generates unique IDs', async () => {
    const result = await parser.parse();
    const ids = result.map((kb) => kb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty for missing file', async () => {
    const p = new GhosttyParser();
    p.setConfigPaths(['/tmp/nonexistent']);
    expect(await p.parse()).toEqual([]);
  });
});
