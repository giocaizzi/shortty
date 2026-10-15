import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

describe('tray per platform', () => {
  const platform = process.platform;
  const setPlatform = (value: NodeJS.Platform) => Object.defineProperty(process, 'platform', { value });

  beforeEach(() => {
    destroyTray();
    trays.length = 0;
    createFromPath.mockClear();
  });
  afterEach(() => setPlatform(platform));

  it('macOS: template image, the click opens the menu', () => {
    setPlatform('darwin');
    syncTray(true, callbacks);
    expect(createFromPath.mock.calls[0][0]).toMatch(/tray-iconTemplate\.png$/);
    expect(trays[0].on).not.toHaveBeenCalled();
  });

  it('Windows: colour app icon, left-click toggles the launcher', () => {
    setPlatform('win32');
    syncTray(true, callbacks);
    expect(createFromPath.mock.calls[0][0]).toMatch(/icon\.ico$/);
    expect(trays[0].on).toHaveBeenCalledWith('click', callbacks.onToggle);
  });

  it('Linux: colour app icon as PNG', () => {
    setPlatform('linux');
    syncTray(true, callbacks);
    expect(createFromPath.mock.calls[0][0]).toMatch(/icon\.png$/);
  });
});
