# Updates

**When:** checking how a published release reaches installed copies of Shortty, renaming or adding release assets, or debugging a copy that does not update.
**Preconditions:** a GitHub Release on the public `giocaizzi/shortty` repo, tagged `vX.Y.Z`, not a draft or prerelease. Design: [spec §12.4](../spec.md#124-updates).

## How a release reaches users

| Install | What happens |
|---|---|
| Windows, installed with `Shortty-Windows-x64-Setup.exe` | Squirrel checks update.electronjs.org 30 s after start and hourly, downloads the new `.nupkg` in the background, then the tray and Preferences → General offer "Restart to Update". |
| macOS, Developer ID signed + notarized build | Same, through Squirrel.Mac with `Shortty-macOS-arm64.zip` (Apple silicon) or `Shortty-macOS-x64.zip` (Intel). |
| macOS unsigned, Windows portable ZIP, Linux deb/rpm | Shortty reads the GitHub "latest release" 30 s after start and daily; a newer version adds "Update Available (vX.Y.Z)..." to the tray, which opens the release page. The user installs it by hand. |
| Any install with "Download updates automatically" off | Notify only, as the row above. |

Development (`make dev`) and e2e runs never check.

update.electronjs.org caches GitHub's release list for a few minutes, so a new release can take that long to show up.

## Asset names that must not change

update.electronjs.org picks assets by name ([source](https://github.com/electron/update.electronjs.org/blob/main/src/asset-platform.ts)):

| Asset | Rule it matches |
|---|---|
| `Shortty-macOS-arm64.zip` | `.zip` containing `-mac`, `-darwin` or `-osx` (case-insensitive) → macOS; `-arm64` (lowercase, case-sensitive) → Apple silicon. |
| `Shortty-macOS-x64.zip` | Same macOS rule; without `-arm64` (or `-universal`) it is served as Intel, so this name must never contain `-arm64`. |
| `Shortty-Windows-x64-Setup.exe` | Any `.exe` without `arm` or `ia32` → Windows x64. Only marks the release as having a Windows build. |
| `RELEASES` | Fetched by exact name from the same release; Squirrel.Windows reads it. |
| `shortty-X.Y.Z-full.nupkg` | The package `RELEASES` names; the file name inside `RELEASES` and the asset name must match. |

The DMG, the Windows ZIP and the Linux packages are ignored by the service. A rename that breaks one of these rules stops automatic updates for that platform without any error in CI.

## Verify a release

```bash
# macOS: expect 200 with JSON {name, notes, url} pointing at the .zip (204 = up to date)
curl -si https://update.electronjs.org/giocaizzi/shortty/darwin-arm64/0.0.1 | head -20
curl -si https://update.electronjs.org/giocaizzi/shortty/darwin-x64/0.0.1 | head -20
# Windows: expect the RELEASES body with an absolute .nupkg URL
curl -s https://update.electronjs.org/giocaizzi/shortty/win32-x64/0.0.1/RELEASES
# Notify path
gh api repos/giocaizzi/shortty/releases/latest --jq '.tag_name, .draft, .prerelease'
```

A 404 with "No updates found (needs asset matching …)" means an asset name no longer matches.

## Debug a copy that does not update

- Preferences → General → Updates says which path this copy is on: "Updates install in the background…" (auto-update) or "This copy can't update itself…" (notify only, no "Download updates automatically" switch).
- The log (`~/Library/Logs/Shortty/main.log`, `%APPDATA%\Shortty\logs\main.log`) says `Updates: auto-update` or `Updates: notify only` at start, and `Auto-update failed…` on a Squirrel error (Shortty then falls back to the notify check).
- macOS: `codesign -dv --verbose=2 /Applications/Shortty.app` must list `Authority=Developer ID Application: …`; ad-hoc or unsigned builds only notify. Squirrel.Mac also fails on a translocated app (run from the DMG or Downloads): move it to /Applications.
- Windows: auto-update needs `%LOCALAPPDATA%\shortty\Update.exe`; the portable ZIP has none.
