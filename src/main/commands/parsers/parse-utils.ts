import type { FlagDetail, ArgumentDetail } from '../../../shared/types';

/**
 * Split man page or structured text into named sections.
 * Man page headers are ALL-CAPS at column 0. Help output headers
 * may use title-case with trailing colon (e.g. "Options:").
 */
export function splitManSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  // Match lines that are entirely uppercase words (man pages), e.g. "SEE ALSO",
  // "HIGH-LEVEL COMMANDS (PORCELAIN)", "X11 FORWARDING"
  const headerRe = /^([A-Z][A-Z0-9 /&()-]+?)[ \t]*$/gm;
  const headers: { name: string; index: number; start: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(content)) !== null) {
    headers.push({
      name: match[1].trim(),
      index: match.index,
      start: match.index + match[0].length,
    });
  }

  for (let i = 0; i < headers.length; i++) {
    // The body runs until the next header line. (Searching for the next
    // header's text instead truncated sections whose body contained it.)
    const end = i + 1 < headers.length ? headers[i + 1].index : content.length;
    // First occurrence wins when a header name repeats
    if (!sections.has(headers[i].name)) {
      sections.set(headers[i].name, content.slice(headers[i].start, end));
    }
  }

  return sections;
}

/**
 * Normalize captured help/man text before parsing: strip ANSI escape
 * sequences and backspace overstrike (bold/underline), unify line endings
 * and expand tabs to 8-column stops so indentation comparisons work.
 */
export function normalizeText(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\n]\x08/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(expandTabs)
    .join('\n');
}

function expandTabs(line: string): string {
  if (!line.includes('\t')) return line;
  let out = '';
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(8 - (out.length % 8));
    else out += ch;
  }
  return out;
}

/** A line that starts a flag entry: optional indent, then -x / --xx (or fzf-style +x,). */
const FLAG_START_RE = /^(\s{0,8})(?:--?[^\s-]|\+[A-Za-z],?\s)/;

/**
 * A wrapped prose line that happens to start with a flag ("-f and file
 * arguments.", "--parallel-immediate, -Z, --parallel, -#, --progress-bar,"):
 * several words, no column gap, ending in sentence/list punctuation.
 */
function isProseLine(trimmed: string): boolean {
  return !/\s{2,}/.test(trimmed) && /(?:[,;]|[^.]\.)$/.test(trimmed) && trimmed.split(/\s+/).length >= 3;
}

/**
 * Stateful line-by-line flag parser. Handles multi-line descriptions,
 * complex arg patterns (-U<n>, --chmod=(+|-)x, --[no-]all, --file <path>,
 * -C DIRECTORY), and various flag formats (GNU, BSD, cobra, clap, kubectl).
 */
export function parseFlagsFromText(text: string): FlagDetail[] {
  const flags: FlagDetail[] = [];
  const lines = normalizeText(text).split('\n');

  let current: { short?: string; long?: string; arg?: string; descLines: string[] } | null = null;
  let flagIndent = 0;

  for (const line of lines) {
    const flagMatch = line.match(FLAG_START_RE);
    if (flagMatch && !isProseLine(line.trim())) {
      if (current) flags.push(finishFlag(current));

      flagIndent = flagMatch[1].length;
      const parsed = parseFlagLine(line.trim());
      current = { ...parsed, descLines: [] };
      if (parsed.inlineDesc) current.descLines.push(parsed.inlineDesc);
      continue;
    }

    if (!current) continue;

    // Blank line: may be a paragraph break inside a multi-paragraph description
    if (line.trim() === '') continue;

    // Continuation line: indented deeper than the flag itself
    const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (leadingSpaces > flagIndent) {
      current.descLines.push(line.trim());
      continue;
    }

    // Anything else ends the current flag
    flags.push(finishFlag(current));
    current = null;
  }

  if (current) flags.push(finishFlag(current));

  return deduplicateFlags(flags);
}

interface ParsedFlagLine {
  short?: string;
  long?: string;
  arg?: string;
  inlineDesc?: string;
}

/**
 * Tokens that read as an option argument rather than the start of a
 * description: <file>, [N], {a|b}, FILE, string, bool|auto, #, ...
 * A capitalised word ("Create") is treated as description text.
 */
