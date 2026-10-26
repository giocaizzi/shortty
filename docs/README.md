# Shortty docs

Source of truth for how Shortty works and how to operate it. Quickstart: [../README.md](../README.md). Agent instructions: [../AGENTS.md](../AGENTS.md).

## Product and design

- [spec.md](spec.md): product spec and architecture (data model, shortcuts and commands engines, search, settings, UX, lifecycle), with the design decisions in §15.
- [screens.md](screens.md): every screen and UI state of the launcher, tray and Preferences.
- [keyboard-layouts.md](keyboard-layouts.md): how keys are modelled, displayed, searched and copied on non-US keyboard layouts.
- [privacy-policy.md](privacy-policy.md): what Shortty sends over the network (update checks only) and to whom.
- [code-signing-policy.md](code-signing-policy.md): how macOS and Windows releases are signed, and the signing team roles.

## Runbooks

- [runbooks/run-unit-tests.md](runbooks/run-unit-tests.md): run the Vitest suite and fix the failures that only show in a fresh checkout or on a busy machine.
- [runbooks/run-e2e-tests.md](runbooks/run-e2e-tests.md): run and write the Playwright end-to-end suite.
- [runbooks/release.md](runbooks/release.md): cut a release (release-please, macOS and Windows installers), test installers without releasing, roll back.
- [runbooks/signpath-application.md](runbooks/signpath-application.md): apply to SignPath Foundation and configure SignPath for Windows signing (policy text, artifact configurations, secrets).
- [runbooks/release-macos.md](runbooks/release-macos.md): build, sign and notarize a macOS build by hand.
- [runbooks/updates.md](runbooks/updates.md): how releases reach installed copies (auto-update vs notify), asset names that must not change, debugging.
- [runbooks/reset-settings.md](runbooks/reset-settings.md): recover an unreachable Shortty with `--reset-settings`.

## Work in progress

- [wip/v1-status.md](wip/v1-status.md): what v1 ships, defers and leaves out.
- [wip/benchmark.md](wip/benchmark.md): launcher timings and screenshots from the e2e harness.
- [wip/gap-analysis.md](wip/gap-analysis.md): pre-fix audit of v1 (historical).
