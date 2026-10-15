<div align="center">

# Shortty

**Every shortcut and every CLI flag, one keystroke away.**

`⌘⇧Space` → type → `↩` copied.

[![CI](https://github.com/giocaizzi/shortty/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/giocaizzi/shortty/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![macOS](https://img.shields.io/badge/macOS-first-black?logo=apple)

<img src="docs/assets/readme-tmux.png" alt="Searching &quot;pane&quot;: tmux prefix bindings next to VS Code" width="720">

</div>

Forgot the tmux binding to break out a pane? The vim motion for the end of a WORD? The `kubectl get` flag for custom columns? Shortty is a macOS menu-bar launcher that reads the keyboard shortcuts of your tools (your own config included) and the help of every CLI on your PATH, and puts them all behind one fuzzy search. Nothing leaves your machine.

## Your keybindings, as you configured them

Shortty ships curated defaults for **tmux, vim, VS Code, Ghostty, Zsh, Bash, Obsidian, Chrome, Finder and macOS**, then merges in your config files: a remap in `~/.config/vim/vimrc` or `.tmux.conf` shows up as you set it, live, without a restart. Drill into one source to browse it on its own.

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

No release yet: build it.

```sh
make install   # npm ci
make make      # DMG + ZIP in out/make
open out/make/dmg/*/Shortty-*.dmg   # drag Shortty to Applications
```

## Develop

```sh
make dev       # run with hot reload (quit an installed Shortty first)
make check     # lint + test
make e2e       # end-to-end suite on the real app (macOS)
```

`make help` lists every target. Docs, spec and runbooks live in [docs/](docs/README.md).

## License

[MIT](LICENSE)
