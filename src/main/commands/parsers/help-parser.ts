import { exec } from 'node:child_process';
import { stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandDetail, FlagDetail, SubcommandDetail } from '../../../shared/types';

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

export async function parseHelp(commandName: string, binPath: string): Promise<{
  subcommands: CommandDetail[];
  flags: FlagDetail[];
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
    output = await new Promise<string>((resolve, reject) => {
      exec(`"${binPath}" --help 2>&1 < /dev/null`, {
        encoding: 'utf-8',
        timeout: 2000,
        maxBuffer: 1 * 1024 * 1024,
        cwd: sandboxDir,
      }, (error, stdout, stderr) => {
        if (error) {
          const fallback = stderr || stdout || '';
          if (fallback) resolve(fallback);
          else reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  } catch {
    return null;
  } finally {
    try { await rm(sandboxDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  const subcommands = extractSubcommands(output, commandName);
  const flags = extractFlags(output);

  if (subcommands.length === 0 && flags.length === 0) return null;
  return { subcommands, flags };
}

function extractSubcommands(output: string, commandName: string): CommandDetail[] {
  const subcommands: CommandDetail[] = [];
  const regex = /^\s{2,}(\S+)\s{2,}(.+)$/gm;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(output)) !== null) {
    const raw = match[1];
    if (raw.startsWith('-')) continue;
    if (raw.length > 30) continue;
    // Strip trailing punctuation (e.g. "login:" → "login", "given." → "given")
    const name = raw.replace(/[^a-zA-Z0-9_-]+$/, '');
    if (!name || !/^[\w][\w-]*$/.test(name)) continue;
    subcommands.push({
      name: `${commandName} ${name}`,
      description: match[2].trim(),
    });
  }

  return subcommands;
}

function extractFlags(output: string): FlagDetail[] {
  const flags: FlagDetail[] = [];
  const regex = /^\s{2,}(-\w),?\s*(--[\w-]+)?\s*(?:(\S+))?\s{2,}(.+)$/gm;
  const longOnly = /^\s{2,}(--[\w-]+)\s*(?:(\S+))?\s{2,}(.+)$/gm;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(output)) !== null) {
    flags.push({
      short: match[1],
      long: match[2] || undefined,
      arg: match[3] || undefined,
      description: match[4].trim(),
    });
  }

  const seenLong = new Set(flags.map(f => f.long).filter(Boolean));
  while ((match = longOnly.exec(output)) !== null) {
    if (seenLong.has(match[1])) continue;
    flags.push({
      long: match[1],
      arg: match[2] || undefined,
      description: match[3].trim(),
    });
  }

  return flags;
}

export async function parseSubcommandHelp(
  baseBinPath: string,
  subcommandParts: string[],
  qualifiedName: string,
): Promise<Omit<SubcommandDetail, 'enrichment' | 'enrichedAt'> | null> {
  const args = subcommandParts.map(p => `"${p}"`).join(' ');
  const sandboxDir = await mkdtemp(join(tmpdir(), 'shortty-sub-'));
  let output: string;
  try {
    output = await new Promise<string>((resolve, reject) => {
      exec(`"${baseBinPath}" ${args} --help 2>&1 < /dev/null`, {
        encoding: 'utf-8',
        timeout: 2000,
        maxBuffer: 1 * 1024 * 1024,
        cwd: sandboxDir,
      }, (error, stdout, stderr) => {
        if (error) {
          const fallback = stderr || stdout || '';
          if (fallback) resolve(fallback);
          else reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  } catch {
    return null;
  } finally {
    try { await rm(sandboxDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  const subcommands = extractSubcommands(output, qualifiedName);
  const flags = extractFlags(output);

  if (subcommands.length === 0 && flags.length === 0) return null;

  // Extract description from first non-empty line that looks like a description
  const descMatch = output.match(/^\S.*?[-\u2013\u2014]\s+(.+)/m);
  const description = descMatch?.[1]?.trim() ?? '';

  return { name: qualifiedName, description, subcommands, flags };
}
