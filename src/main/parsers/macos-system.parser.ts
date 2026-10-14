import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { MAC_KEYCODE_TO_CODE, US_LAYOUT, usKeyForCode } from '../../shared/keys';
import { BaseParser } from './base-parser';
import {
  type ParsedKey,
  Modifier,
  canonicalKeyName,
  normalizeToCanonical,
} from './key-normalizer';

/**
 * Symbolic hotkey ids (com.apple.symbolichotkeys AppleSymbolicHotKeys) →
 * the name shown in System Settings › Keyboard › Keyboard Shortcuts.
 * Only ids whose meaning is well established are listed; unknown ids are
 * skipped rather than mislabelled.
 */
const HOTKEY_NAMES: Record<number, string> = {
  7: 'Keyboard: Move focus to the menu bar',
  8: 'Keyboard: Move focus to the Dock',
  9: 'Keyboard: Move focus to active or next window',
  10: 'Keyboard: Move focus to window toolbar',
  11: 'Keyboard: Move focus to floating window',
  12: 'Keyboard: Turn keyboard access on or off',
  13: 'Keyboard: Change the way Tab moves focus',
  15: 'Accessibility: Turn zoom on or off',
  17: 'Accessibility: Zoom in',
  19: 'Accessibility: Zoom out',
  21: 'Accessibility: Invert colors',
  23: 'Accessibility: Turn image smoothing on or off',
  25: 'Accessibility: Increase contrast',
  26: 'Accessibility: Decrease contrast',
  27: 'Keyboard: Move focus to next window',
  28: 'Screenshots: Save picture of screen as a file',
  29: 'Screenshots: Copy picture of screen to the clipboard',
  30: 'Screenshots: Save picture of selected area as a file',
  31: 'Screenshots: Copy picture of selected area to the clipboard',
  32: 'Mission Control',
  33: 'Mission Control: Application windows',
  36: 'Mission Control: Show Desktop',
  52: 'Dock: Turn Dock hiding on/off',
  57: 'Keyboard: Move focus to status menus',
  59: 'Accessibility: Turn VoiceOver on or off',
  60: 'Input Sources: Select the previous input source',
  61: 'Input Sources: Select next source in Input menu',
  64: 'Spotlight: Show Spotlight search',
  65: 'Spotlight: Show Finder search window',
  79: 'Mission Control: Move left a space',
  81: 'Mission Control: Move right a space',
  98: 'Keyboard: Show Help menu',
  118: 'Mission Control: Switch to Desktop 1',
  119: 'Mission Control: Switch to Desktop 2',
  120: 'Mission Control: Switch to Desktop 3',
  121: 'Mission Control: Switch to Desktop 4',
  122: 'Mission Control: Switch to Desktop 5',
  123: 'Mission Control: Switch to Desktop 6',
  124: 'Mission Control: Switch to Desktop 7',
  125: 'Mission Control: Switch to Desktop 8',
  126: 'Mission Control: Switch to Desktop 9',
  160: 'Launchpad & Dock: Show Launchpad',
  162: 'Accessibility: Show Accessibility controls',
  163: 'Mission Control: Show Notification Center',
  175: 'Mission Control: Turn Do Not Disturb on/off',
  184: 'Screenshots: Screenshot and recording options',
  190: 'Mission Control: Quick Note',
  222: 'Mission Control: Turn Stage Manager on/off',
};

/** Convert macOS modifier bitfield flags (NSEventModifierFlags) to Modifier enum array. */
function modifierFlagsToModifiers(flags: number): Modifier[] {
  const mods: Modifier[] = [];
  if (flags & 0x40000) mods.push(Modifier.Control);
  if (flags & 0x80000) mods.push(Modifier.Option);
  if (flags & 0x20000) mods.push(Modifier.Shift);
  if (flags & 0x100000) mods.push(Modifier.Command);
  return mods;
}

/**
 * Key of a symbolic hotkey. macOS matches these by virtual keycode, i.e.
 * a physical key position, so the key carries a KeyboardEvent.code and the
 * renderer shows the label of that position on the active layout. The
 * stored character (layout at recording time) is only a fallback.
 */
function hotkeyKey(charCode: number, keyCode: number): Pick<ParsedKey, 'key' | 'code'> | null {
  const code = MAC_KEYCODE_TO_CODE[keyCode];
  if (code) {
    const key = usKeyForCode(code) ?? code;
    return code in US_LAYOUT ? { key, code } : { key };
  }
  if (charCode >= 33 && charCode < 0xffff) {
    return { key: canonicalKeyName(String.fromCharCode(charCode)) };
  }
  return null;
}

/** NSUserKeyEquivalents function-key characters (NSEvent function key unicodes). */
const FUNCTION_KEY_CHARS: Record<number, string> = {
  0xf700: '↑', 0xf701: '↓', 0xf702: '←', 0xf703: '→',
  0xf727: 'Insert', 0xf728: 'Delete', 0xf729: 'Home', 0xf72b: 'End',
  0xf72c: 'PageUp', 0xf72d: 'PageDown',
  0x08: 'Backspace', 0x7f: 'Backspace', 0x0d: 'Return', 0x03: 'Return',
  0x09: 'Tab', 0x1b: 'Escape', 0x20: 'Space',
};

