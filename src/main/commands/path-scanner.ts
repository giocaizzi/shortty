import { readdirSync, statSync, accessSync, constants } from 'node:fs';

interface ScannedCommand {
  name: string;
  bin: string;
  mtime: number;
}

export function scanPath(): ScannedCommand[] {
  const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean);
  const seen = new Set<string>();
  const commands: ScannedCommand[] = [];

  for (const dir of pathDirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (seen.has(entry)) continue;
      if (entry.startsWith('.') || entry.startsWith('_')) continue;

      const fullPath = `${dir}/${entry}`;
      try {
        accessSync(fullPath, constants.X_OK);
        const stat = statSync(fullPath);
        if (!stat.isFile()) continue;

        seen.add(entry);
        commands.push({
          name: entry,
          bin: fullPath,
          mtime: stat.mtimeMs,
        });
      } catch {
        continue;
      }
    }
  }

  return commands;
}
