import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, type Shortty } from './fixtures';


async function openPrefs(shortty: Shortty): Promise<Page> {
  const opened = shortty.app.waitForEvent('window');
  await shortty.openPreferences();
  const prefs = await opened;
  await prefs.waitForLoadState('domcontentloaded');
  await expect(prefs.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
  return prefs;
}

function storedSettings(prefs: Page) {
  return prefs.evaluate(() => window.electronAPI.getSettings());
}

/** CDP modifier bits: Alt=1, Ctrl=2, Meta=4, Shift=8. */
async function pressChord(
  prefs: Page,
  key: { key: string; code: string; keyCode: number; modifiers: number },
): Promise<void> {
  const cdp = await prefs.context().newCDPSession(prefs);
  const base = {
    key: key.key,
    code: key.code,
    windowsVirtualKeyCode: key.keyCode,
    modifiers: key.modifiers,
  };
  await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'keyDown' });
  await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
  await cdp.detach();
}

function sourceCard(prefs: Page, label: string) {
  return prefs
    .getByTestId('source-card')
    .filter({ has: prefs.getByText(label, { exact: true }) });
}

test.describe('preferences window', () => {
  test('opens on General without hitting the error boundary', async ({ shortty }) => {
    const errors: string[] = [];
    const opened = shortty.app.waitForEvent('window');
    await shortty.openPreferences();
    const prefs = await opened;
    prefs.on('pageerror', (e) => errors.push(e.message));
    await expect(prefs.getByRole('heading', { name: 'General', level: 1 })).toBeVisible();
    await expect(prefs.getByRole('switch', { name: 'Show in Dock' })).toBeVisible();
    await expect(prefs.getByText('Something went wrong')).toHaveCount(0);
    for (const tab of ['Sources', 'Search', 'Commands', 'General']) {
      await prefs.getByRole('button', { name: tab, exact: true }).click();
      await expect(prefs.getByRole('heading', { name: tab, level: 1 })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('records a shortcut by physical key on an Italian layout', async ({ shortty }) => {
    const prefs = await openPrefs(shortty);
    const recorder = prefs.getByTestId('shortcut-recorder');
    await expect(recorder).toHaveText('⇧⌘Space');
    await recorder.click();
    await expect(recorder).toHaveText('Type shortcut');
    // Ctrl+Option+Shift+K: e.key is a layout-specific symbol, e.code is KeyK.
    await pressChord(prefs, { key: 'Ò', code: 'KeyK', keyCode: 75, modifiers: 1 | 2 | 8 });
    await expect(recorder).toHaveText('⌃⌥⇧K');
    await expect.poll(async () => (await storedSettings(prefs)).globalShortcut).toBe(
      'Control+Alt+Shift+K',
    );
  });

  test('applies appearance and window position live', async ({ shortty }) => {
    const prefs = await openPrefs(shortty);
    await prefs.getByRole('radio', { name: 'Dark' }).click();
    await expect
      .poll(() => shortty.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
      .toBe('dark');
    await expect(prefs.locator('html')).toHaveAttribute('data-theme', 'dark');
    await prefs.getByRole('radio', { name: 'Near Cursor' }).click();
    await expect.poll(async () => (await storedSettings(prefs)).windowPosition).toBe('mouse');
  });

  test('saves a custom path on Enter, not per keystroke', async ({ shortty }) => {
    const prefs = await openPrefs(shortty);
    await prefs.getByRole('button', { name: 'Sources', exact: true }).click();
    const card = sourceCard(prefs, 'Ghostty');
    const field = card.getByLabel('Custom path');
    await field.click();
    await field.pressSequentially('~/elsewhere/ghostty');
    expect((await storedSettings(prefs)).sourcePathOverrides).toEqual({});
    await expect(card.getByText(/Nothing exists at this path yet/)).toBeVisible();

    await field.press('Enter');
    await expect
      .poll(async () => (await storedSettings(prefs)).sourcePathOverrides)
      .toEqual({ ghostty: '~/elsewhere/ghostty' });
    await expect(card.getByText('Reading from')).toBeVisible();
    await expect(card.getByTestId('config-path').getByRole('img', { name: 'Missing' })).toBeVisible();

    await card.getByRole('button', { name: 'Reset' }).click();
    await expect.poll(async () => (await storedSettings(prefs)).sourcePathOverrides).toEqual({});
    await expect(field).toHaveValue('');
  });

  test('Reset shows the detected path again', async ({ shortty }) => {
    const prefs = await openPrefs(shortty);
    await prefs.getByRole('button', { name: 'Sources', exact: true }).click();
    const card = sourceCard(prefs, 'Ghostty');
    const field = card.getByLabel('Custom path');
    await field.fill('/nowhere/ghostty');
    await field.press('Enter');
    await expect(card.getByText('Reading from')).toBeVisible();
    await card.getByRole('button', { name: 'Reset' }).click();
    await expect(card.getByText('Detected at')).toBeVisible();
    await expect(card.getByTestId('config-path').getByRole('img', { name: 'Exists' })).toBeVisible();
  });

  test('Browse saves the path picked in the native dialog', async ({ shortty }) => {
    const prefs = await openPrefs(shortty);
    const picked = path.join(shortty.hermetic.home, '.zshrc');
    await shortty.app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, picked);
    await prefs.getByRole('button', { name: 'Sources', exact: true }).click();
    const card = sourceCard(prefs, 'Ghostty');
    await card.getByRole('button', { name: 'Browse…' }).click();
    await expect
      .poll(async () => (await storedSettings(prefs)).sourcePathOverrides)
      .toEqual({ ghostty: picked });
    await expect(card.getByLabel('Custom path')).toHaveValue(picked);
  });

  test('marks detected config files as existing', async ({ shortty }) => {
    const prefs = await openPrefs(shortty);
    await prefs.getByRole('button', { name: 'Sources', exact: true }).click();
    const card = sourceCard(prefs, 'VS Code');
    await expect(card.getByText('Detected', { exact: true })).toBeVisible();
    await expect(
      card.getByTestId('config-path').getByRole('img', { name: 'Exists' }).first(),
    ).toBeVisible();
  });

  test('screenshots every tab in light and dark', async ({ shortty }) => {
    const dir = process.env.SHORTTY_E2E_SHOTS;
    test.skip(!dir, 'set SHORTTY_E2E_SHOTS=<dir> to capture');
    const prefs = await openPrefs(shortty);
    for (const theme of ['light', 'dark'] as const) {
      await shortty.setSetting('theme', theme);
      for (const tab of ['General', 'Sources', 'Search', 'Commands']) {
        await prefs.getByRole('button', { name: tab, exact: true }).click();
        await prefs.waitForTimeout(300);
        await prefs.screenshot({ path: path.join(dir ?? '', `${theme}-${tab.toLowerCase()}.png`) });
      }
    }
  });
});
