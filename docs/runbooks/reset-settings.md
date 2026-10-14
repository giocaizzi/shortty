# Reset settings

**When:** Shortty is unreachable, for example after turning off both
"Show in Dock" and "Show in Menu Bar" and forgetting or breaking the global
shortcut ([spec §9.1](../spec.md#91-app-settings), visibility safety). Not for
clearing the commands cache or logs: this resets settings only.
**Preconditions:** a shell on the machine; Shortty installed
(`/Applications/Shortty.app`) or built with `make package` for development.

## Steps

1. Quit the running instance: `pkill -x Shortty` (macOS) or end the
   `shortty` process. While it runs, `--reset-settings` refuses, logs
   `Shortty is running; quit it first` and exits with code 1 (one instance
   per user, enforced with Electron's single-instance lock).
2. Run the binary with the flag:

   ```bash
   /Applications/Shortty.app/Contents/MacOS/shortty --reset-settings
   ```

   During development, after `make package`: `npx electron . --reset-settings`.
3. The process restores every setting to its default
   (`src/shared/settings.ts`, `DEFAULT_SETTINGS`), logs
   `Settings reset to defaults (--reset-settings)` and exits with code 0. It
   opens no window.
4. Start Shortty normally.

A hand-edited `config.json` with an invalid value does not need this: at
startup every invalid key falls back to its default (object settings field by
field) and the log says `Invalid settings reset to defaults: <keys>`
(`src/main/settings-validation.ts`).

The commands cache and logs are not touched. Settings live in
`config.json` under the app's `userData` directory
(`~/Library/Application Support/Shortty/` on macOS).

## Verify

- Step 2 exits with code 0 (`echo $?` prints `0`).
- After step 4 the menu-bar icon is back and `⌘⇧Space` opens the launcher.

Covered by the e2e tests "`shortty --reset-settings` restores the defaults and
quits" and "`--reset-settings` refuses to run while Shortty is running"
(`tests/e2e/lifecycle.spec.ts`).

## Rollback

Irreversible: the previous `config.json` is overwritten with the defaults
(disabled sources, path overrides, search weights, global shortcut). Re-enter
custom settings in Preferences; if you need the old values, copy
`config.json` aside before step 2.

**Last verified:** 2026-10-14 by the feat/finish-v1 docs pass (steps read against `src/main/index.ts` and `tests/e2e/lifecycle.spec.ts`; not re-run against an installed app)
