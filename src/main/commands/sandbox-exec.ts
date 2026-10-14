import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Hard limit for a `--help` invocation (SPECS §7.5: 2 seconds, hard kill). */
const HELP_TIMEOUT_MS = 2000;
/** Output cap per invocation; output beyond this is discarded and the process killed. */
const HELP_MAX_BYTES = 1024 * 1024;

export interface SandboxResult {
  /** stdout followed by stderr (help is often printed to stderr) */
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

/**
 * Environment for help/man invocations: no colours, no pagers, and editors
 * replaced by `true` so a command that misreads its arguments cannot open an
 * interactive session or block on a prompt.
 */
export function sandboxEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  delete env.CLICOLOR_FORCE;
  delete env.FORCE_COLOR;
  return {
    ...env,
    NO_COLOR: '1',
    TERM: 'dumb',
    PAGER: 'cat',
    MANPAGER: 'cat',
    GIT_PAGER: 'cat',
    EDITOR: 'true',
    VISUAL: 'true',
    GIT_EDITOR: 'true',
    GIT_TERMINAL_PROMPT: '0',
    HOMEBREW_NO_AUTO_UPDATE: '1',
    HOMEBREW_NO_ANALYTICS: '1',
  };
}

interface RunOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * Run `bin args` in a throwaway cwd with stdin closed, a sanitized env, a hard
 * timeout (SIGKILL to the whole process group) and an output cap.
 * Rejects only if the process cannot be spawned.
 */
export async function runSandboxed(
  bin: string,
  args: string[],
  { timeoutMs = HELP_TIMEOUT_MS, maxBytes = HELP_MAX_BYTES }: RunOptions = {},
): Promise<SandboxResult> {
  const cwd = await mkdtemp(join(tmpdir(), 'shortty-help-'));
  try {
    return await new Promise<SandboxResult>((resolve, reject) => {
      const useGroup = process.platform !== 'win32';
      const child = spawn(bin, args, {
        cwd,
        env: sandboxEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: useGroup,
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let size = 0;
      let truncated = false;
      let timedOut = false;
      let settled = false;
      let forceTimer: NodeJS.Timeout | undefined;

      const kill = () => {
        try {
          if (useGroup && child.pid) process.kill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
        // A grandchild that escaped the group may keep the pipes open: don't wait forever
        forceTimer ??= setTimeout(() => finish(null), 500);
      };

      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceTimer) clearTimeout(forceTimer);
        child.stdout?.destroy();
        child.stderr?.destroy();
        resolve({
          output: Buffer.concat(stdout).toString('utf-8') + Buffer.concat(stderr).toString('utf-8'),
          exitCode,
          timedOut,
          truncated,
        });
      };

      const collect = (target: Buffer[]) => (chunk: Buffer) => {
        if (truncated) return;
        const room = maxBytes - size;
        if (chunk.length >= room) {
          target.push(chunk.subarray(0, room));
          size = maxBytes;
          truncated = true;
          kill();
        } else {
          target.push(chunk);
          size += chunk.length;
        }
      };

      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, timeoutMs);

      child.stdout?.on('data', collect(stdout));
      child.stderr?.on('data', collect(stderr));
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceTimer) clearTimeout(forceTimer);
        reject(err);
      });
      child.on('close', (code) => finish(code));
    });
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
  }
}
