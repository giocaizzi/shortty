import { test, expect, knownBug, waitForEnrichment, FAKE_COMMANDS } from './fixtures';

test.describe('commands from the fixture PATH', () => {
  test.beforeEach(async ({ shortty }) => {
    await waitForEnrichment(shortty);
    // Keep the panel open across copies so a test can chain actions.
    await shortty.setSetting('dismissAfterCopy', false);
    // These tests use the ">" prefix; pin the mode whatever the default is.
    await shortty.setSetting('commandPrefixMode', true);
    await shortty.show();
  });

  test('indexes exactly the fake executables on PATH', async ({ shortty }) => {
    const commands = await shortty.win.evaluate(() => window.electronAPI.getAllCommands());
    expect(commands.map((c) => c.name).sort()).toEqual(FAKE_COMMANDS);
    expect(commands.every((c) => c.enrichment === 'full')).toBe(true);
  });

  test('">" prefix mode lists only commands', async ({ shortty }) => {
    await shortty.win.keyboard.type('>');
    // The ">" moves out of the input into a prefix badge
    await expect(shortty.search).toHaveValue('');
    await expect(shortty.win.getByText('>', { exact: true }).first()).toBeVisible();

    await shortty.win.keyboard.type('gizmo');
    const rows = shortty.win.getByTestId('command-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('gizmo');
    await expect(rows.nth(1)).toContainText('gizmo-lite');
    await expect(shortty.sectionHeader('Commands')).toBeVisible();
    await expect(shortty.win.getByTestId('source-row')).toHaveCount(0);
    await expect(shortty.win.getByTestId('shortcut-row')).toHaveCount(0);

    await shortty.search.fill('');
    await shortty.win.keyboard.type('widget');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('widgetctl');
  });

  test('Backspace on an empty prefixed query leaves prefix mode', async ({ shortty }) => {
    await shortty.win.keyboard.type('>');
    await shortty.win.keyboard.press('Backspace');
    await shortty.win.keyboard.type('vs');
    await expect(shortty.win.getByTestId('source-row')).toHaveCount(1);
  });

  test('arrow keys move the selection and wrap around', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    const rows = shortty.win.getByTestId('command-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');

    await shortty.win.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
    await shortty.win.keyboard.press('ArrowDown');
    await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
    await shortty.win.keyboard.press('ArrowUp');
    await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('"Show all" is a selectable row that expands the section', async ({ shortty }) => {
    await shortty.setSetting('resultLimits', { sources: 3, shortcuts: 8, commands: 1 });
    await shortty.win.keyboard.type('>gizmo');
    const rows = shortty.win.getByTestId('command-row');
    await expect(rows).toHaveCount(1);
    await shortty.win.keyboard.press('ArrowDown');
    await expect(shortty.selected).toHaveText(/Show all 2 commands/);
    await shortty.win.keyboard.press('Enter');
    await expect(rows).toHaveCount(2);
    await expect(shortty.win.getByTestId('show-all-row')).toHaveCount(0);
    await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('detail view names where its data came from', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    await shortty.win.keyboard.press('Tab');
    await expect(shortty.win.getByTestId('detail-source')).toHaveText('Source: --help');
  });

  test('Enter on a command row copies the command name', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    await shortty.selectRow('gizmo-lite');
    await shortty.win.keyboard.press('Enter');
    await expect.poll(() => shortty.clipboard()).toBe('gizmo-lite');
  });

  test('Enter copies and then dismisses when "dismiss after copy" is on', async ({ shortty }) => {
    await shortty.setSetting('dismissAfterCopy', true);
    await shortty.win.keyboard.type('>widget');
    await shortty.win.keyboard.press('Enter');
    await expect.poll(() => shortty.clipboard()).toBe('widgetctl');
    await expect.poll(() => shortty.isVisible()).toBe(false);
  });

  for (const key of ['Tab', 'ArrowRight'] as const) {
    test(`${key} drills into the command detail view`, async ({ shortty }) => {
      await shortty.win.keyboard.type('>gizmo');
      await shortty.selectRow(/^gizmo\b(?!-)/);
      await shortty.win.keyboard.press(key);

      await expect(shortty.search).toHaveAttribute('placeholder', 'Filter subcommands and flags...');
      await expect(shortty.win.getByText('Gizmo is a fake CLI used by the Shortty e2e suite.')).toBeVisible();
      await expect(shortty.win.getByTestId('subcommand-row').filter({ hasText: 'gizmo build' })).toBeVisible();
      await expect(shortty.win.getByTestId('flag-row').filter({ hasText: '--verbose' })).toBeVisible();
      await expect(shortty.win.getByText('<target>', { exact: true })).toBeVisible();
    });
  }

  test('detail view lists every subcommand and flag from --help', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    await shortty.win.keyboard.press('Tab');
    await expect(shortty.win.getByTestId('subcommand-row')).toHaveText([/gizmo build/, /gizmo deploy/]);
    await expect(shortty.win.getByTestId('flag-row')).toHaveText([/--verbose/, /--quiet/]);
  });

  test('Enter in the detail view copies the selected subcommand or flag', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    await shortty.win.keyboard.press('Tab');
    await expect(shortty.win.getByTestId('subcommand-row').first()).toBeVisible();

    await shortty.selectRow('gizmo build');
    await shortty.win.keyboard.press('Enter');
    await expect.poll(() => shortty.clipboard()).toBe('gizmo build');

    await shortty.selectRow('--verbose');
    await shortty.win.keyboard.press('Enter');
    await expect.poll(() => shortty.clipboard()).toBe('--verbose');
  });

  test('typing filters subcommands and flags', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    await shortty.win.keyboard.press('Tab');
    await shortty.win.keyboard.type('verb');
    await expect(shortty.win.getByTestId('flag-row')).toHaveCount(1);
    await expect(shortty.win.getByTestId('subcommand-row')).toHaveCount(0);

    await shortty.search.fill('zzz-nothing');
    await expect(shortty.win.getByText('No matches for')).toBeVisible();
  });

  test('Tab on a subcommand drills one level deeper, Esc goes back', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    await shortty.win.keyboard.press('Tab');
    await shortty.selectRow('gizmo build');
    await shortty.win.keyboard.press('Tab');
    // Breadcrumbs: gizmo > build
    await expect(shortty.win.getByText('build', { exact: true })).toBeVisible();

    await shortty.win.keyboard.press('Escape');
    await expect(shortty.win.getByText('build', { exact: true })).toHaveCount(0);
    await expect(shortty.selected).toContainText('gizmo build');
  });

  test('Esc from the detail view returns to the results', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    await shortty.win.keyboard.press('Tab');
    await expect(shortty.search).toHaveAttribute('placeholder', 'Filter subcommands and flags...');

    await shortty.win.keyboard.press('Escape');
    await expect(shortty.search).toHaveAttribute('placeholder', 'Search shortcuts and commands...');
    expect(await shortty.isVisible()).toBe(true);
  });

  test('Esc from the detail view restores the previous results (SPECS §10.7)', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    await shortty.win.keyboard.press('Tab');
    await shortty.win.keyboard.press('Escape');
    await expect(shortty.win.getByTestId('command-row')).toHaveCount(2);
  });
});
