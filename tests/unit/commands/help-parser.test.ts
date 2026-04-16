import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseHelp, parseSubcommandHelp, isBlocklisted } from '../../../src/main/commands/parsers/help-parser';
import { assertDefined } from '../../helpers';

// Mock child_process and fs
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { stat, mkdtemp, rm } from 'node:fs/promises';

const mockExecFile = vi.mocked(execFile);
const mockStat = vi.mocked(stat);
const mockMkdtemp = vi.mocked(mkdtemp);
const mockRm = vi.mocked(rm);

function setupMocks(helpOutput: string) {
  mockStat.mockResolvedValue({ uid: 0 } as Awaited<ReturnType<typeof stat>>);
  mockMkdtemp.mockResolvedValue('/tmp/shortty-help-test');
  mockRm.mockResolvedValue();
  mockExecFile.mockImplementation((_bin, _args, _opts, callback) => {
    (callback as (error: Error | null, stdout: string, stderr: string) => void)(
      null, helpOutput, '',
    );
    return {} as ReturnType<typeof execFile>;
  });
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

  it('uses execFile with argument array (no shell injection)', async () => {
    setupMocks(SIMPLE_HELP);
    await parseHelp('mytool', '/usr/bin/mytool');

    expect(mockExecFile).toHaveBeenCalledWith(
      '/usr/bin/mytool',
      ['--help'],
      expect.any(Object),
      expect.any(Function),
    );
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

    expect(mockExecFile).toHaveBeenCalledWith(
      '/usr/bin/git',
      ['commit', '--help'],
      expect.any(Object),
      expect.any(Function),
    );
  });
});
