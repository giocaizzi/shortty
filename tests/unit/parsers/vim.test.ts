import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VimParser } from '../../../src/main/parsers/vim.parser';
import { FIXTURES, rows } from './parser-helpers';

const FIXTURE_PATH = join(FIXTURES, 'vimrc');
const NVO = 'normal, visual, operator-pending';

describe('VimParser', () => {
  let parser: VimParser;

  beforeEach(() => {
    parser = new VimParser();
    parser.setConfigPaths([FIXTURE_PATH]);
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('vim');
    expect(parser.meta.label).toBe('vim');
  });

  it('parses every mapping with exact key, command, mode and unbound flag', async () => {
    const result = await parser.parse();
    expect(rows(result)).toEqual([
      [', w', 'w', 'normal', false],
      [', q', 'q', 'normal', false],
      ['⌃P', 'Files', 'normal', false],
      ['⌃C', '"+y', 'visual', false],
      ['j k', '<Esc>', 'insert', false],
      ['⌃A', '<Home>', 'insert', false],
      ['⌃A', '<Home>', 'command', false],
      ['p', 'i(', 'operator-pending', false],
      ['<', '<gv', 'visual', false],
      ['⌃J', '<Down>', 'select', false],
      ['⌃Z', 'Unmap', 'normal', true],
      [', f', 'FZF', 'normal', false],
      [', b', 'Buffers', 'normal', false],
      ['⌃⇧K', 'move .-1', 'normal', false],
      ['⌘S', 'w', 'normal', false],
      ['Space', ':', NVO, false],
      ['j', 'gj', NVO, false],
      // leader changed to <Space> half-way through the file
      ['Space f f', 'Telescope find_files', 'normal', false],
      [', t', 'TestNearest', 'normal', false],
      ['↑', 'Disabled', 'normal', true],
      // <Plug> mapping skipped
      ['⌃V', '<C-r>+', 'insert, command', false],
      ['⌃]', 'g<C-]>', 'normal', false],
      ['g c c', 'Commentary', 'normal', false],
      ['W', 'w', 'normal', false],
      ['Escape', '<C-\\><C-n>', 'terminal', false],
    ]);
  });

  it('keeps plain characters literal and case-sensitive', async () => {
    const result = await parser.parse();
    const upperW = result.find((kb) => kb.rawCommand === 'nnoremap W :w<CR>');
    expect(upperW?.strokes).toEqual([{ mods: [], key: 'W', literal: true }]);
    const ctrlP = result.find((kb) => kb.rawCommand.startsWith('nnoremap <C-p>'));
    expect(ctrlP?.strokes).toEqual([{ mods: ['ctrl'], key: 'P' }]);
  });

  it('parses a CRLF vimrc (Windows _vimrc) like an LF one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shortty-vim-'));
    try {
      const crlf = join(dir, '_vimrc');
      writeFileSync(crlf, readFileSync(FIXTURE_PATH, 'utf-8').replace(/\n/g, '\r\n'));
      const p = new VimParser();
      p.setConfigPaths([crlf]);
      const expected = (await parser.parse()).map((s) => ({ ...s, filePath: '', id: '' }));
      expect((await p.parse()).map((s) => ({ ...s, filePath: '', id: '' }))).toEqual(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generates unique IDs', async () => {
    const result = await parser.parse();
    const ids = result.map((kb) => kb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty for missing file or no config paths', async () => {
    const p = new VimParser();
    p.setConfigPaths(['/tmp/nonexistent-vimrc']);
    expect(await p.parse()).toEqual([]);
    expect(await p.isAvailable()).toBe(false);
    p.setConfigPaths([]);
    expect(await p.parse()).toEqual([]);
  });
});
