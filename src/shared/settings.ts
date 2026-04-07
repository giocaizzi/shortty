export interface SearchSettings {
  keyWeight: number;
  commandWeight: number;
  sourceWeight: number;
  contextWeight: number;
  threshold: number;
}

export interface AppSettings {
  launchAtLogin: boolean;
  showDockIcon: boolean;
  theme: 'light' | 'dark' | 'system';
  globalShortcut: string;
  windowPosition: 'center' | 'top-center' | 'mouse';
  disabledParsers: string[];
  search: SearchSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: true,
  showDockIcon: false,
  theme: 'system',
  globalShortcut: 'CommandOrControl+Shift+Space',
  windowPosition: 'top-center',
  disabledParsers: [],
  search: {
    keyWeight: 0.4,
    commandWeight: 0.4,
    sourceWeight: 0.1,
    contextWeight: 0.1,
    threshold: 0.35,
  },
};
