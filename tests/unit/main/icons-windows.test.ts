// Windows icon lookups (the macOS ones are in icons.test.ts); runs on every OS.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ nativeImage: {}, app: {} }));

const existing = new Set<string>();
vi.mock('node:fs', () => ({
  existsSync: (p: string) => existing.has(p),
  realpathSync: () => {
    throw new Error('ENOENT');
  },
}));

const { findWindowsExe, createIconService, defaultBundleSearch } = await import('../../../src/main/icons');

const ENV = {
  LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
};
const search = defaultBundleSearch(false, 'win32', ENV);
const VSCODE = { bundleId: 'com.microsoft.VSCode', name: 'Visual Studio Code' };
const CHROME = { bundleId: 'com.google.Chrome', name: 'Google Chrome' };

beforeEach(() => existing.clear());

describe('defaultBundleSearch on Windows', () => {
  it('searches per-user installs before machine-wide ones, never Spotlight', () => {
    expect(search).toEqual({
      spotlight: false,
      roots: [
        'C:\\Users\\me\\AppData\\Local\\Programs',
        'C:\\Program Files',
        'C:\\Program Files (x86)',
        'C:\\Users\\me\\AppData\\Local',
      ],
    });
  });

  it('looks at no real install folder in e2e runs', () => {
    expect(defaultBundleSearch(true, 'win32', ENV).roots).toEqual([]);
  });
});

describe('findWindowsExe', () => {
  it('finds the user install of VS Code first', () => {
    existing.add('C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe');
    existing.add('C:\\Program Files\\Microsoft VS Code\\Code.exe');
    expect(findWindowsExe(VSCODE, search)).toBe('C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe');
  });

  it('finds a machine-wide Chrome', () => {
    existing.add('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
    expect(findWindowsExe(CHROME, search)).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  });

  it('finds PowerToys installed machine-wide or per user (no macOS bundle id)', () => {
    const POWERTOYS = { name: 'PowerToys' };
    existing.add('C:\\Users\\me\\AppData\\Local\\PowerToys\\PowerToys.exe');
    expect(findWindowsExe(POWERTOYS, search)).toBe('C:\\Users\\me\\AppData\\Local\\PowerToys\\PowerToys.exe');
    existing.add('C:\\Program Files\\PowerToys\\PowerToys.exe');
    expect(findWindowsExe(POWERTOYS, search)).toBe('C:\\Program Files\\PowerToys\\PowerToys.exe');
  });

  it('returns null for apps it does not know or that are not installed', () => {
    expect(findWindowsExe({ bundleId: 'com.apple.finder', name: 'Finder' }, search)).toBeNull();
    expect(findWindowsExe(VSCODE, search)).toBeNull();
  });
});

describe('createIconService on Windows', () => {
  const CODE = 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe';

  function service() {
    const toDataUrl = vi.fn(async (exe: string) => `data:${exe}`);
    const getIcon = createIconService({
      sourceApp: (id) => (id === 'vscode' ? VSCODE : id === 'tmux' ? null : undefined),
      commandBin: (name) =>
        ({ git: 'C:\\Program Files\\Git\\cmd\\git.exe', npm: 'C:\\Program Files\\nodejs\\npm.cmd' })[name],
      search,
      platform: 'win32',
      toDataUrl,
    });
    return { getIcon, toDataUrl };
  }

  it('uses the source app exe icon', async () => {
    existing.add(CODE);
    const { getIcon, toDataUrl } = service();
    expect(await getIcon('source', 'vscode')).toBe(`data:${CODE}`);
    expect(toDataUrl).toHaveBeenCalledWith(CODE);
  });

  it('uses a command icon only for a resolved .exe', async () => {
    const { getIcon } = service();
    expect(await getIcon('command', 'git')).toBe('data:C:\\Program Files\\Git\\cmd\\git.exe');
    expect(await getIcon('command', 'npm')).toBeNull();
  });

  it('resolves nothing for sources without an app or unknown names', async () => {
    const { getIcon, toDataUrl } = service();
    expect(await getIcon('source', 'tmux')).toBeNull();
    expect(await getIcon('source', 'nope')).toBeNull();
    expect(await getIcon('command', 'nope')).toBeNull();
    expect(toDataUrl).not.toHaveBeenCalled();
  });
});
