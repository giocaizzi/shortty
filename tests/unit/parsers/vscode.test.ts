import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { VscodeParser } from '../../../src/main/parsers/vscode.parser';

const FIXTURE_PATH = join(__dirname, '../../../fixtures/vscode-keybindings.json');

describe('VscodeParser', () => {
  let parser: VscodeParser;

  beforeEach(() => {
    parser = new VscodeParser();
    parser.setConfigPaths([FIXTURE_PATH]);
  });

  it('has correct metadata', () => {
    expect(parser.meta.id).toBe('vscode');
    expect(parser.meta.label).toBe('VS Code');
  });

  it('parses keybindings from JSONC fixture', async () => {
    const result = await parser.parse();

    expect(result.length).toBe(9);
    expect(result.every((kb) => kb.source === 'vscode')).toBe(true);
    expect(result.every((kb) => kb.sourceLabel === 'VS Code')).toBe(true);
  });

  it('normalizes key combos to macOS glyphs', async () => {
    const result = await parser.parse();
    const reopenTab = result.find((kb) =>
      kb.rawCommand === 'workbench.action.reopenClosedEditor',
    );
    expect(reopenTab?.key).toBe('⇧⌘t');
  });

  it('handles multi-chord keys', async () => {
    const result = await parser.parse();
    const openKb = result.find((kb) =>
      kb.rawCommand === 'workbench.action.openGlobalKeybindings',
    );
    expect(openKb?.key).toBe('⌘k ⌘s');
  });

  it('detects unbound commands (prefixed with -)', async () => {
    const result = await parser.parse();
    const unbound = result.find((kb) => kb.isUnbound);
    expect(unbound).toBeDefined();
    expect(unbound?.rawCommand).toBe('-workbench.action.showSCM');
  });

  it('captures when clauses as context', async () => {
    const result = await parser.parse();
    const withContext = result.find((kb) => kb.context === 'editorFocus');
    expect(withContext).toBeDefined();
    expect(withContext?.rawCommand).toBe('editor.action.toggleWordWrap');
  });

  it('humanizes command names', async () => {
    const result = await parser.parse();
    const showCommands = result.find(
      (kb) => kb.rawCommand === 'workbench.action.showCommands',
    );
    expect(showCommands?.command).toBe('Show Commands');
  });

  it('generates unique IDs', async () => {
    const result = await parser.parse();
    const ids = result.map((kb) => kb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty for missing file', async () => {
    const p = new VscodeParser();
    p.setConfigPaths(['/tmp/nonexistent.json']);
    const result = await p.parse();
    expect(result).toEqual([]);
  });

  it('handles empty file gracefully', async () => {
    const p = new VscodeParser();
    p.setConfigPaths([]);
    const result = await p.parse();
    expect(result).toEqual([]);
  });
});
