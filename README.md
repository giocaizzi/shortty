<div align="center">

# Shortty

**Every keybinding of your apps in one Spotlight-style launcher.**

[![CI](https://github.com/giocaizzi/shortty/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/giocaizzi/shortty/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

Shortty is an Electron app that reads the keybindings configured in your tools and lets you search them from a floating launcher, opened with `Cmd+Shift+Space`. It watches the config files, so the list stays current.

Supported sources: VS Code, Ghostty, tmux, Zsh, Obsidian, Chrome and macOS system shortcuts.

## Quickstart

```sh
make install   # npm ci
make dev       # start the app with hot reload
make check     # lint + test
```

## Features

- Fuzzy search across key, command, source and context
- One parser per application, discovered at startup
- Live updates when a config file changes
- Frameless, always-on-top window with macOS vibrancy

## License

[MIT](LICENSE)
