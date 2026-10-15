// Real-process tests for the --help sandbox, per OS, and its Windows command lines.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { runSandboxed, sandboxEnv, windowsCommand } from '../../../src/main/commands/sandbox-exec';
import { withPlatform } from '../../helpers';

const posix = process.platform !== 'win32';
let dir: string;

function script(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'shortty-sandbox-test-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe.runIf(posix)('runSandboxed', () => {
  it('captures stdout followed by stderr and the exit code', async () => {
    const bin = script('both', 'echo out; echo "usage: both [-x]" >&2; exit 2');
    const result = await runSandboxed(bin, ['--help']);
    expect(result).toEqual({ output: 'out\nusage: both [-x]\n', exitCode: 2, timedOut: false, truncated: false });
  });

  it('kills a command that hangs, including its children, at the timeout', async () => {
    const bin = script('hang', 'sleep 30 & sleep 30; wait');
    const started = Date.now();
    const result = await runSandboxed(bin, ['--help'], { timeoutMs: 300 });
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('stops a command that prints megabytes at the output cap', async () => {
    const bin = script('flood', 'while :; do echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx; done');
    const result = await runSandboxed(bin, ['--help'], { maxBytes: 64 * 1024, timeoutMs: 5000 });
    expect(result.truncated).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.output.length).toBe(64 * 1024);
  });

  it('closes stdin so a command waiting for input does not hang', async () => {
    const bin = script('reader', 'read line; echo "got:[$line]"');
    // Generous: a loaded host can take seconds just to start sh. A hang
    // would still show up as timedOut.
    const result = await runSandboxed(bin, [], { timeoutMs: 10000 });
    expect(result.timedOut).toBe(false);
    expect(result.output).toBe('got:[]\n');
  }, 15000);

  it('runs in a throwaway directory that is removed afterwards', async () => {
    const bin = script('where', 'pwd; touch created-by-help');
    const result = await runSandboxed(bin, []);
    const cwd = result.output.trim();
    expect(cwd).toMatch(/shortty-help-/);
    expect(cwd).not.toBe(process.cwd());
    expect(existsSync(cwd)).toBe(false);
  });

  it('disables pagers, colour and editors', async () => {
    const bin = script('env', 'echo "$PAGER|$MANPAGER|$GIT_PAGER|$NO_COLOR|$EDITOR|$GIT_EDITOR|${CLICOLOR_FORCE-unset}"');
    const result = await runSandboxed(bin, []);
    expect(result.output).toBe('cat|cat|cat|1|true|true|unset\n');
  });

  it('points tmux at the throwaway directory, away from the user\'s server', async () => {
    const bin = script('tmuxdir', 'echo "$TMUX_TMPDIR"; pwd');
    const [tmuxDir, cwd] = (await runSandboxed(bin, [])).output.trim().split('\n');
    expect(tmuxDir).toMatch(/shortty-help-/);
    expect(basename(tmuxDir)).toBe(basename(cwd));
  });

  it('passes arguments without a shell (no injection)', async () => {
    const bin = script('args', 'for a in "$@"; do echo "[$a]"; done');
    const result = await runSandboxed(bin, ['$(touch pwned)', ';', '--help']);
    expect(result.output).toBe('[$(touch pwned)]\n[;]\n[--help]\n');
  });

  it('decodes invalid UTF-8 without failing', async () => {
    const bin = script('latin1', "printf 'Usage: x \\377\\376 ok\\n'");
    const result = await runSandboxed(bin, []);
    expect(result.output).toContain('Usage: x');
    expect(result.output).toContain('ok');
  });

  it('rejects when the binary does not exist', async () => {
    await expect(runSandboxed(join(dir, 'missing'), [])).rejects.toThrow();
  });
});

describe('sandboxEnv', () => {
  withPlatform('darwin');

  it('keeps PATH and HOME and removes forced colour', () => {
    const env = sandboxEnv({ PATH: '/bin', HOME: '/home/u', FORCE_COLOR: '1', CLICOLOR_FORCE: '1' });
    expect(env.PATH).toBe('/bin');
    expect(env.HOME).toBe('/home/u');
    expect(env.FORCE_COLOR).toBeUndefined();
    expect(env.CLICOLOR_FORCE).toBeUndefined();
    expect(env.TERM).toBe('dumb');
  });

  it('drops variables outside the allowlist, such as tokens', () => {
    const env = sandboxEnv({ PATH: '/bin', LC_ALL: 'it_IT.UTF-8', GITHUB_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'y' });
    expect(env.LC_ALL).toBe('it_IT.UTF-8');
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });
});

