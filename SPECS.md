# Shortty — Specification

## 1. Vision

Shortty is a **lightweight desktop lookup tool** for keyboard shortcuts and CLI commands. Activated by a global hotkey, it presents a Spotlight-style floating panel where users instantly search across all their tools' keybindings and shell commands, then dismiss it.

It is a **lookup tool, not a browser**. Users come with intent, type a query, find what they need, and leave. Every invocation is a fresh start.

**Primary platform:** macOS (Liquid Glass aesthetic).
**Secondary:** Windows, Linux.

---

## 2. Problem

Developers and power users juggle keybindings across many tools — editors, terminals, browsers, system shortcuts — and constantly forget shortcuts or need to look them up. CLI tools number in the thousands, each with their own subcommands and flags. There is no single place to search "what's bound to Cmd+Shift+T?" or "what are the git commit flags?" across all tools at once.

---

## 3. Solution

A lightweight, always-available launcher that:

1. Aggregates shortcuts from installed tools via **cheatsheets** (curated defaults) and **parsers** (live user config detection)
2. Indexes CLI commands dynamically from the user's **PATH**, enriched with subcommands and flags from man pages and shell completions
3. Presents everything in a fast, searchable floating panel with **instant fuzzy search**
4. Auto-refreshes shortcuts when config files change via file watchers
5. Progressively enriches CLI command data in the background without impacting performance

---

## 4. Data Model

### 4.1 Two Separate Types

Shortcuts and commands are fundamentally different shapes. They are stored in **separate data structures** and **separate Fuse.js indices**, never mixed.

#### Shortcut

```typescript
interface Shortcut {
  id: string;                // SHA-256 hash (12 chars) of source + rawCommand
  source: string;            // Source ID: "vscode", "ghostty", "tmux", etc.
  sourceLabel: string;       // Display name: "VS Code", "Ghostty", etc.
  key: string;               // Display format with glyphs: "⌘⇧T"
  searchKey: string;         // Search format: "cmd shift t"
  command: string;           // Human-readable action: "Reopen Closed Editor"
  rawCommand: string;        // Original command ID: "workbench.action.reopenClosedEditor"
  context?: string;          // Mode/state: "editorFocus", "normal", "prefix"
  category?: string;         // Optional grouping: "Navigation", "Editing"
  isDefault: boolean;        // true = from cheatsheet, false = user override
  isUnbound: boolean;        // true = explicitly unbound
  filePath: string;          // Source config file path
  origin: 'cheatsheet' | 'user-config' | 'app-defaults';
}
```

#### Command

```typescript
interface Command {
  name: string;              // Executable name: "git"
  description: string;       // One-line description: "the stupid content tracker"
  bin: string;               // Full path: "/usr/bin/git"
  mtime: number;             // Binary modification time
  enrichment: 'basic' | 'partial' | 'full' | 'failed';
  enrichedFrom?: 'zsh-completion' | 'bash-completion' | 'man' | 'help';
  enrichedAt?: string;       // ISO timestamp
  hasManPage: boolean;
  hasCompletion: boolean;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
}

interface CommandDetail {
  name: string;              // "commit"
  description: string;       // "Record changes to the repository"
}

interface FlagDetail {
  short?: string;            // "-m"
  long?: string;             // "--message"
  arg?: string;              // "<msg>"
  description: string;       // "Commit message"
}
```

### 4.2 Identity Keys

| Type | Identity | Purpose |
|------|----------|---------|
| Shortcut | `source` + `rawCommand` | Merge cheatsheet defaults with user overrides |
| Command | `name` (executable name) | Deduplicated by first occurrence in PATH |

---

## 5. Architecture

### 5.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                         │
│                                                          │
│  ┌─────────────────────┐  ┌───────────────────────────┐ │
│  │  SHORTCUTS ENGINE    │  │  COMMANDS ENGINE          │ │
│  │                      │  │                            │ │
│  │  Cheatsheets (JSON)  │  │  Persistent Index          │ │
│  │  + Config Parsers    │  │  (commands-index.json)     │ │
│  │  + Merge Layer       │  │  + Detail Cache            │ │
│  │  + File Watcher      │  │  + Background Enrichment   │ │
│  └──────────┬───────────┘  └──────────┬────────────────┘ │
│             │                         │                   │
│  ┌──────────┴─────────────────────────┴────────────────┐ │
│  │                    IPC Layer                          │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                          │                                │
│  ┌───────────────┐  ┌───┴──────────┐  ┌──────────────┐  │
│  │ Global Shortcut│  │ Settings     │  │ System Tray  │  │
│  │ (show/hide)   │  │ (electron-   │  │ + Preferences│  │
│  │               │  │  store)      │  │   Window     │  │
│  └───────────────┘  └──────────────┘  └──────────────┘  │
└──────────────────────────┬───────────────────────────────┘
                           │ contextBridge (preload)
