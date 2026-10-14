import type { FlagDetail, ArgumentDetail } from '../../../shared/types';

/**
 * Split man page or structured text into named sections.
 * Man page headers are ALL-CAPS at column 0. Help output headers
 * may use title-case with trailing colon (e.g. "Options:").
 */
export function splitManSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  // Match lines that are entirely uppercase words (man pages)
  const headerRe = /^([A-Z][A-Z /-]+?)\s*$/gm;
  const headers: { name: string; start: number; end: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(content)) !== null) {
    headers.push({
      name: match[1].trim(),
      start: match.index + match[0].length,
      end: 0,
    });
  }

  for (let i = 0; i < headers.length; i++) {
    headers[i].end = i + 1 < headers.length
      ? content.lastIndexOf('\n', content.indexOf(headers[i + 1].name, headers[i].start))
      : content.length;
    const body = content.slice(headers[i].start, headers[i].end);
    sections.set(headers[i].name, body);
  }

  return sections;
}

/**
 * Stateful line-by-line flag parser. Handles multi-line descriptions,
 * complex arg patterns (-U<n>, --chmod=(+|-)x, --[no-]all), and
 * various flag formats.
 */
export function parseFlagsFromText(text: string): FlagDetail[] {
  const flags: FlagDetail[] = [];
  const lines = text.split('\n');

  let current: { short?: string; long?: string; arg?: string; descLines: string[] } | null = null;
  let flagIndent = 0;

  for (const line of lines) {
    // Detect flag-start: 2-8 leading spaces then a dash
    const flagMatch = line.match(/^(\s{2,8})-/);
    if (flagMatch) {
      // Flush previous flag
      if (current) {
        flags.push(finishFlag(current));
      }

      flagIndent = flagMatch[1].length;
      const parsed = parseFlagLine(line.trim());
      current = { ...parsed, descLines: [] };
      if (parsed.inlineDesc) {
        current.descLines.push(parsed.inlineDesc);
      }
      continue;
    }

    // Continuation line: indented deeper than the flag
    if (current && line.length > 0) {
      const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      // Continuation lines are typically indented 10+ spaces (flag at 7, desc at 11+)
      if (leadingSpaces > flagIndent + 2) {
        const trimmed = line.trim();
        if (trimmed) {
          current.descLines.push(trimmed);
        }
        continue;
      }
    }

    // Blank line or unindented line — flush current flag if we have one
    if (current && line.trim() === '') {
      // Could be a paragraph break within the description — peek ahead logic
      // is complex, so we allow it as a potential continuation
      continue;
    }

    // Non-flag, non-continuation line — flush
    if (current) {
      flags.push(finishFlag(current));
      current = null;
    }
  }

  // Flush last flag
  if (current) {
    flags.push(finishFlag(current));
  }

  return deduplicateFlags(flags);
}

interface ParsedFlagLine {
  short?: string;
  long?: string;
  arg?: string;
  inlineDesc?: string;
}

/** Parse a single flag line like "-n, --dry-run  Don't actually add" */
function parseFlagLine(line: string): ParsedFlagLine {
  const result: ParsedFlagLine = {};

  // Match the flag tokens portion (everything before the description gap)
  // Flags end where there's a 2+ space gap followed by a description word
  const tokenDescSplit = line.match(/^((?:-[^\s].*?))\s{2,}(.+)$/);
  const tokenPart = tokenDescSplit ? tokenDescSplit[1] : line;
  if (tokenDescSplit) {
    result.inlineDesc = tokenDescSplit[2].trim();
  }

  // Parse short flag: -X (single dash + single char, NOT --)
  // Handles: -n, -U<n>, -A
  const shortMatch = tokenPart.match(/(?:^|[\s,])(-[a-zA-Z0-9])(?!-)(<?[\w|+\-().>}\]]*>?)?/);
  if (shortMatch) {
    result.short = shortMatch[1];
    if (shortMatch[2] && shortMatch[2] !== ',') {
      result.arg = shortMatch[2];
    }
  }

  // Parse long flag: --flag, --flag=<arg>, --flag=(val), --[no-]flag, --chmod=(+|-)x
  const longMatch = tokenPart.match(/(--(?:\[[\w-]+\])?[\w-]+(?:=(?:\([^)]+\)\w*|<[^>]+>|[\w]+))?)/);
  if (longMatch) {
    result.long = longMatch[1];
    // Extract arg from --flag=<arg> or --flag=val (but not from --flag=(+|-)x which is the full flag)
    const eqMatch = longMatch[1].match(/^(--(?:\[[\w-]+\])?[\w-]+)=(.+)$/);
    if (eqMatch && !result.arg) {
      result.arg = eqMatch[2];
    }
  }

  return result;
}

function finishFlag(current: { short?: string; long?: string; arg?: string; descLines: string[] }): FlagDetail {
  let description = current.descLines.join(' ');
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

function deduplicateFlags(flags: FlagDetail[]): FlagDetail[] {
  const seen = new Set<string>();
  return flags.filter((f) => {
    // Skip entries with no flag at all
    if (!f.short && !f.long) return false;
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
    // Remove standalone flags like --force
    .replace(/--?[\w-]+=?(?:\([^)]+\)|<[^>]+>|[\w]+)?/g, '')
    // Remove the command name at the start
    .replace(/^\s*\S+/, '');

  // Now extract angle-bracket arguments
  const angleBracketRe = /(\[)?<([\w][\w-]*)>(\.\.\.)?(\])?/g;
  let match: RegExpExecArray | null;
  while ((match = angleBracketRe.exec(stripped)) !== null) {
    const name = match[2];
    if (seen.has(name)) continue;
    seen.add(name);
    const inBrackets = Boolean(match[1]) || Boolean(match[4]);
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
 * Matches "Usage: ..." or "usage: ..." patterns. Only includes continuation
 * lines that are indented (part of the same usage statement).
 */
export function extractUsageLine(helpOutput: string): string | undefined {
  const lines = helpOutput.split('\n');
  let usageLine: string | undefined;
  const continuationLines: string[] = [];

  for (const line of lines) {
    if (usageLine === undefined) {
      const match = line.match(/^[Uu]sage:\s*(.+)/);
      if (match) {
        usageLine = match[1].trim();
      }
      continue;
    }

    // Continuation: must be indented and not be a blank line or section header
    const trimmed = line.trim();
    if (trimmed && /^\s{2,}/.test(line) && !trimmed.startsWith('-') && !trimmed.includes(':')) {
      continuationLines.push(trimmed);
    } else {
      break;
    }
  }

  if (!usageLine) return undefined;
  return [usageLine, ...continuationLines].join(' ');
}