function isArgToken(token: string): boolean {
  if (/^[<[{(]/.test(token)) return true;
  if (/^[A-Z][a-z]/.test(token)) return false;
  return /^(?:[A-Za-z_#@][\w#@:./|=[\]<>{}()+-]*)$/.test(token) || token === '#';
}

/** Split on whitespace, keeping "<file name>" and "[=<n>]" groups together. */
function splitOutsideBrackets(text: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '<' || ch === '[' || ch === '{') depth++;
    else if ((ch === '>' || ch === ']' || ch === '}') && depth > 0) depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Parse a single flag line like "-n, --dry-run  Don't actually add" */
function parseFlagLine(line: string): ParsedFlagLine {
  const result: ParsedFlagLine = {};

  // kubectl style: "-A, --all-namespaces=false:" (value is the default, desc on next line)
  const kubectlStyle = /^-.*=.*:$/.test(line) && !/\s{2,}/.test(line);
  const work = kubectlStyle ? line.slice(0, -1) : line;

  // Flag tokens end at the first 2+ space gap; the rest is the description
  const gap = work.match(/^(.*?\S)\s{2,}(\S.*)$/);
  const tokenPart = gap ? gap[1] : work;
  const descParts: string[] = gap ? [gap[2].trim()] : [];

  const tokens = splitOutsideBrackets(tokenPart)
    .flatMap(t => t.split(/\|(?=[-+])/))
    .map(t => (t.length > 2 && t.endsWith(',') ? t.slice(0, -1) : t))
    .filter(Boolean);

  const leftover: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (leftover.length > 0) {
      leftover.push(tok);
      continue;
    }
    if (/^--[^\s-]/.test(tok) || /^--\[/.test(tok)) {
      // --name, --name=<arg>, --name[=<arg>], --[no-]name, --name...
      const m = tok.match(/^(--(?:\[[\w-]+\])?[^\s=[]+?)(\.\.\.)?(\[?=.*)?$/);
      const name = m?.[1] ?? tok;
      const argPart = m?.[3];
      if (!result.long) result.long = name;
      if (argPart && !result.arg && !kubectlStyle) {
        result.arg = argPart.startsWith('[=') ? `[${argPart.slice(2)}` : argPart.slice(1);
      }
    } else if (/^-[A-Za-z][A-Za-z0-9-]+$/.test(tok) && !/^-[A-Za-z][A-Z]/.test(tok) && tok.length > 3) {
      // single-dash long option (find -name, java -version)
      if (!result.long) result.long = tok;
    } else if (/^[-+][^\s-]/.test(tok)) {
      // -x, -x<arg>, -x[<arg>], +x (fzf)
      if (!result.short) {
        result.short = tok.slice(0, 2);
        const attached = tok.slice(2);
        if (attached && !result.arg) result.arg = attached;
      }
    } else if (!result.arg && isArgToken(tok) && i > 0) {
      result.arg = tok.replace(/\.\.\.$/, '') || tok;
    } else {
      leftover.push(tok);
    }
  }

  if (leftover.length > 0) descParts.unshift(leftover.join(' '));
  if (descParts.length > 0) result.inlineDesc = descParts.join(' ');

  return result;
}

function finishFlag(current: { short?: string; long?: string; arg?: string; descLines: string[] }): FlagDetail {
  let description = current.descLines.join(' ').replace(/\s+/g, ' ').trim();
  // Truncate long descriptions
  if (description.length > 300) {
    description = description.slice(0, 297) + '...';
  }
  return {
    short: current.short,
    long: current.long,
    arg: current.arg,
    description,
  };
}

/**
 * Drop entries without a flag and duplicates. A short-only (or long-only)
 * entry whose flag is already documented together with its other form is a
 * duplicate too: man pages often start prose lines with a flag ("-f and file
 * arguments.", "--head supports <user>:<branch> syntax").
 */
export function deduplicateFlags(flags: FlagDetail[]): FlagDetail[] {
  const seen = new Set<string>();
  const paired = flags.filter(f => f.short && f.long);
  const shortsWithLong = new Set(paired.map(f => f.short));
  const longsWithShort = new Set(paired.map(f => f.long));
  return flags.filter((f) => {
    if (!f.short && !f.long) return false;
    if (f.short && !f.long && shortsWithLong.has(f.short)) return false;
    if (f.long && !f.short && longsWithShort.has(f.long)) return false;
    const key = `${f.short ?? ''}|${f.long ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract positional arguments from a SYNOPSIS string.
 * Recognizes patterns like <name>, [<name>], <name>..., [name]
 */
export function parseArgumentsFromSynopsis(synopsis: string): ArgumentDetail[] {
  const args: ArgumentDetail[] = [];
  const seen = new Set<string>();

  // First strip all flag-like tokens to avoid false positives
  const stripped = synopsis
    // Remove flag groups like [--verbose | -v]
    .replace(/\[--?[\w|=<>[\](){},+\- ]+?\]/g, '')
    // Remove standalone flags like --force (but not the "-spec" in <package-spec>)
    .replace(/(^|[\s[(|])--?[\w-]+=?(?:\([^)]+\)|<[^>]+>|[\w]+)?/g, '$1')
    // Remove the command name at the start
    .replace(/^\s*\S+/, '');

  // Now extract angle-bracket arguments
  const angleBracketRe = /(\[)?<([\w][\w-]*)>(\.\.\.)?(\])?/g;
  let match: RegExpExecArray | null;
  while ((match = angleBracketRe.exec(stripped)) !== null) {
    const name = match[2];
    if (seen.has(name)) continue;
    seen.add(name);
    const inBrackets = Boolean(match[1]) || Boolean(match[4]) || bracketDepth(stripped, match.index) > 0;
    args.push({
      name,
      required: !inBrackets,
      variadic: Boolean(match[3]),
      description: '',
    });
  }

  // Also match bare bracket patterns like [file ...] or [directory]
  const bareRe = /\[\s*([\w][\w-]*)\s*(\.\.\.)?\s*\]/g;
  while ((match = bareRe.exec(stripped)) !== null) {
    const name = match[1];
    // Skip common non-argument words
    if (['options', 'option', 'flags', 'args'].includes(name.toLowerCase())) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    args.push({
      name,
      required: false,
      variadic: Boolean(match[2]),
      description: '',
    });
  }

  return args;
}

/** Number of unclosed "[" before `index` ("[(-c | -C) <commit>]" makes <commit> optional). */
function bracketDepth(text: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && depth > 0) depth--;
  }
  return depth;
}

/**
 * Resolve argument descriptions from OPTIONS section text.
 * Man pages often document positional arguments in OPTIONS
 * (e.g., <pathspec>... in git-add).
 */
export function resolveArgumentDescriptions(
  args: ArgumentDetail[],
  optionsText: string,
): ArgumentDetail[] {
  if (args.length === 0 || !optionsText) return args;

  const lines = optionsText.split('\n');

  return args.map((arg) => {
    if (arg.description) return arg;

    // Look for the argument name in OPTIONS, e.g. "  <pathspec>..." or "  pathspec"
    let capturing = false;
    const descLines: string[] = [];
    let entryIndent = 0;

    for (const line of lines) {
      if (capturing) {
        const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length ?? 0;
        if (line.trim() === '') continue;
        if (leadingSpaces > entryIndent + 2) {
          descLines.push(line.trim());
        } else {
          break;
        }
        continue;
      }

      // Check if this line defines the argument
      const trimmed = line.trim();
      const argPattern = new RegExp(
        `^<?${arg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>?(?:\\.\\.\\.)?$`,
      );
      if (argPattern.test(trimmed)) {
        const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
        entryIndent = indent;
        capturing = true;
      }
    }

    if (descLines.length > 0) {
      let description = descLines.join(' ');
      if (description.length > 300) {
        description = description.slice(0, 297) + '...';
      }
      return { ...arg, description };
    }

    return arg;
  });
}

/** Extract the first paragraph from a section text, capped at maxLen. */
export function extractFirstParagraph(text: string, maxLen = 500): string {
  // Remove leading whitespace/newlines
  const trimmed = text.replace(/^\s+/, '');

  // Find first blank line (paragraph break)
  const paraEnd = trimmed.search(/\n\s*\n/);
  const paragraph = paraEnd === -1 ? trimmed : trimmed.slice(0, paraEnd);

  // Normalize whitespace within the paragraph
  const normalized = paragraph.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLen) return normalized;
  return normalized.slice(0, maxLen - 3) + '...';
}

/**
 * Extract and normalize the SYNOPSIS section text.
 * Joins continuation lines and normalizes whitespace.
 */
export function extractSynopsis(synopsisText: string): string {
  return synopsisText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extract Usage line from --help output.
 * Matches "Usage: ...", "usage: ..." and bare "Usage:" / "USAGE" headers whose
 * usage statement is on the following line. Only includes continuation lines
 * that are indented (part of the same usage statement); alternate usage forms
 * that repeat the program name are not appended.
 */
export function extractUsageLine(helpOutput: string): string | undefined {
  const lines = normalizeText(helpOutput).split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s{0,2}(?:[Uu]sage|USAGE)(?::|$)\s*(.*)$/);
    if (!match) continue;

    let j = i + 1;
    let first = match[1].trim();
    if (!first) {
      // Bare header: the usage statement is on the next non-blank line
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length) return undefined;
      const candidate = lines[j];
      // "npm install        install all the dependencies" is a command table, not a usage
      if (/^\S/.test(candidate) && /\S\s{2,}\S/.test(candidate)) return undefined;
      first = candidate.trim();
      j++;
    }

    const program = first.split(/\s+/)[0];
    const parts = [first];
    for (; j < lines.length; j++) {
      const line = lines[j];
      const trimmed = line.trim();
      if (!trimmed || !/^\s{2,}/.test(line) || trimmed.startsWith('-')) break;
      if (trimmed.split(/\s+/)[0] === program) break;
      parts.push(trimmed);
    }
    return parts.join(' ').replace(/\s{2,}/g, ' ');
  }

  return undefined;
}
