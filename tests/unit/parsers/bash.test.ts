import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BashParser, parseReadlineBinding } from '../../../src/main/parsers/bash.parser';
import * as shellDefaults from '../../../src/main/parsers/shell-defaults';
import { FIXTURES, rows } from './parser-helpers';

const INPUTRC = join(FIXTURES, 'inputrc');
const BASHRC = join(FIXTURES, 'bashrc');
/** Real `bash --norc --noprofile -i -c 'bind -p'` output of /bin/bash 3.2.57 (macOS), INPUTRC=/dev/null. */
const DEFAULTS = readFileSync(join(FIXTURES, 'bash-bind-defaults.txt'), 'utf-8');

/** BashParser with bash itself stubbed out (hermetic). */
class StubBash extends BashParser {
  constructor(private defaults: string | null = null) {
    super();
  }
  protected async loadDefaults(): Promise<string | null> {
    return this.defaults;
  }
}

describe('BashParser', () => {
  let parser: BashParser;

  beforeEach(() => {
    parser = new StubBash();
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('bash');
    expect(parser.meta.label).toBe('Bash');
  });

  it('parses every .inputrc binding with exact key, function and keymap', async () => {
    parser.setConfigPaths([INPUTRC]);
    expect(rows(await parser.parse())).toEqual([
      ['⌃A', 'Beginning of line', 'emacs', false],
      ['⌃E', 'End of line', 'emacs', false],
      ['⌃K', 'Kill line', 'emacs', false],
      ['⌃U', 'Unix line discard', 'emacs', false],
      ['↑', 'History search backward', 'emacs', false],
      ['↓', 'History search forward', 'emacs', false],
      ['⌃R', 'Reverse search history', 'emacs', false],
      ['⌥F', 'Forward word', 'emacs', false],
      ['⌥B', 'Backward word', 'emacs', false],
      ['⌃X ⌃E', 'Edit and execute command', 'emacs', false],
      ['⌃W', 'Backward kill word', 'emacs', false],
      ['⌥Backspace', 'Backward kill word', 'emacs', false],
      ['Tab', 'Menu complete', 'emacs', false],
      ['⌃X Q', 'Type “exit\\n”', 'emacs', false],
      ['J K', 'Vi movement mode', 'vi-insert', false],
    ]);
  });

  it('parses every .bashrc bind with exact key and command', async () => {
    parser.setConfigPaths([BASHRC]);
    expect(rows(await parser.parse())).toEqual([
      ['⌃L', 'Clear screen', null, false],
      ['⌃P', 'History search backward', null, false],
      ['⌃G', 'Run: git status', null, false],
      ['⌃T', 'Run: tmux new-session', null, false],
      ['⌃A', 'Beginning of line', 'vi-insert', false],
      ['⌃S', 'Unbind', null, true],
    ]);
  });

  it('combines results from both files with unique IDs', async () => {
    parser.setConfigPaths([INPUTRC, BASHRC]);
    const result = await parser.parse();
    expect(result).toHaveLength(21);
    expect(new Set(result.map((kb) => kb.id)).size).toBe(result.length);
  });

  it('returns empty for missing file or no paths', async () => {
    parser.setConfigPaths(['/tmp/nonexistent-inputrc']);
    expect(await parser.parse()).toEqual([]);
    parser.setConfigPaths([]);
    expect(await parser.parse()).toEqual([]);
  });

  it('is available with no config file when bash is on PATH', async () => {
    const find = vi.spyOn(shellDefaults, 'findOnPath');
    try {
      parser.setConfigPaths([]);
      find.mockResolvedValueOnce('/bin/bash');
      expect(await parser.isAvailable()).toBe(true);
      find.mockResolvedValueOnce(null);
      expect(await parser.isAvailable()).toBe(false);
      expect(find).toHaveBeenCalledWith('bash');
    } finally {
      find.mockRestore();
    }
  });
});

