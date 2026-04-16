// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Shortcut, ParserMeta, Command } from '@shared/types';
import type { ElectronAPI } from '../../../src/preload/preload';
import { useSearch } from '../../../src/renderer/hooks/useSearch';

vi.mock('../../../src/renderer/context/SettingsContext', () => ({
  useAppSettings: vi.fn(() => ({
    search: {
      keyWeight: 0.4,
      commandWeight: 0.4,
      sourceWeight: 0.1,
      contextWeight: 0.1,
      threshold: 0.35,
    },
    commandPrefixMode: true,
    resultLimits: {
      sources: 3,
      shortcuts: 8,
      commands: 5,
    },
  })),
}));

const testShortcuts: Shortcut[] = [
  {
    id: '1',
    source: 'vscode',
    sourceLabel: 'VS Code',
    key: '⌘C',
    searchKey: 'Cmd+C',
    command: 'Copy',
    rawCommand: 'editor.action.clipboardCopyAction',
    isDefault: true,
    isUnbound: false,
    filePath: '',
    origin: 'cheatsheet' as const,
  },
  {
    id: '2',
    source: 'vscode',
    sourceLabel: 'VS Code',
    key: '⌘V',
    searchKey: 'Cmd+V',
    command: 'Paste',
    rawCommand: 'editor.action.clipboardPasteAction',
    isDefault: true,
    isUnbound: false,
    filePath: '',
    origin: 'cheatsheet' as const,
  },
  {
    id: '3',
    source: 'tmux',
    sourceLabel: 'tmux',
    key: 'Ctrl+b d',
    searchKey: 'Ctrl+b d',
    command: 'Detach',
    rawCommand: 'detach-client',
    isDefault: true,
    isUnbound: false,
    filePath: '',
    origin: 'cheatsheet' as const,
  },
];

const testCommands: Command[] = [
  {
    name: 'git',
    description: 'Version control',
    bin: '/usr/bin/git',
    mtime: 0,
    enrichment: 'basic' as const,
    hasManPage: true,
    hasCompletion: false,
    subcommands: [],
    flags: [],
    arguments: [],
  },
  {
    name: 'curl',
    description: 'Transfer data from URLs',
    bin: '/usr/bin/curl',
    mtime: 0,
    enrichment: 'basic' as const,
    hasManPage: true,
    hasCompletion: false,
    subcommands: [],
    flags: [],
    arguments: [],
  },
];

const testSources: ParserMeta[] = [
  { id: 'vscode', label: 'VS Code', icon: '📝', platforms: ['darwin'] },
  { id: 'tmux', label: 'tmux', icon: '📟', platforms: ['darwin'] },
];

beforeEach(() => {
  window.electronAPI = {
    getSources: vi.fn().mockResolvedValue([]),
    getAllKeybindings: vi.fn().mockResolvedValue([]),
    refreshKeybindings: vi.fn().mockResolvedValue([]),
    onKeybindingsUpdate: vi.fn(() => vi.fn()),
    onWindowShown: vi.fn(() => vi.fn()),
    getAllCommands: vi.fn().mockResolvedValue([]),
    getCommandsStats: vi
      .fn()
      .mockResolvedValue({ total: 0, enriched: 0, running: false }),
    onCommandsUpdate: vi.fn(() => vi.fn()),
  } as unknown as ElectronAPI;
});

afterEach(() => {
  window.electronAPI = undefined as unknown as ElectronAPI;
});

describe('useSearch', () => {
  it('returns empty results when query is empty', () => {
    const { result } = renderHook(() =>
      useSearch(testShortcuts, testCommands, testSources),
    );

    expect(result.current.query).toBe('');
    expect(result.current.results.shortcuts).toEqual([]);
    expect(result.current.results.commands).toEqual([]);
    expect(result.current.results.sources).toEqual([]);
    expect(result.current.results.totalShortcuts).toBe(0);
    expect(result.current.results.totalCommands).toBe(0);
  });

  it('returns matching shortcuts when query matches key', () => {
    const { result } = renderHook(() =>
      useSearch(testShortcuts, testCommands, testSources),
    );

    act(() => {
      result.current.setQuery('Cmd+C');
    });

    expect(result.current.results.shortcuts.length).toBeGreaterThan(0);
    expect(
      result.current.results.shortcuts.some((s) => s.searchKey === 'Cmd+C'),
    ).toBe(true);
  });

  it('returns matching shortcuts when query matches command', () => {
    const { result } = renderHook(() =>
      useSearch(testShortcuts, testCommands, testSources),
    );

    act(() => {
      result.current.setQuery('Copy');
    });

    expect(result.current.results.shortcuts.length).toBeGreaterThan(0);
    expect(
      result.current.results.shortcuts.some((s) => s.command === 'Copy'),
    ).toBe(true);
  });

  it('returns matching commands when query matches command name', () => {
    const { result } = renderHook(() =>
      useSearch(testShortcuts, testCommands, testSources),
    );

    act(() => {
      result.current.setQuery('git');
    });

    expect(result.current.results.commands.length).toBeGreaterThan(0);
    expect(
      result.current.results.commands.some((c) => c.name === 'git'),
    ).toBe(true);
  });

  it('returns matching sources when query matches source label (case-insensitive)', () => {
    const { result } = renderHook(() =>
      useSearch(testShortcuts, testCommands, testSources),
    );

    act(() => {
      result.current.setQuery('vs code');
    });

    expect(result.current.results.sources.length).toBeGreaterThan(0);
    expect(result.current.results.sources[0].meta.id).toBe('vscode');
    expect(result.current.results.sources[0].count).toBe(2);
  });

  it('respects result limits from settings', () => {
    // Create more shortcuts than the limit (8)
    const manyShortcuts: Shortcut[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      source: 'vscode',
      sourceLabel: 'VS Code',
      key: `⌘${i}`,
      searchKey: `Cmd+${i}`,
      command: `Action ${i}`,
      rawCommand: `action.${i}`,
      isDefault: true,
      isUnbound: false,
      filePath: '',
      origin: 'cheatsheet' as const,
    }));

    const { result } = renderHook(() =>
      useSearch(manyShortcuts, testCommands, testSources),
    );

    act(() => {
      result.current.setQuery('Action');
    });

    expect(result.current.results.shortcuts.length).toBeLessThanOrEqual(8);
    expect(result.current.results.totalShortcuts).toBeGreaterThan(8);
  });

  it('in command prefix mode with > prefix, returns only commands', () => {
    const { result } = renderHook(() =>
      useSearch(testShortcuts, testCommands, testSources),
    );

    act(() => {
      result.current.setQuery('>git');
    });

    expect(result.current.results.commands.length).toBeGreaterThan(0);
    expect(result.current.results.shortcuts).toEqual([]);
    expect(result.current.results.sources).toEqual([]);
    expect(result.current.results.totalShortcuts).toBe(0);
  });

  it('updates results when query changes', () => {
    const { result } = renderHook(() =>
      useSearch(testShortcuts, testCommands, testSources),
    );

    act(() => {
      result.current.setQuery('Copy');
    });

    const firstResults = result.current.results.shortcuts;
    expect(firstResults.some((s) => s.command === 'Copy')).toBe(true);

    act(() => {
      result.current.setQuery('Paste');
    });

    const secondResults = result.current.results.shortcuts;
    expect(secondResults.some((s) => s.command === 'Paste')).toBe(true);
    expect(secondResults.some((s) => s.command === 'Copy')).toBe(false);
  });
});
