import { open, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, sep } from 'node:path';
import type { ArgumentDetail, CommandDetail, FlagDetail, HelpExtras, SubcommandDetail } from '../../../shared/types';
import {
  parseFlagsFromText,
  parseArgumentsFromSynopsis,
  extractFirstParagraph,
  extractUsageLine,
  normalizeText,
  deduplicateFlags,
  joinWrapped,
  stripDeprecated,
} from './parse-utils';
import {
  describeArguments,
  parseAliases,
  parseArgumentEntries,
  parseEnvironment,
  parseExamples,
  parseSeeAlso,
  takeFlagEnvironment,
} from './help-extras';
import { parseManContent } from './man-parser';
import { runSandboxed } from '../sandbox-exec';

const BLOCKLIST = new Set([
  // Destructive system commands
  'shutdown', 'reboot', 'halt', 'poweroff', 'init', 'rm', 'mkfs', 'fdisk', 'dd', 'kill', 'killall', 'pkill',
  // Services/daemons
  'httpd', 'nginx', 'postgres', 'mysqld', 'mongod', 'redis-server', 'dockerd', 'sshd', 'cupsd',
  // Interactive/network commands
  'ssh', 'telnet', 'ftp', 'sftp', 'nc', 'ncat', 'python', 'python3', 'node', 'ruby', 'irb', 'lua', 'perl',
  // Shells
  'bash', 'zsh', 'sh', 'fish', 'tcsh', 'csh',
  // macOS security/signing tools that trigger Keychain or admin prompts
  'security', 'codesign', 'productsign', 'pkgbuild', 'productbuild',
  'notarytool', 'stapler', 'xcrun', 'xcodebuild', 'spctl',
  'systemsetup', 'systemkeychain', 'certtool', 'authorizationdb',
  'csreq', 'csrutil', 'kinit', 'klist',
  'sudo', 'su', 'login', 'passwd', 'dscl', 'dseditgroup',
  // GUI apps that open windows when invoked
  'jconsole', 'electron',
  // Wrappers that run their arguments as a command: on implementations
  // without a --help flag, `wrapper --help` would execute "--help" (or worse)
  'env', 'xargs', 'nohup', 'nice', 'renice', 'caffeinate', 'watch', 'doas',
  'time', 'timeout', 'gtimeout', 'exec', 'command', 'builtin', 'chroot',
  'sandbox-exec', 'stdbuf', 'gstdbuf', 'unbuffer', 'script', 'setsid', 'flock',
  'ionice', 'taskset', 'chrt', 'pkexec', 'runuser', 'sg', 'newgrp', 'arch',
  'parallel', 'entr',
]);

export function isBlocklisted(name: string): boolean {
  return BLOCKLIST.has(name);
}

/**
 * Install prefixes whose `#!` scripts may be probed with `--help` (see
 * docs/spec.md §7.5): system directories and package managers, whose
 * scripts are packaged CLIs that implement --help. Scripts anywhere else
 * (~/bin, ~/.local/bin, project dirs) are the user's own and may act on any
 * argument, so they get man-page/whatis data only. Matched against the
 * resolved (symlink-free) path.
 */
function trustedScriptPrefixes(): string[] {
  const home = homedir();
  const prefixes = [
    '/usr/', '/bin/', '/sbin/', '/System/', '/Library/Apple/',
    '/opt/homebrew/', '/opt/local/', '/nix/store/',
    join(home, '.cargo', 'bin') + sep,
    join(home, '.rustup', 'toolchains') + sep,
    join(home, '.local', 'share', 'uv', 'tools') + sep,
    join(home, '.local', 'pipx', 'venvs') + sep,
  ];
  // The e2e suite's fake CLIs are scripts in its hermetic dir (docs/e2e.md)
  const e2eDir = process.env.SHORTTY_E2E === '1' ? process.env.SHORTTY_E2E_DIR : undefined;
  if (e2eDir) prefixes.push(join(e2eDir, 'bin') + sep);
  return prefixes;
}

