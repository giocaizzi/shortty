import { describe, it, expect } from 'vitest';
import { pathKey } from '../../../src/main/utils/path-key';

describe('pathKey', () => {
  it('matches Windows paths across separators, case and dot segments', () => {
    const key = pathKey('C:\\Users\\Me\\AppData\\Roaming\\Code\\User\\keybindings.json', 'win32');
    expect(pathKey('c:/users/me/AppData/Roaming/Code/User/./keybindings.json', 'win32')).toBe(key);
    expect(pathKey('C:\\Users\\me\\x\\..\\AppData\\Roaming\\Code\\User\\KEYBINDINGS.json', 'win32')).toBe(key);
  });

  it('keeps case on macOS and Linux', () => {
    expect(pathKey('/Users/me/./.zshrc', 'darwin')).toBe('/Users/me/.zshrc');
    expect(pathKey('/home/me/.ZSHRC', 'linux')).not.toBe(pathKey('/home/me/.zshrc', 'linux'));
  });
});
