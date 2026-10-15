# AGENTS.md

Practical instructions for AI coding agents working in this repository (`CLAUDE.md` is a symlink to this file). The documentation lives in [docs/](docs/README.md); this file links to it rather than repeating it.

Shortty is an Electron app (React 19 + TypeScript + Tailwind CSS 4) that puts the keyboard shortcuts of your tools and the CLI commands on your PATH in one Spotlight-style launcher, opened with `Cmd+Shift+Space`. macOS first.

## Commands

All commands go through the Makefile. Always use `make` targets, not `npm` directly.

```bash
make install             # Install dependencies (npm ci)
make dev                 # Start the app with HMR (electron-forge start)
make check               # lint + test: what CI's required `check` job gates on
make precommit           # lint + typecheck + test + knip (the git pre-commit hook; never bypass it)
make lint                # eslint
make typecheck           # tsc --noEmit
make test                # vitest run (unit + component)
make knip                # unused files, deps and exports
make e2e                 # build, then run the Playwright e2e suite on the real app (slow, local macOS, not in check)
make e2e-benchmark       # build, then write timings/screenshots to docs/wip/benchmark (LABEL=baseline)
make package             # package the app
make make                # build distributables (DMG + ZIP on macOS)
make setup-hooks         # install the pre-commit hook
make help                # list targets
```

A single test file: `npx vitest run tests/unit/parsers/vscode.test.ts`.

## Architecture

Full design: [docs/spec.md](docs/spec.md) (decisions in §15), screens: [docs/screens.md](docs/screens.md).

```
Main process (src/main)                          Renderer (src/renderer)
┌───────────────────────────────────────┐        ┌───────────────────────────┐
│ index.ts  lifecycle, single instance, │        │ App.tsx  navigation stack │
│           --reset-settings, window    │  IPC   │  ├─ useShortcuts          │
│ shell-env.ts  login-shell PATH import │◄──────►│  ├─ useCommands           │
│ ipc.ts, tray.ts, preferences-window.ts│        │  ├─ useSearch (2× Fuse)   │
│ Shortcuts engine                      │        │  └─ components/           │
│  ├─ cheatsheets/loader.ts (bundled)   │        │ preferences/ (2nd window) │
│  ├─ parsers/registry.ts (9 parsers)   │        └───────────────────────────┘
│  ├─ shortcuts/merge.ts                │          contextBridge
│  └─ watcher.ts (chokidar)             │          (src/preload/preload.ts)
│ Commands engine (commands/)           │
│  ├─ path-scanner, whatis-reader       │
│  ├─ enrichment-worker, cache          │
│  └─ sandbox-exec (--help sandbox)     │
└───────────────────────────────────────┘
```

- Cheatsheets: `src/cheatsheets/sources/*.json`, bundled with `import.meta.glob` in `src/main/cheatsheets/loader.ts`; schema `src/cheatsheets/schema.json`, enforced by `tests/unit/cheatsheets/shipped.test.ts`.
- Adding a parser: create `src/main/parsers/<name>.parser.ts` extending `BaseParser` (`meta`, `isAvailable()`, `getWatchPaths()`, `parse()`), add it to `PARSERS` in `registry.ts`, add a cheatsheet with `"parser": "<name>"`, a fixture in `fixtures/` and a test.
- Parser output is merged onto the cheatsheet defaults per the cheatsheet's `mergeMode` (`additive` or `replace`): [docs/spec.md §6.2](docs/spec.md#62-parser-system).
- IPC channel names: `src/shared/ipc-channels.ts` (`keybindings:*`, `commands:*`, `settings:*`, `window:*`, `prefs:*`); the renderer calls them through `window.electronAPI` (typed in the preload).
- Shared types: `src/shared/types.ts` (`Shortcut`, `Command`, `SubcommandDetail`, `ParserMeta`), keys in `src/shared/keys.ts`, settings and defaults in `src/shared/settings.ts`. Path alias `@shared/*` → `src/shared/*`.
- Keys are structured `strokes` resolved per keyboard layout in the renderer: read [docs/keyboard-layouts.md](docs/keyboard-layouts.md) before touching key display, search or copy.
- Window geometry (750px wide, 72px collapsed, up to 580px): `src/main/window-geometry.ts` and `App.tsx`. Frameless, vibrancy `under-window`, always on top, hidden from the Dock (`LSUIElement`).

## Testing

- Vitest with globals, jsdom, setup in `tests/setup.ts`. Layout: `tests/unit/<area>/` (parsers, commands, cheatsheets, hooks, main, shortcuts, utils, …), `tests/components/` (React Testing Library, incl. `preferences/`), `tests/e2e/*.spec.ts` (Playwright, not run by Vitest).
- Parser tests point `getConfigPaths()` at `fixtures/`. Commands parser tests are golden tests on real captured `--help`/`man` output in `fixtures/commands/<cmd>/` with expectations in `fixtures/commands/expected.json`.
- Layout tests use the fake layout maps in `src/renderer/lib/keyboard-layouts.data.ts`.
- E2E: how to run and write them is in [docs/runbooks/run-e2e-tests.md](docs/runbooks/run-e2e-tests.md).

## Gotchas

- Never run the app or a test against the real `~/Library`, `~/.config` or the developer's settings. E2E runs in hermetic mode (`SHORTTY_E2E=1` + `SHORTTY_E2E_DIR`, `src/main/e2e.ts`): fake `HOME`, `PATH`, `TMPDIR` and `userData`; keep it that way in new specs.
- The launcher hides on blur: during `make e2e` nothing else may take focus. Runs are serialized machine-wide with `lockf` on `/tmp/shortty-e2e.lock`, so parallel worktrees wait instead of failing.
- `make e2e` builds with `npm run package` and launches the Electron binary from `node_modules`, not the packaged app (its fuses block the debugger Playwright needs).
- The packaged app ships only `.vite/`, no `node_modules`: never mark a runtime dependency `external` in `vite.main.config.ts`. E2E would still pass (it resolves from the repo's `node_modules`) while the installed app crashes with `Cannot find module`.
- Dismissal goes through main (`hideWindow` IPC, exit animation, `window-hider.ts`); blur-to-hide is disabled in `make dev`.
- Changing a commands parser (`src/main/commands/parsers/`) in a way that alters its output: bump `CACHE_VERSION` in `src/main/commands/cache.ts`, or users keep the old cached results.
- Probed binaries must go through `runSandboxed` (`src/main/commands/sandbox-exec.ts`): env allowlist, timeout, blocklist. Never spawn a user binary another way.
- The single-instance lock is per `userData` dir: `make dev` shares it with an installed Shortty, so quit the running app first or the dev instance exits immediately. E2E runs use their own dir and are unaffected.
- Colours come from the light/dark tokens in `src/renderer/styles/globals.css` (launcher) and `src/renderer/preferences/styles/preferences.css`; don't hard-code white or black.

## Docs

Index: [docs/README.md](docs/README.md). Runbooks: [run e2e tests](docs/runbooks/run-e2e-tests.md), [release macOS](docs/runbooks/release-macos.md), [reset settings](docs/runbooks/reset-settings.md). v1 status: [docs/wip/v1-status.md](docs/wip/v1-status.md). Update the matching doc in the same change as the behaviour.

## Workflow

Changes land on `main` only through a squash-merged PR with a Conventional Commit title; the required status check is the aggregate CI job `check` (`.github/workflows/ci.yml`, which also runs gitleaks). Repo conventions: [GitHub standard](https://github.com/giocaizzi/.github/blob/main/docs/standard.md).
