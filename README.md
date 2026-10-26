<div align="center">

# Shortty

**Every shortcut and every CLI flag, one keystroke away.**

`⌘⇧Space` (Windows: `Ctrl+Shift+Space`) → type → `↩` copied.

[![Release](https://img.shields.io/github/v/release/giocaizzi/shortty?sort=semver)](https://github.com/giocaizzi/shortty/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/giocaizzi/shortty/total)](https://github.com/giocaizzi/shortty/releases)
[![CI](https://github.com/giocaizzi/shortty/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/giocaizzi/shortty/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[![Download for macOS](https://img.shields.io/badge/Download-macOS%20(Apple%20silicon)-black?style=for-the-badge&logo=apple)](https://github.com/giocaizzi/shortty/releases/latest/download/Shortty-macOS-arm64.dmg)
[![Download for Windows](https://img.shields.io/badge/Download-Windows%20(x64)-0078D4?style=for-the-badge&logo=windows)](https://github.com/giocaizzi/shortty/releases/latest/download/Shortty-Windows-x64-Setup.exe)
[![Download for Linux](https://img.shields.io/badge/Download-Linux%20(.deb)-E95420?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/giocaizzi/shortty/releases/latest/download/Shortty-Linux-x64.deb)

<img src="docs/assets/readme-tmux.png" alt="Searching &quot;pane&quot;: tmux prefix bindings next to VS Code" width="720">

</div>

Forgot the tmux binding to break out a pane? The vim motion for the end of a WORD? The `kubectl get` flag for custom columns? Shortty is a menu-bar / system-tray launcher for macOS, Windows and Linux that reads the keyboard shortcuts of your tools (your own config included) and the help of every CLI on your PATH, and puts them all behind one fuzzy search. Nothing leaves your machine.

## Your keybindings, as you configured them

Shortty ships curated defaults for **tmux, vim, VS Code, Ghostty, Zsh, Bash, Obsidian, Chrome, Finder and macOS**, and on Windows **Windows, File Explorer, Windows Terminal, PowerShell and PowerToys**, then merges in your config files: a remap in `~/.config/vim/vimrc` or `.tmux.conf` shows up as you set it, live, without a restart. Drill into one source to browse it on its own.

<div align="center">
<img src="docs/assets/readme-vim.png" alt="vim drilled in, filtered by &quot;word&quot;: w, b, e, diw, ciw, yiw" width="720">
</div>

## Every CLI on your PATH, down to the last flag

Type `>` and a command: Shortty reads its man page and `--help` in the background and lets you walk subcommands, flags, arguments and examples, at any depth. `>kubectl get ` drills straight in; Enter copies the whole command line, ready to paste.

<div align="center">
<img src="docs/assets/readme-kubectl.png" alt="kubectl › get: synopsis and examples" width="720">
</div>

Parsed help formats include cobra (kubectl, gh, docker, helm), clap, click, argparse, gcloud, az, aws and classic man pages.

## Also

- **Keyboard-layout aware**: keys are shown, searched and copied as labelled on *your* keyboard (Italian, German, Dvorak…), not a US layout.
- **Resume where you left off**, or start blank: your call in Settings (`⌘,`).
- **Sandboxed probing**: help is read with a stripped environment, a timeout and a blocklist; OS binaries are never run.
- Light and dark, a System Settings-style Preferences window, a menu-bar icon you can hide.

## Install

Grab the latest release with the buttons above, or from [Releases](https://github.com/giocaizzi/shortty/releases):

- **macOS**: open `Shortty-macOS-arm64.dmg` (Apple silicon) or `Shortty-macOS-x64.dmg` (Intel, from [Releases](https://github.com/giocaizzi/shortty/releases)) and drag Shortty to Applications.
- **Windows** (x64): run `Shortty-Windows-x64-Setup.exe` (installs for your user, no admin). SmartScreen may warn about an unknown publisher: More info → Run anyway. Windows releases are not signed yet; see the [code signing policy](https://github.com/giocaizzi/shortty/blob/main/docs/code-signing-policy.md) (signing through SignPath Foundation is pending) and the [privacy policy](https://github.com/giocaizzi/shortty/blob/main/docs/privacy-policy.md).
- **Linux** (x64): `sudo apt install ./Shortty-Linux-x64.deb` or `sudo dnf install ./Shortty-Linux-x64.rpm`.

Or build it yourself: `make install && make make` (installers land in `out/make`).

## Develop

```sh
make dev       # run with hot reload (quit an installed Shortty first)
make check     # lint + test
make e2e       # end-to-end suite on the real app (macOS)
```

`make help` lists every target. Docs, spec and runbooks live in [docs/](docs/README.md).

## License

[MIT](LICENSE)