┌──────────────────────────┴───────────────────────────────┐
│                    RENDERER PROCESS                       │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Search Bar   │  │ Results List │  │ Fuse.js         │ │
│  │              │→ │ (3 sections) │← │ (2 instances:   │ │
│  │              │  │              │  │  shortcuts +    │ │
│  │              │  │              │  │  commands)      │ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Process Boundaries

| Process | Responsibilities | Restrictions |
|---------|-----------------|--------------|
| Main | File I/O, process spawning, file watching, settings persistence, cheatsheet loading, parser execution, command indexing, enrichment worker | N/A |
| Preload | Expose typed API via contextBridge | No direct Node.js access |
| Renderer | UI rendering, Fuse.js search, keyboard navigation, clipboard operations | No file I/O, no process spawning, no `require('fs')` |

### 5.3 Security

- Context isolation: on
- Node integration in renderer: off
- Sandbox: on for renderer
- ASAR integrity: on
- Electron fuses: cookie encryption, no RunAsNode
- Code signing + notarization for macOS distribution (Apple Developer account)
- No telemetry, no network calls, all data stays local
- Logs contain summaries only, never file contents
- Cache stores parsed results, not raw config data

---

## 6. Shortcuts Engine

### 6.1 Cheatsheet System

Cheatsheets are **JSON files embedded in the repository** that define default shortcuts for each application. They are the **primary data source** for shortcuts. Parsers are optional enhancers that detect user customizations.

#### Cheatsheet Location

```
src/cheatsheets/
  schema.json                    # JSON Schema for validation
  sources/
    vscode.json
    chrome.json
    finder.json
    vim.json
    ghostty.json
    tmux.json                    # Metadata only (parser provides defaults)
    zsh.json                     # Metadata only
    bash.json                    # Metadata only
    obsidian.json                # Metadata only
    macos-system.json            # Metadata only
```

#### Cheatsheet Schema

```json
{
  "id": "vscode",
  "label": "VS Code",
  "icon": "⌨️",
  "platforms": ["darwin", "win32", "linux"],
  "parser": "vscode",
  "lastVerified": { "version": "1.96", "date": "2026-04-01" },
  "defaultPaths": {
    "darwin": ["~/Library/Application Support/Code/User/keybindings.json"],
    "win32": ["%APPDATA%/Code/User/keybindings.json"],
    "linux": ["~/.config/Code/User/keybindings.json"]
  },
  "shortcuts": [
    {
      "command": "Command Palette",
      "rawCommand": "workbench.action.showCommands",
      "key": { "darwin": "Cmd+Shift+P", "win32": "Ctrl+Shift+P", "linux": "Ctrl+Shift+P" },
      "category": "General",
      "context": "editorFocus",
      "minVersion": "1.0"
    }
  ]
}
```

Key schema decisions:
- **`key`**: platform map object `{ darwin, win32, linux }` — explicit per-platform keys
- **`parser`**: string ID referencing a parser class, or `null` for cheatsheet-only sources
- **`defaultPaths`**: per-platform arrays, community-maintainable within the cheatsheet file
- **`category`**: optional string for UI grouping within a source
- **`context`**: generic field for mode/state (vim modes, VS Code when clauses, tmux tables, zsh keymaps)
- **`minVersion`**: optional, ignored in v1, available for future version-aware filtering
- **`lastVerified`**: metadata for contributors, no runtime version detection
- **`shortcuts`** array can be empty — metadata-only shell for parsers that provide their own defaults

#### JSON Schema Validation

A `schema.json` file validates cheatsheet structure. All cheatsheet files must pass validation. Errors caught at build time, not runtime.

### 6.2 Parser System

Parsers are **optional enhancers** that detect user customizations from config files. A cheatsheet defines the source; a parser adds live override detection.

#### Parser ↔ Cheatsheet Relationship

