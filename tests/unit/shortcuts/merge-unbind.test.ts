import { describe, it, expect } from 'vitest';
import type { Shortcut } from '../../../src/shared/types';
import { mergeShortcuts } from '../../../src/main/shortcuts/merge';

function makeShortcut(overrides: Partial<Shortcut> = {}): Shortcut {
  return {
    id: 'abc123def456',
    source: 'vscode',
    sourceLabel: 'VS Code',
    key: '⇧⌘T',
    searchKey: 'shift cmd t',
    command: 'Reopen Closed Editor',
    rawCommand: 'workbench.action.reopenClosedEditor',
    isDefault: true,
    isUnbound: false,
    filePath: '/path/to/keybindings.json',
    origin: 'cheatsheet',
    ...overrides,
  };
}

describe('mergeShortcuts unbinding and duplicates', () => {
  it('marks the default unbound for a VS Code "-command" removal with the same key', () => {
    const defaults = [makeShortcut({ rawCommand: 'editor.action.commentLine', key: '⌘/', searchKey: 'cmd / slash' })];
    const overrides = [makeShortcut({
      rawCommand: '-editor.action.commentLine', key: '⌘/', searchKey: 'cmd / slash', isUnbound: true, origin: 'user-config',
    })];
    const result = mergeShortcuts(defaults, overrides);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: '⌘/', isUnbound: true, isDefault: false, origin: 'user-config' });
  });

  it('keeps the default when the removal names a different key', () => {
    const defaults = [makeShortcut({ rawCommand: 'editor.action.commentLine', key: '⌘/', searchKey: 'cmd / slash' })];
    const overrides = [makeShortcut({
      rawCommand: '-editor.action.commentLine', key: '⌘K', searchKey: 'cmd k', isUnbound: true,
    })];
    const result = mergeShortcuts(defaults, overrides);
    expect(result[0].isUnbound).toBe(false);
    expect(result[1]).toMatchObject({ rawCommand: '-editor.action.commentLine', isUnbound: true });
  });

  it('a removal without a key unbinds every default of the command', () => {
    const defaults = [
      makeShortcut({ rawCommand: 'a', key: '⌘A', searchKey: 'cmd a' }),
      makeShortcut({ rawCommand: 'a', key: '⌘B', searchKey: 'cmd b' }),
    ];
    const removal = makeShortcut({ rawCommand: '-a', key: '', searchKey: '', isUnbound: true });
    const result = mergeShortcuts(defaults, [removal]);
    expect(result.map((s) => s.isUnbound)).toEqual([true, true]);
  });

  it('matches a key-only unbind (Ghostty "unbind") by key', () => {
    const defaults = [
      makeShortcut({ source: 'ghostty', rawCommand: 'ghostty.clear_screen', key: '⌘K', searchKey: 'cmd k' }),
      makeShortcut({ source: 'ghostty', rawCommand: 'ghostty.new_tab', key: '⌘T', searchKey: 'cmd t' }),
    ];
    const overrides = [makeShortcut({
      source: 'ghostty', rawCommand: 'ghostty.unbind', key: '⌘K', searchKey: 'cmd k', isUnbound: true,
    })];
    const result = mergeShortcuts(defaults, overrides);
    expect(result.map((s) => [s.rawCommand, s.isUnbound])).toEqual([
      ['ghostty.clear_screen', true],
      ['ghostty.new_tab', false],
    ]);
  });

  it('an unknown key-less unbind matches nothing', () => {
    const defaults = [makeShortcut()];
    const result = mergeShortcuts(defaults, [makeShortcut({ rawCommand: 'x.unbind', key: '', searchKey: '', isUnbound: true })]);
    expect(result[0].isUnbound).toBe(false);
    expect(result).toHaveLength(2);
  });

  it('adds a second binding of the same command instead of dropping it', () => {
    const defaults = [makeShortcut({ rawCommand: 'next', key: '⌥⌘→', searchKey: 'opt cmd right' })];
    const overrides = [
      makeShortcut({ rawCommand: 'next', key: '⌃Tab', searchKey: 'ctrl tab' }),
      makeShortcut({ rawCommand: 'next', key: '⌃⌥→', searchKey: 'ctrl opt right', context: 'terminalFocus' }),
    ];
    expect(mergeShortcuts(defaults, overrides, 'replace').map((s) => [s.key, s.origin])).toEqual([
      ['⌃Tab', 'user-config'],
      ['⌃⌥→', 'user-config'],
    ]);
    // Additive apps keep the default next to both user bindings.
    expect(mergeShortcuts(defaults, overrides, 'additive').map((s) => [s.key, s.origin])).toEqual([
      ['⌥⌘→', 'cheatsheet'],
      ['⌃Tab', 'user-config'],
      ['⌃⌥→', 'user-config'],
    ]);
  });

  it('carries the override strokes onto the merged entry', () => {
    const defaults = [makeShortcut({ strokes: [{ mods: ['shift', 'cmd'], key: 'T' }] })];
    const strokes: Shortcut['strokes'] = [{ mods: ['cmd'], key: '[', code: 'BracketLeft' }];
    const override = makeShortcut({ key: '⌘[', searchKey: 'cmd [', strokes });
    expect(mergeShortcuts(defaults, [override], 'replace')[0].strokes).toEqual(strokes);
    expect(mergeShortcuts(defaults, [override], 'additive')[1].strokes).toEqual(strokes);
  });

  it('a vim unmap / <Nop> (unknown command) removes the default on that key only', () => {
    const defaults = [
      makeShortcut({ source: 'vim', rawCommand: 'vim.edit.deleteChar', key: 'x', searchKey: 'x' }),
      makeShortcut({ source: 'vim', rawCommand: 'vim.edit.undo', key: 'u', searchKey: 'u' }),
    ];
    const overrides = [makeShortcut({
      source: 'vim', rawCommand: 'nunmap x', command: 'Unmap', key: 'x', searchKey: 'x', isUnbound: true,
    })];
    const result = mergeShortcuts(defaults, overrides, 'additive');
    expect(result.map((s) => [s.rawCommand, s.isUnbound])).toEqual([
      ['vim.edit.deleteChar', true],
      ['vim.edit.undo', false],
    ]);
  });

  it('keeps cheatsheet entries that share a rawCommand', () => {
    const defaults = [makeShortcut(), makeShortcut({ key: '⌘Y', searchKey: 'cmd y' })];
    expect(mergeShortcuts(defaults, [])).toHaveLength(2);
  });
});
