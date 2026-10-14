# Shortty — Implementation Plan

> This document is the step-by-step implementation plan for Shortty.
> Each phase, task, and subtask is a checkmark item.
> Every task includes a verification step to confirm completion before moving to the next.
> See [SPECS.md](./SPECS.md) for the full specification and architectural decisions.

---

## Phase 1: Foundation Refactor

Restructure the existing codebase to align with the new cheatsheet-first architecture. No new features — just reorganize.

### 1.1 Cheatsheet Schema & Infrastructure

- [ ] Create `src/cheatsheets/schema.json` — JSON Schema per SPECS.md §6.1
- [ ] Create `src/cheatsheets/sources/` directory
- [ ] Implement cheatsheet loader module (`src/main/cheatsheets/loader.ts`)
  - [ ] Read all JSON files from `sources/` directory
  - [ ] Validate each against `schema.json` at startup
  - [ ] Parse platform-specific `key` fields for current platform
  - [ ] Return typed `CheatsheetDefinition[]`
- [ ] Write unit tests for cheatsheet loader
  - [ ] Valid cheatsheet loads correctly
  - [ ] Invalid cheatsheet is skipped with error log
  - [ ] Platform-specific key resolution works
  - [ ] Empty shortcuts array handled correctly
- [ ] **Verify:** `make test` passes, loader reads and validates JSON files

### 1.2 Migrate Existing Parsers to Cheatsheet Model

- [ ] Create metadata-only cheatsheet files for parser-provides-defaults sources:
  - [ ] `src/cheatsheets/sources/tmux.json` (id, label, icon, platforms, parser, defaultPaths, empty shortcuts)
  - [ ] `src/cheatsheets/sources/zsh.json`
  - [ ] `src/cheatsheets/sources/obsidian.json`
  - [ ] `src/cheatsheets/sources/macos-system.json`
- [ ] Create cheatsheet stub files for sources that will get curated defaults later:
  - [ ] `src/cheatsheets/sources/vscode.json` (with defaultPaths and parser, empty shortcuts for now)
  - [ ] `src/cheatsheets/sources/ghostty.json` (with defaultPaths and parser, empty shortcuts for now)
  - [ ] `src/cheatsheets/sources/chrome.json` (with defaultPaths and parser, empty shortcuts for now)
- [ ] **Verify:** all cheatsheet JSON files pass schema validation

### 1.3 Refactor Parser Registry

- [ ] Replace hardcoded parser list with `PARSERS` map (SPECS.md §6.2)
  ```typescript
  const PARSERS: Record<string, new () => BaseParser> = { ... };
  ```
- [ ] Refactor `ParserRegistry.initialize()`:
  - [ ] Load cheatsheets via loader
  - [ ] For each cheatsheet with `parser` field, look up in PARSERS map
  - [ ] For parsers in map without cheatsheet, register standalone
  - [ ] Merge both discovery paths into unified source list
- [ ] Remove `platform/paths.ts` — paths now come from cheatsheet `defaultPaths`
- [ ] Update `BaseParser` to accept paths from cheatsheet instead of hardcoded
- [ ] Update each parser to use provided paths:
  - [ ] `VscodeParser`
  - [ ] `GhosttyParser`
  - [ ] `TmuxParser`
  - [ ] `ZshParser`
  - [ ] `ObsidianParser`
  - [ ] `ChromeParser`
  - [ ] `MacosSystemParser`
- [ ] Update all parser tests to work with new path injection
- [ ] **Verify:** `make test` passes, all existing parsers work through new registry

### 1.4 Implement Merge Layer

- [ ] Create merge module (`src/main/shortcuts/merge.ts`)
  - [ ] Input: cheatsheet defaults `Shortcut[]` + parser overrides `Shortcut[]`
  - [ ] Match by `source + rawCommand`
  - [ ] User override replaces key, sets `isDefault: false`, `origin: 'user-config'`
  - [ ] User entries not in cheatsheet added as new
  - [ ] Cheatsheet entries not overridden kept with `isDefault: true`, `origin: 'cheatsheet'`
- [ ] Write unit tests for merge layer
  - [ ] Override replaces key correctly
  - [ ] Unmatched user entries added
  - [ ] Unmatched cheatsheet entries preserved
  - [ ] Empty parser output returns cheatsheet as-is
  - [ ] Empty cheatsheet returns parser output as-is
