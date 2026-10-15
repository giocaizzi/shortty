import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const XDG_DEFAULTS: Record<string, string> = {
  XDG_CONFIG_HOME: '.config',
  XDG_DATA_HOME: '.local/share',
  XDG_STATE_HOME: '.local/state',
  XDG_CACHE_HOME: '.cache',
};

function envOrDefault(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === 'HOME') return homedir();
  if (XDG_DEFAULTS[name]) return join(homedir(), XDG_DEFAULTS[name]);
  return '';
}

/**
 * Resolve a config path with tilde and environment variable expansion.
 */
export function resolvePath(p: string): string {
  let resolved = p;

  // Tilde expansion
  if (resolved.startsWith('~/')) {
    resolved = join(homedir(), resolved.slice(2));
  }

  // Environment variable expansion: $HOME, ${XDG_CONFIG_HOME}, %APPDATA%, %LOCALAPPDATA%.
  // XDG base directories fall back to their spec defaults when unset.
  resolved = resolved.replace(
    /\$\{(\w+)\}|\$(\w+)/g,
    (_, braced: string | undefined, bare: string | undefined) => envOrDefault(braced ?? bare ?? ''),
  );
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
