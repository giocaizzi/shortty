// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SubcommandDetail } from '@shared/types';
import type { ElectronAPI } from '../../../src/preload/preload';
import { useSubcommandDetail } from '../../../src/renderer/hooks/useSubcommandDetail';

function detailFor(name: string): SubcommandDetail {
  return { name, description: `${name} help`, enrichment: 'full', subcommands: [], flags: [] } as SubcommandDetail;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let pending: Map<string, Deferred<SubcommandDetail>>;

beforeEach(() => {
  pending = new Map();
  window.electronAPI = {
    getSubcommandDetail: vi.fn((name: string) => {
      const d = deferred<SubcommandDetail>();
      pending.set(name, d);
      return d.promise;
    }),
  } as unknown as ElectronAPI;
});

afterEach(() => {
  window.electronAPI = undefined as unknown as ElectronAPI;
});

describe('useSubcommandDetail', () => {
  it('loads the detail for the requested name', async () => {
    const { result } = renderHook(() => useSubcommandDetail('docker image'));
    expect(result.current.loading).toBe(true);
    expect(result.current.detail).toBeNull();

    await act(async () => { pending.get('docker image')!.resolve(detailFor('docker image')); });

    expect(result.current.loading).toBe(false);
    expect(result.current.detail?.name).toBe('docker image');
  });

  it('ignores a late response for a subcommand the user already left', async () => {
    const { result, rerender } = renderHook(
      ({ name }: { name: string | null }) => useSubcommandDetail(name),
      { initialProps: { name: 'docker compose' as string | null } },
    );
    rerender({ name: null });
    rerender({ name: 'docker image' });

    await act(async () => { pending.get('docker image')!.resolve(detailFor('docker image')); });
    expect(result.current.detail?.name).toBe('docker image');

    // The slow compose --help finishes last: it must not replace the view.
    await act(async () => { pending.get('docker compose')!.resolve(detailFor('docker compose')); });
    expect(result.current.detail?.name).toBe('docker image');
    expect(result.current.loading).toBe(false);
  });

  it('stays loading while only a stale response has arrived', async () => {
    const { result, rerender } = renderHook(
      ({ name }: { name: string | null }) => useSubcommandDetail(name),
      { initialProps: { name: 'docker compose' as string | null } },
    );
    rerender({ name: 'docker image' });

    await act(async () => { pending.get('docker compose')!.resolve(detailFor('docker compose')); });
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('ignores a late error for a subcommand the user already left', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, rerender } = renderHook(
      ({ name }: { name: string | null }) => useSubcommandDetail(name),
      { initialProps: { name: 'docker compose' as string | null } },
    );
    rerender({ name: 'docker image' });
    await act(async () => { pending.get('docker image')!.resolve(detailFor('docker image')); });
    await act(async () => { pending.get('docker compose')!.reject(new Error('timeout')); });

    expect(result.current.error).toBeNull();
    expect(result.current.detail?.name).toBe('docker image');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports an error for the current name', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSubcommandDetail('docker image'));
    await act(async () => { pending.get('docker image')!.reject(new Error('boom')); });

    expect(result.current.error).toBe('boom');
    expect(result.current.loading).toBe(false);
    spy.mockRestore();
  });

  it('is idle without a name', () => {
    const { result } = renderHook(() => useSubcommandDetail(null));
    expect(result.current).toEqual({ detail: null, loading: false, error: null });
  });
});
