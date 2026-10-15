import { readdir, stat, access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

interface ScannedCommand {
  name: string;
  bin: string;
  mtime: number;
}

/**
 * Extensions Windows runs from PATH, lowercase, in PATHEXT order (an earlier
 * one wins for the same name in a directory). `.ps1` is added: PowerShell
 * resolves scripts on PATH too.
 */
export function windowsExecutableExtensions(pathext: string = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD'): string[] {
  const exts = pathext.split(';').map((e) => e.trim().toLowerCase()).filter((e) => e.startsWith('.'));
  return exts.includes('.ps1') ? exts : [...exts, '.ps1'];
}

/**
 * PATH entries to scan, in order: "~/" expanded on POSIX (bash resolves it,
 * so users write PATH="~/bin:$PATH"), relative entries ("", ".", "bin")
 * dropped since they depend on the cwd, normalized, duplicates removed
 * (case-insensitively on Windows).
 */
export function pathDirectories(pathValue: string = process.env.PATH ?? ''): string[] {
  const win = process.platform === 'win32';
  const p = win ? win32 : posix;
  const home = homedir();
  const dirs: string[] = [];
  const seen = new Set<string>();
  for (const entry of pathValue.split(p.delimiter)) {
    // Windows PATH entries may be quoted: "C:\My;Tools"
    const raw = win ? entry.replace(/^"(.*)"$/, '$1') : entry;
    const dir = win ? raw : raw === '~' ? home : raw.startsWith('~/') ? home + raw.slice(1) : raw;
    if (!dir || !p.isAbsolute(dir)) continue;
    const normalized = p.normalize(dir);
    const trimmed = normalized.length > p.parse(normalized).root.length
      ? normalized.replace(win ? /\\+$/ : /\/+$/, '')
      : normalized;
    const key = win ? trimmed.toLowerCase() : trimmed;
    if (seen.has(key)) continue;
    seen.add(key);
    dirs.push(trimmed);
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

  const win = process.platform === 'win32';
  const p = win ? win32 : posix;
  const exts = win ? windowsExecutableExtensions() : [];

  const results = await Promise.all(entries.map(async (entry): Promise<ScannedCommand | null> => {
    if (entry.startsWith('.') || entry.startsWith('_')) return null;
    // Windows has no execute bit: a file is a command if PATHEXT lists its
    // extension, and is named without it (git.exe is "git")
    const ext = p.extname(entry).toLowerCase();
    if (win && !exts.includes(ext)) return null;
    const name = win ? entry.slice(0, -ext.length) : entry;
    const fullPath = p.join(dir, entry);
    try {
      // stat/access follow symlinks: a link to an executable file counts,
      // a dangling link or a link to a directory does not
      if (!win) await access(fullPath, constants.X_OK);
      const s = await stat(fullPath);
      if (!s.isFile()) return null;
      return { name, bin: fullPath, mtime: s.mtimeMs };
    } catch {
      return null;
    }
  }));

  const found = results.filter((r): r is ScannedCommand => r !== null);
  // foo.exe beside foo.cmd: the first extension in PATHEXT wins, like cmd
  if (win) found.sort((a, b) => exts.indexOf(p.extname(a.bin).toLowerCase()) - exts.indexOf(p.extname(b.bin).toLowerCase()));
  return found;
}

/** Executables on PATH; a name resolves to its first occurrence, like the shell. */
export async function scanPath(): Promise<ScannedCommand[]> {
  const win = process.platform === 'win32';
  const perDir = await Promise.all(pathDirectories().map(scanDirectory));

  const seen = new Set<string>();
  const commands: ScannedCommand[] = [];
  for (const dirCommands of perDir) {
    for (const cmd of dirCommands) {
      const key = win ? cmd.name.toLowerCase() : cmd.name;
      if (seen.has(key)) continue;
      seen.add(key);
      commands.push(cmd);
    }
  }
  return commands;
}
