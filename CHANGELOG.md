# Changelog

## [0.2.1](https://github.com/giocaizzi/shortty/compare/v0.2.0...v0.2.1) (2026-10-15)


### Added

* **about:** show the running version and an About tab everywhere ([#76](https://github.com/giocaizzi/shortty/issues/76)) ([9e1f9b1](https://github.com/giocaizzi/shortty/commit/9e1f9b138655e1626092770e7d1b49780f631ce0))


### Fixed

* **test:** give the stdin sandbox test room on a loaded host ([#73](https://github.com/giocaizzi/shortty/issues/73)) ([cab7be5](https://github.com/giocaizzi/shortty/commit/cab7be555d3b45eae30057f629e39ba65dfcb847))


### Documentation

* **release:** explain where the Release-As footer must go ([#77](https://github.com/giocaizzi/shortty/issues/77)) ([52b3bd5](https://github.com/giocaizzi/shortty/commit/52b3bd5653f2d0c0b30b9b041c662279a9afa5a7))

## [0.2.0](https://github.com/giocaizzi/shortty/compare/v0.1.0...v0.2.0) (2026-10-15)


### Added

* **commands:** full CLI help parsing, typed drill-down and app icons ([#52](https://github.com/giocaizzi/shortty/issues/52)) ([271f82e](https://github.com/giocaizzi/shortty/commit/271f82e7b9db1d0ecfda88ba2399dbc4fbedc95b))
* finish v1 launcher, parsers, commands and e2e suite ([#47](https://github.com/giocaizzi/shortty/issues/47)) ([838d3c0](https://github.com/giocaizzi/shortty/commit/838d3c0d0ee739802228bc7340e79a704f76060e))
* initial implementation of Shortty keybinding launcher ([1ae2b2d](https://github.com/giocaizzi/shortty/commit/1ae2b2d75772d99c6a59d8f864a0b2198968cd2e))
* **keys:** show and copy Ctrl/Alt/Win labels off macOS ([#65](https://github.com/giocaizzi/shortty/issues/65)) ([a9032f0](https://github.com/giocaizzi/shortty/commit/a9032f05d923f83c711216dc91e9eb7e89d18833))
* **launcher:** resume the last screen on reopen and copy full command paths ([#55](https://github.com/giocaizzi/shortty/issues/55)) ([b810d79](https://github.com/giocaizzi/shortty/commit/b810d79425875c75d0d2d2ff4cc53bca523fc0d5))
* **menu:** open Settings from the app menu with ⌘, ([#58](https://github.com/giocaizzi/shortty/issues/58)) ([c3a065a](https://github.com/giocaizzi/shortty/commit/c3a065af41df5a94a79655a92f260da08d911aa9))
* **preferences:** add a Rebuild index button to the Commands tab ([#60](https://github.com/giocaizzi/shortty/issues/60)) ([557ae0e](https://github.com/giocaizzi/shortty/commit/557ae0e4c8d38b7cee5a366a21ba8cc24a0e6534))
* **sources:** add Windows, Explorer, Windows Terminal and PowerShell sources; vim on Windows ([#68](https://github.com/giocaizzi/shortty/issues/68)) ([a939517](https://github.com/giocaizzi/shortty/commit/a9395176f22b52b11e7e9e0e3fc1dc304559b433))
* **updates:** auto-update on Windows and signed macOS, notify elsewhere ([#69](https://github.com/giocaizzi/shortty/issues/69)) ([f551dc0](https://github.com/giocaizzi/shortty/commit/f551dc0be0e8d0274f829347a64ed963625ac0ea))
* **windows:** native window, tray, login item, icons and installer config ([#67](https://github.com/giocaizzi/shortty/issues/67)) ([5556237](https://github.com/giocaizzi/shortty/commit/5556237a5edd0f6753d89072aeae276eb7400ff9))


### Fixed

* **build:** bundle main-process dependencies into the packaged app ([#56](https://github.com/giocaizzi/shortty/issues/56)) ([6ae9756](https://github.com/giocaizzi/shortty/commit/6ae97565965a27084bfc6e489296a4585a1320c5))
* enhance keybinding generation and context handling in parsers ([352b29b](https://github.com/giocaizzi/shortty/commit/352b29b221eca26d8c7553280c72f7ac3ca786e6))
* improve parser quality from worktree changes ([241f2d1](https://github.com/giocaizzi/shortty/commit/241f2d1d186c6369749215c32831fa0b01acb4b9))
* **logging:** keep unit tests out of the real log file ([#57](https://github.com/giocaizzi/shortty/issues/57)) ([f834f34](https://github.com/giocaizzi/shortty/commit/f834f34a6daa5bf2281e504d6bf1983444ca9f80))
* overhaul UI for Spotlight-style glass aesthetic ([b13efbe](https://github.com/giocaizzi/shortty/commit/b13efbef495aba67d8fb704be60bd7b513c3e977))
* **preferences:** commit source path override on Enter directly ([#54](https://github.com/giocaizzi/shortty/issues/54)) ([132a6cd](https://github.com/giocaizzi/shortty/commit/132a6cdc2f67c5bb5d815eaec0e49b8a8c12f4d9))
* **preferences:** keep a path override cleared after reset ([#66](https://github.com/giocaizzi/shortty/issues/66)) ([fa25cea](https://github.com/giocaizzi/shortty/commit/fa25cea1ba1641a322e6c9be03da3c4853af53fa))
* **test:** turn off vitest's on-disk module cache ([#70](https://github.com/giocaizzi/shortty/issues/70)) ([6de4336](https://github.com/giocaizzi/shortty/commit/6de433697ea28cc7ebd1fb9ab4935d5c3d01d3e9))
* **test:** type-check the test suite and fix the errors it hid ([#71](https://github.com/giocaizzi/shortty/issues/71)) ([635d5bb](https://github.com/giocaizzi/shortty/commit/635d5bb0779604404bb97f4c6dc26d258806f798))
* upgrade vite v5→v8 and plugin-react v4→v6 to resolve vulnerabilities ([d5222cc](https://github.com/giocaizzi/shortty/commit/d5222cc4998c93b420cd74d9b3f38014a3058266))
* **vim:** read the XDG vimrc at ~/.config/vim/vimrc ([#59](https://github.com/giocaizzi/shortty/issues/59)) ([a5b164c](https://github.com/giocaizzi/shortty/commit/a5b164c903ea7ca34f03bbe54652f4598cf1704a))
