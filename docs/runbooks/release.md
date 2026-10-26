# Release

**When:** shipping a new Shortty version (macOS DMG/ZIP, Windows installer/ZIP, Linux deb/rpm on a GitHub Release), or getting test installers without releasing.
**Preconditions:** the release-please GitHub App is installed on `giocaizzi/shortty` and the repo has the secrets `RP_APP_ID` and `RP_APP_KEY` (same app as the other `giocaizzi` repos); changes land on `main` as Conventional Commits.

Releases are automated by `.github/workflows/release.yml`. macOS builds are signed with the Developer ID and notarized when the `release` environment holds the Apple secrets (below); otherwise they build unsigned with a warning. Windows builds are signed through SignPath (free certificate from SignPath Foundation) when the `release` environment holds the SignPath token and organization (below); otherwise they build unsigned with a warning, and SmartScreen warns on first launch. Installed apps update themselves: Windows and signed macOS through update.electronjs.org, Linux and unsigned macOS by notifying that a new version is out.

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

4. With Windows signing set up, approve the two signing requests in SignPath while `Build (Windows)` waits (up to an hour each): first the app exe (`app-exe`), then the installer (`setup-exe`). See [Windows signing](#windows-signing).
5. Check: `gh release view vX.Y.Z` lists these files; download one and launch it.

## Test installers without releasing

Actions → Release → Run workflow (or `gh workflow run release.yml --ref <branch>`). Only the build jobs run; download the installers from the run's artifacts (`gh run download <run-id>`). With Windows signing set up, these runs submit signing requests too: approve them, or the Windows job fails after an hour. SignPath only signs builds from the branches its signing policy allows (`main`).

## Windows signing

Squirrel packs the app executable into the `.nupkg` (update feed) and into `Setup.exe`, so the executable must be signed before the installer is built, and `Setup.exe` after. SignPath signs through its GitHub Action (upload a workflow artifact, wait for approval, download the signed file), so `Build (Windows)` splits the build:

1. `make package` builds `out/Shortty-win32-x64/`.
2. `shortty.exe` is uploaded as the artifact `unsigned-app-exe` and signed with the artifact configuration `app-exe`; the signed copy replaces it.
3. `make make SKIP_PACKAGE=1` builds the ZIP, the `.nupkg`, `RELEASES` and `Setup.exe` from the signed folder.
4. `Shortty-Windows-x64-Setup.exe` is uploaded as `unsigned-setup-exe`, signed with `setup-exe` and replaced. The `.nupkg` and `RELEASES` do not change.
5. `Verify the signature (Windows)` checks both files with `Get-AuthenticodeSignature` (status `Valid`, timestamped). Unsigned files only warn when SignPath is not configured; anything else fails the job.

The artifact configurations live in [`.signpath/artifact-configurations/`](../../.signpath/artifact-configurations/); SignPath does not read them from the repo, so paste a changed file into the SignPath project in the same change. The Electron DLLs next to `shortty.exe` are upstream binaries and stay unsigned, as SignPath Foundation allows. Applying for SignPath Foundation and configuring SignPath: [signpath-application.md](signpath-application.md).

To check a downloaded installer by hand on Windows: file Properties → Digital Signatures shows `SignPath Foundation`, or in PowerShell `Get-AuthenticodeSignature .\Shortty-Windows-x64-Setup.exe` returns `Valid`. A new certificate may still trigger SmartScreen until it builds reputation.

## Rollback

Delete the release and its tag: `gh release delete vX.Y.Z --cleanup-tag`. Then fix forward on `main`; release-please opens the next Release PR. If the manifest was bumped, the next release keeps counting from it (never reuse a version). Copies that already auto-updated keep it (update.electronjs.org only serves the latest release, so they move on with the next one); see [updates.md](updates.md).

## What a human must provide

- The release-please GitHub App installed on this repo, and its ID and private key as the repo secrets `RP_APP_ID` / `RP_APP_KEY` (`gh secret set RP_APP_ID -R giocaizzi/shortty`, and `gh secret set RP_APP_KEY -R giocaizzi/shortty < key.pem` from wherever the key is stored; never paste it in chat).
- macOS signing, as secrets of the GitHub environment `release` (Settings → Environments → release; set them yourself, never in chat):
  - `MACOS_CERT_P12`: the "Developer ID Application" certificate exported from Keychain Access as `.p12`, base64-encoded: `base64 -i cert.p12 | gh secret set MACOS_CERT_P12 -R giocaizzi/shortty --env release`
  - `MACOS_CERT_PASSWORD`: the `.p12` export password
  - `APPLE_SIGNING_IDENTITY`: e.g. `Developer ID Application: Your Name (TEAMID)` (`security find-identity -v -p codesigning`)
  - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (appleid.apple.com → App-Specific Passwords), `APPLE_TEAM_ID`
- Windows signing, in the GitHub environment `release` (set them yourself, never in chat), once SignPath Foundation accepted the project ([signpath-application.md](signpath-application.md)):
  - secret `SIGNPATH_API_TOKEN`: API token of the SignPath CI user with the Submitter role (`gh secret set SIGNPATH_API_TOKEN -R giocaizzi/shortty --env release`, then paste at the prompt)
  - variable `SIGNPATH_ORGANIZATION_ID`: the SignPath organization ID (`gh variable set SIGNPATH_ORGANIZATION_ID -R giocaizzi/shortty --env release --body <id>`)
  - optional variables `SIGNPATH_PROJECT_SLUG` (default `shortty`) and `SIGNPATH_SIGNING_POLICY_SLUG` (default `release-signing`) when SignPath uses other slugs

**Last verified:** 2026-10-26, signed macOS run green (workflow_dispatch). Windows signing (#80) and the tag-triggered release path are not exercised yet.
