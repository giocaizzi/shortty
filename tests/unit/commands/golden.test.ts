/**
 * Golden tests: parse REAL `--help` / `man` output captured on macOS
 * (fixtures/commands/<cmd>/*.txt, man pages rendered via `man <name> | col -bx`
 * like the app does) and compare with hand-verified expectations.
 *
 * fixtures/commands/expected.json holds, per fixture, the exact subcommand
 * names and option list ("<short>|<long>", one entry per documented option
 * line). It was extracted independently of the parser and reviewed by hand
 * against the raw text (prose lines that merely start with a flag removed,
 * modes documented on one line added).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FlagDetail } from '../../../src/shared/types';
import { parseCommandBlock, parseManContent } from '../../../src/main/commands/parsers/man-parser';
import { parseHelpOutput } from '../../../src/main/commands/parsers/help-parser';
import { extractUsageLine } from '../../../src/main/commands/parsers/parse-utils';
import { assertDefined } from '../../helpers';

const ROOT = join(__dirname, '../../../fixtures/commands');

interface Expected {
  subcommands: string[];
  flags: string[];
}

const EXPECTED: Record<string, Expected> = JSON.parse(readFileSync(join(ROOT, 'expected.json'), 'utf-8'));

/**
 * Documented gaps: expected entries the parser does not find.
 * bsdtar --help lists its five modes on one line ("-c Create  -r Add/Replace  -t List ...");
 * one line yields one flag.
 */
const KNOWN_MISSING_FLAGS: Record<string, string[]> = {
  'tar/help.txt': ['-r|', '-t|', '-u|', '-x|'],
};

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

/** "git/man-commit.txt" -> "git commit", "uv/pip-help.txt" -> "uv pip" */
function qualifiedName(rel: string): string {
  const [cmd, file] = rel.split('/');
  const base = file.replace(/\.txt$/, '');
  if (base === 'man' || base === 'help' || base.startsWith('man-width')) return cmd;
  if (base.startsWith('man-')) return `${cmd} ${base.slice(4).replace(/-/g, ' ')}`;
  return `${cmd} ${base.replace(/-help$/, '').replace(/-/g, ' ')}`;
}

function parse(rel: string) {
  const name = qualifiedName(rel);
  const file = rel.split('/')[1];
  return file.startsWith('man') ? parseManContent(read(rel), name) : parseHelpOutput(read(rel), name);
}

function flagKey(f: FlagDetail): string {
  return `${f.short ?? ''}|${f.long ?? ''}`;
}

function flag(rel: string, match: Partial<FlagDetail>): FlagDetail {
  const result = parse(rel);
  assertDefined(result);
  const found = result.flags.find(f =>
    (match.short === undefined || f.short === match.short) &&
    (match.long === undefined || f.long === match.long),
  );
  assertDefined(found);
  return found;
}

function sub(rel: string, name: string) {
  const result = parse(rel);
  assertDefined(result);
  const found = result.subcommands.find(s => s.name === name);
  assertDefined(found);
  return found;
}

describe('golden: exact subcommands and options per fixture', () => {
  for (const [rel, expected] of Object.entries(EXPECTED)) {
    it(rel, () => {
      const result = parse(rel);
      const name = qualifiedName(rel);

      const subcommands = (result?.subcommands ?? []).map(s => s.name);
      expect(subcommands).toEqual(expected.subcommands.map(s => `${name} ${s}`));

      const missing = KNOWN_MISSING_FLAGS[rel] ?? [];
      const keys = (result?.flags ?? []).map(flagKey);
      expect(new Set(keys)).toEqual(new Set(expected.flags.filter(k => !missing.includes(k))));
      // no duplicates either
      expect(keys.length).toBe(new Set(keys).size);
    });
  }
});

