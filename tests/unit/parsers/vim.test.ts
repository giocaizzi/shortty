import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { VimParser } from '../../../src/main/parsers/vim.parser';

const FIXTURE_PATH = join(__dirname, '../../../fixtures/vimrc');

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

  it('parses basic nmap entries', async () => {
    const result = await parser.parse();
    const leaderW = result.find((kb) => kb.rawCommand.includes('nmap <leader>w'));
    expect(leaderW).toBeDefined();
    expect(leaderW?.command).toBe('w');
    expect(leaderW?.context).toBe('normal');
  });

  it('substitutes leader key', async () => {
    const result = await parser.parse();
    const leaderW = result.find((kb) => kb.rawCommand.includes('nmap <leader>w'));
    // Leader is "," so <leader>w becomes ", w" in display
    expect(leaderW?.key).toContain(',');
    expect(leaderW?.key).toContain('w');
  });

  it('parses multi-modifier keys (C-S-k)', async () => {
    const result = await parser.parse();
    const ctrlShiftK = result.find((kb) => kb.rawCommand.includes('<C-S-k>'));
    expect(ctrlShiftK).toBeDefined();
    // Should contain both Ctrl and Shift glyphs
    expect(ctrlShiftK?.key).toContain('⌃');
    expect(ctrlShiftK?.key).toContain('⇧');
  });

  it('handles Cmd modifier (D-s)', async () => {
    const result = await parser.parse();
    const cmdS = result.find((kb) => kb.rawCommand.includes('<D-s>'));
    expect(cmdS).toBeDefined();
    expect(cmdS?.key).toContain('⌘');
  });

  it('handles unmap commands', async () => {
    const result = await parser.parse();
    const unmap = result.find((kb) => kb.isUnbound);
    expect(unmap).toBeDefined();
    expect(unmap?.command).toBe('Unmap');
    expect(unmap?.context).toBe('normal');
  });

  it('detects mode from command prefix', async () => {
    const result = await parser.parse();

    const visual = result.find((kb) => kb.rawCommand.startsWith('vnoremap'));
    expect(visual?.context).toBe('visual');

    const insert = result.find((kb) => kb.rawCommand.startsWith('inoremap jk'));
    expect(insert?.context).toBe('insert');

    const cmdMode = result.find((kb) => kb.rawCommand.startsWith('cnoremap'));
    expect(cmdMode?.context).toBe('command');

    const operPending = result.find((kb) => kb.rawCommand.startsWith('onoremap'));
    expect(operPending?.context).toBe('operator-pending');

    const xnore = result.find((kb) => kb.rawCommand.startsWith('xnoremap'));
    expect(xnore?.context).toBe('visual');

    const snore = result.find((kb) => kb.rawCommand.startsWith('snoremap'));
    expect(snore?.context).toBe('select');
  });

  it('handles noremap (no prefix) as normal mode', async () => {
    const result = await parser.parse();
    const noremap = result.find((kb) => kb.rawCommand.startsWith('noremap'));
    expect(noremap?.context).toBe('normal');
  });

  it('handles map (no prefix) as normal mode', async () => {
    const result = await parser.parse();
    const mapJ = result.find((kb) => kb.rawCommand === 'map j gj');
    expect(mapJ?.context).toBe('normal');
  });

  it('ignores comment and blank lines', async () => {
    const result = await parser.parse();
    // No keybinding should have rawCommand starting with "
    expect(result.every((kb) => !kb.rawCommand.startsWith('"'))).toBe(true);
  });

  it('returns empty for missing file', async () => {
    const p = new VimParser();
    p.setConfigPaths(['/nonexistent/vimrc']);
    const result = await p.parse();
    expect(result).toEqual([]);
  });

  it('returns empty for no config paths', async () => {
    const p = new VimParser();
    p.setConfigPaths([]);
    const result = await p.parse();
    expect(result).toEqual([]);
  });

  it('reports unavailable for missing paths', async () => {
    const p = new VimParser();
    p.setConfigPaths(['/nonexistent/vimrc']);
    expect(await p.isAvailable()).toBe(false);
  });

  it('handles silent and buffer options', async () => {
    const result = await parser.parse();
    const silent = result.find((kb) => kb.rawCommand.includes('<silent>'));
    expect(silent).toBeDefined();
    expect(silent?.command).toBe('FZF');

    const buffer = result.find((kb) => kb.rawCommand.includes('<buffer>'));
    expect(buffer).toBeDefined();
    expect(buffer?.command).toBe('Buffers');
  });

  it('sets source on all keybindings', async () => {
    const result = await parser.parse();
    expect(result.every((kb) => kb.source === 'vim')).toBe(true);
  });
});
