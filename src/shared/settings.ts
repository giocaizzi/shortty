export interface SearchSettings {
  keyWeight: number;
  commandWeight: number;
  sourceWeight: number;
  contextWeight: number;
  threshold: number;
}

export interface ResultLimits {
  sources: number;
  shortcuts: number;
  commands: number;
}

export interface AppSettings {
  launchAtLogin: boolean;
  showDockIcon: boolean;
  showMenuBar: boolean;
  dismissAfterCopy: boolean;
  /** When a reopened launcher starts blank again instead of on its last screen. */
  resetLauncher: 'immediately' | '90s' | 'never';
  theme: 'light' | 'dark' | 'system';
  globalShortcut: string;
  windowPosition: 'center' | 'top-center' | 'mouse';
  disabledParsers: string[];
  sourcePathOverrides: Record<string, string | string[]>;
  search: SearchSettings;
  commandPrefixMode: boolean;
  resultLimits: ResultLimits;
  commandsEnabled: boolean;
}

/** Defaults from docs/spec.md §9.1. */
export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  showDockIcon: false,
  showMenuBar: true,
  dismissAfterCopy: true,
  resetLauncher: 'immediately',
  theme: 'system',
  globalShortcut: 'CommandOrControl+Shift+Space',
  windowPosition: 'top-center',
  disabledParsers: [],
  sourcePathOverrides: {},
  search: {
    keyWeight: 0.4,
    commandWeight: 0.4,
    sourceWeight: 0.1,
    contextWeight: 0.1,
    threshold: 0.35,
  },
  commandPrefixMode: false,
  resultLimits: {
    sources: 3,
    shortcuts: 8,
    commands: 5,
  },
  commandsEnabled: true,
};
