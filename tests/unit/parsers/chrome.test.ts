import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { ChromeParser } from '../../../src/main/parsers/chrome.parser';

const FIXTURE_PATH = join(__dirname, '../../../fixtures/chrome-preferences.json');

vi.mock('../../../src/main/platform/paths', () => ({
  getConfigPaths: () => [FIXTURE_PATH],
}));

describe('ChromeParser', () => {
  let parser: ChromeParser;

  beforeEach(() => {
    parser = new ChromeParser();
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('chrome');
    expect(parser.meta.label).toBe('Chrome');
  });

  it('parses extension shortcuts from fixture', async () => {
    const result = await parser.parse();

    // On macOS: 3 mac: entries; on Windows: 1 windows: entry
    if (process.platform === 'darwin') {
      expect(result.length).toBe(3);
    } else if (process.platform === 'win32') {
      expect(result.length).toBe(1);
    }
  });

  it('normalizes key combos', async () => {
    const result = await parser.parse();
    if (process.platform === 'darwin') {
      const bitwarden = result.find((kb) =>
        kb.command.includes('Bitwarden'),
      );
      expect(bitwarden?.key).toBe('⌘⇧L');
    }
  });

  it('captures global flag as context', async () => {
    const result = await parser.parse();
    if (process.platform === 'darwin') {
      const adblock = result.find((kb) =>
        kb.command.includes('AdBlock'),
      );
      expect(adblock?.context).toBe('global');
    }
  });

  it('uses description as command name', async () => {
    const result = await parser.parse();
    if (process.platform === 'darwin') {
      const notion = result.find((kb) =>
        kb.command.includes('Notion'),
      );
      expect(notion?.command).toBe('Clip to Notion');
    }
  });

  it('returns empty for no watch paths', async () => {
    vi.spyOn(parser, 'getWatchPaths').mockReturnValue([]);
    const result = await parser.parse();
    expect(result).toEqual([]);
  });
});
