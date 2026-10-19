import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatCheatsheetKey } from '../../../src/main/parsers/key-normalizer';
import { NAMED_KEY_GLYPHS } from '../../../src/shared/keys';

const SOURCES = join(__dirname, '../../../src/cheatsheets/sources');
const SCHEMA = JSON.parse(readFileSync(join(__dirname, '../../../src/cheatsheets/schema.json'), 'utf-8'));

interface Schema {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  minItems?: number;
}

/** Minimal JSON Schema (draft-07 subset used by schema.json) validator. */
function validate(value: unknown, schema: Schema, path = '$'): string[] {
  const errors: string[] = [];
  const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(typeOf(value))) return [`${path}: expected ${types.join('|')}, got ${typeOf(value)}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${String(value)} not in enum`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items as Schema, `${path}[${i}]`)));
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const req of schema.required ?? []) if (!(req in obj)) errors.push(`${path}: missing ${req}`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (k in obj) errors.push(...validate(obj[k], sub, `${path}.${k}`));
    }
  }
  return errors;
}

const files = readdirSync(SOURCES).filter((f) => f.endsWith('.json'));

describe('shipped cheatsheets', () => {
  it('ships one file per source', () => {
    expect(files.sort()).toEqual([
      'bash.json', 'chrome.json', 'explorer.json', 'finder.json', 'ghostty.json', 'macos-system.json',
      'obsidian.json', 'powertoys.json', 'psreadline.json', 'tmux.json', 'vim.json', 'vscode.json', 'windows-system.json',
      'windows-terminal.json', 'zsh.json',
    ]);
  });

  it('each file points editors at the schema', () => {
    for (const f of files) {
      expect(JSON.parse(readFileSync(join(SOURCES, f), 'utf-8')).$schema, f).toBe('../schema.json');
    }
  });

  it('declares how each parsed source merges user bindings (docs/spec.md §6.2)', () => {
    const modes = Object.fromEntries(files.map((f) => {
      const data = JSON.parse(readFileSync(join(SOURCES, f), 'utf-8'));
      return [data.id, data.mergeMode ?? null];
    }));
    expect(modes).toEqual({
      bash: 'additive', chrome: 'additive', explorer: null, finder: null, ghostty: 'additive',
      'macos-system': 'replace', obsidian: 'replace', powertoys: 'replace', psreadline: 'additive', tmux: 'additive',
      vim: 'additive', vscode: 'additive', 'windows-system': null, 'windows-terminal': 'additive',
      zsh: 'additive',
    });
  });

  for (const file of files) {
    describe(file, () => {
      const data = JSON.parse(readFileSync(join(SOURCES, file), 'utf-8'));

      it('validates against schema.json', () => {
        expect(validate(data, SCHEMA)).toEqual([]);
      });

      it('has an id matching the file name and unique rawCommands', () => {
        expect(`${data.id}.json`).toBe(file);
        const raws = data.shortcuts.map((s: { rawCommand: string }) => s.rawCommand);
        expect(raws.filter((r: string, i: number) => raws.indexOf(r) !== i)).toEqual([]);
      });

      it('only uses key names the normalizer understands', () => {
        const literalText = data.id === 'vim';
        for (const s of data.shortcuts) {
          for (const [platform, key] of Object.entries(s.key as Record<string, string>)) {
            const { strokes } = formatCheatsheetKey(key, { literalText });
            for (const stroke of strokes) {
              if (stroke.literal) continue;
              const known = [...stroke.key].length === 1
                || stroke.key in NAMED_KEY_GLYPHS
                || /^F\d{1,2}$/.test(stroke.key)
                || /^Numpad\w+$/.test(stroke.key);
              expect(known, `${file} ${s.rawCommand} ${platform}: "${key}" → "${stroke.key}"`).toBe(true);
            }
          }
        }
      });
    });
  }
});
