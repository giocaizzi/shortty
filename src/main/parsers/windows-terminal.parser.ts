import { existsSync } from 'node:fs';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { usKeyForCode } from '../../shared/keys';
import { BaseParser } from './base-parser';
import { type NormalizedKey, normalizeSequence, parseKeyCombo } from './key-normalizer';
import { stripJsonc } from './vscode.parser';
import { WT_DEFAULT_ACTIONS } from './data/windows-terminal-actions';

type WtCommand = string | Record<string, unknown> | null;

interface WtEntry {
  command?: WtCommand;
  id?: string | null;
  keys?: unknown;
  name?: unknown;
}

/** Scan codes (`sc(41)`) → KeyboardEvent.code. */
// ponytail: only the default quake key (win+sc(41)); add codes when users bind others
const SCAN_CODES: Record<string, string> = { '41': 'Backquote' };

/** Canonical text of a command: `newTab`, `splitPane(split="down",splitMode="duplicate")`. */
export function commandKey(command: WtCommand | undefined): string | null {
  if (typeof command === 'string') return command;
  if (!command || typeof command !== 'object' || typeof command.action !== 'string') return null;
  const args = Object.keys(command)
    .filter((k) => k !== 'action')
    .sort()
    .map((k) => `${k}=${JSON.stringify(command[k])}`);
  return args.length > 0 ? `${command.action}(${args.join(',')})` : command.action;
}

const DEFAULT_ID_BY_COMMAND = new Map(
  Object.entries(WT_DEFAULT_ACTIONS).map(([id, command]) => [commandKey(command), id]),
);

/**
 * Windows Terminal settings.json (JSONC). Supports the legacy format
 * (`keybindings` or `actions` entries with `command` + `keys`) and the
 * 1.21+ split format (`actions` with `command` + `id`, `keybindings` with
 * `id` + `keys`). `"command": "unbound"`, `"command": null` or
 * `"id": null` removes the default bound to those keys. A binding whose
 * command is a default action gets that action's id as rawCommand, so it
 * merges with the cheatsheet entry.
 */
export class WindowsTerminalParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'windows-terminal',
      label: 'Windows Terminal',
      icon: '⬛',
      platforms: ['win32'],
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.getConfigPaths().some((p) => existsSync(p));
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Shortcut[]> {
    const shortcuts: Shortcut[] = [];

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;

      let settings: { actions?: unknown; keybindings?: unknown };
      try {
        settings = JSON.parse(stripJsonc(content)) ?? {};
      } catch {
        continue;
      }
      const entries = [settings.actions, settings.keybindings]
        .flatMap((list) => (Array.isArray(list) ? list : []))
        .filter((e): e is WtEntry => !!e && typeof e === 'object');

      const commands = new Map<string, WtCommand>(Object.entries(WT_DEFAULT_ACTIONS));
      const names = new Map<string, string>();
      for (const e of entries) {
        if (typeof e.id !== 'string' || !('command' in e)) continue;
        commands.set(e.id, e.command ?? null);
        if (typeof e.name === 'string' && e.name) names.set(e.id, e.name);
      }

      for (const entry of entries) {
        const keys = (Array.isArray(entry.keys) ? entry.keys : [entry.keys])
          .filter((k): k is string => typeof k === 'string' && k.trim() !== '');
        if (keys.length === 0) continue;

        const command = 'command' in entry
          ? entry.command ?? null
          : entry.id === null ? null : commands.get(entry.id ?? '');
        const isUnbound = command === null || command === 'unbound';
        const canonical = commandKey(command);
        const rawCommand = isUnbound
          ? 'unbound'
          : (canonical && DEFAULT_ID_BY_COMMAND.get(canonical))
            ?? (typeof entry.id === 'string' ? entry.id : canonical);
        if (!rawCommand) continue;

        const name = typeof entry.name === 'string' && entry.name ? entry.name : names.get(entry.id ?? '');
        const label = name ?? (isUnbound ? 'Unbound' : humanize(command ?? rawCommand));

        for (const k of keys) {
          const { displayKey, searchKey, strokes } = normalizeWtKey(k);
          shortcuts.push(
            this.makeShortcut({
              key: displayKey,
              searchKey,
              strokes,
              command: label,
              rawCommand,
              isDefault: false,
              isUnbound,
              filePath,
            }),
          );
        }
      }
    }

    return shortcuts;
  }
}

/** `ctrl+shift+t`, `alt+shift+plus`, `win+sc(41)`; space-separated chords. */
function normalizeWtKey(keys: string): NormalizedKey {
  return normalizeSequence(keys.trim().split(/\s+/).map((chord) => {
    const parsed = parseKeyCombo(chord);
    const code = SCAN_CODES[parsed.key.match(/^sc\((\d+)\)$/i)?.[1] ?? ''];
    return code ? { ...parsed, key: usKeyForCode(code) ?? code, code } : parsed;
  }));
}

/** `splitPane` + `{ split: "vertical" }` → "Split Pane (split: vertical)". */
function humanize(command: string | Record<string, unknown>): string {
  const title = (s: string) => s
    .replace(/^(?:Terminal|User)\./, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
  if (typeof command === 'string') return title(command);
  const args = Object.entries(command)
    .filter(([k]) => k !== 'action')
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  const name = title(String(command.action));
  return args.length > 0 ? `${name} (${args.join(', ')})` : name;
}
