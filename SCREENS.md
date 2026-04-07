# Shortty — Screens & UI States

> Visual reference for every screen, state, and interaction in the app.
> See [SPECS.md](./SPECS.md) §10 for the full UX specification.

---

## 1. Main Panel

### 1.1 Empty State (Panel Opens)

The panel opens blank. Search bar focused, ready for input. Fixed size 680x500px.

```
┌──────────────────────────────────────────────────────────┐
│  🔍  Search shortcuts and commands...           ⌘⇧Space  │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

- Frameless, no title bar, no traffic lights
- Transparent background with Liquid Glass panel
- Large soft drop shadow
- Rounded corners (16px)
- Always on top
- No footer, no pills, no hints

---

### 1.2 Search Results — All Three Sections

User types a query that matches sources, shortcuts, and commands.

```
┌──────────────────────────────────────────────────────────┐
│  🔍  tmux                                       ⌘⇧Space  │
│                                                           │
│  Sources                                                  │
│  ┌────────────────────────────────────────────────────┐   │
│  │  ⌨️  tmux                            42 shortcuts  │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│  Shortcuts                                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │▸ prefix c     New Window                    tmux   │   │  ← selected row
│  │  prefix %     Split Vertical                tmux   │   │
│  │  prefix "     Split Horizontal              tmux   │   │
│  │  prefix d     Detach                        tmux   │   │
│  │  prefix n     Next Window                   tmux   │   │
│  │  Show all 42 results                               │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│  Commands                                                 │
│  ┌────────────────────────────────────────────────────┐   │
│  │  tmux          Terminal multiplexer                │   │
│  │  tmux attach   Attach to a session                 │   │
│  │  tmux ls       List sessions                       │   │
│  │  Show all 12 results                               │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

- Three sections in fixed order: Sources → Shortcuts → Commands
- Default limits: Sources 3, Shortcuts 8, Commands 5
- "Show all X results" row when truncated
- Selected row has highlight (▸ indicator)
- ↑/↓ navigates flat across all sections with wrap-around

---

### 1.3 Search Results — Shortcuts Only

Query matches only shortcuts, no sources or commands.

```
┌──────────────────────────────────────────────────────────┐
│  🔍  toggle sidebar                             ⌘⇧Space  │
│                                                           │
│  Shortcuts                                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │▸ ⌘B           Toggle Sidebar              VS Code │   │
│  │  ⌘⇧E          Toggle Explorer             VS Code │   │
│  │  ⌘⇧B          Toggle Build                VS Code │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

- Only sections with results are shown
- Empty space below — fixed window size, no dynamic height

---

### 1.4 Search Results — Commands Only (Prefix Mode)

When command prefix mode is enabled in settings and user types `>`.

```
┌──────────────────────────────────────────────────────────┐
│  🔍  > docker                                   ⌘⇧Space  │
│                                                           │
│  Commands                                                 │
│  ┌────────────────────────────────────────────────────┐   │
│  │▸ docker          Containerization platform         │   │
│  │  docker build    Build image from Dockerfile       │   │
│  │  docker compose  Multi-container orchestration     │   │
│  │  docker exec     Run command in container          │   │
│  │  docker pull     Download image from registry      │   │
│  │  Show all 28 results                               │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│                                                           │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

- `>` prefix visual indicator in search bar
- Only commands section shown

---

### 1.5 No Results

Query matches nothing. No message — blank space is the feedback.

```
┌──────────────────────────────────────────────────────────┐
│  🔍  xyznonexistent                             ⌘⇧Space  │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

### 1.6 Copy Feedback

User presses Enter on a shortcut row. Row briefly flashes green (~300ms).

```
┌──────────────────────────────────────────────────────────┐
│  🔍  command palette                            ⌘⇧Space  │
│                                                           │
│  Shortcuts                                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │▸ ⌘⇧P          Command Palette          VS Code ██ │   │  ← flash highlight
│  │  ⌃⇧P          Command Palette         Ghostty     │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

- Brief flash on the row (~300ms)
- If "Dismiss after copy" is on → panel closes after flash
- If off → panel stays, user can continue

---

## 2. Drill-In Views

### 2.1 Drilled Into Source

User selects a source from Sources section and presses Enter. Panel scopes to that source.

