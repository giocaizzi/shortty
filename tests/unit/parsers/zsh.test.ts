import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { ZshParser, shellWords } from '../../../src/main/parsers/zsh.parser';
import { normalizeTerminalKey } from '../../../src/main/parsers/terminal-keys';
import { FIXTURES, rows } from './parser-helpers';

const FIXTURE_PATH = join(FIXTURES, 'zshrc');

describe('ZshParser', () => {
  let parser: ZshParser;

  beforeEach(() => {
    parser = new ZshParser();
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
    const p = new ZshParser();
    p.setConfigPaths(['/tmp/nonexistent']);
    expect(await p.parse()).toEqual([]);
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
