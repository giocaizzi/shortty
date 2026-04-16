import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import {
  type ParsedKey,
  Modifier,
  normalizeToCanonical,
  charCodeToKeyName,
} from './key-normalizer';

/** Maps symbolic hotkey IDs to human-readable action names. */
const HOTKEY_NAMES: Record<number, string> = {
  7: 'Dock: Move focus to Dock',
  8: 'Dock: Move focus to active window',
  9: 'Dock: Move focus to window toolbar',
  10: 'Dock: Move focus to floating window',
  11: 'Mission Control: Move focus to next window',
  12: 'Mission Control: Move focus to previous window',
  13: 'Dock: Turn Dock Hiding On/Off',
  27: 'Dock: Move focus to the window drawer',
  32: 'Mission Control',
  33: 'Application Windows',
  34: 'Show Desktop',
  35: 'Move Left a Space',
  36: 'Move Right a Space',
  37: 'Spaces: Show Spaces bar',
  51: 'Accessibility: Move focus to the status menus',
  52: 'Dock: Turn Notifications On/Off',
  57: 'Accessibility: Turn VoiceOver On/Off',
  59: 'Accessibility: Turn Zoom On/Off',
  60: 'Accessibility: Zoom In',
  61: 'Accessibility: Zoom Out',
  64: 'Spotlight: Show Spotlight search',
  65: 'Spotlight: Show Finder search window',
  70: 'Dashboard: Show Dashboard',
  73: 'Input Sources: Select the previous input source',
  75: 'Input Sources: Select next source in input menu',
  79: 'Screenshots: Screenshot (full screen)',
  80: 'Screenshots: Screenshot (selection)',
  81: 'Screenshots: Screenshot (window)',
  118: 'Quick Note',
  160: 'Show Launchpad',
  162: 'Show Notification Center',
  163: 'Dock: Turn Do Not Disturb On/Off',
  175: 'Accessibility: Turn Focus following On/Off',
};

/** Convert macOS modifier bitfield flags to Modifier enum array. */
function modifierFlagsToModifiers(flags: number): Modifier[] {
  const mods: Modifier[] = [];
  if (flags & 262144) mods.push(Modifier.Control);
  if (flags & 524288) mods.push(Modifier.Option);
  if (flags & 131072) mods.push(Modifier.Shift);
  if (flags & 1048576) mods.push(Modifier.Command);
  return mods;
}

/**
 * Convert a macOS virtual key code to a readable key name.
 * Only used for non-printable keys where the char code is not useful.
 */
const NON_PRINTABLE_KEY_MAP: Record<number, string> = {
  36: 'Return', 48: 'Tab', 49: 'Space', 51: 'Delete', 53: 'Escape',
  96: 'F5', 97: 'F6', 98: 'F7', 99: 'F3', 100: 'F8', 101: 'F9',
  103: 'F11', 105: 'F13', 107: 'F14', 109: 'F10', 111: 'F12',
  113: 'F15', 118: 'F4', 119: 'F2', 120: 'F1', 121: 'F16', 122: 'F17',
  123: '←', 124: '→', 125: '↓', 126: '↑',
};

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

      const symbolicHotkeys = plist.AppleSymbolicHotKeys;
      if (!symbolicHotkeys || typeof symbolicHotkeys !== 'object') continue;

      for (const [idStr, entry] of Object.entries(
        symbolicHotkeys as Record<string, PlistHotkeyEntry>,
      )) {
        const id = parseInt(idStr, 10);
        const actionName = HOTKEY_NAMES[id];
        if (!actionName) continue;
        if (!entry.enabled) continue;

        const params = entry.value?.parameters;
        if (!Array.isArray(params) || params.length < 3) continue;

        const [charCode, keyCode, modFlags] = params;
        const modifiers = modifierFlagsToModifiers(modFlags);

        // Use charCode (layout-correct) for printable characters,
        // fall back to keyCode map for non-printable keys (function keys, arrows, etc.)
        const keyFromChar = charCodeToKeyName(charCode);
        const keyName = keyFromChar ?? NON_PRINTABLE_KEY_MAP[keyCode] ?? `Key${keyCode}`;

        const parsed: ParsedKey = { modifiers, key: keyName };
        const { displayKey, searchKey } = normalizeToCanonical(parsed);

        keybindings.push(
          this.makeShortcut({
            key: displayKey,
            searchKey,
            command: actionName,
            rawCommand: `symbolichotkey:${id}`,
            isDefault: true,
            isUnbound: false,
            filePath,
          }),
        );
      }
    }

    return keybindings;
  }

  private readPlist(
    filePath: string,
  ): Record<string, unknown> | null {
    try {
      const jsonStr = execSync(
        `plutil -convert json -o - "${filePath}"`,
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