- [ ] Integrate merge into startup flow (cheatsheet load → parser parse → merge)
- [ ] **Verify:** `make test` passes, merged output is correct for each source

### 1.5 Update Data Types

- [ ] Update `Shortcut` type in `src/shared/types.ts`:
  - [ ] Add `origin: 'cheatsheet' | 'user-config' | 'app-defaults'` field
  - [ ] Add `category?: string` field
  - [ ] Ensure `context` field is used generically (vim modes, VS Code when, tmux tables)
- [ ] Update `generateKeybindingId()` to use `source + rawCommand` as identity
- [ ] Update all parser outputs to match new type
- [ ] Update renderer to handle new fields
- [ ] **Verify:** `make typecheck` passes, `make test` passes

### 1.6 Path Override Support

- [ ] Add `sourcePathOverrides: Record<string, string | string[]>` to `AppSettings`
- [ ] Implement path resolution order in registry:
  1. User override (if set)
  2. Environment variable expansion (`~`, `$HOME`, `$XDG_CONFIG_HOME`, `%APPDATA%`)
  3. Cheatsheet `defaultPaths` for current platform
  4. Discovery scan (Obsidian)
- [ ] Create path resolution utility (`src/main/utils/path-resolver.ts`)
  - [ ] Tilde expansion
  - [ ] Environment variable expansion
  - [ ] Existence checking
- [ ] Write unit tests for path resolver
- [ ] **Verify:** path overrides work end-to-end, `make test` passes

---

## Phase 2: New Parsers

### 2.1 vim Parser

- [ ] Create `src/main/parsers/vim.parser.ts`
  - [ ] Parse `.vimrc` for `map`, `nmap`, `vmap`, `imap` (recursive)
  - [ ] Parse `noremap`, `nnoremap`, `vnoremap`, `inoremap` (non-recursive)
  - [ ] Parse `unmap`, `nunmap` etc.
  - [ ] Detect `let mapleader = "..."` and substitute `<leader>` in mappings
  - [ ] Set `context` to mode: "normal", "visual", "insert", "command"
  - [ ] Humanize command names
- [ ] Create `src/cheatsheets/sources/vim.json` (metadata + defaultPaths)
- [ ] Create `fixtures/vimrc` with realistic test data
- [ ] Write unit tests (`tests/unit/parsers/vim.test.ts`)
  - [ ] Basic `nmap` parsing
  - [ ] Multi-modifier mappings
  - [ ] Leader key substitution
  - [ ] Unmap handling
  - [ ] Mode detection from command prefix
  - [ ] Comments and blank lines ignored
  - [ ] Missing file graceful handling
- [ ] Add `vim` to PARSERS map in registry
- [ ] **Verify:** `make test` passes, vim parser outputs correct shortcuts from fixture

### 2.2 Bash Keybindings Parser

- [ ] Create `src/main/parsers/bash.parser.ts`
  - [ ] Parse `.inputrc` for `"sequence": function-name` bindings
  - [ ] Parse `.bashrc` for `bind '"sequence" function-name'` commands
  - [ ] Parse `bind -x '"sequence": command'` (shell command bindings)
  - [ ] Handle `set editing-mode vi` / `set editing-mode emacs` as context
  - [ ] Normalize escape sequences (same patterns as zsh parser)
- [ ] Create `src/cheatsheets/sources/bash.json` (metadata + defaultPaths)
- [ ] Create `fixtures/inputrc` with test data
- [ ] Create `fixtures/bashrc` with test data
- [ ] Write unit tests (`tests/unit/parsers/bash.test.ts`)
  - [ ] `.inputrc` parsing
  - [ ] `.bashrc` bind parsing
  - [ ] `bind -x` parsing
  - [ ] Editing mode detection
  - [ ] Escape sequence normalization
  - [ ] Missing file handling
- [ ] Add `bash` to PARSERS map in registry
- [ ] **Verify:** `make test` passes, bash parser outputs correct shortcuts

---

## Phase 3: Curated Cheatsheets

### 3.1 VS Code Cheatsheet

