import { test, expect, knownBug } from './fixtures';

// Cheatsheets are looked up at <repo>/cheatsheets/sources (loader.ts resolves
// ../../cheatsheets/sources from .vite/build), which does not exist in a build.
// Without them no parser gets config paths; only Obsidian (vault auto-discovery) loads.
const CHEATSHEETS_BUG = 'cheatsheets dir resolves to <root>/cheatsheets/sources in the build: only auto-discovered Obsidian loads';

test.describe('shortcut search', () => {
  test('loads shortcuts from the fixture configs', async ({ shortty }) => {
    knownBug(CHEATSHEETS_BUG);
    const shortcuts = await shortty.win.evaluate(() => window.electronAPI.getAllKeybindings());
    const userConfig = shortcuts.filter((s) => s.origin !== 'cheatsheet');
    expect(new Set(userConfig.map((s) => s.source))).toEqual(
      new Set(['vscode', 'ghostty', 'chrome', 'obsidian', 'zsh', 'vim', 'bash']),
    );
  });

  test('typing a query shows matching shortcut rows', async ({ shortty }) => {
    knownBug(CHEATSHEETS_BUG);
    await shortty.show();
    await shortty.search.fill('reopen closed editor');
    const row = shortty.win.getByTestId('shortcut-row').first();
    await expect(row).toContainText('Reopen Closed Editor');
    await expect(row).toContainText('VS Code');
    await expect(shortty.sectionHeader('Shortcuts')).toBeVisible();
  });

  test('shows the user override with its context badge', async ({ shortty }) => {
    knownBug(CHEATSHEETS_BUG);
    await shortty.show();
    await shortty.search.fill('toggle word wrap');
    const row = shortty.win.getByTestId('shortcut-row').filter({ hasText: 'Toggle Word Wrap' });
    await expect(row.first()).toContainText('editorFocus');
  });

  test('Enter copies the key combo of the selected shortcut', async ({ shortty }) => {
    knownBug(CHEATSHEETS_BUG);
    await shortty.show();
    await shortty.setSetting('dismissAfterCopy', false);
    await shortty.search.fill('reopen closed editor');
    await shortty.selectRow('Reopen Closed Editor');
    await shortty.win.keyboard.press('Enter');
    await expect.poll(() => shortty.clipboard()).toBe('⇧⌘t');
  });

  test('arrow keys move across sections and wrap around', async ({ shortty }) => {
    knownBug(CHEATSHEETS_BUG);
    await shortty.show();
    // "vs" matches the VS Code source plus VS Code shortcuts
    await shortty.search.fill('vs');
    const options = shortty.win.locator('[role="option"]');
    const total = await options.count();
    expect(total).toBeGreaterThan(1);
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await shortty.win.keyboard.press('ArrowDown');
    await expect(shortty.win.getByTestId('shortcut-row').first()).toHaveAttribute('aria-selected', 'true');
    await shortty.win.keyboard.press('ArrowUp');
    await shortty.win.keyboard.press('ArrowUp');
    await expect(options.last()).toHaveAttribute('aria-selected', 'true');
  });

  test('with command prefix mode on, flat search excludes commands', async ({ shortty }) => {
    knownBug('useSearch always searches commands in flat mode; prefix mode only adds the ">" filter');
    await shortty.show();
    await shortty.search.fill('gizmo');
    await expect(shortty.win.getByTestId('command-row')).toHaveCount(0);
  });
});

test.describe('drill into a source', () => {
  test('Enter on a source row scopes the search to it, Esc returns to flat', async ({ shortty }) => {
    await shortty.show();
    await shortty.search.fill('VS');
    const source = shortty.win.getByTestId('source-row');
    await expect(source).toHaveCount(1);
    await expect(source).toContainText('VS Code');
    await expect(source).toHaveAttribute('aria-selected', 'true');

    await shortty.win.keyboard.press('Enter');
    await expect(shortty.search).toHaveValue('');
    await expect(shortty.search).toHaveAttribute('placeholder', 'Search in VS Code...');

    await shortty.win.keyboard.press('Escape');
    await expect(shortty.search).toHaveAttribute('placeholder', 'Search shortcuts and commands...');
  });

  test('source row shows the number of shortcuts it holds', async ({ shortty }) => {
    knownBug(CHEATSHEETS_BUG);
    await shortty.show();
    await shortty.search.fill('VS');
    await expect(shortty.win.getByTestId('source-row')).toContainText(/[1-9]\d* shortcuts/);
  });

  test('drilled source lists all its entries before typing (SCREENS §2.1)', async ({ shortty }) => {
    knownBug('useSearch returns no results for an empty query, even when drilled into a source');
    await shortty.show();
    await shortty.search.fill('VS');
    await shortty.win.keyboard.press('Enter');
    await expect(shortty.win.getByTestId('shortcut-row').first()).toBeVisible();
  });

  test('search inside a drilled source only returns that source', async ({ shortty }) => {
    knownBug(CHEATSHEETS_BUG);
    await shortty.show();
    await shortty.search.fill('VS');
    await shortty.win.keyboard.press('Enter');
    await shortty.search.fill('toggle');
    const rows = shortty.win.getByTestId('shortcut-row');
    await expect(rows.first()).toBeVisible();
    for (const text of await rows.allInnerTexts()) {
      expect(text).not.toMatch(/Ghostty|Obsidian|Chrome/);
    }
  });

  test('Esc from a drilled source restores the previous query (SCREENS §2.1)', async ({ shortty }) => {
    knownBug('popLevel() clears the query instead of restoring it');
    await shortty.show();
    await shortty.search.fill('VS');
    await shortty.win.keyboard.press('Enter');
    await shortty.win.keyboard.press('Escape');
    await expect(shortty.search).toHaveValue('VS');
  });
});
