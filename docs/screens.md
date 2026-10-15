# Shortty — Screens & UI States

> Visual reference for every screen, state, and interaction in the app.
> See [spec.md](spec.md) §10 for the full UX specification and §15 for the design decisions behind this layout.
> Screenshot of the launcher: [assets/launcher.png](assets/launcher.png).

Wireframes are schematic: `[VS]` is a source tile (tinted monogram), `[⌘B]` a group of key caps, `‹VS Code›` a chip in the search bar.

---

## 1. Main Panel

### 1.1 Empty State (Panel Opens)

The panel opens as a bare search bar: 750px wide, 72px tall. Search field focused, ready for input.

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  Search shortcuts and commands...        [⌘][⇧][Space] ⓘ │
└──────────────────────────────────────────────────────────────┘
```

- Frameless, no title bar, no traffic lights
- Native macOS vibrancy (`under-window`), light or dark per the Theme setting
- Rounded corners and shadow from the native window
- Always on top
- Right of the field: the configured global shortcut as key caps, and a `?` button (ⓘ above) that opens the keyboard help (§3)
- No results area and no footer until there is something to show

---

### 1.2 Search Results — All Three Sections

User types a query that matches sources, shortcuts, and commands. The window grows to 580px.

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  tmux                                    [⌘][⇧][Space] ⓘ │
├──────────────────────────────────────────────────────────────┤
│  Sources                                                   1 │
│ ▌[tm] tmux                                    42 shortcuts › │  ← selected row
│                                                              │
│  Shortcuts                                                42 │
│  [tm] New Window      new-window       prefix  tmux    [⌃B c]│
│  [tm] Split Vertical  split-window -h  prefix  tmux    [⌃B %]│
│  [tm] Detach          detach-client    prefix  tmux    [⌃B d]│
│       Show all 42 shortcuts ⌄                                │
│                                                              │
│  Commands                                                  3 │
│  [>_] tmux        terminal multiplexer                     › │
│       Show all 3 commands ⌄                                  │
├──────────────────────────────────────────────────────────────┤
│  46 results                                Open ↩   Clear esc│
└──────────────────────────────────────────────────────────────┘
```

- Three sections in fixed order: Sources → Shortcuts → Commands; each header shows its total
- Default limits: Sources 3, Shortcuts 8, Commands 5
- A selectable "Show all N" row closes a truncated section; Enter expands it
- Selected row has a filled highlight
- ↑/↓ navigates flat across all sections with wrap-around
- Footer: result count on the left, key hints for the selected row on the right

---

### 1.3 Search Results — Shortcuts Only

Query matches only shortcuts, no sources or commands. Screenshot: [assets/launcher.png](assets/launcher.png).

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  toggle sidebar                          [⌘][⇧][Space] ⓘ │
├──────────────────────────────────────────────────────────────┤
│  Shortcuts                                                 3 │
│ ▌[VS] Toggle Sidebar Visibility  workbench.action…  VS Code [⌘B] │
│  [VS] Toggle Explorer            workbench.view…    VS Code [⇧⌘E]│
│  [Ob] Toggle left sidebar        app:toggle-left…   Obsidian unbound│
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  3 results                              Copy keys ↩  Clear esc│
└──────────────────────────────────────────────────────────────┘
```

- Only sections with results are shown
- The window stays 580px tall while there are results; the list scrolls inside it

---

### 1.4 Search Results — Commands Only (Prefix Mode)

When command prefix mode is enabled in settings (default off) and the user types `>`.

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  [>] docker                              [⌘][⇧][Space] ⓘ │
├──────────────────────────────────────────────────────────────┤
│  Commands                                                 28 │
│ ▌[>_] docker          Docker image and container command…  › │
│  [>_] docker-compose  Define and run multi-container apps  › │
│       Show all 28 commands ⌄                                 │
├──────────────────────────────────────────────────────────────┤
│  28 results                 Copy ↩   Details ⇥   Clear esc   │
└──────────────────────────────────────────────────────────────┘
```

