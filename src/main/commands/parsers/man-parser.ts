import { spawn } from 'node:child_process';
import { sandboxEnv } from '../sandbox-exec';
import type { ArgumentDetail, CommandDetail, FlagDetail, SubcommandDetail } from '../../../shared/types';
import {
  splitManSections,
  parseFlagsFromText,
  parseArgumentsFromSynopsis,
  resolveArgumentDescriptions,
  extractFirstParagraph,
  extractSynopsis,
  normalizeText,
  deduplicateFlags,
} from './parse-utils';

function fetchManPage(name: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const env = sandboxEnv();
    const man = spawn('man', [name], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      killSignal: 'SIGKILL',
      env,
    });
    const col = spawn('col', ['-bx'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 6000,
      killSignal: 'SIGKILL',
      env,
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

/** A plausible subcommand name: lowercase word, not prose ("affect.") or placeholders ("{start}"). */
const SUBCOMMAND_NAME_RE = /^[a-z0-9][\w+-]*(?:\.[\w+-]+)*$/;

function extractSubcommands(
  sections: Map<string, string>,
  commandName: string,
  fullContent: string,
): CommandDetail[] {
  const subcommands: CommandDetail[] = [];
  const seen = new Set<string>();
  const add = (name: string, description: string) => {
    if (!SUBCOMMAND_NAME_RE.test(name) || seen.has(name)) return;
    seen.add(name);
    subcommands.push({ name: `${commandName} ${name}`, description });
  };

  // Format 1: sections titled "COMMANDS", "SUBCOMMANDS", "ESSENTIAL COMMANDS", ...
  for (const [title, body] of sections) {
    if (!/\b(?:SUB)?COMMANDS?\b/.test(title)) continue;
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Table row: "   name     description"
      const row = line.match(/^\s{2,8}(\S+)\s{2,}(\S.*)$/);
      if (row) {
        add(row[1], row[2].trim());
        continue;
      }
      // Entry with its description on the next, deeper-indented line (ronn/brew):
      // "   install [options] formula\n       Install formula."
      const entry = line.match(/^( {2,4})([a-z0-9][\w.+-]*)(?:,| |$)/);
      if (entry) {
        const next = lines[i + 1] ?? '';
        const nextIndent = next.match(/^( *)/)?.[1].length ?? 0;
        if (next.trim() && nextIndent > entry[1].length) add(entry[2], next.trim());
      }
    }
  }

  // Format 2: man page cross-references — "  cmd-subcmd(1)\n      description"
  const refRegex = new RegExp(
    `^\\s+${commandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\S+?)\\(\\d+\\)\\s*\\n\\s{8,}(.+)`,
    'gm',
  );
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(fullContent)) !== null) {
    add(match[1], match[2].trim());
  }

  return subcommands;
}

/**
 * Flags from OPTIONS-like sections plus DESCRIPTION, where BSD (mdoc) pages
 * document their options ("The options are as follows:").
 */
function extractManFlags(sections: Map<string, string>): FlagDetail[] {
  const flags: FlagDetail[] = [];
  for (const name of ['OPTIONS', 'FLAGS', 'OPTIONS AND ARGUMENTS', 'GLOBAL OPTIONS']) {
    const section = sections.get(name);
    if (section) flags.push(...parseFlagsFromText(section));
  }

  // DESCRIPTION holds all options on BSD pages, and the mode flags on bsdtar's.
  // On GNU pages it holds prose that merely starts with a flag ("--head supports
  // <user>:<branch> syntax"), so only take flags not already documented above.
  const description = sections.get('DESCRIPTION');
  if (description) {
    const known = new Set(flags.flatMap(f => [f.short, f.long]).filter(Boolean));
    for (const flag of parseFlagsFromText(description)) {
      if ((flag.short && known.has(flag.short)) || (flag.long && known.has(flag.long))) continue;
      flags.push(flag);
    }
  }

  return deduplicateFlags(flags);
}

export interface ParsedMan {
  description?: string;
  synopsis?: string;
  longDescription?: string;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
  arguments: ArgumentDetail[];
}

/** Parse a rendered man page (`man <name> | col -bx` output). Pure; no process spawning. */
export function parseManContent(content: string, commandName: string): ParsedMan | null {
  if (!content.trim()) return null;

  content = normalizeText(content);
  const sections = splitManSections(content);

  const description = extractNameDescription(sections);

  // SYNOPSIS extraction
  const synopsisSection = findSection(sections, 'SYNOPSIS', 'SYNTAX');
  const synopsis = synopsisSection ? extractSynopsis(synopsisSection) : undefined;

  // DESCRIPTION extraction (first paragraph)
  const descSection = findSection(sections, 'DESCRIPTION');
  const longDescription = descSection ? extractFirstParagraph(descSection) : undefined;

  const optionsSection = findSection(sections, 'OPTIONS', 'FLAGS', 'OPTIONS AND ARGUMENTS');
  const flags = extractManFlags(sections);

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

export async function parseManPage(commandName: string): Promise<ParsedMan | null> {
  let content: string;
  try {
    content = await fetchManPage(commandName);
  } catch {
    return null;
  }
  return parseManContent(content, commandName);
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

  const parsed = parseManContent(content, qualifiedName);
  if (!parsed) return null;
  const { description, ...rest } = parsed;
  if (rest.subcommands.length === 0 && rest.flags.length === 0 && rest.arguments.length === 0) return null;

  return { name: qualifiedName, description: description ?? '', ...rest };
}
