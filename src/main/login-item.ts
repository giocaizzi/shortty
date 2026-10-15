import type { Settings } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * app.setLoginItemSettings() argument for the Launch at login setting. A
 * Squirrel install on Windows keeps each version in its own app-x.y.z folder
 * and a stub launcher with the same name one folder up, which always starts
 * the latest version: the login item points there so it survives updates.
 */
export function loginItemSettings(
  openAtLogin: boolean,
  platform: NodeJS.Platform = process.platform,
  execPath: string = process.execPath,
  exists: (p: string) => boolean = existsSync,
): Settings {
  if (platform !== 'win32') return { openAtLogin };
  const { dirname, basename, resolve } = path.win32;
  const stub = resolve(dirname(execPath), '..', basename(execPath));
  return exists(stub) ? { openAtLogin, path: stub } : { openAtLogin };
}