- [ ] Research and compile VS Code default shortcuts (~150-200 entries)
  - [ ] General: Command Palette, Quick Open, Settings, Keyboard Shortcuts
  - [ ] Navigation: Go to Line, Go to Symbol, breadcrumbs
  - [ ] Editing: Cut, Copy, Paste, Undo, Redo, Find, Replace
  - [ ] Selection: Multi-cursor, column select, expand/shrink
  - [ ] View: Sidebar, Panel, Terminal, Explorer, Extensions
  - [ ] Debug: Start, Step Over, Step Into, Breakpoint
  - [ ] Terminal: New, Split, Focus, Kill
- [ ] Populate `src/cheatsheets/sources/vscode.json` with entries
  - [ ] Include platform-specific keys (darwin, win32, linux)
  - [ ] Include `context` where applicable (editorFocus, terminalFocus, etc.)
  - [ ] Include `category` per entry
  - [ ] Set `lastVerified` to current VS Code version
- [ ] Validate against schema
- [ ] **Verify:** cheatsheet loads, entries display correctly, merge with parser overrides works

### 3.2 Chrome Cheatsheet

- [ ] Research and compile Chrome default shortcuts (~50-60 entries)
  - [ ] Tabs: New, Close, Reopen, Switch, Pin
  - [ ] Navigation: Back, Forward, Refresh, Home
  - [ ] Page: Find, Zoom, Print, Source
  - [ ] Bookmarks: Add, Manager, Bar
  - [ ] DevTools: Open, Console, Inspector
- [ ] Populate `src/cheatsheets/sources/chrome.json`
- [ ] Validate against schema
- [ ] **Verify:** cheatsheet loads, entries display, extension shortcuts from parser merge correctly

### 3.3 Finder Cheatsheet

- [ ] Research and compile Finder default shortcuts (~40-50 entries)
  - [ ] File: New Folder, Get Info, Duplicate, Move to Trash
  - [ ] Navigation: Go to Folder, Enclosing Folder, Home, Desktop
  - [ ] View: Icons, List, Columns, Gallery, Show/Hide
  - [ ] Window: New Window, Minimize, Close
- [ ] Create `src/cheatsheets/sources/finder.json` (parser: null)
- [ ] Validate against schema
- [ ] **Verify:** cheatsheet loads, Finder appears as cheatsheet-only source

### 3.4 vim Cheatsheet

- [ ] Research and compile vim default shortcuts (~100-150 entries)
  - [ ] Normal mode: Motion (h,j,k,l,w,b,e,0,$,gg,G), Editing (d,c,y,p,x,r,s), Search (/,?,n,N)
  - [ ] Insert mode: Enter insert (i,a,o,I,A,O), Exit (Esc)
  - [ ] Visual mode: Enter (v,V,Ctrl-v), Operations (d,c,y)
  - [ ] Command mode: Save (:w), Quit (:q), Search/Replace (:%s)
  - [ ] Window: Split (Ctrl-w s/v), Navigate (Ctrl-w h/j/k/l)
- [ ] Populate `src/cheatsheets/sources/vim.json`
  - [ ] Set `context` to mode for each entry
  - [ ] Set `category` per entry
- [ ] Validate against schema
- [ ] **Verify:** cheatsheet loads, modal context displays correctly, merge with .vimrc overrides works

### 3.5 Ghostty Cheatsheet

- [ ] Research and compile Ghostty default shortcuts (~30 entries)
  - [ ] Tab management, split management, font size
  - [ ] Navigation, copy/paste, search
- [ ] Populate `src/cheatsheets/sources/ghostty.json`
- [ ] Validate against schema
- [ ] **Verify:** cheatsheet loads, merge with user config overrides works

---

## Phase 4: Commands Engine

### 4.1 Tier 1 — PATH Scan & Whatis

- [ ] Create `src/main/commands/` directory
- [ ] Implement PATH scanner (`src/main/commands/path-scanner.ts`)
  - [ ] Read `PATH` environment variable
  - [ ] Scan each directory for executables
  - [ ] Deduplicate by name (first in PATH wins)
  - [ ] Record binary path and mtime
  - [ ] Return `Command[]` with `enrichment: 'basic'`
