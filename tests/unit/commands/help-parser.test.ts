import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseHelp, parseSubcommandHelp, isBlocklisted } from '../../../src/main/commands/parsers/help-parser';
import { assertDefined } from '../../helpers';

// Mock the sandboxed runner and fs
vi.mock('../../../src/main/commands/sandbox-exec', () => ({
  runSandboxed: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
  realpath: vi.fn(),
  open: vi.fn(),
}));

import { runSandboxed } from '../../../src/main/commands/sandbox-exec';
import { open, realpath, stat } from 'node:fs/promises';

const mockRun = vi.mocked(runSandboxed);
const mockStat = vi.mocked(stat);
const mockRealpath = vi.mocked(realpath);
const mockOpen = vi.mocked(open);

const MACH_O = Buffer.from('cffaedfe', 'hex');
const SHEBANG = Buffer.from('#!/b');

/** The binary's first bytes, as read by the trust check. */
function setMagic(bytes: Buffer) {
  mockOpen.mockResolvedValue({
    read: async (buf: Buffer) => ({ bytesRead: bytes.copy(buf), buffer: buf }),
    close: async () => undefined,
  } as unknown as Awaited<ReturnType<typeof open>>);
}

function setStat(uid: number, mode = 0o100755) {
  mockStat.mockResolvedValue({ uid, mode } as Awaited<ReturnType<typeof stat>>);
}