```
┌──────────────────────────────────────────────────────────┐
│  🔍  Search in VS Code...                       ⌘⇧Space  │
│                                                           │
│  VS Code                                   150 shortcuts  │
│  ┌────────────────────────────────────────────────────┐   │
│  │                                                    │   │
│  │  General                                           │   │  ← category header
│  │▸ ⌘⇧P          Command Palette                     │   │
│  │  ⌘P            Quick Open                          │   │
│  │  ⌘,            Settings                            │   │
│  │                                                    │   │
│  │  Editing                                           │   │
│  │  ⌘X            Cut Line                            │   │
│  │  ⌘C            Copy Line                           │   │
│  │  ⌥↑            Move Line Up                        │   │
│  │  ⌥↓            Move Line Down                      │   │
│  │                                                    │   │
│  │  View                                              │   │
│  │  ⌘B            Toggle Sidebar                      │   │
│  │  ⌘J            Toggle Panel                        │   │
│  │  ...                                               │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

- Header shows source name + icon + total count
- Placeholder changes to "Search in {source}..."
- Source label hidden from individual rows (redundant)
- Categories shown as section headers (if cheatsheet defines them)
- Esc returns to flat mode with previous query restored
- Search filters within this source only
- Full list browseable by scrolling

---

### 2.2 Drilled Into Source — With Context Badges

Source with contextual shortcuts (e.g., vim modes, VS Code when clauses).

```
┌──────────────────────────────────────────────────────────┐
│  🔍  Search in vim...                           ⌘⇧Space  │
│                                                           │
│  vim                                       120 shortcuts  │
│  ┌────────────────────────────────────────────────────┐   │
│  │                                                    │   │
│  │  Motion                                            │   │
│  │▸ h             Move Left                  normal   │   │  ← context badge
│  │  j             Move Down                  normal   │   │
│  │  k             Move Up                    normal   │   │
│  │  l             Move Right                 normal   │   │
│  │  w             Next Word                  normal   │   │
│  │                                                    │   │
│  │  Editing                                           │   │
│  │  dd            Delete Line                normal   │   │
│  │  yy            Yank Line                  normal   │   │
│  │  p             Paste After                normal   │   │
│  │                                                    │   │
│  │  Mode Switching                                    │   │
│  │  i             Enter Insert Mode          normal   │   │
│  │  Esc           Exit to Normal Mode        insert   │   │
│  │  v             Enter Visual Mode          normal   │   │
│  │  ...                                               │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

- Context badges (e.g., "normal", "insert", "visual") shown as small muted pills
- Same badge pattern used for VS Code "editorFocus", tmux "prefix", zsh keymaps

---

### 2.3 Command Detail View

User presses Tab/→ on a command row. Detail view replaces results.

```
┌──────────────────────────────────────────────────────────┐
│  🔍  Filter subcommands and flags...            ⌘⇧Space  │
│                                                           │
│  ← git commit                                             │
│  Record changes to the repository                         │
│                                                           │
│  Subcommands                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │▸ git commit --amend     Amend previous commit      │   │
│  │  git commit --fixup     Create fixup commit        │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│  Flags                                                    │
│  ┌────────────────────────────────────────────────────┐   │
│  │  -m, --message <msg>    Commit message             │   │
│  │  -a, --all              Stage modified/deleted      │   │
│  │  -v, --verbose          Show diff in editor         │   │
│  │  --no-verify            Bypass pre-commit hook      │   │
│  │  --allow-empty          Allow empty commit          │   │
│  │  -s, --signoff          Add Signed-off-by           │   │
│  └────────────────────────────────────────────────────┘   │
│                                                           │
│  Source: man page                                         │
└──────────────────────────────────────────────────────────┘
```

- ← icon + command name as header
- Description below header
- Search bar placeholder changes to "Filter subcommands and flags..."
- Typing filters the subcommands and flags lists
- Enter copies selected subcommand/flag
- Esc returns to previous view (flat results or drilled source)
- Small "Source: man page" indicator at bottom of content

---

### 2.4 Command Detail View — Unenriched

Command hasn't been enriched yet by the background worker.

```
┌──────────────────────────────────────────────────────────┐
│  🔍  Filter subcommands and flags...            ⌘⇧Space  │
│                                                           │
│  ← mycustomtool                                           │
│  A custom CLI tool                                        │
│                                                           │
│                                                           │
│                                                           │
│             Enriching...                                  │
│                                                           │
│                                                           │
│                                                           │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

- Shows name and description (from Tier 1)
- "Enriching..." indicator (subtle spinner or text)
- Once enrichment completes, view populates with subcommands and flags

---

## 3. Keyboard Help Overlay

User clicks the `?` icon (available in search bar area).

```
┌──────────────────────────────────────────────────────────┐
│                                                           │
│                   Keyboard Shortcuts                      │
│                                                           │
│   ↑ ↓          Navigate results                          │
│   Enter         Copy / Select                             │
│   Tab / →       Drill into command details                │
│   Esc           Back / Dismiss                            │
│   ⌘⇧Space      Toggle panel                              │
│                                                           │
│                              Press any key to close       │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

