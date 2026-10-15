import { describe, it, expect } from 'vitest';
import { loginItemSettings } from '../../../src/main/login-item';

const SQUIRREL_EXE = 'C:\\Users\\me\\AppData\\Local\\shortty\\app-0.1.0\\shortty.exe';
const STUB = 'C:\\Users\\me\\AppData\\Local\\shortty\\shortty.exe';

describe('loginItemSettings', () => {
  it('is just the switch on macOS', () => {
    expect(loginItemSettings(true, 'darwin', '/Applications/Shortty.app/Contents/MacOS/shortty')).toEqual({
      openAtLogin: true,
    });
  });

  it('starts the Squirrel stub launcher on Windows, so the item survives updates', () => {
    const exists = (p: string) => p === STUB;
    expect(loginItemSettings(true, 'win32', SQUIRREL_EXE, exists)).toEqual({ openAtLogin: true, path: STUB });
    expect(loginItemSettings(false, 'win32', SQUIRREL_EXE, exists)).toEqual({ openAtLogin: false, path: STUB });
  });

  it('falls back to the running exe without a Squirrel install (portable ZIP, dev)', () => {
    expect(loginItemSettings(true, 'win32', 'D:\\Shortty\\shortty.exe', () => false)).toEqual({ openAtLogin: true });
  });
});
