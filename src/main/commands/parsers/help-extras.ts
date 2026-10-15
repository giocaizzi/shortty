import type { ArgumentDetail, EnvVarDetail, ExampleDetail, FlagDetail } from '../../../shared/types';
import { joinWrapped, normalizeText } from './parse-utils';

/**
 * Parsers for the optional help sections shared by `--help` output and man
 * pages: examples, environment variables, aliases, see-also links and
 * positional argument lists (docs/spec.md §7.8). Each takes the text of one
 * section.
 */

const MAX_EXAMPLES = 100;
const MAX_TEXT = 300;

function indentOf(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function cap(text: string): string {
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 3) + '...' : text;
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Examples: a command line (`$ cmd`, or a line starting with the program, or
 * piping into it) and the comment or prose right before it as its
 * description. Joins shell continuations (`\`) and az's hard-wrapped lines.
 */
export function parseExamples(text: string, commandName: string): ExampleDetail[] {
  const program = commandName.split(' ')[0];
  const pipeRe = new RegExp(`\\|\\s*${escapeRe(program)}\\b`);
  // A sentence that starts with the program name ("git commit (without any
  // pathname parameter) is used to...") is prose
  const isSentence = (t: string) => /[.:]$/.test(t) && t.split(/\s+/).length >= 8;
  const lines = normalizeText(text).split('\n');
  // Where most commands carry a "$ " prompt, only those lines are commands
  const promptLines = lines.filter(l => /^\s*\$\s/.test(l)).length;
  const programLines = lines.filter(l => l.trim().split(/\s+/)[0] === program || pipeRe.test(l)).length;
  const prompts = promptLines > 0 && promptLines * 2 >= programLines;
  const isCommand = (t: string) =>
    /^\$\s/.test(t) || (!prompts && (t.split(/\s+/)[0] === program || pipeRe.test(t)) && !isSentence(t));
  // knack (az) hard-wraps long example commands at the section width, with no marker
  const width = Math.max(0, ...lines.map(l => l.length));
  // Commands indented deeper than their descriptions (az, gcloud): a line at the
  // command's indent right below it continues it
  const commandIndents = lines.filter(l => isCommand(l.trim())).map(indentOf);
  const proseIndents = lines.filter(l => l.trim() && !isCommand(l.trim())).map(indentOf);
  const codeBlocks = commandIndents.length > 0 && proseIndents.length > 0
    && Math.min(...proseIndents) < Math.min(...commandIndents);

  const examples: ExampleDetail[] = [];
  let desc: string[] = [];
  for (let i = 0; i < lines.length && examples.length < MAX_EXAMPLES; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) continue;
    if (!isCommand(t)) {
      // "# comment", grep's "-   Find all occurrences"
      desc.push(t.replace(/^(?:#+|[-•]\s)\s*/, ''));
      continue;
    }

    const indent = indentOf(line);
    // Lines after a "$ command" are its output, never a wrapped part of it
    const prompted = /^\$\s/.test(t);
    let command = t.replace(/^\$\s+/, '');
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      const nt = next.trim();
      if (!nt) break;
      if (/\\$/.test(command)) {
        // Shell line continuation
        command = /\s\\$/.test(command) ? `${command.replace(/\s*\\$/, '')} ${nt}` : command.slice(0, -1) + nt;
      } else if (codeBlocks && !prompted && indentOf(next) === indent && !isCommand(nt) && !nt.startsWith('#')) {
        // Hard-wrapped (az): a long word split at the margin or at a hyphen joins without a space
        const tight = (/-$/.test(command) || lines[i].length >= width - 1) && !nt.startsWith('\\');
        command += tight ? nt : ` ${nt}`;
      } else {
        break;
      }
      i++;
    }

    // BSD man pages explain the command below it, indented deeper (find)
    const after: string[] = [];
    while (!codeBlocks && i + 1 < lines.length && lines[i + 1].trim() && indentOf(lines[i + 1]) > indent
      && !isCommand(lines[i + 1].trim())) {
      after.push(lines[++i].trim());
    }
    examples.push({
      command: command.replace(/\s+/g, ' ').trim(),
      description: cap(joinWrapped(after.length > 0 ? after : desc).replace(/(?:,\s*run)?[:,]$/, '').trim()),
    });
    desc = [];
  }
  return examples;
}

/**
 * An environment variable entry: "NAME  description", "NAME value-spec",
 * "`http_proxy` [protocol://]<host>" (curl), "PSQL_EDITOR, EDITOR, VISUAL".
 */
const ENV_TERM_RE = /^(`?\$?[A-Za-z_][A-Za-z0-9_]*`?(?:\s*,\s*`?\$?[A-Za-z_][A-Za-z0-9_]*`?)*)(?:\s{2,}(\S.*)|\s+\S.*)?$/;

function envNames(term: string): string[] | null {
  const names = term.split(/\s*,\s*/).map(n => n.replace(/[`$]/g, ''));
  // UPPER_SNAKE, or a backticked name (curl's `http_proxy`)
  const upper = names.every(n => /^[A-Z][A-Z0-9_]*$/.test(n) && (n.length > 2 || n.includes('_')));
  return upper || term.startsWith('`') ? names : null;
}

