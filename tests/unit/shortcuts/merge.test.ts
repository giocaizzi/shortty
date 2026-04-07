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
  it('should replace key when override matches by rawCommand', () => {
    const defaults = [makeShortcut()];
    const overrides = [
      makeShortcut({
        key: '⌘T',
        searchKey: 'cmd t',
        isUnbound: false,
        filePath: '/user/keybindings.json',
      }),
    ];

    const result = mergeShortcuts(defaults, overrides);

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
    expect(userEntry).toBeDefined();
    expect(userEntry!.isDefault).toBe(false);
    expect(userEntry!.origin).toBe('user-config');
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

    expect(result).toHaveLength(2);
    const preserved = result.find(
      (s) => s.rawCommand === 'workbench.action.save',
    );
    expect(preserved).toBeDefined();
    expect(preserved!.isDefault).toBe(true);
    expect(preserved!.origin).toBe('cheatsheet');
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
      }),
    ];

    const result = mergeShortcuts(defaults, overrides);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Navigation');
    expect(result[0].key).toBe('⌘T');
    expect(result[0].isDefault).toBe(false);
  });
});
