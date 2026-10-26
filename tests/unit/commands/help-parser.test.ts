import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { parseHelp, parseSubcommandHelp, isBlocklisted } from '../../../src/main/commands/parsers/help-parser';
import { assertDefined, withPlatform } from '../../helpers';

// Mock the sandboxed runner and fs
vi.mock('../../../src/main/commands/sandbox-exec', () => ({
  runSandboxed: vi.fn(),
}));

vi.mock('../../../src/main/commands/elevation', () => ({
  isWindowsElevated: vi.fn(async () => false),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
  realpath: vi.fn(),
  open: vi.fn(),
}));

import { runSandboxed } from '../../../src/main/commands/sandbox-exec';
import { isWindowsElevated } from '../../../src/main/commands/elevation';
import { open, realpath, stat } from 'node:fs/promises';

const mockRun = vi.mocked(runSandboxed);
const mockStat = vi.mocked(stat);
const mockRealpath = vi.mocked(realpath);
const mockOpen = vi.mocked(open);
const mockElevated = vi.mocked(isWindowsElevated);

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

// The POSIX policy everywhere; the Windows one has its own block below
withPlatform('darwin');

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

  it('never probes anything when running as root', async () => {
    setupMocks(SIMPLE_HELP);
    vi.spyOn(process, 'getuid').mockReturnValueOnce(0);
    expect(await parseHelp('mytool', '/opt/homebrew/bin/mytool')).toBeNull();
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
    mockRealpath.mockResolvedValue(posix.join(homedir(), '.local/share/uv/tools/ruff/bin/ruff'));
    expect(await parseHelp('ruff', posix.join(homedir(), '.local/bin/ruff'))).not.toBeNull();
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

  it.each([
    ['aws', [], ['help']],
    ['aws', ['s3', 'ls'], ['s3', 'ls', 'help']],
    ['bq', [], ['help']],
    ['bq', ['query'], ['query', '--help']],
    ['poetry', [], ['list']],
    ['poetry', ['add'], ['add', '--help']],
  ])('%s %j: asks for help the way the CLI documents it', async (name, parts, args) => {
    setupMocks(SIMPLE_HELP);
    const bin = `/opt/homebrew/bin/${name}`;
    if (parts.length === 0) await parseHelp(name, bin);
    else await parseSubcommandHelp(bin, parts, [name, ...parts].join(' '));
    expect(mockRun).toHaveBeenCalledWith(bin, args);
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

describe('Windows probing policy', () => {
  withPlatform('win32');

  const PE = Buffer.from('4d5a9000', 'hex');
  const ENV = {
    SystemRoot: 'C:\\Windows',
    LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
    ProgramFiles: 'C:\\Program Files',
    ProgramData: 'C:\\ProgramData',
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
  };
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function setupWindows(magic = PE) {
    setupMocks(SIMPLE_HELP);
    // Owner and mode bits mean nothing on Windows
    setStat(4242, 0o100777);
    setMagic(magic);
  }

  it('never probes when Shortty runs elevated', async () => {
    setupWindows();
    mockElevated.mockResolvedValueOnce(true);
    expect(await parseHelp('mytool', 'D:\\tools\\mytool.exe')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('probes PE executables anywhere outside the system directories', async () => {
    setupWindows();
    expect(await parseHelp('mytool', 'D:\\tools\\mytool.exe')).not.toBeNull();
    expect(await parseHelp('rg', 'C:\\Users\\me\\scoop\\shims\\rg.exe')).not.toBeNull();
    expect(mockRun).toHaveBeenCalledWith('D:\\tools\\mytool.exe', ['--help']);
  });

  it('never probes System32, Store aliases or packaged apps, in any case', async () => {
    setupWindows();
    for (const bin of [
      'C:\\Windows\\System32\\where.exe',
      'c:\\windows\\notepad.exe',
      'C:\\Program Files\\WindowsApps\\App_1.0\\app.exe',
    ]) {
      expect(await parseHelp('tool', bin)).toBeNull();
    }
    // An app execution alias may not even resolve
    mockRealpath.mockRejectedValue(Object.assign(new Error('UNKNOWN'), { code: 'UNKNOWN' }));
    expect(await parseHelp('python3', 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('skips a file on PATH that resolves into the system directories', async () => {
    setupWindows();
    mockRealpath.mockResolvedValue('C:\\Windows\\System32\\tool.exe');
    expect(await parseHelp('tool', 'D:\\links\\tool.exe')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('probes .cmd/.bat/.ps1 only under trusted install prefixes (case-insensitive)', async () => {
    setupWindows(Buffer.from('@ech'));
    for (const bin of [
      'C:\\Users\\me\\AppData\\Roaming\\npm\\tsc.cmd',
      'c:\\program files\\tool\\bin\\tool.bat',
      win32.join(homedir(), 'scoop', 'shims', 'x.ps1'),
      'C:\\ProgramData\\chocolatey\\bin\\x.CMD',
    ]) {
      expect(await parseHelp('tool', bin)).not.toBeNull();
    }
    expect(mockRun).toHaveBeenCalledTimes(4);
    mockRun.mockClear();
    for (const bin of ['D:\\scripts\\deploy.cmd', 'C:\\Users\\me\\bin\\deploy.ps1', 'C:\\Users\\me\\deploy.bat']) {
      expect(await parseHelp('deploy', bin)).toBeNull();
    }
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('skips files that are not PE executables or Windows scripts', async () => {
    setupWindows(SHEBANG);
    expect(await parseHelp('tool', 'D:\\tools\\tool.exe')).toBeNull();
    expect(await parseHelp('tool', 'C:\\Program Files\\tool\\tool.js')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('blocks names case-insensitively, with or without their extension', async () => {
    for (const name of ['Python.EXE', 'format.com', 'REG', 'powershell.exe', 'cmd', 'diskpart', 'rm.exe', 'msiexec']) {
      expect(isBlocklisted(name)).toBe(true);
    }
    expect(isBlocklisted('git.exe')).toBe(false);
    setupWindows();
    mockRealpath.mockResolvedValue('D:\\tools\\PWSH.EXE');
    expect(await parseHelp('myshell', 'D:\\tools\\myshell.exe')).toBeNull();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('asks git for -h: git <cmd> --help opens a browser on Windows', async () => {
    setupWindows();
    const git = 'C:\\Program Files\\Git\\cmd\\git.exe';
    await parseHelp('git', git);
    await parseSubcommandHelp(git, ['commit'], 'git commit');
    expect(mockRun).toHaveBeenNthCalledWith(1, git, ['-h']);
    expect(mockRun).toHaveBeenNthCalledWith(2, git, ['commit', '-h']);
  });
});
