import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TmuxParser } from '../../../src/main/parsers/tmux.parser';

const FIXTURE_PATH = join(__dirname, '../../../fixtures/tmux-list-keys.txt');

describe('TmuxParser', () => {
  let parser: TmuxParser;

  beforeEach(() => {
    parser = new TmuxParser();
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('tmux');
    expect(parser.meta.label).toBe('tmux');
  });

  it('parses tmux list-keys output', () => {
    const output = readFileSync(FIXTURE_PATH, 'utf-8');
    const result = parser.parseTmuxListKeys(output);

    expect(result.length).toBe(14);
    expect(result.every((kb) => kb.source === 'tmux')).toBe(true);
  });

  it('adds prefix to prefix-table bindings', () => {
    const output = readFileSync(FIXTURE_PATH, 'utf-8');
    const result = parser.parseTmuxListKeys(output);

    const newWindow = result.find((kb) => kb.command === 'New Window');
    expect(newWindow?.key).toBe('⌃B C');
  });

  it('no prefix for root-table bindings', () => {
    const output = readFileSync(FIXTURE_PATH, 'utf-8');
    const result = parser.parseTmuxListKeys(output);

    const rootBindings = result.filter((kb) => !kb.key.startsWith('⌃B'));
    expect(rootBindings.length).toBeGreaterThan(0);
    expect(rootBindings[0].key).toBe('⌥↑');
  });

  it('marks all as default (from live query)', () => {
    const output = readFileSync(FIXTURE_PATH, 'utf-8');
    const result = parser.parseTmuxListKeys(output);
    expect(result.every((kb) => kb.isDefault)).toBe(true);
  });

  it('humanizes common tmux commands', () => {
    const output = readFileSync(FIXTURE_PATH, 'utf-8');
    const result = parser.parseTmuxListKeys(output);

    const splitH = result.find((kb) => kb.key === '⌃B %');
    expect(splitH?.command).toBe('Split Window');
  });

  it('handles empty output', () => {
    const result = parser.parseTmuxListKeys('');
    expect(result).toEqual([]);
  });
});
