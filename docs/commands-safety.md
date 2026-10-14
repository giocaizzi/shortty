# Commands engine: process-spawning safety

The commands engine (SPECS §7) indexes every executable on `PATH` and enriches
it from man pages and, as a last resort, from `<command> --help`. Running
`--help` executes the program, so it is gated by the policy below.
Implementation: `src/main/commands/parsers/help-parser.ts` (`isTrustedBinary`,
`isBlocklisted`) and `src/main/commands/sandbox-exec.ts`.

## `--help` probing policy

A command (or `command sub …` for subcommand details) is probed with `--help`
only if all of these hold:

1. Shortty is not running as root.
2. Neither the command name nor the basename of its resolved path (symlinks
   followed) is on the blocklist (see below).
3. The resolved file is owned by root or the current user.
4. The resolved file is not writable by group or others (`mode & 022 == 0`).
5. The resolved file is either:
   - a **native executable** (Mach-O, Mach-O universal or ELF magic), anywhere; or
   - a **`#!` script under a trusted install prefix**:

     | Prefix | Why |
     |--------|-----|
     | `/usr/`, `/bin/`, `/sbin/`, `/System/`, `/Library/Apple/` | OS-shipped tools (includes `/usr/local/`) |
     | `/opt/homebrew/`, `/opt/local/` | Homebrew (Apple silicon), MacPorts |
     | `/nix/store/` | Nix (profiles resolve into the store) |
     | `~/.cargo/bin/`, `~/.rustup/toolchains/` | Cargo / rustup |
     | `~/.local/share/uv/tools/` | `uv tool install` (its `~/.local/bin` links resolve here) |
     | `~/.local/pipx/venvs/` | pipx |

Anything else, notably the user's own scripts in `~/bin`, `~/.local/bin` or a
project directory, is never executed: such a script may act on any argument
(`deploy.sh --help` may deploy). Those commands are enriched from their man
page and the whatis database only.

In e2e mode (`SHORTTY_E2E=1`) `$SHORTTY_E2E_DIR/bin/` is also trusted, so the
suite's fake `#!` CLIs can be probed (see [e2e.md](e2e.md)).

## Blocklist

Never probed, whatever their location: destructive system commands, daemons,
interpreters and shells, macOS security/signing tools (Keychain or admin
prompts), GUI apps, and **wrappers that execute their arguments** (`env`,
`xargs`, `nohup`, `nice`, `caffeinate`, `watch`, `sudo`, `doas`, `time`,
`timeout`, `exec`, `chroot`, `stdbuf`, `script`, `setsid`, `flock`, …): an
implementation without a `--help` flag would run `--help` (or the subcommand
words) as a command. The full list is `BLOCKLIST` in `help-parser.ts`.

## Sandbox for permitted probes

Every probe runs with a throwaway working directory, stdin closed, an
allowlisted environment (no tokens or keys; pagers and editors neutralised), a
2-second hard timeout and a 1 MiB output cap; on timeout or overflow the whole
process group is killed.
