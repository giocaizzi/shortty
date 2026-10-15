# Release macOS

**When:** building, signing or notarizing a macOS build by hand, or setting up macOS signing. Releases themselves are automated: [release.md](release.md).
**Preconditions:** a Mac of the target architecture; `make install` done; a clean tree on the commit to release, with the version set in `package.json`; for a signed build, the Developer ID certificate in the keychain and the notarization credentials available (see "What a human must provide"); `gh` authenticated to publish.

How to build, sign, notarize and verify a Shortty macOS release.

## 1. Build

```bash
make install
make precommit   # lint + typecheck + test + knip must pass
make make        # electron-forge make
```

Output for the host architecture (arm64 on Apple silicon):

| Artifact | Path |
|---|---|
| DMG (ULFO) | `out/make/dmg/<arch>/Shortty-<version>-<arch>.dmg` |
| ZIP | `out/make/zip/darwin/<arch>/Shortty-darwin-<arch>-<version>.zip` |
| Unpacked app | `out/Shortty-darwin-<arch>/Shortty.app` |

`out/` is git-ignored. The version comes from `package.json`. Builds are per host architecture; for Intel, build on an Intel machine or pass `--arch=x64` to `electron-forge make`.

The app icon comes from `src/assets/icon.svg` (source), `icon.icns` (bundle and DMG) and `icon.png` (1024). To regenerate after editing the SVG: render to a 1024 PNG with `rsvg-convert`, build the iconset with `sips -z`, then `iconutil -c icns`.

## 2. Sign and notarize

Signing is controlled by environment variables only. Nothing is stored in the repo. If a variable is missing the step is skipped and the build is unsigned (ad-hoc signed by Electron, fine for local testing, blocked by Gatekeeper on other machines).

| Variable | Effect |
|---|---|
| `APPLE_SIGNING_IDENTITY` | Signs the app, e.g. `Developer ID Application: Name (TEAMID)`. |
| `APPLE_ID` | Apple ID email used for notarization. |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID (appleid.apple.com). |
| `APPLE_TEAM_ID` | 10-character Apple team ID. |

Notarization runs only when all four are set. Signing alone happens when only `APPLE_SIGNING_IDENTITY` is set.

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: ..."
export APPLE_ID=... APPLE_APP_SPECIFIC_PASSWORD=... APPLE_TEAM_ID=...   # from keychain or a secret store, never typed into a file
make make
```

Note: the DMG itself is not signed or stapled by the maker; the `.app` inside is signed and notarized (and stapled by Forge). Sign the DMG separately with `codesign` if required.

## 3. Verify

```bash
# artifacts exist
ls -lh out/make/dmg/*/*.dmg out/make/zip/darwin/*/*.zip
hdiutil verify out/make/dmg/*/Shortty-*.dmg

# signature and notarization (signed builds only)
codesign --verify --deep --strict --verbose=2 out/Shortty-darwin-*/Shortty.app
spctl --assess --type execute --verbose out/Shortty-darwin-*/Shortty.app
xcrun stapler validate out/Shortty-darwin-*/Shortty.app

# launches (LSUIElement: no dock icon, so check the process)
open out/Shortty-darwin-*/Shortty.app && sleep 5 && pgrep -fl "Shortty.app/Contents/MacOS"
```

Quit it afterwards from the tray menu (or `kill` the PID if it ignores the quit Apple event). Then press `Cmd+Shift+Space` and confirm the launcher shows cheatsheet entries and the tray icon appears.

The packaged app must contain: the cheatsheets (bundled into `app.asar` at `.vite/build/index.cjs` via `import.meta.glob`) and the tray icons (`Resources/tray-iconTemplate.png` and `@2x`, copied by `extraResource`).

## 4. Publish

Attach the DMG and ZIP to a GitHub Release for the tag (`gh release create vX.Y.Z out/make/dmg/*/*.dmg out/make/zip/darwin/*/*.zip`). No auto-update channel exists in v1.

## What a human must provide

- An Apple Developer Program membership and a **Developer ID Application** certificate installed in the signing keychain (the private key never goes in the repo).
- An app-specific password and the team ID for notarization.

## Signing in CI

Releases build unsigned in `.github/workflows/release.yml` ([release.md](release.md)). To sign there: import the Developer ID certificate (base64 `.p12` secret plus password) into a temporary keychain on the macOS build job, expose `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` as secrets of a `release` environment, and delete the keychain afterwards (issue #49).

## Rollback

Before publishing, nothing leaves the machine: delete `out/`. After publishing, delete the GitHub Release and its tag (`gh release delete vX.Y.Z --cleanup-tag`); users who already downloaded the DMG keep it (there is no auto-update channel to retract). A notarization submission cannot be withdrawn, but it has no effect without the published artifact.

**Last verified:** 2026-10-14 by the feat/finish-v1 docs pass (commands read against `Makefile` and `forge.config.ts`; signing and publishing not exercised, no certificate available)