- [ ] Implement whatis reader (`src/main/commands/whatis-reader.ts`)
  - [ ] Run `whatis -w '*'` or equivalent
  - [ ] Parse output into name → description map
  - [ ] Graceful fallback: if whatis unavailable, return empty map
  - [ ] Merge descriptions into PATH scan results
- [ ] Write unit tests for PATH scanner
  - [ ] Finds executables in mock PATH
  - [ ] Deduplicates correctly
  - [ ] Handles empty PATH gracefully
  - [ ] Handles non-existent directories gracefully
- [ ] Write unit tests for whatis reader
  - [ ] Parses standard whatis output
  - [ ] Handles missing whatis database
- [ ] **Verify:** `make test` passes, Tier 1 produces command inventory

### 4.2 Persistent Cache

- [ ] Implement cache manager (`src/main/commands/cache.ts`)
  - [ ] Read/write `meta.json` (PATH hash, timestamps, stats)
  - [ ] Read/write `commands-index.json` (full inventory)
  - [ ] Read/write individual `details/{name}.json` files
  - [ ] PATH hash computation: `hash(PATH + mtime of each PATH directory)`
  - [ ] Cache validation: compare current hash vs stored hash
  - [ ] Incremental update: add new commands, remove old, flag changed for re-enrichment
- [ ] Write unit tests for cache manager
  - [ ] Cold start (no cache) works
  - [ ] Warm start (valid cache) reads correctly
  - [ ] Stale cache (PATH changed) triggers incremental update
  - [ ] Individual detail files read/write correctly
- [ ] **Verify:** `make test` passes, cache survives app restarts

### 4.3 Tier 3 — Enrichment Worker

- [ ] Implement enrichment worker (`src/main/commands/enrichment-worker.ts`)
  - [ ] Discover man page locations via `man --path`
  - [ ] Discover zsh completion locations via `zsh -c 'echo $FPATH'`
  - [ ] Discover bash completion locations via `pkg-config` or fallback
  - [ ] Detect available shells (`which zsh`, `which bash`)
- [ ] Implement zsh completion parser (`src/main/commands/parsers/zsh-completion.ts`)
  - [ ] Read `_commandname` files from FPATH directories
  - [ ] Extract subcommands and flags from completion definitions
  - [ ] Return `CommandDetail[]` and `FlagDetail[]`
- [ ] Implement bash completion parser (`src/main/commands/parsers/bash-completion.ts`)
  - [ ] Read completion files from bash completion directories
  - [ ] Extract subcommands and flags
  - [ ] Return `CommandDetail[]` and `FlagDetail[]`
- [ ] Implement man page parser (`src/main/commands/parsers/man-parser.ts`)
  - [ ] Read man page files from discovered locations
  - [ ] Extract NAME section (description)
  - [ ] Extract COMMANDS/SUBCOMMANDS section
  - [ ] Extract OPTIONS/FLAGS section
  - [ ] Parse groff/mdoc format patterns
- [ ] Implement `--help` parser (`src/main/commands/parsers/help-parser.ts`)
  - [ ] Spawn command with `--help` flag
  - [ ] 2 second timeout, hard kill
  - [ ] Check against hardcoded blocklist before spawning
  - [ ] Skip dotfile/hidden commands
  - [ ] Parse subcommand patterns: `/^\s{2,}(\S+)\s{2,}(.+)$/`
  - [ ] Parse flag patterns: `/^\s{2,}(-\w),?\s*(--[\w-]+)\s{2,}(.+)$/`
- [ ] Implement worker orchestration
  - [ ] Priority order: zsh completion → bash completion → man pages → --help
  - [ ] First source that yields results wins (no merging)
  - [ ] Concurrency: 3 parallel file reads, 1 process spawn at a time
  - [ ] Pause when window visible, resume when hidden or 5s idle
  - [ ] Batch save every 50 enrichments
  - [ ] Mark failed enrichments as `enrichment: 'failed'`
- [ ] Write unit tests for each enrichment parser
  - [ ] Zsh completion: fixture parsing
  - [ ] Bash completion: fixture parsing
  - [ ] Man page: fixture parsing
  - [ ] `--help`: mock spawn, timeout handling, blocklist
- [ ] Write unit tests for worker orchestration
  - [ ] Priority order respected
  - [ ] Concurrency limits enforced
  - [ ] Pause/resume behavior
  - [ ] Failed enrichment handling
