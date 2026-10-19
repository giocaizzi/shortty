/// <reference types="vite/client" />
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import log from '../logger';
import type { MergeMode } from '../shortcuts/merge';
import type { AppRef } from '../icons';

type Platform = 'darwin' | 'win32' | 'linux';

interface CheatsheetShortcut {
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
  /** App whose icon represents the source: macOS bundle, or by name the Windows .exe (main/icons.ts). */
  app?: AppRef;
  platforms: Platform[];
  parser?: string | null;
  /** How user bindings combine with these defaults; 'additive' when absent. */
  mergeMode?: MergeMode;
  lastVerified?: { version: string; date: string };
  defaultPaths?: Partial<Record<Platform, string[]>>;
  shortcuts: CheatsheetShortcut[];
}

const VALID_PLATFORMS: ReadonlySet<string> = new Set([
  'darwin',
  'win32',
  'linux',
]);

const MERGE_MODES: ReadonlySet<string> = new Set(['additive', 'replace']);

/** Validate that a parsed JSON object has all required cheatsheet fields. */
function validate(
  data: unknown,
  filePath: string,
): CheatsheetDefinition | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    log.warn(`[cheatsheet] ${filePath}: root must be an object`);
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Required string fields
  for (const field of ['id', 'label', 'icon'] as const) {
    if (typeof obj[field] !== 'string' || obj[field] === '') {
      log.warn(
        `[cheatsheet] ${filePath}: missing or invalid required field "${field}"`,
      );
      return null;
    }
  }

  // platforms
  if (!Array.isArray(obj.platforms) || obj.platforms.length === 0) {
    log.warn(
      `[cheatsheet] ${filePath}: "platforms" must be a non-empty array`,
    );
    return null;
  }
  for (const p of obj.platforms) {
    if (!VALID_PLATFORMS.has(p as string)) {
      log.warn(
        `[cheatsheet] ${filePath}: invalid platform "${String(p)}"`,
      );
      return null;
    }
  }

  if (obj.mergeMode !== undefined && !MERGE_MODES.has(obj.mergeMode as string)) {
    log.warn(
      `[cheatsheet] ${filePath}: invalid mergeMode "${String(obj.mergeMode)}"`,
    );
    return null;
  }

  // shortcuts
  if (!Array.isArray(obj.shortcuts)) {
    log.warn(`[cheatsheet] ${filePath}: "shortcuts" must be an array`);
    return null;
  }

  for (const [i, shortcut] of obj.shortcuts.entries()) {
    if (typeof shortcut !== 'object' || shortcut === null) {
      log.warn(
        `[cheatsheet] ${filePath}: shortcuts[${i}] must be an object`,
      );
      return null;
    }
    const s = shortcut as Record<string, unknown>;
    if (typeof s.command !== 'string') {
      log.warn(
        `[cheatsheet] ${filePath}: shortcuts[${i}] missing "command"`,
      );
      return null;
    }
    if (typeof s.rawCommand !== 'string') {
      log.warn(
        `[cheatsheet] ${filePath}: shortcuts[${i}] missing "rawCommand"`,
      );
      return null;
    }
    if (typeof s.key !== 'object' || s.key === null || Array.isArray(s.key)) {
      log.warn(
        `[cheatsheet] ${filePath}: shortcuts[${i}] "key" must be an object`,
      );
      return null;
    }
  }

  return data as CheatsheetDefinition;
}

/**
 * Cheatsheets shipped with the app, bundled at build time so they are
 * available in dev, in e2e runs and in the packaged app alike (no runtime
 * path to resolve).
 */
const BUNDLED_CHEATSHEETS = import.meta.glob<unknown>(
  '../../cheatsheets/sources/*.json',
  { eager: true, import: 'default' },
);

/**
 * Load all cheatsheet definitions. Without `sourcesDir`, the cheatsheets
 * bundled into the build are used; with it, every JSON file in that
 * directory is read (tests, local overrides).
 *
 * Invalid files are skipped with a warning. Non-JSON files are ignored.
 */
export async function loadCheatsheets(
  sourcesDir?: string,
): Promise<CheatsheetDefinition[]> {
  const raw = sourcesDir
    ? await readCheatsheetDir(sourcesDir)
    : Object.entries(BUNDLED_CHEATSHEETS).map(([file, data]) => ({ file, data, error: undefined }));

  const results: CheatsheetDefinition[] = [];
  let failedCount = 0;

  for (const { file, data, error } of raw) {
    if (error) {
      failedCount++;
      log.warn(`[cheatsheet] failed to load ${file}: ${error}`);
      continue;
    }
    const definition = validate(data, file);
    if (definition) {
      results.push(definition);
    } else {
      failedCount++;
    }
  }

  log.info(
    `Loaded ${results.length} cheatsheets${failedCount > 0 ? `, ${failedCount} failed validation` : ''}`,
  );

  return results;
}

async function readCheatsheetDir(
  dir: string,
): Promise<{ file: string; data?: unknown; error?: string }[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    log.warn(`[cheatsheet] could not read sources directory: ${dir}`);
    return [];
  }

  const out: { file: string; data?: unknown; error?: string }[] = [];
  for (const file of entries.filter((f) => f.endsWith('.json'))) {
    const filePath = join(dir, file);
    try {
      out.push({ file: filePath, data: JSON.parse(await readFile(filePath, 'utf-8')) });
    } catch (err) {
      out.push({ file: filePath, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}