- `>` prefix shown as a badge in the search bar; Backspace on an empty field removes it
- Only the commands section is shown
- With prefix mode on and no `>`, only shortcuts are searched

---

### 1.5 No Results

Query matches nothing. The window grows to 180px for one line and a hint.

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  xyznonexistent                          [⌘][⇧][Space] ⓘ │
├──────────────────────────────────────────────────────────────┤
│                 No matches for “xyznonexistent”              │
│            Try an action like “split pane” or a key like ⌘K  │
└──────────────────────────────────────────────────────────────┘
```

- The hint depends on the state: "Type > first to search commands" (prefix mode), "Backspace the > to search shortcuts instead" (`>` active), "Esc to search all sources" (drilled into a source)
- A drilled source with no entries shows "{Source} has no shortcuts yet" / "Check its config path in Preferences"

---

### 1.6 Copy Feedback

User presses Enter on a shortcut row. The row flashes (~300ms) and the footer confirms the copy.

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  command palette                         [⌘][⇧][Space] ⓘ │
├──────────────────────────────────────────────────────────────┤
│  Shortcuts                                                 2 │
│ █[VS] Show All Commands  workbench.action.showCommands [⇧⌘P]█│  ← flash
│  [Gh] Command Palette    ghostty.toggle_command_palette [⇧⌘P]│
├──────────────────────────────────────────────────────────────┤
│  ✓ Copied ⇧⌘P                           Copy keys ↩  Clear esc│
└──────────────────────────────────────────────────────────────┘
```

- Brief flash on the row (~300ms); "Copied …" stays in the footer for 1.5s
- The text copied is the key combo as labelled on the user's keyboard layout ([keyboard-layouts.md](keyboard-layouts.md))
- If "Hide after copying" is on → panel closes after the flash
- If off → panel stays, user can continue

---

## 2. Drill-In Views

### 2.1 Drilled Into Source

User selects a source from the Sources section and presses Enter. Panel scopes to that source.

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  ‹[VS] VS Code›  Search in VS Code...    [⌘][⇧][Space] ⓘ │
├──────────────────────────────────────────────────────────────┤
│  General                                                     │  ← category header
│ ▌Show All Commands    workbench.action.showCommands    [⇧⌘P] │
│  Go to File           workbench.action.quickOpen        [⌘P] │
│  Settings             workbench.action.openSettings     [⌘,] │
│                                                              │
│  Editing                                                     │
│  Toggle Line Comment  editor.action.commentLine  editorTextFocus  unbound │
│  Move Line Up         editor.action.moveLinesUpAction   [⌥↑] │
│  ...                                                         │
├──────────────────────────────────────────────────────────────┤
│  [VS] VS Code  138 shortcuts            Copy keys ↩  Back esc│
└──────────────────────────────────────────────────────────────┘
```

- The source appears as a chip (tile + name) in the search bar; placeholder becomes "Search in {source}..."
- Footer shows the source and its total count
- Source tile and label hidden from individual rows (redundant)
- Empty query: every entry, grouped under category headers (if the cheatsheet defines them), no section limit
- Typing filters within this source only, in a single "Matches" section
- Esc clears the query, then returns to flat mode with the previous query, expanded sections and selection restored; ← or Backspace on an empty field also go back

---

### 2.2 Drilled Into Source — With Context Badges

Source with contextual shortcuts (e.g., vim modes, VS Code when clauses).

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  ‹[vi] vim›  Search in vim...            [⌘][⇧][Space] ⓘ │
├──────────────────────────────────────────────────────────────┤
│  Motion                                                      │
│ ▌Move Left     vim.motion.left             normal       [h]  │  ← context pill
│  Move Down     vim.motion.down             normal       [j]  │
│  Next Word     vim.motion.word             normal       [w]  │
│                                                              │
│  Editing                                                     │
│  Delete Line   vim.editing.delete_line     normal       [dd] │
│  Toggle Case   vim.editing.toggle_case     normal       [~]  │
│  ...                                                         │
├──────────────────────────────────────────────────────────────┤
│  [vi] vim  149 shortcuts                Copy keys ↩  Back esc│
└──────────────────────────────────────────────────────────────┘
```

