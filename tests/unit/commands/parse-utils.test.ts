import { describe, it, expect } from 'vitest';
import {
  splitManSections,
  parseFlagsFromText,
  parseArgumentsFromSynopsis,
  resolveArgumentDescriptions,
  extractFirstParagraph,
  extractSynopsis,
  extractUsageLine,
} from '../../../src/main/commands/parsers/parse-utils';
import { assertDefined } from '../../helpers';

// --- Fixtures ---

const GIT_ADD_MAN_PAGE = `GIT-ADD(1)                        Git Manual                        GIT-ADD(1)

NAME
       git-add - Add file contents to the index

SYNOPSIS
       git add [--verbose | -v] [--dry-run | -n] [--force | -f] [--interactive | -i] [--patch | -p]
            [--edit | -e] [--[no-]all | -A | --[no-]ignore-removal | [--update | -u]] [--sparse]
            [--intent-to-add | -N] [--refresh] [--ignore-errors] [--ignore-missing] [--renormalize]
            [--chmod=(+|-)x] [--pathspec-from-file=<file> [--pathspec-file-nul]]
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
           add all matching files. Also a leading directory name (e.g.  dir to
           add dir/file1 and dir/file2) can be given to update the index to
           match the current state of the directory as a whole.

       -n, --dry-run
           Don't actually add the file(s), just show if they exist and/or will
           be ignored.

       -v, --verbose
           Be verbose.

       -f, --force
           Allow adding otherwise ignored files.

       --sparse
           Allow updating index entries outside of the sparse-checkout cone.
           Normally, git add refuses to update index entries whose paths do
           not fit within the sparse-checkout cone.

       -U<n>, --unified=<n>
           Generate diffs with <n> lines of context. Defaults to diff.context
           or 3 if the config option is unset.

       --chmod=(+|-)x
           Override the executable bit of the added files.

       -A, --all, --no-ignore-removal
           Update the index not only where the working tree has a file
           matching <pathspec>.

EXAMPLES
       Some examples here.

SEE ALSO
       git-commit(1)
`;

const LS_SYNOPSIS = `     ls [-@ABCFGHILOPRSTUWabcdefghiklmnopqrstuvwxy1%,] [--color=when]
        [-D format] [file ...]`;

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
  -l, --log-level string   Set the logging level ("debug"|"info"|"warn"|"error"|"fatal")
  -v, --version            Print version information and quit
`;

const CURL_HELP = `Usage: curl [options...] <url>
 -d, --data <data>           HTTP POST data
 -f, --fail                  Fail fast with no output on HTTP errors
 -h, --help <category>       Get help for commands
 -o, --output <file>         Write to file instead of stdout
`;

// --- Tests ---

describe('splitManSections', () => {
  it('splits a man page into named sections', () => {
    const sections = splitManSections(GIT_ADD_MAN_PAGE);

    expect(sections.has('NAME')).toBe(true);
    expect(sections.has('SYNOPSIS')).toBe(true);
    expect(sections.has('DESCRIPTION')).toBe(true);
    expect(sections.has('OPTIONS')).toBe(true);
    expect(sections.has('EXAMPLES')).toBe(true);
    expect(sections.has('SEE ALSO')).toBe(true);
  });

  it('captures section content correctly', () => {
    const sections = splitManSections(GIT_ADD_MAN_PAGE);

    expect(sections.get('NAME')).toContain('git-add');
    expect(sections.get('SYNOPSIS')).toContain('git add');
    expect(sections.get('DESCRIPTION')).toContain('staging area');
    expect(sections.get('OPTIONS')).toContain('--dry-run');
  });
});

describe('parseFlagsFromText', () => {
  function getOptionsFlags() {
    const sections = splitManSections(GIT_ADD_MAN_PAGE);
    const optionsText = sections.get('OPTIONS');
    assertDefined(optionsText);
    return parseFlagsFromText(optionsText);
  }

  it('parses short + long flag pairs', () => {
    const flags = getOptionsFlags();

    const dryRun = flags.find(f => f.long === '--dry-run');
    assertDefined(dryRun);
    expect(dryRun.short).toBe('-n');
    expect(dryRun.description).toContain("Don't actually add");
  });

  it('parses long-only flags', () => {
    const flags = getOptionsFlags();

    const sparse = flags.find(f => f.long === '--sparse');
    assertDefined(sparse);
    expect(sparse.short).toBeUndefined();
    expect(sparse.description).toContain('sparse-checkout cone');
  });

  it('parses flags with attached short args like -U<n>', () => {
    const flags = getOptionsFlags();

    // The long flag is --unified=<n>, parsed with = and arg
    const unified = flags.find(f => f.long?.startsWith('--unified'));
    assertDefined(unified);
    expect(unified.short).toBe('-U');
  });

  it('parses flags with complex arg patterns like --chmod=(+|-)x', () => {
    const flags = getOptionsFlags();

    const chmod = flags.find(f => f.long?.startsWith('--chmod'));
    assertDefined(chmod);
  });

  it('captures multi-line descriptions', () => {
    const flags = getOptionsFlags();

    const sparse = flags.find(f => f.long === '--sparse');
    assertDefined(sparse);
    // Should have continuation lines joined
    expect(sparse.description.split(' ').length).toBeGreaterThan(5);
  });

  it('parses flags with aliases like -A, --all, --no-ignore-removal', () => {
    const flags = getOptionsFlags();

    const allFlag = flags.find(f => f.short === '-A');
    assertDefined(allFlag);
  });

  it('does not include positional arguments as flags', () => {
    const flags = getOptionsFlags();

    // <pathspec>... should not appear as a flag
    const pathspec = flags.find(f => f.short === '<p' || f.long?.includes('pathspec'));
    expect(pathspec).toBeUndefined();
  });

  it('deduplicates flags', () => {
    const text = `
       -v, --verbose
           Be verbose.

       -v, --verbose
           Be verbose again.