- Overlays on the panel
- Dismisses on any keypress
- Minimal, lists core keys only

---

## 4. System Tray

### 4.1 Tray Icon

Small monochrome icon in the macOS menu bar / Windows system tray.
Uses `tray-iconTemplate.png` (macOS template image, auto-adapts to light/dark).

### 4.2 Tray Context Menu

```
┌─────────────────────┐
│ Show / Hide         │
│─────────────────────│
│ Preferences...      │
│─────────────────────│
│ Quit Shortty        │
└─────────────────────┘
```

- "Show / Hide" toggles the panel
- "Preferences..." opens the preferences window
- "Quit Shortty" exits the app

---

## 5. Preferences Window

Separate window: 600x500px, non-resizable, native title bar. Two-column layout: sidebar nav + content area.

### 5.1 General Tab

```
┌─────┬────────────────────────────────────────────────────┐
│     │                                                     │
│  G  │  General                                            │
│  S  │                                                     │
│  Se │  ☐ Launch at Login                                  │
│  C  │                                                     │
│     │  ☐ Show in Dock                                     │
│     │                                                     │
│     │  ☑ Show in Menu Bar                                 │
│     │                                                     │
│     │  ☑ Dismiss After Copy                               │
│     │                                                     │
│     │  Activation Shortcut                                │
│     │  [ ⌘ ⇧ Space ]                        [Record]     │
│     │                                                     │
│     │  Window Position                                    │
│     │  ◉ Top Center   ○ Center   ○ Near Cursor            │
│     │                                                     │
│     │  Theme                                              │
│     │  ◉ System       ○ Light    ○ Dark                   │
│     │                                                     │
└─────┴────────────────────────────────────────────────────┘
```

Sidebar: G = General, S = Sources, Se = Search, C = Commands

---

### 5.2 Sources Tab

```
┌─────┬────────────────────────────────────────────────────┐
│     │                                                     │
│  G  │  Sources                                            │
│ [S] │                                                     │
│  Se │  ┌──────────────────────────────────────────────┐   │
│  C  │  │ ☑ VS Code                       ✅ Detected  │   │
│     │  │   ~/Library/.../keybindings.json              │   │
│     │  │   Override: [                    ] [Browse]   │   │
│     │  │                                    [Reset]    │   │
│     │  ├──────────────────────────────────────────────┤   │
│     │  │ ☑ Chrome                         ✅ Detected  │   │
│     │  │   ~/Library/.../Preferences                   │   │
│     │  │   Override: [                    ] [Browse]   │   │
│     │  │                                    [Reset]    │   │
│     │  ├──────────────────────────────────────────────┤   │
│     │  │ ☑ Finder                     Cheatsheet only  │   │
│     │  │   (no config file)                            │   │
│     │  ├──────────────────────────────────────────────┤   │
│     │  │ ☐ vim                         ✗ Not detected  │   │
│     │  │   Expected: ~/.vimrc                          │   │
│     │  │   Override: [                    ] [Browse]   │   │
│     │  │                                    [Reset]    │   │
│     │  └──────────────────────────────────────────────┘   │
│     │                                                     │
└─────┴────────────────────────────────────────────────────┘
```

- Each source: toggle + name + detection status
- Detected path shown with green/red indicator
- Auto-detected path shown greyed out when override active
- Override: text input + file picker + reset button
- Cheatsheet-only sources show "(no config file)"

---

### 5.3 Search Tab

```
┌─────┬────────────────────────────────────────────────────┐
│     │                                                     │
│  G  │  Search                                             │
│  S  │                                                     │
│ [Se]│  Shortcut Search Weights                            │
│  C  │                                                     │
│     │  Key Weight          [━━━━━━━━━━━━━━━●━━] 0.40     │
│     │  Command Weight      [━━━━━━━━━━━━━━━●━━] 0.40     │
│     │  Source Weight       [━━━━━●━━━━━━━━━━━━] 0.10     │
│     │  Context Weight      [━━━━━●━━━━━━━━━━━━] 0.10     │
│     │                                                     │
│     │  Threshold           [━━━━━━━━━━━●━━━━━━] 0.35     │
│     │  Lower = stricter matching                          │
│     │                                                     │
│     │  ─────────────────────────────────────────          │
│     │                                                     │
│     │  ☐ Command Prefix Mode                              │
│     │    When on: default search = shortcuts only          │
│     │    Type > to search commands                         │
│     │                                                     │
│     │  ─────────────────────────────────────────          │
│     │                                                     │
│     │  Result Limits                                      │
│     │  Sources:    [ 3 ]                                  │
│     │  Shortcuts:  [ 8 ]                                  │
│     │  Commands:   [ 5 ]                                  │
│     │                                                     │
└─────┴────────────────────────────────────────────────────┘
```

