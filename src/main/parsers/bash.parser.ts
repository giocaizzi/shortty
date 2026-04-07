import { existsSync } from 'node:fs';
import type { Keybinding, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { type ParsedKey, Modifier, normalizeToCanonical } from './key-normalizer';

/** Known escape sequences shared with terminal key parsing. */
const ESCAPE_SEQUENCES: Array<{ pattern: RegExp; toKey: ParsedKey }> = [
  { pattern: /^\\e\[1;5A$/, toKey: { modifiers: [Modifier.Control], key: '↑' } },
  { pattern: /^\\e\[1;5B$/, toKey: { modifiers: [Modifier.Control], key: '↓' } },
  { pattern: /^\\e\[1;5C$/, toKey: { modifiers: [Modifier.Control], key: '→' } },
  { pattern: /^\\e\[1;5D$/, toKey: { modifiers: [Modifier.Control], key: '←' } },
  { pattern: /^\\e\[1;3A$/, toKey: { modifiers: [Modifier.Option], key: '↑' } },
  { pattern: /^\\e\[1;3B$/, toKey: { modifiers: [Modifier.Option], key: '↓' } },
  { pattern: /^\\e\[1;3C$/, toKey: { modifiers: [Modifier.Option], key: '→' } },
  { pattern: /^\\e\[1;3D$/, toKey: { modifiers: [Modifier.Option], key: '←' } },
  { pattern: /^\\e\[A$/, toKey: { modifiers: [], key: '↑' } },
  { pattern: /^\\e\[B$/, toKey: { modifiers: [], key: '↓' } },
  { pattern: /^\\e\[C$/, toKey: { modifiers: [], key: '→' } },
  { pattern: /^\\e\[D$/, toKey: { modifiers: [], key: '←' } },
  { pattern: /^\\e\[3~$/, toKey: { modifiers: [], key: 'Delete' } },
  { pattern: /^\\e\[2~$/, toKey: { modifiers: [], key: 'Insert' } },
  { pattern: /^\\e\[5~$/, toKey: { modifiers: [], key: 'PageUp' } },
  { pattern: /^\\e\[6~$/, toKey: { modifiers: [], key: 'PageDown' } },
  { pattern: /^\\eOH$/, toKey: { modifiers: [], key: 'Home' } },
  { pattern: /^\\eOF$/, toKey: { modifiers: [], key: 'End' } },
  { pattern: /^\\e\[H$/, toKey: { modifiers: [], key: 'Home' } },
  { pattern: /^\\e\[F$/, toKey: { modifiers: [], key: 'End' } },
];

/** Regex for .inputrc key bindings: "sequence": function-name */
const INPUTRC_BINDING_RE = /^"([^"]+)":\s*(.+)$/;

/** Regex for .bashrc bind command: bind '"sequence" function-name' */
const BASHRC_BIND_RE = /^bind\s+'?"([^"]+)"\s*:?\s*(.+?)'?$/;

/** Regex for .bashrc bind -x command: bind -x '"sequence": command' */
const BASHRC_BIND_X_RE = /^bind\s+-x\s+'?"([^"]+)":\s*(.+?)'?$/;

export class BashParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'bash',
      label: 'Bash',
      icon: '🐚',
      platforms: ['darwin', 'linux'],
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.getConfigPaths().some((p) => existsSync(p));
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Keybinding[]> {
    const keybindings: Keybinding[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      const isInputrc = filePath.endsWith('inputrc') || filePath.includes('inputrc');
      let editingMode: string | undefined;

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Detect editing mode
        const modeMatch = trimmed.match(/^set\s+editing-mode\s+(\S+)/);
        if (modeMatch) {
          editingMode = modeMatch[1];
          continue;
        }

        let sequence: string | undefined;
        let command: string | undefined;

        if (isInputrc) {
          const match = trimmed.match(INPUTRC_BINDING_RE);
          if (match) {
            [, sequence, command] = match;
          }
        } else {
          // .bashrc: try bind -x first, then regular bind
          const bindXMatch = trimmed.match(BASHRC_BIND_X_RE);
          if (bindXMatch) {
            [, sequence, command] = bindXMatch;
          } else {
            const bindMatch = trimmed.match(BASHRC_BIND_RE);
            if (bindMatch) {
              [, sequence, command] = bindMatch;
            }
          }
        }

        if (!sequence || !command) continue;

        command = command.trim();
        const { displayKey, searchKey } = this.normalizeBashKey(sequence);

        keybindings.push(
          this.makeKeybinding({
            key: displayKey,
            searchKey,
            command: this.humanizeFunction(command),
            rawCommand: trimmed,
            context: editingMode,
            isDefault: false,
            isUnbound: false,
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  /** Normalize readline/bash key sequences into display and search forms. */
  private normalizeBashKey(sequence: string): {
    displayKey: string;
    searchKey: string;
  } {
    // Check known escape sequences first
    for (const { pattern, toKey } of ESCAPE_SEQUENCES) {
      if (pattern.test(sequence)) {
        return normalizeToCanonical(toKey);
      }
    }

    // Multi-key sequences like \C-x\C-e
    const ctrlSeqParts = sequence.match(/\\C-./g);
    if (ctrlSeqParts && ctrlSeqParts.length > 1) {
      const parsed = ctrlSeqParts.map((part) => {
        const key = part.slice(3).toUpperCase();
        return normalizeToCanonical({ modifiers: [Modifier.Control], key });
      });
      const display = parsed.map((p) => p.displayKey).join(' ');
      const search = parsed.map((p) => p.searchKey).join(' ');
      return { displayKey: display, searchKey: search };
    }

    const modifiers: Modifier[] = [];
    let remaining = sequence;

    // \M- or \e (Alt/Meta)
    if (remaining.startsWith('\\M-')) {
      modifiers.push(Modifier.Option);
      remaining = remaining.slice(3);
    } else if (remaining.startsWith('\\e')) {
      modifiers.push(Modifier.Option);
      remaining = remaining.slice(2);
    }

    // \C- (Ctrl)
    if (remaining.startsWith('\\C-')) {
      modifiers.push(Modifier.Control);
      remaining = remaining.slice(3);
    }

    const key = remaining.length === 1 ? remaining.toUpperCase() : remaining;
    return normalizeToCanonical({ modifiers, key });
  }

  /** Humanize a readline function name. */
  private humanizeFunction(fn: string): string {
    return fn
      .replace(/-/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  }
}
