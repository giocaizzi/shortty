import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { BashParser, parseReadlineBinding } from '../../../src/main/parsers/bash.parser';
import { FIXTURES, rows } from './parser-helpers';

const INPUTRC = join(FIXTURES, 'inputrc');
const BASHRC = join(FIXTURES, 'bashrc');

describe('BashParser', () => {
  let parser: BashParser;

  beforeEach(() => {
    parser = new BashParser();
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
    expect(await parser.isAvailable()).toBe(false);
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
