# Shortty v1 gap analysis

Audit of branch `feat/finish-v1` (base `2c04f49`) against `SPECS.md`, `SCREENS.md`, `PRD.md`. PRD checkboxes were ignored; every status below comes from reading the code.
Baseline checks: `make lint` passes, `make typecheck` passes, `make test` passes (31 files, 262 tests), `make knip` **fails** (`@playwright/test` unused devDependency, `package.json:38`). The fail was already there before this audit, and it breaks `make precommit`.

Status legend: **DONE** · **PARTIAL** · **MISSING** · **DIVERGES** (implemented differently; *deliberate* = backed by a later design commit) · **SKIP-v1** (not worth doing for v1).

## 1. Product summary

Shortty is a macOS-first menu-bar utility you summon with a global hotkey (⌘⇧Space). It opens a Spotlight-like glass search bar. One fuzzy query searches three things at once: tool *sources* (VS Code, tmux, vim, …), *keyboard shortcuts* (curated cheatsheet defaults merged with the user's real config files, kept live by file watchers), and *CLI commands* found on `$PATH` (enriched in the background from man pages and `--help` into subcommands, flags and arguments). It is a lookup tool, not a browser. You type, arrow to the hit, press Enter to copy it (or drill into a source or command), and it disappears. Every open starts blank. Everything stays local.

Design drift that is deliberate: commit `1eab1ee` ("Vaise-inspired layout") moved key caps to the right with the command name and a `rawCommand` pill stacked on the left. Commit `3d52c4f` ("spotlight-style collapsible window") replaced the fixed 680×500 window with a 750px-wide window that is 72px tall when empty and grows to 580px with results. Commit `874aa74` replaced the "expanded subcommand index" with recursive on-demand subcommand drill-in. Treat these as the new spec and update SPECS/SCREENS (WP-H) instead of reverting them.

## 2. Status by area

### 2.1 Shortcuts engine (PRD Phases 1–3, SPECS §6)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Cheatsheet schema + loader | PARTIAL | `src/cheatsheets/schema.json`; `src/main/cheatsheets/loader.ts:34-106` validates by hand and never reads `schema.json` | No test validates the shipped `sources/*.json` against the schema. SPECS §6.1 wants "errors caught at build time". |
| 10 cheatsheets present | DONE | `src/cheatsheets/sources/*.json` (vscode 150, chrome 57, finder 50, vim 149, ghostty 30, 5 metadata-only) | vscode has a duplicate `workbench.action.quickOpen`, which gives a duplicate id / React key. |
| `PARSERS` map + two-door registry | DONE | `src/main/parsers/registry.ts:22-32, 58-111` | — |
| Path injection into parsers | DONE | `base-parser.ts:16-23`, `registry.ts:66-76` | — |
| Merge layer | PARTIAL | `src/main/shortcuts/merge.ts:10-60`, tested | Only matches for VS Code. Ghostty cheatsheet ids are `ghostty.new_tab` but the parser emits `new_tab` (`ghostty.parser.ts:51`), so user overrides never replace defaults and duplicates appear. VS Code unbinds (`-cmd`, `vscode.parser.ts:41`) never mark the default unbound. The map is keyed by `rawCommand` only (`merge.ts:15-17`), so cheatsheet rows that share a `rawCommand` collapse. |
| Cheatsheet keys normalized to glyphs | MISSING | `registry.ts:223-224` stores `"Cmd+Shift+P"` raw while parsers emit `⌘⇧P` | Mixed `Cmd+Shift+P` / `⌘⇧P` caps in the same list; `searchKey` formats differ (`cmd+shift+p` vs `cmd shift p`). |
| `Shortcut` type (origin, category, context) | DONE | `src/shared/types.ts:3-18` | — |
| Path resolver (~, $VAR, %VAR%) | PARTIAL | `src/main/utils/path-resolver.ts:7-20` | An unset `$XDG_CONFIG_HOME` expands to `''` (→ `/ghostty/config`); there is no `~/.config` fallback. No unit test. |
| Path overrides applied | PARTIAL | `registry.ts:67-72, 130-137` | Removing an override (Reset) keeps the old path until restart (`if (override)` only). `detected` is never recomputed (`registry.ts:86,106`). |
| vim parser | DONE | `vim.parser.ts`, `tests/unit/parsers/vim.test.ts` | Doesn't merge with cheatsheet (ids differ). User maps are additive, so that's acceptable. |
| bash parser | DONE | `bash.parser.ts`, tests | Parses user files only. SPECS says the parser provides defaults (`bind -p`) too → PARTIAL for "defaults". |
| zsh parser | PARTIAL | `zsh.parser.ts:17-30` | User `bindkey` only; no `bindkey -L` defaults, so the source is empty for users without custom binds. |
| tmux parser | PARTIAL | `tmux.parser.ts:63-68` | Returns *either* config binds *or* `list-keys`. With a `.tmux.conf` holding 3 binds, all ~100 defaults vanish. `execSync` blocks the main thread at startup (`:52,74`). |
| Ghostty/Chrome/Obsidian/macOS parsers | DONE | respective `*.parser.ts` + tests | Ghostty macOS path misses `~/.config/ghostty/config` (Ghostty reads XDG on macOS too): `ghostty.json` darwin `defaultPaths`. |
| File watching | PARTIAL | `src/main/watcher.ts:30-53` | Only `change` is handled. Parsers only return *existing* paths (e.g. `vscode.parser.ts:20-22`), so creating a config later is never seen; `detected` stays false, so it is never parsed (`registry.ts:191`). |
| Source enable/disable rebuild | DONE | `index.ts:271-285`, `registry.ts:121-146` | Re-parses *all* sources on every change (fine), but see the per-keystroke issue in Prefs. |
| Per-subsystem error isolation | DONE | `registry.ts:164-176, 192-197`, `index.ts:321-333, 342-346` | — |

### 2.2 Commands engine (PRD Phase 4, SPECS §7)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Tier 1 PATH scan | PARTIAL | `src/main/commands/path-scanner.ts:9-45` | Uses `process.env.PATH`. A packaged macOS app launched from Finder/login gets `/usr/bin:/bin:/usr/sbin:/sbin`, so Homebrew, `~/.local/bin`, nvm etc. are missing (verified: `tmux` not on that PATH). Same root cause breaks tmux detection (`tmux.parser.ts:52`). |
| whatis descriptions | **BROKEN on macOS** | `whatis-reader.ts:7` runs `whatis -w '*'`; on macOS this prints `illegal option -- w` (verified) | Tier 1 has **zero descriptions** on the primary platform. Fallback: `apropos .` works on macOS (16k lines, ~5s). It must run async, because it is currently `execSync` with a 10s timeout on the main thread. |
| Persistent cache (meta/index/details) | DONE | `cache.ts:14-121`, tests | Writes are sync on the main thread (`writeFileSync` of the whole index every 50 commands). |
| PATH-hash invalidation | PARTIAL | `cache.ts:24-41`, `engine.ts:25-38` | A stale hash triggers `fullScan()` (`engine.ts:40-69`). That throws away all enrichment and does not reconcile the details cache, so it re-enriches from scratch. No incremental add/remove. |
| Window-show PATH check | MISSING | `engine.ts:71` `checkAndRefresh` is never called (grep) | Wire it to `showWindow`. |
| Enrichment: zsh completions | MISSING | no `parsers/zsh-completion.ts` | SKIP-v1 (man + `--help` cover most tools). |
| Enrichment: bash completions | MISSING | — | SKIP-v1. |
| Enrichment: man parser | DONE | `parsers/man-parser.ts`, tests | Spawns `man` per command rather than reading files; OK. |
| Enrichment: `--help` parser + blocklist | DONE | `parsers/help-parser.ts:13-166` | Owner check is present; there is no "never as root" check (minor). |
| Subcommand `--help` safety | **BUG** | `help-parser.ts:168-181` `parseSubcommandHelp` skips `isBlocklisted` and the owner check | Drilling into `security <sub>` (man page lists subcommands) runs `security <sub> --help`, which is exactly what the blocklist exists to stop (Keychain prompts). |
| Worker concurrency (3 files / 1 spawn) | DIVERGES | `enrichment-worker.ts:9` `CONCURRENCY = 8` for both man and `--help` | Up to 8 parallel unknown binaries. Deliberate per `52f5aac` "parallelize"; at least cap spawns. |
| Pause while window visible | MISSING | no pause/resume in `enrichment-worker.ts` | Needed for "no perf impact" (SPECS §7.5). |
| Expanded subcommand index | DIVERGES (deliberate) | `874aa74`; `useSearch.ts:58-69` indexes name+description only | Replaced by on-demand drill-in (`subcommand-enricher.ts`). Accept; update spec. |
| Commands IPC (getAll/detail/refresh/onUpdate/stats/subDetail) | DONE | `ipc.ts:78-101`, `preload.ts:79-105` | — |
| Engine disable/re-enable | PARTIAL | `index.ts:255-269` | The old worker's final `onBatchComplete` still fires after `stop()` (`enrichment-worker.ts:61-63`) and pushes updates to the renderer. |
| Win32 `--help` only | SKIP-v1 | — | Secondary platform. |

### 2.3 Search & IPC (PRD Phase 5, SPECS §8)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Two Fuse indices, configurable shortcut weights | DONE | `src/renderer/hooks/useSearch.ts:42-79` | Command weight `subcommands: 0.2` absent (follows from the drill-in design). |
| Separate search-coordinator modules | DIVERGES | all inside `useSearch.ts` | Fine; no need to split. |
| Unified search, 3 sections, fixed order | DONE | `useSearch.ts:81-127` | — |
| Command prefix mode | **BUG** | `useSearch.ts:91-123` | With prefix mode on, a non-`>` query still returns commands. Spec: shortcuts only. Default is `true` (`settings.ts:48`) vs spec `false`. |
| Source name matching | **BUG** | `useSearch.ts:113-114` uses `label.includes(q)` | Spec example "vsc" → VS Code fails (`"vs code".includes("vsc")` is false). Needs fuzzy/space-insensitive matching. |
| Section limits | DONE | `useSearch.ts:121-123`, settings | — |
| IPC channel rename keybindings→shortcuts | MISSING | `ipc-channels.ts:2-8`, `preload.ts:19-40` still `keybindings:*` | Cosmetic; SKIP-v1. |
| Payload on every show | PERF | `useShortcuts.ts:50-52`, `useCommands.ts:61-63` refetch everything on each `window:shown` | The full enriched command index (thousands of objects with flags) crosses IPC on every hotkey press. Contradicts "Window shown → no rebuild". Rely on push updates instead. |

### 2.4 Main panel UI (PRD Phase 6, SCREENS §1–2, §7–8, SPECS §10)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Blank on open, input focused, full reset | DONE | `App.tsx:87-99`, `SearchInput.tsx:43-55` | — |
| Window 680×500 fixed | DIVERGES (deliberate) | `index.ts:32-34`, `App.tsx:19-20,116-130` | Collapsible 72→580, 750 wide. Update spec. |
| Frameless, vibrancy, on top, hidden from dock/MC | DONE | `index.ts:79-110`, `forge.config.ts:20-22` | `transparent:false`; rounded corners/shadow come from vibrancy only. |
| Window position top-center/center/mouse | PARTIAL | `index.ts:36-74` | top-center/center use the *primary* display, not the display with the cursor. |
| Dismiss: Esc / blur / hotkey | PARTIAL | `index.ts:133-137,162-169`; `App.tsx:349` | Dismiss works through `window.blur()` → main `blur` handler, which is disabled in dev, so Esc/dismiss-after-copy do nothing in `make dev`. Esc with a query clears the query first (diverges; reasonable). Click-outside = blur. |
| ↑/↓ flat navigation with wrap | DONE | `App.tsx:238-250` | — |
| Enter actions per row type | DONE | `App.tsx:252-281` | — |
| Tab/→ drill into command | DONE | `App.tsx:283-321` | Tab on a non-command row isn't `preventDefault`ed (`App.tsx:294-300`), so focus leaves the input and typing stops working. |
| Drill into source | PARTIAL | `App.tsx:73-76,267-272` | Empty query shows **nothing** (`useSearch.ts:83`); spec wants the full list. The limit of 8 still applies inside the source. The Sources section still appears while drilled. No category headers. Source label is not hidden (`ResultsContainer.tsx:92-98` never passes `showSource={false}`). Esc doesn't restore the previous query (`App.tsx:219`). |
| Command detail view | PARTIAL | `CommandDetailView.tsx`; `App.tsx:66-70` | The view is a **snapshot**: an unenriched command never updates when enrichment lands (nav stack holds the old object). Top-level unenriched commands are never enriched on demand. No "Source: man page" footer. Header lives in search-bar breadcrumbs (DIVERGES, fine). Arrow keys don't scroll the selection into view (`App.tsx:133-138` only queries `listRef`, which is attached to `ResultsContainer` only). |
| Recursive subcommand drill-in | DONE (extra) | `App.tsx:303-319`, `useSubcommandDetail.ts` | — |
| "Show all X results" | **BROKEN** | `App.tsx:49,370-375`; `useSearch.ts:121-123` already slices | Clicking hides the button but shows no extra rows. Mouse-only button (`SectionHeader.tsx:24-31`), not a selectable row. |
| Copy flash ~300ms | DONE | `App.tsx:140-149`, `globals.css:96-108` | — |
| Dismiss after copy setting | DONE | `App.tsx:144-146` | Via blur (see dismiss). |
| Row anatomy | DIVERGES (deliberate) | `ShortcutRow.tsx:33-56`, `CommandRow.tsx:30-36` | Vaise layout. Unbound VS Code entries still show the key, not "unbound". |
| KeyCombo pills | PARTIAL | `KeyCombo.tsx:10-19` | Renders the raw string (`Cmd+Shift+P` as one cap). Duplicate React keys for repeated chords (`key={chord}`). |
| `>` prefix badge | DONE | `SearchInput.tsx:61-65,86-101` | — |
| `?` icon in search bar + hotkey hint | MISSING | `SearchInput.tsx:31-39` drops `onHelpToggle`; no ⌘⇧Space hint | Help only opens via the `?` key on an empty query. |
| Keyboard help overlay | DONE | `KeyboardHelp.tsx` | Content diverges from SCREENS §3 (more entries); fine. |
| Show animation 120ms | PARTIAL | `LauncherPanel.tsx:11`, `globals.css:88-90` | `.panel-enter` runs once at mount; the window is reused, so it never replays on later shows. |
| Hide animation 80ms | MISSING | `.panel-exit` defined (`globals.css:92`), never applied; `hideWindow` hides instantly (`index.ts:156-160`) | — |
| Reduced motion | DONE | `globals.css:110-119` | — |
| Reduced transparency | PARTIAL | `globals.css:121-125` | Solid bg only; text colors still assume dark. |
| Light theme | **BROKEN** | `nativeTheme.themeSource` set (`index.ts:193`), but all launcher colors are hard-coded `text-white/*` (`ShortcutRow.tsx`, `globals.css:20,58-60`) | With Theme = Light (or light system appearance) vibrancy turns light and the white text becomes unreadable. |
| ARIA roles + live region | DONE | `ResultsContainer.tsx:49-50`, rows `role="option"`, `App.tsx:417-419` | No `aria-activedescendant` on the input. |
| Error boundary | DONE | `main.tsx:12`, `ErrorBoundary.tsx` | — |
| Loading text | DIVERGES | `App.tsx:432-435` "Loading shortcuts..." | Hidden anyway in the 72px collapsed window. |

### 2.5 Tray, lifecycle, settings (SCREENS §4, SPECS §9, §11)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Tray icon + menu (Show/Hide, Preferences, Quit) | DONE | `src/main/tray.ts:18-35` | — |
| Show in Menu Bar applied | MISSING | tray always created (`index.ts:314-317`); `showMenuBar` never read in main | Toggle should create/destroy the tray. |
| Launch silently, no window | DONE | `index.ts:97` `show:false` | — |
| Startup order / IPC readiness | **BUG** | `index.ts:320-337` awaits the full commands init (cold scan + sync whatis) **before** `registerIpcHandlers` | Renderer `getSources/getAll` reject with "No handler registered" if it loads first. `useShortcuts` has no catch, so it stays "loading" until the next show. Delays hotkey readiness on a cold start. |
| Global shortcut change + revert | PARTIAL | `index.ts:242-251`; `ipc.ts:58-71` | `SETTINGS_SET` always returns success, so the prefs "already in use" error never shows. The revert calls `setSetting` inside the change listener (re-entrant second pass). |
| Defaults match spec | DIVERGES | `settings.ts:32` `launchAtLogin: true` (spec false), `:48` `commandPrefixMode: true` (spec false) | Decide; spec defaults are safer (an app that launches at login without asking is surprising). |
| `shortty --reset-settings` | MISSING | grep: none | — |
| Logging | PARTIAL | `src/main/logger.ts:3-5` | `electron-log` keeps 1 rotated file, not 3. Dev level keys on `NODE_ENV`, which Forge doesn't set. |
| Security: sandbox on | DIVERGES | `index.ts:100`, `preferences-window.ts:27` `sandbox:false` | Preload only uses `contextBridge`/`ipcRenderer` and can be sandboxed. Fuses DONE (`forge.config.ts:56-64`). |
| Privacy (no network) | DONE | grep: no fetch/http | — |

### 2.6 Preferences window (PRD Phase 7, SCREENS §5)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Window 600×500, sidebar + 4 tabs | DONE | `preferences-window.ts:15-31`, `PreferencesApp.tsx:10-77` | — |
| General: toggles, recorder, position, theme, both-off dialog | DONE | `GeneralTab.tsx:103-350` | — |
| General tab crash risk | **BUG (likely)** | `GeneralTab.tsx:122` uses `process.platform` in a contextIsolated, `nodeIntegration:false` renderer; Vite does not define `process` | `ReferenceError` takes down the default tab, which shows the ErrorBoundary. jsdom tests can't catch it (no GeneralTab test anyway). Verify with `make dev`. |
| Shortcut recorder correctness | PARTIAL | `GeneralTab.tsx:53-60` | Ctrl and ⌘ both map to `CommandOrControl`; uses `e.key` (Option/Shift produce layout-specific glyphs, e.g. ⌥⇧K → `Ò`, Italian Shift+3 → `£`). Use `e.code`. |
| Sources: list, toggle, status badge, detected path, reset | PARTIAL | `SourcesTab.tsx:13-210` | Missing: native file picker, existence ✓/✗ per path, env-var hint, validation warning, Obsidian multi-path add/remove, greyed disabled rows. The override input saves on **every keystroke** (`:111,166-173`): full re-parse plus watcher restart per character. Typing into the prefilled detected path immediately creates an override. The list never refreshes after changes (`:152-154`). `shortcutCount` only counts cheatsheet rows (`ipc.ts:38`), so tmux/zsh show none. |
| Search: weights, prefix toggle, limits | DONE | `SearchTab.tsx:81-206` | — |
| Commands: toggle + progress + status | DONE | `CommandsTab.tsx:18-117` | Polls every 3s; fine. |

### 2.7 Quality, packaging, distribution (PRD Phases 8–11, SPECS §12)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Component tests | DONE | `tests/components/*` (10 files) | — |
| Navigation state machine test | MISSING | no `App` test | Add one with the WP-D fixes. |
| Registry / engine / worker / watcher / path-resolver tests | MISSING | `tests/unit/` has none | — |
| Integration tests (PRD 9.3) | MISSING | `@playwright/test` installed, unused | SKIP-v1 beyond one smoke test; remove the dep or use it (also fixes knip). |
| Performance validation (PRD 9.4) | MISSING | — | One manual pass is enough for v1. |
| App icons | MISSING | only `src/assets/tray-iconTemplate*.png`; no `icon` in `forge.config.ts` | — |
| DMG for macOS | MISSING | `forge.config.ts:26-31` only ZIP for darwin | Add `@electron-forge/maker-dmg`. |
| Code signing + notarization | MISSING | no `osxSign`/`osxNotarize` | Needs an Apple Developer cert: human task, can't be done overnight by an agent. |
| Release CI | MISSING | no release workflow | — |
| Auto-update | SKIP-v1 | SPECS §12.4 "not blocking v1" | — |
| Windows/Linux installers | SKIP-v1 | makers exist | Secondary platforms; don't test. |

### 2.8 Keyboard layouts (non-US, e.g. Italian)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Display of layout-dependent keys | PARTIAL | `key-normalizer.ts:136-163` prints the configured character as-is | VS Code/Chrome/cheatsheet keys are US-positional (`⌘[`, `⌘\``, `⌘/`). On an Italian layout, `[` is ⌥è and `/` is ⇧7, so the displayed shortcut is not what the user presses. Proper fix needs a native keymap (e.g. `native-keymap`); SKIP-v1, document as a known limitation. |
| Global-shortcut recorder | PARTIAL | see §2.6 | Fix in WP-F (`e.code`). |

## 3. Bugs (concrete failure scenarios)

1. **Commands missing in the packaged app.** `path-scanner.ts:10`, `tmux.parser.ts:52`. Launch the packaged app from Finder or at login, and `process.env.PATH` is `/usr/bin:/bin:/usr/sbin:/sbin`. `git` from Homebrew, `docker`, `kubectl` and `node` are absent, and tmux shows as "Not detected". `make dev` from a terminal hides this.
2. **No command descriptions on macOS.** `whatis-reader.ts:7`. `whatis -w` → `illegal option -- w` → empty map → every Tier 1 command row has no description until enriched.
3. **"Show all" does nothing.** `useSearch.ts:121-123` slices before `ResultsContainer` gets the data. Click "Show all 42": the button disappears, the rows stay at 8.
4. **Prefix mode leaks commands.** `useSearch.ts:91-123`. With prefix mode on (the default), typing `git` returns git commands alongside shortcuts.
5. **Drilled source is blank.** `useSearch.ts:83`. Enter on "VS Code": empty panel until you type, then at most 8 rows plus a Sources section.
6. **Command detail never fills in.** `App.tsx:67`. Tab into an unenriched command: "— Enriching..." forever, even after the batch lands. Must back out and re-enter.
7. **Detail view selection scrolls off-screen.** `App.tsx:133-138`. ↓ past the visible flags moves the highlight out of view.
8. **Light theme unreadable.** Hard-coded white text. Theme = Light or light macOS: white on light vibrancy.
9. **Show animation only once; no hide animation.** `LauncherPanel.tsx:11`, `index.ts:156-160`.
10. **Menu-bar toggle ignored.** `index.ts:314`. Uncheck "Show in Menu Bar": the icon stays. The both-off safety dialog therefore guards nothing.
11. **Override reset doesn't reset.** `registry.ts:130-137`. Set an override, press Reset: the parser keeps reading the override path until restart. Changing to a valid path also doesn't parse, because `detected` is stale (`registry.ts:191`).
12. **Per-keystroke re-parse.** `SourcesTab.tsx:111`. Typing a 40-char path triggers 40 `parseAll()` runs and 40 watcher restarts, and an override is created from the first keystroke.
13. **New config files are never picked up.** `watcher.ts:35`, parsers' `getWatchPaths` filter `existsSync`. Install Ghostty and create a config: nothing until restart.
14. **tmux defaults vanish with any custom bind.** `tmux.parser.ts:66`.
15. **Overrides duplicate defaults (Ghostty) and unbinds don't unbind (VS Code).** `ghostty.parser.ts:51` vs `ghostty.json` ids; `vscode.parser.ts:41`.
16. **Blocklist bypass on subcommand drill-in.** `help-parser.ts:168-181`. `security` → Tab on a subcommand → spawns `security <sub> --help`.
17. **IPC race on cold start.** `index.ts:320-337`. The renderer loads before handlers exist, `getSources` rejects unhandled (`useShortcuts.ts:17-26`), and the panel's first data load is lost.
18. **PATH change discards enrichment.** `engine.ts:40-69`. Install one Homebrew formula and the next launch re-enriches all ~4k commands.
19. **Source match isn't fuzzy.** `useSearch.ts:113`. "vsc" or "vscode" doesn't surface VS Code.
20. **Tab steals focus.** `App.tsx:294-300`. Tab on a shortcut row moves focus out of the input and keystrokes go nowhere.
21. **Global-shortcut error never surfaces.** `ipc.ts:61-63` always `success:true`; the revert happens asynchronously in `index.ts:246-251`.
22. **Likely Preferences crash.** `GeneralTab.tsx:122` `process.platform` in an isolated renderer.
23. **Startup blocks the main thread.** Sync `execSync` calls in `whatis-reader.ts:7` (10s timeout) and `tmux.parser.ts:52,74,…`, plus sync cache writes. Delays hotkey registration and window readiness.
24. **knip fails, so `make precommit` fails.** `package.json:38`.
25. Minor: unsanitized cache filename from subcommand names (`cache.ts:82-84`); duplicate React keys (`KeyCombo.tsx:15`, vscode `quickOpen`); the stopped worker still emits its last batch (`enrichment-worker.ts:61-63`); spawned `--help` is killed with SIGTERM, not SIGKILL (`help-parser.ts:38-42`).

## 4. Finish-v1 work packages (prioritized)

Each package lists its files. Packages touch disjoint files except where marked *append-only*, i.e. new entries only. Merge those in order A → B → F, or have A add the channels up front.

### P0 — ship blockers

**WP-A Main lifecycle and environment.** Files: `src/main/index.ts`, `src/main/tray.ts`, `src/main/utils/shell-env.ts` (new), `src/shared/settings.ts`, `src/shared/ipc-channels.ts`, `src/preload/preload.ts`, `src/main/logger.ts`.
- At startup, import PATH from the login shell (`$SHELL -ilc 'printf %s "$PATH"'`, 2s timeout, async) before the engine and parsers run.
- Call `registerIpcHandlers` before any await. Don't await the commands init before parsers.
- Create or destroy the tray from `showMenuBar` (at startup and on change).
- Add `--reset-settings` (clear the store, log, quit).
- Add a `window:hide` IPC; hide plays the 80ms exit: send `window:will-hide`, then hide after 80ms (0 under reduced motion).
- Use the cursor's display for every window position.
- Call `commandsEngine.checkAndRefresh()` and `worker.pause()` on show, `resume()` on hide (the API comes from WP-C).
- Make shortcut registration failures return an error through `SETTINGS_SET`.
- Spec defaults: `launchAtLogin:false`, `commandPrefixMode:false` (confirm with owner).
- `sandbox:true` for both windows.
- Done when `env -i PATH=/usr/bin:/bin open out/.../Shortty.app` lists Homebrew commands, the tray hides when unchecked, `shortty --reset-settings` restores defaults, and the first panel open after a cold start shows data. Add unit tests for `shell-env` parsing.

**WP-B Shortcut engine correctness.** Files: `src/main/parsers/registry.ts`, `src/main/watcher.ts`, `src/main/utils/path-resolver.ts`, `src/main/shortcuts/merge.ts`, `src/main/parsers/{ghostty,vscode,tmux,zsh}.parser.ts`, `src/main/parsers/base-parser.ts`, `src/cheatsheets/sources/{ghostty,vscode}.json`, `src/main/ipc.ts` (*append-only*: `shortcutCount` from cache, `pathExists[]`), `tests/unit/{registry,path-resolver,cheatsheets/sources}.test.ts`.
- Normalize cheatsheet keys with `formatKeyCombo` in `convertCheatsheetToShortcuts`.
- Align ids: Ghostty parser emits `ghostty.<action>`; VS Code `-cmd` marks the matching default `isUnbound`.
- Dedupe vscode `quickOpen`.
- tmux: always merge `list-keys` defaults with config binds.
- zsh: add `bindkey -L` defaults (optional).
- Ghostty darwin path: add `~/.config/ghostty/config`.
- Resolver: `$XDG_CONFIG_HOME` falls back to `~/.config`.
- `updateActiveParsers`: restore default paths when an override is removed, recompute `detected`.
- Watcher: pass all candidate paths (including missing ones) and handle `add`/`unlink`, re-detecting on `add`.
- Validate every shipped cheatsheet against `schema.json` in a test (use `ajv` as a devDependency, or compare against the hand validator).
- Make tmux `execSync` calls async.
- Done when new tests cover each bug above (#11, 13, 14, 15) and pass; a Ghostty override replaces the default (one row); creating `~/.config/ghostty/config` while running shows its binds within 1s.

**WP-C Commands engine.** Files: `src/main/commands/{whatis-reader,engine,enrichment-worker,cache}.ts`, `src/main/commands/parsers/help-parser.ts`, `tests/unit/commands/*`.
- whatis: try `whatis -w '*'`, fall back to `apropos .`, async via `execFile`.
- `parseSubcommandHelp`: apply blocklist (on the base name) and the owner check.
- Worker: `pause()`/`resume()`, spawn concurrency 1 (file/man reads may stay parallel); after `stop()` emit nothing.
- PATH change becomes an incremental update: keep enriched entries whose `bin` + `mtime` match, add new ones, drop missing ones, and call `reconcileWithDetails()` after any scan.
- Sanitize cache filenames.
- `--help` timeout kill uses SIGKILL.
- Done when the whatis test covers apropos output and the macOS `-w` failure; the worker test shows pause halts progress and that a spawn count above 1 never happens; the engine test shows that adding one PATH dir keeps prior `enrichment:'full'` entries.

**WP-D Launcher search and navigation.** Files: `src/renderer/App.tsx`, `src/renderer/hooks/{useSearch,useShortcuts,useCommands}.ts`, `src/renderer/components/{ResultsContainer,SectionHeader,ShortcutRow,SourceRow,CommandRow}.tsx`, `tests/unit/hooks/useSearch.test.ts`, `tests/components/App.test.tsx` (new).
- `useSearch` returns full arrays; slice in `ResultsContainer` unless that section is expanded.
- "Show all" becomes a keyboard-selectable row (Enter expands) included in the index math.
- Prefix mode: no `>` means shortcuts only.
- Fuzzy, space-insensitive source match.
- Drilled source: empty query lists every entry grouped by `category` headers, no limit, no Sources section, `showSource={false}`; Esc restores the pre-drill query (store it in the stack entry).
- Detail level stores the command *name* and reads the live object from `commands`. On entering an unenriched command, request detail (reuse `getCommandDetail`).
- Scroll-into-view in the detail view (shared ref or `data-index` lookup on the panel).
- `preventDefault` Tab always.
- Dismiss through the WP-A `hideWindow()` IPC (fallback `window.blur`).
- Stop refetching on every show; rely on `onUpdate` pushes plus one initial load with a retry/catch.
- Done when an `App` test covers flat → source (full list, categories) → Esc (query restored), command → Tab → detail updates on a pushed enrichment, Show all expands via Enter, and prefix mode. Existing tests stay green.

**WP-E Launcher visuals.** Files: `src/renderer/components/{LauncherPanel,SearchInput,KeyCombo,KeyboardHelp,CommandDetailView}.tsx`, `src/renderer/styles/globals.css`, matching `tests/components/*`.
- Replay `.panel-enter` on each `window:shown` (key bump or class toggle); apply `.panel-exit` on `window:will-hide` (from WP-A).
- Theme tokens (CSS vars) with `prefers-color-scheme` light/dark; replace `text-white/*`.
- `?` icon button and a right-aligned hotkey hint in the search bar (read `globalShortcut` from settings).
- KeyCombo: split chords into per-key caps, index-based keys, and an "unbound" state when `isUnbound`.
- Detail footer "Source: man page / --help" from `enrichedFrom`.
- Done when component tests assert the animation class re-applies on a shown event, the `?` button toggles help, the unbound cap shows, and the footer text shows. A manual check in light and dark appearance is readable.

**WP-F Preferences.** Files: `src/renderer/preferences/**`, `src/main/preferences-window.ts`, *append-only* `src/shared/ipc-channels.ts`, `src/preload/preload.ts`, `src/main/ipc.ts` (`dialog:pickPath`).
- Replace `process.platform` with `navigator.userAgent.includes('Mac')` or a preload-exposed `platform`.
- Recorder: use `e.code`, keep Ctrl and ⌘ distinct, surface the registration error.
- Override input: local state, commit on blur/Enter, then refetch `getAllSources`.
- Add Browse (native `dialog.showOpenDialog`), ✓/✗ existence per path, env-var hint, "path doesn't exist" warning, greyed disabled rows.
- Obsidian multi-path list (add/remove). This is optional; SKIP if time is short.
- Done when a new `GeneralTab`/`SourcesTab` test renders without `process`, typing a path calls `setSetting` once on blur, and Reset clears the override. Manual: the Preferences window opens on General without the error boundary in `make dev`.

### P1 — release plumbing

**WP-G Packaging.** Files: `forge.config.ts`, `package.json`, `src/assets/icon.*` (new), `.github/workflows/release.yml` (new), `docs/runbooks/release.md` (new).
- App icons; `@electron-forge/maker-dmg`.
- Signing/notarization config read from env (`APPLE_ID`, `APPLE_TEAM_ID`, keychain profile). The certificate itself is a human task.
- Tag-triggered release workflow that uploads the DMG.
- Remove `@playwright/test` or add one smoke test so `make knip` passes.
- Done when `make make` produces a DMG, `make precommit` passes, and the runbook documents the release steps.

**WP-H Docs alignment.** Files: `AGENTS.md`, `SPECS.md`, `SCREENS.md`, `PRD.md` (consider moving them under `docs/` per repo standard), `README.md` links.
- AGENTS.md is stale: `Keybinding` type, "7 parsers", 680×500, channel list.
- Record the deliberate divergences: collapsible 750px window, Vaise row layout, on-demand subcommand drill-in, Esc clears query first, 8-way enrichment.
- Tick PRD items per this report.
- Known limitations: non-US layout display, Windows/Linux untested.
- Done when no doc contradicts the code on window size, row layout, parsers count, or IPC channels.

### Not worth doing for v1

- zsh/bash completion enrichment.
- Expanded subcommand index (replaced by drill-in).
- Win32 `--help`-only path; Windows/Linux installer testing.
- Auto-update (`electron-updater`).
- Homebrew cask; Mac App Store.
- IPC channel rename `keybindings:*` → `shortcuts:*`.
- Separate search-coordinator modules.
- Formal perf benchmarks beyond one manual pass.
- vim cheatsheet ↔ `.vimrc` merge (maps are additive).
- `minVersion` filtering.
- Layout-aware key display via a native keymap.
- Full Playwright integration suite.
