import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { ZshParser } from '../../../src/main/parsers/zsh.parser';

const FIXTURE_PATH = join(__dirname, '../../../fixtures/zshrc');

vi.mock('../../../src/main/platform/paths', () => ({
  getConfigPaths: () => [FIXTURE_PATH],
}));

describe('ZshParser', () => {
  let parser: ZshParser;

  beforeEach(() => {
    parser = new ZshParser();
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('zsh');
    expect(parser.meta.label).toBe('Zsh');
  });

  it('parses bindkey entries from fixture', async () => {
    const result = await parser.parse();

    expect(result.length).toBe(6);
    expect(result.every((kb) => kb.source === 'zsh')).toBe(true);
  });

  it('normalizes ^ to ⌃ (Ctrl)', async () => {
    const result = await parser.parse();
    const histSearch = result.find(
      (kb) => kb.rawCommand.includes('history-incremental-search-backward'),
    );
    expect(histSearch?.key).toBe('⌃R');
  });

  it('normalizes escape sequences to arrow glyphs', async () => {
    const result = await parser.parse();
    const upSearch = result.find(
      (kb) => kb.rawCommand.includes('up-line-or-search'),
    );
    expect(upSearch?.key).toBe('↑');
  });

  it('captures keymap as context', async () => {
    const result = await parser.parse();
    const vicmd = result.find((kb) => kb.context === 'vicmd');
    expect(vicmd).toBeDefined();
    expect(vicmd?.command).toBe('Up line or history');
  });

  it('ignores non-bindkey lines', async () => {
    const result = await parser.parse();
    expect(result.every((kb) => kb.rawCommand.includes('bindkey'))).toBe(true);
  });

  it('returns empty for no watch paths', async () => {
    vi.spyOn(parser, 'getWatchPaths').mockReturnValue([]);
    const result = await parser.parse();
    expect(result).toEqual([]);
  });
});
