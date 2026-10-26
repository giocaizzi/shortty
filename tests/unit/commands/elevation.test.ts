import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SandboxResult } from '../../../src/main/commands/sandbox-exec';

vi.mock('../../../src/main/commands/sandbox-exec', () => ({
  runSandboxed: vi.fn(),
}));

import { runSandboxed } from '../../../src/main/commands/sandbox-exec';

const mockRun = vi.mocked(runSandboxed);

// Excerpts of `whoami /groups` output
const MEDIUM = 'Mandatory Label\\Medium Mandatory Level Label S-1-16-8192';
const HIGH = 'BUILTIN\\Administrators Alias S-1-5-32-544 Mandatory group, Enabled by default, Enabled group, Group owner\n'
  + 'Mandatory Label\\High Mandatory Level Label S-1-16-12288';
const SYSTEM = 'Mandatory Label\\System Mandatory Level Label S-1-16-16384';

function result(overrides: Partial<SandboxResult>): SandboxResult {
  return { output: '', exitCode: 0, timedOut: false, truncated: false, ...overrides };
}

/** A fresh module, so the once-per-session answer is not shared between tests. */
async function isWindowsElevated(): Promise<boolean> {
  vi.resetModules();
  const mod = await import('../../../src/main/commands/elevation');
  return mod.isWindowsElevated();
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SystemRoot = 'C:\\Windows';
});

describe('isWindowsElevated', () => {
  it('runs whoami /groups by its full System32 path', async () => {
    mockRun.mockResolvedValue(result({ output: MEDIUM }));
    expect(await isWindowsElevated()).toBe(false);
    expect(mockRun).toHaveBeenCalledWith('C:\\Windows\\System32\\whoami.exe', ['/groups'], expect.anything());
  });

  it('is elevated with a High or System integrity level', async () => {
    mockRun.mockResolvedValue(result({ output: HIGH }));
    expect(await isWindowsElevated()).toBe(true);
    mockRun.mockResolvedValue(result({ output: SYSTEM }));
    expect(await isWindowsElevated()).toBe(true);
  });

  it('counts as elevated when the check fails, times out or cannot start', async () => {
    mockRun.mockResolvedValue(result({ output: MEDIUM, exitCode: 1 }));
    expect(await isWindowsElevated()).toBe(true);
    mockRun.mockResolvedValue(result({ output: '', timedOut: true }));
    expect(await isWindowsElevated()).toBe(true);
    mockRun.mockRejectedValue(new Error('ENOENT'));
    expect(await isWindowsElevated()).toBe(true);
  });

  it('runs once per session', async () => {
    vi.resetModules();
    const { isWindowsElevated: check } = await import('../../../src/main/commands/elevation');
    mockRun.mockResolvedValue(result({ output: MEDIUM }));
    expect(await check()).toBe(false);
    expect(await check()).toBe(false);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});
