# Shortty — Product Requirements Document

## Vision

A cross-platform keybinding discovery app styled as a **Spotlight/Raycast-style floating launcher**. Invoke it with a global hotkey, search across all your tools' shortcuts instantly, and dismiss it — like a keybinding encyclopedia at your fingertips.

Primary platform: **macOS Tahoe** (Liquid Glass aesthetic). Secondary: **Windows**.

---

## Problem

Developers juggle keybindings across many tools — VS Code, terminal emulators, tmux, shell bindings — and constantly forget shortcuts or discover conflicts. There's no single place to search "what's bound to Cmd+Shift+T?" across all tools at once.

## Solution

A lightweight, always-available launcher that:
1. Dynamically reads keybinding configs from installed tools
2. Presents them in a fast, searchable floating panel
3. Auto-refreshes when configs change
4. Feels native to macOS Tahoe's Liquid Glass design language

---

## UX Design — Spotlight/Launcher Style

### Core Interaction Model

- **Global hotkey** (e.g. `Cmd+Shift+Space`) summons the app as a **centered floating panel** over everything — just like Spotlight or Raycast
- **Type to search** immediately — no click required, input is focused on launch
- **Esc or blur** dismisses the window
- Results appear instantly below the search bar as you type

### Layout

```
┌─────────────────────────────────────────────────────┐
│  🔍  Search shortcuts...                    ⌘⇧Space │  ← Search input (always focused)
├─────────────────────────────────────────────────────┤
│  [All] [VS Code] [Ghostty] [tmux] [Zsh] [Obsidian] [Chrome] [macOS] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  VS Code                                            │  ← Section header (when "All")
│  ┌─────────────────────────────────────────────────┐│
│  │ ⌘⇧T        Reopen Closed Editor                ││  ← Keybinding row
│  │ ⌘⇧P        Command Palette                     ││
│  │ ⌘K ⌘S      Open Keyboard Shortcuts             ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  Ghostty                                            │
│  ┌─────────────────────────────────────────────────┐│
│  │ ⌘T          New Tab                             ││
│  │ ⌘⇧D         Split Down                         ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  tmux                                               │
│  ┌─────────────────────────────────────────────────┐│
│  │ prefix c    New Window                          ││
│  │ prefix %    Split Vertical                      ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Window Behavior

| Property | Value |
|----------|-------|
| Position | Centered, top-third of screen (like Spotlight) |
| Size | ~680px wide × dynamic height (max ~500px), then scrolls |
| Frame | Frameless, no title bar, no traffic lights |
| Shadow | Large, soft drop shadow for floating effect |
| Corners | Rounded (16px radius) |
| Always on top | Yes, when visible |
| Show in dock | No (background app / `LSUIElement`) |
| Show in mission control | No |
| Background | Transparent window, Liquid Glass panel inside |
| Dismiss | Esc key, click outside, or global hotkey toggle |

### Visual Design — macOS Tahoe Liquid Glass

**Panel surface:**
- `backdrop-filter: blur(40px) saturate(180%)` for glass translucency
- Light mode: `rgba(255, 255, 255, 0.72)` tinted background
- Dark mode: `rgba(30, 30, 30, 0.72)` tinted background
- `border: 1px solid rgba(255, 255, 255, 0.18)` glass edge
- `box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25)` floating depth
- Inner highlight: `inset 0 1px 0 rgba(255, 255, 255, 0.1)` for glass refraction

**Search input:**
- Large, prominent, at the top of the panel
- Magnifying glass icon left-aligned
- Placeholder: "Search shortcuts..."
- Hotkey hint badge on the right (e.g. `⌘⇧Space`)

**Source filter pills:**
- Horizontal row of pill buttons below search
- "All" selected by default
- Each pill shows source icon + label
- Active pill: filled glass, inactive: subtle outline
- Scrollable horizontally if many sources

**Keybinding rows:**
- Clean, minimal rows — no heavy cards
- Left: key combo rendered with macOS-style `<kbd>` glyphs (⌘ ⌥ ⇧ ⌃)
- Right: command description
- Subtle separator between rows
- Hover: light glass highlight
- Context badges (e.g. "when: editorFocus") as small pills on the right

**Section headers:**
- When viewing "All" sources, group by source with thin section headers
- Source icon + label, small count badge

**Empty states:**
- No results: "No shortcuts matching [query]" with search icon
- No configs found: "No shortcuts detected — check your config files"

**Animations:**
- Window appear: fast scale-up from 0.95 + fade in (~150ms ease-out)
- Window dismiss: scale down to 0.95 + fade out (~100ms ease-in)
- Results: crossfade on filter/search change

**Accessibility:**
- Respect `prefers-reduced-transparency` (solid backgrounds)
- Respect `prefers-reduced-motion` (no scale animations)
- Full keyboard navigation: arrow keys through results, Enter to copy shortcut
- Proper ARIA roles for search, listbox, options

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Electron ^41 | Native window APIs (vibrancy, frameless, always-on-top, global shortcuts) |
| Build | Electron Forge ^7 + Vite plugin | Official tooling, fast HMR |
| Renderer | React 19 + TypeScript 5.8 | Component model, hooks |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`) | Utility-first, fast iteration |
| Search | Fuse.js ^7 | Client-side fuzzy search |
| File watching | chokidar ^4 | Cross-platform config watchers |
| Icons | Lucide React | Clean line icons |
| Testing | Vitest + React Testing Library | Unit + component tests |
| Linting | ESLint 9 + Prettier | Code quality |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 RENDERER PROCESS                     │
│  React + Tailwind (Liquid Glass launcher panel)      │
│                                                      │
│  SearchInput → FilterPills → KeybindingList          │
│         │                          │                 │
│     Fuse.js                  useKeybindings          │
│                                    │                 │
│                        window.electronAPI             │
└────────────────────────┬────────────────────────────-┘
                         │  contextBridge (preload)
                    IPC channels
                         │
