import { execFile } from 'node:child_process';

/** Man sections that describe commands, best first: user commands, admin commands, games. */
function sectionRank(section: string): number {
  if (section.startsWith('1')) return 0;
  if (section.startsWith('8')) return 1;
  if (section.startsWith('6')) return 2;
  return 3;
}

/**
 * Parse apropos/whatis output. Lines look like
 *   "ls(1)                    - list directory contents"
 *   "grep(1), egrep(1), fgrep(1) - file pattern searcher"
 *   "ls (1)               - list directory contents"        (Linux man-db)
 * A name documented in several sections (open(1) vs open(3) "perl pragma")
 * gets the description from its command section.
 */
export function parseWhatisOutput(output: string): Map<string, string> {
  const best = new Map<string, { rank: number; desc: string }>();

  for (const line of output.split('\n')) {
    const match = line.match(/^(.+?\))\s+-\s+(.+)$/);
    if (!match) continue;
    const [, names, rawDesc] = match;
    const desc = rawDesc.trim();
    for (const entry of names.matchAll(/([\w.+:@-]+)\s*\(([^)]+)\)/g)) {
      const [, name, section] = entry;
      const rank = sectionRank(section);
      const current = best.get(name);
      if (!current || rank < current.rank) best.set(name, { rank, desc });
    }
  }

  const descriptions = new Map<string, string>();
  for (const [name, { desc }] of best) descriptions.set(name, desc);
  return descriptions;
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(bin, args, { encoding: 'utf-8', timeout: 20000, maxBuffer: 32 * 1024 * 1024 }, (_err, stdout) => {
      resolve(stdout ?? '');
    });
  });
}

/**
 * One-line descriptions for every documented command. Async: on macOS
 * `apropos .` takes a few seconds, and `whatis -w '*'` (man-db only) fails
 * with "illegal option -- w".
 */
export async function readWhatis(): Promise<Map<string, string>> {
  const apropos = parseWhatisOutput(await run('apropos', ['.']));
  if (apropos.size > 0) return apropos;
  return parseWhatisOutput(await run('whatis', ['-w', '*']));
}