- [ ] **Verify:** `make test` passes, enrichment produces subcommands and flags from test fixtures

### 4.4 Commands Engine Integration

- [ ] Create commands engine facade (`src/main/commands/engine.ts`)
  - [ ] Initialize: load cache or Tier 1 scan
  - [ ] Build Fuse.js index with expanded entries (top-level + subcommands)
  - [ ] Start enrichment worker
  - [ ] Expose query interface
  - [ ] Handle rebuild triggers (PATH hash check)
- [ ] Add commands IPC channels
  - [ ] `commands:getAll` → all commands from index
  - [ ] `commands:getDetails` → detail for specific command
  - [ ] `commands:refresh` → force rescan
  - [ ] `commands:onUpdate` → push when enrichment batch completes
- [ ] Update preload script with commands API
- [ ] Write integration tests
  - [ ] Cold start → Tier 1 → searchable
  - [ ] Warm start → cache read → searchable
  - [ ] PATH change → incremental update
  - [ ] Enrichment → index expansion
- [ ] **Verify:** `make test` passes, commands searchable via IPC

---

## Phase 5: Search & IPC Refactor

### 5.1 Dual Fuse.js Architecture

- [ ] Create shortcuts search module (`src/renderer/search/shortcuts-search.ts`)
  - [ ] Fuse.js instance with user-configurable weights
  - [ ] Fields: key, searchKey, command, sourceLabel, context
  - [ ] Rebuild on data change
- [ ] Create commands search module (`src/renderer/search/commands-search.ts`)
  - [ ] Fuse.js instance with fixed weights (name: 0.5, description: 0.3, subcommands: 0.2)
  - [ ] Fields: name, description, subcommand names
  - [ ] Rebuild on data change and enrichment updates
- [ ] Create unified search coordinator (`src/renderer/search/search-coordinator.ts`)
  - [ ] Accept query string
  - [ ] Check command prefix mode setting
  - [ ] If prefix mode on and query starts with `>`: search commands only
  - [ ] Otherwise: search both indices
  - [ ] Match source names against query for Sources section
  - [ ] Apply section limits (Sources: 3, Shortcuts: 8, Commands: 5)
  - [ ] Return structured result: `{ sources: [], shortcuts: [], commands: [] }`
- [ ] Write unit tests for search coordinator
  - [ ] Unified search returns all three sections
  - [ ] Prefix mode filters correctly
  - [ ] Section limits applied
  - [ ] Source name matching works
  - [ ] Empty query returns empty results
- [ ] **Verify:** `make test` passes, search returns correctly structured results

### 5.2 IPC Channel Updates

- [ ] Update `src/shared/ipc-channels.ts` with new channels:
  - [ ] Commands channels (getAll, getDetails, refresh, onUpdate)
  - [ ] Rename keybinding channels to shortcut channels for clarity
- [ ] Update `src/main/ipc.ts` with new handlers
- [ ] Update `src/preload/preload.ts` with new API surface
- [ ] Update `src/renderer/lib/ipc.ts` types
- [ ] Update existing hooks to use new channel names
- [ ] **Verify:** `make typecheck` passes, IPC communication works end-to-end

### 5.3 Renderer Hooks Refactor

- [ ] Create `useShortcuts` hook (rename from `useKeybindings`)
  - [ ] Fetch shortcuts via IPC
  - [ ] Subscribe to shortcut updates
  - [ ] Return typed `Shortcut[]`
- [ ] Create `useCommands` hook
  - [ ] Fetch commands via IPC
  - [ ] Subscribe to command updates (enrichment)
  - [ ] Return typed `Command[]`
- [ ] Create `useSearch` hook (unified)
  - [ ] Accept query string
  - [ ] Use search coordinator
  - [ ] Return `{ sources, shortcuts, commands }`
- [ ] Remove old `useKeybindings` and `useSearch` hooks
- [ ] **Verify:** `make typecheck` passes, hooks provide correct data

---

## Phase 6: UI Overhaul

### 6.1 Remove Old Components

