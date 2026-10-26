// Real-process tests for running a shell to list its default key bindings.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findOnPath, shellDefaults } from '../../../src/main/parsers/shell-defaults';

const posix = process.platform !== 'win32';

describe.runIf(posix)('shellDefaults', () => {
  let dir: string;
  let originalPath: string | undefined;
  let counter: string;

  /** A fake shell on the test PATH that logs each run and prints its env. */
  function fakeShell(name: string, body: string): string {
    const bin = join(dir, name);
    writeFileSync(bin, `#!/bin/sh\necho run >> "${counter}"\n${body}\n`);
    chmodSync(bin, 0o755);
    return bin;
  }
  const runs = () => readFileSync(counter, 'utf-8').split('\n').filter(Boolean).length;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shortty-shell-defaults-'));
    counter = join(dir, 'runs.log');
    writeFileSync(counter, '');
    originalPath = process.env.PATH;
    process.env.PATH = `${join(dir, 'missing')}:${dir}`;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds the first executable on PATH', async () => {
    const bin = fakeShell('fakesh-find', 'true');
    expect(await findOnPath('fakesh-find')).toBe(bin);
    expect(await findOnPath('fakesh-nope')).toBeNull();
  });

  it('runs the shell sandboxed with extra env and caches per binary mtime', async () => {
    const bin = fakeShell('fakesh-cache', 'echo "args=$* inputrc=$INPUTRC secret=$SHORTTY_SECRET cwd=$(pwd)"');
    process.env.SHORTTY_SECRET = 'leak';
    try {
      const first = await shellDefaults('fakesh-cache', ['-c', 'bind -p'], { INPUTRC: '/dev/null' });
      expect(first).toMatch(/^args=-c bind -p inputrc=\/dev\/null secret= cwd=.*shortty-help-/);
      expect(await shellDefaults('fakesh-cache', ['-c', 'bind -p'], { INPUTRC: '/dev/null' })).toBe(first);
      expect(runs()).toBe(1);

      // a new binary (shell upgrade) is run again
      utimesSync(bin, new Date(), new Date(Date.now() + 60_000));
      await shellDefaults('fakesh-cache', ['-c', 'bind -p'], { INPUTRC: '/dev/null' });
      expect(runs()).toBe(2);
    } finally {
      delete process.env.SHORTTY_SECRET;
    }
  });

  it('returns null when the shell is missing or fails, without caching the failure', async () => {
    expect(await shellDefaults('fakesh-missing', ['-c', 'x'])).toBeNull();
    fakeShell('fakesh-fail', 'exit 1');
    expect(await shellDefaults('fakesh-fail', ['-c', 'x'])).toBeNull();
    expect(await shellDefaults('fakesh-fail', ['-c', 'x'])).toBeNull();
    expect(runs()).toBe(2);
  });
});

describe.runIf(!posix)('findOnPath on Windows', () => {
  let dir: string;
  let first: string;
  let second: string;
  let originalPathext: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shortty-find-on-path-'));
    first = join(dir, 'first');
    second = join(dir, 'second');
    mkdirSync(first);
    mkdirSync(second);
    originalPathext = process.env.PATHEXT;
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
    // No execute bit on Windows: any existing file counts
    writeFileSync(join(first, 'tool'), '');
    writeFileSync(join(first, 'tool.cmd'), '');
    writeFileSync(join(second, 'tool.exe'), '');
    writeFileSync(join(second, 'script.ps1'), '');
    mkdirSync(join(first, 'dir.exe'));
  });

  afterEach(() => {
    process.env.PATHEXT = originalPathext;
    rmSync(dir, { recursive: true, force: true });
  });

  const pathValue = () => `${join(dir, 'missing')};${first};${second}`;

  it('tries each PATHEXT extension on a bare name, in PATH order', async () => {
    // tool.cmd in the first directory wins over tool.exe in the second; the extensionless "tool" is skipped
    expect(await findOnPath('tool', pathValue())).toBe(join(first, 'tool.cmd'));
    expect(await findOnPath('script', pathValue())).toBe(join(second, 'script.ps1'));
  });

  it('takes a name that already has its extension as is, case-insensitively', async () => {
    expect(await findOnPath('tool.exe', pathValue())).toBe(join(second, 'tool.exe'));
    expect(await findOnPath('TOOL.EXE', pathValue())).toBe(join(second, 'TOOL.EXE'));
  });

  it('skips directories and missing names', async () => {
    expect(await findOnPath('dir', pathValue())).toBeNull();
    expect(await findOnPath('nope', pathValue())).toBeNull();
  });
});