describe('golden: git (custom layout + man cross-references)', () => {
  it('man git: NAME, synopsis, description, arguments', () => {
    const result = parse('git/man.txt');
    assertDefined(result);
    expect(result.description).toBe('the stupid content tracker');
    expect(result.synopsis).toMatch(/^git \[-v \| --version\] \[-h \| --help\] \[-C <path>\] \[-c <name>=<value>\]/);
    expect(result.synopsis).toMatch(/\[--config-env=<name>=<envvar>\] <command> \[<args>\]$/);
    expect(result.longDescription).toBe(
      'Git is a fast, scalable, distributed revision control system with an unusually rich command set that provides both high-level operations and full access to internals.',
    );
    expect(result.arguments).toEqual([
      { name: 'command', required: true, variadic: false, description: '' },
      { name: 'args', required: false, variadic: false, description: '' },
    ]);
  });

  it('man git: subcommands come from git-<name>(1) references with descriptions', () => {
    expect(sub('git/man.txt', 'git commit').description).toBe('Record changes to the repository.');
    expect(sub('git/man.txt', 'git cherry-pick').description).toBe('Apply the changes introduced by some existing commits.');
  });

  it('man git: options with separate and attached arguments', () => {
    expect(flag('git/man.txt', { short: '-C' })).toMatchObject({ long: undefined, arg: '<path>' });
    expect(flag('git/man.txt', { short: '-C' }).description).toMatch(/^Run as if git was started in <path> instead of the current working directory\./);
    expect(flag('git/man.txt', { long: '--git-dir' })).toMatchObject({ arg: '<path>' });
    expect(flag('git/man.txt', { long: '--exec-path' })).toMatchObject({ arg: '[<path>]' });
    expect(flag('git/man.txt', { short: '-v' })).toMatchObject({ long: '--version' });
  });

  it('man git-commit: options and pathspec argument', () => {
    const result = parse('git/man-commit.txt');
    assertDefined(result);
    expect(result.description).toBe('Record changes to the repository');
    expect(flag('git/man-commit.txt', { short: '-m' })).toMatchObject({
      short: '-m',
      long: '--message',
      arg: '<msg>',
      description: expect.stringMatching(/^Use <msg> as the commit message\. If multiple -m options are given, their values are concatenated as separate paragraphs\./),
    });
    expect(flag('git/man-commit.txt', { long: '--amend' }).description).toMatch(/^Replace the tip of the current branch by creating a new commit\./);
    expect(result.arguments.find(a => a.name === 'pathspec')).toMatchObject({ required: false, variadic: true });
  });

  it('git commit -h: --[no-] options and optional attached args', () => {
    expect(flag('git/commit-help.txt', { short: '-m' })).toMatchObject({
      short: '-m', long: '--[no-]message', arg: '<message>', description: 'commit message',
    });
    expect(flag('git/commit-help.txt', { short: '-S' })).toMatchObject({ long: '--[no-]gpg-sign', arg: '[<key-id>]', description: 'GPG sign commit' });
    expect(flag('git/commit-help.txt', { long: '--[no-]fixup' })).toMatchObject({ arg: '[(amend|reword):]commit' });
  });

  it('git --help: grouped command list under prose headings', () => {
    const result = parse('git/help.txt');
    assertDefined(result);
    expect(sub('git/help.txt', 'git commit').description).toBe('Record changes to the repository');
    expect(sub('git/help.txt', 'git restore').description).toBe('Restore working tree files');
    expect(result.flags).toEqual([]);
    expect(result.longDescription).toBeUndefined();
  });
});

