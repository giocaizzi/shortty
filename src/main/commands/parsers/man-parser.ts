import { exec } from 'node:child_process';
import type { CommandDetail, FlagDetail } from '../../../shared/types';

export async function parseManPage(commandName: string): Promise<{
  description?: string;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
} | null> {
  let content: string;
  try {
    content = await new Promise<string>((resolve, reject) => {
      exec(`man ${commandName} 2>/dev/null | col -bx`, {
        encoding: 'utf-8',
        timeout: 5000,
        maxBuffer: 5 * 1024 * 1024,
      }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  } catch {
    return null;
  }

  if (!content.trim()) return null;

  const description = extractNameSection(content);
  const flags = extractFlags(content);
  const subcommands = extractSubcommands(content, commandName);

  return { description, subcommands, flags };
}

function extractNameSection(content: string): string | undefined {
  const nameMatch = content.match(/^NAME\s*\n\s+\S+\s+[-\u2013\u2014]\s+(.+)/m);
  return nameMatch?.[1]?.trim();
}

function extractFlags(content: string): FlagDetail[] {
  const flags: FlagDetail[] = [];
  const flagRegex = /^\s{2,8}(-\w)(?:,\s*(--[\w-]+))?\s*(?:(\S+))?\s{2,}(.+)/gm;
  const longOnlyRegex = /^\s{2,8}(--[\w-]+)\s*(?:(\S+))?\s{2,}(.+)/gm;

  let match: RegExpExecArray | null;
  while ((match = flagRegex.exec(content)) !== null) {
    flags.push({
      short: match[1],
      long: match[2] || undefined,
      arg: match[3] || undefined,
      description: match[4].trim(),
    });
  }

  const seenLong = new Set(flags.map(f => f.long).filter(Boolean));
  while ((match = longOnlyRegex.exec(content)) !== null) {
    if (seenLong.has(match[1])) continue;
    flags.push({
      long: match[1],
      arg: match[2] || undefined,
      description: match[3].trim(),
    });
  }

  return flags;
}

function extractSubcommands(content: string, commandName: string): CommandDetail[] {
  const subcommands: CommandDetail[] = [];
  const seen = new Set<string>();

  // Format 1: section-based — "COMMANDS" / "SUBCOMMANDS" with "  name  description"
  const cmdSectionMatch = content.match(
    /^(?:COMMANDS?|SUBCOMMANDS?)\s*\n([\s\S]*?)(?=\n[A-Z][A-Z ]*\s*\n|$)/m,
  );
  if (cmdSectionMatch) {
    const section = cmdSectionMatch[1];
    const subCmdRegex = /^\s{2,8}(\S+)\s{2,}(.+)/gm;
    let match: RegExpExecArray | null;
    while ((match = subCmdRegex.exec(section)) !== null) {
      const name = match[1];
      if (name.startsWith('-') || name.includes('(')) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      subcommands.push({
        name: `${commandName} ${name}`,
        description: match[2].trim(),
      });
    }
  }

  // Format 2: man page cross-references — "  cmd-subcmd(1)\n      description"
  const refRegex = new RegExp(
    `^\\s+${commandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\S+?)\\(\\d+\\)\\s*\\n\\s{8,}(.+)`,
    'gm',
  );
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(content)) !== null) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    subcommands.push({
      name: `${commandName} ${name}`,
      description: match[2].trim(),
    });
  }

  return subcommands;
}
