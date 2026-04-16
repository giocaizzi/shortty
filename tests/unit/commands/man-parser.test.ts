import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseManPage, parseSubcommandManPage } from '../../../src/main/commands/parsers/man-parser';
import { assertDefined } from '../../helpers';

// Mock child_process exec
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'node:child_process';

const mockExec = vi.mocked(exec);

function mockManOutput(output: string) {
  mockExec.mockImplementation((_cmd, _opts, callback) => {
    (callback as (error: Error | null, stdout: string) => void)(null, output);
    return {} as ReturnType<typeof exec>;
  });
}

function mockManError() {
  mockExec.mockImplementation((_cmd, _opts, callback) => {
    (callback as (error: Error | null, stdout: string) => void)(
      new Error('No manual entry'),
      '',
    );
    return {} as ReturnType<typeof exec>;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

const GIT_ADD_MAN = `GIT-ADD(1)                        Git Manual                        GIT-ADD(1)

NAME
       git-add - Add file contents to the index

SYNOPSIS
       git add [--verbose | -v] [--dry-run | -n] [--force | -f]
            [--] [<pathspec>...]

DESCRIPTION
       Add contents of new or changed files to the index. The "index" (also
       known as the "staging area") is what you use to prepare the contents of
       the next commit.

       When you run git commit without any other arguments, it will only
       commit staged changes.

OPTIONS
       <pathspec>...
           Files to add content from. Fileglobs (e.g.  *.c) can be given to
           add all matching files.

       -n, --dry-run
           Don't actually add the file(s), just show if they exist and/or will
           be ignored.

       -v, --verbose
           Be verbose.

       -f, --force
           Allow adding otherwise ignored files.

       --sparse
           Allow updating index entries outside of the sparse-checkout cone.

EXAMPLES
       Some examples here.

SEE ALSO
       git-commit(1)
`;

const GIT_MAN = `GIT(1)                            Git Manual                           GIT(1)

NAME
       git - the stupid content tracker

SYNOPSIS
       git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]
           [--html-path] [--man-path] [--info-path] <command> [<args>]

DESCRIPTION
       Git is a fast, scalable, distributed revision control system with an
       unusually rich command set that provides both high-level operations
       and full access to internals.

COMMANDS
       add        Add file contents to the index
       commit     Record changes to the repository
       push       Update remote refs

OPTIONS
       -v, --version
           Prints the Git suite version.

       -h, --help
           Prints the synopsis and list of commonly used commands.

       -C <path>
           Run as if git was started in <path>.

SEE ALSO
       giteveryday(7)
`;

describe('parseManPage', () => {
  it('extracts description from NAME section', async () => {
    mockManOutput(GIT_ADD_MAN);
    const result = await parseManPage('git-add');

    assertDefined(result);
    expect(result.description).toBe('Add file contents to the index');
  });

  it('extracts synopsis', async () => {
    mockManOutput(GIT_ADD_MAN);
    const result = await parseManPage('git-add');

    assertDefined(result);
    expect(result.synopsis).toBeDefined();
    expect(result.synopsis).toContain('git add');
    expect(result.synopsis).toContain('[<pathspec>...]');
  });

  it('extracts long description (first paragraph)', async () => {
    mockManOutput(GIT_ADD_MAN);
    const result = await parseManPage('git-add');

    assertDefined(result);
    expect(result.longDescription).toBeDefined();
    expect(result.longDescription).toContain('staging area');
    // Should only have first paragraph
    expect(result.longDescription).not.toContain('When you run');
  });

  it('extracts flags with multi-line descriptions', async () => {
    mockManOutput(GIT_ADD_MAN);
    const result = await parseManPage('git-add');

    assertDefined(result);
    const dryRun = result.flags.find(f => f.long === '--dry-run');
    assertDefined(dryRun);
    expect(dryRun.short).toBe('-n');
    expect(dryRun.description).toContain("Don't actually add");
  });

  it('extracts long-only flags', async () => {
    mockManOutput(GIT_ADD_MAN);
    const result = await parseManPage('git-add');

    assertDefined(result);
    const sparse = result.flags.find(f => f.long === '--sparse');
    assertDefined(sparse);
    expect(sparse.short).toBeUndefined();
  });

  it('extracts positional arguments from synopsis', async () => {
    mockManOutput(GIT_ADD_MAN);
    const result = await parseManPage('git-add');

    assertDefined(result);
    expect(result.arguments.length).toBeGreaterThan(0);
    const pathspec = result.arguments.find(a => a.name === 'pathspec');
    assertDefined(pathspec);
    expect(pathspec.required).toBe(false);
    expect(pathspec.variadic).toBe(true);
  });

  it('resolves argument descriptions from OPTIONS', async () => {
    mockManOutput(GIT_ADD_MAN);
    const result = await parseManPage('git-add');

    assertDefined(result);
    const pathspec = result.arguments.find(a => a.name === 'pathspec');
    assertDefined(pathspec);
    expect(pathspec.description).toContain('Files to add content from');
  });

  it('extracts subcommands from COMMANDS section', async () => {
    mockManOutput(GIT_MAN);
    const result = await parseManPage('git');

    assertDefined(result);
    expect(result.subcommands.length).toBeGreaterThan(0);
    const add = result.subcommands.find(sc => sc.name === 'git add');
    assertDefined(add);
    expect(add.description).toContain('Add file contents');
  });

  it('extracts arguments from git synopsis', async () => {
    mockManOutput(GIT_MAN);
    const result = await parseManPage('git');

    assertDefined(result);
    const cmdArg = result.arguments.find(a => a.name === 'command');
    assertDefined(cmdArg);
    expect(cmdArg.required).toBe(true);

    const argsArg = result.arguments.find(a => a.name === 'args');
    assertDefined(argsArg);
    expect(argsArg.required).toBe(false);
  });

  it('returns null when man page not found', async () => {
    mockManError();
    const result = await parseManPage('nonexistent-command');
    expect(result).toBeNull();
  });

  it('returns null for empty content', async () => {
    mockManOutput('');
    const result = await parseManPage('empty');
    expect(result).toBeNull();
  });
});

describe('parseSubcommandManPage', () => {
  it('converts qualified name to hyphenated man page name', async () => {
    mockManOutput(GIT_ADD_MAN);
    await parseSubcommandManPage('git add');

    expect(mockExec).toHaveBeenCalledWith(
      'man git-add 2>/dev/null | col -bx',
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('extracts all fields for subcommand', async () => {
    mockManOutput(GIT_ADD_MAN);
    const result = await parseSubcommandManPage('git add');

    assertDefined(result);
    expect(result.name).toBe('git add');
    expect(result.description).toBe('Add file contents to the index');
    expect(result.synopsis).toContain('git add');
    expect(result.longDescription).toContain('staging area');
    expect(result.flags.length).toBeGreaterThan(0);
    expect(result.arguments.length).toBeGreaterThan(0);
  });

  it('returns null when no useful data found', async () => {
    mockManOutput(`EMPTY(1)

NAME
       empty - does nothing

DESCRIPTION
       Nothing to see here.

SEE ALSO
       nothing(1)
`);
    const result = await parseSubcommandManPage('empty');
    expect(result).toBeNull();
  });
});
