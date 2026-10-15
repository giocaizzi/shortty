/**
 * Whether the app runs on macOS. `process` does not exist in the sandboxed
 * renderer, so the preload exposes the platform.
 */
export function isMacPlatform(): boolean {
  return window.electronAPI.platform === 'darwin';
}

export function isWindowsPlatform(): boolean {
  return window.electronAPI.platform === 'win32';
}

/** The installed app's `--reset-settings` command (docs/runbooks/reset-settings.md). */
export function resetSettingsCommand(platform: string): string {
  if (platform === 'darwin') return '/Applications/Shortty.app/Contents/MacOS/shortty --reset-settings';
  // The Squirrel stub launcher, which starts the installed version; also works from Win+R.
  if (platform === 'win32') return '%LOCALAPPDATA%\\shortty\\shortty.exe --reset-settings';
  return 'shortty --reset-settings';
}
