import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../src/shared/settings';

describe('DEFAULT_SETTINGS', () => {
  it('matches the defaults table of SPECS §9.1', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      launchAtLogin: false,
      showDockIcon: false,
      showMenuBar: true,
      dismissAfterCopy: true,
      globalShortcut: 'CommandOrControl+Shift+Space',
      windowPosition: 'top-center',
      theme: 'system',
      disabledParsers: [],
      sourcePathOverrides: {},
      commandPrefixMode: false,
      resultLimits: { sources: 3, shortcuts: 8, commands: 5 },
      commandsEnabled: true,
    });
  });
});
