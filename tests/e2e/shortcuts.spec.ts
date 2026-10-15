import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures';

test.describe('shortcut search', () => {
  test('loads shortcuts from the fixture configs', async ({ shortty }) => {
    const shortcuts = await shortty.win.evaluate(() => window.electronAPI.getAllKeybindings());
    const userConfig = shortcuts.filter((s) => s.origin !== 'cheatsheet');
    expect(new Set(userConfig.map((s) => s.source))).toEqual(
      new Set(['vscode', 'ghostty', 'chrome', 'obsidian', 'zsh', 'vim', 'bash']),
    );
  });

  test('typing a query shows matching shortcut rows', async ({ shortty }) => {
    await shortty.show();
    await shortty.search.fill('reopen closed editor');
    const row = shortty.win.getByTestId('shortcut-row').first();
    await expect(row).toContainText('Reopen Closed Editor');
    await expect(row).toContainText('VS Code');
    await expect(shortty.sectionHeader('Shortcuts')).toBeVisible();
  });

  test('shows the user binding with its context badge next to the default', async ({ shortty }) => {
    await shortty.show();
    await shortty.search.fill('toggle word wrap');
    const rows = shortty.win.getByTestId('shortcut-row').filter({ hasText: 'Toggle Word Wrap' });
    // VS Code keybindings add to the defaults (docs/spec.md §6.2).
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'editorFocus' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'editorTextFocus' })).toHaveCount(1);
  });

  test('Enter copies the key combo of the selected shortcut', async ({ shortty }) => {
    await shortty.show();
    await shortty.setSetting('dismissAfterCopy', false);
    await shortty.search.fill('reopen closed editor');
    await shortty.selectRow('Reopen Closed Editor');
    await shortty.win.keyboard.press('Enter');
    await expect.poll(() => shortty.clipboard()).toBe('⇧⌘T');
  });

  test('arrow keys move across sections and wrap around', async ({ shortty }) => {
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
    await shortty.setSetting('commandPrefixMode', true);
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
    await shortty.show();
    await shortty.search.fill('VS');
    await expect(shortty.win.getByTestId('source-row')).toContainText(/[1-9]\d* shortcuts/);
  });

  test('drilled source lists all its entries before typing (docs/screens.md §2.1)', async ({ shortty }) => {
    await shortty.show();
    await shortty.search.fill('obsidian');
    await shortty.win.keyboard.press('Enter');
    await expect(shortty.search).toHaveAttribute('placeholder', 'Search in Obsidian...');
    const rows = shortty.results.getByTestId('shortcut-row');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(4);
    // No 8-row cap, no "Show all", no Sources section, no source label on rows.
    await expect(shortty.win.getByTestId('show-all-row')).toHaveCount(0);
    await expect(shortty.win.getByTestId('source-row')).toHaveCount(0);
    await expect(shortty.results.getByText('Obsidian', { exact: true })).toHaveCount(0);
  });

  test('source names match fuzzily ("vsc" finds VS Code)', async ({ shortty }) => {
    await shortty.show();
    for (const query of ['vsc', 'vscode', 'vs code']) {
      await shortty.search.fill(query);
      await expect(shortty.win.getByTestId('source-row')).toHaveText(/VS Code/);
    }
  });

  test('search inside a drilled source only returns that source', async ({ shortty }) => {
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

  test('Esc from a drilled source restores the previous query (docs/screens.md §2.1)', async ({ shortty }) => {
    await shortty.show();
    await shortty.search.fill('VS');
    await shortty.win.keyboard.press('Enter');
    await shortty.win.keyboard.press('Escape');
    await expect(shortty.search).toHaveValue('VS');
  });
});

type UpdatesWindow = { __updates: { sourceId: string; keys: string[] }[] };

test.describe('source path overrides', () => {
  test('pointing a source at another file updates the open launcher', async ({ shortty }) => {
    const alt = path.join(shortty.hermetic.dir, 'alt-ghostty-config');
    writeFileSync(alt, 'keybind = cmd+shift+u=new_window\n');
    await shortty.show();
    await shortty.win.evaluate(() => {
      const w = window as unknown as UpdatesWindow;
      w.__updates = [];
      window.electronAPI.onKeybindingsUpdate(({ sourceId, keybindings }) => {
        w.__updates.push({
          sourceId,
          keys: keybindings.filter((k) => k.origin !== 'cheatsheet').map((k) => k.rawCommand),
        });
      });
    });

    await shortty.setSetting('sourcePathOverrides', { ghostty: alt });

    await expect
      .poll(() => shortty.win.evaluate(() => (window as unknown as UpdatesWindow).__updates))
      .toContainEqual({ sourceId: 'ghostty', keys: ['ghostty.new_window'] });
  });
});
