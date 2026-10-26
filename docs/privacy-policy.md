# Privacy policy

Shortty keeps your data on your machine: no telemetry, no accounts, no analytics. The only network requests it makes on its own are update checks, and only in an installed copy:

- A copy that can update itself (a Windows install made with `Setup.exe`, or a signed macOS app) asks update.electronjs.org for a newer release once an hour, with "Download updates automatically" on. update.electronjs.org sees the app version, the platform and your IP address.
- Any other copy (Linux, the portable Windows ZIP, an unsigned macOS app), or one with "Download updates automatically" off, asks the GitHub releases API (`api.github.com`) for the latest release once a day. GitHub sees your IP address.
- Check Now in Settings runs the same check when you click it.

Turning off "Download updates automatically" only stops updates from being downloaded and installed; Shortty still checks and tells you when a new version is out. The check itself cannot be turned off yet. Links you click (a release page, the repository, an issue form) open in your browser.
