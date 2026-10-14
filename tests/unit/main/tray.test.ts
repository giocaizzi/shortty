import { describe, it, expect, vi, beforeEach } from 'vitest';

const trays: { destroy: ReturnType<typeof vi.fn> }[] = [];

vi.mock('electron', () => ({
  Tray: vi.fn(function (this: Record<string, unknown>) {
    this.setToolTip = vi.fn();
    this.setContextMenu = vi.fn();
    this.destroy = vi.fn();
    trays.push(this as unknown as { destroy: ReturnType<typeof vi.fn> });
  }),
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  nativeImage: { createFromPath: vi.fn(() => ({})) },
  app: { isPackaged: false, getAppPath: () => '/app', quit: vi.fn() },
}));

const { syncTray, destroyTray, isTrayVisible } = await import('../../../src/main/tray');

const callbacks = { onToggle: vi.fn(), onPreferences: vi.fn() };

describe('syncTray (Show in Menu Bar)', () => {
  beforeEach(() => {
    destroyTray();
    trays.length = 0;
  });

  it('creates the tray when enabled, once', () => {
    syncTray(true, callbacks);
    syncTray(true, callbacks);
    expect(trays).toHaveLength(1);
    expect(isTrayVisible()).toBe(true);
  });

  it('destroys the tray when disabled and recreates it when re-enabled', () => {
    syncTray(true, callbacks);
    syncTray(false, callbacks);
    expect(trays[0].destroy).toHaveBeenCalledOnce();
    expect(isTrayVisible()).toBe(false);

    syncTray(true, callbacks);
    expect(trays).toHaveLength(2);
    expect(isTrayVisible()).toBe(true);
  });

  it('does not create a tray when disabled from the start', () => {
    syncTray(false, callbacks);
    expect(trays).toHaveLength(0);
    expect(isTrayVisible()).toBe(false);
  });
});
