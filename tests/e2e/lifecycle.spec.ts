import { _electron as electron } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test, expect, createHermeticEnv } from './fixtures';

const ROOT = path.resolve(__dirname, '../..');
// In Node, the electron package exports the path of its binary.
const ELECTRON_BIN = createRequire(__filename)('electron') as string;

test.describe('main-process lifecycle', () => {
  test('the first IPC calls after a cold start resolve with data', async () => {
    const hermetic = createHermeticEnv();
    const app = await electron.launch({ args: [ROOT], cwd: ROOT, env: hermetic.env });
    try {
      const win = await app.firstWindow();
      // No waiting for the "ready" signal: the renderer asks as early as it can.
      const [sources, shortcuts, commands] = await win.evaluate(() =>
        Promise.all([
          window.electronAPI.getSources(),
          window.electronAPI.getAllKeybindings(),
          window.electronAPI.getAllCommands(),
        ]),
      );
      expect(sources.length).toBeGreaterThan(0);
      expect(Array.isArray(shortcuts)).toBe(true);
      expect(commands.map((c) => c.name).sort()).toEqual(['gizmo', 'gizmo-lite', 'widgetctl']);
    } finally {
      await app.close();
      rmSync(hermetic.dir, { recursive: true, force: true });
    }
  });

  test('the menu-bar icon follows "Show in Menu Bar" live', async ({ shortty }) => {
    const trayVisible = () =>
      shortty.app.evaluate(() =>
        (globalThis as { __shorttyE2E?: { isTrayVisible: () => boolean } }).__shorttyE2E?.isTrayVisible(),
      );
    expect(await trayVisible()).toBe(true);
    await shortty.setSetting('showMenuBar', false);
    await expect.poll(trayVisible).toBe(false);
    await shortty.setSetting('showMenuBar', true);
    await expect.poll(trayVisible).toBe(true);
  });

  test('hideWindow() runs the exit hook, then hides even if the hook never settles', async ({ shortty }) => {
    await shortty.show();
    await shortty.win.evaluate(() => {
      const w = window as unknown as { __willHide: number };
      w.__willHide = 0;
      window.electronAPI.onWindowWillHide(() => {
        w.__willHide++;
        return new Promise<void>(() => undefined);
      });
      window.electronAPI.hideWindow();
    });
    await expect.poll(() => shortty.isVisible()).toBe(false);
    expect(await shortty.win.evaluate(() => (window as unknown as { __willHide: number }).__willHide)).toBe(1);

    // Showing again works and resets the hide state
    await shortty.show();
    expect(await shortty.isVisible()).toBe(true);
  });

  test('`shortty --reset-settings` restores the defaults and quits', async () => {
    const hermetic = createHermeticEnv({ showMenuBar: false, windowPosition: 'mouse' });
    const config = path.join(hermetic.dir, 'userData', 'config.json');
    try {
      const child = spawn(ELECTRON_BIN, [ROOT, '--reset-settings'], {
        cwd: ROOT,
        env: hermetic.env,
        stdio: 'ignore',
      });
      const code = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('--reset-settings did not quit within 20s'));
        }, 20_000);
        child.on('exit', (c) => {
          clearTimeout(timer);
          resolve(c);
        });
      });
      expect(code).toBe(0);
      const saved = JSON.parse(readFileSync(config, 'utf8'));
      expect(saved).toMatchObject({ showMenuBar: true, windowPosition: 'top-center' });
    } finally {
      rmSync(hermetic.dir, { recursive: true, force: true });
    }
  });
});
