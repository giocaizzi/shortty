import { exec } from 'node:child_process';
import { stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandDetail, FlagDetail } from '../../../shared/types';

const BLOCKLIST = new Set([
  'shutdown', 'reboot', 'halt', 'poweroff', 'init', 'rm', 'mkfs', 'fdisk', 'dd', 'kill', 'killall', 'pkill',
  'httpd', 'nginx', 'postgres', 'mysqld', 'mongod', 'redis-server', 'dockerd', 'sshd', 'cupsd',
  'ssh', 'telnet', 'ftp', 'sftp', 'nc', 'ncat', 'python', 'python3', 'node', 'ruby', 'irb', 'lua', 'perl',
  'bash', 'zsh', 'sh', 'fish', 'tcsh', 'csh',
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
      exec(`"${binPath}" --help 2>&1`, {
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
    const name = match[1];
    if (name.startsWith('-')) continue;
    if (name.length > 30) continue;
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