---

### 5.4 Commands Tab

```
┌─────┬────────────────────────────────────────────────────┐
│     │                                                     │
│  G  │  Commands                                           │
│  S  │                                                     │
│  Se │  ☑ Enable Shell Commands                            │
│ [C] │    Search CLI commands alongside shortcuts           │
│     │                                                     │
│     │  ─────────────────────────────────────────          │
│     │                                                     │
│     │  Enrichment Status                                  │
│     │  ████████████████░░░░░░  3,842 / 4,127 commands    │
│     │  Enrichment running in background                   │
│     │                                                     │
│     │                                                     │
│     │                                                     │
│     │                                                     │
│     │                                                     │
│     │                                                     │
│     │                                                     │
│     │                                                     │
│     │                                                     │
└─────┴────────────────────────────────────────────────────┘
```

- Enable/disable toggle for entire commands feature
- Enrichment progress bar showing X/Y commands enriched
- Status text ("running in background" / "complete" / "paused")

---

## 6. Panel Animations

### 6.1 Show Animation

```
t=0ms:    opacity: 0, scale: 0.97
t=120ms:  opacity: 1, scale: 1.0     (ease-out)
```

Panel materializes from slightly smaller scale with fade-in. Feels like it's coming from behind the screen.

### 6.2 Hide Animation

```
t=0ms:    opacity: 1, scale: 1.0
t=80ms:   opacity: 0, scale: 0.97    (ease-in)
```

Reverse: shrinks slightly and fades out.

### 6.3 Reduced Motion

When `prefers-reduced-motion` is active:
- Show: instant (opacity 0 → 1, no scale)
- Hide: instant (opacity 1 → 0, no scale)

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
    │  Esc/blur     │             │                │
    ├───────────────│  FLAT MODE  │                │
    │               │  (blank)    │                │
    │               └──────┬──────┘                │
    │                      │ type query             │
    │                      ▼                        │
    │               ┌─────────────┐                │
    │  Esc/blur     │  FLAT MODE  │                │
    ├───────────────│  (results)  │────────────────┤
    │               └───┬────┬────┘   Enter+copy   │
    │                   │    │        (if dismiss   │
    │      Enter on     │    │         after copy)  │
    │      source       │    │ Tab/→ on command     │
    │                   ▼    ▼                      │
    │  ┌──────────────┐  ┌──────────────┐          │
    │  │  DRILLED     │  │  COMMAND     │          │
    │  │  SOURCE      │  │  DETAIL      │          │
    │  │              │  │              │          │
    │  │ Esc → flat   │  │ Esc → back  │          │
    │  └──────────────┘  └──────────────┘          │
    │                                               │
    └───────────────────────────────────────────────┘
                    ⌘⇧Space from any state
```

---

## 8. Row Anatomy Reference

### 8.1 Shortcut Row (Flat Mode)

```
┌────────────────────────────────────────────────────────┐
│  ⌘⇧P          Command Palette               VS Code   │
│                 editorFocus                              │
└────────────────────────────────────────────────────────┘
 ↑ kbd pills    ↑ command name              ↑ source label
                 ↑ context badge (if present, small/muted)
```

### 8.2 Shortcut Row (Drilled Into Source)

```
┌────────────────────────────────────────────────────────┐
│  ⌘⇧P          Command Palette                         │
│                 editorFocus                              │
└────────────────────────────────────────────────────────┘
 ↑ kbd pills    ↑ command name     (no source label — redundant)
```

### 8.3 Command Row

```
┌────────────────────────────────────────────────────────┐
│  git commit    Record changes to the repository        │
└────────────────────────────────────────────────────────┘
 ↑ code badge   ↑ description             (nothing on right)
```

### 8.4 Source Row

```
┌────────────────────────────────────────────────────────┐
│  ⌨️  tmux                               42 shortcuts   │
└────────────────────────────────────────────────────────┘
 ↑ icon + name                             ↑ entry count
```

### 8.5 "Show All" Row

```
┌────────────────────────────────────────────────────────┐
│  Show all 42 results                                   │
└────────────────────────────────────────────────────────┘
```

Subtle styling, selectable. Enter expands the section.
