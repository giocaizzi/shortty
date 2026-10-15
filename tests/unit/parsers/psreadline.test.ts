import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Shortcut } from '../../../src/shared/types';
import { PsReadLineParser, normalizeChord, parseHandlerJson } from '../../../src/main/parsers/psreadline.parser';
import { FIXTURES } from './parser-helpers';

const PROFILE = join(FIXTURES, 'psreadline-profile.ps1');
/** `Get-PSReadLineKeyHandler -Bound | … | ConvertTo-Json -Compress` output, with a host warning before it. */
const HANDLERS = readFileSync(join(FIXTURES, 'psreadline-key-handlers.json'), 'utf-8');

/** PsReadLineParser with PowerShell itself stubbed out (hermetic, any OS). */
class StubPwsh extends PsReadLineParser {
  calls: (string | null)[] = [];
  constructor(private output: string | null) {
    super();
  }
  protected async loadDefaults(editMode: string | null): Promise<string | null> {
    this.calls.push(editMode);
    return this.output;
  }
}

/** Keys as structured strokes, independent of how the platform displays them. */
const strokes = (s: Shortcut) => (s.strokes ?? []).map((st) => [...st.mods, st.key].join('+')).join(' ');
const view = (list: Shortcut[]) => list.map((s) => [strokes(s), s.rawCommand, s.command, s.origin, s.isUnbound]);

describe('PsReadLineParser', () => {
  let parser: StubPwsh;

  beforeEach(() => {
    parser = new StubPwsh(HANDLERS);
    parser.setConfigPaths([PROFILE]);
  });

  it('has correct metadata', () => {
    expect(parser.meta).toMatchObject({ id: 'psreadline', label: 'PowerShell', platforms: ['win32'] });
  });

  it('merges the profile onto the PowerShell defaults of its edit mode', async () => {
    const result = await parser.parse();
    expect(parser.calls).toEqual(['Emacs']);
    expect(view(result)).toEqual([
      ['Return', 'AcceptLine', 'Accept line', 'app-defaults', false],
      ['shift+Return', 'AddLine', 'Add line', 'app-defaults', false],
      ['ctrl+shift+C', 'Copy', 'Copy', 'app-defaults', false],
      ['ctrl+C', 'CopyOrCancelLine', 'Copy or cancel line', 'app-defaults', false],
      ['ctrl+D', 'DeleteChar', 'Delete char', 'user-config', false],
      ['ctrl+R', 'ReverseSearchHistory', 'Reverse search history', 'user-config', true],
      ['↑', 'PreviousHistory', 'Previous history', 'app-defaults', false],
      ['ctrl+shift+←', 'SelectBackwardWord', 'Select backward word', 'app-defaults', false],
      ['ctrl+X ctrl+E', 'ViEditVisually', 'Vi edit visually', 'app-defaults', false],
      ['Escape Backspace', 'BackwardKillWord', 'Backward kill word', 'app-defaults', false],
      ['opt+,', 'YankLastArg', 'Yank last arg', 'app-defaults', false],
      ['ctrl+opt+?', 'ShowKeyBindings', 'Show key bindings', 'app-defaults', false],
      ['ctrl+Space', 'MenuComplete', 'Menu complete', 'app-defaults', false],
      ['Tab', 'MenuComplete', 'Menu complete', 'user-config', false],
      ['ctrl+↑', 'HistorySearchBackward', 'History search backward', 'user-config', false],
      ['ctrl+↓', 'HistorySearchBackward', 'History search backward', 'user-config', false],
      ['opt+W', 'SelectAll', 'Select all', 'user-config', false],
      ['ctrl+shift+B', 'ScriptBlock:BuildCurrentDirectory', 'Build current directory', 'user-config', false],
    ]);
    expect(result.find((s) => s.rawCommand === 'AcceptLine')?.category).toBe('Editing');
  });

  it('reads a CRLF profile like an LF one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shortty-psreadline-'));
    try {
      const crlf = join(dir, 'Microsoft.PowerShell_profile.ps1');
      writeFileSync(crlf, readFileSync(PROFILE, 'utf-8').replace(/\n/g, '\r\n'));
      const p = new StubPwsh(HANDLERS);
      p.setConfigPaths([crlf]);
      const strip = (l: Shortcut[]) => l.map((s) => ({ ...s, filePath: '', id: '' }));
      expect(strip(await p.parse())).toEqual(strip(await parser.parse()));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to the bundled Windows-mode defaults when PowerShell cannot run', async () => {
    const p = new StubPwsh(null);
    const result = await p.parse();
    expect(p.calls).toEqual([null]);
    expect(result.length).toBeGreaterThan(50);
    expect(result.every((s) => s.origin === 'app-defaults' && s.isDefault)).toBe(true);
    const tab = result.find((s) => strokes(s) === 'Tab');
    expect(tab).toMatchObject({ rawCommand: 'TabCompleteNext', category: 'Completion' });
    expect(new Set(result.map((s) => s.id)).size).toBe(result.length);
  });

  it('reads a single handler and ignores non-JSON output', () => {
    expect(parseHandlerJson('{"Key":"Tab","Function":"Complete"}')).toEqual([{ Key: 'Tab', Function: 'Complete' }]);
    expect(parseHandlerJson('Get-PSReadLineKeyHandler: not recognized')).toBeNull();
  });

  it('parses chords: upper-case letters mean Shift, commas separate sequences', () => {
    const s = (chord: string) => normalizeChord(chord).strokes;
    expect(s('Ctrl+C')).toEqual([{ mods: ['ctrl', 'shift'], key: 'C' }]);
    expect(s('Ctrl+c')).toEqual([{ mods: ['ctrl'], key: 'C' }]);
    expect(s('Alt+F7')).toEqual([{ mods: ['opt'], key: 'F7' }]);
    expect(s('Ctrl+x,Ctrl+e')).toEqual([{ mods: ['ctrl'], key: 'X' }, { mods: ['ctrl'], key: 'E' }]);
    expect(s('Alt+,')).toEqual([{ mods: ['opt'], key: ',' }]);
    expect(s('Ctrl+Shift+a')).toEqual([{ mods: ['ctrl', 'shift'], key: 'A' }]);
  });
});
