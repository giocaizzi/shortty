import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../src/main/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { importLoginShellPath, mergePaths } from '../../src/main/shell-env';
import { REAL_PROCESS_TEST_MS, SLOW_HOST_MS } from '../helpers';

const LAUNCHD_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
let dir: string;

/** A fake login shell: runs `-ilc <cmd>` through /bin/sh with a chosen PATH and rc noise. */
function fakeShell(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'shortty-shell-env-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('mergePaths', () => {
  it('puts login entries first and keeps inherited ones it lacks, without duplicates', () => {
    expect(mergePaths('/opt/homebrew/bin:/usr/bin:/bin', LAUNCHD_PATH))
      .toBe('/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');
  });

  it('drops empty and relative entries', () => {
    expect(mergePaths('/a::./b:~/c:/a', '/d')).toBe('/a:/d');
  });
});

describe.runIf(process.platform !== 'win32')('importLoginShellPath', { timeout: REAL_PROCESS_TEST_MS }, () => {
  it('imports the PATH printed by the login shell, ignoring rc-file output', async () => {
    // rc noise on stdout before and after the command, like a banner or nvm message
    const shell = fakeShell('zsh', 'echo "Welcome!"; PATH=/opt/homebrew/bin:/Users/u/.local/bin:/usr/bin; export PATH; /bin/sh -c "$2"; echo bye');
    const env: NodeJS.ProcessEnv = { SHELL: shell, PATH: LAUNCHD_PATH };
    await importLoginShellPath(env, SLOW_HOST_MS);
    expect(env.PATH).toBe('/opt/homebrew/bin:/Users/u/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin');
  });

  it('passes -ilc so login and interactive rc files are read', async () => {
    const shell = fakeShell('args', 'PATH="/flags/$1"; export PATH; /bin/sh -c "$2"');
    const env: NodeJS.ProcessEnv = { SHELL: shell, PATH: LAUNCHD_PATH };
    await importLoginShellPath(env, SLOW_HOST_MS);
    expect(env.PATH?.split(':')[0]).toBe('/flags/-ilc');
  });

  it('keeps the inherited PATH when the shell hangs (timeout)', async () => {
    const shell = fakeShell('hang', 'sleep 30');
    const env: NodeJS.ProcessEnv = { SHELL: shell, PATH: LAUNCHD_PATH };
    const started = Date.now();
    await importLoginShellPath(env, 300);
    expect(env.PATH).toBe(LAUNCHD_PATH);
    // Gave up near the 300 ms timeout, long before `sleep 30` ends
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('keeps the inherited PATH when the shell fails or prints nothing', async () => {
    const env: NodeJS.ProcessEnv = { SHELL: fakeShell('fail', 'exit 1'), PATH: LAUNCHD_PATH };
    await importLoginShellPath(env, SLOW_HOST_MS);
    expect(env.PATH).toBe(LAUNCHD_PATH);

    const missing: NodeJS.ProcessEnv = { SHELL: join(dir, 'no-such-shell'), PATH: LAUNCHD_PATH };
    await importLoginShellPath(missing, SLOW_HOST_MS);
    expect(missing.PATH).toBe(LAUNCHD_PATH);
  });

  it('does nothing without an absolute $SHELL', async () => {
    const env: NodeJS.ProcessEnv = { PATH: LAUNCHD_PATH };
    await importLoginShellPath(env);
    expect(env.PATH).toBe(LAUNCHD_PATH);
  });

  it('kills the shell and its children when it floods stdout', async () => {
    const pidFile = join(dir, 'flood.pid');
    // An rc file that starts a background job, then never stops printing
    const shell = fakeShell(
      'flood',
      `sleep 30 & echo $! > '${pidFile}'; while :; do printf '%01000d\\n' 0; done`,
    );
    const env: NodeJS.ProcessEnv = { SHELL: shell, PATH: LAUNCHD_PATH };
    await importLoginShellPath(env, SLOW_HOST_MS);
    expect(env.PATH).toBe(LAUNCHD_PATH);

    const pid = Number(readFileSync(pidFile, 'utf-8'));
    const alive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    await vi.waitFor(() => expect(alive()).toBe(false), { timeout: SLOW_HOST_MS });
  });
});
