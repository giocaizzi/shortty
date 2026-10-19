import { existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { usKeyForCode } from '../../shared/keys';
import { BaseParser } from './base-parser';
import { Modifier, type ParsedKey, formatCheatsheetKey, normalizeSequence } from './key-normalizer';
import { POWERTOYS_HOTKEYS } from './data/powertoys-hotkeys';

/** A PowerToys hotkey: `{ win, ctrl, alt, shift, code }`, `code` a Windows virtual-key code. */
interface Hotkey {
  win?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  code: number;
}

/** Virtual-key codes of modifiers (generic, left, right). */
const VK_MODIFIERS: Record<number, Modifier> = {
  16: Modifier.Shift, 160: Modifier.Shift, 161: Modifier.Shift,
  17: Modifier.Control, 162: Modifier.Control, 163: Modifier.Control,
  18: Modifier.Option, 164: Modifier.Option, 165: Modifier.Option,
  91: Modifier.Command, 92: Modifier.Command,
};

const MODIFIER_LABELS: Record<Modifier, string> = {
  [Modifier.Command]: 'Win',
  [Modifier.Control]: 'Ctrl',
  [Modifier.Option]: 'Alt',
  [Modifier.Shift]: 'Shift',
};

/** Non-character virtual keys → KeyboardEvent.code (OEM keys keep their physical position). */
const VK_CODES: Record<number, string> = {
  8: 'Backspace', 9: 'Tab', 13: 'Enter', 27: 'Escape', 32: 'Space',
  33: 'PageUp', 34: 'PageDown', 35: 'End', 36: 'Home',
  37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 45: 'Insert', 46: 'Delete',
  20: 'CapsLock', 106: 'NumpadMultiply', 107: 'NumpadAdd', 109: 'NumpadSubtract',
  110: 'NumpadDecimal', 111: 'NumpadDivide',
  186: 'Semicolon', 187: 'Equal', 188: 'Comma', 189: 'Minus', 190: 'Period', 191: 'Slash',
  192: 'Backquote', 219: 'BracketLeft', 220: 'Backslash', 221: 'BracketRight', 222: 'Quote',
  226: 'IntlBackslash',
};

const VK_NAMES: Record<number, string> = {
  19: 'Pause', 44: 'PrintScreen', 93: 'ContextMenu', 144: 'NumLock', 145: 'ScrollLock',
};

/** Keyboard Manager's "Disable" target. */
const VK_DISABLED = 256;

/** Key of a non-modifier virtual-key code, or null when unknown. */
function vkKey(vk: number): Pick<ParsedKey, 'key' | 'code'> | null {
  if ((vk >= 48 && vk <= 57) || (vk >= 65 && vk <= 90)) return { key: String.fromCharCode(vk) };
  if (vk >= 96 && vk <= 105) return { key: `Numpad${vk - 96}` };
  if (vk >= 112 && vk <= 135) return { key: `F${vk - 111}` };
  if (VK_NAMES[vk]) return { key: VK_NAMES[vk] };
  const code = VK_CODES[vk];
  if (!code) return null;
  const key = usKeyForCode(code) ?? code;
  return key.length === 1 ? { key, code } : { key };
}

/** `[162, 67]` (Keyboard Manager `"162;67"`) → Ctrl+C; a lone modifier is its own key. */
function vksToKey(vks: number[]): ParsedKey | null {
  const modifiers: Modifier[] = [];
  let key: Pick<ParsedKey, 'key' | 'code'> | null = null;
  for (const vk of vks) {
    const mod = VK_MODIFIERS[vk];
    if (mod !== undefined && vks.length > 1) modifiers.push(mod);
    else key = mod !== undefined ? { key: MODIFIER_LABELS[mod] } : vkKey(vk);
  }
  return key ? { modifiers, ...key } : null;
}

function hotkeyToKey(h: Hotkey): ParsedKey | null {
  const key = vkKey(h.code);
  if (!key) return null;
  const modifiers = [
    h.win && Modifier.Command, h.ctrl && Modifier.Control, h.alt && Modifier.Option, h.shift && Modifier.Shift,
  ].filter((m): m is Modifier => m !== false && m !== undefined);
  return { modifiers, ...key };
}

/** "Win+Ctrl+V", for labels such as "Remapped to Ctrl+V". */
function keyText(k: ParsedKey): string {
  const order = [Modifier.Command, Modifier.Control, Modifier.Option, Modifier.Shift];
  return [...order.filter((m) => k.modifiers.includes(m)).map((m) => MODIFIER_LABELS[m]), k.key].join('+');
}

function isHotkey(v: unknown): v is Hotkey {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.code === 'number' && ['win', 'ctrl', 'alt', 'shift'].some((m) => typeof o[m] === 'boolean');
}

/** `paste-as-json-hotkey` / `MouseJump` → "Paste As Json" / "Mouse Jump". */
function humanize(s: string): string {
  return s
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s(?:hotkey|shortcut)$/i, '')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Every hotkey in a module's `properties`, with its property path and the `name` of an enclosing list item. */
function findHotkeys(value: unknown, path: string, name?: string): { path: string; name?: string; hotkey: Hotkey }[] {
  if (isHotkey(value)) return [{ path, name, hotkey: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findHotkeys(item, `${path}[${i}]`,
      item && typeof item === 'object' && typeof item.name === 'string' ? item.name : name));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) =>
    findHotkeys(v, k === 'value' ? path : path ? `${path}.${k}` : k, name));
}

interface Remap {
  originalKeys?: unknown;
  newRemapKeys?: unknown;
  unicodeText?: unknown;
  newText?: unknown;
  runProgramFilePath?: unknown;
  openUri?: unknown;
  targetApp?: unknown;
}