/**
 * The OS's own directories: never probed with --help, only described from
 * their man pages. Apple's binaries there include Xcode shims that offer
 * to download tools, dtrace scripts, Java stubs, keychain and disk-image
 * tools, and helpers that open GUI apps when they ignore --help.
 */
const SYSTEM_PREFIXES = [
  '/usr/bin/', '/usr/sbin/', '/usr/libexec/', '/bin/', '/sbin/',
  '/System/', '/Library/Apple/', '/Library/Developer/', '/Applications/Xcode',
];

const NATIVE_MAGICS = [
  'feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', // Mach-O 32/64, both byte orders
  'cafebabe', 'bebafeca', // Mach-O universal (fat)
  '7f454c46', // ELF
];

async function readMagic(path: string): Promise<Buffer | null> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, 'r');
    const buf = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buf, 0, 4, 0);
    return buf.subarray(0, bytesRead);
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/**
 * Whether `binPath --help` may be run (docs/spec.md §7.5):
 * never as root; never in the OS's own directories; only files owned by root or the current user and not
 * writable by group or others; native executables anywhere, `#!` scripts
 * only under trusted install prefixes; never a blocklisted program reached
 * through a symlink with another name.
 */
async function isTrustedBinary(binPath: string): Promise<boolean> {
  if (process.getuid?.() === 0) return false;
  try {
    const real = await realpath(binPath);
    if (isBlocklisted(basename(real))) return false;
    if (SYSTEM_PREFIXES.some((prefix) => real.startsWith(prefix) || binPath.startsWith(prefix))) return false;
    const s = await stat(real);
    if (s.uid !== 0 && s.uid !== process.getuid?.()) return false;
    if ((s.mode & 0o022) !== 0) return false;

    const magic = await readMagic(real);
    if (!magic || magic.length < 2) return false;
    if (NATIVE_MAGICS.includes(magic.toString('hex'))) return true;
    if (magic[0] === 0x23 && magic[1] === 0x21) {
      return trustedScriptPrefixes().some((prefix) => real.startsWith(prefix));
    }
    return false;
  } catch {
    return false;
  }
}

/** Run `bin args` sandboxed and return its output, or null if it hung or could not run. */
async function captureHelp(bin: string, args: string[]): Promise<string | null> {
  try {
    const result = await runSandboxed(bin, args);
    // A process that had to be killed for running too long was not printing help
    if (result.timedOut) return null;
    return result.output || null;
  } catch {
    return null;
  }
}


type SectionKind =
  | 'commands' | 'flags' | 'usage' | 'arguments' | 'examples' | 'environment'
  | 'aliases' | 'seeAlso' | 'summary' | 'other';

interface HelpSection {
  title: string;
  kind: SectionKind;
  lines: string[];
}

