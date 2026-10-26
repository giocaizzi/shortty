# Apply for SignPath Foundation signing

**When:** setting up Windows code signing for the first time: applying to SignPath Foundation for a free certificate and configuring SignPath so that `release.yml` can sign. How signing runs in a release: [release.md](release.md#windows-signing).
**Preconditions:** `giocaizzi/shortty` is public and MIT licensed; at least one release (v0.2.1 or later) is published on GitHub Releases in the form that will be signed (Squirrel `Setup.exe` and ZIP); multi-factor authentication is on for the GitHub account of everyone with write access.

SignPath Foundation gives free code signing certificates to open source projects; the certificate is issued to "SignPath Foundation", which appears as the publisher of the signed files. Its terms: <https://signpath.org/terms>. The ones that matter here:

- OSI license for all components (MIT), no proprietary components, no malware or potentially unwanted programs, already released, functionality described on the download page.
- A **code signing policy** linked from the project home page, with the attribution line, the team roles and a privacy policy; the term "Code signing policy" should appear on the home and download pages.
- Binaries built from source on CI in a verifiable way; every signing request approved by hand; only the project's own binaries are signed (upstream binaries such as Electron's DLLs ship unsigned).
- Product name metadata set to the project name (`Shortty`; `forge.config.ts` sets it for `Setup.exe` too).
- MFA for every team member on SignPath and on GitHub.

## Steps

1. Publish the code signing policy: add the section below to `README.md` (the home page) in a PR, and link it from the Install section next to the Windows download. Do this before applying, since the reviewers check it.
2. Apply at <https://signpath.org/apply>. The form is a web form; have this ready:

   | Field | Value |
   |---|---|
   | Project name | Shortty |
   | Repository | `https://github.com/giocaizzi/shortty` |
   | Home page | `https://github.com/giocaizzi/shortty` |
   | Download page | `https://github.com/giocaizzi/shortty/releases` |
   | License | MIT |
   | Code signing policy | `https://github.com/giocaizzi/shortty#code-signing-policy` |
   | Description | A launcher that shows the keyboard shortcuts of your tools and the CLI commands on your PATH behind one fuzzy search (Electron, macOS, Windows, Linux). |
   | Build system | GitHub Actions on GitHub-hosted runners (`.github/workflows/release.yml`) |
   | Files to sign | `shortty.exe` (app executable) and `Shortty-Windows-x64-Setup.exe` (Squirrel installer) |
   | Team | giocaizzi (author, reviewer, approver) |

3. Wait for acceptance. SignPath Foundation creates the organization and the project and issues the certificate.
4. In SignPath (app.signpath.io), with MFA on your SignPath account:
   1. Trusted build systems: add the predefined **GitHub.com** trusted build system to the organization and link it to the project. Optionally install the SignPath GitHub App on `giocaizzi/shortty` for audit log checks.
   2. Project: slug `shortty`, repository URL `https://github.com/giocaizzi/shortty`.
   3. Artifact configurations: create two, pasting the files as they are:
      - slug `app-exe`: [`.signpath/artifact-configurations/app-exe.xml`](../../.signpath/artifact-configurations/app-exe.xml)
      - slug `setup-exe`: [`.signpath/artifact-configurations/setup-exe.xml`](../../.signpath/artifact-configurations/setup-exe.xml)
   4. Signing policy: slug `release-signing` (the Foundation certificate), **Verify origin** on, allowed branch names `main`, approvers: you. If SignPath Foundation set up the project with other slugs, keep theirs and set the variables in step 6.
   5. Users: create a CI user with the **Submitter** role on the `release-signing` policy and generate its API token. Keep the token in your password manager; never paste it in chat or in a file.
5. Copy the organization ID (SignPath → Organization settings).
6. Set the GitHub environment `release` (set the values yourself):

   ```bash
   gh secret set SIGNPATH_API_TOKEN -R giocaizzi/shortty --env release      # paste the token at the prompt
   gh variable set SIGNPATH_ORGANIZATION_ID -R giocaizzi/shortty --env release --body <organization-id>
   # only if SignPath uses other slugs:
   gh variable set SIGNPATH_PROJECT_SLUG -R giocaizzi/shortty --env release --body <project-slug>
   gh variable set SIGNPATH_SIGNING_POLICY_SLUG -R giocaizzi/shortty --env release --body <policy-slug>
   ```

7. Run the build from `main`: `gh workflow run release.yml --ref main`. Approve the two signing requests in SignPath (`app-exe` first, then `setup-exe`) while `Build (Windows)` waits.
8. Update the README install note: drop "SmartScreen may warn about an unknown publisher" once a signed release is out (a new certificate can still warn until it builds reputation).

## Code signing policy (paste into README.md)

```markdown
## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

Windows releases (`Shortty-Windows-x64-Setup.exe` and the app executable inside it and in `Shortty-Windows-x64.zip`) are built from this repository by GitHub Actions ([release.yml](.github/workflows/release.yml)) on GitHub-hosted runners and signed through SignPath. Every signing request is approved by hand. Only binaries built from this repository are signed; the Electron runtime libraries shipped next to the app are upstream binaries.

Team roles:

- Committers and reviewers: [giocaizzi](https://github.com/giocaizzi)
- Approvers: [giocaizzi](https://github.com/giocaizzi)

### Privacy policy

Shortty keeps your data on your machine: no telemetry, no accounts, no analytics. The only network requests it makes are update checks: an installed copy asks update.electronjs.org (which sees the app version, the platform and your IP address) or the GitHub releases API for the latest release, at most once an hour. Turn off "Download updates automatically" in Settings to only be told about new versions; the check itself cannot be turned off yet.
```

## Verify

- `gh variable list -R giocaizzi/shortty --env release` lists `SIGNPATH_ORGANIZATION_ID`; `gh secret list -R giocaizzi/shortty --env release` lists `SIGNPATH_API_TOKEN` (names only).
- The test run's `Verify the signature (Windows)` step prints `signed by CN=SignPath Foundation, ...` for `shortty.exe` and `Shortty-Windows-x64-Setup.exe`.
- On a Windows machine, the downloaded `Shortty-Windows-x64-Setup.exe` → Properties → Digital Signatures shows SignPath Foundation.

## Rollback

Delete the secret and the variable (`gh secret delete SIGNPATH_API_TOKEN -R giocaizzi/shortty --env release`, `gh variable delete SIGNPATH_ORGANIZATION_ID -R giocaizzi/shortty --env release`): the next builds are unsigned again, with a warning. Revoke the CI user's API token in SignPath. Already signed releases stay signed.

**Last verified:** never; written from the SignPath docs before the application.
