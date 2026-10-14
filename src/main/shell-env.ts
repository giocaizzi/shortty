import { spawn } from 'node:child_process';
import log from './logger';

const MARKER = '__SHORTTY_PATH__';
const DEFAULT_TIMEOUT_MS = 3000;

/** Login-shell entries first (user order), then any current entries it lacks. */
export function mergePaths(loginPath: string, currentPath: string): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const dir of [...loginPath.split(':'), ...currentPath.split(':')]) {
    if (!dir || !dir.startsWith('/') || seen.has(dir)) continue;
    seen.add(dir);
    merged.push(dir);
  }
  return merged.join(':');
}

/** Run `$SHELL -ilc` and return the PATH it prints between markers, or null. */
function readLoginShellPath(shell: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(shell, ['-ilc', `printf '%s%s%s' '${MARKER}' "$PATH" '${MARKER}'`], {
        // stdin closed: rc files that prompt (update checks) must not block
        stdio: ['ignore', 'pipe', 'ignore'],
        detached: true,
        env: { ...env, DISABLE_AUTO_UPDATE: 'true', TERM: env.TERM ?? 'dumb' },
      });
    } catch {
      resolve(null);
      return;
    }

    // Give up on the shell: kill its whole process group (rc files may have
    // started children) so nothing keeps running after we stop reading.
    const abandon = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      child.stdout?.destroy();
      done(null);
    };

    const timer = setTimeout(abandon, timeoutMs);

    let out = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf-8');
      if (out.length > 1024 * 1024) abandon();
    });
    child.on('error', () => done(null));
    child.on('close', () => {
      // rc files may print banners: take the text between the markers
      const match = out.match(new RegExp(`${MARKER}([^\\n]*?)${MARKER}`));
      done(match ? match[1] : null);
    });
  });
}

/**
 * A macOS app launched from Finder, the Dock or at login inherits launchd's
 * PATH (/usr/bin:/bin:/usr/sbin:/sbin), so Homebrew, ~/.local/bin etc. are
 * missing from the commands index and from man/--help lookups. Import the
 * user's login-shell PATH once at startup; on any failure keep the current one.
 */
export async function importLoginShellPath(
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (process.platform === 'win32') return;
  const shell = env.SHELL;
  if (!shell || !shell.startsWith('/')) return;

  const loginPath = await readLoginShellPath(shell, env, timeoutMs);
  if (!loginPath) {
    log.warn(`Could not read PATH from login shell ${shell}; keeping inherited PATH`);
    return;
  }
  env.PATH = mergePaths(loginPath, env.PATH ?? '');
  log.info(`PATH imported from login shell (${env.PATH.split(':').length} entries)`);
}