- [ ] Remove `FilterPills.tsx` (replaced by search-driven navigation)
- [ ] Remove `EmptyState.tsx` (blank = no message)
- [ ] Remove `KeybindingList.tsx` (replaced by new results component)
- [ ] Remove `KeybindingRow.tsx` (replaced by new row components)
- [ ] Run `make knip` to verify no orphaned imports
- [ ] **Verify:** `make typecheck` passes after removals

### 6.2 New Result Components

- [ ] Create `ResultsContainer.tsx`
  - [ ] Receives `{ sources, shortcuts, commands }` from search
  - [ ] Renders three sections in fixed order
  - [ ] Each section: header + rows + "Show all X" when truncated
  - [ ] Handles expand/collapse of sections
  - [ ] Manages selected index across all sections (flat list navigation)
  - [ ] Scroll selected row into view
- [ ] Create `SectionHeader.tsx`
  - [ ] Section title ("Sources", "Shortcuts", "Commands")
  - [ ] Result count
  - [ ] "Show all X results" row when truncated
- [ ] Create `SourceRow.tsx`
  - [ ] Source icon + name + entry count
  - [ ] Selected state styling
  - [ ] Enter triggers drill-in
- [ ] Create `ShortcutRow.tsx`
  - [ ] Left: key combo as kbd pills
  - [ ] Center: command name + context badge (if present)
  - [ ] Right: source label (in flat mode)
  - [ ] Selected state styling
  - [ ] Enter copies key combo
  - [ ] Brief flash on copy
- [ ] Create `CommandRow.tsx`
  - [ ] Left: command name as code badge
  - [ ] Center: description
  - [ ] Selected state styling
  - [ ] Enter copies command
  - [ ] Tab/→ drills into details
- [ ] Create `CommandDetailView.tsx`
  - [ ] Header: ← command name
  - [ ] Description
  - [ ] Subcommands list (filterable via search bar)
  - [ ] Flags list (filterable via search bar)
  - [ ] "Enriching..." indicator if not yet enriched
  - [ ] Enter copies selected subcommand/flag
  - [ ] Esc returns to results
- [ ] Update `KeyCombo.tsx` if needed for new row layout
- [ ] Write component tests for each new component
- [ ] **Verify:** `make test` passes, `make typecheck` passes

### 6.3 Navigation State Machine

- [ ] Implement navigation state in `App.tsx`
  - [ ] States: `flat` | `drilled-source` | `command-detail`
  - [ ] `flat`: default, search across all
  - [ ] `drilled-source`: scoped to one source, search within
  - [ ] `command-detail`: viewing command details, search filters within
  - [ ] Transitions:
    - [ ] `flat` → Enter on source → `drilled-source`
    - [ ] `flat` → Tab/→ on command → `command-detail`
    - [ ] `drilled-source` → Esc → `flat`
    - [ ] `drilled-source` → Tab/→ on command → `command-detail`
    - [ ] `command-detail` → Esc → previous state
- [ ] Implement state-aware search behavior
  - [ ] `flat`: search all indices
  - [ ] `drilled-source`: search shortcuts for that source only
  - [ ] `command-detail`: filter subcommands/flags within detail view
- [ ] Implement state-aware keyboard handling
  - [ ] Esc behavior changes per state
  - [ ] Enter behavior changes per row type
- [ ] **Verify:** all navigation transitions work correctly

### 6.4 Update App.tsx

- [ ] Refactor `App.tsx` to use new components and state machine
  - [ ] `LauncherPanel` wraps everything
  - [ ] `SearchInput` at top (always visible)
  - [ ] `ResultsContainer` below (flat or drilled)
  - [ ] `CommandDetailView` replaces results when active
- [ ] Implement full state reset on window show
  - [ ] Clear query
  - [ ] Reset to flat mode
  - [ ] Reset selected index
- [ ] Implement dismiss after copy (respect setting)
- [ ] Implement copy with visual feedback (row flash)
- [ ] **Verify:** full user flow works — open, search, navigate, copy, dismiss

### 6.5 Search Input Updates

- [ ] Update `SearchInput.tsx`
  - [ ] Update placeholder: "Search shortcuts and commands..."
  - [ ] Support `>` prefix visual indicator when command prefix mode is on
  - [ ] Auto-focus on mount
  - [ ] Re-focus and select on window show
  - [ ] `?` icon that shows keyboard shortcuts help on hover/click
