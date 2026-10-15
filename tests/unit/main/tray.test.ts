import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPlatform } from '../../helpers';

interface FakeTray {
  destroy: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}
const trays: FakeTray[] = [];
const createFromPath = vi.fn<(path: string) => object>(() => ({}));

vi.mock('electron', () => ({
  Tray: vi.fn(function (this: Record<string, unknown>) {
    this.setToolTip = vi.fn();
    this.setContextMenu = vi.fn();
    this.destroy = vi.fn();
    this.on = vi.fn();
    trays.push(this as unknown as FakeTray);
  }),
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  nativeImage: { createFromPath: (p: string) => createFromPath(p) },
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

function freshTray() {
  destroyTray();
  trays.length = 0;
  createFromPath.mockClear();
  syncTray(true, callbacks);
}

describe('tray on macOS', () => {
  withPlatform('darwin');

  it('uses the template image; a click opens the menu', () => {
    freshTray();
    expect(createFromPath.mock.calls[0][0]).toMatch(/tray-iconTemplate\.png$/);
    expect(trays[0].on).not.toHaveBeenCalled();
  });
});

describe('tray on Windows', () => {
  withPlatform('win32');

  it('uses the colour app icon; left-click toggles the launcher', () => {
    freshTray();
    expect(createFromPath.mock.calls[0][0]).toMatch(/icon\.ico$/);
    expect(trays[0].on).toHaveBeenCalledWith('click', callbacks.onToggle);
  });
});

describe('tray on Linux', () => {
  withPlatform('linux');

  it('uses the colour app icon as PNG', () => {
    freshTray();
    expect(createFromPath.mock.calls[0][0]).toMatch(/icon\.png$/);
  });
});
