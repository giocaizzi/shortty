import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { ObsidianParser } from '../../../src/main/parsers/obsidian.parser';

const FIXTURE_PATH = join(__dirname, '../../../fixtures/obsidian-hotkeys.json');

vi.mock('../../../src/main/platform/paths', () => ({
  discoverObsidianVaults: () => [FIXTURE_PATH],
}));

describe('ObsidianParser', () => {
  let parser: ObsidianParser;

  beforeEach(async () => {
    parser = new ObsidianParser();
    await parser.isAvailable(); // triggers vault discovery
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('obsidian');
    expect(parser.meta.label).toBe('Obsidian');
  });

  it('parses hotkeys from fixture', async () => {
    const result = await parser.parse();
    // 4 bound + 1 unbound = 5
    expect(result.length).toBe(5);
    expect(result.every((kb) => kb.source === 'obsidian')).toBe(true);
  });

  it('normalizes Mod to platform-appropriate modifier', async () => {
    const result = await parser.parse();
    const bold = result.find((kb) => kb.rawCommand === 'editor:toggle-bold');
    // On macOS Mod -> ⌘, on others -> ⌃
    const expectedMod = process.platform === 'darwin' ? '⌘' : '⌃';
    expect(bold?.key).toBe(`${expectedMod}B`);
  });

  it('handles multiple modifiers', async () => {
    const result = await parser.parse();
    const goBack = result.find((kb) => kb.rawCommand === 'app:go-back');
    expect(goBack?.key).toContain('⌥');
    expect(goBack?.key).toContain('ArrowLeft');
  });

  it('detects unbound hotkeys (empty array)', async () => {
    const result = await parser.parse();
    const unbound = result.find(
      (kb) => kb.rawCommand === 'editor:toggle-strikethrough',
    );
    expect(unbound?.isUnbound).toBe(true);
    expect(unbound?.key).toBe('');
  });

  it('humanizes command IDs', async () => {
    const result = await parser.parse();
    const commandPalette = result.find(
      (kb) => kb.rawCommand === 'command-palette:open',
    );
    expect(commandPalette?.command).toBe('Open');
  });

  it('generates unique IDs', async () => {
    const result = await parser.parse();
    const ids = result.map((kb) => kb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
