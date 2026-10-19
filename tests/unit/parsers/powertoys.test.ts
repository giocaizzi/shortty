import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Shortcut } from '../../../src/shared/types';
import { PowerToysParser } from '../../../src/main/parsers/powertoys.parser';
import { POWERTOYS_HOTKEYS } from '../../../src/main/parsers/data/powertoys-hotkeys';
import { FIXTURES } from './parser-helpers';

const ROOT = join(FIXTURES, 'powertoys');
const CHEATSHEET = JSON.parse(readFileSync(
  join(__dirname, '../../../src/cheatsheets/sources/powertoys.json'), 'utf-8',
));
const PATHS = CHEATSHEET.defaultPaths.win32.map((p: string) =>
  p.replace('%LOCALAPPDATA%/Microsoft/PowerToys', ROOT));

/** Keys as structured strokes, independent of how the platform displays them. */
const view = (s: Shortcut[]) => s.map((k) => [
  k.rawCommand, k.command, (k.strokes ?? []).map((st) => [...st.mods, st.key].join('+')).join(' '),
  k.context ?? null, k.isUnbound,
]);

describe('PowerToysParser', () => {
  let parser: PowerToysParser;

  beforeEach(() => {
    parser = new PowerToysParser();
    parser.setConfigPaths(PATHS);
  });

  it('has correct metadata', () => {
    expect(parser.meta).toMatchObject({ id: 'powertoys', platforms: ['win32'] });
  });

  it('lists changed, cleared, extra and turned-off hotkeys and Keyboard Manager remaps', async () => {
    expect(view(await parser.parse())).toEqual([
      ['AdvancedPaste.paste-as-markdown-hotkey', 'Advanced Paste: Paste As Markdown', 'ctrl+cmd+M', null, false],
      ['AdvancedPaste.custom-actions[0].shortcut', 'Translate to Italian', 'opt+cmd+I', null, false],
      ['FancyZones.fancyzones_editor_hotkey', 'Open FancyZones Editor', 'ctrl+cmd+`', null, false],
      ['FancyZones.fancyzones_prevTab_hotkey', 'Previous Window in Zone', '', null, true],
      ['Peek.ActivationShortcut', 'Peek at Selected File', 'ctrl+shift+Space', null, false],
      ['PowerToys Run.open_powerlauncher', 'Open PowerToys Run', 'ctrl+Space', null, false],
      ['KeyboardManager.remapKeys', 'Remapped to Ctrl', 'CapsLock', null, false],
      ['KeyboardManager.remapKeys', 'Disabled', 'ContextMenu', null, false],
      ['KeyboardManager.remapShortcuts', 'Remapped to Win+Shift+T', 'shift+cmd+S', null, false],
      ['KeyboardManager.remapShortcuts', 'Run notepad.exe', 'ctrl+opt+N', null, false],
      ['KeyboardManager.remapShortcuts', 'Open https://github.com', 'ctrl+opt+G', null, false],
      ['KeyboardManager.remapShortcuts', 'Remapped to Ctrl+F4', 'ctrl+W', 'msedge', false],
      ['KeyboardManager.remapShortcutsToText', 'Type “Kind regards”', 'ctrl+opt+S', null, false],
      // Peek is turned off in the general settings.json: unbound whatever its key
      ['Peek.ActivationShortcut', 'Peek at Selected File', '', null, true],
    ]);
  });

  it('keeps the physical key of an OEM virtual-key code', async () => {
    const editor = (await parser.parse()).find((s) => s.rawCommand === 'FancyZones.fancyzones_editor_hotkey');
    expect(editor?.strokes).toEqual([{ mods: ['ctrl', 'cmd'], key: '`', code: 'Backquote' }]);
    expect(editor?.key).toBeTruthy();
  });

  it('lists every hotkey of the bundled data in the cheatsheet', () => {
    expect(CHEATSHEET.shortcuts.map((s: { rawCommand: string; command: string; key: { win32: string } }) =>
      [s.rawCommand, s.command, s.key.win32]))
      .toEqual(Object.entries(POWERTOYS_HOTKEYS).map(([raw, h]) => [raw, h.command, h.key]));
  });

  it('returns empty for missing or malformed files', async () => {
    parser.setConfigPaths([join(ROOT, 'nonexistent.json'), join(FIXTURES, 'tmux.conf')]);
    expect(await parser.parse()).toEqual([]);
  });
});
