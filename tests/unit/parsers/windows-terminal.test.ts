import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Shortcut } from '../../../src/shared/types';
import { WindowsTerminalParser, commandKey } from '../../../src/main/parsers/windows-terminal.parser';
import { WT_DEFAULT_ACTIONS } from '../../../src/main/parsers/data/windows-terminal-actions';
import { FIXTURES } from './parser-helpers';

const FIXTURE_PATH = join(FIXTURES, 'windows-terminal-settings.json');

/** Keys as structured strokes, independent of how the platform displays them. */
const view = (s: Shortcut[]) => s.map((k) => [
  k.rawCommand, k.command, (k.strokes ?? []).map((st) => [...st.mods, st.key].join('+')).join(' '), k.isUnbound,
]);

describe('WindowsTerminalParser', () => {
  let parser: WindowsTerminalParser;

  beforeEach(() => {
    parser = new WindowsTerminalParser();
    parser.setConfigPaths([FIXTURE_PATH]);
  });

  it('has correct metadata', () => {
    expect(parser.meta).toMatchObject({ id: 'windows-terminal', platforms: ['win32'] });
  });

  it('parses legacy and split-format bindings, unbinds included', async () => {
    expect(view(await parser.parse())).toEqual([
      ['togglePaneZoom', 'Toggle Pane Zoom', 'ctrl+shift+Z', false],
      ['Terminal.OpenNewTabProfile0', 'New Tab (index: 0)', 'ctrl+opt+T', false],
      ['Terminal.OpenNewTabProfile0', 'New Tab (index: 0)', 'ctrl+shift+1', false],
      ['unbound', 'Unbound', 'opt+Return', true],
      ['unbound', 'Unbound', 'ctrl+shift+W', true],
      ['Terminal.CopyToClipboard', 'Copy (singleLine: false)', 'ctrl+C', false],
      ['Terminal.PasteFromClipboard', 'Paste', 'ctrl+V', false],
      ['User.splitPane.A6751878', 'Split vertically', 'opt+shift++', false],
      ['Terminal.OpenNewTab', 'New Tab', 'ctrl+T', false],
      ['Terminal.QuakeMode', 'Quake Mode', 'cmd+`', false],
      ['Terminal.ToggleFocusMode', 'Toggle Focus Mode', 'ctrl+shift+Numpad0', false],
      ['unbound', 'Unbound', 'ctrl+shift+F', true],
    ]);
  });

  it('keeps the physical key of a scan code', async () => {
    const quake = (await parser.parse()).find((s) => s.rawCommand === 'Terminal.QuakeMode');
    expect(quake?.strokes).toEqual([{ mods: ['cmd'], key: '`', code: 'Backquote' }]);
  });

  it('maps every bundled cheatsheet action to a known default command', () => {
    const cheatsheet = JSON.parse(readFileSync(
      join(__dirname, '../../../src/cheatsheets/sources/windows-terminal.json'), 'utf-8',
    ));
    expect(cheatsheet.shortcuts.map((s: { rawCommand: string }) => s.rawCommand).sort())
      .toEqual(Object.keys(WT_DEFAULT_ACTIONS).sort());
    expect(commandKey({ split: 'down', action: 'splitPane', splitMode: 'duplicate' }))
      .toBe('splitPane(split="down",splitMode="duplicate")');
  });

  it('returns empty for a missing or malformed file', async () => {
    parser.setConfigPaths([join(FIXTURES, 'nonexistent.json'), join(FIXTURES, 'tmux.conf')]);
    expect(await parser.parse()).toEqual([]);
  });
});
