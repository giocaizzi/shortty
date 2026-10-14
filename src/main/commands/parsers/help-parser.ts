import { stat } from 'node:fs/promises';
import type { ArgumentDetail, CommandDetail, FlagDetail, SubcommandDetail } from '../../../shared/types';
import {
  parseFlagsFromText,
  parseArgumentsFromSynopsis,
  extractFirstParagraph,
  extractUsageLine,
  normalizeText,
  deduplicateFlags,
} from './parse-utils';
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
]);

export function isBlocklisted(name: string): boolean {
  return BLOCKLIST.has(name);
}

/** Help output is only trusted from binaries owned by root or the current user. */
async function isTrustedBinary(binPath: string): Promise<boolean> {
  // Never run help as root (SPECS §7.5)
  if (process.getuid?.() === 0) return false;
  try {
    const s = await stat(binPath);
    return s.uid === 0 || s.uid === process.getuid?.();
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

type SectionKind = 'commands' | 'flags' | 'usage' | 'other';

interface HelpSection {
  title: string;
  kind: SectionKind;
  lines: string[];
}

/** "Commands:", "Global options:", "Basic Commands (Beginner):" */
const COLON_HEADER_RE = /^([A-Za-z][\w ()/,'.-]{0,60}?):\s*$/;
/** "CORE COMMANDS", "FLAGS" (cobra/gh), "  SEARCH" (fzf) */
const CAPS_HEADER_RE = /^\s{0,2}([A-Z][A-Z0-9 /&()-]{2,}?)\s*$/;
/** "Usage: tool [OPTIONS]" — usage statement on the header line itself */
const INLINE_USAGE_RE = /^\s{0,2}(?:[Uu]sage|USAGE):\s+\S/;

function classifySection(title: string): SectionKind {
  if (/^usage$/i.test(title)) return 'usage';
  if (/help topics/i.test(title)) return 'other';
  if (/\b(?:sub)?commands?\b/i.test(title)) return 'commands';
  if (/\b(?:options?|flags)\b/i.test(title)) return 'flags';
  return 'other';
}

/**
 * Split help output into titled sections. Lines before the first header go
 * into an untitled 'other' section. Column-0 lines that are not headers stay
 * in the current section (git groups its command list under prose lines).
 */
function splitHelpSections(lines: string[]): HelpSection[] {
  const sections: HelpSection[] = [{ title: '', kind: 'other', lines: [] }];
  for (const line of lines) {
    const header = line.match(COLON_HEADER_RE) ?? line.match(CAPS_HEADER_RE);
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
  return sections;
}

/** "  run        Run a command", "  auth:   Authenticate", "  ai*   Docker AI", "  ls, list   List" */
const ENTRY_RE = /^\s{1,8}([A-Za-z0-9][\w.+-]*)\*?((?:,\s*[\w.+-]+)*)(?::\s+|\s{2,})(\S.*)$/;
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
      const col = line.length - m[3].length;
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
  const add = (name: string, description: string) => {
    if (!isPlausibleSubcommand(name) || seen.has(name)) return;
    seen.add(name);
    subcommands.push({ name: `${commandName} ${name}`, description });
  };

  for (const section of sections) {
    if (section.kind !== 'commands') continue;
    const { lines } = section;
    const descColumn = mostCommonDescColumn(lines);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*[-$#]/.test(line)) continue;

      const entry = line.match(ENTRY_RE);
      if (entry) {
        add(entry[1], entry[3].trim());
        continue;
      }

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

  return deduplicateFlags(flagSections.flatMap(s => parseFlagsFromText(s.lines.join('\n'))));
}

/** "tmux: unknown option -- -", "ls: unrecognized option `--help'" */
const ERROR_LINE_RE = /^\S+: (?:unknown|illegal|unrecognized|invalid) (?:option|flag|argument)/i;

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
    } else if (section.title) {
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
    // Indented tables / examples
    if (/^\s{2,}/.test(first)) continue;
    return extractFirstParagraph(paragraph.join('\n'), 500);
  }
  return null;
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

export interface ParsedHelp {
  synopsis?: string;
  longDescription?: string;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
  arguments: ArgumentDetail[];
}

/** Parse captured `--help` output (pure; no process spawning). */
export function parseHelpOutput(output: string, commandName: string): ParsedHelp | null {
  const text = normalizeText(output);
  const sections = splitHelpSections(text.split('\n'));
  const synopsis = extractUsageLine(text) ?? firstLineUsage(text, commandName);
  const longDescription = extractHelpDescription(sections, commandName);
  const subcommands = extractSubcommands(sections, commandName);
  const flags = extractHelpFlags(sections, text);
  const args = synopsis ? parseArgumentsFromSynopsis(synopsis) : [];

  if (subcommands.length === 0 && flags.length === 0 && args.length === 0) return null;
  return { synopsis, longDescription, subcommands, flags, arguments: args };
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

  return { name: qualifiedName, description: firstSentence(parsed.longDescription), ...parsed };
}
