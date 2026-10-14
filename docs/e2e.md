# End-to-end tests (runbook)

The e2e suite launches the **real built app** with Playwright's `_electron`
API and drives it with the keyboard, the way a user does. Specs live in
`tests/e2e/`, config in `playwright.config.ts`. Vitest never picks them up
(`vitest.config.ts` excludes `tests/e2e/**`).

## Run

```bash
make e2e                          # build, then run every spec (~40 s on Apple silicon)
make e2e-benchmark LABEL=baseline # build, then write docs/wip/benchmark/<LABEL>-*
```

Single spec or test, after a build (`make package`):

```bash
npx playwright test tests/e2e/commands.spec.ts
npx playwright test -g "drills into the command detail view"
```

`make e2e` is deliberately **not** part of `make check` / `make precommit`
(it is slow and needs a desktop session). It runs on a local macOS machine; the
window shows briefly for each test. Do not click elsewhere while it runs: the
launcher hides on blur.

## Build used by the tests

`make e2e` runs `npm run package` (`electron-forge package`, a few seconds).
Its Vite step writes the main bundle to `.vite/build/index.cjs` (the
`package.json` `main`), the preload to `.vite/build/preload.cjs` and the
renderers to `.vite/renderer/<name>/`. The tests then start the Electron
binary from `node_modules` on the repo root, so `main` is used and
`MAIN_WINDOW_VITE_DEV_SERVER_URL` is undefined (production file loading).

The packaged app in `out/` is **not** launched: its fuses disable
`--inspect`/`--remote-debugging-port`, which Playwright needs to attach.

## Hermetic mode

Each test gets a fresh temp dir (`$TMPDIR/shortty-e2e-*`, removed afterwards)
and the app is launched with only these environment variables:

| Variable | Value | Effect |
|---|---|---|
| `SHORTTY_E2E` | `1` | Turns on the test hook in `src/main/e2e.ts` |
| `SHORTTY_E2E_DIR` | temp dir | Electron `userData`, `sessionData` and `logs` go under it: settings (`config.json`), commands cache |
| `HOME` | `<dir>/home` | All `~/...` config paths resolve into a fake home seeded from `fixtures/`; electron-log writes there too |
| `PATH` | `<dir>/bin` | The commands engine only sees three fake executables (`gizmo`, `gizmo-lite`, `widgetctl`) whose `--help` output is fixed |
| `TMPDIR` | `<dir>/tmp` | Sandbox dirs of the `--help` enricher stay inside the run |

The fake home gets the fixtures at the macOS default paths the cheatsheets
declare (VS Code `keybindings.json`, Ghostty config, Chrome `Preferences`,
`.zshrc`, `.vimrc`, `.bashrc`, `.inputrc`, an Obsidian vault). `config.json` is
pre-seeded with `launchAtLogin: false`. No real config, `~/Library` file,
`man`/`whatis` database or developer binary is read.

What the hook (`src/main/e2e.ts`) does when `SHORTTY_E2E=1`, and nothing else:

- redirects `userData`, `sessionData` and `logs` into `SHORTTY_E2E_DIR`
  (imported first in `src/main/index.ts`, before `settings-store` creates its
  store);
- skips the login-item and global-shortcut registration, so a run never grabs
  `Cmd+Shift+Space` from a running Shortty;
- exposes `globalThis.__shorttyE2E` (`show`, `hide`, `toggle`,
  `openPreferences`) to `electronApp.evaluate()` once startup finished; its
  presence is the "app ready" signal.

Security settings (`contextIsolation`, `nodeIntegration: false`, fuses) are
unchanged. The only shared OS resource touched is the clipboard; the fixture
saves it before a test and restores it after.

| Variable (test runner) | Effect |
|---|---|
| `SHORTTY_E2E_FIXME=1` | Run tests marked as known bugs instead of reporting them as fixme (to check a fix) |
| `SHORTTY_E2E_KEEP=1` | Keep each test's temp dir for inspection |
| `SHORTTY_E2E_BENCHMARK=<label>` | Enable `benchmark.spec.ts` (set by `make e2e-benchmark`) |

## Writing tests

- Use the `shortty` fixture from `tests/e2e/fixtures.ts`; it launches, waits
  for ready and cleans up. `shortty.show()` opens the panel (the global hotkey
  is not registered in e2e mode).
- Prefer roles and the row test ids: `source-row`, `shortcut-row`,
  `command-row`, `subcommand-row`, `flag-row`.
- Behaviour that is broken or diverges from `SPECS.md`/`SCREENS.md`: write the
  test for the expected behaviour and start it with
  `knownBug('<one-line reason>')` (a `test.fixme`). Remove the call when fixed;
  `SHORTTY_E2E_FIXME=1 make e2e` shows which ones pass already.
- Layout-dependent keys: `pressLayoutKey()` dispatches a key through CDP with a
  separate `key` and physical `code` (e.g. Italian `?` = Shift + `Minus`).
- Commands tests call `waitForEnrichment()` first: the detail view snapshots
  the command when you drill in.

## Troubleshooting

- `.vite/build/index.cjs missing`: run `make e2e` (or `make package`) first.
- A test fails on `show()`/visibility: something stole focus (the panel hides
  on blur). Re-run without touching the machine.
- Logs of a failed run: `SHORTTY_E2E_KEEP=1`, then read
  `$TMPDIR/shortty-e2e-*/home/Library/Logs/Shortty/main.log`.