function envTerm(line: string): RegExpMatchArray | null {
  const m = line.trim().match(ENV_TERM_RE);
  return m && envNames(m[1]) ? m : null;
}

/** Environment variables: "NAME  description" or NAME on its own line, description below. */
export function parseEnvironment(text: string): EnvVarDetail[] {
  const lines = normalizeText(text).split('\n').filter(l => l.trim());
  const terms = lines.filter(l => envTerm(l));
  if (terms.length === 0) return [];
  const termIndent = Math.min(...terms.map(indentOf));

  const entries: { names: string[]; desc: string[] }[] = [];
  let current: { names: string[]; desc: string[] } | null = null;
  for (const line of lines) {
    const indent = indentOf(line);
    const m = indent === termIndent ? envTerm(line) : null;
    if (m) {
      const names = envNames(m[1]) ?? [];
      // Consecutive names share the description below them (PGHOST, PGPORT, ...)
      if (current && current.desc.length === 0) current.names.push(...names);
      else entries.push((current = { names, desc: [] }));
      if (m[2]) current.desc.push(m[2]);
    } else if (current && indent > termIndent) {
      current.desc.push(line.trim());
    } else {
      current = null;
    }
  }

  const seen = new Set<string>();
  const vars: EnvVarDetail[] = [];
  for (const entry of entries) {
    for (const name of entry.names) {
      if (seen.has(name)) continue;
      seen.add(name);
      vars.push({ name, description: cap(joinWrapped(entry.desc)) });
    }
  }
  return vars;
}

/** clap's per-flag "[env: UV_CACHE_DIR=]": removed from the flag and listed as a variable. */
export function takeFlagEnvironment(flags: FlagDetail[]): EnvVarDetail[] {
  const vars: EnvVarDetail[] = [];
  for (const flag of flags) {
    const m = flag.description.match(/\s*\[env:\s*([A-Za-z_][\w]*)=[^\]]*\]/);
    if (!m) continue;
    flag.description = flag.description.replace(m[0], '').trim();
    if (!vars.some(v => v.name === m[1])) vars.push({ name: m[1], description: `Same as ${flag.long ?? flag.short}` });
  }
  return vars;
}

/** "gh pr ls" / "docker container run, docker run": every name but the command's own. */
export function parseAliases(text: string, commandName: string): string[] {
  const aliases: string[] = [];
  for (const part of normalizeText(text).split(/[,\n]/)) {
    const alias = part.trim();
    if (!alias || alias === commandName || aliases.includes(alias)) continue;
    if (!/^[\w][\w .:+-]*$/.test(alias) || alias.length > 60) continue;
    aliases.push(alias);
  }
  return aliases;
}

/** Man references ("gh-pr(1)") and links; otherwise the section's lines ("LEARN MORE"). */
export function parseSeeAlso(text: string): string[] {
  const normalized = normalizeText(text);
  // The page footer ("GH-PR-LIST(1)") ends the last section: man references are lowercase
  const refs = (normalized.match(/[\w.+-]+\(\d\w*\)/g) ?? []).filter(r => /[a-z]/.test(r));
  const urls = (normalized.match(/https?:\/\/[^\s<>⟨⟩"'`]+/g) ?? []).map(u => u.replace(/[.,;:)]+$/, ''));
  const items = refs.length > 0 ? [...refs, ...urls] : normalized.split('\n').map(l => l.trim()).filter(Boolean);
  return [...new Set(items)].slice(0, 30);
}

/**
 * Positional arguments listed as a definition list ("POSITIONAL ARGUMENTS",
 * "Arguments:"): "INSTANCE_NAMES [INSTANCE_NAMES ...]", "[pattern]", "<name>".
 */
export function parseArgumentEntries(text: string): ArgumentDetail[] {
  const lines = normalizeText(text).split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];
  const base = Math.min(...lines.map(indentOf));
  const args: ArgumentDetail[] = [];
  let current: { arg: ArgumentDetail; desc: string[] } | null = null;
  const finish = () => {
    if (current) current.arg.description = cap(joinWrapped(current.desc));
  };
  for (const line of lines) {
    const t = line.trim();
    if (indentOf(line) === base) {
      finish();
      current = null;
      if (/^[-{]/.test(t)) continue;
      const [term, ...rest] = t.split(/\s{2,}/);
      const name = term.split(/\s/)[0].replace(/^[[<]+|[\]>]+$/g, '').replace(/\.\.\.$/, '').replace(/[\]>]+$/, '');
      if (!/^[A-Za-z][\w-]*$/.test(name)) continue;
      current = {
        arg: {
          name,
          required: !term.startsWith('['),
          variadic: /\.\.\./.test(term) || /multiple values allowed/.test(rest.join(' ')),
          description: '',
        },
        desc: rest,
      };
      args.push(current.arg);
    } else if (current) {
      current.desc.push(t);
    }
  }
  finish();
  return args;
}

/** Fill synopsis arguments' descriptions from an arguments section (matched by name, ignoring case). */
export function describeArguments(args: ArgumentDetail[], entries: ArgumentDetail[]): ArgumentDetail[] {
  if (args.length === 0) return entries;
  return args.map((arg) => {
    if (arg.description) return arg;
    const entry = entries.find(e => e.name.toLowerCase() === arg.name.toLowerCase());
    return entry ? { ...arg, description: entry.description } : arg;
  });
}
