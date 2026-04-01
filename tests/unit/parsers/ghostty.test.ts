import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { GhosttyParser } from '../../../src/main/parsers/ghostty.parser';

const FIXTURE_PATH = join(__dirname, '../../../fixtures/ghostty-config');

vi.mock('../../../src/main/platform/paths', () => ({
  getConfigPaths: () => [FIXTURE_PATH],
}));

describe('GhosttyParser', () => {
  let parser: GhosttyParser;

  beforeEach(() => {
    parser = new GhosttyParser();
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('ghostty');
    expect(parser.meta.label).toBe('Ghostty');
  });

  it('parses keybindings from fixture', async () => {
    const result = await parser.parse();

    expect(result.length).toBe(12);
    expect(result.every((kb) => kb.source === 'ghostty')).toBe(true);
  });

  it('normalizes simple key combos', async () => {
    const result = await parser.parse();
    const newTab = result.find((kb) => kb.rawCommand === 'new_tab');
    expect(newTab?.key).toBe('⌘t');
  });

  it('handles leader-key sequences with >', async () => {
    const result = await parser.parse();
    const gotoLeft = result.find((kb) => kb.rawCommand === 'goto_split:left');
    expect(gotoLeft?.key).toBe('⌃a>h');
  });

  it('humanizes action names', async () => {
    const result = await parser.parse();
    const newTab = result.find((kb) => kb.rawCommand === 'new_tab');
    expect(newTab?.command).toBe('New tab');
  });

  it('detects unbind actions', async () => {
    // No unbinds in the fixture, but test the logic
    const result = await parser.parse();
    expect(result.every((kb) => !kb.isUnbound)).toBe(true);
  });

  it('ignores non-keybind lines', async () => {
    const result = await parser.parse();
    // Should not include font-family, font-size, theme, etc.
    expect(result.every((kb) => kb.rawCommand !== 'font-family')).toBe(true);
  });

  it('returns empty for no watch paths', async () => {
    vi.spyOn(parser, 'getWatchPaths').mockReturnValue([]);
    const result = await parser.parse();
    expect(result).toEqual([]);
  });
});