```
1. Load cheatsheet JSON → baseline shortcuts (defaults)
2. Parser declared?
   → No: done (cheatsheet-only source like Finder)
   → Yes: user config file exists?
     → No: done (cheatsheet defaults only)
     → Yes: parse user config → merge overrides onto defaults
3. Start file watcher on config path (if parser active)
```

**Merge rules:**
- Match by `source` + `rawCommand`
- User override replaces cheatsheet default's `key` field
- User override sets `isDefault: false`, `origin: 'user-config'`
- User entries not in cheatsheet → added as new entries
- Cheatsheet entries not overridden → kept with `isDefault: true`, `origin: 'cheatsheet'`

**Special case (tmux, macOS System, Zsh, Bash):**
Parser provides all data (defaults + user config). Cheatsheet has empty `shortcuts` array, serving only as metadata shell (id, label, icon, paths).

#### Parser Registration

Parsers register via a code-level map:

```typescript
const PARSERS: Record<string, new () => BaseParser> = {
  vscode: VscodeParser,
  ghostty: GhosttyParser,
  tmux: TmuxParser,
  zsh: ZshParser,
  bash: BashParser,
  obsidian: ObsidianParser,
  chrome: ChromeParser,
  'macos-system': MacosSystemParser,
  vim: VimParser,
};
```

Sources can enter the system through two doors:
- **Cheatsheet file** (with or without parser) — community/curated path
- **Parser in the code map** (with or without cheatsheet) — developer path

The registry merges both discovery paths into a unified source list.

#### Parsers work standalone

A parser without a cheatsheet works — it shows only what it can parse. No cheatsheet required. This allows developers to contribute parsers without curating a full cheatsheet.

### 6.3 Path Resolution

Config paths are resolved in this order:

