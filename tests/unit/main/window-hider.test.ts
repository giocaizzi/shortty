import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WindowHider } from '../../../src/main/window-hider';

describe('WindowHider', () => {
  let requestExit: ReturnType<typeof vi.fn<(id: number) => void>>;
  let hide: ReturnType<typeof vi.fn<() => void>>;
  let hider: WindowHider;

  beforeEach(() => {
    vi.useFakeTimers();
    requestExit = vi.fn<(id: number) => void>();
    hide = vi.fn<() => void>();
    hider = new WindowHider({ requestExit, hide, timeoutMs: 120 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the renderer to animate out and hides on its ack', () => {
    hider.hide();
    expect(requestExit).toHaveBeenCalledWith(1);
    expect(hide).not.toHaveBeenCalled();
    expect(hider.hiding).toBe(true);

    hider.ack(1);
    expect(hide).toHaveBeenCalledOnce();
    expect(hider.hiding).toBe(false);

    vi.advanceTimersByTime(500);
    expect(hide).toHaveBeenCalledOnce();
  });

  it('hides after the timeout when the renderer never answers', () => {
    hider.hide();
    vi.advanceTimersByTime(119);
    expect(hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hide).toHaveBeenCalledOnce();
  });

  it('ignores repeated hide requests while one is pending', () => {
    hider.hide();
    hider.hide();
    expect(requestExit).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(200);
    expect(hide).toHaveBeenCalledOnce();
  });

  it('cancel() (window shown again) aborts the pending hide', () => {
    hider.hide();
    hider.cancel();
    hider.ack(1);
    vi.advanceTimersByTime(500);
    expect(hide).not.toHaveBeenCalled();
    expect(hider.hiding).toBe(false);
  });

  it('ignores a stale ack from an earlier, cancelled request', () => {
    hider.hide(); // id 1
    hider.cancel();
    hider.hide(); // id 2
    hider.ack(1);
    expect(hide).not.toHaveBeenCalled();
    hider.ack(2);
    expect(hide).toHaveBeenCalledOnce();
  });
});
