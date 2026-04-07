import { describe, it, expect, vi, beforeEach, assert } from 'vitest';
import { join } from 'node:path';

vi.mock('../../../src/main/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import log from '../../../src/main/logger';
import { loadCheatsheets } from '../../../src/main/cheatsheets/loader';

const FIXTURES_DIR = join(__dirname, 'fixtures');

describe('loadCheatsheets', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads a valid cheatsheet file correctly', async () => {
    const results = await loadCheatsheets(FIXTURES_DIR);
    const valid = results.find((d) => d.id === 'testapp');

    assert(valid, 'expected testapp cheatsheet to be loaded');
    expect(valid.label).toBe('Test App');
    expect(valid.icon).toBe('🧪');
    expect(valid.platforms).toEqual(['darwin', 'linux']);
    expect(valid.parser).toBe('testapp');
    expect(valid.shortcuts).toHaveLength(2);
    expect(valid.shortcuts[0].command).toBe('Save File');
    expect(valid.shortcuts[0].rawCommand).toBe('file.save');
    expect(valid.shortcuts[0].key).toEqual({
      darwin: '⌘s',
      linux: 'Ctrl+S',
    });
    expect(valid.shortcuts[0].category).toBe('File');
    expect(valid.shortcuts[0].context).toBe('editorFocus');
  });

  it('skips file with missing required field "id" with warning', async () => {
    const results = await loadCheatsheets(FIXTURES_DIR);

    expect(results.find((d) => d.label === 'No ID App')).toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('missing or invalid required field "id"'),
    );
  });

  it('skips file with missing required field "platforms" with warning', async () => {
    const results = await loadCheatsheets(FIXTURES_DIR);

    expect(
      results.find((d) => d.id === 'noplatforms'),
    ).toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('"platforms" must be a non-empty array'),
    );
  });

  it('skips file with invalid shortcut (key not an object) with warning', async () => {
    const results = await loadCheatsheets(FIXTURES_DIR);

    expect(
      results.find((d) => d.id === 'badshortcut'),
    ).toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('"key" must be an object'),
    );
  });

  it('handles cheatsheet with empty shortcuts array', async () => {
    const results = await loadCheatsheets(FIXTURES_DIR);
    const minimal = results.find((d) => d.id === 'minimal');

    assert(minimal, 'expected minimal cheatsheet to be loaded');
    expect(minimal.shortcuts).toEqual([]);
  });

  it('ignores non-JSON files in directory', async () => {
    const results = await loadCheatsheets(FIXTURES_DIR);

    // not-json.txt should not cause any crash or appear in results
    for (const r of results) {
      expect(r.id).not.toBe('not-json');
    }
  });

  it('returns empty array for non-existent directory', async () => {
    const results = await loadCheatsheets('/tmp/nonexistent-cheatsheets-dir');

    expect(results).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not read sources directory'),
    );
  });

  it('preserves platform-specific key fields', async () => {
    const results = await loadCheatsheets(FIXTURES_DIR);
    const valid = results.find((d) => d.id === 'testapp');

    assert(valid, 'expected testapp cheatsheet to be loaded');
    const saveShortcut = valid.shortcuts.find(
      (s) => s.rawCommand === 'file.save',
    );
    assert(saveShortcut, 'expected save shortcut to exist');
    expect(saveShortcut.key.darwin).toBe('⌘s');
    expect(saveShortcut.key.linux).toBe('Ctrl+S');
    expect(saveShortcut.key.win32).toBeUndefined();
  });

  it('preserves optional fields (lastVerified, defaultPaths)', async () => {
    const results = await loadCheatsheets(FIXTURES_DIR);
    const valid = results.find((d) => d.id === 'testapp');

    assert(valid, 'expected testapp cheatsheet to be loaded');
    expect(valid.lastVerified).toEqual({
      version: '1.0.0',
      date: '2026-01-01',
    });
    expect(valid.defaultPaths).toEqual({
      darwin: ['~/Library/TestApp/config.json'],
      linux: ['~/.config/testapp/config.json'],
    });
  });
});
