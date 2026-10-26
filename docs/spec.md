# Shortty — Specification

> Product and architecture spec for v1. Screen-by-screen reference: [screens.md](screens.md). Where the implementation deliberately departs from the original plan, the reason is in [§15 Decisions](#15-decisions). Current v1 status: [wip/v1-status.md](wip/v1-status.md).

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
  key: string;               // Display format with glyphs (US-based): "⌘⇧T"
  searchKey: string;         // Search format: "cmd shift t"
  strokes?: KeyStroke[];     // Structured keys, resolved per keyboard layout and OS in the renderer (docs/keyboard-layouts.md)
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
  synopsis?: string;         // Usage line from man/--help
  bin: string;               // Full path: "/usr/bin/git"
  mtime: number;             // Binary modification time
  enrichment: 'basic' | 'full' | 'failed';
  enrichedFrom?: 'zsh-completion' | 'bash-completion' | 'man' | 'help';
  enrichedAt?: string;       // ISO timestamp
  hasManPage: boolean;
  hasCompletion: boolean;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
  arguments: ArgumentDetail[]; // Positional arguments: name, required, variadic
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
- Probed binaries (`--help`) run in a sandbox with an environment allowlist (§7.5)
- Single instance per user: a second launch shows the running panel and exits (`app.requestSingleInstanceLock()`)

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
    windows-system.json          # Windows only, no parser
    explorer.json                # Windows only, no parser
    windows-terminal.json
    psreadline.json              # Metadata only
```

#### Cheatsheet Schema

```json
{
  "id": "vscode",
  "label": "VS Code",
  "icon": "⌨️",
  "platforms": ["darwin", "win32", "linux"],
  "parser": "vscode",
  "mergeMode": "additive",
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
- **`mergeMode`**: `"additive"` (default) or `"replace"`, how the app combines a user binding with the default of the same command (§6.2)
- **`defaultPaths`**: per-platform arrays, community-maintainable within the cheatsheet file
- **`category`**: optional string for UI grouping within a source
- **`context`**: generic field for mode/state (vim modes, VS Code when clauses, tmux tables, zsh keymaps)
- **`minVersion`**: optional, ignored in v1, available for future version-aware filtering
- **`lastVerified`**: metadata for contributors, no runtime version detection
- **`shortcuts`** array can be empty — metadata-only shell for parsers that provide their own defaults

#### JSON Schema Validation

A `schema.json` file validates cheatsheet structure. All cheatsheet files must pass validation. Errors are caught by the test suite (`tests/unit/cheatsheets/shipped.test.ts` validates every shipped file against `schema.json`), not at runtime; the runtime loader still skips an invalid file with a warning. Every cheatsheet starts with `"$schema": "../schema.json"`, so editors (VS Code, JetBrains) validate and autocomplete it as you type; the schema's `$id` is its raw GitHub URL on `main` for tools outside the repo.

#### Bundling

The cheatsheets are bundled into the main-process build with Vite's `import.meta.glob('../../cheatsheets/sources/*.json', { eager: true })` (`src/main/cheatsheets/loader.ts`), so dev, e2e and the packaged app read the same data with no runtime path to resolve. Tests can still point the loader at a directory.

The `icon` field is kept as metadata; the UI draws a source tile instead (§10.4). The optional `app` field (`{ "bundleId": "com.google.Chrome", "name": "Google Chrome" }`) names the macOS app whose real icon represents the source; on Windows its `name` picks the app's `.exe` (§10.4). A Windows-only app has no `bundleId` (PowerToys: `{ "name": "PowerToys" }`).

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

#### Merge

`mergeShortcuts` (`src/main/shortcuts/merge.ts`) merges the parser output onto the cheatsheet defaults, following the cheatsheet's `mergeMode`. Apps disagree on what a user binding does to the default binding of the same command:

- **Additive** apps keep the default and add the user's key. In VS Code, `{ "key": "cmd+e", "command": "X" }` makes `X` reachable from both its default key and ⌘E; Ghostty `keybind`, tmux `bind`, vim `map` and zsh `bindkey` work the same way. A default disappears only when the config removes it explicitly.
- **Replace** apps store the full list of keys per command: an Obsidian `hotkeys.json` entry for a command *is* that command's hotkeys, and a macOS symbolic hotkey entry *is* the hotkey.

| Source | `mergeMode` | User binding for a default's command | Explicit removal |
|---|---|---|---|
| VS Code | additive | adds a key | `-command` entry (with a key: that key; without: every key) |
| Ghostty | additive | adds a trigger | `keybind = <trigger>=unbind` (matches by key) |
| tmux | additive | adds a key | `unbind` (merged inside the tmux parser) |
| vim | additive | adds a mapping | `unmap`, or a map to `<Nop>` (matches by key) |
| zsh | additive | adds a binding | `bindkey -r` |
| bash | additive | adds a binding | `bind -r` |
| Chrome | additive | extension commands only, no overlap with defaults | none |
| Obsidian | replace | replaces the command's hotkeys | empty hotkey list |
| macOS System | replace | replaces the hotkey | hotkey disabled |
| Windows Terminal | additive | adds a key | `"command": "unbound"` / `null`, or `"id": null` (matches by key) |
| PowerShell (PSReadLine) | additive | replaces the handler on that key (merged inside the parser) | `Remove-PSReadLineKeyHandler` |
| PowerToys | replace | replaces the hotkey | hotkey cleared, or module turned off |
| Finder, Windows, File Explorer | — | cheatsheet only, no parser | — |

Rules (overrides match defaults by `source` + `rawCommand`, ignoring the VS Code `-` removal prefix):

1. **Removal** (`isUnbound`): marks the matching defaults unbound (`isUnbound: true`, `origin: 'user-config'`) instead of adding an entry. It matches by command and, when the removal names a key, by that key too. A removal whose command the cheatsheet does not know (Ghostty `unbind`, vim `unmap`) matches defaults by key alone. A removal that matches no default is listed as its own entry.
2. **Binding, additive**: the default stays (`isDefault: true`, `origin: 'cheatsheet'`) and the user binding is added next to it (`isDefault: false`, `origin: 'user-config'`) with the cheatsheet's label and category. A binding on the exact key of the default is one entry: the default becomes the user entry (also undoing an earlier removal of it, e.g. VS Code `-X` then `X` on the same key).
3. **Binding, replace**: the first binding for a command takes over the default's entry (key, strokes, context); further bindings of the same command are added as entries of their own.
4. Bindings for commands the cheatsheet does not know are added as `user-config` entries.
5. Defaults no override touches keep `isDefault: true`, `origin: 'cheatsheet'`.

Known limits: a user binding for a *different* command on a default's key does not shadow that default (in Ghostty and vim a trigger maps to one action, so `keybind = super+d=close_surface` really replaces the default ⌘D `new_split:right`, but both are listed); VS Code removals match on command and key, not on the `when` clause.

**Special case (tmux, macOS System, Zsh, Bash, Obsidian, PowerShell):**
Parser provides all data (defaults + user config). Cheatsheet has empty `shortcuts` array, serving only as metadata shell (id, label, icon, paths, `mergeMode`). Their `mergeMode` still records the app's semantics so a future cheatsheet merges correctly.

Zsh and Bash defaults come from the shell itself, started without rc files through the `--help` sandbox (`src/main/parsers/shell-defaults.ts`: temp cwd, stdin closed, env allowlist, timeout; Bash also gets `INPUTRC=/dev/null`) and cached per binary path + mtime. Noise is dropped (self-insert, digit arguments, unbound functions, keys listed twice). A config binding replaces the default on the same keymap + key, an unbind marks it unbound; a missing shell leaves only the config bindings.

PowerShell (PSReadLine) defaults come from `pwsh.exe`, else `powershell.exe` (PATH, then `%SystemRoot%\System32\WindowsPowerShell\v1.0`), run with `-NoProfile -NonInteractive` through the same sandbox (20 s timeout: a cold start takes 5-15 s) as `Get-PSReadLineKeyHandler -Bound | ConvertTo-Json`, after `Set-PSReadLineOption -EditMode` when the profile selects Emacs or Vi. When no PowerShell runs, the parser uses its bundled Windows-mode list (`src/main/parsers/data/psreadline-defaults.ts`, from about_PSReadLine_Functions). `Set-PSReadLineKeyHandler` lines of the `$PROFILE` files (`-Chord`/`-Key`, `-Function` or `-ScriptBlock` with `-BriefDescription`) replace the handler on their key. Chords: `Ctrl+x,Ctrl+e` is a sequence, an upper-case letter means Shift (`Ctrl+C`).

PowerToys: each module's `%LOCALAPPDATA%\Microsoft\PowerToys\<module>\settings.json` holds its hotkeys as `{ win, ctrl, alt, shift, code }` (`code` a Windows virtual-key code, 0 when cleared), directly or under `value`, also nested (Advanced Paste custom actions, labelled by their `name`). `rawCommand` is `<module folder>.<property>`; the hotkeys the cheatsheet lists are in `src/main/parsers/data/powertoys-hotkeys.ts`. A hotkey still on its default is skipped, a changed one replaces the default, a cleared one unbinds it, and every hotkey of a module turned off in the general `settings.json` (`enabled`) is unbound, on its configured key. Keyboard Manager's `Keyboard Manager\default.json` adds the remapped keys and shortcuts (to keys, text, a program or a URI; per app as context). Command Palette and ZoomIt keep their settings elsewhere: only their defaults are listed.

Windows Terminal: `settings.json` (JSONC) in the legacy format (`command` + `keys` in `actions`/`keybindings`) and the 1.21+ split format (`actions` with `id`, `keybindings` with `id` + `keys`). A binding whose command equals a default action (`src/main/parsers/data/windows-terminal-actions.ts`, from the app's `defaults.json`) gets that action's id (`Terminal.OpenNewTab`) as `rawCommand`, so it merges with the cheatsheet entry.

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
  'windows-terminal': WindowsTerminalParser,
  psreadline: PsReadLineParser,
};
```

A parser registers only on the platforms in its `meta.platforms`, like a cheatsheet only on its `platforms`.

Sources can enter the system through two doors:
- **Cheatsheet file** (with or without parser) — community/curated path
- **Parser in the code map** (with or without cheatsheet) — developer path

The registry merges both discovery paths into a unified source list.

#### Parsers work standalone

A parser without a cheatsheet works — it shows only what it can parse. No cheatsheet required. This allows developers to contribute parsers without curating a full cheatsheet.

### 6.3 Path Resolution

Config paths are resolved in this order:

1. **User override** (from settings, if set)
2. **Environment variable expansion** (`~/` and `~\`, `$HOME`, `$XDG_CONFIG_HOME`, `%APPDATA%`, `%ProgramFiles(x86)%`)
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
| Zsh | Metadata only | .zshrc bindkey + `zsh -f` `bindkey -L` (emacs, or viins/vicmd after `bindkey -v`) | darwin, linux |
| Bash | Metadata only | .inputrc + .bashrc bind + `bash --norc -i` `bind -p` (emacs) | darwin, linux |
| Obsidian | Metadata only | hotkeys.json per vault | all |
| Chrome | Curated (~50-60) | extension shortcuts | all |
| macOS System | Metadata only | symbolichotkeys.plist | darwin |
| vim | Curated (~100-150) | `~/.vimrc`, `~/.vim/vimrc`, `~/.config/vim/vimrc` (vim 9.1 XDG; vimscript only); Windows: `~/_vimrc`, `~/vimfiles/vimrc` first | all |
| Finder | Curated (~40-50) | None | darwin |
| Windows | Curated (~65) | None | win32 |
| File Explorer | Curated (~45) | None | win32 |
| Windows Terminal | Curated (60, from `defaults.json`) | settings.json (packaged, Preview, unpackaged) | win32 |
| PowerShell | Metadata only | $PROFILE `Set-PSReadLineKeyHandler` + `Get-PSReadLineKeyHandler -Bound` (bundled Windows-mode fallback) | win32 |
| PowerToys | Curated (26 module hotkeys) | each module's settings.json, general settings.json (`enabled`), Keyboard Manager `default.json` | win32 |

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
│  │ `apropos .` (async) → one-line descriptions         │  │
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
│  │ {userData}/commands-cache/meta.json PATH hash       │  │
│  │ …/commands-cache/commands-index.json All commands   │  │
│  │ …/commands-cache/details/{name}.json Per-command    │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 7.3 Index Lifecycle

**PATH import:** an app started from Finder or at login gets the minimal launchd PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), without Homebrew, `~/.local/bin`, nvm, etc. At startup, before the commands engine and the parsers run, the main process runs the user's login shell (`$SHELL -ilc`, stdin closed, 3s timeout, async) and merges the PATH it prints in front of the current one (`src/main/shell-env.ts`).

**PATH scan** (`src/main/commands/path-scanner.ts`): PATH is split on the platform delimiter (`:`, `;` on Windows); relative and empty entries are dropped, entries are normalized and deduplicated (case-insensitively on Windows), `~/` is expanded on macOS/Linux. A name resolves to its first occurrence, like the shell. macOS/Linux: every executable file (symlinks followed). Windows: files whose extension is in `PATHEXT` (default `.COM;.EXE;.BAT;.CMD`, plus `.PS1`), named without the extension (`git.exe` is `git`); names compare case-insensitively, and within one directory the first `PATHEXT` extension wins (`foo.exe` over `foo.cmd`).

**Descriptions:** `apropos .` (async; a few seconds on macOS), falling back to `whatis -w '*'` (man-db). macOS `whatis` has no `-w`. A name documented in several man sections takes the description from its command section (1, then 8, then 6). Windows has no whatis database or man pages: neither is run there, commands are described from `--help` only.

**First launch (cold):**
1. No cached index exists
2. Tier 1: scan PATH + apropos → basic index
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

### 7.4 Subcommand Drill-In (replaces the expanded index)

The index holds one entry per executable. Subcommand names are a search key of their parent (§8.3), so "commit" finds `git`. Subcommands are explored on demand: drilling into a subcommand row of the detail view reads its man page (`man git-commit`); unless that page lists subcommands, `<cmd> <sub> --help` runs too (same sandbox, blocklist and owner checks as §7.5) and the richer result wins (the man/help rule in §7.5). A subcommand without a page of its own is looked up as a command block in the parent's page (tmux documents `new-session` inside `man tmux`). The result is cached under `cache/details/sub/`; drill-in recurses (`docker compose up`). See `src/main/commands/subcommand-enricher.ts` and [§15 Decisions](#15-decisions).

### 7.5 Enrichment Worker

**Parameters:**

| Parameter | Value |
|-----------|-------|
| File read concurrency | 3 parallel |
| Process spawn concurrency (`--help`) | 1 at a time |
| Process timeout | 2 seconds (15 seconds for `.ps1` scripts, which pay a cold PowerShell start), hard kill |
| Pause when | Main window is visible |
| Resume when | Window hidden or 5s idle |
| Batch save | Every 50 commands enriched |
| Priority | Commands with man pages first |
| Drill-in | A command opened in the detail view before the worker reached it is enriched at once (`commands:getDetail`), even while paused; its `--help` still waits for the one-at-a-time slot and the worker skips it afterwards |
| First launch | Enrichment starts immediately |

**Man page vs `--help`** (`needsHelp`, `pickRicher` in `src/main/commands/parsers/parse-utils.ts`, shared by commands and subcommands). A man page that lists subcommands is used as is, without spawning anything. Otherwise `--help` also runs (when the probing policy below allows it) and the richer result wins: one that lists subcommands, else the one with more flags, the man page on a tie (ffmpeg's man page, 171 flags, beats its 42-flag `--help`; helm's page has flags but no commands, jq's yields no flags). The winner takes the other's flag list when that one is longer, and fills its missing description, synopsis and extras from it. The cost is one extra serialized `--help` for trusted binaries whose man page lists no subcommands; OS binaries are never probed, so they stay man-only.

**Per-tool help words** (`HELP_WORDS` in `help-parser.ts`): a few CLIs do not list their commands in `--help`, so the probe asks the documented way instead: `aws help` / `aws <cmd> … help` (aws's `--help` is an error; its help goes through the pager, which is `cat`), `bq help` and `poetry list` at the top level (their subcommands still get `--help`). On Windows git gets `-h` (`git <cmd> --help` opens an HTML page in the browser there). Fixed words per command name; the policy below applies unchanged.

**Enrichment source discovery:**
- Man page locations: single `man --path` command at startup
- Zsh completion locations: single `zsh -c 'echo $FPATH'` at startup
- Bash completion locations: `pkg-config --variable=completionsdir bash-completion` or fallback to `/usr/share/bash-completion/completions`
- Both zsh and bash completions supported; zsh checked first (richer format), deduplicated by command name

**`--help` probing policy** (`isTrustedBinary`, `isBlocklisted` in `src/main/commands/parsers/help-parser.ts`). Running `--help` executes the program, so a command (or `command sub …` for subcommand details) is probed only if all of these hold:

1. Shortty is not running as root.
2. Neither the command name nor the basename of its resolved path (symlinks followed) is on the blocklist below.
3. Neither the path on PATH nor the resolved file is in the OS's own directories (`/usr/bin`, `/usr/sbin`, `/usr/libexec`, `/bin`, `/sbin`, `/System`, `/Library/Apple`, `/Library/Developer`, Xcode): those are described from their man pages only. Probing them launched Xcode download prompts (the `/usr/bin` developer-tool shims), Keychain dialogs and GUI helpers.
3b. The resolved file is owned by root or the current user, and is not writable by group or others (`mode & 022 == 0`).
4. The resolved file is either a **native executable** (Mach-O, Mach-O universal or ELF magic), anywhere, or a **`#!` script under a trusted install prefix**:

   | Prefix | Why |
   |--------|-----|
   | `/usr/`, `/bin/`, `/sbin/`, `/System/`, `/Library/Apple/` | OS-shipped tools (includes `/usr/local/`) |
   | `/opt/homebrew/`, `/opt/local/` | Homebrew (Apple silicon), MacPorts |
   | `/nix/store/` | Nix (profiles resolve into the store) |
   | `~/.cargo/bin/`, `~/.rustup/toolchains/` | Cargo / rustup |
   | `~/.local/share/uv/tools/` | `uv tool install` (its `~/.local/bin` links resolve here) |
   | `~/.local/pipx/venvs/` | pipx |

Anything else, notably the user's own scripts in `~/bin`, `~/.local/bin` or a project directory, is never executed: such a script may act on any argument (`deploy.sh --help` may deploy). Those commands are enriched from their man page and the whatis database only. In e2e mode (`SHORTTY_E2E=1`) `$SHORTTY_E2E_DIR/bin/` is also trusted, so the suite's fake `#!` CLIs can be probed ([runbook](runbooks/run-e2e-tests.md)).

Other rules: dotfile/hidden commands (names starting with `.` or `_`) are skipped; at most one probe runs at a time; 2 second timeout (`helpTimeoutMs` in `src/main/commands/sandbox-exec.ts`: 15 seconds for a Windows `.ps1`, since PowerShell alone takes 5-15 s to start cold), hard kill (SIGKILL to the whole process group).

**Windows policy** (`isTrustedWindowsBinary`): there are no owner or mode bits, so rule 3b does not apply, and paths compare case-insensitively.

0. Nothing is probed while Shortty runs elevated, the equivalent of rule 1 (`isWindowsElevated` in `src/main/commands/elevation.ts`): `%SystemRoot%\System32\whoami.exe /groups` runs once per session, by full path, and a High or System integrity level (`S-1-16-12288`, `S-1-16-16384`) means elevated. If that check fails, Shortty counts as elevated.
1. Never probed: anything under `%SystemRoot%\` (System32 holds `format`, `diskpart` and GUI tools), `%LOCALAPPDATA%\Microsoft\WindowsApps\` (Store app execution aliases: `python.exe` there opens the Store; they may not even resolve) and `C:\Program Files\WindowsApps\`, checked on the PATH entry before resolving it and again on the resolved file.
2. **PE executables** (`MZ` magic) anywhere else.
3. **`.cmd`, `.bat`, `.ps1` scripts** (the Windows equivalent of `#!` scripts) only under trusted prefixes: `%ProgramFiles%\`, `%ProgramFiles(x86)%\`, `%ProgramData%\chocolatey\`, `~\scoop\shims\`, `~\scoop\apps\`, `%APPDATA%\npm\`, `%LOCALAPPDATA%\Microsoft\WinGet\Links\` and `\Packages\`, `%LOCALAPPDATA%\Programs\`, `~\.cargo\bin\`, `~\go\bin\` (and the e2e dir in e2e mode). Anything else (other `PATHEXT` types such as `.vbs` or `.js`, `#!` scripts) is never run.
4. Blocklist lookups lowercase the name and strip its `PATHEXT` extension (`Python.EXE` is `python`).

**`--help` blocklist (hardcoded, `BLOCKLIST`):**

System/destructive: `shutdown`, `reboot`, `halt`, `poweroff`, `init`, `rm`, `mkfs`, `fdisk`, `dd`, `kill`, `killall`, `pkill`

Daemons: `httpd`, `nginx`, `postgres`, `mysqld`, `mongod`, `redis-server`, `dockerd`, `sshd`, `cupsd`

Interactive: `ssh`, `telnet`, `ftp`, `sftp`, `nc`, `ncat`, `python`, `python3`, `node`, `ruby`, `irb`, `lua`, `perl`, `bash`, `zsh`, `sh`, `fish`, `tcsh`, `csh`

macOS security/signing tools (Keychain or admin prompts) and GUI apps: `security`, `codesign`, `xcrun`, `sudo`, `su`, `passwd`, `electron`, … (full list in the source)

Wrappers that execute their arguments, where an implementation without a `--help` flag would run `--help` (or the subcommand words) as a command: `env`, `xargs`, `nohup`, `nice`, `renice`, `caffeinate`, `watch`, `doas`, `time`, `timeout`, `exec`, `chroot`, `sandbox-exec`, `stdbuf`, `script`, `setsid`, `flock`, `taskset`, `pkexec`, `runuser`, `arch`, `parallel`, `entr`, …

Windows, on top of the above (`WINDOWS_BLOCKLIST`): `format`, `diskpart`, `bcdedit`, `cipher`, `takeown`, `icacls`, `reg`, `sc`, `net`, `taskkill`, `vssadmin`, `wmic`, `cmd`, `powershell`, `pwsh`, `wsl`, `runas`, `start`, `mshta`, `rundll32`, `regsvr32`, `msiexec`, `wscript`, `cscript`, `explorer`, `notepad`, `mmc`, `control`.

**`--help` sandbox** (`src/main/commands/sandbox-exec.ts`): every probe runs in a throwaway temp cwd with stdin closed and output capped at 1 MB; `TMUX_TMPDIR` points at that cwd, so a probe such as `tmux new-session --help` can never reach the user's running tmux server. The environment is an allowlist (`PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `TMPDIR`, `LANG`, `MANPATH`, `LC_*`), so tokens and keys in the user's environment never reach an arbitrary binary; pagers are `cat`, editors are `true`, colours and Homebrew auto-update are off. On Windows the allowlist matches names case-insensitively (the variable is `Path`) and adds what programs need to start and find the user's folders (`SystemRoot`, `windir`, `PATHEXT`, `COMSPEC`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP`, `ProgramData`, `ProgramFiles`, `ProgramFiles(x86)`, `ProgramW6432`, `HOMEDRIVE`, `HOMEPATH`, `USERNAME`, `NUMBER_OF_PROCESSORS`, `PROCESSOR_ARCHITECTURE`, and `PSModuleAnalysisCachePath`, without which PowerShell may rebuild its module cache past the timeout); pagers are empty (no pager) and editors `:` (git's no-op editor), since `cat` and `true` do not exist there. Every spawn is `windowsHide`. `.cmd`/`.bat` run through `cmd.exe /d /v:off /s /c` with the path quoted, and only with arguments cmd passes through unchanged (letters, digits, `.+-/:@_`): anything it would expand or split is refused, not escaped. `.ps1` run through `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File`. On timeout `taskkill /PID <pid> /T /F` ends the whole tree. The temp cwd removal retries (a killed process may still hold it). `man` lookups use the same environment in their own process group (man starts groff and friends), killed after 5 seconds. The startup login-shell PATH import (`src/main/shell-env.ts`) kills the shell's process group on timeout or when it prints more than 1 MB.

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
├── commands-cache/              # not cache/: that is Chromium's Cache on case-insensitive APFS
│   ├── meta.json                # PATH hash, timestamps, enrichment stats
│   ├── commands-index.json      # Tier 1 full inventory
│   └── details/                 # Per-command enrichment
│       ├── git.json
│       ├── docker.json
│       ├── ...
│       └── sub/                 # Subcommand details, keyed by bin path + mtime
```

Detail file names are the command name percent-encoded, with uppercase letters and the characters Windows forbids escaped as well and Windows' reserved names (`con`, `nul`, `com1`, …) and trailing dots broken up (`cacheFilename` in `src/main/commands/cache.ts`): `Git` and `git` stay apart on case-insensitive volumes, and every name is a valid NTFS file name. Atomic index writes retry the rename on `EPERM`/`EBUSY` (a scanner or reader holding the file on Windows).

### 7.7 Platform Differences

| Platform | Tier 1 | Enrichment sources |
|----------|--------|-------------------|
| macOS | PATH scan + whatis | zsh completions → bash completions → man pages → --help |
| Linux | PATH scan + whatis | zsh completions → bash completions → man pages → --help |
| Windows | PATH scan (`PATHEXT`), no descriptions | --help only (no man pages, whatis or shell completions) |

### 7.8 What Is Parsed

`src/main/commands/parsers/` turns a man page (`man-parser.ts`) or `--help` output (`help-parser.ts`) into a `Command` / `SubcommandDetail` (`src/shared/types.ts`). Every field beyond name, description, synopsis, subcommands, flags and arguments is optional and only set when the output documents it:

| Field | Taken from |
|-------|-----------|
| `description`, `longDescription` | Man `NAME` / `DESCRIPTION`; the first prose paragraph of `--help` (also under poetry/pip `Description:`, az `Group` / `Command`) |
| `synopsis`, `arguments` | `SYNOPSIS` / `Usage:`; argument descriptions from `Arguments:` / `POSITIONAL ARGUMENTS` lists |
| `subcommands[].group` | The section the entry is listed under: `Management Commands:`, gh `CORE COMMANDS`, gcloud `GROUPS` vs `COMMANDS`, az `Subgroups:` vs `Commands:`. Groups are drillable like commands |
| `subcommands[].deprecated` | `(DEPRECATED)`, `--DEPRECATED--`, az `[Deprecated]` (the marker is removed from the text) |
| `flags[].group` | The section title: `Global Flags:`, `INHERITED FLAGS`, `OPTIONS INHERITED FROM PARENT COMMANDS`, az `Global Arguments`, ffmpeg's man subsections (`Main options`, `Video Options`) |
| `flags[].default` | `(default "open")`, `(default: 'x')`, `[default: json]`, az `Default: RSA.`, kubectl `--chunk-size=500:`, gcloud `; default="warning"`, tsc `default: es5` |
| `flags[].choices` | `{a\|b}` / `[a\|b]` in the text or as the argument (`{json,yaml}`, `[yes\|ask\|no]`), `[possible values: …]`, `Possible values:` lists, az `Allowed values:`, gcloud `must be one of:` (inline or as a term list), absl `<a\|b>:` |
| `flags[].required` / `deprecated` | `(required)`, `[required]`, az `[Required]`, gcloud `REQUIRED FLAGS`; `(DEPRECATED)`, `[deprecated]` |
| `examples` | `EXAMPLES` / `Examples:` sections: a command line (`$ cmd`, a line starting with the program, or piping into it) with the comment or sentence before it as its description, or the indented text below it (BSD man pages). `\` continuations and az's hard-wrapped lines are joined |
| `environment` | `ENVIRONMENT` / `ENVIRONMENT VARIABLES` sections (`NAME  text`, `NAME` over its text, names sharing one text) and clap's per-flag `[env: NAME=]` |
| `aliases` | `ALIASES` / `Aliases:` sections, minus the command's own name |
| `seeAlso` | Man `SEE ALSO` references and links; `LEARN MORE` / `See also` lines |

Command lists come from `COMMANDS`-like sections (also aws's `AVAILABLE SERVICES` / `AVAILABLE COMMANDS` "o name" bullets, openssl's `COMMAND SUMMARY` tag lists, including names that fill the tag column like `cms CMS …`), `git-<name>(1)` cross-references, and tmux-style command blocks: a `name [flags] args` line over an `(alias: x)` line, anywhere in the page (only blocks with an alias line count, since tmux lays out its copy-mode commands the same way). The block also gives that subcommand's detail: its usage as synopsis, the flags named in it (`[-AdDEPX]`, `[-c start-directory]`, without descriptions), the alias and the first paragraph. In `--help` command sections, clap's names without a description (`  create  `) and comma lists wrapped over several lines (bq's `remove-iam-policy-` / `binding`) are kept.

Formats covered by golden tests (`tests/unit/commands/golden*.test.ts`, fixtures in `fixtures/commands/`): GNU and BSD man pages, ronn (brew), gcloud's man-style `--help` (pager set to `cat`), az/knack (its first-run "Welcome to Azure CLI" banner is skipped), cobra (gh, kubectl, docker, helm, gitleaks, chezmoi), clap (uv, fd, bws, deno), click, argparse, optparse (pip), cleo (poetry), absl (bq), commander (bw), yargs-style (pnpm), Go `flag` (actionlint, go), Haskell optparse (hadolint), terraform, openssl, ffmpeg, java and tsc single-dash options. Also covered: aws's man-style `help` (its `AWS()  AWS()` page header), `bq help`, `poetry list`, tmux's command blocks and openssl's `COMMAND SUMMARY`. Known gaps: openssl's multi-column `--help` table (its man page lists the commands instead), tmux commands documented without an alias line (`kill-server`), commands a CLI hides from its list (`gitleaks detect`, deprecated in 8.x), prose-only help (`go build`), `/usr/bin` stubs without a man page (`java`, never probed), rsync's usage-only `--help`, words hard-wrapped mid-token in az's narrow description column.

---

## 8. Search Architecture

### 8.1 Two Fuse.js Instances

| | Shortcuts Index | Commands Index |
|---|---|---|
| Data type | `Shortcut` | `Command` (one per executable; subcommand names as a key) |
| Size | Hundreds to low thousands | Thousands (one per PATH executable) |
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

**Optional: command prefix mode** (setting, default **off**). When enabled, default search returns shortcuts only. `>` prefix returns commands only. Power user feature.

**Source matching:** source names match space- and punctuation-insensitively, so "vsc" and "vscode" both find VS Code.

**Layout-aware keys:** the shortcut index also searches the key as labelled on the user's keyboard layout (e.g. "ò" on Italian). See [keyboard-layouts.md](keyboard-layouts.md).

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

Each section shows a selectable "Show all X" row when truncated (Enter expands it). No debouncing — instant search on every keystroke. Command results rank an exact name first, then name prefixes, then the Fuse order.

---

## 9. Settings

### 9.1 App Settings

| Setting | Type | Default | Location |
|---------|------|---------|----------|
| Launch at Login | boolean | `false` | General tab |
| Show in Dock | boolean | `false` | General tab |
| Show in Menu Bar | boolean | `true` | General tab |
| Dismiss After Copy | boolean | `true` | General tab |
| Start Blank (`resetLauncher`) | `immediately \| 90s \| never` | `immediately` | General tab |
| Global Shortcut | string | `CommandOrControl+Shift+Space` | General tab |
| Window Position | enum | `top-center` | General tab |
| Theme | enum | `system` | General tab |
| Disabled Sources | string[] | `[]` | Sources tab |
| Source Path Overrides | Record | `{}` | Sources tab |
| Shortcut Search Weights | object | see §8.2 | Search tab |
| Command Prefix Mode | boolean | `false` | Search tab |
| Result Limits | object | see §8.5 | Search tab |
| Commands Enabled | boolean | `true` | Commands tab |
| Auto-update (`autoUpdate`) | boolean | `true` | General tab (macOS and Windows) |

**Visibility safety:** if user disables both Dock and Menu Bar (off macOS: the system tray icon, the only one there), show confirmation dialog: "You'll only be able to access Shortty via the keyboard shortcut. Are you sure?" Escape hatch: the `--reset-settings` CLI flag, shown in the dialog with the installed app's path per platform. It restores `DEFAULT_SETTINGS` (`src/shared/settings.ts`) and exits without opening a window; it refuses (exit code 1) while another instance holds the single-instance lock. Procedure: [runbooks/reset-settings.md](runbooks/reset-settings.md).

Theme values: `light | dark | system`. No additional theming in v1.

### 9.2 Preferences Window Structure

It opens from the menu bar / tray icon (Preferences...) or, while a Shortty window is focused, from the app menu's Settings… item (`⌘,`; on Windows and Linux the hidden File menu's Settings…, `Ctrl+,`). The Preferences window is modelled on macOS System Settings: a sidebar source list with coloured tiles (↑/↓ move between tabs), inset grouped sections, native-sized switches, segmented controls and sliders, light and dark palettes that follow the Theme setting. 600×500, non-resizable, hidden-inset title bar on macOS; on Windows and Linux the native frame, its menu bar hidden until Alt (`autoHideMenuBar`), no drag regions or traffic-light padding (`data-platform` on `<html>`). The path picker (Browse…) chooses a file or a folder on macOS, a file elsewhere (one dialog cannot do both there).

| Tab | Contents |
|-----|----------|
| **General** | Launch at login, show in dock, show in menu bar, dismiss after copy, global shortcut recorder, window position, theme, updates (version, status, Check Now, auto-update) |
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
- **Full state reset on open** — query cleared, back to flat mode. The Start Blank setting (§9.1) can delay it: reopened within 90 s (or always, with `never`), the panel resumes its last screen (query, drill-down level, selection, height). The reset runs while the window is hidden, so the old screen never flashes
- **Dismiss** — Esc (in flat mode with an empty query; with a query, Esc clears it first), click outside, blur/focus loss, global hotkey toggle

### 10.2 Navigation Model: Flat → Drill-In

**Flat mode (default):**
Search across all sources. Results show Sources, Shortcuts, and Commands sections.

**Drill-in to source:**
Select a source from the Sources section (Enter) → panel scopes to that source. Shows all entries for that source, grouped by category, with no section limit. Search filters within source. Esc (or ← / Backspace on an empty field) returns to flat mode with the previous query, expanded sections and selection restored.

**Drill-in to command:**
On a command row, Tab or → drills into command detail view. Shows subcommands, flags and arguments. Search filters within details. Tab/→ on a subcommand drills one level deeper (§7.4). Esc returns to the previous level, restored as it was.

**Typed drill-down:**
Typing a command line drills by itself, as deep as the subcommands go (`>gh auth lo` → gh › auth filtering "lo"; `>gcloud compute instances create`, `>az vm create`). The rules (`src/renderer/App.tsx`, `typedStep`):

- The first word after `>` is matched against the command names (prefix mode only); at a detail level, the first word of the filter is matched against the last word of each subcommand name (`gh auth` → `auth`). Matching is exact and case-sensitive.
- An exact match drills when a space follows it, or at once when no other name at that level starts with it: `>gh auth` opens gh › auth without a space, while `>git commit` keeps filtering git (there are `commit-graph` and `commit-tree`) until the space. Typing on (`commit-t`) keeps filtering the parent. Tab/→ still drills on the selected row as before.
- Each drill becomes a breadcrumb chip; what follows the word becomes the filter of the new level, and is resolved again, so the last partial word filters the deepest level reached (`>git commit --am` filters commit's flags). A filter never starts with a space.
- Details that arrive later continue the resolution: an unenriched command is enriched on demand and a subcommand's details load on demand (`useSubcommandDetail`, which drops answers for a level the user has left). Meanwhile the view shows "Loading...". A paste or fast typing therefore ends in the same state as slow typing.
- A word that is not a subcommand (or a level with no subcommands) stops the descent: the rest of the text filters that level, with no error.
- The level left behind keeps the text up to the drilled word (`>gh`, `auth`): Backspace on an empty filter, ← at the start and Esc on an empty filter go back one level and put that word back to edit. A restored query is not re-resolved, so going back never drills straight in again; editing it does.
- Nothing drills during an IME composition; the text resolves when it is committed.

### 10.3 Search Behavior

- **Instant** — no debouncing, Fuse.js responds in <5ms
- **Empty query** — blank panel, no results
- **Empty results** — a short "No matches for …" line with a hint (e.g. "Type > first to search commands" in prefix mode); the window grows only to 180px for it
- **Sources in search** — source names are searchable; typing "vsc" shows VS Code in Sources section
- **Cross-section navigation** — ↑/↓ treats all rows as one flat list, wraps around at boundaries

### 10.4 Entry Anatomy

Rows follow a single-line layout inspired by the Vaise launcher: identity on the left, keys on the right. Every row starts with a **source tile** (`src/renderer/components/SourceIcon.tsx`), instead of the cheatsheet emoji. The tile is, in order of preference:

1. **The real app icon**, autofound on macOS: main (`src/main/icons.ts`) finds the bundle of the cheatsheet's `app` by bundle id with Spotlight (`mdfind`, argv only, 2 s timeout), else by name in `/Applications`, `~/Applications`, `/System/Applications` and `/System/Library/CoreServices`, and renders it with Quick Look (`nativeImage.createThumbnailFromPath`, 64 px; `app.getFileIcon` stops at 32 px on macOS and its `large` size aborts the process). Commands whose binary resolves (after symlinks) into an `.app` get that app's icon (`code` → Visual Studio Code). On Windows, main looks for the cheatsheet app's `.exe` (VS Code, Chrome, Obsidian, PowerToys) under `%LOCALAPPDATA%\Programs`, `%ProgramFiles%`, `%ProgramFiles(x86)%` and `%LOCALAPPDATA%`, and a command whose binary resolves to an `.exe` uses that file's icon (`.cmd`/`.bat` shims do not); both are drawn with `app.getFileIcon` (`large`, 32 px). Linux has no app icons. The renderer asks through `icons:get` with a known source id or command name only, never a path; main caches hits and misses for the session, and the renderer sends one request per icon.
2. **A brand glyph** from `simple-icons` (`src/renderer/lib/brand-icons.ts`): for sources whose app is missing or that are CLIs (tmux, vim, zsh, bash), and for ~150 common CLIs (`git`, `gh`, `docker`, `kubectl`, `terraform`, `gcloud`, `node`, `uv`, `brew`, `psql`, …; version suffixes like `python3.12` or `psql-17` are stripped). For commands a curated glyph wins over the app bundle, because a binary's bundle is not always its brand (`kubectl` ships inside Docker.app). The glyph takes the brand colour on a quiet tile; a colour under 3:1 contrast on the current theme is mixed toward the foreground colour.
3. **A tinted monogram** like a Dock icon (`VS`, `Gh`, `tm`, `PT`, `>_` for other commands); an unknown source gets its initial on a hue derived from its id.

Tiles have a fixed size, so rows never jump when an icon arrives. In e2e runs autofind skips Spotlight and looks only in the fake HOME's `Applications` (on Windows it looks nowhere), where the fixtures put a fake `Google Chrome.app`.

**Shortcut row:**
- Left: source tile (flat mode only), command name, then the `rawCommand` in muted monospace when it differs
- Right: context pill if present (small, muted), source label (flat mode only), key combo as key caps
- Key caps show the keys as labelled on the user's keyboard layout ([keyboard-layouts.md](keyboard-layouts.md)); an unbound shortcut shows "unbound" instead of caps

**Command row:**
- Shell tile (`>_`), command name in monospace, description, chevron (drillable)

**Source row:**
- Source tile + name + entry count + chevron

**Footer:** a 36px bar under the results. Left: status ("27 results", "Copied …", or the drilled source and its count). Right: key hints for the selected row (e.g. "Copy keys ↩ · Clear esc", "Copy ↩ · Details ⇥ · Close esc").

**Search bar:** a ⌘⇧Space hotkey hint (the configured global shortcut) and a `?` button that opens the keyboard help.

**Theme:** colours are CSS tokens with light and dark values (`src/renderer/styles/globals.css`) following `prefers-color-scheme`, which Electron drives from the Theme setting through `nativeTheme.themeSource`. Components use the tokens rather than fixed white or black.

### 10.5 Entry Actions

| Key | On Source Row | On Shortcut Row | On Command Row |
|-----|-------------|-----------------|----------------|
| Enter | Drill into source | Copy key combo to clipboard | Copy command to clipboard |
| Tab / → | — | — | Drill into command details |
| Esc | — | — | Back from detail view |

Enter on a "Show all X" row expands that section. The shortcut copied is the key combo as labelled on the user's keyboard layout (e.g. "⌘Ò" rather than the US "⌘;" on Italian), with Windows/Linux labels off macOS ("Ctrl+Shift+P").

### 10.6 Visual Feedback

- **Copy**: row briefly flashes (~300ms) to confirm clipboard write
- **Dismiss after copy**: configurable setting (default: on)

### 10.7 Keyboard Map

| Key | Flat Search | Drilled Into Source | Command Detail |
|-----|-------------|--------------------| --------------|
| `⌘⇧Space` | Toggle panel | Toggle panel | Toggle panel |
| `Esc` | Clear query, else dismiss | Clear query, else back to flat | Clear query, else back to results |
| `↑` / `↓` | Navigate rows | Navigate rows | Navigate rows |
| `Enter` | Action (per row type) | Copy shortcut | Copy subcommand/flag |
| `Tab` / `→` | Drill into command | Drill into command | Drill into subcommand |
| `←` / `Backspace` (empty field) | — | Back to flat | Back to results |
| Any character | Search input | Search within source | Filter within details |
| `?` icon (or `?` on an empty query) | Show keyboard shortcuts help | — | — |

In Command Detail, Enter copies the full command line: a subcommand row copies its path (`gh auth login`), a flag or argument row copies it after the current path (`gh auth login --hostname`, `git <args>`), an example copies its whole command, an environment variable its name alone.

Tab never moves focus out of the search field; → drills only when the caret is at the end of the query.

### 10.8 Window Behavior

| Property | Value |
|----------|-------|
| Size | 750px wide; height collapses to the search bar (72px) when empty, 180px for a no-results line, 580px with results, a detail view or help |
| Frame | Frameless, no title bar |
| Position | Configurable: top-center (default), center, mouse; always on the display under the cursor, positioned for the 580px height so growing never leaves the work area |
| Always on top | Yes |
| Show in dock | Configurable (default: off) |
| Show in mission control | No |
| Background | Native material, light or dark per Theme: macOS vibrancy (`under-window`), Windows 11 22H2+ acrylic (`backgroundMaterial`); elsewhere (Windows 10, Linux) the solid `--panel-solid` token (`src/main/launcher-window.ts`) |
| Focus on show | macOS activates the app (`app.focus({ steal: true })`); Windows raises the launcher itself (`moveTop`, then `focus`), since `app.focus()` there focuses the app's first window |
| Scrolling | Scroll within the 580px window when results overflow |
| Instances | One per user (single-instance lock); a second launch shows the running panel |
| Dismiss | Esc, click outside, blur, global shortcut toggle |
| State on reopen | Full reset (blank) |

### 10.9 Animations

- **Show**: scale from 0.97 → 1.0 + opacity 0 → 1, 120ms ease-out
- **Hide**: scale from 1.0 → 0.97 + opacity 1 → 0, 80ms ease-in
- **Respects `prefers-reduced-motion`**: instant show/hide when enabled
- Every hide (Esc, copy, blur, hotkey, tray) plays the exit animation: main asks the renderer to animate out and hides on its acknowledgement, with a short upper bound (`src/main/window-hider.ts`)

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
0. Single-instance lock; `--reset-settings` handled here (§9.1)
1. App ready
   - Import the login-shell PATH (§7.3); both engines wait for it
   - Register IPC handlers before any await (data handlers wait for the engines)
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
| Library | `electron-log` |
| Location | `app.getPath('userData')/logs/` |
| Levels | error, warn, info, debug |
| Default | info (production), debug (dev) |
| Rotation | 3 files (live + 2 archives), 5MB each |
| Content | Parser summaries, enrichment progress, watcher events, errors |
| Excluded | File contents, keybinding data, user data |

### 12.3 Privacy

- All data stays local, no telemetry. The only network calls are the update checks (§12.4): update.electronjs.org (which sees the app version, platform and IP) or the GitHub releases API
- Logs contain summaries, not file contents
- Cache stores parsed results, not raw config data
- Clipboard write only on explicit user action (Enter key)

### 12.4 Updates

`src/main/updates.ts`. Releases are GitHub Releases on `giocaizzi/shortty` (public), tagged `vX.Y.Z`. Two paths, chosen once per start (and again when `autoUpdate` changes):

| Install | Path |
|---|---|
| Windows Squirrel install (`Update.exe` one folder above the running `app-x.y.z\shortty.exe`) | Auto-update |
| macOS bundle signed with a Developer ID (`codesign -dv` on the `.app` lists `Authority=Developer ID Application: …`; unsigned arm64 builds are ad-hoc signed and do not) | Auto-update |
| Linux deb/rpm, unsigned macOS, portable Windows ZIP, or `autoUpdate` off | Notify only |

- **Auto-update:** Electron's `autoUpdater` (Squirrel) with the feed `https://update.electronjs.org/giocaizzi/shortty/<platform>-<arch>/<version>`, the free Electron update service, which reads the repo's releases. The first check runs 30 s after startup, then every hour. Squirrel downloads the update; the tray and Preferences then offer "Restart to Update" (`quitAndInstall`). A Squirrel error (e.g. a translocated or read-only macOS app) falls back to the notify check.
- **Notify only:** `GET https://api.github.com/repos/giocaizzi/shortty/releases/latest` with `net.fetch`, 30 s after startup, then every 24 h. Drafts, prereleases and tags that are not `vX.Y.Z` are ignored; a newer version adds "Update Available (vX.Y.Z)..." to the tray, which opens the release page. Offline or rate limited: no message, Preferences shows "Couldn't check for updates."
- **Preferences:** `UpdateStatus.canAutoUpdate` (sent on `updates:getStatus` and `updates:onStatus` once known) tells the Updates section whether this copy can update itself: if so it shows "Download updates automatically" and the footer "Updates install in the background and apply when you restart."; if not (or in development) the switch is hidden and the footer reads "This copy can't update itself. Shortty will tell you when a new version is out and link to the download."
- **Never** in development (`!app.isPackaged`) or e2e (`SHORTTY_E2E=1`) runs; tests make no network calls.
- **Asset names** update.electronjs.org relies on: macOS `*-mac*.zip` (case-insensitive, `-arm64` lowercase for Apple silicon) → `Shortty-macOS-arm64.zip`, and without `-arm64` for Intel → `Shortty-macOS-x64.zip`; Windows any `.exe` without `arm`/`ia32` → `Shortty-Windows-x64-Setup.exe`, plus `RELEASES` and the `.nupkg` it names in the same release. Procedure and constraints: [runbooks/updates.md](runbooks/updates.md).

### 12.5 Distribution

- **v1:** GitHub Releases — DMG + ZIP for macOS; Squirrel installer (per user, into `%LOCALAPPDATA%\shortty`, icon `src/assets/icon.ico`) + portable ZIP for Windows, and deb/rpm (Linux) makers are configured but untested in v1. Launch at login on a Squirrel install registers the stub launcher `%LOCALAPPDATA%\shortty\shortty.exe`, which starts the latest installed version, so the login item survives updates (`src/main/login-item.ts`). Only a packaged app registers the login item: a `make dev` run would register the bare Electron binary, which opens the default Electron window at login. Procedure: [runbooks/release-macos.md](runbooks/release-macos.md)
- **Post-v1:** Homebrew Cask formula
- **Deferred:** Mac App Store (sandboxing conflicts)
- **Code signing:** Apple Developer account, sign + notarize from v1; enabled only through environment variables (`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`), unsigned otherwise

---

## 13. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Electron | 44 |
| Build | Electron Forge + Vite plugin | ^8 |
| Renderer | React + TypeScript | 19 / 5.9 |
| Styling | Tailwind CSS (`@tailwindcss/vite`) | 4 |
| Search | Fuse.js | ^7 |
| File watching | chokidar | ^5 |
| Settings | electron-store | ^12 |
| Icons | Lucide React | ^1 |
| Logging | electron-log | ^5 |
| Auto-update | Electron `autoUpdater` + update.electronjs.org | built in |
| Testing | Vitest + React Testing Library | ^5 |
| End-to-end | Playwright (`_electron`) | 1.63 ([runbook](runbooks/run-e2e-tests.md)) |
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

---

## 15. Decisions

Where v1 deliberately departs from the original plan. Each row is implemented; earlier sections already describe the new behaviour.

| Decision | Original plan | Why |
|---|---|---|
| Collapsible window, 750px wide, 72px collapsed, up to 580px (§10.8) | Fixed 680×500 | Spotlight-like: opening shows only the search bar and the window grows with results; the extra width fits the row layout below. |
| Footer with status and key hints (§10.4) | "No footer, no pills, no hints" | Shows what Enter/Tab/Esc do on the selected row and confirms copies without a modal. |
| Vaise-style single-line rows, keys on the right (§10.4) | Key pills on the left, command in the middle | Command names are what users scan; right-aligned caps line up in a column. |
| Source monogram tiles (§10.4) | Cheatsheet emoji icon | Emoji render inconsistently next to text and clash with the vibrancy material. |
| Real app icons, then brand glyphs, then monograms (§10.4) | Cheatsheet emoji icon | Users recognise their apps and tools by logo. App icons come from the installed apps (nothing bundled); glyphs come from `simple-icons`, which is CC0. Brand marks are used only to identify the tool they belong to, with no endorsement implied. Logos simple-icons does not carry (VS Code, Finder, Azure, AWS, OpenAI, Java) fall back to the app icon or the monogram. |
| Light/dark tokens following Theme (§10.4) | Theme setting with no launcher palette | Hard-coded white text was unreadable on light vibrancy. |
| No-results line with a hint (§10.3) | Blank panel | Confirms the query ran and matched nothing, and points to the `>` prefix when prefix mode is on. |
| Esc clears the query first (§10.7) | Esc dismisses / goes back | Matches Spotlight and lets users retype without leaving the level. |
| On-demand subcommand drill-in (§7.4) | Expanded subcommand index (up to ~50k entries) | Smaller index, no blind `--help` on every subcommand, and drill-in recurses to any depth. |
| Login-shell PATH import (§7.3) | `process.env.PATH` | Apps launched from Finder or at login only see launchd's PATH, which misses Homebrew, nvm, `~/.local/bin`. |
| `apropos .` for descriptions (§7.3) | `whatis -w '*'` | macOS `whatis` has no `-w`, which left every command without a description. |
| Env-allowlisted `--help` sandbox (§7.5) | Blocklist and timeout only | Arbitrary binaries must not see tokens or keys from the user's environment, open editors or pagers, or block on stdin. |
| Layout-aware key display and copy (§10.4, [keyboard-layouts.md](keyboard-layouts.md)) | US key labels; "native keymap" deferred | On non-US layouts the US label is not what the user presses; Chromium's `navigator.keyboard.getLayoutMap()` gives the real labels without a native module. |
| Single-instance lock (§5.3) | — | A second launch would add a second tray, watcher set and commands engine. |
| Cheatsheets bundled with `import.meta.glob`, schema checked by tests (§6.1) | JSON files read at runtime, validated at build time | No runtime path to resolve in dev, e2e and the packaged app; a unit test gives the same guarantee as a build step. |
| Preferences styled like macOS System Settings (§9.2) | Generic sidebar + tabs | Native look and controls on the primary platform. |
| update.electronjs.org + notify-only fallback (§12.4) | `electron-updater`, auto-install everywhere | Squirrel installs only on Windows installs and Developer ID signed macOS apps; the free service needs no update server or extra dependency, and every other build still learns about new versions. The "Restart to Update" prompt is ours (tray, Preferences), not a dialog. |

Command prefix mode stays **off** by default as originally specified; an interim commit (`874aa74`) had turned it on and `32885a4` restored the §9.1 defaults.
