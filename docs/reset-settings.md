# Reset settings (runbook)

Use this when Shortty is unreachable, for example after turning off both
"Show in Dock" and "Show in Menu Bar" and forgetting or breaking the global
shortcut (SPECS §9.1, visibility safety).

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
4. Start Shortty normally. The menu-bar icon is back and the shortcut is
   `⌘⇧Space`.

The commands cache and logs are not touched. Settings live in
`config.json` under the app's `userData` directory
(`~/Library/Application Support/Shortty/` on macOS).

Covered by the e2e test "`shortty --reset-settings` restores the defaults and
quits" (`tests/e2e/lifecycle.spec.ts`).
