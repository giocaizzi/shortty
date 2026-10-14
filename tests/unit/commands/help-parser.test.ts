import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseHelp, parseSubcommandHelp, isBlocklisted } from '../../../src/main/commands/parsers/help-parser';
import { assertDefined } from '../../helpers';

// Mock the sandboxed runner and fs
vi.mock('../../../src/main/commands/sandbox-exec', () => ({
  runSandboxed: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}));

import { runSandboxed } from '../../../src/main/commands/sandbox-exec';
import { stat } from 'node:fs/promises';

const mockRun = vi.mocked(runSandboxed);
const mockStat = vi.mocked(stat);

function setupMocks(helpOutput: string, overrides: Partial<Awaited<ReturnType<typeof runSandboxed>>> = {}) {
  mockStat.mockResolvedValue({ uid: 0 } as Awaited<ReturnType<typeof stat>>);
  mockRun.mockResolvedValue({ output: helpOutput, exitCode: 0, timedOut: false, truncated: false, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
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
    const result = await parseHelp('docker', '/usr/bin/docker');

    assertDefined(result);
    expect(result.synopsis).toBe('docker [OPTIONS] COMMAND');
  });

  it('extracts description from text after Usage', async () => {
    setupMocks(DOCKER_HELP);
    const result = await parseHelp('docker', '/usr/bin/docker');

    assertDefined(result);
    expect(result.longDescription).toBeDefined();
    expect(result.longDescription).toContain('self-sufficient runtime');
  });

  it('extracts subcommands from multiple sections', async () => {
    setupMocks(DOCKER_HELP);
    const result = await parseHelp('docker', '/usr/bin/docker');

    assertDefined(result);
    const run = result.subcommands.find(sc => sc.name === 'docker run');
    assertDefined(run);
    expect(run.description).toContain('Create and run');

    const builder = result.subcommands.find(sc => sc.name === 'docker builder');
    assertDefined(builder);
  });

  it('extracts flags from Global Options section', async () => {
    setupMocks(DOCKER_HELP);
    const result = await parseHelp('docker', '/usr/bin/docker');

    assertDefined(result);
    const debug = result.flags.find(f => f.short === '-D');
    assertDefined(debug);
    expect(debug.long).toBe('--debug');
  });

  it('extracts arguments from synopsis', async () => {
    setupMocks(SIMPLE_HELP);
    const result = await parseHelp('mytool', '/usr/bin/mytool');

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
    const result = await parseHelp('rm', '/bin/rm');
    expect(result).toBeNull();
  });

  it('returns null when stat fails', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    const result = await parseHelp('git', '/usr/bin/git');
    expect(result).toBeNull();
  });

  it('runs the binary with an argument array (no shell injection)', async () => {
    setupMocks(SIMPLE_HELP);
    await parseHelp('mytool', '/usr/bin/mytool');

    expect(mockRun).toHaveBeenCalledWith('/usr/bin/mytool', ['--help']);
  });

  it('returns null when the command had to be killed for hanging', async () => {
    setupMocks(SIMPLE_HELP, { timedOut: true, exitCode: null });
    expect(await parseHelp('mytool', '/usr/bin/mytool')).toBeNull();
  });

  it('parses help printed by a command that exits non-zero', async () => {
    setupMocks(SIMPLE_HELP, { exitCode: 1 });
    const result = await parseHelp('mytool', '/usr/bin/mytool');
    assertDefined(result);
    expect(result.flags).toHaveLength(2);
  });

  it('skips binaries owned by another user', async () => {
    setupMocks(SIMPLE_HELP);
    mockStat.mockResolvedValue({ uid: 4242 } as Awaited<ReturnType<typeof stat>>);
    expect(await parseHelp('mytool', '/usr/local/bin/mytool')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });
});

describe('parseSubcommandHelp', () => {
  it('extracts synopsis and flags', async () => {
    setupMocks(SIMPLE_HELP);
    const result = await parseSubcommandHelp('/usr/bin/git', ['commit'], 'git commit');

    assertDefined(result);
    expect(result.name).toBe('git commit');
    expect(result.synopsis).toBeDefined();
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it('passes subcommand parts as argument array (no shell injection)', async () => {
    setupMocks(SIMPLE_HELP);
    await parseSubcommandHelp('/usr/bin/git', ['commit'], 'git commit');

    expect(mockRun).toHaveBeenCalledWith('/usr/bin/git', ['commit', '--help']);
  });

  it('refuses blocklisted base commands (e.g. security)', async () => {
    setupMocks(SIMPLE_HELP);
    expect(await parseSubcommandHelp('/usr/bin/security', ['dump-keychain'], 'security dump-keychain')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('refuses subcommand parts that are options, paths or shell syntax', async () => {
    setupMocks(SIMPLE_HELP);
    for (const parts of [['-rf', '/'], ['../x'], ['$(reboot)'], ['a;b'], []]) {
      expect(await parseSubcommandHelp('/usr/bin/tool', parts, ['tool', ...parts].join(' '))).toBeNull();
    }
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('uses the first sentence of the help description as the summary', async () => {
    setupMocks(SIMPLE_HELP);
    const result = await parseSubcommandHelp('/usr/bin/mytool', ['sub'], 'mytool sub');
    assertDefined(result);
    expect(result.description).toBe('A simple tool for processing files.');
  });
});
