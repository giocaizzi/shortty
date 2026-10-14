# Shortty v1 status

Status of v1 on `feat/finish-v1` (2026-10-14), checked against the code. It replaces the original implementation plan (removed from the repo; see git history) and supersedes the pre-fix audit in [gap-analysis.md](gap-analysis.md). Target behaviour: [spec.md](../spec.md) and [screens.md](../screens.md); deliberate departures: [spec §15](../spec.md#15-decisions).

Legend: **done** · **deferred** (wanted, not in v1) · **not doing** (out of scope for v1).

## Shortcuts engine

- **done**: 10 cheatsheets (VS Code, Chrome, Finder, vim, Ghostty + metadata-only tmux, Zsh, Bash, Obsidian, macOS system), bundled with `import.meta.glob` and validated against `schema.json` by `tests/unit/cheatsheets/shipped.test.ts`.
- **done**: 9 parsers in the `PARSERS` map (`src/main/parsers/registry.ts`); structured `strokes` for layout-aware display.
- **done**: merge layer by `source` + `rawCommand`, including VS Code unbinds (`-cmd`) and Ghostty ids; tmux always merges `list-keys` defaults with config binds.
- **done**: path resolver with `$XDG_CONFIG_HOME` → `~/.config` fallback; path overrides re-resolve and re-detect without restart.
- **done**: file watcher handles `change`, `add` and `unlink`, so configs created after startup are picked up.
- **deferred**: Zsh and Bash defaults (`bindkey -L`, `bind -p`); both parse only the user's rc files, so a user without custom binds sees an empty source.
- **deferred**: tmux and macOS-system parsers still call `execFileSync` on the main thread at startup.
- **not doing**: vim cheatsheet ↔ `.vimrc` merge (user maps are additive), `minVersion` filtering, Neovim Lua.

## Commands engine

- **done**: login-shell PATH import at startup (`src/main/shell-env.ts`), so Finder/login launches see Homebrew, nvm, `~/.local/bin`.
- **done**: descriptions from `apropos .` (async), fallback `whatis -w`.
- **done**: persistent cache; PATH change is incremental (unchanged binaries keep their enrichment) and reconciled with the details cache; PATH re-checked on every show.
- **done**: enrichment worker: man pages 3 at a time, `--help` one at a time, paused while the launcher is visible (resumes on hide or after 5s); a stopped worker emits nothing.
- **done**: `--help` sandbox: env allowlist, temp cwd, stdin closed, 2s SIGKILL to the process group, 1 MB output cap; blocklist and owner checks also on subcommand drill-in.
- **done**: on-demand recursive subcommand drill-in (replaces the expanded index; spec §7.4).
- **deferred**: drilling into an unenriched top-level command does not enrich it on demand; the view waits for the background worker (`getCommandDetail` is exposed in the preload but unused by the renderer).
- **deferred**: cache writes are synchronous (`writeFileSync`).
- **not doing**: zsh/bash completion files as enrichment sources; Windows `--help`-only path.

## Search

- **done**: two Fuse indices; configurable shortcut weights; command weights name 0.5 / description 0.3 / subcommand names 0.2 with exact-name and prefix ranking.
- **done**: command prefix mode (default off) returns shortcuts only without `>`.
- **done**: fuzzy, space-insensitive source matching ("vsc" → VS Code).
- **done**: search by the key as labelled on the user's layout.
- **done**: no full refetch on every show; renderer relies on pushed updates.
- **not doing**: IPC channel rename `keybindings:*` → `shortcuts:*`; separate search-coordinator modules.

## Launcher UI

- **done**: collapsible 750px window (72px / 180px / 580px), on the display under the cursor.
- **done**: Vaise-style rows, source monogram tiles, footer with status and key hints, `?` button and hotkey hint in the search bar.
- **done**: light/dark tokens following the Theme setting; reduced motion and reduced transparency.
- **done**: drilled source lists every entry by category; Esc/←/Backspace restore the previous level (query, expanded sections, selection).
- **done**: "Show all" as a keyboard-selectable row; Tab never leaves the field; selection scrolls into view.
- **done**: command detail follows the live command (fills in when enrichment lands); "Source: man page / --help" line.
- **done**: show and hide animations on every show/hide; full reset on hide.
- **done**: copy uses the layout-aware key label; copy flash and footer confirmation.

## Tray, lifecycle, settings

- **done**: tray follows "Show in menu bar" live; Show/Hide, Preferences, Quit.
- **done**: single-instance lock; second launch shows the running panel.
- **done**: `--reset-settings` ([runbook](../runbooks/reset-settings.md)).
- **done**: IPC registered before any await; engines load in parallel after the PATH import.
- **done**: spec defaults (`launchAtLogin: false`, `commandPrefixMode: false`); global-shortcut registration errors reach Preferences.
- **done**: `sandbox: true` for both windows; fuses; logging with 3 rotated files, debug when unpackaged.

## Preferences

- **done**: System Settings-like design, light/dark, keyboard navigation in the sidebar.
- **done**: shortcut recorder by physical key, labelled for the user's layout.
- **done**: Sources: ✓/✗ per path, `~` display, save on blur/Enter, Browse… (native picker), Reset, warning for a missing path.
- **done**: Search (weights, fuzziness, prefix mode, limits) and Commands (toggle, progress, status).
- **deferred**: Obsidian multi-path list with add/remove (a single custom path field only).

## Quality

- **done**: unit and component tests (`tests/unit/**`, `tests/components/**`), including `App` navigation, registry, merge, path resolver, commands engine and worker, shell-env, window geometry. **Deferred:** no automated test covers the file watcher (`src/main/watcher.ts`).
- **done**: Playwright e2e suite on the built app in hermetic mode ([runbook](../runbooks/run-e2e-tests.md)); no known-bug markers left.
- **done**: `make precommit` (lint, typecheck, test, knip) passes.
- **done**: benchmark of the launcher ([benchmark.md](benchmark.md)).

## Packaging and distribution

- **done**: app icon, DMG (ULFO) + ZIP makers, env-driven signing and notarization ([runbook](../runbooks/release-macos.md)).
- **deferred**: Developer ID certificate and notarization credentials (human task); tag-triggered release workflow.
- **not doing**: auto-update (`electron-updater`), Homebrew cask, Mac App Store; testing the Windows/Linux makers.

## Known limitations

- Windows and Linux are untested.
- The packaged app reads the login-shell PATH once at startup; a PATH change in rc files needs a restart.