const vkList = (s: unknown): number[] =>
  typeof s === 'string' ? s.split(';').map(Number).filter((n) => Number.isInteger(n)) : [];

/**
 * PowerToys (Windows): each module's `settings.json` under
 * `%LOCALAPPDATA%/Microsoft/PowerToys/<module>/` holds its hotkeys as
 * `{ win, ctrl, alt, shift, code }` (code: virtual-key code, 0 when
 * cleared). A hotkey still on its default is skipped (the cheatsheet lists
 * it), a changed one replaces the default, a cleared one or one of a
 * module turned off in the general `settings.json` (`enabled`) is
 * unbound. Keyboard Manager's `default.json` adds the remapped keys and
 * shortcuts, per app when `targetApp` is set.
 */
export class PowerToysParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'powertoys',
      label: 'PowerToys',
      icon: '🧰',
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
    const files: { filePath: string; data: Record<string, unknown> }[] = [];
    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;
      try {
        const data = JSON.parse(content.replace(/^\uFEFF/, ''));
        if (data && typeof data === 'object') files.push({ filePath, data });
      } catch {
        continue;
      }
    }

    // The general settings.json: which modules are on, no hotkeys of its own.
    const general = files.find((f) => f.data.enabled && typeof f.data.enabled === 'object');
    const enabled = (general?.data.enabled ?? {}) as Record<string, unknown>;
    const isOff = (module: string) => enabled[module] === false;

    const shortcuts: Shortcut[] = [];
    // A removal without a key unbinds the cheatsheet entry of that command, whatever its key.
    const unbind = (rawCommand: string, filePath: string) => {
      const def = POWERTOYS_HOTKEYS[rawCommand];
      shortcuts.push(this.makeShortcut({
        key: '', searchKey: '', strokes: [], command: def.command, rawCommand, category: def.category,
        isDefault: false, isUnbound: true, filePath,
      }));
    };

    for (const { filePath, data } of files) {
      if (data === general?.data) continue;
      const module = basename(dirname(filePath));
      if (module === 'Keyboard Manager') {
        if (!isOff(module)) shortcuts.push(...this.parseRemaps(data, filePath));
        continue;
      }

      for (const { path, name, hotkey } of findHotkeys(data.properties, '')) {
        const rawCommand = `${module}.${path}`;
        const def = POWERTOYS_HOTKEYS[rawCommand];
        const parsed = hotkeyToKey(hotkey);
        if (!parsed) {
          // Cleared (code 0): the default no longer applies.
          if (def && hotkey.code === 0) unbind(rawCommand, filePath);
          continue;
        }
        const { displayKey, searchKey, strokes } = normalizeSequence([parsed]);
        if (def && searchKey === formatCheatsheetKey(def.key).searchKey) continue;
        shortcuts.push(this.makeShortcut({
          key: displayKey,
          searchKey,
          strokes,
          command: def?.command ?? name ?? `${humanize(module)}: ${humanize(path.replace(/\[\d+\]/g, ''))}`,
          rawCommand,
          category: def?.category ?? humanize(module),
          isDefault: false,
          // A known hotkey of a module turned off is unbound below, keeping its configured key.
          isUnbound: !def && isOff(module),
          filePath,
        }));
      }
    }

    // A module turned off: its hotkeys do nothing.
    if (general) {
      for (const rawCommand of Object.keys(POWERTOYS_HOTKEYS)) {
        if (isOff(rawCommand.slice(0, rawCommand.indexOf('.')))) unbind(rawCommand, general.filePath);
      }
    }

    return shortcuts;
  }

  /** Keyboard Manager: `remapKeys`, `remapKeysToText`, `remapShortcuts`, `remapShortcutsToText`. */
  private parseRemaps(data: Record<string, unknown>, filePath: string): Shortcut[] {
    const shortcuts: Shortcut[] = [];
    for (const section of ['remapKeys', 'remapKeysToText', 'remapShortcuts', 'remapShortcutsToText']) {
      const groups = data[section];
      if (!groups || typeof groups !== 'object') continue;
      for (const list of Object.values(groups)) {
        if (!Array.isArray(list)) continue;
        for (const remap of list as Remap[]) {
          const original = vksToKey(vkList(remap?.originalKeys));
          if (!original) continue;
          const target = vkList(remap.newRemapKeys);
          const text = typeof remap.unicodeText === 'string' ? remap.unicodeText
            : typeof remap.newText === 'string' ? remap.newText : null;
          const targetKey = vksToKey(target);
          let command: string;
          if (typeof remap.runProgramFilePath === 'string' && remap.runProgramFilePath) {
            command = `Run ${basename(remap.runProgramFilePath.replace(/\\/g, '/'))}`;
          } else if (typeof remap.openUri === 'string' && remap.openUri) {
            command = `Open ${remap.openUri}`;
          } else if (text !== null) {
            command = `Type “${text}”`;
          } else if (target.length === 1 && target[0] === VK_DISABLED) {
            command = 'Disabled';
          } else if (targetKey) {
            command = `Remapped to ${keyText(targetKey)}`;
          } else {
            continue;
          }
          const { displayKey, searchKey, strokes } = normalizeSequence([original]);
          shortcuts.push(this.makeShortcut({
            key: displayKey,
            searchKey,
            strokes,
            command,
            rawCommand: `KeyboardManager.${section}`,
            context: typeof remap.targetApp === 'string' && remap.targetApp ? remap.targetApp : undefined,
            category: 'Keyboard Manager',
            isDefault: false,
            isUnbound: false,
            filePath,
          }));
        }
      }
    }
    return shortcuts;
  }
}
