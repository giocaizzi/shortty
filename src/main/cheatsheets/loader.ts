import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

type Platform = 'darwin' | 'win32' | 'linux';

export interface CheatsheetShortcut {
  command: string;
  rawCommand: string;
  key: Partial<Record<Platform, string>>;
  category?: string;
  context?: string;
  minVersion?: string;
}

export interface CheatsheetDefinition {
  id: string;
  label: string;
  icon: string;
  platforms: Platform[];
  parser?: string | null;
  lastVerified?: { version: string; date: string };
  defaultPaths?: Partial<Record<Platform, string[]>>;
  shortcuts: CheatsheetShortcut[];
}

const VALID_PLATFORMS: ReadonlySet<string> = new Set([
  'darwin',
  'win32',
  'linux',
]);

/** Validate that a parsed JSON object has all required cheatsheet fields. */
function validate(
  data: unknown,
  filePath: string,
): CheatsheetDefinition | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    console.warn(`[cheatsheet] ${filePath}: root must be an object`);
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Required string fields
  for (const field of ['id', 'label', 'icon'] as const) {
    if (typeof obj[field] !== 'string' || obj[field] === '') {
      console.warn(
        `[cheatsheet] ${filePath}: missing or invalid required field "${field}"`,
      );
      return null;
    }
  }

  // platforms
  if (!Array.isArray(obj.platforms) || obj.platforms.length === 0) {
    console.warn(
      `[cheatsheet] ${filePath}: "platforms" must be a non-empty array`,
    );
    return null;
  }
  for (const p of obj.platforms) {
    if (!VALID_PLATFORMS.has(p as string)) {
      console.warn(
        `[cheatsheet] ${filePath}: invalid platform "${String(p)}"`,
      );
      return null;
    }
  }

  // shortcuts
  if (!Array.isArray(obj.shortcuts)) {
    console.warn(`[cheatsheet] ${filePath}: "shortcuts" must be an array`);
    return null;
  }

  for (const [i, shortcut] of obj.shortcuts.entries()) {
    if (typeof shortcut !== 'object' || shortcut === null) {
      console.warn(
        `[cheatsheet] ${filePath}: shortcuts[${i}] must be an object`,
      );
      return null;
    }
    const s = shortcut as Record<string, unknown>;
    if (typeof s.command !== 'string') {
      console.warn(
        `[cheatsheet] ${filePath}: shortcuts[${i}] missing "command"`,
      );
      return null;
    }
    if (typeof s.rawCommand !== 'string') {
      console.warn(
        `[cheatsheet] ${filePath}: shortcuts[${i}] missing "rawCommand"`,
      );
      return null;
    }
    if (typeof s.key !== 'object' || s.key === null || Array.isArray(s.key)) {
      console.warn(
        `[cheatsheet] ${filePath}: shortcuts[${i}] "key" must be an object`,
      );
      return null;
    }
  }

  return data as CheatsheetDefinition;
}

/** Default sources directory resolved relative to this file. */
function defaultSourcesDir(): string {
  return join(__dirname, '../../cheatsheets/sources');
}

/**
 * Load all cheatsheet definitions from JSON files in the given directory.
 *
 * Invalid files are skipped with a warning. Non-JSON files are ignored.
 */
export async function loadCheatsheets(
  sourcesDir?: string,
): Promise<CheatsheetDefinition[]> {
  const dir = sourcesDir ?? defaultSourcesDir();

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    console.warn(`[cheatsheet] could not read sources directory: ${dir}`);
    return [];
  }

  const jsonFiles = entries.filter((f) => f.endsWith('.json'));
  const results: CheatsheetDefinition[] = [];

  for (const file of jsonFiles) {
    const filePath = join(dir, file);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      const definition = validate(parsed, filePath);
      if (definition) {
        results.push(definition);
      }
    } catch (err) {
      console.warn(
        `[cheatsheet] failed to load ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return results;
}
