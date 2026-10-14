import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Resolve a config path with tilde and environment variable expansion.
 */
export function resolvePath(p: string): string {
  let resolved = p;

  // Tilde expansion
  if (resolved.startsWith('~/')) {
    resolved = join(homedir(), resolved.slice(2));
  }

  // Environment variable expansion: $HOME, $XDG_CONFIG_HOME, %APPDATA%, %LOCALAPPDATA%
  resolved = resolved.replace(/\$(\w+)/g, (_, name) => process.env[name] ?? '');
  resolved = resolved.replace(/%(\w+)%/g, (_, name) => process.env[name] ?? '');

  return resolve(resolved);
}

/**
 * Resolve an array of paths for the current platform from a cheatsheet defaultPaths map.
 */
export function resolveDefaultPaths(
  defaultPaths: Partial<Record<'darwin' | 'win32' | 'linux', string[]>> | undefined,
): string[] {
  if (!defaultPaths) return [];
  const platform = process.platform as 'darwin' | 'win32' | 'linux';
  const paths = defaultPaths[platform];
  if (!paths) return [];
  return paths.map(resolvePath);
}
