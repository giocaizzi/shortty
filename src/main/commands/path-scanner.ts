import { readdir, stat, access, constants } from 'node:fs/promises';

interface ScannedCommand {
  name: string;
  bin: string;
  mtime: number;
}

export async function scanPath(): Promise<ScannedCommand[]> {
  const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean);
  const seen = new Set<string>();
  const commands: ScannedCommand[] = [];

  for (const dir of pathDirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (seen.has(entry)) continue;
      if (entry.startsWith('.') || entry.startsWith('_')) continue;

      const fullPath = `${dir}/${entry}`;
      try {
        await access(fullPath, constants.X_OK);
        const s = await stat(fullPath);
        if (!s.isFile()) continue;

        seen.add(entry);
        commands.push({
          name: entry,
          bin: fullPath,
          mtime: s.mtimeMs,
        });
      } catch {
        continue;
      }
    }
  }

  return commands;
}
