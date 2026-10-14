// Real-process tests for the --help sandbox (POSIX shells only).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSandboxed, sandboxEnv } from '../../../src/main/commands/sandbox-exec';

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
    const result = await runSandboxed(bin, [], { timeoutMs: 1500 });
    expect(result.timedOut).toBe(false);
    expect(result.output).toBe('got:[]\n');
  });

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
  it('keeps PATH and HOME and removes forced colour', () => {
    const env = sandboxEnv({ PATH: '/bin', HOME: '/home/u', FORCE_COLOR: '1', CLICOLOR_FORCE: '1' });
    expect(env.PATH).toBe('/bin');
    expect(env.HOME).toBe('/home/u');
    expect(env.FORCE_COLOR).toBeUndefined();
    expect(env.CLICOLOR_FORCE).toBeUndefined();
    expect(env.TERM).toBe('dumb');
  });
});