describe('golden: Go cobra (gh, docker, kubectl, chezmoi)', () => {
  it('gh --help: all *COMMANDS sections (incl. aliases/extensions), not HELP TOPICS', () => {
    const result = parse('gh/help.txt');
    assertDefined(result);
    expect(result.synopsis).toBe('gh <command> <subcommand> [flags]');
    expect(result.longDescription).toBe('Work seamlessly with GitHub from the command line.');
    expect(sub('gh/help.txt', 'gh pr').description).toBe('Manage pull requests');
    expect(sub('gh/help.txt', 'gh co').description).toBe('Alias for "pr checkout"');
    expect(result.subcommands.map(s => s.name)).not.toContain('gh accessibility');
  });

  it('gh pr --help: "name: description" with a single space', () => {
    expect(sub('gh/pr-help.txt', 'gh pr update-branch').description).toBe('Update a pull request branch');
    expect(flag('gh/pr-help.txt', { short: '-R' })).toMatchObject({
      short: '-R', long: '--repo', arg: '[HOST/]OWNER/REPO',
      description: 'Select another repository using the [HOST/]OWNER/REPO format',
    });
  });

  it('gh pr create --help: pflag "type" arguments', () => {
    const result = parse('gh/pr-create-help.txt');
    assertDefined(result);
    expect(result.synopsis).toBe('gh pr create [flags]');
    expect(result.longDescription).toBe('Create a pull request on GitHub.');
    expect(flag('gh/pr-create-help.txt', { short: '-B' })).toMatchObject({
      short: '-B', long: '--base', arg: 'branch', description: 'The branch into which you want your code merged',
    });
    expect(flag('gh/pr-create-help.txt', { short: '-d' })).toMatchObject({
      short: '-d', long: '--draft', arg: undefined, description: 'Mark pull request as a draft',
    });
  });

  it('man gh-pr-create: same options with <angle> arguments', () => {
    expect(flag('gh/man-pr-create.txt', { short: '-B' })).toMatchObject({ long: '--base', arg: '<branch>' });
  });

  it('docker --help: four command sections, plugin markers stripped, wrapped option text', () => {
    const result = parse('docker/help.txt');
    assertDefined(result);
    expect(result.synopsis).toBe('docker [OPTIONS] COMMAND');
    expect(result.longDescription).toBe('A self-sufficient runtime for containers');
    expect(sub('docker/help.txt', 'docker compose').description).toBe('Docker Compose');
    expect(sub('docker/help.txt', 'docker wait').description).toBe('Block until one or more containers stop, then print their exit codes');
    expect(flag('docker/help.txt', { short: '-H' })).toMatchObject({
      short: '-H', long: '--host', arg: 'string', description: 'Daemon socket to connect to',
    });
    expect(flag('docker/help.txt', { long: '--config' })).toMatchObject({
      description: 'Location of client config files',
      default: '/Users/user/.docker',
      group: 'Global Options',
    });
  });

  it('docker compose up --help: optional variadic SERVICE argument', () => {
    const result = parse('docker/compose-up-help.txt');
    assertDefined(result);
    expect(result.arguments).toEqual([{ name: 'SERVICE', required: false, variadic: true, description: '' }]);
    expect(flag('docker/compose-up-help.txt', { long: '--scale' })).toMatchObject({ arg: 'scale', description: 'Scale SERVICE to NUM instances. Overrides the scale setting in the Compose file if present.' });
  });

  it('kubectl --help: "(Beginner)" style section titles, usage on the next line', () => {
    const result = parse('kubectl/help.txt');
    assertDefined(result);
    expect(result.synopsis).toBe('kubectl [flags] [options]');
    expect(result.longDescription).toBe('kubectl controls the Kubernetes cluster manager.');
    expect(sub('kubectl/help.txt', 'kubectl get').description).toBe('Display one or many resources');
  });

  it('kubectl get --help: "--flag=default:" with tab-indented description', () => {
    const output = flag('kubectl/get-help.txt', { short: '-o' });
    expect(output.long).toBe('--output');
    expect(output.arg).toBeUndefined();
    expect(output.description).toMatch(/^Output format\. One of: \(json, yaml, name,/);
    expect(parse('kubectl/get-help.txt')?.longDescription).toBe('Display one or many resources.');
  });

  it('chezmoi --help: name filling its column, compound argument types', () => {
    expect(sub('chezmoi/help.txt', 'chezmoi edit-config-template').description).toBe('Edit the configuration file template');
    expect(flag('chezmoi/help.txt', { short: '-R' })).toMatchObject({ long: '--refresh-externals', arg: 'always|auto|never[=always]' });
    expect(flag('chezmoi/help.txt', { long: '--color' })).toMatchObject({ arg: 'bool|auto', description: 'Colorize output', default: 'auto' });
    expect(flag('chezmoi/help.txt', { long: '--color' }).choices).toBeUndefined();
  });
});

describe('golden: clap (uv, fd)', () => {
  it('uv --help: Commands + three option groups, long-form descriptions on the next line', () => {
    const result = parse('uv/help.txt');
    assertDefined(result);
    expect(result.synopsis).toBe('uv [OPTIONS] <COMMAND>');
    expect(result.longDescription).toBe('An extremely fast Python package manager.');
    expect(result.arguments).toEqual([{ name: 'COMMAND', required: true, variadic: false, description: '' }]);
    expect(sub('uv/help.txt', 'uv pip').description).toBe('Manage Python packages with a pip-compatible interface');
    expect(flag('uv/help.txt', { long: '--cache-dir' })).toMatchObject({ arg: '<CACHE_DIR>', description: 'Path to the cache directory', group: 'Cache options' });
    expect(result.environment).toContainEqual({ name: 'UV_CACHE_DIR', description: 'Same as --cache-dir' });
    expect(flag('uv/help.txt', { short: '-q' })).toMatchObject({ short: '-q', long: '--quiet', arg: undefined, description: 'Use quiet output' });
  });

  it('fd --help: "-d, --max-depth <depth>", repeatable "--unrestricted..."', () => {
    const result = parse('fd/help.txt');
    assertDefined(result);
    expect(result.longDescription).toBe('A program to find entries in your filesystem');
    expect(flag('fd/help.txt', { short: '-d' })).toMatchObject({ long: '--max-depth', arg: '<depth>' });
    expect(flag('fd/help.txt', { short: '-u' })).toMatchObject({ long: '--unrestricted' });
    expect(flag('fd/help.txt', { short: '-1' }).long).toBeUndefined();
  });
});

describe('golden: npm', () => {
  it('npm --help: comma-separated "All commands" list, no Usage: line', () => {
    const result = parse('npm/help.txt');
    assertDefined(result);
    expect(result.synopsis).toBe('npm <command>');
    expect(sub('npm/help.txt', 'npm install').description).toBe('');
    expect(result.subcommands).toHaveLength(72);
  });

  it('npm install --help: "-S|--save" options, usage on the next line', () => {
    const result = parse('npm/install-help.txt');
    assertDefined(result);
    expect(result.synopsis).toBe('npm install [<package-spec> ...]');
    expect(result.longDescription).toBe('Install a package');
    expect(result.arguments).toEqual([{ name: 'package-spec', required: false, variadic: false, description: '' }]);
    expect(flag('npm/install-help.txt', { short: '-S' })).toMatchObject({
      short: '-S', long: '--save', arg: undefined,
      description: 'Save installed packages to a `package.json` file as dependencies.',
    });
  });
});

describe('golden: GNU and other help layouts', () => {
  it('make --help: "-C DIRECTORY, --directory=DIRECTORY" with description on the next line', () => {
    expect(flag('make/help.txt', { short: '-C' })).toMatchObject({
      short: '-C', long: '--directory', arg: 'DIRECTORY', description: 'Change to DIRECTORY before doing anything.',
    });
    expect(flag('make/help.txt', { short: '-j' })).toMatchObject({ long: '--jobs', arg: '[N]' });
  });

  it('man make: "-j [jobs], --jobs[=jobs]"', () => {
    expect(flag('make/man.txt', { short: '-j' })).toMatchObject({ long: '--jobs', arg: '[jobs]' });
  });

  it('curl --help: flags indented by one space, no description paragraph', () => {
    const result = parse('curl/help.txt');
    assertDefined(result);
    expect(result.synopsis).toBe('curl [options...] <url>');
    expect(result.longDescription).toBeUndefined();
    expect(result.arguments).toEqual([{ name: 'url', required: true, variadic: false, description: '' }]);
    expect(flag('curl/help.txt', { short: '-u' })).toMatchObject({
      short: '-u', long: '--user', arg: '<user:password>', description: 'Server user and password',
    });
  });

  it('jq --help: tab after "Usage:", alternate usage forms not appended', () => {
    const result = parse('jq/help.txt');
    assertDefined(result);
    expect(result.synopsis).toBe('jq [options] <jq filter> [file...]');
    expect(flag('jq/help.txt', { short: '-n' })).toMatchObject({ long: '--null-input', description: 'use `null` as the single input value;' });
  });

  it('fzf --help: indented ALL-CAPS groups, "+x" options, "--opt=ARG"', () => {
    const result = parse('fzf/help.txt');
    assertDefined(result);
    expect(result.longDescription).toBe('fzf is an interactive filter program for any kind of list.');
    expect(result.subcommands).toEqual([]);
    expect(flag('fzf/help.txt', { short: '+x' })).toMatchObject({ long: '--no-extended', description: 'Disable extended-search mode' });
    expect(flag('fzf/help.txt', { long: '--scheme' })).toMatchObject({ arg: 'SCHEME' });
    expect(flag('fzf/help.txt', { short: '-n' })).toMatchObject({ long: '--nth', arg: 'N[,..]' });
  });

  it('brew --help: examples only, nothing to index', () => {
    expect(parse('brew/help.txt')).toBeNull();
  });
});

describe('golden: man pages (GNU, BSD mdoc, ronn)', () => {
  it('man curl (very long page): every option, dotted and punctuation names, args with spaces', () => {
    const started = performance.now();
    const result = parse('curl/man.txt');
    expect(performance.now() - started).toBeLessThan(2000);
    assertDefined(result);
    expect(result.description).toBe('transfer a URL');
    expect(flag('curl/man.txt', { long: '--alt-svc' }).arg).toBe('<file name>');
    expect(flag('curl/man.txt', { short: '-L' })).toMatchObject({ long: '--location' });
    expect(flag('curl/man.txt', { short: '-L' }).description).toMatch(/^\(HTTP\) If the server reports that the requested page has moved/);
    expect(flag('curl/man.txt', { short: '-:' }).long).toBe('--next');
    expect(flag('curl/man.txt', { short: '-#' }).long).toBe('--progress-bar');
    expect(flag('curl/man.txt', { long: '--http1.0' }).short).toBe('-0');
  });

  it('man ls (BSD): options documented in DESCRIPTION', () => {
    const result = parse('ls/man.txt');
    assertDefined(result);
    expect(result.description).toBe('list directory contents');
    expect(flag('ls/man.txt', { short: '-l' }).description).toMatch(/^\(The lowercase letter “ell”\.\) List files in the long format/);
    expect(flag('ls/man.txt', { short: '-,' }).description).toMatch(/^\(Comma\)/);
    expect(flag('ls/man.txt', { long: '--color' })).toMatchObject({ arg: 'when' });
  });

  it('man grep (BSD): "-A num, --after-context=num"; prose line "-f and file arguments." is not an option', () => {
    expect(flag('grep/man.txt', { short: '-A' })).toMatchObject({ long: '--after-context', arg: 'num' });
    expect(flag('grep/man.txt', { short: '-A' }).description).toMatch(/^Print num lines of trailing context after each match\./);
    expect(parse('grep/man.txt')?.flags.filter(f => f.short === '-f')).toHaveLength(1);
  });

  it('man grep at 60, 80 and 160 columns yields the same options', () => {
    const keys = (rel: string) => parse(rel)?.flags.map(flagKey).sort();
    expect(keys('grep/man-width60.txt')).toEqual(keys('grep/man.txt'));
    expect(keys('grep/man-width160.txt')).toEqual(keys('grep/man.txt'));
    expect(flag('grep/man-width60.txt', { short: '-A' }).description).toBe(flag('grep/man.txt', { short: '-A' }).description);
  });

  it('man find / sed / ssh (BSD): short options from DESCRIPTION', () => {
    expect(parse('find/man.txt')?.description).toBe('walk a file hierarchy');
    expect(flag('find/man.txt', { short: '-E' }).description).toMatch(/^Interpret regular expressions following the -regex and -iregex primaries as extended/);
    expect(flag('sed/man.txt', { short: '-i' })).toMatchObject({ arg: 'extension' });
    expect(flag('ssh/man.txt', { short: '-p' })).toMatchObject({ arg: 'port' });
  });

  it('man tmux: CLI options from DESCRIPTION; commands from their "(alias: x)" blocks, not the copy-mode list', () => {
    const result = parse('tmux/man.txt');
    assertDefined(result);
    expect(result.description).toBe('terminal multiplexer');
    expect(sub('tmux/man.txt', 'tmux new-session').description).toBe('Create a new session with name session-name.');
    expect(sub('tmux/man.txt', 'tmux rename-session').description).toBe('Rename the session to new-name.');
    // copy-mode commands and option names share the layout, without an alias line
    expect(result.subcommands.map(s => s.name)).not.toContain('tmux append-selection');
    expect(result.subcommands.map(s => s.name)).not.toContain('tmux kill-server'); // no alias: known gap
    expect(flag('tmux/man.txt', { short: '-c' })).toMatchObject({ arg: 'shell-command' });
  });

  it('tmux new-session: its block in the tmux page gives usage, flags, alias and text', () => {
    const detail = parseCommandBlock(read('tmux/man.txt'), 'tmux new-session');
    assertDefined(detail);
    expect(detail.synopsis).toMatch(/^tmux new-session \[-AdDEPX\] \[-c start-directory\] .* \[-y height\] \[shell-command \[argument \.\.\.\]\]$/);
    expect(detail.description).toBe('Create a new session with name session-name.');
    expect(detail.aliases).toEqual(['tmux new']);
    expect(detail.flags.map(f => f.short)).toEqual(['-A', '-d', '-D', '-E', '-P', '-X', '-c', '-e', '-f', '-F', '-n', '-s', '-t', '-x', '-y']);
    expect(detail.flags.find(f => f.short === '-c')).toMatchObject({ arg: 'start-directory' });
    expect(parseCommandBlock(read('tmux/man.txt'), 'tmux append-selection')).toBeNull();
  });

  it('man openssl: the COMMAND SUMMARY tag lists, incl. names that fill the tag column', () => {
    const result = parse('openssl/man.txt');
    assertDefined(result);
    expect(sub('openssl/man.txt', 'openssl req').description).toBe('PKCS#10 X.509 Certificate Signing Request (CSR) Management.');
    expect(sub('openssl/man.txt', 'openssl asn1parse').description).toBe('Parse an ASN.1 sequence.');
    expect(sub('openssl/man.txt', 'openssl cms').description).toBe('CMS (Cryptographic Message Syntax) command.');
    expect(sub('openssl/man.txt', 'openssl ca').description).toBe('Certificate Authority (CA) Management.');
    expect(sub('openssl/man.txt', 'openssl x509').description).toBe('X.509 Certificate Data Management.');
    // a prose line that fits "name text" at the tag column is not an entry
    expect(result.subcommands.map(s => s.name)).not.toContain('openssl the');
  });

  it('man brew: "brew analytics on" usage lines do not list the program itself', () => {
    expect(parse('brew/man.txt')?.subcommands.map(s => s.name)).not.toContain('brew brew');
  });

  it('man tar (bsdtar): mode flags from DESCRIPTION plus OPTIONS', () => {
    expect(flag('tar/man.txt', { short: '-x' }).description).toMatch(/^Extract to disk from the archive\./);
    expect(flag('tar/man.txt', { short: '-z' })).toMatchObject({ long: '--gunzip' });
  });

  it('man brew (ronn): commands with the description on the next line', () => {
    expect(sub('brew/man.txt', 'brew install').description).toBe('Install formula.');
    expect(sub('brew/man.txt', 'brew uninstall').description).toBe('Uninstall formula.');
    expect(flag('brew/man.txt', { short: '-d' })).toMatchObject({ long: '--debug', description: 'Display any debugging information.' });
  });

  it('man npm: NAME only (no options) falls through to --help', () => {
    const result = parse('npm/man.txt');
    assertDefined(result);
    expect(result.description).toBe('javascript package manager');
    expect(result.flags).toEqual([]);
    expect(result.subcommands).toEqual([]);
  });
});

describe('golden: CLIs whose command list is not in --help (aws help, bq help, poetry list)', () => {
  it('aws help: a man page through the pager, services as "o name" bullets', () => {
    const result = parseHelpOutput(read('aws/help-cmd.txt'), 'aws');
    assertDefined(result);
    expect(result.longDescription).toBe('The AWS Command Line Interface is a unified tool to manage your AWS services.');
    expect(result.subcommands.length).toBeGreaterThan(400);
    expect(result.subcommands.map(s => s.name)).toEqual(expect.arrayContaining(['aws s3', 'aws ec2', 'aws sts']));
    expect(result.flags.map(f => f.long)).toEqual(expect.arrayContaining(['--debug', '--region', '--profile']));
  });

  it('aws s3 help / aws s3 ls help: commands, then options', () => {
    expect(parseHelpOutput(read('aws/s3-help-cmd.txt'), 'aws s3')?.subcommands.map(s => s.name)).toEqual(
      ['cp', 'ls', 'mb', 'mv', 'presign', 'rb', 'rm', 'sync', 'website'].map(n => `aws s3 ${n}`),
    );
    const ls = parseHelpOutput(read('aws/s3-ls-help-cmd.txt'), 'aws s3 ls');
    assertDefined(ls);
    expect(ls.longDescription).toMatch(/^List S3 objects and common prefixes under a prefix or all S3 buckets\./);
    expect(ls.flags.find(f => f.long === '--recursive')).toMatchObject({ description: 'Command is performed on all files or objects', group: 'OPTIONS' });
  });

  it('bq help: the wrapped comma list, a name split at its hyphen rejoined', () => {
    const names = parseHelpOutput(read('bq/help-cmd.txt'), 'bq')?.subcommands.map(s => s.name.slice(3));
    expect(names).toEqual([
      'add-iam-policy-binding', 'cancel', 'cp', 'extract', 'get-iam-policy', 'head', 'help', 'info', 'init',
      'insert', 'load', 'ls', 'mk', 'mkdef', 'partition', 'query', 'remove-iam-policy-binding', 'rm',
      'set-iam-policy', 'shell', 'show', 'truncate', 'undelete', 'update', 'version', 'wait',
    ]);
  });

  it('poetry list: commands and namespaces (" cache" over "cache clear")', () => {
    const result = parseHelpOutput(read('poetry/list.txt'), 'poetry');
    assertDefined(result);
    expect(findSub(result, 'poetry add').description).toBe('Adds a new dependency to pyproject.toml and installs it.');
    expect(findSub(result, 'poetry cache').description).toBe('');
    expect(result.flags.map(f => f.short)).toContain('-C');
  });
});

function findSub(result: { subcommands: { name: string; description: string }[] }, name: string) {
  const found = result.subcommands.find(s => s.name === name);
  assertDefined(found);
  return found;
}

describe('golden: usage on stderr / non-zero exit (BSD tools reject --help)', () => {
  it.each([
    ['tmux/help.txt', 'tmux [-2CDhlNuVv] [-c shell-command] [-f file] [-L socket-name] [-S socket-path] [-T features] [command [flags]]'],
    ['ls/help.txt', 'ls [-@ABCFGHILOPRSTUWXabcdefghiklmnopqrstuvwxy1%,] [--color=when] [-D format] [file ...]'],
    ['grep/help.txt', 'grep [-abcdDEFGHhIiJLlMmnOopqRSsUVvwXxZz] [-A num] [-B num] [-C[num]] [-e pattern] [-f file] [--binary-files=value] [--color=when] [--context[=num]] [--directories=action] [--label] [--line-buffered] [--null] [pattern] [file ...]'],
    ['find/help.txt', 'find [-H | -L | -P] [-EXdsx] [-f path] path ... [expression]'],
    ['sed/help.txt', 'sed script [-EHalnru] [-i extension] [file ...]'],
  ])('%s: usage line after the error line', (rel, synopsis) => {
    expect(extractUsageLine(read(rel))).toBe(synopsis);
  });
});

describe('golden: output encodings', () => {
  const plain = read('docker/help.txt');

  it('ANSI colour codes are ignored', () => {
    const colored = plain
      .replace(/^(\w[\w ]*:)$/gm, '\x1b[1m$1\x1b[0m')
      .replace(/^( {2})(\w+)/gm, '$1\x1b[36m$2\x1b[0m')
      .replace(/(--[\w-]+)/g, '\x1b[33m$1\x1b[39m');
    expect(parseHelpOutput(colored, 'docker')).toEqual(parseHelpOutput(plain, 'docker'));
  });

  it('backspace overstrike (bold/underline) is ignored', () => {
    const man = read('ls/man.txt');
    const overstruck = man
      .replace(/^([A-Z][A-Z ]+)$/gm, h => [...h].map(c => (c === ' ' ? c : `${c}\b${c}`)).join(''))
      .replace(/^( {5})(-\S)/gm, (_m, indent: string, f: string) => indent + [...f].map(c => `${c}\b${c}`).join(''))
      .replace(/\bfile\b/g, '_\bf_\bi_\bl_\be');
    expect(parseManContent(overstruck, 'ls')).toEqual(parseManContent(man, 'ls'));
  });

  it('CRLF line endings are handled', () => {
    expect(parseHelpOutput(plain.replace(/\n/g, '\r\n'), 'docker')).toEqual(parseHelpOutput(plain, 'docker'));
  });

  it('invalid UTF-8 bytes do not break parsing', () => {
    const bytes = Buffer.concat([Buffer.from('Usage: tool [OPTIONS]\n\nOptions:\n  -x, --ex\xff\xfeample  Bad \xc3 bytes\n', 'latin1'), Buffer.from('  -v, --verbose   Verbose\n')]);
    const result = parseHelpOutput(bytes.toString('utf-8'), 'tool');
    assertDefined(result);
    expect(result.flags.map(f => f.short)).toEqual(['-x', '-v']);
  });

  it('empty output parses to nothing', () => {
    expect(parseHelpOutput('', 'tool')).toBeNull();
    expect(parseManContent('', 'tool')).toBeNull();
  });
});
