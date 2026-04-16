import { execFile } from 'node:child_process';
import { stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ArgumentDetail, CommandDetail, FlagDetail, SubcommandDetail } from '../../../shared/types';
import {
  parseFlagsFromText,
  parseArgumentsFromSynopsis,
  extractFirstParagraph,
  extractUsageLine,
} from './parse-utils';

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

function execCommand(bin: string, args: string[], sandboxDir: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(bin, args, {
      encoding: 'utf-8',
      timeout: 2000,
      maxBuffer: 1 * 1024 * 1024,
      cwd: sandboxDir,
    }, (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        const fallback = stderr || stdout || '';
        if (fallback) resolve(fallback);
        else reject(error);
      } else {
        // Merge stderr into output (some commands print help to stderr)
        resolve(stdout + (stderr || ''));
      }
    });
  });
}

/** Extract description from help output (first paragraph after usage line). */
function extractHelpDescription(output: string): string | undefined {
  // Skip past the Usage line and any blank lines
  const usageEnd = output.match(/^[Uu]sage:.*(?:\n[ \t]+.*)*/m);
  if (!usageEnd) return undefined;

  const afterUsage = output.slice((usageEnd.index ?? 0) + usageEnd[0].length);
  // Strip all leading blank lines
  const trimmed = afterUsage.replace(/^[\s\n]+/, '');

  // Take text before the first section header or options block
  const sectionStart = trimmed.search(/^(?:[A-Z][\w ]*:|\s{2,}-\w)/m);
  const descText = sectionStart === -1 ? trimmed : trimmed.slice(0, sectionStart);

  if (!descText.trim()) return undefined;
  return extractFirstParagraph(descText, 500);
}

/** Extract flags from help output, using section detection when possible. */
function extractHelpFlags(output: string): FlagDetail[] {
  // Try to find an Options/Flags section
  const optionsMatch = output.match(
    /^(?:(?:Global )?[Oo]ptions|[Ff]lags):?\s*\n([\s\S]*?)(?=\n[A-Za-z][\w ]*:\s*\n|\n\n\S|$)/m,
  );
  if (optionsMatch) {
    return parseFlagsFromText(optionsMatch[1]);
  }

  // Fallback: parse flags from the entire output
  return parseFlagsFromText(output);
}

function extractSubcommands(output: string, commandName: string): CommandDetail[] {
  const subcommands: CommandDetail[] = [];
  const seen = new Set<string>();

  // Find command sections (Common Commands, Management Commands, Commands, etc.)
  const sectionRe = /^(?:[\w ]*[Cc]ommands?|[Ss]ubcommands?):?\s*\n([\s\S]*?)(?=\n[A-Za-z][\w ]*:\s*\n|\n\n\S|$)/gm;
  let sectionMatch: RegExpExecArray | null;
  while ((sectionMatch = sectionRe.exec(output)) !== null) {
    const section = sectionMatch[1];
    parseSubcommandSection(section, commandName, subcommands, seen);
  }

  // If no sections found, try the whole output with the simpler pattern
  if (subcommands.length === 0) {
    parseSubcommandSection(output, commandName, subcommands, seen);
  }

  return subcommands;
}

function parseSubcommandSection(
  text: string,
  commandName: string,
  subcommands: CommandDetail[],
  seen: Set<string>,
): void {
  const regex = /^\s{2,}(\S+)\s{2,}(.+)$/gm;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1];
    if (raw.startsWith('-')) continue;
    if (raw.length > 30) continue;
    const name = raw.replace(/[^a-zA-Z0-9_-]+$/, '');
    if (!name || !/^[\w][\w-]*$/.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    subcommands.push({
      name: `${commandName} ${name}`,
      description: match[2].trim(),
    });
  }
}

export async function parseHelp(commandName: string, binPath: string): Promise<{
  synopsis?: string;
  longDescription?: string;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
  arguments: ArgumentDetail[];
} | null> {
  if (isBlocklisted(commandName)) return null;

  try {
    const s = await stat(binPath);
    if (s.uid !== 0 && s.uid !== process.getuid?.()) return null;
  } catch {
    return null;
  }

  const sandboxDir = await mkdtemp(join(tmpdir(), 'shortty-help-'));
  let output: string;
  try {
    output = await execCommand(binPath, ['--help'], sandboxDir);
  } catch {
    return null;
  } finally {
    try { await rm(sandboxDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  const synopsis = extractUsageLine(output);
  const longDescription = extractHelpDescription(output);
  const subcommands = extractSubcommands(output, commandName);
  const flags = extractHelpFlags(output);
  const args = synopsis ? parseArgumentsFromSynopsis(synopsis) : [];

  if (subcommands.length === 0 && flags.length === 0 && args.length === 0) return null;
  return { synopsis, longDescription, subcommands, flags, arguments: args };
}

export async function parseSubcommandHelp(
  baseBinPath: string,
  subcommandParts: string[],
  qualifiedName: string,
): Promise<Omit<SubcommandDetail, 'enrichment' | 'enrichedAt'> | null> {
  const sandboxDir = await mkdtemp(join(tmpdir(), 'shortty-sub-'));
  let output: string;
  try {
    output = await execCommand(baseBinPath, [...subcommandParts, '--help'], sandboxDir);
  } catch {
    return null;
  } finally {
    try { await rm(sandboxDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  const synopsis = extractUsageLine(output);
  const longDescription = extractHelpDescription(output);
  const subcommands = extractSubcommands(output, qualifiedName);
  const flags = extractHelpFlags(output);
  const args = synopsis ? parseArgumentsFromSynopsis(synopsis) : [];

  if (subcommands.length === 0 && flags.length === 0 && args.length === 0) return null;

  // Extract description from first line that looks like "name - description"
  const descMatch = output.match(/^\S.*?[-\u2013\u2014]\s+(.+)/m);
  const description = descMatch?.[1]?.trim() ?? '';

  return { name: qualifiedName, description, synopsis, longDescription, subcommands, flags, arguments: args };
}