- Context shown as a small muted pill left of the keys (e.g., "normal", "insert", "visual")
- Same pill pattern used for VS Code "editorFocus", tmux "prefix", zsh keymaps, Chrome "global"
- vim key sequences are shown verbatim (`dd`, `za`)

---

### 2.3 Command Detail View

User presses Tab/→ on a command row. Detail view replaces results.

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  ‹git›  Filter subcommands and flags...  [⌘][⇧][Space] ⓘ │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐  │
│  │ git [--version] [--help] [-C <path>] <command> [<args>]│  │  ← synopsis
│  └────────────────────────────────────────────────────────┘  │
│  the stupid content tracker                                  │
│                                                              │
│  Arguments                                                 1 │
│ ▌<command>  required                                         │
│                                                              │
│  Subcommands                                              22 │
│  git commit    Record changes to the repository            › │
│  git push      Update remote refs along with objects       › │
│                                                              │
│  Examples                                                  2 │
│  git commit -a                                               │
│  Commit all tracked changes                                  │
│                                                              │
│  Flags                                                    14 │
│  -C <path>     Run as if git was started in <path>           │
│  --cleanup <mode>  How to strip spaces  strip | whitespace … │
│  --version     Print the git suite version                   │
│                                                              │
│  Environment                                               3 │
│  GIT_DIR       Path to the repository                        │
│                                                              │
│  See also                                                    │
│  git-add(1)                                                  │
│  Source: man page                                            │
├──────────────────────────────────────────────────────────────┤
│                                  Copy ↩   Open ⇥   Back esc  │
└──────────────────────────────────────────────────────────────┘
```

- Breadcrumb chips in the search bar show the path (`git`, then `commit`, …)
- Description, aliases (`Alias  gh pr ls` chips), synopsis in a code block (wraps; very long ones scroll after 3 lines), then the long description
- Sections, each with a count, in keyboard order: Arguments, Subcommands, Examples, Flags, Environment ([spec.md](spec.md) §7.8)
- Subcommands and flags split into one header per group when the help groups them ("Core commands", "Inherited flags", gcloud "Groups"/"Commands", az "Subgroups"); a single group keeps the plain "Subcommands"/"Flags" title
- Flag rows end with subtle badges: `required` (warning colour), `deprecated` (name dimmed), allowed values `a | b | c` (first four, full list on hover), default `= value`; deprecated subcommands get the same badge
- Example rows: the command in monospace, its description muted on a second line; Enter copies the command
- Environment rows: variable name in monospace and its description; Enter copies the name
- "See also" (man references, links, "Learn more" lines) at the bottom, as plain text, above the source line
- A group longer than 40 rows shows its first 25 and a "Show all N" button; it expands by itself when the selection moves past the cut, and a filter shows every match
- Typing filters the lists; Enter copies the selected subcommand, flag, argument, example or variable
- Tab/→ on a subcommand drills one level deeper (reads its man page or `--help` on demand; [spec.md](spec.md) §7.4)
- Esc returns to the previous view (flat results, drilled source or parent command), restored as it was
- Typing the command line drills by itself, to any depth: `>gh auth lo` shows the chips `gh` › `auth` with "lo" in the field. A word drills on the following space, or as soon as it is typed when no sibling starts with it (`>gh auth` drills at once, `>git commit` waits for the space because of `commit-tree`). Backspace on an empty field steps back one chip and puts its word back in the field ([spec.md](spec.md) §10.2)
- "Source: man page" / "Source: --help" at the bottom of the content

---

### 2.4 Command Detail View — Unenriched

Command hasn't been enriched yet by the background worker.

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  ‹mycustomtool›  Filter subcommands...   [⌘][⇧][Space] ⓘ │
├──────────────────────────────────────────────────────────────┤
│  A custom CLI tool                                           │
│                                                              │
│                         Enriching...                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                     Back esc │
└──────────────────────────────────────────────────────────────┘
```

