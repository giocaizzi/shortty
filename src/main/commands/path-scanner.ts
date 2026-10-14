import { readdir, stat, access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';

interface ScannedCommand {
  name: string;
  bin: string;
  mtime: number;
}

/**
 * PATH entries to scan, in order: "~/" expanded (bash resolves it, so users
 * write PATH="~/bin:$PATH"), relative entries ("", ".", "bin") dropped since
 * they depend on the cwd, duplicates removed.
 */
export function pathDirectories(pathValue: string = process.env.PATH ?? ''): string[] {
  const home = homedir();
  const dirs: string[] = [];
  for (const raw of pathValue.split(':')) {
    const dir = raw === '~' ? home : raw.startsWith('~/') ? home + raw.slice(1) : raw;
    if (!dir.startsWith('/')) continue;
    const normalized = dir.length > 1 ? dir.replace(/\/+$/, '') : dir;
    if (!dirs.includes(normalized)) dirs.push(normalized);
  }
  return dirs;
}

async function scanDirectory(dir: string): Promise<ScannedCommand[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const results = await Promise.all(entries.map(async (entry): Promise<ScannedCommand | null> => {
    if (entry.startsWith('.') || entry.startsWith('_')) return null;
    const fullPath = `${dir}/${entry}`;
    try {
      // stat/access follow symlinks: a link to an executable file counts,
      // a dangling link or a link to a directory does not
      await access(fullPath, constants.X_OK);
      const s = await stat(fullPath);
      if (!s.isFile()) return null;
      return { name: entry, bin: fullPath, mtime: s.mtimeMs };
    } catch {
      return null;
    }
  }));

  return results.filter((r): r is ScannedCommand => r !== null);
}

/** Executables on PATH; a name resolves to its first occurrence, like the shell. */
export async function scanPath(): Promise<ScannedCommand[]> {
  const perDir = await Promise.all(pathDirectories().map(scanDirectory));

  const seen = new Set<string>();
  const commands: ScannedCommand[] = [];
  for (const dirCommands of perDir) {
    for (const cmd of dirCommands) {
      if (seen.has(cmd.name)) continue;
      seen.add(cmd.name);
      commands.push(cmd);
    }
  }
  return commands;
}
