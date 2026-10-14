# Keyboard layouts

Shortty shows every shortcut as the keys the user must press **on their own
keyboard layout** (Italian, German, French, Dvorak, Russian, ...), not as
they are written in a US-centric config file.

## The problem

Config files describe keys in three different ways:

| Kind | Example | Meaning |
|---|---|---|
| Physical key | VS Code `cmd+[BracketLeft]`, Ghostty `super+bracket_left` / `key_a`, macOS symbolic hotkeys (virtual keycode) | A key *position*, named after the US key at that position. On Italian, `[BracketLeft]` is the key printed `è`. |
| Character | VS Code `cmd+[`, Ghostty `super+[`, Chrome `Command+Period`, Obsidian `"key": "P"`, cheatsheets | The *character* the key produces. On Italian there is no key that produces `[` without modifiers (it is ⌥è). |
| Terminal input | tmux `bind %`, zsh `bindkey '^[b'`, readline `"\C-x\C-e"`, vim `nnoremap gcc` | Bytes/characters received by a terminal program. `%` is whatever the user types to get `%`. |

## Data model

Parsers emit `Shortcut.strokes: KeyStroke[]` (`src/shared/keys.ts`) next
to the display string `key`:

- `mods`: `ctrl | opt | shift | cmd`, in macOS order ⌃⌥⇧⌘.
- `key`: canonical key: an uppercase letter, a character (`[`, `%`, `ò`), or
  a named key (`Return`, `Tab`, `↑`, `F5`, `Numpad1`).
- `code`: only for physical keys, the `KeyboardEvent.code` (`BracketLeft`);
  `key` then holds the US label of that position.
- `literal`: vim text shown verbatim (`dd`, `:wq`, case-sensitive).

`key`/`searchKey` (main process) stay US-based; they are used for copy to
clipboard and as a fallback when `strokes` is absent.

## Display rules (renderer)

`src/renderer/lib/keyboard-layout.ts` resolves strokes against the active
layout, read with Chromium's `navigator.keyboard.getLayoutMap()`
(`KeyboardEvent.code` → unshifted character). It falls back to US when the
API is unavailable, and re-reads the layout on startup, window focus,
window show, `layoutchange` and every 2 s while visible (macOS fires no
event on an input-source switch).

1. **Named keys** (Return, arrows, F-keys) are layout-independent: shown as
   glyphs (↩ ⇥ ⎋ ⌫ ⌦ ⇞ ⇟).
2. **Physical keys** show the label printed on that key of the user's
   layout: `[BracketLeft]` is `È` on Italian, `Ü` on German; Ghostty
   `key_y` is `Z` on German. A dotted underline and tooltip explain that it
   is the key at the US `[` position.
3. **Character keys** show the character the application expects, because
   that is what the app matches (and what the user types). When that
   character is not on a base key of the user's layout, the pill gets a
   dotted underline and a tooltip saying how to type it: `⌘[` on Italian →
   "Type “[” with ⌥È", `⌘/` → "with ⇧7". No hint is shown when the
   character is typed exactly as on a US keyboard (`%` = ⇧5 on Italian).
4. **Letters** are always Latin keycaps. On a non-Latin layout (Russian)
   shortcuts keep Latin letters at the US position, as macOS menus and the
   apps themselves do (⌘C stays ⌘C).
5. **Literal vim text** is shown verbatim.

### Why not rewrite character keys into "what to press"?

VS Code itself resolves a character keybinding to the key combination that
produces the character on the active layout (on German, `cmd+/` becomes
⇧⌘7 and `cmd+\` becomes ⌃⇧⌥⌘7 — see the VS Code
[keybindings docs](https://code.visualstudio.com/docs/configure/keybindings#_keyboard-layouts)
and [Keybinding Issues wiki](https://github.com/microsoft/vscode/wiki/Keybinding-Issues)).
Other apps behave differently: Ghostty matches the produced codepoint,
macOS menus may localize key equivalents to the US position, terminals
receive the character. Rewriting the shortcut would be wrong for some of
them, while "the character, plus how to type it on your keyboard" is true
for all of them. The hint carries the VS Code-style combination.

`getLayoutMap()` only exposes the unshifted layer, so the shifted/⌥
layers come from a built-in table of common macOS layouts
(`src/renderer/lib/keyboard-layouts.data.ts`: U.S., Italian, German,
French, Spanish, Dvorak, Russian). The active layout is recognised by
comparing its base layer with that table. For an unrecognised layout the
hint only says that the character is not on a key without modifiers.

## Per-source behavior

| Source | Key kind | Display on a non-US layout |
|---|---|---|
| VS Code `cmd+[` | character | `⌘[` + hint "⌥È" (VS Code resolves it to ⌥⌘È) |
| VS Code `cmd+[BracketLeft]` | physical | `⌘È` |
| Ghostty `super+[`, `ctrl+ò` | character (unicode codepoint) | `⌘[` + hint / `⌃Ò` |
| Ghostty `key_a`, `bracket_left`, `equal`, `physical:…`, `digit_1` | physical (W3C code) | layout label |
| macOS symbolic hotkeys | physical (virtual keycode) | layout label (⇧⌘3 stays ⇧⌘3 on Italian) |
| macOS App Shortcuts (NSUserKeyEquivalents) | character | character + hint |
| Chrome extensions, Obsidian | character | character + hint |
| Cheatsheets (VS Code, Chrome, Finder, Ghostty, vim) | character | character + hint |
| tmux, zsh, bash/readline | terminal character | character + hint; Meta/Esc as ⌥ |
| vim | literal text / `<C-x>` | verbatim / ⌃X |

## Search

`useSearch` indexes, per shortcut, the layout-resolved labels and the
typing hints (`layoutSearchText`), next to `key` and `searchKey`. On an
Italian keyboard, typing `ò` finds the shortcut on the ò key, `è` finds
`⌘[` (typed ⌥è), `?` finds ⇧⌘/ (US ⇧/), `+` finds `⌘+`. `searchKey` also
carries symbol names (`plus`, `comma`, `slash`, `question`, ...).

## Launcher input

Launcher keys use `KeyboardEvent.key` (the produced character), never
`KeyboardEvent.code`: `?` opens help and `>` enters command mode on every
layout (Italian `?` is ⇧', `>` is ⇧<). Covered by
`tests/e2e/keyboard-layout.spec.ts`.

## Limitations

- Layouts whose base layer is identical (U.S. vs British) cannot be told
  apart; British-only characters (`£`, `#` = ⌥3) get no specific hint.
- The shift/⌥ tables cover the layouts above (macOS variants); other
  layouts get only the generic hint. Dead keys (`^`, `` ` ``, `´`) are
  shown as their character.
- On ISO Macs Chromium reports the key left of 1 as `IntlBackslash` and
  the key left of Z as `Backquote` (verified with `getLayoutMap()` on an
  Italian Mac: `IntlBackslash` → `\`, `Backquote` → `<`). They are
  excluded from layout recognition.
- Copy to clipboard (Enter) copies the US-based `key` string.
- Terminal sources show Meta as ⌥ (macOS terminals with "Option as Meta").