- [ ] **Verify:** search input works in all navigation states

---

## Phase 7: Preferences Overhaul

### 7.1 General Tab Updates

- [ ] Add "Show in Menu Bar" toggle
- [ ] Add "Dismiss After Copy" toggle
- [ ] Add "Window Position" selector (top-center, center, mouse)
- [ ] Add "Theme" selector (light, dark, system)
- [ ] Keep existing: Launch at Login, Show in Dock, Global Shortcut recorder
- [ ] Implement both-off safety dialog (dock + menu bar both disabled)
- [ ] **Verify:** all General settings persist and apply correctly

### 7.2 Sources Tab Overhaul

- [ ] Redesign Sources tab per SPECS.md §9.3 and §9.4
  - [ ] List all sources (from cheatsheets + standalone parsers)
  - [ ] Enable/disable toggle per source
  - [ ] Detection status indicator (detected / not detected / cheatsheet only)
  - [ ] Detected path display (green check / red X)
  - [ ] Show auto-detected path greyed out when override is set
  - [ ] Path override text input + file picker button
  - [ ] Environment variable support hint text
  - [ ] Validation warning if path doesn't exist
  - [ ] Reset button to clear override
  - [ ] Multi-path UI for Obsidian (list with add/remove)
- [ ] **Verify:** source toggles, path overrides, and detection work end-to-end

### 7.3 Search Tab Updates

- [ ] Keep existing shortcut weight sliders
- [ ] Add "Command Prefix Mode" toggle with explanation text
- [ ] Add result section limit controls (Sources, Shortcuts, Commands)
- [ ] **Verify:** search settings affect search behavior in real-time

### 7.4 Commands Tab

- [ ] Create Commands tab
  - [ ] Enable/disable toggle for commands feature
  - [ ] Enrichment status display (X of Y commands enriched)
  - [ ] Reserved space for future settings
- [ ] **Verify:** toggling commands feature enables/disables commands in search

---

## Phase 8: Logging & Error Handling

### 8.1 Logging Infrastructure

- [ ] Install and configure `electron-log`
- [ ] Set up log rotation (3 files, 5MB each)
- [ ] Set log level: info (production), debug (dev)
- [ ] Log location: `app.getPath('userData')/logs/`
- [ ] Add logging to:
  - [ ] Parser results summaries ("Parsed 12 shortcuts from vscode")
  - [ ] Cheatsheet loading ("Loaded 5 cheatsheets, 1 failed validation")
  - [ ] Enrichment progress ("Enriched 50/4127 commands")
  - [ ] File watcher events ("Config changed: vscode keybindings.json")
  - [ ] Errors and warnings
- [ ] Never log: file contents, shortcut data, user config data
- [ ] **Verify:** logs appear in correct location, rotation works

### 8.2 Error Boundaries

- [ ] Add React error boundary around main app
- [ ] Implement per-subsystem isolation:
  - [ ] Parser failure → skip source, log, continue
  - [ ] Cheatsheet validation failure → skip, log, continue
  - [ ] Enrichment failure → mark failed, log, continue
  - [ ] Commands engine failure → disable commands, log, shortcuts work
  - [ ] File watcher failure → log, continue without live updates
- [ ] **Verify:** simulate failures in each subsystem, app continues functioning

---

## Phase 9: Polish & Quality

### 9.1 Accessibility

- [ ] Respect `prefers-reduced-motion` — instant show/hide
- [ ] Respect `prefers-reduced-transparency` — solid backgrounds
- [ ] ARIA roles: search, listbox, option for results
- [ ] Screen reader announcements for section changes
- [ ] **Verify:** test with reduced motion/transparency enabled

### 9.2 Component Tests

- [ ] Write tests for `SearchInput.tsx`
- [ ] Write tests for `ResultsContainer.tsx`
- [ ] Write tests for `ShortcutRow.tsx`
- [ ] Write tests for `CommandRow.tsx`
- [ ] Write tests for `SourceRow.tsx`
- [ ] Write tests for `CommandDetailView.tsx`
- [ ] Write tests for navigation state machine
- [ ] **Verify:** `make test` passes, all component tests green

### 9.3 Integration Testing

