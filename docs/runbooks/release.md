# Release

**When:** shipping a new Shortty version (macOS DMG/ZIP, Windows installer/ZIP, Linux deb/rpm on a GitHub Release), or getting test installers without releasing.
**Preconditions:** the release-please GitHub App is installed on `giocaizzi/shortty` and the repo has the secrets `RP_APP_ID` and `RP_APP_KEY` (same app as the other `giocaizzi` repos); changes land on `main` as Conventional Commits.

Releases are automated by `.github/workflows/release.yml`. macOS builds are signed with the Developer ID and notarized when the `release` environment holds the Apple secrets (below); otherwise they build unsigned with a warning. Windows builds are unsigned (SmartScreen warns on first launch). Installed apps update themselves: Windows and signed macOS through update.electronjs.org, Linux and unsigned macOS by notifying that a new version is out.

## Cut a release

1. Merge feature and fix PRs to `main`. On every push, release-please updates one open PR titled `chore(release): X.Y.Z` with the version bump (`package.json`, `.release-please-manifest.json`) and `CHANGELOG.md`. `feat` bumps the minor version, `fix` the patch, `BREAKING CHANGE:` the major (minor while 0.x). To pick the version yourself, end the PR description with a `Release-As: X.Y.Z` line: it must be in the last block of footers (with `Co-Authored-By:`), with nothing after it, or release-please ignores it.
2. Review the Release PR's changelog, then merge it (auto-merge once CI passes).
3. The merge tags `vX.Y.Z` and creates the GitHub Release. The `Build (macOS)`, `Build (macOS Intel)`, `Build (Windows)` and `Build (Linux)` jobs then run `make make` and attach:

| File | What |
|---|---|
| `Shortty-macOS-arm64.dmg` | macOS installer (Apple silicon) |
| `Shortty-macOS-arm64.zip` | macOS app, zipped (Apple silicon; update feed) |
| `Shortty-macOS-x64.dmg` | macOS installer (Intel) |
| `Shortty-macOS-x64.zip` | macOS app, zipped (Intel; update feed) |
| `Shortty-Windows-x64-Setup.exe` | Windows installer (Squirrel, per-user, no admin) |
| `Shortty-Windows-x64.zip` | Windows portable app |
| `Shortty-Linux-x64.deb` | Debian/Ubuntu package |
| `Shortty-Linux-x64.rpm` | Fedora/RHEL package |
| `RELEASES`, `shortty-X.Y.Z-full.nupkg` | Windows update feed (read by update.electronjs.org; do not rename) |

The names carry no version, so `https://github.com/giocaizzi/shortty/releases/latest/download/<file>` always serves the newest release (the README download badges link there).

4. Check: `gh release view vX.Y.Z` lists these files; download one and launch it.

## Test installers without releasing

Actions → Release → Run workflow (or `gh workflow run release.yml --ref <branch>`). Only the build jobs run; download the installers from the run's artifacts (`gh run download <run-id>`).

## Rollback

Delete the release and its tag: `gh release delete vX.Y.Z --cleanup-tag`. Then fix forward on `main`; release-please opens the next Release PR. If the manifest was bumped, the next release keeps counting from it (never reuse a version). Copies that already auto-updated keep it (update.electronjs.org only serves the latest release, so they move on with the next one); see [updates.md](updates.md).

## What a human must provide

- The release-please GitHub App installed on this repo, and its ID and private key as the repo secrets `RP_APP_ID` / `RP_APP_KEY` (`gh secret set RP_APP_ID -R giocaizzi/shortty`, and `gh secret set RP_APP_KEY -R giocaizzi/shortty < key.pem` from wherever the key is stored; never paste it in chat).
- macOS signing, as secrets of the GitHub environment `release` (Settings → Environments → release; set them yourself, never in chat):
  - `MACOS_CERT_P12`: the "Developer ID Application" certificate exported from Keychain Access as `.p12`, base64-encoded: `base64 -i cert.p12 | gh secret set MACOS_CERT_P12 -R giocaizzi/shortty --env release`
  - `MACOS_CERT_PASSWORD`: the `.p12` export password
  - `APPLE_SIGNING_IDENTITY`: e.g. `Developer ID Application: Your Name (TEAMID)` (`security find-identity -v -p codesigning`)
  - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (appleid.apple.com → App-Specific Passwords), `APPLE_TEAM_ID`
- Windows signing (not set up): an Azure Trusted Signing account or a CA cloud-signing certificate.

**Last verified:** 2026-10-15, workflow written and linted with actionlint; first real run pending.
