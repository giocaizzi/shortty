import { spawn } from 'node:child_process';
import { sandboxEnv } from '../sandbox-exec';
import type { ArgumentDetail, CommandDetail, FlagDetail, HelpExtras, SubcommandDetail } from '../../../shared/types';
import {
  splitManSections,
  parseFlagsFromText,
  parseArgumentsFromSynopsis,
  resolveArgumentDescriptions,
  extractFirstParagraph,
  extractSynopsis,
  normalizeText,
  deduplicateFlags,
  joinWrapped,
  stripDeprecated,
} from './parse-utils';
import { parseAliases, parseArgumentEntries, parseEnvironment, parseExamples, parseSeeAlso } from './help-extras';

const MAN_TIMEOUT_MS = 5000;

function fetchManPage(name: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const env = sandboxEnv();
    // man runs a pipeline (groff, preconv, a pager...): give it its own
    // process group so a timeout kills all of it, not just man.
    const useGroup = process.platform !== 'win32';
    const man = spawn('man', [name], {
      stdio: ['ignore', 'pipe', 'ignore'],
      detached: useGroup,
      env,
    });
    const manTimer = setTimeout(() => {
      try {
        if (useGroup && man.pid) process.kill(-man.pid, 'SIGKILL');
        else man.kill('SIGKILL');
      } catch {
        man.kill('SIGKILL');
      }
    }, MAN_TIMEOUT_MS);
    man.on('close', () => clearTimeout(manTimer));
    man.on('error', () => clearTimeout(manTimer));
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
  // gcloud wraps it: "gcloud compute instances create - create Compute Engine virtual machine\n instances"
  const paragraph = nameSection.trim().split(/\n\s*\n/)[0];
  const match = joinWrapped(paragraph.split('\n').map(l => l.trim())).match(/\S+\s+[-–—]\s+(.+)/);
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

/** Sections that document flags: OPTIONS, GLOBAL FLAGS, OPTIONS INHERITED FROM PARENT COMMANDS... */
const FLAG_SECTION_RE = /\b(?:OPTIONS|FLAGS)\b/;

function extractSubcommands(
  sections: Map<string, string>,
  commandName: string,
  fullContent: string,
): CommandDetail[] {
  const subcommands: CommandDetail[] = [];
  const seen = new Set<string>();
  const add = (name: string, description: string, group?: string) => {
    if (!SUBCOMMAND_NAME_RE.test(name) || seen.has(name)) return;
    seen.add(name);
    const [text, deprecated] = stripDeprecated(description);
    const entry: CommandDetail = { name: `${commandName} ${name}`, description: text };
    if (group) entry.group = group;
    if (deprecated) entry.deprecated = true;
    subcommands.push(entry);
  };

  // Format 1: sections titled "COMMANDS", "SUBCOMMANDS", "ESSENTIAL COMMANDS", gcloud "GROUPS", ...
  for (const [title, body] of sections) {
    if (!/\b(?:SUB)?COMMANDS?\b|^GROUPS$/.test(title) || FLAG_SECTION_RE.test(title)) continue;
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Table row: "   name     description"
      const row = line.match(/^\s{2,8}(\S+)\s{2,}(\S.*)$/);
      if (row) {
        add(row[1], row[2].trim(), title);
        continue;
      }
      // Entry with its description on the next, deeper-indented line (ronn/brew, gcloud):
      // "   install [options] formula\n       Install formula."
      const entry = line.match(/^( {2,5})([a-z0-9][\w.+-]*)(?:,| |$)/);
      if (entry) {
        const next = lines[i + 1] ?? '';
        const nextIndent = next.match(/^( *)/)?.[1].length ?? 0;
        if (next.trim() && nextIndent > entry[1].length) {
          // The description paragraph may wrap (gcloud): keep its first sentence
          const paragraph: string[] = [];
          for (let j = i + 1; j < lines.length && lines[j].trim() && (lines[j].match(/^( *)/)?.[1].length ?? 0) === nextIndent; j++) {
            paragraph.push(lines[j].trim());
          }
          const text = joinWrapped(paragraph);
          add(entry[2], text.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? text, title);
        }
      }
    }
  }

  // Format 2: man page cross-references — "  cmd-subcmd(1)\n      description";
  // a subcommand's page names them with dashes ("gh auth" -> "gh-auth-login(1)")
  const refPrefix = commandName.replace(/ /g, '-').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const refRegex = new RegExp(
    `^\\s+${refPrefix}-(\\S+?)\\(\\d+\\)\\s*\\n\\s{8,}(.+)`,
    'gm',
  );
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(fullContent)) !== null) {
    add(match[1], match[2].trim());
  }

  return subcommands;
}

/**
 * Flags of one section, grouped by its subsection headings (indented 3
 * columns: ffmpeg's "Main options", "Video Options", ...).
 */
function parseSectionFlags(title: string, body: string): FlagDetail[] {
  const flags: FlagDetail[] = [];
  let group = title;
  let chunk: string[] = [];
  const flush = () => {
    flags.push(...parseFlagsFromText(chunk.join('\n'), group));
    chunk = [];
  };
  for (const line of body.split('\n')) {
    const sub = line.match(/^ {3}([A-Z][^\s-].{0,58})$/);
    if (sub && !/[.:,;]$/.test(sub[1])) {
      flush();
      group = sub[1].trim();
      continue;
    }
    chunk.push(line);
  }
  flush();
  // gcloud "REQUIRED FLAGS"
  if (/\bREQUIRED\b/.test(title)) for (const flag of flags) flag.required = true;
  return flags;
}

/**
 * Flags from OPTIONS-like sections plus DESCRIPTION, where BSD (mdoc) pages
 * document their options ("The options are as follows:").
 */
function extractManFlags(sections: Map<string, string>): FlagDetail[] {
  const flags: FlagDetail[] = [];
  for (const [title, body] of sections) {
    if (FLAG_SECTION_RE.test(title)) flags.push(...parseSectionFlags(title, body));
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

function sectionsMatching(sections: Map<string, string>, re: RegExp): string {
  return [...sections].filter(([title]) => re.test(title)).map(([, body]) => body).join('\n\n');
}

export interface ParsedMan extends HelpExtras {
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

  // ARGUMENTS: a POSITIONAL ARGUMENTS list (gcloud) is authoritative;
  // otherwise from SYNOPSIS, resolved against OPTIONS
  let args = parseArgumentEntries(sections.get('POSITIONAL ARGUMENTS') ?? '');
  if (args.length === 0 && synopsis) {
    args = parseArgumentsFromSynopsis(synopsis);
    if (args.length > 0 && optionsSection) {
      args = resolveArgumentDescriptions(args, optionsSection);
    }
  }

  // SUBCOMMANDS
  const subcommands = extractSubcommands(sections, commandName, content);

  const result: ParsedMan = { description, synopsis, longDescription, subcommands, flags, arguments: args };
  const examples = parseExamples(sectionsMatching(sections, /^EXAMPLES?$/), commandName);
  if (examples.length > 0) result.examples = examples;
  const environment = parseEnvironment(sectionsMatching(sections, /^ENVIRONMENT(?: VARIABLES)?$/));
  if (environment.length > 0) result.environment = environment;
  const aliases = parseAliases(sections.get('ALIASES') ?? '', commandName);
  if (aliases.length > 0) result.aliases = aliases;
  const seeAlso = parseSeeAlso(sections.get('SEE ALSO') ?? '');
  if (seeAlso.length > 0) result.seeAlso = seeAlso;
  return result;
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
