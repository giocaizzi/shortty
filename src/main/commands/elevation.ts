import { win32 } from 'node:path';
import { runSandboxed } from './sandbox-exec';

/** Mandatory integrity levels of an elevated token: High (admin) and System. */
const ELEVATED_SIDS = ['S-1-16-12288', 'S-1-16-16384'];

let elevated: Promise<boolean> | undefined;

/**
 * Whether Shortty runs elevated on Windows, the equivalent of running as root
 * (docs/spec.md §7.5): `whoami /groups` lists the token's integrity level.
 * Run once by full path, so a `whoami` on PATH is never picked up. When the
 * check itself fails, the answer is "elevated", so nothing gets probed.
 */
export function isWindowsElevated(): Promise<boolean> {
  elevated ??= runSandboxed(
    win32.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'whoami.exe'),
    ['/groups'],
    { timeoutMs: 5000 },
  )
    .then((r) => r.timedOut || r.exitCode !== 0 || ELEVATED_SIDS.some((sid) => r.output.includes(sid)))
    .catch(() => true);
  return elevated;
}