/** "Commands:", "Global options:", "Basic Commands (Beginner):", " Examples:" (bw) */
const COLON_HEADER_RE = /^\s{0,2}([A-Za-z][\w ()/,'.-]{0,60}?):\s*$/;
/** "CORE COMMANDS", "FLAGS" (cobra/gh), "  SEARCH" (fzf) */
const CAPS_HEADER_RE = /^\s{0,2}([A-Z][A-Z0-9 /&()-]{2,}?)\s*$/;
/** az (knack): "Arguments", "Global Arguments", "Examples" at column 0, content indented below */
const TITLE_HEADER_RE = /^([A-Z][a-z]+(?: [A-Z][a-z]+){0,4})\s*$/;
/** "Usage: tool [OPTIONS]" — usage statement on the header line itself */
const INLINE_USAGE_RE = /^\s{0,2}(?:[Uu]sage|USAGE):\s+\S/;

function classifySection(title: string): SectionKind {
  if (/^usage$/i.test(title)) return 'usage';
  if (/^(?:group|command)$/i.test(title)) return 'summary';
  if (/help topics/i.test(title)) return 'other';
  if (/\bexamples?\b/i.test(title)) return 'examples';
  if (/\benvironment\b/i.test(title)) return 'environment';
  if (/^aliases$/i.test(title)) return 'aliases';
  if (/^(?:learn more|see also)$/i.test(title)) return 'seeAlso';
  // Before commands: "COMMAND LINE FLAGS", "OPTIONS INHERITED FROM PARENT COMMANDS"
  if (/\b(?:options?|flags)\b/i.test(title)) return 'flags';
  if (/\b(?:sub)?(?:commands?|groups)\b/i.test(title)) return 'commands';
  if (/\barguments\b/i.test(title)) return 'arguments';
  return 'other';
}

/**
 * Split help output into titled sections. Lines before the first header go
 * into an untitled 'other' section. Column-0 lines that are not headers stay
 * in the current section (git groups its command list under prose lines).
 */
function splitHelpSections(lines: string[]): HelpSection[] {
  const sections: HelpSection[] = [{ title: '', kind: 'other', lines: [] }];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let header = line.match(COLON_HEADER_RE) ?? line.match(CAPS_HEADER_RE);
    if (!header) {
      // A Title Case line is a header only when indented content follows it
      const next = lines.slice(i + 1).find(l => l.trim());
      if (next && /^\s/.test(next)) header = line.match(TITLE_HEADER_RE);
    }
    if (header) {
      const title = header[1].trim();
      sections.push({ title, kind: classifySection(title), lines: [] });
      continue;
    }
    if (INLINE_USAGE_RE.test(line)) {
      sections.push({ title: 'Usage', kind: 'usage', lines: [line] });
      continue;
    }
    sections[sections.length - 1].lines.push(line);
  }
  // "Arguments" lists flags in az, positionals elsewhere; an argparse
  // "positional arguments" section holding "{a,b,c}" lists subcommands
  for (const section of sections) {
    // ffmpeg's "Print help / information / capabilities:", fzf's "DISPLAY MODE" list options too
    const content = section.lines.filter(l => l.trim());
    if (section.kind === 'other' && section.title && content.length > 0
      && content.some(l => /^\s{0,4}--?[A-Za-z]/.test(l))) section.kind = 'flags';
    if (section.kind !== 'arguments') continue;
    if (section.lines.some(l => /^\s+\{[\w,-]+\}\s*$/.test(l))) section.kind = 'commands';
    else if (section.lines.some(l => /^\s{1,8}--?\w/.test(l))) section.kind = 'flags';
  }
  return sections;
}

/**
 * "  run        Run a command", "  auth:   Authenticate", "  ai*   Docker AI", "  ls, list   List",
 * az: "  config [Experimental] : Manage Azure CLI configuration."
 */
const ENTRY_RE = /^\s{1,8}([A-Za-z0-9][\w.+-]*)\*?((?:,\s*[\w.+-]+)*)(?:\s+\[(Preview|Experimental|Deprecated)\])?(?:\s+[<[][^\s\]>]*[\]>](?:\.\.\.)?)*(?:\s*:\s+|\s{2,}(?::\s+)?)(\S.*)$/;
/** clap long help: name alone on its line, description on the following, deeper-indented line */
const BARE_ENTRY_RE = /^(\s{1,8})([a-z0-9][\w.+-]*)\s*$/;
/** npm: "    access, adduser, audit, bugs," */
const COMMA_LIST_RE = /^\s+[\w.-]+(?:,\s*[\w.-]+)+,?\s*$/;

function isPlausibleSubcommand(name: string): boolean {
  if (name.length > 40) return false;
  // ALL-CAPS words are placeholders / env vars, not subcommands
  if (name.length > 1 && name === name.toUpperCase() && /[A-Z]/.test(name)) return false;
  return /^[A-Za-z0-9][\w.+-]*$/.test(name);
}

