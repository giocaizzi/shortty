import { describe, it, expect, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { buildAppMenuTemplate } from '../../../src/main/app-menu';

function roles(template: MenuItemConstructorOptions[]): string[] {
  return template.flatMap((item) =>
    Array.isArray(item.submenu) ? item.submenu.flatMap((i) => (i.role ? [i.role] : [])) : [],
  );
}

const noop = () => {};

describe('buildAppMenuTemplate', () => {
  it('macOS app menu opens Settings with ⌘,', () => {
    const openSettings = vi.fn();
    const appMenu = buildAppMenuTemplate('Shortty', true, openSettings, 'darwin')[0];
    const item = (appMenu.submenu as MenuItemConstructorOptions[]).find((i) => i.label === 'Settings…');
    expect(item?.accelerator).toBe('CommandOrControl+,');
    (item?.click as () => void)();
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('packaged: no close, reload or devtools items (⌘W must not destroy the launcher)', () => {
    const r = roles(buildAppMenuTemplate('Shortty', true, noop, 'darwin'));
    expect(r).not.toContain('close');
    expect(r).not.toContain('reload');
    expect(r).not.toContain('forceReload');
    expect(r).not.toContain('toggleDevTools');
  });

  it('keeps the Edit roles text fields need', () => {
    const r = roles(buildAppMenuTemplate('Shortty', true, noop, 'darwin'));
    expect(r).toEqual(expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']));
  });

  it('macOS gets an app menu first; other platforms only Edit', () => {
    expect(buildAppMenuTemplate('Shortty', true, noop, 'darwin')[0].label).toBe('Shortty');
    expect(buildAppMenuTemplate('Shortty', true, noop, 'linux').map((m) => m.label)).toEqual(['Edit']);
  });

  it('unpackaged builds keep reload and devtools, still without close', () => {
    const r = roles(buildAppMenuTemplate('Shortty', false, noop, 'darwin'));
    expect(r).toContain('toggleDevTools');
    expect(r).toContain('reload');
    expect(r).not.toContain('close');
  });
});
