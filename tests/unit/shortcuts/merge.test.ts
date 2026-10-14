import { assert } from 'vitest';
import type { Shortcut } from '../../../src/shared/types';
import { mergeShortcuts } from '../../../src/main/shortcuts/merge';

function makeShortcut(overrides: Partial<Shortcut> = {}): Shortcut {
  return {
    id: 'abc123def456',
    source: 'vscode',
    sourceLabel: 'VS Code',
    key: '⌘⇧T',
    searchKey: 'cmd shift t',
    command: 'Reopen Closed Editor',
    rawCommand: 'workbench.action.reopenClosedEditor',
    isDefault: true,
    isUnbound: false,
    filePath: '/path/to/keybindings.json',
    origin: 'cheatsheet',
    ...overrides,
  };
}

describe('mergeShortcuts', () => {
  it('additive: keeps the default and adds the user binding for the same command', () => {
    const defaults = [makeShortcut()];
    const overrides = [
      makeShortcut({
        id: 'user00000001',
        key: '⌘T',
        searchKey: 'cmd t',
        command: 'workbench.action.reopenClosedEditor',
        filePath: '/user/keybindings.json',
        origin: 'user-config',
      }),
    ];

    const result = mergeShortcuts(defaults, overrides);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      key: '⌘⇧T', isDefault: true, isUnbound: false, origin: 'cheatsheet',
    });
    expect(result[1]).toMatchObject({
      key: '⌘T',
      searchKey: 'cmd t',
      isDefault: false,
      origin: 'user-config',
      filePath: '/user/keybindings.json',
      // The cheatsheet label wins over the parser's humanized id.
      command: 'Reopen Closed Editor',
    });
  });

  it('additive is the default mode', () => {
    const overrides = [makeShortcut({ key: '⌘T', searchKey: 'cmd t' })];
    expect(mergeShortcuts([makeShortcut()], overrides)).toEqual(
      mergeShortcuts([makeShortcut()], overrides, 'additive'),
    );
  });

  it('additive: re-binding the exact default key dedupes into one user entry', () => {
    const defaults = [makeShortcut()];
    const overrides = [
      makeShortcut({ id: 'user00000001', filePath: '/user/keybindings.json', context: 'editorFocus' }),
    ];

    const result = mergeShortcuts(defaults, overrides);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'abc123def456',
      key: '⌘⇧T',
      isDefault: false,
      origin: 'user-config',
      filePath: '/user/keybindings.json',
      context: 'editorFocus',
    });
  });

  it('additive: a removal then a re-add of the same key restores the binding', () => {
    const defaults = [makeShortcut()];
    const overrides = [
      makeShortcut({ rawCommand: '-workbench.action.reopenClosedEditor', isUnbound: true }),
      makeShortcut({ filePath: '/user/keybindings.json' }),
    ];

    const result = mergeShortcuts(defaults, overrides);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ isUnbound: false, origin: 'user-config' });
  });

  it('additive: an explicit removal of the default plus a new key moves the binding', () => {
    const defaults = [makeShortcut()];
    const overrides = [
      makeShortcut({ rawCommand: '-workbench.action.reopenClosedEditor', isUnbound: true }),
      makeShortcut({ key: '⌘T', searchKey: 'cmd t' }),
    ];

    const result = mergeShortcuts(defaults, overrides);

    expect(result.map((s) => [s.key, s.isUnbound, s.origin])).toEqual([
      ['⌘⇧T', true, 'user-config'],
      ['⌘T', false, 'user-config'],
    ]);
  });

  it('replace: a user binding replaces the default key of its command', () => {
    const defaults = [makeShortcut()];
    const overrides = [
      makeShortcut({
        key: '⌘T',
        searchKey: 'cmd t',
        isUnbound: false,
        filePath: '/user/keybindings.json',
      }),
    ];

    const result = mergeShortcuts(defaults, overrides, 'replace');

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('⌘T');
    expect(result[0].searchKey).toBe('cmd t');
    expect(result[0].isDefault).toBe(false);
    expect(result[0].origin).toBe('user-config');
    expect(result[0].filePath).toBe('/user/keybindings.json');
    // Preserves non-overridden fields from cheatsheet
    expect(result[0].command).toBe('Reopen Closed Editor');
    expect(result[0].source).toBe('vscode');
  });

  it('replace: further bindings of the same command are added', () => {
    const defaults = [makeShortcut()];
    const overrides = [
      makeShortcut({ key: '⌘T', searchKey: 'cmd t' }),
      makeShortcut({ key: '⌘Y', searchKey: 'cmd y' }),
    ];

    const result = mergeShortcuts(defaults, overrides, 'replace');

    expect(result.map((s) => [s.key, s.origin])).toEqual([
      ['⌘T', 'user-config'],
      ['⌘Y', 'user-config'],
    ]);
  });

  it('should add unmatched user entries', () => {
    const defaults = [makeShortcut()];
    const overrides = [
      makeShortcut({
        rawCommand: 'custom.userCommand',
        key: '⌘K',
        searchKey: 'cmd k',
        command: 'Custom Command',
      }),
    ];

    const result = mergeShortcuts(defaults, overrides);

    expect(result).toHaveLength(2);
    const userEntry = result.find(
      (s) => s.rawCommand === 'custom.userCommand',
    );
    assert(userEntry, 'expected user entry to exist');
    expect(userEntry.isDefault).toBe(false);
    expect(userEntry.origin).toBe('user-config');
  });

  it('should preserve unmatched cheatsheet entries', () => {
    const defaults = [
      makeShortcut(),
      makeShortcut({
        rawCommand: 'workbench.action.save',
        key: '⌘S',
        searchKey: 'cmd s',
        command: 'Save',
      }),
    ];
    const overrides = [
      makeShortcut({
        key: '⌘T',
        searchKey: 'cmd t',
      }),
    ];

    const result = mergeShortcuts(defaults, overrides);

    expect(result).toHaveLength(3);
    const preserved = result.find(
      (s) => s.rawCommand === 'workbench.action.save',
    );
    assert(preserved, 'expected preserved entry to exist');
    expect(preserved.isDefault).toBe(true);
    expect(preserved.origin).toBe('cheatsheet');
  });

  it('should return cheatsheet as-is when parser output is empty', () => {
    const defaults = [
      makeShortcut(),
      makeShortcut({
        rawCommand: 'workbench.action.save',
        key: '⌘S',
        searchKey: 'cmd s',
        command: 'Save',
      }),
    ];

    const result = mergeShortcuts(defaults, []);

    expect(result).toHaveLength(2);
    expect(result.every((s) => s.isDefault === true)).toBe(true);
    expect(result.every((s) => s.origin === 'cheatsheet')).toBe(true);
  });

  it('should return parser output as-is when cheatsheet is empty', () => {
    const overrides = [
      makeShortcut({
        rawCommand: 'custom.command',
        key: '⌘K',
        searchKey: 'cmd k',
        command: 'Custom',
      }),
    ];

    const result = mergeShortcuts([], overrides);

    expect(result).toHaveLength(1);
    expect(result[0].isDefault).toBe(false);
    expect(result[0].origin).toBe('user-config');
  });

  it('should preserve category from cheatsheet when overridden', () => {
    const defaults = [
      makeShortcut({
        category: 'Navigation',
      }),
    ];
    const overrides = [
      makeShortcut({
        key: '⌘T',
        searchKey: 'cmd t',
        category: undefined,
      }),
    ];

    for (const mode of ['additive', 'replace'] as const) {
      const result = mergeShortcuts(defaults, overrides, mode);
      const user = result.find((s) => s.key === '⌘T');
      expect(user?.category).toBe('Navigation');
      expect(user?.isDefault).toBe(false);
    }
  });
});