- [ ] Test full flow: startup → cheatsheet load → parser merge → search → results
- [ ] Test file watcher: modify config → shortcuts update → UI reflects change
- [ ] Test commands: startup → Tier 1 scan → search → enrichment → expanded results
- [ ] Test settings: change setting → behavior changes → persists across restart
- [ ] **Verify:** all integration tests pass

### 9.4 Performance Validation

- [ ] Measure startup time — target: <500ms to window ready
- [ ] Measure search latency — target: <10ms per keystroke
- [ ] Measure memory footprint — target: <100MB resident
- [ ] Measure enrichment worker CPU impact — target: <5% while active
- [ ] Profile Fuse.js with 50k+ command entries
- [ ] **Verify:** all performance targets met

### 9.5 Code Quality

- [ ] Run `make lint` — fix all issues
- [ ] Run `make typecheck` — no errors
- [ ] Run `make knip` — no unused exports/files
- [ ] Review all TODO/FIXME comments
- [ ] **Verify:** `make precommit` passes clean

---

## Phase 10: Packaging & Distribution

### 10.1 App Identity

- [ ] Create app icons (.icns for macOS, .ico for Windows, .png for Linux)
- [ ] Update `forge.config.ts` with icons
- [ ] Update app name and metadata in `package.json`
- [ ] **Verify:** icon appears correctly in dock, tray, and about dialog

### 10.2 Code Signing & Notarization

- [ ] Configure Apple Developer certificate in forge config
- [ ] Set up notarization with `@electron/notarize`
- [ ] Configure entitlements for file system access
- [ ] **Verify:** signed DMG installs without Gatekeeper warnings

### 10.3 Build & Release

- [ ] Configure GitHub Actions for release builds
  - [ ] Build on push to release branch/tag
  - [ ] macOS: DMG (signed + notarized)
  - [ ] Windows: Squirrel installer
  - [ ] Linux: deb + rpm
  - [ ] Upload artifacts to GitHub Releases
- [ ] Test installation on clean machines:
  - [ ] macOS (Apple Silicon + Intel)
  - [ ] Windows 10/11
  - [ ] Ubuntu/Fedora
- [ ] **Verify:** `make make` produces installable artifacts, release pipeline works

### 10.4 Auto-Update

- [ ] Install and configure `electron-updater`
- [ ] Configure update feed URL (GitHub Releases)
- [ ] Implement update check on app launch
- [ ] Implement update notification (download available, restart to apply)
- [ ] **Verify:** publish update → app detects and installs it

### 10.5 CLI Escape Hatch

- [ ] Implement `shortty --reset-settings` command
  - [ ] Clears electron-store to defaults
  - [ ] Outputs confirmation message
- [ ] **Verify:** settings reset works when both dock and menu bar are off

---

## Phase 11: Final Verification

### 11.1 End-to-End Checklist

- [ ] App launches silently (no window, tray icon visible)
- [ ] Global hotkey toggles panel with animation
- [ ] Panel opens blank, search bar focused
- [ ] Typing shows results in three sections (Sources, Shortcuts, Commands)
- [ ] Arrow keys navigate rows across sections with wrap-around
- [ ] Enter on source drills in, Esc goes back
- [ ] Enter on shortcut copies key combo, row flashes
- [ ] Enter on command copies command, row flashes
- [ ] Tab/→ on command drills into detail view
- [ ] Command detail view shows subcommands and flags
- [ ] Search filters within detail view
- [ ] Esc from detail view returns to results
- [ ] Panel dismisses on Esc (flat mode), click outside, blur, global hotkey
- [ ] State fully resets on each open
- [ ] Dismiss after copy setting works (both on and off)
- [ ] File watcher: edit a config → shortcuts update without reopening
- [ ] Preferences: all tabs functional, settings persist
- [ ] Source path overrides work
- [ ] Enable/disable sources works
- [ ] Commands feature toggle works
- [ ] Command prefix mode works (`>` prefix)
- [ ] Theme switch works (light/dark/system)
- [ ] Launch at login works
- [ ] Dock/menu bar visibility settings work
- [ ] Both-off safety dialog works
- [ ] `shortty --reset-settings` works
- [ ] `make precommit` passes (lint + typecheck + test + knip)
- [ ] Performance targets met
- [ ] Auto-update works
- [ ] Signed DMG installs without warnings
