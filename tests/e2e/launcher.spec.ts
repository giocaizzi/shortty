import { test, expect } from './fixtures';

test.describe('launcher window', () => {
  test('starts hidden and shows with a focused, empty search bar', async ({ shortty }) => {
    expect(await shortty.isVisible()).toBe(false);

    await shortty.show();

    await expect(shortty.search).toBeFocused();
    await expect(shortty.search).toHaveValue('');
    await expect(shortty.search).toHaveAttribute('placeholder', 'Search shortcuts and commands...');
    await expect(shortty.results).toHaveCount(0);
  });

  test('is a compact bar when empty and expands when results exist', async ({ shortty }) => {
    await shortty.show();
    await expect.poll(async () => (await shortty.bounds()).height).toBe(72);
    expect((await shortty.bounds()).width).toBe(750);

    await shortty.search.fill('>gizmo');
    await expect(shortty.results).toBeVisible();
    await expect.poll(async () => (await shortty.bounds()).height).toBe(580);
  });

  test('opens top-center on the display under the cursor, fully on screen when expanded', async ({ shortty }) => {
    await shortty.show();
    const { bounds, workArea } = await shortty.app.evaluate(({ BrowserWindow, screen }) => {
      const [main] = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id);
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      return { bounds: main.getBounds(), workArea: display.workArea };
    });
    expect(bounds.x).toBe(Math.round(workArea.x + (workArea.width - 750) / 2));
    expect(bounds.y).toBeGreaterThanOrEqual(workArea.y);
    expect(bounds.y + 580).toBeLessThanOrEqual(workArea.y + workArea.height);
  });

  test('renderer windows are sandboxed with context isolation', async ({ shortty }) => {
    await shortty.openPreferences();
    await expect.poll(() => shortty.app.windows().length).toBe(2);
    const prefs = await shortty.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => {
        const p = w.webContents.getLastWebPreferences();
        return { sandbox: p?.sandbox, contextIsolation: p?.contextIsolation, nodeIntegration: p?.nodeIntegration };
      }),
    );
    expect(prefs).toEqual([
      { sandbox: true, contextIsolation: true, nodeIntegration: false },
      { sandbox: true, contextIsolation: true, nodeIntegration: false },
    ]);
  });

  test('toggle hides and shows the panel', async ({ shortty }) => {
    await shortty.show();
    await shortty.toggle();
    await expect.poll(() => shortty.isVisible()).toBe(false);
  });

  test('resets query and navigation every time it is shown', async ({ shortty }) => {
    await shortty.show();
    await shortty.search.fill('VS');
    await expect(shortty.win.getByTestId('source-row')).toHaveCount(1);
    await shortty.win.keyboard.press('Enter');
    await expect(shortty.search).toHaveAttribute('placeholder', 'Search in VS Code...');

    await shortty.hide();
    await shortty.show();

    await expect(shortty.search).toHaveValue('');
    await expect(shortty.search).toHaveAttribute('placeholder', 'Search shortcuts and commands...');
  });

  test('Escape clears a non-empty query first', async ({ shortty }) => {
    await shortty.show();
    await shortty.search.fill('gizmo');
    await shortty.win.keyboard.press('Escape');
    await expect(shortty.search).toHaveValue('');
    expect(await shortty.isVisible()).toBe(true);
  });

  test('Escape on an empty query dismisses the panel', async ({ shortty }) => {
    await shortty.show();
    await shortty.win.keyboard.press('Escape');
    await expect.poll(() => shortty.isVisible()).toBe(false);
  });
});

test.describe('keyboard help', () => {
  test('? on an empty query is intercepted as the help key', async ({ shortty }) => {
    await shortty.show();
    await shortty.win.keyboard.press('?');
    await expect(shortty.search).toHaveValue('');
  });

  test('? on an empty query opens the overlay and any key closes it', async ({ shortty }) => {
    await shortty.show();
    await shortty.win.keyboard.press('?');
    await expect(shortty.help).toBeVisible();
    await expect(shortty.help).toContainText('Navigate results');
    await expect(shortty.search).toHaveValue('');

    await shortty.win.keyboard.press('a');
    await expect(shortty.help).toHaveCount(0);
  });

  test('? inside a query is typed, not intercepted', async ({ shortty }) => {
    await shortty.show();
    await shortty.search.pressSequentially('what?');
    await expect(shortty.search).toHaveValue('what?');
    await expect(shortty.help).toHaveCount(0);
  });

  test('a ? icon in the search bar opens the overlay (SCREENS §3)', async ({ shortty }) => {
    await shortty.show();
    await shortty.win.getByRole('button', { name: /keyboard shortcuts|help/i }).click({ timeout: 5_000 });
    await expect(shortty.help).toBeVisible();
  });
});

test.describe('appearance', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`text follows the ${scheme} appearance`, async ({ shortty }) => {
      await shortty.win.emulateMedia({ colorScheme: scheme });
      await shortty.show();
      await shortty.search.fill('>gizmo');
      const name = shortty.win.getByTestId('command-row').first().locator('span.font-mono');
      const color = await name.evaluate((el) => getComputedStyle(el).color);
      const [r, g, b] = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      // Dark text on the light material, light text on the dark one.
      if (scheme === 'light') expect(r + g + b).toBeLessThan(150);
      else expect(r + g + b).toBeGreaterThan(600);
    });
  }
});

test.describe('preferences', () => {
  test('opens a second window', async ({ shortty }) => {
    const opened = shortty.app.waitForEvent('window');
    await shortty.openPreferences();
    const prefs = await opened;
    await prefs.waitForLoadState('domcontentloaded');
    // Built from preferences.html, not the launcher's index.html
    expect(prefs.url()).toMatch(/preferences_window\/preferences\.html$/);
    expect(shortty.app.windows()).toHaveLength(2);
  });

  test('renders the preferences UI with its four tabs', async ({ shortty }) => {
    const opened = shortty.app.waitForEvent('window');
    await shortty.openPreferences();
    const prefs = await opened;
    for (const tab of ['General', 'Sources', 'Search', 'Commands']) {
      await expect(prefs.getByText(tab, { exact: true }).first()).toBeVisible();
    }
  });
});