1. **User override** (from settings, if set)
2. **Environment variable expansion** (`~`, `$HOME`, `$XDG_CONFIG_HOME`, `%APPDATA%`)
3. **Cheatsheet `defaultPaths`** for current platform (try each in order)
4. **Discovery scan** (for apps like Obsidian where paths aren't predictable)

User overrides support:
- Tilde expansion (`~`)
- Environment variables (`$HOME`, `$XDG_CONFIG_HOME`, `%APPDATA%`)
- Absolute paths
- Per-source, single platform (override applies to current OS only)
- String for single-path sources, array for multi-path sources (Obsidian vaults)

### 6.4 File Watching

chokidar watches config paths for all active sources with parsers. On file change:

1. Re-parse that single source only
2. Re-merge with cheatsheet defaults
3. Update Fuse.js index
4. Push update to renderer via IPC

File watcher is trusted — no rebuild on window show. chokidar can watch non-existent paths and fire when they appear.

Rebuild triggers:
- File watcher fires → re-parse single source
- User enables/disables a source → add/remove from index + watcher
- User changes path override → stop old watcher, re-detect, start new watcher
- App startup → full load

### 6.5 Supported Sources (v1)

| Source | Cheatsheet | Parser | Platforms |
|--------|-----------|--------|-----------|
| VS Code | Curated (~150-200) | keybindings.json JSONC | all |
| Ghostty | Curated (~30) | config file | darwin, linux |
| tmux | Metadata only | config + `tmux list-keys` | darwin, linux |
| Zsh | Metadata only | .zshrc bindkey | darwin, linux |
| Bash | Metadata only | .inputrc + .bashrc bind | darwin, linux |
| Obsidian | Metadata only | hotkeys.json per vault | all |
| Chrome | Curated (~50-60) | extension shortcuts | all |
| macOS System | Metadata only | symbolichotkeys.plist | darwin |
| vim | Curated (~100-150) | .vimrc (vimscript only) | darwin, linux |
| Finder | Curated (~40-50) | None | darwin |

---

## 7. Commands Engine

### 7.1 Overview

The commands engine dynamically indexes every CLI command available on the user's system, enriched with subcommands and flags from man pages and shell completions. It is a **separate subsystem** from shortcuts, with its own data pipeline and Fuse.js index.

### 7.2 Tiered Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   COMMANDS ENGINE                        │
│                                                          │
│  TIER 1 — Immediate (~200ms, on startup)                │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Scan PATH directories → command names               │  │
│  │ Read whatis database → one-line descriptions        │  │
│  │ Result: ~4,000 entries with name + description      │  │
│  │ Memory: ~500KB    Fuse.js build: ~30ms              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  TIER 3 — Background enrichment (after startup)         │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Priority order per command:                         │  │
│  │   1. Zsh completion files (structured, ~3ms/file)   │  │
│  │   2. Bash completion files (structured, ~3ms/file)  │  │
│  │   3. Man pages (structured, ~5ms/file)              │  │
│  │   4. --help output (last resort, ~100ms, spawn)     │  │
│  │ First source that yields results wins (no merging)  │  │
│  │ Results cached to disk per command                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  PERSISTENT CACHE                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │ {userData}/cache/meta.json          PATH hash       │  │
│  │ {userData}/cache/commands-index.json All commands    │  │
│  │ {userData}/cache/details/{name}.json Per-command     │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 7.3 Index Lifecycle

**First launch (cold):**
1. No cached index exists
2. Tier 1: scan PATH + whatis → basic index (~200ms)
3. Save index to disk
4. Searchable immediately with name + description
5. Background enrichment worker starts

**Subsequent launches (warm):**
1. Read cached index from disk (~10-30ms)
2. Fully searchable immediately, including enriched details
3. Quick diff: `hash(PATH + directory mtimes)` vs cached hash
4. Same → done. Different → incremental update (add new, remove old)
5. Background worker resumes enrichment of any unenriched entries

**Invalidation:**
- PATH hash comparison on each startup and on window show in commands mode
- If hash matches → cache is valid
- If hash differs → rescan, incremental update
- Per-command detail cache: invalidated when binary mtime changes

### 7.4 Expanded Index

Commands are indexed with subcommand expansion:
- `git` exists as its own entry (top-level)
- `git commit` exists as a separate entry
- `git push` exists as a separate entry
- etc.

Unenriched commands are top-level entries only (~5,000). As enrichment runs, subcommand entries are added. Index grows from ~5,000 to potentially ~50,000 entries. Fuse.js handles this in under 20ms per query.

### 7.5 Enrichment Worker

**Parameters:**

| Parameter | Value |
|-----------|-------|
| File read concurrency | 3 parallel |
| Process spawn concurrency (`--help`) | 1 at a time |
| Process timeout | 2 seconds, hard kill |
| Pause when | Main window is visible |
| Resume when | Window hidden or 5s idle |
| Batch save | Every 50 commands enriched |
| Priority | Commands with man pages first |
| First launch | Enrichment starts immediately |

**Enrichment source discovery:**
- Man page locations: single `man --path` command at startup
- Zsh completion locations: single `zsh -c 'echo $FPATH'` at startup
- Bash completion locations: `pkg-config --variable=completionsdir bash-completion` or fallback to `/usr/share/bash-completion/completions`
- Both zsh and bash completions supported; zsh checked first (richer format), deduplicated by command name

**`--help` blocklist (hardcoded):**

System/destructive: `shutdown`, `reboot`, `halt`, `poweroff`, `init`, `rm`, `mkfs`, `fdisk`, `dd`, `kill`, `killall`, `pkill`

Daemons: `httpd`, `nginx`, `postgres`, `mysqld`, `mongod`, `redis-server`, `dockerd`, `sshd`, `cupsd`

Interactive: `ssh`, `telnet`, `ftp`, `sftp`, `nc`, `ncat`, `python`, `python3`, `node`, `ruby`, `irb`, `lua`, `perl`, `bash`, `zsh`, `sh`, `fish`, `tcsh`, `csh`

Additional rules:
- Skip dotfile/hidden commands (names starting with `.` or `_`)
- Never spawn as root
- 2 second timeout, hard kill
- Skip binaries not owned by root or current user

**Whatis fallback:**
If whatis database doesn't exist, Tier 1 index has names with no descriptions. Enrichment naturally fills descriptions from man page NAME sections. No special handling needed.

### 7.6 Cache Location

All persistent data at `app.getPath('userData')`:

```
~/Library/Application Support/shortty/     (macOS)
%APPDATA%/shortty/                         (Windows)
~/.config/shortty/                         (Linux)

Structure:
├── config.json                  # electron-store (settings)
├── cache/
│   ├── meta.json                # PATH hash, timestamps, enrichment stats
│   ├── commands-index.json      # Tier 1 full inventory
│   └── details/                 # Per-command enrichment
│       ├── git.json
│       ├── docker.json
│       └── ...
```

### 7.7 Platform Differences

| Platform | Tier 1 | Enrichment sources |
|----------|--------|-------------------|
| macOS | PATH scan + whatis | zsh completions → bash completions → man pages → --help |
| Linux | PATH scan + whatis | zsh completions → bash completions → man pages → --help |
| Windows | PATH scan | --help only (no man pages, no shell completions) |

---

## 8. Search Architecture

### 8.1 Two Fuse.js Instances

| | Shortcuts Index | Commands Index |
|---|---|---|
| Data type | `Shortcut` | `Command` (expanded with subcommands) |
| Size | Hundreds to low thousands | 5,000–50,000 |
| Updated by | Cheatsheet load + parser merge + file watcher | PATH scan + enrichment worker |
| Rebuilt when | Source config changes | PATH changes |
| Queried when | Every search (or when not in prefix mode) | Every search (or when `>` prefix active) |

### 8.2 Shortcut Search Weights (user-configurable)

```
key / searchKey:   0.4   (default)
command:           0.4   (default)
sourceLabel:       0.1   (default)
context:           0.1   (default)
threshold:         0.35  (default)
```

### 8.3 Command Search Weights (fixed in v1)

```
name:              0.5
description:       0.3
subcommands:       0.2
```

### 8.4 Search Modes

**Default: unified search.** Type anything → results from both shortcuts and commands, visually separated into sections.

**Optional: command prefix mode** (setting). When enabled, default search returns shortcuts only. `>` prefix returns commands only. Power user feature.

### 8.5 Result Sections

Search results display in three fixed-order sections:

1. **Sources** — matching source names. Only appears when query matches a source name.
2. **Shortcuts** — matching keybindings across all active sources.
3. **Commands** — matching CLI commands (if commands feature enabled).

**Default limits (configurable in settings):**

| Section | Limit |
|---------|-------|
| Sources | 3 |
| Shortcuts | 8 |
| Commands | 5 |

Each section shows "Show all X results" when truncated. No debouncing — instant search on every keystroke.

---

## 9. Settings

### 9.1 App Settings

| Setting | Type | Default | Location |
|---------|------|---------|----------|
| Launch at Login | boolean | `false` | General tab |
| Show in Dock | boolean | `false` | General tab |
| Show in Menu Bar | boolean | `true` | General tab |
| Dismiss After Copy | boolean | `true` | General tab |
| Global Shortcut | string | `CommandOrControl+Shift+Space` | General tab |
| Window Position | enum | `top-center` | General tab |
| Theme | enum | `system` | General tab |
| Disabled Sources | string[] | `[]` | Sources tab |
| Source Path Overrides | Record | `{}` | Sources tab |
| Shortcut Search Weights | object | see §8.2 | Search tab |
| Command Prefix Mode | boolean | `false` | Search tab |
| Result Limits | object | see §8.5 | Search tab |
| Commands Enabled | boolean | `true` | Commands tab |

**Visibility safety:** if user disables both Dock and Menu Bar, show confirmation dialog: "You'll only be able to access Shortty via the keyboard shortcut. Are you sure?" Escape hatch: `shortty --reset-settings` CLI flag.

Theme values: `light | dark | system`. No additional theming in v1.

### 9.2 Preferences Window Structure

| Tab | Contents |
|-----|----------|
| **General** | Launch at login, show in dock, show in menu bar, dismiss after copy, global shortcut recorder, window position, theme |
| **Sources** | All sources with enable/disable toggle, detection status, path overrides per source |
| **Search** | Shortcut weight sliders, command prefix mode toggle, result section limits |
| **Commands** | Enable/disable commands feature (room for future enrichment settings) |

### 9.3 Source Activation

All sources appear in Preferences → Sources:

| State | Meaning | Visual |
|-------|---------|--------|
| Enabled + Detected | Active, config found, parsing live | Green check |
| Enabled + Not detected | Active, cheatsheet defaults only | Yellow warning, "cheatsheet only" |
| Enabled + Cheatsheet only | No parser (e.g., Finder) | Info badge |
| Disabled | Excluded from search and watchers | Greyed out |

Users can enable sources for apps they don't have installed (browse shortcuts as a learning tool).

### 9.4 Path Override UI

Per source in Preferences → Sources:
- Show detected path with existence indicator (green check / red X)
- Show auto-detected path even when override is set (greyed out)
- Override input: text field + native file picker
- Environment variable support (`~`, `$HOME`, `$XDG_CONFIG_HOME`, `%APPDATA%`)
- Validation: warn if path doesn't exist, still allow save
- Reset button to clear override
- Multi-path sources (Obsidian): list with add/remove buttons

---

## 10. UX Specification

### 10.1 Core Interaction Model

The panel is a **lookup tool**. Users come with intent.

- **Global hotkey** (`⌘⇧Space` default) summons the panel
- **Blank on open** — search bar focused, no results displayed, ready for input
- **Type to search** — results appear instantly in three sections (Sources, Shortcuts, Commands)
- **Full state reset on every open** — query cleared, back to flat mode
- **Dismiss** — Esc (in flat mode), click outside, blur/focus loss, global hotkey toggle

### 10.2 Navigation Model: Flat → Drill-In

**Flat mode (default):**
Search across all sources. Results show Sources, Shortcuts, and Commands sections.

**Drill-in to source:**
Select a source from the Sources section (Enter) → panel scopes to that source. Shows all entries for that source. Search filters within source. Esc returns to flat mode.

**Drill-in to command:**
On a command row, Tab or → drills into command detail view. Shows subcommands and flags. Search filters within details. Esc returns to results.

### 10.3 Search Behavior

- **Instant** — no debouncing, Fuse.js responds in <5ms
- **Empty query** — blank panel, no results
- **Empty results** — no message, absence of results is the feedback
- **Sources in search** — source names are searchable; typing "vsc" shows VS Code in Sources section
- **Cross-section navigation** — ↑/↓ treats all rows as one flat list, wraps around at boundaries

### 10.4 Entry Anatomy

**Shortcut row:**
- Left: key combo as kbd pills (macOS glyphs)
- Center: command name
- Right: source label (in flat mode), hidden when drilled into source
- Context badge below command name if present (small, muted)

**Command row:**
- Left: command name as code badge
- Center: description
- Right: empty

**Source row:**
- Source icon + name + entry count

### 10.5 Entry Actions

| Key | On Source Row | On Shortcut Row | On Command Row |
|-----|-------------|-----------------|----------------|
| Enter | Drill into source | Copy key combo to clipboard | Copy command to clipboard |
| Tab / → | — | — | Drill into command details |
| Esc | — | — | Back from detail view |

### 10.6 Visual Feedback

- **Copy**: row briefly flashes (~300ms) to confirm clipboard write
- **Dismiss after copy**: configurable setting (default: on)

### 10.7 Keyboard Map

| Key | Flat Search | Drilled Into Source | Command Detail |
|-----|-------------|--------------------| --------------|
| `⌘⇧Space` | Toggle panel | Toggle panel | Toggle panel |
| `Esc` | Dismiss | Back to flat | Back to results |
| `↑` / `↓` | Navigate rows | Navigate rows | Navigate rows |
| `Enter` | Action (per row type) | Copy shortcut | Copy subcommand/flag |
| `Tab` / `→` | Drill into command | Drill into command | — |
| Any character | Search input | Search within source | Filter within details |
| `?` icon | Show keyboard shortcuts help | — | — |

### 10.8 Window Behavior

| Property | Value |
|----------|-------|
| Size | 680×500px, fixed |
| Frame | Frameless, no title bar |
| Position | Configurable: top-center (default), center, mouse |
| Always on top | Yes |
| Show in dock | Configurable (default: off) |
| Show in mission control | No |
| Background | Transparent, Liquid Glass panel |
| Scrolling | Scroll within fixed window when results overflow |
| Dismiss | Esc, click outside, blur, global shortcut toggle |
| State on reopen | Full reset (blank) |

### 10.9 Animations

- **Show**: scale from 0.97 → 1.0 + opacity 0 → 1, 120ms ease-out
- **Hide**: scale from 1.0 → 0.97 + opacity 1 → 0, 80ms ease-in
- **Respects `prefers-reduced-motion`**: instant show/hide when enabled

### 10.10 Result Section Limits

| Section | Default | Configurable |
|---------|---------|-------------|
| Sources | 3 | Yes |
| Shortcuts | 8 | Yes |
| Commands | 5 | Yes |

"Show all X results" row when truncated. Expanding pushes other sections down.

---

## 11. App Lifecycle

### 11.1 Startup Sequence

```
1. App ready
2. Read settings from electron-store
3. Apply settings (theme, dock, menu bar, login, global shortcut)
4. Create system tray (if menu bar enabled)
5. Load sources (parallel):
   ├─ 5a. Shortcuts engine:
   │   ├─ Load cheatsheet JSONs
   │   ├─ For each with parser + detected config → parse overrides
   │   ├─ Merge: cheatsheet defaults + overrides
   │   ├─ Build Fuse.js shortcuts index
   │   └─ Start file watchers
   │
   └─ 5b. Commands engine (if enabled):
       ├─ Read cached commands-index.json (if exists)
       ├─ If cache miss or stale → Tier 1 scan
       ├─ Build Fuse.js commands index
       └─ Start background enrichment worker
6. Window ready for activation
```

Window is NOT shown on startup. App launches silently into tray/dock.

### 11.2 Shortcuts Rebuild Triggers

| Event | Action |
|-------|--------|
| File watcher fires | Re-parse single source, re-merge, update index |
| User enables source | Load cheatsheet + parse, add to index, start watcher |
| User disables source | Remove from index, stop watcher |
| User changes path override | Stop old watcher, re-detect, re-parse, start new watcher |
| App startup | Full load |
| Window shown | No rebuild (trust file watcher) |

### 11.3 Commands Rebuild Triggers

| Event | Action |
|-------|--------|
| App startup | Read cache → diff PATH hash → incremental update |
| Window shown (commands mode) | Quick PATH hash check → rebuild only if changed |
| Enrichment batch complete | Update Fuse.js with new entries |
| User disables commands | Stop worker, unload index |
| User re-enables commands | Load cached index, resume enrichment |
| Manual refresh | Full Tier 1 rescan |

---

## 12. Cross-Cutting Concerns

### 12.1 Error Handling

| Failure | Behavior |
|---------|----------|
| Parser throws on malformed config | Log warning, skip source, show remaining |
| Cheatsheet JSON fails validation | Log error, skip cheatsheet, app works with others |
| Enrichment worker crashes on a command | Log, skip, mark as `failed`, continue |
| File watcher error | Log, continue without live updates for that path |
| `--help` times out | Expected, skip, move on |
| Entire commands engine fails | Log, disable commands mode, shortcuts still work |

Principle: **never crash the app, never block the user.** Each subsystem fails independently.

### 12.2 Logging

| Aspect | Value |
|--------|-------|
| Library | `electron-log` or simple file logger |
| Location | `app.getPath('userData')/logs/` |
| Levels | error, warn, info, debug |
| Default | info (production), debug (dev) |
| Rotation | 3 files, 5MB each |
| Content | Parser summaries, enrichment progress, watcher events, errors |
| Excluded | File contents, keybinding data, user data |

### 12.3 Privacy

- All data stays local — no network calls, no telemetry
- Logs contain summaries, not file contents
- Cache stores parsed results, not raw config data
- Clipboard write only on explicit user action (Enter key)

### 12.4 Auto-Update

`electron-updater` with GitHub Releases. App checks for updates on launch, downloads and installs automatically. Implemented in a later phase, not blocking v1 launch.

### 12.5 Distribution

- **v1:** GitHub Releases — DMG for macOS, Squirrel for Windows, deb/rpm for Linux
- **Post-v1:** Homebrew Cask formula
- **Deferred:** Mac App Store (sandboxing conflicts)
- **Code signing:** Apple Developer account, sign + notarize from v1

---

## 13. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Electron | ^41 |
| Build | Electron Forge + Vite plugin | ^7 |
| Renderer | React + TypeScript | 19 / 5.8 |
| Styling | Tailwind CSS (`@tailwindcss/vite`) | 4 |
| Search | Fuse.js | ^7 |
| File watching | chokidar | ^4 |
| Settings | electron-store | ^11 |
| Icons | Lucide React | ^1 |
| Logging | electron-log | TBD |
| Auto-update | electron-updater | TBD |
| Testing | Vitest + React Testing Library | ^4 |
| Linting | ESLint + @typescript-eslint | latest |
| Unused code | knip | ^6 |

---

## 14. Non-Goals (v1)

- Custom keybinding editing (read-only lookup)
- Conflict detection between tools
- Plugin system for community parsers
- Mac App Store / Windows Store distribution
- Adobe apps (proprietary formats)
- Neovim Lua config parsing (vimscript only in v1)
- Runtime app version detection for cheatsheet filtering
- Shell completion execution (we index, not execute)
- Curated CLI cheatsheets (Tier 2) — fully dynamic enrichment only
