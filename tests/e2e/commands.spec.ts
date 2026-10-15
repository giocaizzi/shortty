import { rmSync } from 'node:fs';
import { test, expect, waitForEnrichment, launchShortty, FAKE_COMMANDS, type Shortty } from './fixtures';

test.describe('commands from the fixture PATH', () => {
  test.beforeEach(async ({ shortty }) => {
    await waitForEnrichment(shortty);
    // Keep the panel open across copies so a test can chain actions.
    await shortty.setSetting('dismissAfterCopy', false);
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

  test('Esc from the detail view restores the previous results (docs/spec.md §10.7)', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    await shortty.win.keyboard.press('Tab');
    await shortty.win.keyboard.press('Escape');
    await expect(shortty.win.getByTestId('command-row')).toHaveCount(2);
  });
});

test.describe('drill-in before background enrichment', () => {
  test('drilling in right after launch enriches that command on demand', async () => {
    // Slow commands sorted before "gizmo": the background worker spends
    // ~1s on each --help, one at a time, so it reaches gizmo last.
    const slow = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `aaa-slow-${String(i).padStart(2, '0')}`,
        'sleep 1\necho "Usage: slow [options]"\necho "  -x, --extra  Extra"',
      ]),
    );
    const shortty = await launchShortty({ dismissAfterCopy: false }, slow);
    try {
      await expect
        .poll(() => shortty.win.evaluate(async () =>
          (await window.electronAPI.getAllCommands()).some((c) => c.name === 'gizmo' && c.enrichment === 'basic')))
        .toBe(true);
      await shortty.show();
      await shortty.win.keyboard.type('>gizmo');
      await shortty.selectRow(/^gizmo\b(?!-)/);
      await shortty.win.keyboard.press('Tab');

      await expect(shortty.win.getByTestId('subcommand-row').filter({ hasText: 'gizmo build' }))
        .toBeVisible({ timeout: 8_000 });
      await expect(shortty.win.getByTestId('detail-source')).toHaveText('Source: --help');
      // The background worker is still far from done: the details came on demand.
      const stats = await shortty.win.evaluate(() => window.electronAPI.getCommandsStats());
      expect(stats.enriched).toBeLessThan(stats.total);
    } finally {
      await shortty.app.close();
      rmSync(shortty.hermetic.dir, { recursive: true, force: true });
    }
  });
});

test.describe('typed drill-down (docs/spec.md §10.2)', () => {
  test.beforeEach(async ({ shortty }) => {
    await waitForEnrichment(shortty);
    await shortty.setSetting('dismissAfterCopy', false);
    await shortty.show();
  });

  const crumbs = (shortty: Shortty) => shortty.win.getByTestId('breadcrumb');

  test('typing a path drills to any depth, fetching each level on demand', async ({ shortty }) => {
    await shortty.win.keyboard.type('>nestor compute instances create --zo');
    await expect(crumbs(shortty)).toHaveText(['nestor', 'compute', 'instances', 'create']);
    await expect(shortty.search).toHaveValue('--zo');
    await expect(shortty.win.getByTestId('flag-row')).toHaveText([/--zone/]);

    await shortty.win.keyboard.press('Enter');
    await expect.poll(() => shortty.clipboard()).toBe('--zone');
  });

  test('a pasted line resolves as far as it can', async ({ shortty }) => {
    await shortty.win.keyboard.type('>');
    await shortty.win.keyboard.insertText('nestor compute instances nope --x');
    await expect(crumbs(shortty)).toHaveText(['nestor', 'compute', 'instances']);
    await expect(shortty.search).toHaveValue('nope --x');
  });

  test('an ambiguous command name drills on the space', async ({ shortty }) => {
    await shortty.win.keyboard.type('>gizmo');
    // gizmo-lite also starts with "gizmo"
    await expect(shortty.win.getByTestId('command-row')).toHaveCount(2);
    await expect(crumbs(shortty)).toHaveCount(0);
    await shortty.win.keyboard.type(' dep');
    await expect(crumbs(shortty)).toHaveText(['gizmo']);
    await expect(shortty.win.getByTestId('subcommand-row')).toHaveText([/gizmo deploy/]);
  });

  test('an unambiguous word drills at once, an ambiguous one waits', async ({ shortty }) => {
    await shortty.win.keyboard.type('>nestor compute');
    // compute-legacy keeps "compute" ambiguous
    await expect(crumbs(shortty)).toHaveText(['nestor']);
    await expect(shortty.win.getByTestId('subcommand-row')).toHaveCount(2);
    await shortty.win.keyboard.type(' instances');
    await expect(crumbs(shortty)).toHaveText(['nestor', 'compute', 'instances']);
    await expect(shortty.search).toHaveValue('');
  });

  test('Backspace on an empty filter steps back with the word to edit', async ({ shortty }) => {
    await shortty.win.keyboard.type('>nestor compute instances create');
    await expect(crumbs(shortty)).toHaveText(['nestor', 'compute', 'instances', 'create']);
    await shortty.win.keyboard.press('Backspace');
    await expect(crumbs(shortty)).toHaveText(['nestor', 'compute', 'instances']);
    await expect(shortty.search).toHaveValue('create');
    await shortty.win.keyboard.press('Backspace');
    await shortty.win.keyboard.type('e');
    await expect(crumbs(shortty)).toHaveText(['nestor', 'compute', 'instances', 'create']);
  });
});