- Shows the description (from `apropos`)
- "Enriching..." text while the command is enriched on demand (drilling in asks for it at once instead of waiting for the background worker)
- The view follows the live command: it fills in with subcommands and flags as soon as enrichment lands, without leaving and re-entering
- When enrichment found nothing: "No subcommands or flags documented"

---

## 3. Keyboard Help Overlay

User clicks the `?` button in the search bar, or types `?` on an empty query.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                      Keyboard Shortcuts                      │
│                                                              │
│   ↑ ↓          Navigate results                              │
│   ↩            Copy, open a source or show all               │
│   ⇥            Open command details                          │
│   esc          Clear, go back or close                       │
│   >            Search commands only (prefix mode)            │
│   ⌘ ⇧ Space    Show or hide Shortty                          │
│                                                              │
│                                    Press any key to close    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Overlays on the panel (the window expands to 580px)
- Dismisses on any keypress
- The last row shows the configured global shortcut

---

## 4. System Tray

### 4.1 Tray Icon

Small monochrome icon in the macOS menu bar / Windows system tray.
Uses `tray-iconTemplate.png` (macOS template image, auto-adapts to light/dark).
Shown only while "Show in menu bar" is on; toggling the setting creates or removes it immediately.

### 4.2 Tray Context Menu

```
┌─────────────────────┐
│ Show/Hide           │
│─────────────────────│
│ Preferences...      │
│─────────────────────│
│ Quit Shortty        │
└─────────────────────┘
```

- "Show/Hide" toggles the panel
- "Preferences..." opens the preferences window
- "Quit Shortty" exits the app

---

## 5. Preferences Window

Separate window: 600x500px, non-resizable, hidden-inset title bar (traffic lights over the sidebar). Styled like macOS System Settings: a sidebar source list with coloured icon tiles, content in inset grouped sections with native-sized switches, segmented controls and sliders. Light and dark follow the Theme setting. ↑/↓ move through the sidebar.

### 5.1 General Tab

```
┌──────────────┬───────────────────────────────────────────────┐
│ ● ● ●        │  General                                      │
│              │  ┌─────────────────────────────────────────┐  │
│ [⚙] General  │  │ Launch at login                    ( o)│  │
│ [≡] Sources  │  │ Show in Dock                       ( o)│  │
│ [🔍] Search  │  │ Show in menu bar                   (o )│  │
│ [>_] Commands│  │ Hide after copying                 (o )│  │
│              │  └─────────────────────────────────────────┘  │
│              │  ┌─────────────────────────────────────────┐  │
│              │  │ Activation shortcut     [ ⇧ ][ ⌘ ][Space]│  │
│              │  └─────────────────────────────────────────┘  │
│              │  ┌─────────────────────────────────────────┐  │
│              │  │ Position   [Top Center|Center|Near Cursor]│ │
│              │  │ Appearance [System | Light | Dark]       │  │
│              │  └─────────────────────────────────────────┘  │
└──────────────┴───────────────────────────────────────────────┘
```

- Each switch has a one-line explanation under its label
- The shortcut recorder records physical keys (`KeyboardEvent.code`) and labels them for the user's layout; a shortcut already in use shows the error from the main process
- Turning off both Dock and menu bar asks for confirmation first

---

### 5.2 Sources Tab

```
┌──────────────┬───────────────────────────────────────────────┐
│              │  Sources                                      │
│              │  Choose which apps Shortty reads shortcuts    │
│  General     │  from. Sources you don't have installed still │
│ [Sources]    │  show their built-in cheatsheet.              │
│  Search      │  ┌─────────────────────────────────────────┐  │
│  Commands    │  │ 🐚 Bash  Detected                  (o )│  │
│              │  │   Detected at                           │  │
│              │  │     ✓ ~/.inputrc                        │  │
│              │  │     ✓ ~/.bashrc                         │  │
│              │  │   Custom path                           │  │
│              │  │   [ ~/.inputrc              ] [Browse…] │  │
│              │  │   Leave empty to use the detected path. │  │
│              │  │   Supports ~, $HOME and $XDG_CONFIG_HOME│  │
│              │  └─────────────────────────────────────────┘  │
│              │  ┌─────────────────────────────────────────┐  │
│              │  │ 🌐 Chrome  Detected                (o )│  │
│              │  │   55 built-in shortcuts                 │  │
│              │  │   ...                                   │  │
│              │  └─────────────────────────────────────────┘  │
└──────────────┴───────────────────────────────────────────────┘
```

