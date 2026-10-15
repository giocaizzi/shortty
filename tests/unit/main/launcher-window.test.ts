import { describe, it, expect, vi } from 'vitest';
import { focusLauncher, launcherMaterial } from '../../../src/main/launcher-window';

describe('launcherMaterial', () => {
  it('keeps the macOS vibrancy', () => {
    expect(launcherMaterial('darwin', '25.6.0')).toEqual({ vibrancy: 'under-window', visualEffectState: 'active' });
  });

  it('uses acrylic from Windows 11 22H2 (build 22621) on', () => {
    expect(launcherMaterial('win32', '10.0.22621')).toEqual({ backgroundMaterial: 'acrylic' });
    expect(launcherMaterial('win32', '10.0.26100')).toEqual({ backgroundMaterial: 'acrylic' });
  });

  it('has no material on older Windows and on Linux', () => {
    expect(launcherMaterial('win32', '10.0.22000')).toBeNull();
    expect(launcherMaterial('win32', '10.0.19045')).toBeNull();
    expect(launcherMaterial('linux', '6.8.0')).toBeNull();
  });
});

describe('focusLauncher', () => {
  function fakeWindow() {
    return { moveTop: vi.fn(), focus: vi.fn(), webContents: { focus: vi.fn() } };
  }

  it('activates the app on macOS, then focuses the launcher', () => {
    const win = fakeWindow();
    const activate = vi.fn();
    focusLauncher(win as never, 'darwin', activate);
    expect(activate).toHaveBeenCalledOnce();
    expect(win.moveTop).not.toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalledOnce();
    expect(win.webContents.focus).toHaveBeenCalledOnce();
  });

  it('raises the launcher itself on Windows instead of app.focus()', () => {
    const win = fakeWindow();
    const activate = vi.fn();
    focusLauncher(win as never, 'win32', activate);
    expect(activate).not.toHaveBeenCalled();
    expect(win.moveTop).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
    expect(win.webContents.focus).toHaveBeenCalledOnce();
  });
});