/** NSUserKeyEquivalents menu paths are separated by ESC. */
const MENU_PATH_SEPARATOR = String.fromCharCode(0x1b);

/**
 * Parse an NSUserKeyEquivalents value: modifier prefix characters
 * (`@` ⌘, `~` ⌥, `$` ⇧, `^` ⌃) followed by the key character.
 */
export function parseKeyEquivalent(value: string): ParsedKey | null {
  const modifiers: Modifier[] = [];
  let i = 0;
  const flags: Record<string, Modifier> = {
    '@': Modifier.Command,
    '~': Modifier.Option,
    $: Modifier.Shift,
    '^': Modifier.Control,
  };
  const chars = [...value];
  while (i < chars.length - 1 && flags[chars[i]] !== undefined) {
    modifiers.push(flags[chars[i]]);
    i++;
  }
  const keyChar = chars.slice(i).join('');
  if ([...keyChar].length !== 1) return null;
  const cp = keyChar.codePointAt(0) ?? 0;
  if (FUNCTION_KEY_CHARS[cp]) return { modifiers, key: FUNCTION_KEY_CHARS[cp] };
  if (cp >= 0xf704 && cp <= 0xf726) return { modifiers, key: `F${cp - 0xf704 + 1}` };
  // An uppercase letter in a key equivalent implies Shift.
  if (/[A-Z]/.test(keyChar) && !modifiers.includes(Modifier.Shift)) modifiers.push(Modifier.Shift);
  return { modifiers, key: canonicalKeyName(keyChar) };
}

export class MacosSystemParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'macos-system',
      label: 'macOS',
      icon: '🍎',
      platforms: ['darwin'],
    };
  }

  async isAvailable(): Promise<boolean> {
    return (
      process.platform === 'darwin' &&
      this.getConfigPaths().some((p) => existsSync(p))
    );
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Shortcut[]> {
    const keybindings: Shortcut[] = [];

    for (const filePath of this.getWatchPaths()) {
      const plist = this.readPlist(filePath);
      if (!plist) continue;
      keybindings.push(...this.parsePlist(plist, filePath));
    }

    return keybindings;
  }

  /** Extract shortcuts from a decoded plist (symbolic hotkeys and/or app shortcuts). */
  parsePlist(plist: Record<string, unknown>, filePath: string): Shortcut[] {
    const result: Shortcut[] = [];

    const symbolicHotkeys = plist.AppleSymbolicHotKeys;
    if (symbolicHotkeys && typeof symbolicHotkeys === 'object') {
      for (const [idStr, entry] of Object.entries(
        symbolicHotkeys as Record<string, PlistHotkeyEntry>,
      )) {
        const id = parseInt(idStr, 10);
        const actionName = HOTKEY_NAMES[id];
        if (!actionName) continue;

        const params = entry?.value?.parameters;
        if (!Array.isArray(params) || params.length < 3) continue;
        const [charCode, keyCode, modFlags] = params;
        const key = hotkeyKey(charCode, keyCode);
        if (!key) continue;

        const normalized = normalizeToCanonical({
          modifiers: modifierFlagsToModifiers(modFlags),
          ...key,
        });
        result.push(
          this.makeShortcut({
            key: normalized.displayKey,
            searchKey: normalized.searchKey,
            strokes: normalized.strokes,
            command: actionName,
            rawCommand: `symbolichotkey:${id}`,
            isDefault: false,
            // Disabled in System Settings: listed, but not active.
            isUnbound: !entry.enabled,
            filePath,
            origin: 'app-defaults',
          }),
        );
      }
    }

    const keyEquivalents = plist.NSUserKeyEquivalents;
    if (keyEquivalents && typeof keyEquivalents === 'object') {
      for (const [menuTitle, value] of Object.entries(
        keyEquivalents as Record<string, unknown>,
      )) {
        if (typeof value !== 'string') continue;
        const parsed = parseKeyEquivalent(value);
        if (!parsed) continue;
        const normalized = normalizeToCanonical(parsed);
        result.push(
          this.makeShortcut({
            key: normalized.displayKey,
            searchKey: normalized.searchKey,
            strokes: normalized.strokes,
            // "\u001bWindow\u001bZoom" addresses a submenu item: show it as a path.
            command: menuTitle.split(MENU_PATH_SEPARATOR).filter(Boolean).join(' › '),
            rawCommand: `menu:${menuTitle}`,
            context: 'App Shortcuts',
            isDefault: false,
            isUnbound: false,
            filePath,
          }),
        );
      }
    }

    return result;
  }

  private readPlist(
    filePath: string,
  ): Record<string, unknown> | null {
    try {
      if (filePath.endsWith('.json')) {
        return JSON.parse(readFileSync(filePath, 'utf-8'));
      }
      const jsonStr = execFileSync(
        'plutil',
        ['-convert', 'json', '-o', '-', filePath],
        { encoding: 'utf-8', timeout: 5000 },
      );
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }
}

interface PlistHotkeyEntry {
  enabled: boolean;
  value?: {
    parameters?: number[];
  };
}
