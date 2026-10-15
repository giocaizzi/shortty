import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, type Shortty } from './fixtures';

async function openPrefs(shortty: Shortty): Promise<Page> {
  const opened = shortty.app.waitForEvent('window');
  await shortty.openPreferences();
  const prefs = await opened;
  await prefs.waitForLoadState('domcontentloaded');
  return prefs;
}

/** A real (trusted) file drop through CDP, as when a file is dragged from Finder. */
async function dropFile(page: Page, file: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const data = { items: [], files: [file], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
    await cdp.send('Input.dispatchDragEvent', { type, x: 40, y: 20, data });
  }
  await cdp.detach();
}

function hostileFile(shortty: Shortty): string {
  const file = path.join(shortty.hermetic.dir, 'dropped.html');
  writeFileSync(file, '<title>dropped</title><h1>dropped</h1>');
  return file;
}

/** The page stays on its own URL (give a navigation time to commit). */
async function expectStays(page: Page, url: string): Promise<void> {
  await page.waitForTimeout(500);
  expect(page.url()).toBe(url);
  expect(await page.title()).not.toBe('dropped');
}

test.describe('renderer navigation guards', () => {
  test('dropping a file on the launcher does not navigate it', async ({ shortty }) => {
    await shortty.show();
    const url = shortty.win.url();
    await dropFile(shortty.win, hostileFile(shortty));
    await expectStays(shortty.win, url);
    await expect(shortty.search).toBeVisible();
  });

  test('dropping a file on Preferences does not navigate it', async ({ shortty }) => {
    const prefs = await openPrefs(shortty);
    const url = prefs.url();
    await dropFile(prefs, hostileFile(shortty));
    await expectStays(prefs, url);
  });

  test('window.location changes to foreign URLs are blocked', async ({ shortty }) => {
    const url = shortty.win.url();
    const file = hostileFile(shortty);
    for (const target of [`file://${file}`, 'https://example.com/']) {
      await shortty.win.evaluate((t) => {
        window.location.href = t;
      }, target);
      await expectStays(shortty.win, url);
    }
  });

  test('window.open never creates a window', async ({ shortty }) => {
    const before = await shortty.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    const opened = await shortty.win.evaluate(() => window.open('https://example.com/') === null);
    expect(opened).toBe(true);
    const after = await shortty.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    expect(after).toBe(before);
  });
});
