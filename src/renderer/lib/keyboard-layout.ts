import { useSyncExternalStore } from 'react';
import {
  type KeyModifier,
  type KeyStroke,
  NAMED_KEY_GLYPHS,
  SYMBOL_NAMES,
  US_LAYOUT,
  modsToGlyphs,
} from '../../shared/keys';
import { type KnownLayout, detectLayout } from './keyboard-layouts.data';

/**
 * Layout-aware key display. See docs/keyboard-layouts.md.
 *
 * - Physical strokes (`code` set: VS Code `[BracketLeft]`, Ghostty
 *   `bracket_left`, macOS hotkeys) show the label printed on that key of
 *   the user's layout (Italian `[BracketLeft]` → `è`).
 * - Character strokes show the character the app expects. If that
 *   character is not on a base key of the user's layout, a hint says how
 *   to type it (Italian `[` → "⌥è").
 * - Letters stay Latin on non-Latin layouts (Russian ⌘C stays ⌘C), as
 *   macOS and the apps themselves do.
 */

export interface KeyboardLayout {
  /** KeyboardEvent.code → unshifted character, as from getLayoutMap(). */
  map: ReadonlyMap<string, string>;
  /** Known layout with shift/option layers, when recognised. */
  known: KnownLayout | null;
}

export interface ResolvedStroke {
  /** Modifier glyphs + key label, e.g. "⌥⌘È". */
  text: string;
  /** Explanation when what to press differs from the US layout. */
  hint?: string;
}

const US_MAP: ReadonlyMap<string, string> = new Map(
  Object.entries(US_LAYOUT).map(([code, [base]]) => [code, base]),
);

export function makeLayout(map: ReadonlyMap<string, string>): KeyboardLayout {
  return { map, known: detectLayout(map) };
}

export const US_KEYBOARD: KeyboardLayout = makeLayout(US_MAP);

/** Latin-script (or non-letter) characters can be shown as keycap labels. */
function isLatinOrSymbol(ch: string): boolean {
  if (!/\p{L}/u.test(ch)) return true;
  return /\p{Script=Latin}/u.test(ch);
}

function keycap(ch: string): string {
  const upper = ch.toUpperCase();
  return [...upper].length === 1 ? upper : ch;
}

function hasLatinLetters(layout: KeyboardLayout): boolean {
  for (const ch of layout.map.values()) if (/^[a-z]$/.test(ch)) return true;
  return false;
}

/** How to type `ch` on a layout: the key's base label plus extra modifiers. */
function typingCombo(
  ch: string,
  layout: KeyboardLayout,
): { code: string; mods: KeyModifier[] } | null {
  for (const [code, base] of layout.map) if (base === ch) return { code, mods: [] };
  const known = layout.known;
  if (!known) return null;
  const layers: [ReadonlyMap<string, string>, KeyModifier[]][] = [
    [known.shift, ['shift']],
    [known.alt, ['opt']],
    [known.shiftAlt, ['opt', 'shift']],
  ];
  for (const [layer, mods] of layers) {
    for (const [code, c] of layer) if (c === ch) return { code, mods };
  }
  return null;
}

function usTypingCombo(ch: string): { code: string; mods: KeyModifier[] } | null {
  for (const [code, [base, shifted]] of Object.entries(US_LAYOUT)) {
    if (code === 'IntlBackslash') continue;
    if (base === ch) return { code, mods: [] };
    if (shifted === ch) return { code, mods: ['shift'] };
  }
  return null;
}

function namedLabel(key: string): string | null {
  if (NAMED_KEY_GLYPHS[key]) return NAMED_KEY_GLYPHS[key];
  if (/^F\d{1,2}$/.test(key) || /^Numpad\w+$/.test(key)) return key;
  return null;
}

/** Resolve one stroke for display on `layout`. */
export function resolveStroke(stroke: KeyStroke, layout: KeyboardLayout): ResolvedStroke {
  const mods = modsToGlyphs(stroke.mods);
  const named = namedLabel(stroke.key);
  if (named) return { text: `${mods}${named}` };

  const chars = [...stroke.key];
  if (chars.length !== 1) return { text: `${mods}${stroke.key}` };

  // Physical key position: show what is printed on that key.
  if (stroke.code) {
    const ch = layout.map.get(stroke.code);
    if (!ch || !isLatinOrSymbol(ch)) return { text: `${mods}${stroke.key}` };
    const label = keycap(ch);
    if (label === stroke.key) return { text: `${mods}${label}` };
    return {
      text: `${mods}${label}`,
      hint: `Physical key: “${label}” on your keyboard is the “${stroke.key}” key of a US keyboard.`,
    };
  }

  // Character key: the app expects this character.
  const ch = stroke.literal ? stroke.key : stroke.key.toLowerCase();
  const label = stroke.literal ? stroke.key : keycap(stroke.key);
  const text = `${mods}${label}`;
  if (/^[a-z]$/i.test(ch)) return { text }; // letters: always shown as Latin keycaps
  if (!hasLatinLetters(layout) && !layout.known) return { text };

  const combo = typingCombo(ch, layout);
  const us = usTypingCombo(ch);
  if (combo) {
    if (combo.mods.length === 0) return { text };
    const sameAsUs = us && us.code === combo.code
      && us.mods.join() === combo.mods.join() && layout.map.get(combo.code) === US_MAP.get(combo.code);
    if (sameAsUs) return { text };
    const keyLabel = keycap(layout.map.get(combo.code) ?? combo.code);
    return { text, hint: `Type “${ch}” with ${modsToGlyphs(combo.mods)}${keyLabel} on your keyboard.` };
  }
  // Unknown layout and the character is not on a base key.
  if (us && us.mods.length === 0) {
    return { text, hint: `“${ch}” is not on a key of your keyboard layout without modifiers.` };
  }
  return { text };
}

