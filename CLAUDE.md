# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                # Start dev server with HMR (electron-forge start)
npm test                 # Run all unit tests once (vitest run)
npm run test:watch       # Run tests in watch mode
npm run lint             # Lint TypeScript/TSX files (eslint --ext .ts,.tsx .)
npm run package          # Package the app
npm run make             # Generate platform-specific installers
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
