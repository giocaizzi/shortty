# Code signing policy

macOS releases are signed with the maintainer's Apple Developer ID and notarized by Apple.

Windows releases are currently unsigned. Shortty has applied to [SignPath Foundation](https://signpath.org) for a free code signing certificate; once the application is approved, Windows releases will be signed with that certificate through [SignPath.io](https://about.signpath.io), and this section will say so.

Once signing is in place, Windows releases (`Shortty-Windows-x64-Setup.exe` and the app executable inside it and in `Shortty-Windows-x64.zip`) will be built from this repository by GitHub Actions ([release.yml](../.github/workflows/release.yml)) on GitHub-hosted runners and signed through SignPath, with every signing request approved by hand. Only binaries built from this repository will be signed; the Electron runtime libraries shipped next to the app are upstream binaries.

Team roles:

- Committers and reviewers: [giocaizzi](https://github.com/giocaizzi)
- Approvers: [giocaizzi](https://github.com/giocaizzi)
