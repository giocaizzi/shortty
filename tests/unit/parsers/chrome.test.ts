import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { ChromeParser } from '../../../src/main/parsers/chrome.parser';
import { FIXTURES, rows, withPlatform } from './parser-helpers';

const PROFILE_PREFS = join(FIXTURES, 'chrome-profile/Preferences');
const LEGACY_PREFS = join(FIXTURES, 'chrome-preferences.json');

describe('ChromeParser', () => {
  withPlatform('darwin');
  let parser: ChromeParser;

  beforeEach(() => {
    parser = new ChromeParser();
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('chrome');
    expect(parser.meta.label).toBe('Chrome');
  });

  it('parses extension commands with names from Secure Preferences manifests', async () => {
    parser.setConfigPaths([PROFILE_PREFS]);
    expect(rows(await parser.parse())).toEqual([
      ['⌥⇧P', 'Phantom: Activate the extension', null, false],
      // localized (__MSG_) extension name: description only
      ['⌘.', 'Pause or resume blocking', null, false],
      ['⇧⌘9', 'Bitwarden Password Manager: Generate and copy a new random password to the clipboard.', null, false],
      ['⇧⌘L', 'Bitwarden Password Manager: Autofill the last used login for the current website', null, false],
      // MacCtrl is the Control key on macOS; unknown extension: humanized command name
      ['⌃⇧↑', 'Next track', 'global', false],
    ]);
  });

  it('keeps _execute_action shortcuts (previously dropped)', async () => {
    parser.setConfigPaths([PROFILE_PREFS]);
    const result = await parser.parse();
    expect(result.some((kb) => kb.rawCommand === 'bfnaelmomeimhlpmgjnjophhpkkoljpa/_execute_action' && kb.key === '⌥⇧P')).toBe(true);
  });

  it('reads descriptions stored inline (older profiles)', async () => {
    parser.setConfigPaths([LEGACY_PREFS]);
    expect(rows(await parser.parse())).toEqual([
      ['⇧⌘L', 'Activate Bitwarden', null, false],
      ['⇧⌘O', 'Clip to Notion', null, false],
      ['⌥A', 'Toggle AdBlock', 'global', false],
    ]);
  });

  it('returns empty for missing file', async () => {
    parser.setConfigPaths(['/tmp/nonexistent']);
    expect(await parser.parse()).toEqual([]);
  });

  describe('on Windows', () => {
    withPlatform('win32');

    it('only reads the windows: entries', async () => {
      parser.setConfigPaths([PROFILE_PREFS]);
      expect(rows(await parser.parse())).toEqual([
        ['⌃⇧K', 'Activate the extension', null, false],
      ]);
    });
  });
});