`;
    const flags = parseFlagsFromText(text);
    expect(flags.filter(f => f.short === '-v')).toHaveLength(1);
  });
});

describe('parseArgumentsFromSynopsis', () => {
  it('extracts optional variadic argument from git-add synopsis', () => {
    const synopsis = 'git add [--verbose | -v] [--dry-run | -n] [--] [<pathspec>...]';
    const args = parseArgumentsFromSynopsis(synopsis);

    expect(args).toHaveLength(1);
    expect(args[0].name).toBe('pathspec');
    expect(args[0].required).toBe(false);
    expect(args[0].variadic).toBe(true);
  });

  it('extracts required argument', () => {
    const synopsis = 'curl [options...] <url>';
    const args = parseArgumentsFromSynopsis(synopsis);

    expect(args).toHaveLength(1);
    expect(args[0].name).toBe('url');
    expect(args[0].required).toBe(true);
    expect(args[0].variadic).toBe(false);
  });

  it('extracts multiple arguments', () => {
    const synopsis = 'git remote add <name> <url>';
    const args = parseArgumentsFromSynopsis(synopsis);

    expect(args).toHaveLength(2);
    expect(args[0].name).toBe('name');
    expect(args[1].name).toBe('url');
  });

  it('extracts bare bracket arguments like [file ...]', () => {
    const synopsis = 'ls [-ABCFGHILOPRSTUWabcdefghiklmnopqrstuvwxy1%,] [file ...]';
    const args = parseArgumentsFromSynopsis(synopsis);

    const fileArg = args.find(a => a.name === 'file');
    assertDefined(fileArg);
    expect(fileArg.required).toBe(false);
    expect(fileArg.variadic).toBe(true);
  });

  it('skips flag-like tokens', () => {
    const synopsis = 'git add [--force | -f] [<pathspec>...]';
    const args = parseArgumentsFromSynopsis(synopsis);

    // Should not include "force" or "f"
    expect(args.every(a => a.name !== 'force')).toBe(true);
    expect(args.every(a => a.name !== 'f')).toBe(true);
  });

  it('returns empty for commands with no positional arguments', () => {
    const synopsis = 'git status [--short | -s] [--branch | -b]';
    const args = parseArgumentsFromSynopsis(synopsis);
    expect(args).toHaveLength(0);
  });

  it('deduplicates arguments', () => {
    const synopsis = 'git diff <commit> <commit>';
    const args = parseArgumentsFromSynopsis(synopsis);
    expect(args.filter(a => a.name === 'commit')).toHaveLength(1);
  });
});

describe('resolveArgumentDescriptions', () => {
  it('resolves description from OPTIONS section', () => {
    const args = [{ name: 'pathspec', required: false, variadic: true, description: '' }];
    const optionsText = `
       <pathspec>...
           Files to add content from. Fileglobs can be given to
           add all matching files.

       -n, --dry-run
           Don't actually add the file(s).
`;
    const resolved = resolveArgumentDescriptions(args, optionsText);

    expect(resolved[0].description).toContain('Files to add content from');
    expect(resolved[0].description).toContain('Fileglobs');
  });

  it('preserves existing descriptions', () => {
    const args = [{ name: 'url', required: true, variadic: false, description: 'The URL to fetch' }];
    const resolved = resolveArgumentDescriptions(args, '');
    expect(resolved[0].description).toBe('The URL to fetch');
  });

  it('returns original args when no OPTIONS text', () => {
    const args = [{ name: 'file', required: true, variadic: false, description: '' }];
    const resolved = resolveArgumentDescriptions(args, '');
    expect(resolved).toEqual(args);
  });
});

describe('extractFirstParagraph', () => {
  it('extracts first paragraph up to blank line', () => {
    const text = `
       Add contents of new or changed files to the index. The "index" (also
       known as the "staging area") is what you use to prepare.

       When you run git commit without any other arguments, it will only
       commit staged changes.
`;
    const paragraph = extractFirstParagraph(text);

    expect(paragraph).toContain('Add contents');
    expect(paragraph).toContain('prepare.');
    expect(paragraph).not.toContain('When you run');
  });

  it('truncates at maxLen', () => {
    const text = '       ' + 'A'.repeat(600);
    const paragraph = extractFirstParagraph(text, 100);
    expect(paragraph.length).toBeLessThanOrEqual(100);
    expect(paragraph).toMatch(/\.\.\.$/);
  });

  it('handles single paragraph', () => {
    const text = '       Simple description here.';
    const paragraph = extractFirstParagraph(text);
    expect(paragraph).toBe('Simple description here.');
  });
});

describe('extractSynopsis', () => {
  it('normalizes multi-line synopsis', () => {
    const result = extractSynopsis(LS_SYNOPSIS);
    expect(result).toContain('ls');
    expect(result).toContain('[file ...]');
    // Should be a single line
    expect(result).not.toContain('\n');
  });

  it('handles single-line synopsis', () => {
    const result = extractSynopsis('       curl [options...] <url>');
    expect(result).toBe('curl [options...] <url>');
  });
});

describe('extractUsageLine', () => {
  it('extracts Usage from docker help', () => {
    const usage = extractUsageLine(DOCKER_HELP);
    expect(usage).toBe('docker [OPTIONS] COMMAND');
  });

  it('extracts Usage from curl help', () => {
    const usage = extractUsageLine(CURL_HELP);
    expect(usage).toBe('curl [options...] <url>');
  });

  it('returns undefined when no usage line', () => {
    const usage = extractUsageLine('Some random output without usage');
    expect(usage).toBeUndefined();
  });
});
