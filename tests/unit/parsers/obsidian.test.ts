import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { ObsidianParser } from '../../../src/main/parsers/obsidian.parser';
import { FIXTURES, rows, withPlatform } from './parser-helpers';

const FIXTURE_PATH = join(FIXTURES, 'obsidian-hotkeys.json');
const VAULT_PATH = join(FIXTURES, 'obsidian-vault/Notes/.obsidian/hotkeys.json');

describe('ObsidianParser', () => {
  withPlatform('darwin');
  let parser: ObsidianParser;

  beforeEach(() => {
    parser = new ObsidianParser();
    parser.setConfigPaths([FIXTURE_PATH]);
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('obsidian');
    expect(parser.meta.label).toBe('Obsidian');
  });

  it('parses every hotkey with exact key, command and unbound flag', async () => {
    expect(rows(await parser.parse())).toEqual([
      ['⌘B', 'Toggle bold', null, false],
      ['⌘I', 'Toggle italic', null, false],
      ['⌥⌘←', 'Go back', null, false],
      ['⇧⌘P', 'Open', null, false],
      ['', 'Toggle strikethrough', null, true],
    ]);
  });

  it('uses the vault name as context, keeps several hotkeys per command, skips malformed entries', async () => {
    parser.setConfigPaths([VAULT_PATH]);
    expect(rows(await parser.parse())).toEqual([
      ['⌘B', 'Toggle bold', 'Notes', false],
      ['⌘Return', 'Toggle checklist status', 'Notes', false],
      ['⇧⌘L', 'Toggle checklist status', 'Notes', false],
      ['⌘\\', 'Toggle left sidebar', 'Notes', false],
      ['⌃⌥→', 'Split vertical', 'Notes', false],
      ['', 'Open settings', 'Notes', true],
    ]);
  });

  it('generates unique IDs for a command with several hotkeys', async () => {
    parser.setConfigPaths([VAULT_PATH]);
    const result = await parser.parse();
    const ids = result.map((kb) => kb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('on Linux', () => {
    withPlatform('linux');

    it('maps Mod to Ctrl', async () => {
      const result = await parser.parse();
      expect(result[0].key).toBe('⌃B');
    });
  });
});