function setupMocks(helpOutput: string, overrides: Partial<Awaited<ReturnType<typeof runSandboxed>>> = {}) {
  setStat(0);
  setMagic(MACH_O);
  mockRun.mockResolvedValue({ output: helpOutput, exitCode: 0, timedOut: false, truncated: false, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRealpath.mockImplementation(async (p) => String(p));
});

const DOCKER_HELP = `Usage:  docker [OPTIONS] COMMAND

A self-sufficient runtime for containers

Common Commands:
  run         Create and run a new container from an image
  exec        Execute a command in a running container
  ps          List containers
  build       Build an image from a Dockerfile

Management Commands:
  builder     Manage builds
  container   Manage containers

Global Options:
  -D, --debug              Enable debug mode
      --host list          Daemon socket to connect to
  -l, --log-level string   Set the logging level
  -v, --version            Print version information and quit
`;

const SIMPLE_HELP = `Usage: mytool <input> [output]

A simple tool for processing files.

Options:
  -v, --verbose   Show verbose output
  -q, --quiet     Suppress output
`;

describe('isBlocklisted', () => {
  it('blocks dangerous commands', () => {
    expect(isBlocklisted('rm')).toBe(true);
    expect(isBlocklisted('ssh')).toBe(true);
    expect(isBlocklisted('python')).toBe(true);
  });

  it('allows safe commands', () => {
    expect(isBlocklisted('git')).toBe(false);
    expect(isBlocklisted('docker')).toBe(false);
    expect(isBlocklisted('curl')).toBe(false);
  });
});

describe('parseHelp', () => {
  it('extracts synopsis from Usage line', async () => {
    setupMocks(DOCKER_HELP);
    const result = await parseHelp('docker', '/opt/homebrew/bin/docker');

    assertDefined(result);
    expect(result.synopsis).toBe('docker [OPTIONS] COMMAND');
  });

  it('extracts description from text after Usage', async () => {
    setupMocks(DOCKER_HELP);
    const result = await parseHelp('docker', '/opt/homebrew/bin/docker');

    assertDefined(result);
    expect(result.longDescription).toBeDefined();
    expect(result.longDescription).toContain('self-sufficient runtime');
  });

  it('extracts subcommands from multiple sections', async () => {
    setupMocks(DOCKER_HELP);
    const result = await parseHelp('docker', '/opt/homebrew/bin/docker');

    assertDefined(result);
    const run = result.subcommands.find(sc => sc.name === 'docker run');
    assertDefined(run);
    expect(run.description).toContain('Create and run');

    const builder = result.subcommands.find(sc => sc.name === 'docker builder');
    assertDefined(builder);
  });

  it('extracts flags from Global Options section', async () => {
    setupMocks(DOCKER_HELP);
    const result = await parseHelp('docker', '/opt/homebrew/bin/docker');

    assertDefined(result);
    const debug = result.flags.find(f => f.short === '-D');
    assertDefined(debug);
    expect(debug.long).toBe('--debug');
  });

  it('extracts arguments from synopsis', async () => {
    setupMocks(SIMPLE_HELP);
    const result = await parseHelp('mytool', '/opt/homebrew/bin/mytool');

    assertDefined(result);
    expect(result.arguments.length).toBeGreaterThan(0);
    const input = result.arguments.find(a => a.name === 'input');
    assertDefined(input);
    expect(input.required).toBe(true);

    const output = result.arguments.find(a => a.name === 'output');
    assertDefined(output);
    expect(output.required).toBe(false);
  });

  it('returns null for blocklisted commands', async () => {
    const result = await parseHelp('rm', '/opt/homebrew/bin/rm');
    expect(result).toBeNull();
  });

  it('returns null when stat fails', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    const result = await parseHelp('git', '/opt/homebrew/bin/git');
    expect(result).toBeNull();
  });

  it('runs the binary with an argument array (no shell injection)', async () => {
    setupMocks(SIMPLE_HELP);
    await parseHelp('mytool', '/opt/homebrew/bin/mytool');

    expect(mockRun).toHaveBeenCalledWith('/opt/homebrew/bin/mytool', ['--help']);
  });

  it('returns null when the command had to be killed for hanging', async () => {
    setupMocks(SIMPLE_HELP, { timedOut: true, exitCode: null });
    expect(await parseHelp('mytool', '/opt/homebrew/bin/mytool')).toBeNull();
  });

  it('parses help printed by a command that exits non-zero', async () => {
    setupMocks(SIMPLE_HELP, { exitCode: 1 });
    const result = await parseHelp('mytool', '/opt/homebrew/bin/mytool');
    assertDefined(result);
    expect(result.flags).toHaveLength(2);
  });

  it('skips binaries owned by another user', async () => {
    setupMocks(SIMPLE_HELP);
    setStat(4242);
    expect(await parseHelp('mytool', '/usr/local/bin/mytool')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('skips group- or world-writable binaries', async () => {
    setupMocks(SIMPLE_HELP);
    for (const mode of [0o100775, 0o100757, 0o100777]) {
      setStat(0, mode);
      expect(await parseHelp('mytool', '/opt/homebrew/bin/mytool')).toBeNull();
    }
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('never probes the OS\'s own binaries (Xcode shims, keychain and GUI helpers)', async () => {
    setupMocks(SIMPLE_HELP);
    for (const bin of ['/usr/bin/clang', '/usr/sbin/tool', '/bin/ls', '/System/Library/x/tool', '/Applications/Xcode.app/Contents/Developer/usr/bin/xctrace']) {
      expect(await parseHelp('tool', bin)).toBeNull();
    }
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('probes native executables anywhere, including user-owned ones', async () => {
    setupMocks(SIMPLE_HELP);
    setStat(process.getuid?.() ?? 501);
    expect(await parseHelp('mytool', '/Users/me/bin/mytool')).not.toBeNull();
    setMagic(Buffer.from('7f454c46', 'hex'));
    expect(await parseHelp('mytool', '/Users/me/bin/mytool')).not.toBeNull();
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it('never probes a user script outside the trusted install prefixes', async () => {
    setupMocks(SIMPLE_HELP);
    setStat(process.getuid?.() ?? 501);
    setMagic(SHEBANG);
    for (const bin of ['/Users/me/bin/deploy', '/Users/me/.local/bin/deploy', '/tmp/x/deploy']) {
      expect(await parseHelp('deploy', bin)).toBeNull();
    }
    expect(await parseSubcommandHelp('/Users/me/bin/deploy', ['prod'], 'deploy prod')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('probes scripts under system and package-manager prefixes (resolved path)', async () => {
    setupMocks(SIMPLE_HELP);
    setMagic(SHEBANG);
    for (const bin of ['/usr/local/bin/tool', '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js', '/nix/store/abc-tool/bin/tool']) {
      expect(await parseHelp('tool', bin)).not.toBeNull();
    }
    // ~/.local/bin/ruff -> ~/.local/share/uv/tools/ruff/bin/ruff: judged by where it lives
    mockRealpath.mockResolvedValue(`${process.env.HOME}/.local/share/uv/tools/ruff/bin/ruff`);
    expect(await parseHelp('ruff', `${process.env.HOME}/.local/bin/ruff`)).not.toBeNull();
    expect(mockRun).toHaveBeenCalledTimes(4);
  });

  it('skips files that are neither native executables nor scripts', async () => {
    setupMocks(SIMPLE_HELP);
    setMagic(Buffer.from('PK\u0003\u0004'));
    expect(await parseHelp('tool', '/opt/homebrew/bin/tool')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('refuses a blocklisted program reached through a symlink with another name', async () => {
    setupMocks(SIMPLE_HELP);
    mockRealpath.mockResolvedValue('/opt/homebrew/bin/env');
    expect(await parseHelp('myenv', '/usr/local/bin/myenv')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });
});

describe('isBlocklisted', () => {
  it('covers wrappers that execute their arguments', () => {
    for (const name of ['env', 'xargs', 'nohup', 'nice', 'caffeinate', 'watch', 'sudo', 'doas', 'time', 'timeout', 'exec']) {
      expect(isBlocklisted(name)).toBe(true);
    }
  });
});

describe('parseSubcommandHelp', () => {
  it('extracts synopsis and flags', async () => {
    setupMocks(SIMPLE_HELP);
    const result = await parseSubcommandHelp('/opt/homebrew/bin/git', ['commit'], 'git commit');

    assertDefined(result);
    expect(result.name).toBe('git commit');
    expect(result.synopsis).toBeDefined();
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it('passes subcommand parts as argument array (no shell injection)', async () => {
    setupMocks(SIMPLE_HELP);
    await parseSubcommandHelp('/opt/homebrew/bin/git', ['commit'], 'git commit');

    expect(mockRun).toHaveBeenCalledWith('/opt/homebrew/bin/git', ['commit', '--help']);
  });

  it('refuses blocklisted base commands (e.g. security)', async () => {
    setupMocks(SIMPLE_HELP);
    expect(await parseSubcommandHelp('/opt/homebrew/bin/security', ['dump-keychain'], 'security dump-keychain')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('refuses subcommand parts that are options, paths or shell syntax', async () => {
    setupMocks(SIMPLE_HELP);
    for (const parts of [['-rf', '/'], ['../x'], ['$(reboot)'], ['a;b'], []]) {
      expect(await parseSubcommandHelp('/usr/local/bin/tool', parts, ['tool', ...parts].join(' '))).toBeNull();
    }
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('uses the first sentence of the help description as the summary', async () => {
    setupMocks(SIMPLE_HELP);
    const result = await parseSubcommandHelp('/opt/homebrew/bin/mytool', ['sub'], 'mytool sub');
    assertDefined(result);
    expect(result.description).toBe('A simple tool for processing files.');
  });
});
