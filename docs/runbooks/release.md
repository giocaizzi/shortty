# Release

**When:** shipping a new Shortty version (macOS DMG/ZIP and Windows installer/ZIP on a GitHub Release), or getting test installers without releasing.
**Preconditions:** the release-please GitHub App is installed on `giocaizzi/shortty` and the repo has the secrets `RP_APP_ID` and `RP_APP_KEY` (same app as the other `giocaizzi` repos); changes land on `main` as Conventional Commits.

Releases are automated by `.github/workflows/release.yml`. Code signing is not set up: macOS Gatekeeper and Windows SmartScreen warn on first launch (macOS signing: [release-macos.md](release-macos.md), issue #49).

## Cut a release

1. Merge feature and fix PRs to `main`. On every push, release-please updates one open PR titled `chore(release): X.Y.Z` with the version bump (`package.json`, `.release-please-manifest.json`) and `CHANGELOG.md`. `feat` bumps the minor version, `fix` the patch, `BREAKING CHANGE:` the major (minor while 0.x).
2. Review the Release PR's changelog, then merge it (auto-merge once CI passes).
3. The merge tags `vX.Y.Z` and creates the GitHub Release. The `Build (macOS)` and `Build (Windows)` jobs then run `make make` and attach:

| File | What |
|---|---|
| `Shortty-macOS-arm64.dmg` | macOS installer (Apple silicon) |
| `Shortty-macOS-arm64.zip` | macOS app, zipped |
| `Shortty-Windows-x64-Setup.exe` | Windows installer (Squirrel, per-user, no admin) |
| `Shortty-Windows-x64.zip` | Windows portable app |

The names carry no version, so `https://github.com/giocaizzi/shortty/releases/latest/download/<file>` always serves the newest release (the README download badges link there).

4. Check: `gh release view vX.Y.Z` lists the four files; download one and launch it.

## Test installers without releasing

Actions → Release → Run workflow (or `gh workflow run release.yml --ref <branch>`). Only the build jobs run; download the installers from the run's artifacts (`gh run download <run-id>`).

## Rollback

Delete the release and its tag: `gh release delete vX.Y.Z --cleanup-tag`. Then fix forward on `main`; release-please opens the next Release PR. If the manifest was bumped, the next release keeps counting from it (never reuse a version). Users who installed it keep it: there is no auto-update channel to retract.

## What a human must provide

- The release-please GitHub App installed on this repo, and its ID and private key as the repo secrets `RP_APP_ID` / `RP_APP_KEY` (`gh secret set RP_APP_ID -R giocaizzi/shortty`, and `gh secret set RP_APP_KEY -R giocaizzi/shortty < key.pem` from wherever the key is stored; never paste it in chat).
- For signed builds later: an Apple Developer ID (see release-macos.md) and a Windows code-signing certificate.

**Last verified:** 2026-10-15, workflow written and linted with actionlint; first real run pending.