/** Column where entry descriptions start in a command table, if one is dominant. */
function mostCommonDescColumn(lines: string[]): number | undefined {
  const counts = new Map<number, number>();
  for (const line of lines) {
    const m = line.match(ENTRY_RE);
    if (m) {
      const col = line.length - m[4].length;
      counts.set(col, (counts.get(col) ?? 0) + 1);
    }
  }
  let best: number | undefined;
  let bestCount = 1;
  for (const [col, count] of counts) {
    if (count > bestCount) {
      best = col;
      bestCount = count;
    }
  }
  return best;
}

function extractSubcommands(sections: HelpSection[], commandName: string): CommandDetail[] {
  const subcommands: CommandDetail[] = [];
  const seen = new Set<string>();
  let group: string | undefined;
  const add = (name: string, description: string, marker?: string): CommandDetail | undefined => {
    if (!isPlausibleSubcommand(name) || seen.has(name)) return undefined;
    seen.add(name);
    const [text, deprecated] = stripDeprecated(description);
    const entry: CommandDetail = { name: `${commandName} ${name}`, description: text };
    if (group) entry.group = group;
    if (deprecated || marker === 'Deprecated') entry.deprecated = true;
    subcommands.push(entry);
    return entry;
  };

  for (const section of sections) {
    if (section.kind !== 'commands') continue;
    group = section.title || undefined;
    const { lines } = section;
    const descColumn = mostCommonDescColumn(lines);
    let last: CommandDetail | undefined;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*[-$#]/.test(line)) {
        last = undefined;
        continue;
      }

      const entry = line.match(ENTRY_RE);
      // "  Tip: Managing secrets is easier with..." is prose, not a "name: description" entry
      if (entry && !(/^[A-Z][a-z]/.test(entry[1]) && line.includes(`${entry[1]}:`))) {
        last = add(entry[1], entry[4].trim(), entry[3]);
        continue;
      }

      // Description wrapped onto the next line, at the description column (az)
      const indent = line.match(/^\s*/)![0].length;
      if (last && descColumn !== undefined && line.trim() && indent === descColumn) {
        last.description = joinWrapped([last.description, line.trim()]);
        continue;
      }
      last = undefined;

      // A name that fills its column leaves a single space before the
      // description: "  edit-config-template Edit the configuration file template"
      const tight = line.match(/^(\s{1,8})([A-Za-z0-9][\w.+-]*) (\S.*)$/);
      if (tight && descColumn !== undefined && tight[1].length + tight[2].length + 1 === descColumn) {
        add(tight[2], tight[3].trim());
        continue;
      }

      if (COMMA_LIST_RE.test(line)) {
        for (const name of line.split(',')) {
          if (name.trim()) add(name.trim(), '');
        }
        continue;
      }

      const bare = line.match(BARE_ENTRY_RE);
      if (bare) {
        const next = lines[i + 1] ?? '';
        const nextIndent = next.match(/^(\s*)/)?.[1].length ?? 0;
        if (next.trim() && nextIndent > bare[1].length) {
          add(bare[2], next.trim());
          i++;
        }
      }
    }
  }

  return subcommands;
}

/** Extract flags from help output, using Options/Flags sections when present. */
function extractHelpFlags(sections: HelpSection[], output: string): FlagDetail[] {
  const flagSections = sections.filter(s => s.kind === 'flags');
  if (flagSections.length === 0) {
    // No Options/Flags header (curl, bsdtar, fzf): parse the entire output
    return parseFlagsFromText(output);
  }

  return deduplicateFlags(flagSections.flatMap(s => parseFlagsFromText(s.lines.join('\n'), s.title || undefined)));
}

