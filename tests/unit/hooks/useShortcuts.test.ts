// @vitest-environment jsdom
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Shortcut, ParserMeta } from '@shared/types';
import type { ElectronAPI } from '../../../src/preload/preload';
import { useShortcuts } from '../../../src/renderer/hooks/useShortcuts';

const mockSources: ParserMeta[] = [
  { id: 'vscode', label: 'VS Code', icon: '📝', platforms: ['darwin'] },
];

const mockShortcuts: Shortcut[] = [
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
];

beforeEach(() => {
  window.electronAPI = {
    getSources: vi.fn().mockResolvedValue(mockSources),
    getAllKeybindings: vi.fn().mockResolvedValue(mockShortcuts),
    refreshKeybindings: vi.fn().mockResolvedValue(mockShortcuts),
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

describe('useShortcuts', () => {
  it('initially returns loading=true, then loads data and sets loading=false', async () => {
    const { result } = renderHook(() => useShortcuts());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.shortcuts).toEqual(mockShortcuts);
    expect(result.current.sources).toEqual(mockSources);
  });

  it('fetches sources and keybindings on mount', async () => {
    const api = window.electronAPI;
    renderHook(() => useShortcuts());

    await waitFor(() => {
      expect(api.getSources).toHaveBeenCalledOnce();
      expect(api.getAllKeybindings).toHaveBeenCalledOnce();
    });
  });

  it('calls refresh to reload keybindings', async () => {
    const api = window.electronAPI;
    const updatedShortcuts: Shortcut[] = [
      ...mockShortcuts,
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
    ];
    (api.refreshKeybindings as ReturnType<typeof vi.fn>).mockResolvedValue(updatedShortcuts);

    const { result } = renderHook(() => useShortcuts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect((api.refreshKeybindings as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect(result.current.shortcuts).toEqual(updatedShortcuts);
  });

  it('cleans up event listeners on unmount', async () => {
    const unsubUpdate = vi.fn();
    const unsubShown = vi.fn();
    const api = window.electronAPI;
    api.onKeybindingsUpdate.mockReturnValue(unsubUpdate);
    api.onWindowShown.mockReturnValue(unsubShown);

    const { unmount } = renderHook(() => useShortcuts());

    await waitFor(() => {
      expect(api.onKeybindingsUpdate).toHaveBeenCalledOnce();
    });

    unmount();

    expect(unsubUpdate).toHaveBeenCalledOnce();
    expect(unsubShown).toHaveBeenCalledOnce();
  });
});