describe('sandboxEnv on Windows', () => {
  withPlatform('win32');

  it('keeps what Windows needs to start programs, matching names case-insensitively', () => {
    const env = sandboxEnv({
      Path: 'C:\\Windows\\System32', SystemRoot: 'C:\\Windows', PATHEXT: '.EXE', ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      USERPROFILE: 'C:\\Users\\me', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', temp: 'C:\\Temp', GITHUB_TOKEN: 'x',
    });
    expect(env.Path).toBe('C:\\Windows\\System32');
    expect(env.PATH).toBeUndefined();
    expect(env.SystemRoot).toBe('C:\\Windows');
    expect(env.ComSpec).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(env['ProgramFiles(x86)']).toBe('C:\\Program Files (x86)');
    expect(env.temp).toBe('C:\\Temp');
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });

  it('names no Unix pager or editor', () => {
    const env = sandboxEnv({});
    expect([env.PAGER, env.MANPAGER, env.GIT_PAGER]).toEqual(['', '', '']);
    expect([env.EDITOR, env.VISUAL, env.GIT_EDITOR]).toEqual([':', ':', ':']);
  });
});

describe('windowsCommand', () => {
  it('runs .exe directly', () => {
    expect(windowsCommand('C:\\tools\\rg.exe', ['--help'])).toEqual({ file: 'C:\\tools\\rg.exe', args: ['--help'], verbatim: false });
  });

  it('runs .cmd/.bat through cmd.exe /d /s /c with the path quoted', () => {
    const { file, args, verbatim } = windowsCommand('C:\\Program Files (x86)\\npm\\tsc.CMD', ['build', '--help']);
    expect(file).toMatch(/cmd\.exe$/i);
    expect(args).toEqual(['/d', '/v:off', '/s', '/c', '""C:\\Program Files (x86)\\npm\\tsc.CMD" build --help"']);
    expect(verbatim).toBe(true);
    expect(windowsCommand('D:\\x.bat', ['-h']).args[4]).toBe('""D:\\x.bat" -h"');
  });

  it('refuses what cmd.exe would expand or split', () => {
    for (const arg of ['a&b', '%PATH%', 'a b', '"', 'a^b', 'a|b', 'a,b', 'a=b', '']) {
      expect(() => windowsCommand('D:\\x.cmd', [arg])).toThrow();
    }
    expect(() => windowsCommand('D:\\100%\\x.cmd', ['--help'])).toThrow();
  });

  it('runs .ps1 through PowerShell without profile, prompts or execution policy', () => {
    expect(windowsCommand('C:\\s\\x.ps1', ['--help'])).toEqual({
      file: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\s\\x.ps1', '--help'],
      verbatim: false,
    });
  });
});

describe.runIf(!posix)('runSandboxed on Windows (real processes)', () => {
  function file(name: string, body: string): string {
    const path = join(dir, name);
    writeFileSync(path, body);
    return path;
  }

  it('runs a .cmd with its arguments, hidden, in a throwaway directory', async () => {
    const bin = file('both.cmd', '@echo off\r\necho out %1 %2\r\ncd\r\nexit /b 2\r\n');
    const result = await runSandboxed(bin, ['sub', '--help']);
    const [line, cwd] = result.output.trim().split(/\r?\n/);
    expect(line).toBe('out sub --help');
    expect(cwd).toMatch(/shortty-help-/);
    expect(result.exitCode).toBe(2);
    expect(existsSync(cwd)).toBe(false);
  });

  it('runs a .ps1 through PowerShell', async () => {
    const bin = file('hello.ps1', 'Write-Output "ps $($args -join \',\')"\r\n');
    // A cold PowerShell start takes 5-15s on the runner (warm: under 0.5s)
    const result = await runSandboxed(bin, ['--help'], { timeoutMs: 60000 });
    expect(result).toMatchObject({ output: 'ps --help\r\n', timedOut: false });
  }, 90000);

  it('kills the whole tree at the timeout', async () => {
    const bin = file('hang.cmd', '@echo off\r\nping -n 30 127.0.0.1 > nul\r\n');
    const started = Date.now();
    const result = await runSandboxed(bin, ['--help'], { timeoutMs: 500 });
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('never passes secrets from the environment', async () => {
    process.env.SHORTTY_SECRET = 'leak';
    try {
      const bin = file('env.cmd', '@echo off\r\necho [%SHORTTY_SECRET%][%SystemRoot%]\r\n');
      const result = await runSandboxed(bin, []);
      // An unset variable expands to nothing in a batch file
      expect(result.output.trim()).toMatch(/^\[\]\[.+Windows\]$/i);
    } finally {
      delete process.env.SHORTTY_SECRET;
    }
  });
});
