import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPlatform } from '../../helpers';

interface FakeTray {
  destroy: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  setContextMenu: ReturnType<typeof vi.fn>;
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
  Menu: { buildFromTemplate: vi.fn((template: unknown) => template) },
  nativeImage: { createFromPath: (p: string) => createFromPath(p) },
  app: { isPackaged: false, getAppPath: () => '/app', quit: vi.fn() },
}));

const { syncTray, destroyTray, isTrayVisible, setTrayUpdate } = await import('../../../src/main/tray');

const callbacks = { onToggle: vi.fn(), onPreferences: vi.fn(), onInstallUpdate: vi.fn() };

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

describe('tray update item', () => {
  const labels = () =>
    (trays[0].setContextMenu.mock.lastCall?.[0] as { label?: string }[]).map((i) => i.label);

  it('offers the newer release, then a restart once it is downloaded', () => {
    freshTray();
    expect(labels()[0]).toBe('Show/Hide');

    setTrayUpdate({ current: '0.1.0', state: 'available', version: '0.2.0' });
    expect(labels()[0]).toBe('Update Available (v0.2.0)...');

    setTrayUpdate({ current: '0.1.0', state: 'ready', version: '0.2.0' });
    const item = (trays[0].setContextMenu.mock.lastCall?.[0] as { label?: string; click?: () => void }[])[0];
    expect(item?.label).toBe('Restart to Update');
    item?.click?.();
    expect(callbacks.onInstallUpdate).toHaveBeenCalled();
  });

  it('shows nothing while checking or up to date', () => {
    setTrayUpdate({ current: '0.1.0', state: 'up-to-date' });
    freshTray();
    expect(labels()[0]).toBe('Show/Hide');
  });
});
