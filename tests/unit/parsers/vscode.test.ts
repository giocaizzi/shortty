import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { VscodeParser, stripJsonc } from '../../../src/main/parsers/vscode.parser';
import { FIXTURES, rows, withPlatform } from './parser-helpers';

const FIXTURE_PATH = join(FIXTURES, 'vscode-keybindings.json');

describe('VscodeParser', () => {
  withPlatform('darwin');
  let parser: VscodeParser;

  beforeEach(() => {
    parser = new VscodeParser();
    parser.setConfigPaths([FIXTURE_PATH]);
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('vscode');
    expect(parser.meta.label).toBe('VS Code');
  });

  it('parses every binding of the fixture with exact key, command, context and unbound flag', async () => {
    const result = await parser.parse();
    expect(rows(result)).toEqual([
      ['⇧⌘T', 'Reopen Closed Editor', null, false],
      ['⇧⌘P', 'Show Commands', null, false],
      ['⌘K ⌘S', 'Open Global Keybindings', null, false],
      ['⇧⌘E', 'Toggle Sidebar Visibility', null, false],
      ['⇧⌘F', 'Find In Files', null, false],
      ['⌘J', 'Toggle Panel', null, false],
      ['⇧⌘G', 'Show SCM', null, true],
      ['⌘B', 'Toggle Word Wrap', 'editorFocus', false],
      ['⌃⇧`', 'Terminal: New', null, false],
      ['⌘[', 'Outdent Lines', 'editorTextFocus && !editorReadonly', false],
      ['⌃`', 'Terminal: Toggle Terminal', null, false],
      ['⌘K ⌘M', 'Editor: Change Language Mode', null, false],
      ['⌘/', 'Comment Line', 'editorTextFocus && !editorReadonly', true],
      ['', 'Toggle Zen Mode', null, true],
      // `isMac` is always true on macOS and is dropped from the context
      ['⌃Tab', 'Next Editor', null, false],
      ['⌃⌥→', 'Next Editor', 'terminalFocus', false],
      // `isWindows` binding skipped; `!isLinux` dropped
      ['⌥⇧↓', 'Copy Lines Down Action', 'editorTextFocus', false],
      ['⌘NumpadAdd', 'Zoom In', null, false],
      ['⌘Return', 'Terminal: Send Sequence', null, false],
    ]);
  });

  it('keeps "-command" as rawCommand for removal rules', async () => {
    const result = await parser.parse();
    const removals = result.filter((kb) => kb.isUnbound).map((kb) => kb.rawCommand);
    expect(removals).toEqual([
      '-workbench.action.showSCM',
      '-editor.action.commentLine',
      '-workbench.action.toggleZenMode',
    ]);
  });

  it('marks [ScanCode] keys as physical positions', async () => {
    const result = await parser.parse();
    const outdent = result.find((kb) => kb.rawCommand === 'editor.action.outdentLines');
    expect(outdent?.strokes).toEqual([{ mods: ['cmd'], key: '[', code: 'BracketLeft' }]);
    const lang = result.find((kb) => kb.rawCommand === 'workbench.action.editor.changeLanguageMode');
    expect(lang?.strokes).toEqual([
      { mods: ['cmd'], key: 'K' },
      { mods: ['cmd'], key: 'M', code: 'KeyM' },
    ]);
  });

  it('keeps character keys layout-dependent (no code)', async () => {
    const result = await parser.parse();
    const comment = result.find((kb) => kb.rawCommand === '-editor.action.commentLine');
    expect(comment?.strokes).toEqual([{ mods: ['cmd'], key: '/' }]);
  });

  it('produces search text with modifier and symbol names', async () => {
    const result = await parser.parse();
    const comment = result.find((kb) => kb.rawCommand === '-editor.action.commentLine');
    expect(comment?.searchKey).toBe('cmd / slash');
    const chord = result.find((kb) => kb.rawCommand === 'workbench.action.openGlobalKeybindings');
    expect(chord?.searchKey).toBe('cmd k cmd s');
  });

  it('generates unique IDs even for a command bound twice', async () => {
    const result = await parser.parse();
    const ids = result.map((kb) => kb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty for missing file', async () => {
    const p = new VscodeParser();
    p.setConfigPaths(['/tmp/nonexistent.json']);
    expect(await p.parse()).toEqual([]);
  });

  it('handles empty config paths', async () => {
    const p = new VscodeParser();
    p.setConfigPaths([]);
    expect(await p.parse()).toEqual([]);
  });

  describe('on Linux', () => {
    withPlatform('linux');

    it('drops isMac-only bindings and keeps !isLinux ones out', async () => {
      const result = await parser.parse();
      const commands = result.map((kb) => kb.rawCommand);
      expect(commands).not.toContain('editor.action.copyLinesDownAction');
      const nextEditor = result.filter((kb) => kb.rawCommand === 'workbench.action.nextEditor');
      expect(nextEditor.map((kb) => kb.context)).toEqual(['terminalFocus']);
    });
  });
});

describe('stripJsonc', () => {
  it('removes comments and trailing commas but not "//" inside strings', () => {
    const input = '[{"a": "http://x" /* c */, "b": 1,}, // tail\n]';
    expect(JSON.parse(stripJsonc(input))).toEqual([{ a: 'http://x', b: 1 }]);
  });

  it('handles escaped quotes in strings', () => {
    expect(JSON.parse(stripJsonc('{"a": "say \\"// hi\\""}'))).toEqual({ a: 'say "// hi"' });
  });
});
