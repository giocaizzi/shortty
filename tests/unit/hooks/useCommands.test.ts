// @vitest-environment jsdom
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Command } from '@shared/types';
import type { ElectronAPI } from '../../../src/preload/preload';
import { useCommands } from '../../../src/renderer/hooks/useCommands';

const mockCommands: Command[] = [
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
];

const mockStats = { total: 10, enriched: 5, running: false };

beforeEach(() => {
  window.electronAPI = {
    getSources: vi.fn().mockResolvedValue([]),
    getAllKeybindings: vi.fn().mockResolvedValue([]),
    refreshKeybindings: vi.fn().mockResolvedValue([]),
    onKeybindingsUpdate: vi.fn(() => vi.fn()),
    onWindowShown: vi.fn(() => vi.fn()),
    getAllCommands: vi.fn().mockResolvedValue(mockCommands),
    getCommandsStats: vi.fn().mockResolvedValue(mockStats),
    onCommandsUpdate: vi.fn(() => vi.fn()),
    refreshCommands: vi.fn().mockResolvedValue(mockCommands),
  } as unknown as ElectronAPI;
});

afterEach(() => {
  window.electronAPI = undefined as unknown as ElectronAPI;
});

describe('useCommands', () => {
  it('initially returns loading=true and empty commands', () => {
    const { result } = renderHook(() => useCommands());

    // On the very first render, loading is true and commands empty
    expect(result.current.loading).toBe(true);
    expect(result.current.commands).toEqual([]);
  });

  it('fetches commands and stats on mount', async () => {
    const api = vi.mocked(window.electronAPI);
    const { result } = renderHook(() => useCommands());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.getAllCommands).toHaveBeenCalledOnce();
    expect(api.getCommandsStats).toHaveBeenCalledOnce();
    expect(result.current.commands).toEqual(mockCommands);
    expect(result.current.stats).toEqual(mockStats);
  });

  it('cleans up event listeners on unmount', async () => {
    const unsubUpdate = vi.fn();
    const unsubShown = vi.fn();
    const api = vi.mocked(window.electronAPI);
    api.onCommandsUpdate.mockReturnValue(unsubUpdate);
    api.onWindowShown.mockReturnValue(unsubShown);

    const { unmount } = renderHook(() => useCommands());

    await waitFor(() => {
      expect(api.onCommandsUpdate).toHaveBeenCalledOnce();
    });

    unmount();

    expect(unsubUpdate).toHaveBeenCalledOnce();
    expect(unsubShown).toHaveBeenCalledOnce();
  });

  it('stats have correct initial values', () => {
    const { result } = renderHook(() => useCommands());

    expect(result.current.stats).toEqual({
      total: 0,
      enriched: 0,
      running: false,
    });
  });

  it('reloads the index on show only when its size changed', async () => {
    const api = vi.mocked(window.electronAPI);
    let shown: () => void = () => undefined;
    api.onWindowShown.mockImplementation((cb: () => void) => {
      shown = cb;
      return vi.fn();
    });
    api.getCommandsStats.mockResolvedValue({ ...mockStats, total: mockCommands.length });
    const { result } = renderHook(() => useCommands());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => shown());
    expect(api.getAllCommands).toHaveBeenCalledOnce();

    api.getCommandsStats.mockResolvedValue({ ...mockStats, total: mockCommands.length + 1 });
    await act(async () => shown());
    await waitFor(() => expect(api.getAllCommands).toHaveBeenCalledTimes(2));
  });

  it('adds commands that arrive in an update batch', async () => {
    const api = vi.mocked(window.electronAPI);
    let push: (batch: Command[]) => void = () => undefined;
    api.onCommandsUpdate.mockImplementation((cb: (batch: Command[]) => void) => {
      push = cb;
      return vi.fn();
    });
    const { result } = renderHook(() => useCommands());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const extra = { ...mockCommands[0], name: 'brand-new-tool' };
    act(() => push([extra]));
    expect(result.current.commands.map((c) => c.name)).toContain('brand-new-tool');
    expect(result.current.commands).toHaveLength(mockCommands.length + 1);
  });
});
