import type { KeyPlatform } from '../../../shared/keys';

/**
 * The OS whose key names label shortcuts (macOS when unknown). `process` does
 * not exist in the sandboxed renderer, so the preload exposes the platform.
 */
export function keyPlatform(): KeyPlatform {
  const { platform } = window.electronAPI;
  return platform === 'win32' || platform === 'linux' ? platform : 'darwin';
}

/** The installed app's `--reset-settings` command (docs/runbooks/reset-settings.md). */
export function resetSettingsCommand(platform: string): string {
  if (platform === 'darwin') return '/Applications/Shortty.app/Contents/MacOS/shortty --reset-settings';
  // The Squirrel stub launcher, which starts the installed version; also works from Win+R.
  if (platform === 'win32') return '%LOCALAPPDATA%\\shortty\\shortty.exe --reset-settings';
  return 'shortty --reset-settings';
}
