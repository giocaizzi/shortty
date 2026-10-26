# Run unit tests

**When:** before every commit (the pre-commit hook runs `make precommit`) and
whenever a Vitest test fails locally but not in CI, or the other way round.
For the Playwright suite see [run-e2e-tests.md](run-e2e-tests.md).
**Preconditions:** `make install` done. The first run needs network access:
it downloads the Electron binary (see below).

Vitest runs the unit and component tests in `tests/` (config in
`vitest.config.ts`, per-test setup in `tests/setup.ts`, one-off setup in
`tests/global-setup.ts`).

## Steps

```bash
make test                                         # the whole suite
make check                                        # lint + test, what CI's `check` gates on
make precommit                                    # lint + typecheck + test + knip, the pre-commit hook
npx vitest run tests/unit/parsers/vscode.test.ts  # one file
npx vitest run -t "kills a command that hangs"    # tests matching a name
```

## Verify

The run ends with `Test Files  N passed` and exits 0.

## Troubleshooting

- **"Electron failed to install correctly" in a fresh checkout.** npm 11 holds
  install scripts for approval, so `npm ci` leaves Electron without its binary
  and the first `require('electron')` downloads it. `tests/global-setup.ts`
  does that once before the workers start; if it fails (offline, interrupted
  download), delete `node_modules/electron` and run `make install` again.
- **Real-process tests fail only when the machine is busy.** Tests that spawn
  fake shells (`sandbox-exec`, `shell-env`, `shell-defaults`, `tmux`) must not
  run under the production limits (2 s per `--help` probe, 3 s for the login
  shell): a loaded host can take longer than that just to start `sh`. They pass
  `SLOW_HOST_MS` from `tests/helpers.ts`; only a test about the timeout itself
  passes a short one, and it asserts that the hang was cut long before it would
  end, not a tight wall-clock bound.
- **A test sees calls or writes from an earlier test.** Stop anything with a
  real timer (an engine's debounced save, a watcher) after the test, as
  `tests/unit/commands/engine.test.ts` does, or a slow run lets it fire inside
  the next test.

## Rollback

Nothing to undo: tests only write to temporary directories.

**Last verified:** 2026-10-26 by an agent run of `make precommit`