describe('BashParser defaults (bind -p)', () => {
  it('lists every bound emacs function with exact key and name', () => {
    const result = new BashParser().parseDefaults(DEFAULTS);
    expect(result.every((s) => s.isDefault && s.origin === 'app-defaults' && s.filePath === 'bash bind -p')).toBe(true);
    // 454 lines minus "not bound", self-insert, do-lowercase-version,
    // digit-argument and keys listed twice (\M-OA and \M-[A are both ↑;
    // ⌥. is insert-last-argument and its alias yank-last-arg)
    expect(rows(result)).toEqual([
      ["⌃G", "Abort", null, false],
      ["⌃X ⌃G", "Abort", null, false],
      ["⌃⌥G", "Abort", null, false],
      ["⌃J", "Accept line", null, false],
      ["Return", "Accept line", null, false],
      ["⌃B", "Backward char", null, false],
      ["←", "Backward char", null, false],
      ["⌃H", "Backward delete char", null, false],
      ["Backspace", "Backward delete char", null, false],
      ["⌃X Backspace", "Backward kill line", null, false],
      ["⌃⌥H", "Backward kill word", null, false],
      ["⌥Backspace", "Backward kill word", null, false],
      ["⌥B", "Backward word", null, false],
      ["⌥<", "Beginning of history", null, false],
      ["⌃A", "Beginning of line", null, false],
      ["Home", "Beginning of line", null, false],
      ["⌃X E", "Call last kbd macro", null, false],
      ["⌥C", "Capitalize word", null, false],
      ["⌃]", "Character search", null, false],
      ["⌃⌥]", "Character search backward", null, false],
      ["⌃L", "Clear screen", null, false],
      ["Tab", "Complete", null, false],
      ["⌥Escape", "Complete", null, false],
      ["⌥!", "Complete command", null, false],
      ["⌥/", "Complete filename", null, false],
      ["⌥@", "Complete hostname", null, false],
      ["⌥{", "Complete into braces", null, false],
      ["⌥~", "Complete username", null, false],
      ["⌥$", "Complete variable", null, false],
      ["⌃D", "Delete char", null, false],
      ["⌥\\", "Delete horizontal space", null, false],
      ["⌃X ⌃V", "Display shell version", null, false],
      ["⌥L", "Downcase word", null, false],
      ["⌥Tab", "Dynamic complete history", null, false],
      ["⌃X ⌃E", "Edit and execute command", null, false],
      ["⌃X )", "End kbd macro", null, false],
      ["⌥>", "End of history", null, false],
      ["⌃E", "End of line", null, false],
      ["End", "End of line", null, false],
      ["⌃X ⌃X", "Exchange point and mark", null, false],
      ["⌃F", "Forward char", null, false],
      ["→", "Forward char", null, false],
      ["⌃S", "Forward search history", null, false],
      ["⌥F", "Forward word", null, false],
      ["⌥G", "Glob complete word", null, false],
      ["⌃X *", "Glob expand word", null, false],
      ["⌃X G", "Glob list expansions", null, false],
      ["⌥^", "History expand line", null, false],
      ["⌥#", "Insert comment", null, false],
      ["⌥*", "Insert completions", null, false],
      ["⌥.", "Insert last argument", null, false],
      ["⌥_", "Insert last argument", null, false],
      ["⌃K", "Kill line", null, false],
      ["⌥D", "Kill word", null, false],
      ["⌃N", "Next history", null, false],
      ["↓", "Next history", null, false],
      ["⌥N", "Non incremental forward search history", null, false],
      ["⌥P", "Non incremental reverse search history", null, false],
      ["⌃O", "Operate and get next", null, false],
      ["⌃X !", "Possible command completions", null, false],
      ["⌥=", "Possible completions", null, false],
      ["⌥?", "Possible completions", null, false],
      ["⌃X /", "Possible filename completions", null, false],
      ["⌃X @", "Possible hostname completions", null, false],
      ["⌃X ~", "Possible username completions", null, false],
      ["⌃X $", "Possible variable completions", null, false],
      ["⌃P", "Previous history", null, false],
      ["↑", "Previous history", null, false],
      ["⌃Q", "Quoted insert", null, false],
      ["⌃V", "Quoted insert", null, false],
      ["⌃X ⌃R", "Re read init file", null, false],
      ["⌃R", "Reverse search history", null, false],
      ["⌃⌥R", "Revert line", null, false],
      ["⌥R", "Revert line", null, false],
      ["⌃Space", "Set mark", null, false],
      ["⌥Space", "Set mark", null, false],
      ["⌃⌥E", "Shell expand line", null, false],
      ["⌃X (", "Start kbd macro", null, false],
      ["⌥&", "Tilde expand", null, false],
      ["⌃T", "Transpose chars", null, false],
      ["⌥T", "Transpose words", null, false],
      ["⌃X ⌃U", "Undo", null, false],
      ["⌃_", "Undo", null, false],
      ["⌃U", "Unix line discard", null, false],
      ["⌃W", "Unix word rubout", null, false],
      ["⌥U", "Upcase word", null, false],
      ["⌃Y", "Yank", null, false],
      ["⌃⌥Y", "Yank nth arg", null, false],
      ["⌥Y", "Yank pop", null, false],
    ]);
  });

  it('merges .inputrc and .bashrc over the defaults', async () => {
    const p = new StubBash(DEFAULTS);
    p.setConfigPaths([INPUTRC, BASHRC]);
    const result = await p.parse();
    const emacs = (key: string) => result.filter((s) => s.key === key && (!s.context || s.context === 'emacs'));

    // the .inputrc (emacs) and .bashrc binds replace the default of the same key
    expect(emacs('↑')).toEqual([expect.objectContaining({ command: 'History search backward', isDefault: false })]);
    expect(emacs('⌃P')).toEqual([expect.objectContaining({ command: 'History search backward', isDefault: false })]);
    expect(emacs('⌃G')).toEqual([expect.objectContaining({ command: 'Run: git status' })]);
    // bind -r marks the default unbound
    expect(emacs('⌃S')).toEqual([expect.objectContaining({
      command: 'Forward search history', isUnbound: true, isDefault: false, filePath: BASHRC,
    })]);
    expect(emacs('⌃A')).toEqual([expect.objectContaining({ command: 'Beginning of line', isDefault: false })]);
    expect(emacs('⌥.')).toEqual([expect.objectContaining({ command: 'Insert last argument', isDefault: true })]);
    // vi-insert binds are separate; ⌃X Q is new
    expect(result.filter((s) => s.context === 'vi-insert')).toHaveLength(2);
    expect(emacs('⌃X Q')).toHaveLength(1);
    // 89 defaults + ⌃X Q, J K and ⌃A in vi-insert
    expect(result).toHaveLength(89 + 3);
    expect(new Set(result.map((s) => s.id)).size).toBe(result.length);
  });
});

describe('parseReadlineBinding', () => {
  it('parses quoted sequences, symbolic names and macros', () => {
    expect(parseReadlineBinding('"\\C-x\\C-r": re-read-init-file')?.key.displayKey).toBe('⌃X ⌃R');
    expect(parseReadlineBinding('C-u: kill-whole-line')?.key.displayKey).toBe('⌃U');
    expect(parseReadlineBinding('Meta-DEL: backward-kill-word')?.key.displayKey).toBe('⌥Backspace');
    expect(parseReadlineBinding('Control-Space: set-mark')?.key.displayKey).toBe('⌃Space');
    expect(parseReadlineBinding('"\\e[1;5C": forward-word')?.key.displayKey).toBe('⌃→');
    expect(parseReadlineBinding('"\\C-xq": "exit"')).toMatchObject({ value: 'exit', isMacro: true });
    expect(parseReadlineBinding('set bell-style none')).toBeNull();
  });
});
