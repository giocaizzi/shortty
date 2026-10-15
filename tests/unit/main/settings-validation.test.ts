import { describe, it, expect } from 'vitest';
import { sanitizeSettings, validateSetting } from '../../../src/main/settings-validation';
import { DEFAULT_SETTINGS } from '../../../src/shared/settings';

describe('validateSetting', () => {
  it('accepts every default value', () => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      expect(validateSetting(key, value)).toBeNull();
    }
  });

  it('rejects unknown keys', () => {
    expect(validateSetting('__proto__', {})).toMatch(/Unknown setting/);
    expect(validateSetting('evil', 1)).toMatch(/Unknown setting/);
  });

  it.each([
    ['theme', 'bogus'],
    ['theme', 1],
    ['windowPosition', 'left'],
    ['showMenuBar', 'yes'],
    ['globalShortcut', ''],
    ['globalShortcut', 42],
    ['disabledParsers', 'vscode'],
    ['disabledParsers', [1]],
    ['sourcePathOverrides', ['a']],
    ['sourcePathOverrides', { vscode: 3 }],
    ['search', { ...DEFAULT_SETTINGS.search, threshold: 2 }],
    ['search', { ...DEFAULT_SETTINGS.search, keyWeight: Number.NaN }],
    ['search', null],
    ['resultLimits', { ...DEFAULT_SETTINGS.resultLimits, commands: 0 }],
    ['resultLimits', { ...DEFAULT_SETTINGS.resultLimits, sources: 2.5 }],
    ['resultLimits', { sources: 3 }],
  ])('rejects %s = %j', (key, value) => {
    expect(validateSetting(key, value)).toMatch(new RegExp(`Invalid ${key}`));
  });

  it('accepts valid non-default values', () => {
    expect(validateSetting('theme', 'dark')).toBeNull();
    expect(validateSetting('sourcePathOverrides', { vscode: '~/a', tmux: ['~/b', '~/c'] })).toBeNull();
    expect(validateSetting('search', { ...DEFAULT_SETTINGS.search, threshold: 0.6 })).toBeNull();
    expect(validateSetting('resultLimits', { sources: 20, shortcuts: 50, commands: 1 })).toBeNull();
  });
});

describe('sanitizeSettings', () => {
  it('returns nothing for valid settings', () => {
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS, theme: 'dark' })).toEqual({});
  });

  it('resets each invalid key to its default, leaving the others', () => {
    const repaired = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      theme: 'bogus',
      windowPosition: 7,
      showMenuBar: false,
    });
    expect(repaired).toEqual({ theme: 'system', windowPosition: 'top-center' });
  });

  it('repairs object settings field by field', () => {
    const repaired = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      search: { keyWeight: 0.9, threshold: 'high' },
      resultLimits: 'lots',
    });
    expect(repaired).toEqual({
      search: { ...DEFAULT_SETTINGS.search, keyWeight: 0.9 },
      resultLimits: DEFAULT_SETTINGS.resultLimits,
    });
  });
});
