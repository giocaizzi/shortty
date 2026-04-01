import { homedir } from 'node:os';
import { join } from 'node:path';

const home = homedir();

type Platform = 'darwin' | 'win32' | 'linux';

interface ConfigPaths {
  darwin?: string[];
  win32?: string[];
  linux?: string[];
}

const CONFIG_PATHS: Record<string, ConfigPaths> = {
  vscode: {
    darwin: [join(home, 'Library/Application Support/Code/User/keybindings.json')],
    win32: [join(process.env.APPDATA ?? '', 'Code/User/keybindings.json')],
    linux: [join(home, '.config/Code/User/keybindings.json')],
  },
  ghostty: {
    darwin: [join(home, 'Library/Application Support/com.mitchellh.ghostty/config')],
    win32: [join(process.env.APPDATA ?? '', 'ghostty/config')],
    linux: [join(home, '.config/ghostty/config')],
  },
  tmux: {
    darwin: [
      join(home, '.tmux.conf'),
      join(home, '.config/tmux/tmux.conf'),
    ],
    linux: [
      join(home, '.tmux.conf'),
      join(home, '.config/tmux/tmux.conf'),
    ],
  },
  zsh: {
    darwin: [join(home, '.zshrc')],
    linux: [join(home, '.zshrc')],
  },
  chrome: {
    darwin: [
      join(home, 'Library/Application Support/Google/Chrome/Default/Preferences'),
    ],
    win32: [
      join(
        process.env.LOCALAPPDATA ?? '',
        'Google/Chrome/User Data/Default/Preferences',
      ),
    ],
    linux: [join(home, '.config/google-chrome/Default/Preferences')],
  },
  'macos-system': {
    darwin: [
      join(home, 'Library/Preferences/com.apple.symbolichotkeys.plist'),
    ],
  },
};

export function getConfigPaths(parserId: string): string[] {
  const platform = process.platform as Platform;
  const paths = CONFIG_PATHS[parserId]?.[platform];
  return paths ?? [];
}

/** Discover Obsidian vaults by scanning common directories. */
export function discoverObsidianVaults(): string[] {
  const { existsSync, readdirSync, statSync } = require('node:fs');
  const vaults: string[] = [];
  const searchDirs = [
    join(home, 'Documents'),
    join(home, 'Desktop'),
    home,
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.')) continue;
        const entryPath = join(dir, entry);
        try {
          if (!statSync(entryPath).isDirectory()) continue;
          const obsidianDir = join(entryPath, '.obsidian');
          if (existsSync(obsidianDir)) {
            const hotkeysPath = join(obsidianDir, 'hotkeys.json');
            if (existsSync(hotkeysPath)) {
              vaults.push(hotkeysPath);
            }
          }
        } catch {
          // Skip inaccessible entries
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  return vaults;
}
