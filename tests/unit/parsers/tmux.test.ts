import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TmuxParser,
  parseBindLine,
  parseTmuxKey,
} from '../../../src/main/parsers/tmux.parser';
import { normalizeToCanonical } from '../../../src/main/parsers/key-normalizer';
import { FIXTURES, rows } from './parser-helpers';

/** Real `tmux -f /dev/null list-keys` output of tmux 3.6a. */
const DEFAULTS = readFileSync(join(FIXTURES, 'tmux-list-keys-defaults.txt'), 'utf-8');
const CONF = join(FIXTURES, 'tmux.conf');

/** TmuxParser with tmux itself stubbed out (hermetic). */
class StubTmux extends TmuxParser {
  calls: string[][] = [];
  constructor(private defaults: string | null) {
    super();
  }
  protected runTmux(args: string[]): string | null {
    this.calls.push(args);
    if (args[0] === '-V') return this.defaults === null ? null : 'tmux 3.6a';
    return this.defaults;
  }
}

describe('TmuxParser', () => {
  let parser: StubTmux;

  beforeEach(() => {
    parser = new StubTmux(DEFAULTS);
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('tmux');
    expect(parser.meta.label).toBe('tmux');
  });

  describe('list-keys (defaults)', () => {
    it('parses every non-copy-mode, non-mouse default binding', () => {
      const result = parser.parseTmuxListKeys(DEFAULTS);
      // 84 prefix-table lines + `[`/PPage copy-mode + the `>` menu (non-mouse)
      expect(result).toHaveLength(87);
      expect(result.every((kb) => kb.isDefault && kb.origin === 'app-defaults')).toBe(true);
      expect(result.some((kb) => /Mouse|Wheel/.test(kb.key))).toBe(false);
    });

    it('includes repeatable (-r) bindings and unescapes keys', () => {
      const result = parser.parseTmuxListKeys(DEFAULTS);
      const byKey = new Map(result.map((kb) => [kb.key, kb.command]));
      expect(byKey.get('⌃B ↑')).toBe('Select Pane Up');
      expect(byKey.get('⌃B ⌃→')).toBe('Resize Pane Right');
      expect(byKey.get('⌃B "')).toBe('Split Window Vertically');
      expect(byKey.get('⌃B %')).toBe('Split Window Horizontally');
      expect(byKey.get('⌃B ;')).toBe('Last Pane');
      expect(byKey.get('⌃B #')).toBe('List buffers');
      expect(byKey.get('⌃B $')).toBe('Rename Session');
      expect(byKey.get('⌃B X')).toBe('Kill Pane');
      expect(byKey.get('⌃B Delete')).toBe('Refresh Client');
    });

    it('shows uppercase keys as Shift+letter', () => {
      const result = parser.parseTmuxListKeys(DEFAULTS);
      expect(result.find((kb) => kb.rawCommand === 'customize-mode -Z')?.key).toBe('⌃B ⇧C');
      expect(result.find((kb) => kb.rawCommand === 'new-window')?.key).toBe('⌃B C');
    });
  });

  describe('defaults merged with tmux.conf', () => {
    beforeEach(() => {
      parser.setConfigPaths([CONF]);
    });

    it('resolves the configured prefix (set -g prefix C-a)', () => {
      expect(normalizeToCanonical(parser.detectPrefix()).displayKey).toBe('⌃A');
    });

    it('keeps defaults and applies config binds, unbinds and the new prefix', async () => {
      const result = await parser.parse();
      const byKey = new Map(result.map((kb) => [kb.key, kb]));

      // defaults survive a custom config, under the new prefix
      expect(byKey.get('⌃A C')?.command).toBe('New Window');
      expect(byKey.get('⌃A C')?.isDefault).toBe(true);
      // unbind marks the default as unbound
      expect(byKey.get('⌃A "')?.isUnbound).toBe(true);
      expect(byKey.get('⌃A %')?.isUnbound).toBe(true);
      expect(byKey.get('⌃A ⌃B')?.isUnbound).toBe(true);
      // config bindings
      const config = result.filter((kb) => kb.origin === 'user-config' && !kb.isUnbound);
      expect(rows(config)).toEqual([
        // replacing a default keeps its position
        ['⌃A #', 'List buffers', null, false],
        ['⌃A -', 'Split Window Vertically', null, false],
        ['⌃A ;', 'Last Pane', null, false],
        ['⌃A R', 'Reload config', null, false],
        // new keys, in config order
        ['⌃A ⌃A', 'Send Prefix', null, false],
        ['⌃A |', 'Split Window Horizontally', null, false],
        ['⌃A H', 'Select Pane Left', null, false],
        ['⌃A J', 'Select Pane Down', null, false],
        ['⌃A ⇧H', 'Resize Pane Left', null, false],
        ['⌃A ⇧K', 'Resize Pane Up', null, false],
        ['⌥←', 'Select Pane Left', null, false],
        ['⌃⇧→', 'Next Window', null, false],
        ['H', 'Resize Pane Left', 'resize', false],
      ]);
    });

    it('ignores copy-mode tables and mouse bindings from the config', async () => {
      const result = await parser.parse();
      expect(result.some((kb) => kb.rawCommand.includes('begin-selection'))).toBe(false);
      expect(result.some((kb) => kb.key.includes('Mouse'))).toBe(false);
    });

    it('starts the defaults server without any user config', async () => {
      await parser.parse();
      const call = parser.calls.find((c) => c.includes('list-keys'));
      expect(call).toContain('/dev/null');
      expect(call?.slice(-5)).toEqual(['start-server', ';', 'list-keys', ';', 'kill-server']);
    });

    it('generates unique IDs', async () => {
      const result = await parser.parse();
      const ids = result.map((kb) => kb.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('falls back to config bindings when tmux cannot be run', async () => {
    const offline = new StubTmux(null);
    offline.setConfigPaths([CONF]);
    expect(await offline.isAvailable()).toBe(false);
    const result = await offline.parse();
    expect(result.every((kb) => kb.origin === 'user-config')).toBe(true);
  });

  it('handles empty output', () => {
    expect(parser.parseTmuxListKeys('')).toEqual([]);
  });
});

describe('parseBindLine', () => {
  it('parses flags, tables, notes and quoted keys', () => {
    expect(parseBindLine('bind -r H resize-pane -L 5')).toEqual({
      table: 'prefix', key: 'H', command: 'resize-pane -L 5', unbind: false, note: undefined,
    });
    expect(parseBindLine('bind-key -n M-h select-pane -L')?.table).toBe('root');
    expect(parseBindLine('bind -rT prefix K resize-pane -U')?.table).toBe('prefix');
    expect(parseBindLine("bind '\"' split-window")?.key).toBe('"');
    expect(parseBindLine('bind-key    -T prefix       \\;   last-pane')?.key).toBe(';');
    expect(parseBindLine('bind -N "Reload" r source-file x')?.note).toBe('Reload');
    expect(parseBindLine('unbind -T copy-mode-vi v')).toMatchObject({ table: 'copy-mode-vi', key: 'v', unbind: true });
    expect(parseBindLine('unbind -a')).toBeNull();
    expect(parseBindLine('set -g prefix C-a')).toBeNull();
  });
});

describe('parseTmuxKey', () => {
  const display = (k: string) => normalizeToCanonical(parseTmuxKey(k)).displayKey;

  it('maps tmux key names', () => {
    expect(display('C-a')).toBe('⌃A');
    expect(display('C-M-v')).toBe('⌃⌥V');
    expect(display('S-Up')).toBe('⇧↑');
    expect(display('^A')).toBe('⌃A');
    expect(display('BSpace')).toBe('Backspace');
    expect(display('DC')).toBe('Delete');
    expect(display('NPage')).toBe('PageDown');
    expect(display('BTab')).toBe('⇧Tab');
    expect(display('F12')).toBe('F12');
    expect(display('N')).toBe('⇧N');
    expect(display('n')).toBe('N');
    expect(display('C-N')).toBe('⌃N');
    expect(display('%')).toBe('%');
  });
});
