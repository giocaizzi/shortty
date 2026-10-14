import { spawn } from 'node:child_process';
import type { ArgumentDetail, CommandDetail, FlagDetail, SubcommandDetail } from '../../../shared/types';
import {
  splitManSections,
  parseFlagsFromText,
  parseArgumentsFromSynopsis,
  resolveArgumentDescriptions,
  extractFirstParagraph,
  extractSynopsis,
} from './parse-utils';

function fetchManPage(name: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const man = spawn('man', [name], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    const col = spawn('col', ['-bx'], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    man.stdout.pipe(col.stdin);

    const chunks: Buffer[] = [];
    let size = 0;
    const maxBuffer = 5 * 1024 * 1024;

    col.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= maxBuffer) chunks.push(chunk);
    });

    col.on('close', (code) => {
      if (code !== 0 && chunks.length === 0) {
        reject(new Error(`col exited with code ${code}`));
      } else {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    });

    man.on('error', reject);
    col.on('error', reject);
  });
}

function extractNameDescription(sections: Map<string, string>): string | undefined {
  const nameSection = sections.get('NAME');
  if (!nameSection) return undefined;
  const match = nameSection.match(/\S+\s+[-\u2013\u2014]\s+(.+)/);
  return match?.[1]?.trim();
}

function findSection(sections: Map<string, string>, ...candidates: string[]): string | undefined {
  for (const name of candidates) {
    const section = sections.get(name);
    if (section) return section;
  }
  return undefined;
}

function extractSubcommands(
  sections: Map<string, string>,
  commandName: string,
  fullContent: string,
): CommandDetail[] {
  const subcommands: CommandDetail[] = [];
  const seen = new Set<string>();

  // Format 1: section-based — "COMMANDS" / "SUBCOMMANDS" section
  const cmdSection = findSection(sections, 'COMMANDS', 'COMMAND', 'SUBCOMMANDS', 'SUBCOMMAND');
  if (cmdSection) {
    const subCmdRegex = /^\s{2,8}(\S+)\s{2,}(.+)/gm;
    let match: RegExpExecArray | null;
    while ((match = subCmdRegex.exec(cmdSection)) !== null) {
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
  while ((match = refRegex.exec(fullContent)) !== null) {
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

export async function parseManPage(commandName: string): Promise<{
  description?: string;
  synopsis?: string;
  longDescription?: string;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
  arguments: ArgumentDetail[];
} | null> {
  let content: string;
  try {
    content = await fetchManPage(commandName);
  } catch {
    return null;
  }

  if (!content.trim()) return null;

  const sections = splitManSections(content);

  const description = extractNameDescription(sections);

  // SYNOPSIS extraction
  const synopsisSection = findSection(sections, 'SYNOPSIS', 'SYNTAX');
  const synopsis = synopsisSection ? extractSynopsis(synopsisSection) : undefined;

  // DESCRIPTION extraction (first paragraph)
  const descSection = findSection(sections, 'DESCRIPTION');
  const longDescription = descSection ? extractFirstParagraph(descSection) : undefined;

  // FLAGS from OPTIONS section
  const optionsSection = findSection(sections, 'OPTIONS', 'FLAGS', 'OPTIONS AND ARGUMENTS');
  const flags = optionsSection ? parseFlagsFromText(optionsSection) : [];

  // ARGUMENTS from SYNOPSIS, resolved against OPTIONS
  let args: ArgumentDetail[] = [];
  if (synopsis) {
    args = parseArgumentsFromSynopsis(synopsis);
    if (args.length > 0 && optionsSection) {
      args = resolveArgumentDescriptions(args, optionsSection);
    }
  }

  // SUBCOMMANDS
  const subcommands = extractSubcommands(sections, commandName, content);

  return { description, synopsis, longDescription, subcommands, flags, arguments: args };
}

export async function parseSubcommandManPage(
  qualifiedName: string,
): Promise<Omit<SubcommandDetail, 'enrichment' | 'enrichedAt'> | null> {
  const manName = qualifiedName.replace(/ /g, '-');

  let content: string;
  try {
    content = await fetchManPage(manName);
  } catch {
    return null;
  }

  if (!content.trim()) return null;

  const sections = splitManSections(content);

  const description = extractNameDescription(sections) ?? '';

  const synopsisSection = findSection(sections, 'SYNOPSIS', 'SYNTAX');
  const synopsis = synopsisSection ? extractSynopsis(synopsisSection) : undefined;

  const descSection = findSection(sections, 'DESCRIPTION');
  const longDescription = descSection ? extractFirstParagraph(descSection) : undefined;

  const optionsSection = findSection(sections, 'OPTIONS', 'FLAGS', 'OPTIONS AND ARGUMENTS');
  const flags = optionsSection ? parseFlagsFromText(optionsSection) : [];

  let args: ArgumentDetail[] = [];
  if (synopsis) {
    args = parseArgumentsFromSynopsis(synopsis);
    if (args.length > 0 && optionsSection) {
      args = resolveArgumentDescriptions(args, optionsSection);
    }
  }

  const subcommands = extractSubcommands(sections, qualifiedName, content);

  if (subcommands.length === 0 && flags.length === 0 && args.length === 0) return null;

  return { name: qualifiedName, description, synopsis, longDescription, subcommands, flags, arguments: args };
}
