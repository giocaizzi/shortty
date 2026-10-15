import { access, constants, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathDirectories } from '../commands/path-scanner';
import { runSandboxed } from '../commands/sandbox-exec';
import log from '../logger';

/** First executable `name` on PATH, like the shell resolves it; null when missing. */
export async function findOnPath(name: string, pathValue?: string): Promise<string | null> {
  for (const dir of pathDirectories(pathValue)) {
    const candidate = `${dir}/${name}`;
    try {
      await access(candidate, constants.X_OK);
      if ((await stat(candidate)).isFile()) return candidate;
    } catch { /* not here */ }
  }
  return null;
}

/** Cached outputs, keyed by binary path + mtime + arguments. */
const cache = new Map<string, Promise<string | null>>();

/**
 * Run a shell (`zsh`, `bash`) without the user's rc files to list its
 * built-in key bindings. Goes through the `--help` sandbox (temp cwd, stdin
 * closed, env allowlist, timeout) and caches the output per binary path and
 * mtime, so a shell upgrade is picked up and a config edit is not re-spawned.
 * `shell` is a name looked up on PATH or an absolute path. Returns null when
 * the shell is missing or fails.
 */
export async function shellDefaults(
  shell: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
  timeoutMs?: number,
): Promise<string | null> {
  const bin = isAbsolute(shell) ? shell : await findOnPath(shell);
  if (!bin) return null;
  let mtime: number;
  try {
    mtime = (await stat(bin)).mtimeMs;
  } catch {
    return null;
  }
  const key = [bin, mtime, ...args].join('\0');
  let pending = cache.get(key);
  if (!pending) {
    pending = runSandboxed(bin, args, { env, timeoutMs })
      .then((r) => (r.timedOut || r.exitCode !== 0 ? null : r.output))
      .catch(() => null);
    cache.set(key, pending);
  }
  const output = await pending;
  if (output === null) {
    cache.delete(key);
    log.warn(`Could not read ${shell} default key bindings`);
  }
  return output;
}