- Each source: icon + name + status badge + enable switch
- Detected paths shown under the home folder as `~/...`, each with ✓/✗ existence
- Custom path: text field (saved on blur or Enter, Esc reverts) + native file picker (Browse…) + Reset when set
- A custom path that does not exist yet shows a warning but is still saved
- Cheatsheet-only sources (Finder) have no path fields

---

### 5.3 Search Tab

```
┌──────────────┬───────────────────────────────────────────────┐
│              │  Search                                       │
│              │  ┌─────────────────────────────────────────┐  │
│  General     │  │ Command prefix mode                ( o)│  │
│  Sources     │  │ Search only shortcuts by default. Start │  │
│ [Search]     │  │ a query with > to search commands.      │  │
│  Commands    │  └─────────────────────────────────────────┘  │
│              │  Shortcut ranking                             │
│              │  ┌─────────────────────────────────────────┐  │
│              │  │ Key combination   ━━━━━●━━━━━━    0.40 │  │
│              │  │ Shortcut name     ━━━━━●━━━━━━    0.40 │  │
│              │  │ App name          ━●━━━━━━━━━━    0.10 │  │
│              │  │ Context           ━●━━━━━━━━━━    0.10 │  │
│              │  └─────────────────────────────────────────┘  │
│              │  ┌─────────────────────────────────────────┐  │
│              │  │ Fuzziness         ━━━━━●━━━━━━    0.35 │  │
│              │  └─────────────────────────────────────────┘  │
│              │  Results per section                          │
│              │  Sources [ 3 ]  Shortcuts [ 8 ]  Commands [ 5 ]│
└──────────────┴───────────────────────────────────────────────┘
```

---

### 5.4 Commands Tab

```
┌──────────────┬───────────────────────────────────────────────┐
│              │  Commands                                     │
│              │  ┌─────────────────────────────────────────┐  │
│  General     │  │ Search shell commands              (o )│  │
│  Sources     │  │ Find CLI commands from your PATH        │  │
│  Search      │  │ alongside shortcuts.                    │  │
│ [Commands]   │  └─────────────────────────────────────────┘  │
│              │  Descriptions                                 │
│              │  ┌─────────────────────────────────────────┐  │
│              │  │ 3,842 of 4,127 commands  Running in bg. │  │
│              │  │ ████████████████████░░░░░               │  │
│              │  └─────────────────────────────────────────┘  │
│              │  Shortty reads each command's --help and man  │
│              │  page in the background to fill in            │
│              │  subcommands and flags.                       │
└──────────────┴───────────────────────────────────────────────┘
```

- Enable/disable toggle for entire commands feature
- Enrichment progress bar showing X/Y commands enriched
- Status badge: "Running in background", "Complete" or "Paused"

---

## 6. Panel Animations

### 6.1 Show Animation

```
t=0ms:    opacity: 0, scale: 0.97
t=120ms:  opacity: 1, scale: 1.0     (ease-out)
```

Panel materializes from slightly smaller scale with fade-in. Replayed on every show.

### 6.2 Hide Animation

```
t=0ms:    opacity: 1, scale: 1.0
t=80ms:   opacity: 0, scale: 0.97    (ease-in)
```

Reverse: shrinks slightly and fades out. Every hide (Esc, copy, blur, hotkey, tray) plays it before the window hides, and the panel resets to the empty state.

### 6.3 Reduced Motion

When `prefers-reduced-motion` is active:
- Show: instant (opacity 0 → 1, no scale)
- Hide: instant (opacity 1 → 0, no scale)

When `prefers-reduced-transparency` is active the panel uses a solid background instead of the vibrancy tint.

