import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZshParser, shellWords } from '../../../src/main/parsers/zsh.parser';
import { normalizeTerminalKey } from '../../../src/main/parsers/terminal-keys';
import { FIXTURES, rows } from './parser-helpers';

const FIXTURE_PATH = join(FIXTURES, 'zshrc');
/** Real `zsh -f -c 'bindkey -L'` output of zsh 5.9 (macOS). */
const EMACS_DEFAULTS = readFileSync(join(FIXTURES, 'zsh-bindkey-defaults.txt'), 'utf-8');
/** Real `zsh -f -c 'bindkey -L -M viins; bindkey -L -M vicmd'` output of zsh 5.9 (macOS). */
const VI_DEFAULTS = readFileSync(join(FIXTURES, 'zsh-bindkey-vi-defaults.txt'), 'utf-8');

/** ZshParser with zsh itself stubbed out (hermetic). */
class StubZsh extends ZshParser {
  calls: boolean[] = [];
  constructor(private defaults: string | null = null) {
    super();
  }
  protected async loadDefaults(viMode: boolean): Promise<string | null> {
    this.calls.push(viMode);
    if (this.defaults === null) return null;
    return viMode ? VI_DEFAULTS : this.defaults;
  }
}

describe('ZshParser', () => {
  let parser: ZshParser;

  beforeEach(() => {
    parser = new StubZsh();
    parser.setConfigPaths([FIXTURE_PATH]);
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('zsh');
    expect(parser.meta.label).toBe('Zsh');
  });

  it('parses every bindkey with exact key, widget, keymap and unbound flag', async () => {
    const result = await parser.parse();
    expect(rows(result)).toEqual([
      ['⌃R', 'History incremental search backward', null, false],
      ['⌃P', 'Up line or history', null, false],
      ['⌃N', 'Down line or history', null, false],
      ['↑', 'Up line or search', null, false],
      ['↓', 'Down line or search', null, false],
      ['K', 'Up line or history', 'vicmd', false],
      ['⌥B', 'Backward word', null, false],
      ['⌥F', 'Forward word', null, false],
      ['⌃→', 'Forward word', null, false],
      ['Delete', 'Delete char', null, false],
      ['⌥Backspace', 'Backward kill word', null, false],
      ['⌃X ⌃E', 'Edit command line', null, false],
      ['J K', 'Vi cmd mode', 'viins', false],
      ['⇧Tab', 'Reverse menu complete', 'menuselect', false],
      ['⌃U', 'Backward kill line', null, false],
      ['⌃G', 'Type “git status\\n”', null, false],
      ['⌃S', 'Unbind', null, true],
    ]);
  });

  it('skips keymap selection (bindkey -e) and parameter expansions', async () => {
    const result = await parser.parse();
    expect(result.some((kb) => kb.rawCommand === 'bindkey -e')).toBe(false);
    expect(result.some((kb) => kb.rawCommand.includes('terminfo'))).toBe(false);
  });

  it('generates unique IDs', async () => {
    const result = await parser.parse();
    const ids = result.map((kb) => kb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty for missing file', async () => {
    const p = new StubZsh();
    p.setConfigPaths(['/tmp/nonexistent']);
    expect(await p.parse()).toEqual([]);
  });
});

describe('ZshParser defaults (bindkey -L)', () => {
  it('lists every useful emacs default with exact key and widget', () => {
    const result = new ZshParser().parseDefaults(EMACS_DEFAULTS);
    expect(result.every((s) => s.isDefault && s.origin === 'app-defaults' && s.filePath === 'zsh bindkey -L')).toBe(true);
    // 117 lines minus self-insert ranges, self-insert-unmeta, bracketed-paste,
    // ⌥0-⌥9, the ⌥⇧letter duplicates of ⌥letter and ^[O / ^[[ arrow duplicates
    expect(rows(result)).toEqual([
      ["⌃Space", "Set mark command", null, false],
      ["⌃A", "Beginning of line", null, false],
      ["⌃B", "Backward char", null, false],
      ["⌃D", "Delete char or list", null, false],
      ["⌃E", "End of line", null, false],
      ["⌃F", "Forward char", null, false],
      ["⌃G", "Send break", null, false],
      ["⌃H", "Backward delete char", null, false],
      ["Tab", "Expand or complete", null, false],
      ["⌃J", "Accept line", null, false],
      ["⌃K", "Kill line", null, false],
      ["⌃L", "Clear screen", null, false],
      ["Return", "Accept line", null, false],
      ["⌃N", "Down line or history", null, false],
      ["⌃O", "Accept line and down history", null, false],
      ["⌃P", "Up line or history", null, false],
      ["⌃Q", "Push line", null, false],
      ["⌃R", "History incremental search backward", null, false],
      ["⌃S", "History incremental search forward", null, false],
      ["⌃T", "Transpose chars", null, false],
      ["⌃U", "Kill whole line", null, false],
      ["⌃V", "Quoted insert", null, false],
      ["⌃W", "Backward kill word", null, false],
      ["⌃X ⌃B", "Vi match bracket", null, false],
      ["⌃X ⌃F", "Vi find next char", null, false],
      ["⌃X ⌃J", "Vi join", null, false],
      ["⌃X ⌃K", "Kill buffer", null, false],
      ["⌃X ⌃N", "Infer next history", null, false],
      ["⌃X ⌃O", "Overwrite mode", null, false],
      ["⌃X ⌃U", "Undo", null, false],
      ["⌃X ⌃V", "Vi cmd mode", null, false],
      ["⌃X ⌃X", "Exchange point and mark", null, false],
      ["⌃X *", "Expand word", null, false],
      ["⌃X =", "What cursor position", null, false],
      ["⌃X ⇧G", "List expand", null, false],
      ["⌃X G", "List expand", null, false],
      ["⌃X R", "History incremental search backward", null, false],
      ["⌃X S", "History incremental search forward", null, false],
      ["⌃X U", "Undo", null, false],
      ["⌃Y", "Yank", null, false],
      ["⌃⌥D", "List choices", null, false],
      ["⌃⌥G", "Send break", null, false],
      ["⌃⌥H", "Backward kill word", null, false],
      ["⌃⌥L", "Clear screen", null, false],
      ["⌃⌥_", "Copy prev word", null, false],
      ["⌥Space", "Expand history", null, false],
      ["⌥!", "Expand history", null, false],
      ["⌥\"", "Quote region", null, false],
      ["⌥'", "Quote line", null, false],
      ["⌥-", "Neg argument", null, false],
      ["⌥.", "Insert last word", null, false],
      ["⌥<", "Beginning of buffer or history", null, false],
      ["⌥>", "End of buffer or history", null, false],
      ["⌥?", "Which command", null, false],
      ["↑", "Up line or history", null, false],
      ["↓", "Down line or history", null, false],
      ["→", "Forward char", null, false],
      ["←", "Backward char", null, false],
      ["⌥_", "Insert last word", null, false],
      ["⌥A", "Accept and hold", null, false],
      ["⌥B", "Backward word", null, false],
      ["⌥C", "Capitalize word", null, false],
      ["⌥D", "Kill word", null, false],
      ["⌥F", "Forward word", null, false],
      ["⌥G", "Get line", null, false],
      ["⌥H", "Run help", null, false],
      ["⌥L", "Down case word", null, false],
      ["⌥N", "History search forward", null, false],
      ["⌥P", "History search backward", null, false],
      ["⌥Q", "Push line", null, false],
      ["⌥S", "Spell word", null, false],
      ["⌥T", "Transpose words", null, false],
      ["⌥U", "Up case word", null, false],
      ["⌥W", "Copy region as kill", null, false],
      ["⌥X", "Execute named cmd", null, false],
      ["⌥Y", "Yank pop", null, false],
      ["⌥Z", "Execute last named cmd", null, false],
      ["⌥|", "Vi goto column", null, false],
      ["⌥Backspace", "Backward kill word", null, false],
      ["⌃_", "Undo", null, false],
      ["Backspace", "Backward delete char", null, false],
    ]);
  });

  it('lists vi insert and command keymaps, without internal macros', () => {
    const result = new ZshParser().parseDefaults(VI_DEFAULTS);
    expect(result).toHaveLength(102);
    expect(result.filter((s) => s.context === 'viins')).toHaveLength(18);
    expect(result.filter((s) => s.context === 'vicmd')).toHaveLength(84);
    const find = (key: string, context: string) =>
      result.find((s) => s.key === key && s.context === context)?.command;
    expect(find('Escape', 'viins')).toBe('Vi cmd mode');
    expect(find('Backspace', 'viins')).toBe('Vi backward delete char');
    expect(find('-', 'vicmd')).toBe('Vi up line or history');
    expect(find('G G', 'vicmd')).toBe('Beginning of buffer or history');
    expect(find('⇧A', 'vicmd')).toBe('Vi add eol');
    expect(result.some((s) => s.command.startsWith('Type'))).toBe(false);
  });

  it('merges .zshrc binds over the emacs defaults', async () => {
    const p = new StubZsh(EMACS_DEFAULTS);
    p.setConfigPaths([FIXTURE_PATH]);
    const result = await p.parse();
    expect(p.calls).toEqual([false]);
    const main = (key: string) => result.find((s) => s.key === key && !s.context);

    // a config bind replaces the default for the same key
    expect(main('⌃U')).toMatchObject({ command: 'Backward kill line', isDefault: false, origin: 'user-config' });
    expect(main('↑')).toMatchObject({ command: 'Up line or search', isDefault: false });
    // bindkey -r marks the default unbound
    expect(main('⌃S')).toMatchObject({
      command: 'History incremental search forward', isUnbound: true, isDefault: false, filePath: FIXTURE_PATH,
    });
    // untouched defaults stay
    expect(main('⌃A')).toMatchObject({ command: 'Beginning of line', isDefault: true });
    // new keys and other keymaps are added
    expect(main('⌃G')?.command).toBe('Type “git status\\n”');
    expect(result.find((s) => s.key === 'J K')?.context).toBe('viins');
    // 81 defaults + config binds on keys without a default (⌃→, Delete, ⌃X ⌃E, J K, ⇧Tab, K)
    expect(result).toHaveLength(81 + 6);
    expect(new Set(result.map((s) => s.id)).size).toBe(result.length);
  });

  it('uses the vi keymaps when the rc selects bindkey -v', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shortty-zsh-'));
    try {
      const rc = join(dir, '.zshrc');
      writeFileSync(rc, "bindkey -v\nbindkey '^R' history-incremental-search-backward\nbindkey -a 'k' up-line-or-search\n");
      const p = new StubZsh(EMACS_DEFAULTS);
      p.setConfigPaths([rc]);
      const result = await p.parse();
      expect(p.calls).toEqual([true]);
      // unqualified binds belong to viins and replace its default
      expect(result.filter((s) => s.key === '⌃R')).toEqual([
        expect.objectContaining({ command: 'History incremental search backward', context: undefined, isDefault: false }),
        expect.objectContaining({ command: 'Redo', context: 'vicmd', isDefault: true }),
      ]);
      expect(result.find((s) => s.key === 'K' && s.context === 'vicmd')?.command).toBe('Up line or search');
      expect(result).toHaveLength(102);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('terminal key sequences', () => {
  const zsh = (seq: string) => normalizeTerminalKey(seq, { caret: true }).displayKey;
  const readline = (seq: string) => normalizeTerminalKey(seq, { caret: false }).displayKey;

  it('decodes caret notation and escapes', () => {
    expect(zsh('^A')).toBe('⌃A');
    expect(zsh('^[x')).toBe('⌥X');
    expect(zsh('^[X')).toBe('⌥⇧X');
    expect(zsh('\\e.')).toBe('⌥.');
    expect(zsh('^?')).toBe('Backspace');
    expect(zsh('^I')).toBe('Tab');
    expect(zsh('^@')).toBe('⌃Space');
    expect(zsh('^[')).toBe('Escape');
    expect(zsh('^X^K')).toBe('⌃X ⌃K');
  });

  it('decodes CSI / SS3 sequences with xterm modifiers', () => {
    expect(zsh('^[[A')).toBe('↑');
    expect(zsh('^[OB')).toBe('↓');
    expect(zsh('\\e[1;3D')).toBe('⌥←');
    expect(zsh('\\e[1;2C')).toBe('⇧→');
    expect(zsh('\\e[5~')).toBe('PageUp');
    expect(zsh('\\e[3;5~')).toBe('⌃Delete');
    expect(zsh('\\e[H')).toBe('Home');
    expect(zsh('\\eOP')).toBe('F1');
    expect(zsh('\\e[15~')).toBe('F5');
  });

  it('treats ^ literally in readline sequences', () => {
    expect(readline('\\C-x\\C-r')).toBe('⌃X ⌃R');
    expect(readline('\\M-\\C-h')).toBe('⌃⌥H');
    expect(readline('^')).toBe('^');
  });

  it('decodes \\M- as an escape prefix, including CSI/SS3 sequences', () => {
    expect(readline('\\M-[A')).toBe('↑');
    expect(readline('\\M-OD')).toBe('←');
    expect(readline('\\M-[H')).toBe('Home');
    expect(readline('\\M-\\e')).toBe('⌥Escape');
    expect(readline('\\M- ')).toBe('⌥Space');
  });
});

describe('shellWords', () => {
  it('splits words and removes quoting, keeping backslash escapes for bindkey', () => {
    expect(shellWords(`bindkey -M viins "\\e[A" up-line # comment`)).toEqual([
      'bindkey', '-M', 'viins', '\\e[A', 'up-line',
    ]);
    expect(shellWords(`bind '"\\C-r": reverse-search-history'`)).toEqual([
      'bind', '"\\C-r": reverse-search-history',
    ]);
  });
});