/** "tmux: unknown option -- -", "ls: unrecognized option `--help'" */
const ERROR_LINE_RE = /^\S+: (?:(?:unknown|illegal|unrecognized|invalid) (?:option|flag|argument)|\[?error\b)/i;

/**
 * Description: the first prose paragraph before the first commands/flags
 * section or flag line. Cobra/clap/kubectl put it before the usage line,
 * docker after it. Usage blocks, error lines and command tables are skipped.
 */
function extractHelpDescription(sections: HelpSection[], commandName: string): string | undefined {
  const program = commandName.split(' ')[0];
  for (const section of sections) {
    if (section.kind === 'commands' || section.kind === 'flags') return undefined;
    let lines = section.lines;
    if (section.kind === 'usage') {
      // Skip the usage statement itself (up to the first blank line); flag
      // lines right under it (curl) mean there is no description
      const blank = lines.findIndex(l => l.trim() === '');
      const statement = blank === -1 ? lines : lines.slice(0, blank);
      if (statement.some(l => /^\s*-/.test(l))) return undefined;
      if (blank === -1) continue;
      lines = lines.slice(blank);
    } else if (section.title && !/^description$/i.test(section.title)) {
      // poetry and pip put it under "Description:"
      continue;
    }
    const desc = firstProseParagraph(lines, program);
    if (desc !== null) return desc;
  }
  return undefined;
}

/**
 * Returns the first prose paragraph, undefined if a flag line is hit first
 * (stop searching), or null if the lines hold no prose (keep searching).
 */
function firstProseParagraph(lines: string[], program: string): string | undefined | null {
  const paragraphs: string[][] = [[]];
  for (const line of lines) {
    if (line.trim()) paragraphs[paragraphs.length - 1].push(line);
    else if (paragraphs[paragraphs.length - 1].length > 0) paragraphs.push([]);
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) continue;
    const first = paragraph[0];
    const trimmed = first.trim();
    if (/^-/.test(trimmed)) return undefined;
    if (ERROR_LINE_RE.test(trimmed)) continue;
    // Usage-like lines: "npm <command>", "npm install   install all the dependencies"
    if (trimmed === program) continue;
    if (trimmed.startsWith(`${program} `) && (/^\S+\s+[<[]/.test(trimmed) || /\S\s{2,}\S/.test(trimmed))) continue;
    // Indented tables / examples; click and terraform indent plain prose too
    const prose = /[.!?]$/.test(paragraph[paragraph.length - 1].trim())
      && !paragraph.some(l => /\S\s{2,}\S/.test(l) || /^\s*[$#-]/.test(l));
    if (/^\s{2,}/.test(first) && !prose) continue;
    return extractFirstParagraph(paragraph.join('\n'), 500);
  }
  return null;
}

/**
 * az's "Group" / "Command" section: "    az vm create : Create an Azure VM."
 * followed by more description lines.
 */
function extractSummary(sections: HelpSection[]): { description?: string; longDescription?: string } {
  const section = sections.find(s => s.kind === 'summary');
  if (!section) return {};
  const text = joinWrapped(section.lines.map(l => l.trim()).filter(Boolean));
  const m = text.match(/^\S.*? : (.*)$/);
  if (!m) return {};
  return { description: firstSentence(m[1]), longDescription: extractFirstParagraph(m[1], 500) };
}

/** npm prints "npm <command>" as its first line instead of a "Usage:" line. */
function firstLineUsage(text: string, commandName: string): string | undefined {
  const first = text.split('\n').find(l => l.trim())?.trim();
  if (!first) return undefined;
  if (!first.startsWith(`${commandName} `) || /\S\s{2,}\S/.test(first)) return undefined;
  return /[<[]/.test(first) ? first : undefined;
}

/** First sentence (or line) of a description, for one-line summaries. */
function firstSentence(text: string | undefined): string {
  if (!text) return '';
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return (match ? match[1] : text).trim();
}

/**
 * Output that is a rendered man page (gcloud prints NAME / SYNOPSIS /
 * DESCRIPTION... even through a pager set to cat).
 */
function isManStyle(text: string): boolean {
  const first = text.split('\n').find(l => l.trim());
  return first?.trim() === 'NAME' && /^SYNOPSIS\s*$/m.test(text);
}

/**
 * Banners some CLIs print before their help on first run. az: "Welcome to
 * Azure CLI!" and a telemetry notice, up to its "Group"/"Command" header.
 */
function stripBanner(text: string): string {
  if (!/^\s*Welcome to Azure CLI!/.test(text)) return text;
  const header = text.search(/^(?:Group|Command)\s*$/m);
  return header === -1 ? text : text.slice(header);
}

export interface ParsedHelp extends HelpExtras {
  /** One-line description, when the help states one apart from the long text (az, gcloud). */
  description?: string;
  synopsis?: string;
  longDescription?: string;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
  arguments: ArgumentDetail[];
}

function sectionText(sections: HelpSection[], kind: SectionKind): string {
  return sections.filter(s => s.kind === kind).map(s => s.lines.join('\n')).join('\n\n');
}

/** Parse captured `--help` output (pure; no process spawning). */
export function parseHelpOutput(output: string, commandName: string): ParsedHelp | null {
  const text = stripBanner(normalizeText(output));
  if (isManStyle(text)) {
    const man = parseManContent(text, commandName);
    if (!man || (man.subcommands.length === 0 && man.flags.length === 0 && man.arguments.length === 0)) return null;
    return man;
  }

  const sections = splitHelpSections(text.split('\n'));
  const synopsis = extractUsageLine(text) ?? firstLineUsage(text, commandName);
  const summary = extractSummary(sections);
  const longDescription = summary.longDescription ?? extractHelpDescription(sections, commandName);
  const subcommands = extractSubcommands(sections, commandName);
  const flags = extractHelpFlags(sections, text);
  const args = describeArguments(
    synopsis ? parseArgumentsFromSynopsis(synopsis) : [],
    parseArgumentEntries(sectionText(sections, 'arguments')),
  );

  if (subcommands.length === 0 && flags.length === 0 && args.length === 0) return null;

  const result: ParsedHelp = { synopsis, longDescription, subcommands, flags, arguments: args };
  if (summary.description) result.description = summary.description;
  const examples = parseExamples(sectionText(sections, 'examples'), commandName);
  if (examples.length > 0) result.examples = examples;
  const environment = [...parseEnvironment(sectionText(sections, 'environment')), ...takeFlagEnvironment(flags)];
  if (environment.length > 0) result.environment = environment;
  const aliases = parseAliases(sectionText(sections, 'aliases'), commandName);
  if (aliases.length > 0) result.aliases = aliases;
  const seeAlso = parseSeeAlso(sectionText(sections, 'seeAlso'));
  if (seeAlso.length > 0) result.seeAlso = seeAlso;
  return result;
}

export async function parseHelp(commandName: string, binPath: string): Promise<ParsedHelp | null> {
  if (isBlocklisted(commandName)) return null;
  if (!(await isTrustedBinary(binPath))) return null;

  const output = await captureHelp(binPath, ['--help']);
  if (output === null) return null;
  return parseHelpOutput(output, commandName);
}

/** Subcommand path segments must be plain words: no options, paths or shell syntax. */
const SUBCOMMAND_TOKEN_RE = /^[A-Za-z0-9][\w.+-]*$/;

export async function parseSubcommandHelp(
  baseBinPath: string,
  subcommandParts: string[],
  qualifiedName: string,
): Promise<Omit<SubcommandDetail, 'enrichment' | 'enrichedAt'> | null> {
  const baseName = qualifiedName.split(' ')[0];
  if (isBlocklisted(baseName)) return null;
  if (subcommandParts.length === 0 || !subcommandParts.every(p => SUBCOMMAND_TOKEN_RE.test(p))) return null;
  if (!(await isTrustedBinary(baseBinPath))) return null;

  const output = await captureHelp(baseBinPath, [...subcommandParts, '--help']);
  if (output === null) return null;

  const parsed = parseHelpOutput(output, qualifiedName);
  if (!parsed) return null;

  const { description, ...rest } = parsed;
  return { name: qualifiedName, description: description ?? firstSentence(rest.longDescription), ...rest };
}
