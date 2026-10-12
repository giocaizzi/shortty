# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands go through the Makefile. Always use `make` targets, not `npm` directly.

```bash
make install             # Install dependencies (npm ci)
make dev                 # Start dev server with HMR (electron-forge start)
make test                # Run all unit tests once (vitest run)
make lint                # Lint TypeScript/TSX files (eslint)
make typecheck           # Type-check without emitting (tsc --noEmit)
make package             # Package the app
make make                # Generate platform-specific installers
make knip                # Find unused files, deps, and exports (knip)
make precommit           # Run lint + typecheck + test + knip (used by git pre-commit hook)
make setup-hooks         # Install git pre-commit hook
make check               # Run lint + test (what CI's required `check` job gates on)
make help                # List targets
```

To run a single test file:
```bash
npx vitest run tests/unit/parsers/vscode.test.ts
```

## Architecture

Shortty is an Electron app (React 19 + TypeScript + Tailwind CSS 4) that aggregates keybindings from multiple applications into a Spotlight-style floating launcher, activated via `Cmd+Shift+Space`.

### Process Boundaries

```
Main Process (Node.js)          Renderer Process (React)
┌──────────────────────┐        ┌──────────────────────┐
│ index.ts             │        │ App.tsx               │
│  ├─ Window mgmt      │  IPC   │  ├─ useKeybindings   │
│  ├─ Global shortcut  │◄──────►│  ├─ useSearch (Fuse) │
│  ├─ ipc.ts handlers  │        │  └─ Components       │
│  ├─ ParserRegistry   │        └──────────────────────┘
│  │   └─ 7 parsers    │            contextBridge
│  └─ FileWatcher      │          (preload/preload.ts)
└──────────────────────┘
```

### Parser System

All parsers extend `BaseParser` and implement `ParserPlugin` (`src/main/parsers/types.ts`). The `ParserRegistry` discovers available parsers at startup, caches results, and re-parses on file changes detected by chokidar.

Parsers: VS Code (JSONC), Ghostty, tmux (bind-key + `tmux list-keys`), Zsh (bindkey), Obsidian (vault hotkeys.json), Chrome (extensions.commands), macOS System (binary plist).

Adding a parser: create `src/main/parsers/<name>.parser.ts` extending `BaseParser`, implement `meta`, `isAvailable()`, `getWatchPaths()`, `parse()`, then register in `ParserRegistry`.

### IPC Channels

Defined in `src/shared/ipc-channels.ts`. Renderer calls main via `window.electronAPI` (typed in preload). Channels: `getSources`, `getAll`, `getBySource`, `refresh`, `onUpdate`.

### Shared Types

`src/shared/types.ts` — `Keybinding` (id, source, key, command, rawCommand, context, isDefault, isUnbound, filePath) and `ParserMeta`. Path alias `@shared/*` maps to `src/shared/*`.

### Data Flow

Startup → ParserRegistry discovers & parses → cache → chokidar watches config paths. On activation: renderer fetches via IPC → Fuse.js search (weighted: key 0.4, command 0.4, source 0.1, context 0.1, threshold 0.35) → display. File changes trigger re-parse → IPC push → live UI update.

## Testing

- Vitest with globals enabled, jsdom environment, setup via `tests/setup.ts` (`@testing-library/jest-dom`)
- Parser tests mock `getConfigPaths()` to point at `fixtures/` directory
- Component tests use `@testing-library/react`
- Test files: `tests/unit/parsers/*.test.ts`, `tests/components/*.test.tsx`

## Window Configuration

680x500, frameless, transparent background, `vibrancy: 'under-window'` (macOS glass), always-on-top, hidden from dock (`LSUIElement: true`). Defined in `src/main/index.ts`.

## Workflow

Changes land on `main` only through a squash-merged PR with a Conventional Commit title; the required status check is the aggregate CI job `check` (`.github/workflows/ci.yml`, which also runs gitleaks). Repo conventions: [GitHub standard](https://github.com/giocaizzi/.github/blob/main/docs/standard.md).