---

## 7. Navigation State Diagram

```
                    ┌─────────────┐
       ⌘⇧Space     │             │     ⌘⇧Space
    ┌──────────────→│   HIDDEN    │←──────────────┐
    │               │             │                │
    │               └──────┬──────┘                │
    │                      │ ⌘⇧Space               │
    │                      ▼                        │
    │               ┌─────────────┐                │
    │  Esc/blur     │  FLAT MODE  │                │
    ├───────────────│  (blank,    │                │
    │               │   72px)     │                │
    │               └──────┬──────┘                │
    │                      │ type query             │
    │                      ▼                        │
    │               ┌─────────────┐                │
    │  blur         │  FLAT MODE  │                │
    ├───────────────│  (results)  │────────────────┤
    │               └───┬────┬────┘   Enter+copy   │
    │  Esc: clear query │    │        (if hide     │
    │      Enter on     │    │         after copy)  │
    │      source       │    │ Tab/→ on command     │
    │                   ▼    ▼                      │
    │  ┌──────────────┐  ┌──────────────┐          │
    │  │  DRILLED     │  │  COMMAND     │──┐       │
    │  │  SOURCE      │  │  DETAIL      │  │ Tab/→ │
    │  │              │  │              │←─┘ on sub│
    │  │ Esc → flat   │  │ Esc → back   │          │
    │  └──────────────┘  └──────────────┘          │
    │                                               │
    └───────────────────────────────────────────────┘
                    ⌘⇧Space from any state
```

Esc always clears a non-empty query first; with an empty query it goes back one level, and at the top level it dismisses.

---

## 8. Row Anatomy Reference

### 8.1 Shortcut Row (Flat Mode)

```
┌────────────────────────────────────────────────────────────────┐
│ [VS] Show All Commands  workbench.action.showCommands  editorFocus  VS Code  [⇧⌘P] │
└────────────────────────────────────────────────────────────────┘
  ↑tile ↑ command name     ↑ rawCommand (muted mono)     ↑ context ↑ source ↑ key caps
```

- `rawCommand` is omitted when it equals the command name
- Key caps follow the user's keyboard layout; a dotted underline and tooltip mark a key that is typed differently than on a US keyboard ([keyboard-layouts.md](keyboard-layouts.md))
- Unbound shortcuts show "unbound" in place of the caps

### 8.2 Shortcut Row (Drilled Into Source)

```
┌────────────────────────────────────────────────────────────────┐
│ Show All Commands  workbench.action.showCommands  editorFocus  [⇧⌘P] │
└────────────────────────────────────────────────────────────────┘
  (no tile and no source label — redundant)
```

### 8.3 Command Row

```
┌────────────────────────────────────────────────────────────────┐
│ [>_] git commit    Record changes to the repository          › │
└────────────────────────────────────────────────────────────────┘
  ↑ shell tile ↑ name (mono)  ↑ description          ↑ drillable
```

### 8.4 Source Row

```
┌────────────────────────────────────────────────────────────────┐
│ [tm] tmux                                       42 shortcuts › │
└────────────────────────────────────────────────────────────────┘
  ↑ tile + name                                  ↑ entry count
```

Source tiles show the installed app's real icon (Chrome, VS Code, Ghostty, Obsidian, Finder, System Settings), else a brand glyph in the brand colour (tmux, vim, zsh, bash; for commands `git`, `docker`, `kubectl`, …), else a tinted monogram (`VS`, `Ch`, `Gh`, `tm`, `vi`, `z`, `$`, `Ob`, `F`, `⌘`, `>_` for commands); an unknown source gets its initial on a hue derived from its id. Command rows use the command's own tile instead of the shell tile when there is one. Precedence and lookup: [spec.md §10.4](spec.md#104-entry-anatomy).

### 8.5 "Show All" Row

```
┌────────────────────────────────────────────────────────────────┐
│      Show all 42 shortcuts ⌄                                   │
└────────────────────────────────────────────────────────────────┘
```

Subtle styling, selectable with the keyboard. Enter expands the section.
