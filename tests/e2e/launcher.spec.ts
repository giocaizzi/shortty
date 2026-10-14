import { test, expect, knownBug } from './fixtures';

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

  test('matches the fixed 680x500 panel of SPECS §10.8', async ({ shortty }) => {
    knownBug('window is 750 wide with dynamic 72/580 height, not fixed 680x500');
    await shortty.show();
    expect(await shortty.bounds()).toMatchObject({ width: 680, height: 500 });
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
    knownBug('Esc calls window.blur() in the renderer, which does not blur/hide the BrowserWindow');
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
    knownBug('overlay closes instantly: its window keydown listener sees the same "?" event');
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
    knownBug('SearchInput never renders the ? icon (onHelpToggle prop is unused)');
    await shortty.show();
    await shortty.win.getByRole('button', { name: /keyboard shortcuts|help/i }).click({ timeout: 5_000 });
    await expect(shortty.help).toBeVisible();
  });
});

test.describe('preferences', () => {
  test('opens a second window', async ({ shortty }) => {
    const opened = shortty.app.waitForEvent('window');
    await shortty.openPreferences();
    const prefs = await opened;
    await prefs.waitForLoadState('domcontentloaded');
    expect(prefs.url()).toContain('preferences_window');
    expect(shortty.app.windows()).toHaveLength(2);
  });

  test('renders the preferences UI with its four tabs', async ({ shortty }) => {
    knownBug('preferences_window is built from index.html, so it renders the launcher instead');
    const opened = shortty.app.waitForEvent('window');
    await shortty.openPreferences();
    const prefs = await opened;
    for (const tab of ['General', 'Sources', 'Search', 'Commands']) {
      await expect(prefs.getByText(tab, { exact: true }).first()).toBeVisible();
    }
  });
});
