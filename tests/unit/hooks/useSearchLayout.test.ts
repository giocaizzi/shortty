// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Shortcut } from '@shared/types';
import { useSearch } from '../../../src/renderer/hooks/useSearch';
import { makeLayout } from '../../../src/renderer/lib/keyboard-layout';
import { layoutMapOf } from '../../../src/renderer/lib/keyboard-layouts.data';
import { formatKeyCombo } from '../../../src/main/parsers/key-normalizer';

vi.mock('../../../src/renderer/context/SettingsContext', () => ({
  useAppSettings: vi.fn(() => ({
    search: { keyWeight: 0.4, commandWeight: 0.4, sourceWeight: 0.1, contextWeight: 0.1, threshold: 0.35 },
    commandPrefixMode: true,
    resultLimits: { sources: 3, shortcuts: 8, commands: 5 },
  })),
}));

const italian = makeLayout(layoutMapOf('it'));
vi.mock('../../../src/renderer/lib/keyboard-layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/renderer/lib/keyboard-layout')>();
  return { ...actual, useKeyboardLayout: () => italian };
});

function shortcut(id: string, combo: string, command: string, code?: string): Shortcut {
  const n = formatKeyCombo(combo);
  const strokes = code ? n.strokes.map((s) => ({ ...s, code })) : n.strokes;
  return {
    id, source: 'vscode', sourceLabel: 'VS Code', key: n.displayKey, searchKey: n.searchKey, strokes,
    command, rawCommand: command, isDefault: true, isUnbound: false, filePath: '', origin: 'cheatsheet',
  };
}

const shortcuts = [
  shortcut('1', 'cmd+;', 'Physical semicolon command', 'Semicolon'),
  shortcut('2', 'cmd+[', 'Outdent Line'),
  shortcut('3', 'cmd+shift+/', 'Show Help'),
  shortcut('4', 'cmd+p', 'Quick Open'),
  shortcut('5', 'cmd++', 'Zoom In'),
];

function search(query: string): string[] {
  const { result } = renderHook(() => useSearch(shortcuts, [], []));
  act(() => result.current.setQuery(query));
  return result.current.results.shortcuts.map((s) => s.id);
}

describe('useSearch on an Italian keyboard', () => {
  it('"ò" finds the shortcut on the ò key (US ;)', () => {
    expect(search('ò')).toEqual(['1']);
  });

  it('"è" finds ⌘[ (typed with ⌥è)', () => {
    expect(search('è')).toEqual(['2']);
  });

  it('"?" finds ⇧⌘/ (US ⇧/ is ?)', () => {
    expect(search('?')).toEqual(['3']);
  });

  it('"+" finds ⌘+', () => {
    expect(search('+')).toEqual(['5']);
  });
});