┌────────────────────────┴────────────────────────────-┘
│                  MAIN PROCESS                        │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Global       │  │ Parser       │  │ File       │ │
│  │ Shortcut     │  │ Registry     │  │ Watcher    │ │
│  │ (show/hide)  │  │              │  │ (chokidar) │ │
│  └──────────────┘  └──────┬───────┘  └────────────┘ │
│                           │                          │
│    ┌───────┬───────┬──────┼──────┬────┬────────┬─────┐│
│    │VSCode │Ghostty│ tmux │ zsh  │Obs.│ Chrome │macOS││
│    └───────┴───────┴──────┴──────┴────┴────────┴─────┘│
│                           │                          │
│                    ┌──────┴──────┐                    │
│                    │ platform/   │                    │
│                    │ paths.ts    │                    │
│                    └─────────────┘                    │
└──────────────────────────────────────────────────────┘
```

### Data Flow

1. Main process registers a **global shortcut** (e.g. `Cmd+Shift+Space`)
2. On hotkey press: show/hide the BrowserWindow (toggle)
3. On show: if cache is stale, re-parse all configs via `ParserRegistry`
4. Each parser reads its config file(s), returns `Keybinding[]`
5. Results sent to renderer via IPC
6. Renderer indexes with Fuse.js, renders the launcher panel
7. chokidar watches config files — on change, re-parses that source and pushes update via IPC

---

## Project Structure

```
shortty/
├── forge.config.ts                  # Electron Forge config
├── vite.main.config.ts
├── vite.preload.config.ts
├── vite.renderer.config.ts
├── tsconfig.json
├── package.json
├── index.html                       # Renderer HTML entry
│
├── src/
│   ├── main/
│   │   ├── index.ts                 # App entry: BrowserWindow, global shortcut, show/hide
│   │   ├── ipc.ts                   # IPC handler registration
│   │   ├── watcher.ts               # chokidar file watcher manager
│   │   ├── parsers/
│   │   │   ├── types.ts             # ParserPlugin interface
│   │   │   ├── registry.ts          # Parser registry (discover, manage, cache)
│   │   │   ├── base-parser.ts       # Abstract base with shared helpers
│   │   │   ├── vscode.parser.ts
│   │   │   ├── ghostty.parser.ts
│   │   │   ├── tmux.parser.ts
│   │   │   ├── zsh.parser.ts
│   │   │   ├── obsidian.parser.ts
│   │   │   ├── chrome.parser.ts
│   │   │   └── macos-system.parser.ts
│   │   └── platform/
│   │       └── paths.ts             # Cross-platform config path resolution
│   │
│   ├── preload/
│   │   └── index.ts                 # contextBridge: typed IPC API
│   │
│   ├── renderer/
│   │   ├── main.tsx                 # React entry
│   │   ├── App.tsx                  # Root component
│   │   ├── styles/
│   │   │   └── globals.css          # Tailwind directives + Liquid Glass tokens + kbd styles
│   │   ├── hooks/
│   │   │   ├── useKeybindings.ts    # Fetch + subscribe to keybinding data via IPC
│   │   │   └── useSearch.ts         # Fuse.js fuzzy search wrapper
│   │   ├── components/
│   │   │   ├── LauncherPanel.tsx    # Main glass panel container
│   │   │   ├── SearchInput.tsx      # Search bar with icon + hotkey badge
│   │   │   ├── FilterPills.tsx      # Horizontal source filter pills
│   │   │   ├── KeybindingList.tsx   # Scrollable results list with section headers
│   │   │   ├── KeybindingRow.tsx    # Single keybinding row
│   │   │   ├── KeyCombo.tsx         # Renders key combo with macOS glyphs
│   │   │   └── EmptyState.tsx       # No results / no configs state
│   │   └── lib/
│   │       └── ipc.ts              # Typed wrapper around window.electronAPI
│   │
│   └── shared/
│       └── types.ts                 # Keybinding, ParserMeta (shared main↔renderer)
│
├── tests/
│   ├── unit/
│   │   └── parsers/                 # One test file per parser + fixture data
│   │       ├── vscode.test.ts
│   │       ├── ghostty.test.ts
│   │       ├── tmux.test.ts
│   │       ├── zsh.test.ts
│   │       ├── obsidian.test.ts
│   │       ├── chrome.test.ts
│   │       └── macos-system.test.ts
│   └── components/
│       ├── SearchInput.test.tsx
│       ├── FilterPills.test.tsx
│       └── KeybindingList.test.tsx
│
└── fixtures/                        # Test fixture config files
    ├── vscode-keybindings.json
    ├── ghostty-config
    ├── tmux-list-keys.txt
    ├── zshrc
    ├── obsidian-hotkeys.json
    ├── chrome-preferences.json
    └── macos-symbolichotkeys.plist
