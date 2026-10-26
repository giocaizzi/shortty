import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';

/** Hard limit for a `--help` invocation (docs/spec.md §7.5: 2 seconds, hard kill). */
const HELP_TIMEOUT_MS = 2000;
/** A cold PowerShell start alone takes 5-15 s, so a `.ps1` probe gets longer. */
const PS1_HELP_TIMEOUT_MS = 15_000;

/** The hard limit for probing `bin`: longer for `.ps1` scripts, which run through PowerShell. */
export function helpTimeoutMs(bin: string): number {
  return win32.extname(bin).toLowerCase() === '.ps1' ? PS1_HELP_TIMEOUT_MS : HELP_TIMEOUT_MS;
}
/** Output cap per invocation; output beyond this is discarded and the process killed. */
const HELP_MAX_BYTES = 1024 * 1024;

export interface SandboxResult {
  /** stdout followed by stderr (help is often printed to stderr) */
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

/** Variables a probed binary may see; everything else (tokens, keys) is dropped. */
const ENV_ALLOWLIST = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'MANPATH'];

/**
 * Windows also needs these to start programs at all (SystemRoot, COMSPEC,
 * PATHEXT) and to find the user's folders. Matched case-insensitively there
 * (the variable is "Path"), keeping each key's own spelling.
 */
const WINDOWS_ENV_ALLOWLIST = new Set([
  ...ENV_ALLOWLIST, 'SYSTEMROOT', 'WINDIR', 'PATHEXT', 'COMSPEC', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'TEMP', 'TMP', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'HOMEDRIVE', 'HOMEPATH',
  'USERNAME', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
  // Without its module cache PowerShell rebuilds it at every start (seconds, past the timeout)
  'PSMODULEANALYSISCACHEPATH',
]);

/**
 * Environment for help/man invocations: only an allowlist of the user's
 * variables (so secrets never reach arbitrary binaries), no colours, no
 * pagers, and editors replaced by `true` so a command that misreads its
 * arguments cannot open an interactive session or block on a prompt.
 */
export function sandboxEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const win = process.platform === 'win32';
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    const allowed = win ? WINDOWS_ENV_ALLOWLIST.has(key.toUpperCase()) : ENV_ALLOWLIST.includes(key);
    if (allowed || key.startsWith('LC_')) env[key] = value;
  }
  // Windows has no cat or true: an empty pager means none (git, aws), and
  // ":" is git's no-op editor; any other tool fails to start ":" and gives up
  const pager = win ? '' : 'cat';
  const editor = win ? ':' : 'true';
  return {
    ...env,
    NO_COLOR: '1',
    TERM: 'dumb',
    PAGER: pager,
    MANPAGER: pager,
    GIT_PAGER: pager,
    EDITOR: editor,
    VISUAL: editor,
    GIT_EDITOR: editor,
    GIT_TERMINAL_PROMPT: '0',
    HOMEBREW_NO_AUTO_UPDATE: '1',
    HOMEBREW_NO_ANALYTICS: '1',
  };
}

/** Arguments cmd.exe and a batch file's %1..%9 take as is: no spaces, quotes, %, ^, &, |, or the , ; = delimiters. */
const CMD_SAFE_ARG = /^[\w.+\-/:@]+$/;

/**
 * The program and argv that run `bin args` on Windows: .cmd/.bat through
 * `cmd.exe /d /s /c` (Node refuses to spawn them directly), .ps1 through
 * PowerShell without profile or prompts. cmd re-parses its command line, so
 * an argument or path it could expand (%VAR%, ^, quotes) is refused rather
 * than escaped. Elsewhere, and for .exe, the binary runs as is.
 */
export function windowsCommand(bin: string, args: string[]): { file: string; args: string[]; verbatim: boolean } {
  const ext = win32.extname(bin).toLowerCase();
  if (ext === '.cmd' || ext === '.bat') {
    // ponytail: refuse instead of escaping; add cmd metacharacter escaping if a real probe needs it
    if (/["%!^\r\n]/.test(bin) || !args.every((a) => CMD_SAFE_ARG.test(a))) {
      throw new Error(`Refusing to run ${bin} through cmd.exe with these arguments`);
    }
    const line = [`"${bin}"`, ...args].join(' ');
    return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/v:off', '/s', '/c', `"${line}"`], verbatim: true };
  }
  if (ext === '.ps1') {
    return {
      file: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', bin, ...args],
      verbatim: false,
    };
  }
  return { file: bin, args, verbatim: false };
}

interface RunOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Extra variables set on top of the sandboxed environment. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Run `bin args` in a throwaway cwd with stdin closed, a sanitized env, a hard
 * timeout (SIGKILL to the whole process group; `helpTimeoutMs` by default)
 * and an output cap.
 * Rejects only if the process cannot be spawned.
 */
export async function runSandboxed(
  bin: string,
  args: string[],
  { timeoutMs = helpTimeoutMs(bin), maxBytes = HELP_MAX_BYTES, env = {} }: RunOptions = {},
): Promise<SandboxResult> {
  const cwd = await mkdtemp(join(tmpdir(), 'shortty-help-'));
  try {
    return await new Promise<SandboxResult>((resolve, reject) => {
      const win = process.platform === 'win32';
      const useGroup = !win;
      const command = win ? windowsCommand(bin, args) : { file: bin, args, verbatim: false };
      const child = spawn(command.file, command.args, {
        cwd,
        // tmux finds its server through TMUX_TMPDIR: a probe (tmux new-session --help)
        // must never reach the user's running server
        env: { ...sandboxEnv(), TMUX_TMPDIR: cwd, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: useGroup,
        windowsHide: true,
        windowsVerbatimArguments: command.verbatim,
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
          // No process groups on Windows: taskkill /T ends the tree (cmd.exe and the script's children)
          else if (win && child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => undefined);
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
    // A killed Windows process may hold the directory for a moment (EBUSY): retry, then give up
    await rm(cwd, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined);
  }
}