export function resolveStrokes(strokes: KeyStroke[], layout: KeyboardLayout): ResolvedStroke[] {
  return strokes.map((s) => resolveStroke(s, layout));
}

/**
 * Extra search text for a shortcut on the active layout: the resolved
 * labels, how to type hinted characters, and the US shifted character of
 * ⇧+key strokes (so "?" finds ⇧/).
 */
export function layoutSearchText(strokes: KeyStroke[] | undefined, layout: KeyboardLayout): string {
  if (!strokes || strokes.length === 0) return '';
  const words: string[] = [];
  for (const stroke of strokes) {
    const resolved = resolveStroke(stroke, layout);
    const label = resolved.text.replace(/^[⌃⌥⇧⌘]+/, '');
    words.push(resolved.text, label.toLowerCase());
    const typed = resolved.hint?.match(/with ([^ ]+) on/)?.[1];
    if (typed) words.push(typed, typed.replace(/^[⌃⌥⇧⌘]+/, '').toLowerCase());
    if (stroke.code) {
      const ch = layout.map.get(stroke.code);
      if (ch) words.push(ch);
    }
    if (stroke.mods.includes('shift') && !stroke.code) {
      const code = Object.entries(US_LAYOUT).find(([, [base]]) => base === stroke.key.toLowerCase())?.[0];
      const shifted = code ? US_LAYOUT[code][1] : undefined;
      if (shifted && !/[A-Z]/.test(shifted)) {
        words.push(shifted);
        if (SYMBOL_NAMES[shifted]) words.push(SYMBOL_NAMES[shifted]);
      }
    }
  }
  return words.join(' ');
}

// ---------------------------------------------------------------------------
// Active layout store (navigator.keyboard.getLayoutMap, US fallback)

interface NavigatorKeyboard {
  getLayoutMap?: () => Promise<ReadonlyMap<string, string>>;
  addEventListener?: (type: 'layoutchange', listener: () => void) => void;
  removeEventListener?: (type: 'layoutchange', listener: () => void) => void;
}

let current: KeyboardLayout = US_KEYBOARD;
const listeners = new Set<() => void>();
let stopWatching: (() => void) | null = null;

function keyboardApi(): NavigatorKeyboard | undefined {
  return (globalThis.navigator as (Navigator & { keyboard?: NavigatorKeyboard }) | undefined)?.keyboard;
}

function sameMap(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/** Re-read the active layout; notifies subscribers when it changed. */
export async function refreshKeyboardLayout(): Promise<void> {
  const api = keyboardApi();
  if (!api?.getLayoutMap) return;
  try {
    const map = new Map(await api.getLayoutMap());
    if (map.size === 0 || sameMap(map, current.map)) return;
    current = makeLayout(map);
    for (const listener of listeners) listener();
  } catch {
    // Not allowed (e.g. not focused): keep the last known layout.
  }
}

/** Refresh on start, focus, show, `layoutchange` and every 2 s while visible. */
function startWatching(): () => void {
  const refresh = () => void refreshKeyboardLayout();
  refresh();
  const api = keyboardApi();
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  api?.addEventListener?.('layoutchange', refresh);
  const unsubShown = window.electronAPI?.onWindowShown?.(refresh);
  // Input source switches (⌃Space) fire no event: poll while visible.
  const timer = api?.getLayoutMap
    ? window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 2000)
    : undefined;
  return () => {
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', refresh);
    api?.removeEventListener?.('layoutchange', refresh);
    unsubShown?.();
    if (timer !== undefined) window.clearInterval(timer);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') stopWatching = startWatching();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopWatching?.();
      stopWatching = null;
    }
  };
}

/** The user's active keyboard layout (US until the real one is known). */
export function useKeyboardLayout(): KeyboardLayout {
  return useSyncExternalStore(subscribe, () => current, () => US_KEYBOARD);
}