```

---

## Core Types

```typescript
// src/shared/types.ts

interface Keybinding {
  id: string;               // deterministic hash of source+key+command
  source: string;            // "vscode", "ghostty", "tmux", "zsh", "obsidian", "chrome", "macos-system"
  sourceLabel: string;       // "VS Code", "Ghostty", "tmux", "Zsh", "Obsidian", "Chrome", "macOS"
  key: string;              // normalized display: "⌘⇧T" or "Ctrl+Shift+T"
  command: string;           // human-readable action name
  rawCommand: string;        // original command string from config
  context?: string;          // e.g. "editorFocus" (VSCode when clause)
  isDefault: boolean;        // true = from defaults, false = user config
  isUnbound: boolean;        // true if this unbinds a default (VSCode "-command")
  filePath: string;          // which config file this came from
}

interface ParserMeta {
  id: string;                // "vscode"
  label: string;             // "VS Code"
  icon: string;              // emoji or icon identifier
  platforms: ('darwin' | 'win32' | 'linux')[];
}

interface ParserPlugin {
  meta: ParserMeta;
  isAvailable(): Promise<boolean>;    // is the tool installed?
  getWatchPaths(): string[];          // config file paths to watch
  parse(): Promise<Keybinding[]>;     // read configs, return keybindings
}
```

---

## Parser Details

### Auto-Discovery

Before parsing, Shortty auto-discovers installed apps by scanning common config locations. This runs at startup and periodically.

**Discovery strategy per platform:**

| Platform | Scan locations |
|----------|---------------|
| macOS | `/Applications/`, `~/Library/Application Support/`, `~/.config/`, `~/Library/Preferences/` (plists) |
| Linux | `~/.config/`, `~/.local/share/applications/`, `/usr/share/applications/` |
| Windows | `%APPDATA%/`, `%LOCALAPPDATA%/`, `%PROGRAMFILES%/` |

For each supported parser, the registry calls `isAvailable()` which checks if the config file exists at any of the known paths. Only parsers for installed/configured apps appear in the UI.

For apps like Obsidian where config paths are per-vault (e.g. `<vault>/.obsidian/hotkeys.json`), discovery scans common vault locations (`~/Documents/`, `~/Desktop/`, `~/`) for `.obsidian/` directories.

### Discovered Apps (your system)

Scan of the host machine found the following trackable keybinding sources:

**v1 — Supported parsers:**

| App | Config file | Format | Notes |
|-----|-------------|--------|-------|
| **VS Code** | `~/Library/Application Support/Code/User/keybindings.json` | JSONC array | 9 custom keybindings |
| **Ghostty** | `~/Library/Application Support/com.mitchellh.ghostty/config.ghostty` | `keybind = key=action` | 12 custom keybinds (splits, vim nav, quick terminal) |
| **tmux** | Live: `tmux list-keys` | `bind-key -T <table> <key> <cmd>` | No `.tmux.conf` — uses defaults. Live query via child process |
| **Zsh** | `~/.zshrc` | `bindkey 'seq' widget` | Oh-my-zsh defaults; no explicit bindkey calls currently |
| **Obsidian** | `<vault>/.obsidian/hotkeys.json` (auto-discovered) | JSON `{ "cmd": [{modifiers, key}] }` | Found vault: `~/Documents/github/wiki/` — 4 custom hotkeys |
| **Chrome** | `~/Library/Application Support/Google/Chrome/Default/Preferences` | Nested JSON (`extensions.commands`) | Extension shortcuts: Bitwarden, Notion Clipper, AdBlock, Phantom |
| **macOS System** | `~/Library/Preferences/com.apple.symbolichotkeys.plist` | Binary plist | Mission Control, Spotlight, Show Desktop, etc. |

**Future candidates (not in v1):**

| App | Config location | Complexity | Notes |
|-----|----------------|------------|-------|
| Xcode | `~/Library/Developer/Xcode/UserData/KeyBindings/*.idekeybindings` | Medium | Plist format, well-structured |
| Adobe Premiere Pro | `*.kys` files (proprietary XML) | High | Binary/XML hybrid, no custom presets found |
| Magnet | `~/Library/Preferences/com.crowdcafe.windowmagnet.plist` | Medium | Binary-encoded JSON keycodes, needs reverse-engineering |
| macOS per-app shortcuts | `NSUserKeyEquivalents` in app plists | Low | None configured on this system |

### Config Path Resolution

| Parser | macOS | Windows | Linux |
|--------|-------|---------|-------|
| VS Code | `~/Library/Application Support/Code/User/keybindings.json` | `%APPDATA%/Code/User/keybindings.json` | `~/.config/Code/User/keybindings.json` |
| Ghostty | `~/Library/Application Support/com.mitchellh.ghostty/config.ghostty` | `%APPDATA%/ghostty/config` | `~/.config/ghostty/config` |
| tmux | `~/.tmux.conf`, `~/.config/tmux/tmux.conf`, or live `tmux list-keys` | N/A | same as macOS |
| Zsh | `~/.zshrc` | N/A | same as macOS |
| Obsidian | `<vault>/.obsidian/hotkeys.json` (auto-discovered) | `<vault>/.obsidian/hotkeys.json` | same as macOS |
| Chrome | `~/Library/Application Support/Google/Chrome/Default/Preferences` | `%LOCALAPPDATA%/Google/Chrome/User Data/Default/Preferences` | `~/.config/google-chrome/Default/Preferences` |
| macOS System | `~/Library/Preferences/com.apple.symbolichotkeys.plist` | N/A | N/A |

### Parsing Rules

**VS Code** — JSON with comments (JSONC). Each entry: `{ "key": "...", "command": "...", "when": "..." }`. Commands starting with `-` are unbinds. Must handle multi-chord keys like `cmd+k cmd+s`.

**Ghostty** — Line-based config. Pattern: `keybind = <key>=<action>`. Supports leader-key sequences via `>` (e.g. `ctrl+a>h=new_split:left`). Keys use `super`, `ctrl`, `shift`, `alt`, `cmd` modifiers joined with `+`. Config path on macOS is `~/Library/Application Support/com.mitchellh.ghostty/config.ghostty` (not `~/.config/ghostty/config`).

**tmux** — Two strategies:
1. **Config file** (`~/.tmux.conf` or `~/.config/tmux/tmux.conf`): parse `bind-key`/`bind` and `unbind-key` patterns. The `-n` flag means root table (no prefix).
2. **Live query** (fallback): execute `tmux list-keys` to get all current bindings including defaults. Parse output format: `bind-key -T <table> <key> <command>`.

**Zsh** — Parse `bindkey '<key-sequence>' <widget>` from `~/.zshrc`. Key sequences: `^` = Ctrl, `\e` = Escape/Alt, `\e[` = arrow key sequences. Also parse `bindkey -M <keymap>` variants.

**Obsidian** — JSON object per vault at `<vault>/.obsidian/hotkeys.json`. Format: `{ "plugin-id:command-name": [{ "modifiers": ["Mod", "Shift"], "key": "P" }] }`. `Mod` maps to `Cmd` on macOS, `Ctrl` on Windows/Linux. Empty arrays mean the hotkey was explicitly unbound. Auto-discover vaults by scanning `~/Documents/`, `~/Desktop/`, `~/` for `.obsidian/` directories.

**Chrome** — JSON file at Chrome's `Default/Preferences`. Extension shortcuts live at `extensions.commands` key. Format: `{ "<platform>:<shortcut>": { "command_name": "...", "extension": "<ext-id>", "global": bool } }`. Resolve extension names from `extensions/<id>/<version>/manifest.json` (with `_locales/` fallback for `__MSG_*` names). Platform prefix is `mac:` on macOS, `windows:` on Windows.

**macOS System** — Binary plist at `~/Library/Preferences/com.apple.symbolichotkeys.plist`. Each shortcut has a numeric ID mapped to a known action (e.g. 64 = Spotlight). The `value.parameters` array contains `[charCode, keyCode, modifierFlags]`. Modifier flags: `131072` = Shift, `262144` = Ctrl, `524288` = Option, `1048576` = Cmd. Combine flags via bitwise OR. Use `plutil` or Node's `plist` library to read.

---

## IPC Contract

```typescript
// Exposed via contextBridge in preload

interface ElectronAPI {
  getSources(): Promise<ParserMeta[]>;
  getAllKeybindings(): Promise<Keybinding[]>;
  getKeybindingsBySource(sourceId: string): Promise<Keybinding[]>;
  refreshKeybindings(): Promise<Keybinding[]>;
  onKeybindingsUpdate(cb: (data: { sourceId: string; keybindings: Keybinding[] }) => void): () => void;
}
```

---

## Implementation Phases

### Phase 1: Scaffolding
- Initialize Electron Forge with Vite + TypeScript template
- Install dependencies (React, Tailwind 4, chokidar, fuse.js, lucide-react)
- Configure TypeScript (strict, ESNext, JSX)
- Configure Tailwind with `@tailwindcss/vite`
- Create directory structure
- Basic BrowserWindow: frameless, transparent, centered, always-on-top
- Global shortcut registration (show/hide toggle)
- Verify: app launches as floating centered panel, toggles with hotkey

### Phase 2: Parser Infrastructure
- `src/shared/types.ts` — Keybinding, ParserMeta types
- `src/main/parsers/types.ts` — ParserPlugin interface
- `src/main/parsers/base-parser.ts` — Abstract base (file read, key normalization, ID generation)
- `src/main/parsers/registry.ts` — ParserRegistry (register, parseAll, parseSource, caching)
- `src/main/platform/paths.ts` — Cross-platform config path resolution
- Verify: registry can register and invoke parsers

### Phase 3: Individual Parsers + Tests
- Implement each parser: VSCode, Ghostty, tmux, Zsh, Obsidian, Chrome, macOS System
- Create fixture files in `fixtures/` with realistic config samples from the host machine
- Write unit tests for each parser using Vitest
- Test edge cases: empty files, comments, malformed lines, multi-chord keys, missing configs
- Verify: `npm test` — all parser tests pass

### Phase 4: IPC + File Watching
- `src/preload/index.ts` — contextBridge with typed API
- `src/main/ipc.ts` — IPC handler registration
- `src/main/watcher.ts` — chokidar watchers on parser config paths
- On file change: re-parse, push `keybindings:onUpdate` to renderer
- Verify: modify a config file → keybindings auto-update in app

### Phase 5: Renderer UI
- `globals.css` — Tailwind directives, Liquid Glass tokens, kbd styles, animations
- `LauncherPanel.tsx` — Glass panel container with rounded corners, shadow, blur
- `SearchInput.tsx` — Autofocused search with icon and hotkey badge
- `FilterPills.tsx` — Horizontal source pills
- `KeybindingList.tsx` — Scrollable grouped results
- `KeybindingRow.tsx` — Key combo + command + context badge
- `KeyCombo.tsx` — macOS glyph rendering (⌘ ⌥ ⇧ ⌃)
- `EmptyState.tsx` — No results / no configs
- `useKeybindings.ts` — IPC data hook
- `useSearch.ts` — Fuse.js hook
- Dark/light mode support
- Window show/hide animations (scale + fade)
- Verify: app shows real keybindings, search works, filters work

### Phase 6: Polish + Packaging
- Click-outside-to-dismiss behavior
- Escape key to dismiss
- Arrow key navigation through results
- Enter to copy shortcut to clipboard
- `prefers-reduced-transparency` and `prefers-reduced-motion` support
- App icons (.icns, .ico)
- `LSUIElement` / hide from dock on macOS
- Electron Forge makers (DMG for macOS, Squirrel for Windows)
- Verify: full user flow works end-to-end, `npm run make` produces distributable

---

## Verification Checklist

1. `npm start` → app launches as floating centered panel, no dock icon
2. Global hotkey → toggles panel visibility with animation
3. Type in search → fuzzy-matches keybindings across all sources
4. Click source pill → filters to that source only
5. Edit a config file → keybindings auto-refresh
6. Esc / click outside → dismisses the panel
7. Dark mode → glass tinting adapts
8. `npm test` → all parser unit tests pass
9. `npm run make` → produces installable app

---

## Non-Goals (v1)

- Custom keybinding editing (read-only viewer)
- Conflict detection between tools
- Plugin system for community parsers
- Windows Store / Mac App Store distribution
- Adobe apps (proprietary `.kys` binary format)
- Magnet (binary-encoded keycode format in plist)
