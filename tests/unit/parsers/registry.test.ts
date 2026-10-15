import { describe, it, expect, vi, beforeAll } from 'vitest';
import { join } from 'node:path';
import type { Shortcut } from '../../../src/shared/types';
import { FIXTURES } from './parser-helpers';
import { withPlatform } from '../../helpers';

vi.mock('../../../src/main/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ParserRegistry } from '../../../src/main/parsers/registry';

/** Sources that shell out or read the real machine: kept off for hermeticity. */
const DISABLED = ['tmux', 'macos-system', 'obsidian', 'zsh', 'bash', 'vim', 'chrome'];

describe('ParserRegistry (bundled cheatsheets + fixture configs)', () => {
  withPlatform('darwin');
  let all: Shortcut[];
  let registry: ParserRegistry;

  beforeAll(async () => {
    registry = new ParserRegistry();
    await registry.initialize(DISABLED, {
      vscode: join(FIXTURES, 'vscode-keybindings.json'),
      ghostty: join(FIXTURES, 'ghostty-config'),
    });
    all = registry.getAllCached();
  });

  const bySource = (id: string) => all.filter((s) => s.source === id);

  it('loads the bundled cheatsheets (no runtime path needed)', () => {
    const ids = registry.getAllSources().map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([
      'vscode', 'ghostty', 'chrome', 'finder', 'vim', 'tmux', 'zsh', 'bash', 'obsidian', 'macos-system',
    ]));
    expect(bySource('finder').length).toBeGreaterThan(40);
  });

  it('normalizes cheatsheet keys to the same glyph format as parser keys', () => {
    for (const s of all) {
      expect(s.key, `${s.source} ${s.rawCommand}`).not.toMatch(/\b(?:Cmd|Ctrl|Alt|Shift)\+/);
    }
    const palette = bySource('vscode').find((s) => s.rawCommand === 'workbench.action.quickOpen');
    expect(palette?.key).toBe('⌘P');
    expect(palette?.strokes).toEqual([{ mods: ['cmd'], key: 'P' }]);
  });

  it('applies VS Code overrides and removals onto the defaults', () => {
    const vscode = bySource('vscode');
    // Re-binding the exact default key dedupes into one user entry.
    const reopen = vscode.filter((s) => s.rawCommand === 'workbench.action.reopenClosedEditor');
    expect(reopen).toHaveLength(1);
    expect(reopen[0]).toMatchObject({ key: '⇧⌘T', origin: 'user-config', isDefault: false });

    // A new key for a command adds to its default (VS Code keybindings add).
    const sidebar = vscode.filter((s) => s.rawCommand === 'workbench.action.toggleSidebarVisibility');
    expect(sidebar.map((s) => [s.key, s.origin])).toEqual([
      ['⌘B', 'cheatsheet'],
      ['⇧⌘E', 'user-config'],
    ]);

    const comment = vscode.filter((s) => s.rawCommand.replace(/^-/, '') === 'editor.action.commentLine');
    expect(comment).toHaveLength(1);
    expect(comment[0]).toMatchObject({ key: '⌘/', isUnbound: true, command: 'Toggle Line Comment' });

    const zen = vscode.filter((s) => s.rawCommand.replace(/^-/, '') === 'workbench.action.toggleZenMode');
    expect(zen).toHaveLength(1);
    expect(zen[0]).toMatchObject({ key: '⌘K Z', isUnbound: true });

    const outdent = vscode.find((s) => s.rawCommand === 'editor.action.outdentLines');
    expect(outdent?.strokes).toEqual([{ mods: ['cmd'], key: '[', code: 'BracketLeft' }]);
  });

  it('merges Ghostty overrides without duplicating defaults', () => {
    const ghostty = bySource('ghostty');
    // Re-binding the default key (⌘T) dedupes into one user entry.
    const newTab = ghostty.filter((s) => s.rawCommand === 'ghostty.new_tab');
    expect(newTab).toHaveLength(1);
    expect(newTab[0]).toMatchObject({ key: '⌘T', origin: 'user-config' });

    // `keybind = super+k=unbind` removes the default ⌘K clear_screen
    const clear = ghostty.find((s) => s.rawCommand === 'ghostty.clear_screen');
    expect(clear).toMatchObject({ key: '⌘K', isUnbound: true });
    expect(ghostty.some((s) => s.rawCommand === 'ghostty.unbind')).toBe(false);

    // Ghostty keybinds add triggers: the default ⌘D stays next to the
    // user's ⇧⌘R, which keeps the cheatsheet label.
    const split = ghostty.filter((s) => s.rawCommand === 'ghostty.new_split:right');
    expect(split.map((s) => [s.key, s.origin, s.command])).toEqual([
      ['⌘D', 'cheatsheet', 'New Split Right'],
      ['⇧⌘R', 'user-config', 'New Split Right'],
    ]);
  });

  it('gives every shortcut a unique id', () => {
    const ids = all.map((s) => s.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('re-detects a source when its path override changes', async () => {
    await registry.updateActiveParsers(DISABLED, {
      vscode: join(FIXTURES, 'does-not-exist.json'),
      ghostty: join(FIXTURES, 'ghostty-config'),
    });
    const vscode = registry.getAllSources().find((s) => s.id === 'vscode');
    expect(vscode?.detected).toBe(false);
    expect(registry.getCachedBySource('vscode').every((s) => s.origin === 'cheatsheet')).toBe(true);

    await registry.updateActiveParsers(DISABLED, {
      vscode: join(FIXTURES, 'vscode-keybindings.json'),
      ghostty: join(FIXTURES, 'ghostty-config'),
    });
    expect(registry.getAllSources().find((s) => s.id === 'vscode')?.detected).toBe(true);
  });

  it('reports the enabled sources whose paths changed, so the launcher can be updated', async () => {
    const overrides = {
      vscode: join(FIXTURES, 'does-not-exist.json'),
      ghostty: join(FIXTURES, 'ghostty-config'),
    };
    await registry.updateActiveParsers(DISABLED, overrides);
    // Same paths again: nothing to push
    expect(await registry.updateActiveParsers(DISABLED, overrides)).toEqual([]);
    expect(
      await registry.updateActiveParsers(DISABLED, {
        ...overrides,
        vscode: join(FIXTURES, 'vscode-keybindings.json'),
      }),
    ).toEqual(['vscode']);
    expect(registry.getCachedBySource('vscode').some((s) => s.origin !== 'cheatsheet')).toBe(true);
  });

  it('watches config paths even before the file exists', async () => {
    await registry.updateActiveParsers(DISABLED, {
      vscode: join(FIXTURES, 'later.json'),
      ghostty: join(FIXTURES, 'ghostty-config'),
    });
    expect(registry.getWatchPaths().get('vscode')).toEqual([join(FIXTURES, 'later.json')]);
  });
});

describe('ParserRegistry on Windows', () => {
  withPlatform('win32');
  let registry: ParserRegistry;

  beforeAll(async () => {
    registry = new ParserRegistry();
    await registry.initialize(['vscode', 'chrome', 'obsidian', 'vim']);
  });

  it('registers only the sources that run on Windows', () => {
    const ids = registry.getAllSources().map((s) => s.id);
    expect(ids).toContain('vscode');
    for (const id of ['ghostty', 'tmux', 'zsh', 'bash', 'macos-system', 'finder']) {
      expect(ids, id).not.toContain(id);
    }
  });
});
