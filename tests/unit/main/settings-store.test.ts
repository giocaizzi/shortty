import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// config.v11.json was written by electron-store 11.0.2 (the version Shortty
// 0.2.x shipped): a settings file already on users' disks must keep loading
// unchanged after an electron-store upgrade.
const FIXTURE = path.join(__dirname, '../../../fixtures/settings/config.v11.json');

const { userData } = vi.hoisted(() => ({ userData: { dir: '' } }));
vi.mock('electron', () => {
  const electron = {
    app: { getPath: () => userData.dir, getVersion: () => '0.2.1' },
    ipcMain: { on: vi.fn() },
    shell: {},
  };
  return { default: electron, ...electron };
});

describe('settings-store', () => {
  let configFile: string;
  let original: Buffer;

  beforeAll(() => {
    userData.dir = mkdtempSync(path.join(tmpdir(), 'shortty-settings-'));
    configFile = path.join(userData.dir, 'config.json');
    copyFileSync(FIXTURE, configFile);
    original = readFileSync(configFile);
  });

  afterAll(() => rmSync(userData.dir, { recursive: true, force: true }));

  it('loads a settings file written by electron-store 11 unchanged', async () => {
    const { getSettings, getSetting, repairSettings } = await import('../../../src/main/settings-store');

    expect(getSettings()).toEqual(JSON.parse(original.toString('utf8')));
    expect(getSetting('globalShortcut')).toBe('Alt+Space');
    expect(repairSettings()).toEqual([]);
    expect(readFileSync(configFile).equals(original)).toBe(true);
  });

  it('writes a change without touching the other settings', async () => {
    const { setSetting } = await import('../../../src/main/settings-store');

    setSetting('theme', 'light');

    expect(JSON.parse(readFileSync(configFile, 'utf8'))).toEqual({
      ...JSON.parse(original.toString('utf8')),
      theme: 'light',
    });
  });
});
