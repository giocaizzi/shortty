import { execSync } from 'node:child_process';

export function readWhatis(): Map<string, string> {
  const descriptions = new Map<string, string>();

  try {
    const output = execSync("whatis -w '*' 2>/dev/null", {
      encoding: 'utf-8',
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024,
    });

    for (const line of output.split('\n')) {
      const match = line.match(/^(\S+?)(?:\s*\([^)]+\))?\s*-\s*(.+)$/);
      if (!match) continue;

      const [, name, desc] = match;
      if (!descriptions.has(name)) {
        descriptions.set(name, desc.trim());
      }
    }
  } catch {
    // whatis not available or database not built
  }

  return descriptions;
}
