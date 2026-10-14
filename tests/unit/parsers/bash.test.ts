import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { BashParser } from '../../../src/main/parsers/bash.parser';

const INPUTRC_PATH = join(__dirname, '../../../fixtures/inputrc');
const BASHRC_PATH = join(__dirname, '../../../fixtures/bashrc');

describe('BashParser', () => {
  let parser: BashParser;

  beforeEach(() => {
    parser = new BashParser();
    parser.setConfigPaths([INPUTRC_PATH, BASHRC_PATH]);
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('bash');
    expect(parser.meta.label).toBe('Bash');
  });

  it('parses .inputrc key bindings', async () => {
    const p = new BashParser();
    p.setConfigPaths([INPUTRC_PATH]);
    const result = await p.parse();

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((kb) => kb.source === 'bash')).toBe(true);
  });

  it('normalizes \\C-a to Ctrl+A', async () => {
    const p = new BashParser();
    p.setConfigPaths([INPUTRC_PATH]);
    const result = await p.parse();

    const ctrlA = result.find((kb) => kb.rawCommand.includes('beginning-of-line'));
    expect(ctrlA).toBeDefined();
    expect(ctrlA?.key).toBe('⌃A');
  });

  it('normalizes escape sequences to arrow glyphs', async () => {
    const p = new BashParser();
    p.setConfigPaths([INPUTRC_PATH]);
    const result = await p.parse();

    const upArrow = result.find((kb) =>
      kb.rawCommand.includes('history-search-backward') && kb.rawCommand.includes('[A'),
    );
    expect(upArrow?.key).toBe('↑');
  });

  it('normalizes \\M- to Alt/Option', async () => {
    const p = new BashParser();
    p.setConfigPaths([INPUTRC_PATH]);
    const result = await p.parse();

    const metaF = result.find((kb) => kb.rawCommand.includes('forward-word'));
    expect(metaF).toBeDefined();
    expect(metaF?.key).toBe('⌥F');
  });

  it('handles multi-key sequences (\\C-x\\C-e)', async () => {
    const p = new BashParser();
    p.setConfigPaths([INPUTRC_PATH]);
    const result = await p.parse();

    const ctrlXCtrlE = result.find((kb) =>
      kb.rawCommand.includes('edit-and-execute-command'),
    );
    expect(ctrlXCtrlE).toBeDefined();
    expect(ctrlXCtrlE?.key).toContain('⌃X');
    expect(ctrlXCtrlE?.key).toContain('⌃E');
  });

  it('detects editing-mode as context', async () => {
    const p = new BashParser();
    p.setConfigPaths([INPUTRC_PATH]);
    const result = await p.parse();

    // All bindings after "set editing-mode emacs" should have emacs context
    expect(result.every((kb) => kb.context === 'emacs')).toBe(true);
  });

  it('parses .bashrc bind commands', async () => {
    const p = new BashParser();
    p.setConfigPaths([BASHRC_PATH]);
    const result = await p.parse();

    const clearScreen = result.find((kb) =>
      kb.rawCommand.includes('clear-screen'),
    );
    expect(clearScreen).toBeDefined();
    expect(clearScreen?.key).toBe('⌃L');
  });

  it('parses .bashrc bind -x commands', async () => {
    const p = new BashParser();
    p.setConfigPaths([BASHRC_PATH]);
    const result = await p.parse();

    const gitStatus = result.find((kb) =>
      kb.rawCommand.includes('git status'),
    );
    expect(gitStatus).toBeDefined();
    expect(gitStatus?.key).toBe('⌃G');
    expect(gitStatus?.command).toBe('Git status');
  });

  it('humanizes function names', async () => {
    const p = new BashParser();
    p.setConfigPaths([INPUTRC_PATH]);
    const result = await p.parse();

    const beginLine = result.find((kb) =>
      kb.rawCommand.includes('beginning-of-line'),
    );
    expect(beginLine?.command).toBe('Beginning of line');
  });

  it('returns empty for missing file', async () => {
    const p = new BashParser();
    p.setConfigPaths(['/nonexistent/inputrc']);
    const result = await p.parse();
    expect(result).toEqual([]);
  });

  it('returns empty for no config paths', async () => {
    const p = new BashParser();
    p.setConfigPaths([]);
    const result = await p.parse();
    expect(result).toEqual([]);
  });

  it('reports unavailable for missing paths', async () => {
    const p = new BashParser();
    p.setConfigPaths(['/nonexistent/inputrc']);
    expect(await p.isAvailable()).toBe(false);
  });

  it('combines results from both files', async () => {
    const result = await parser.parse();

    // Should have bindings from both inputrc and bashrc
    const fromInputrc = result.filter((kb) => kb.filePath === INPUTRC_PATH);
    const fromBashrc = result.filter((kb) => kb.filePath === BASHRC_PATH);
    expect(fromInputrc.length).toBeGreaterThan(0);
    expect(fromBashrc.length).toBeGreaterThan(0);
  });
});
