import type { Shortcut } from '../../shared/types';

/**
 * Merge cheatsheet defaults with parser overrides.
 * Match by source + rawCommand identity.
 * User overrides replace key, set isDefault: false, origin: 'user-config'.
 * User entries not in cheatsheet are added as new.
 * Cheatsheet entries not overridden are kept with isDefault: true, origin: 'cheatsheet'.
 */
export function mergeShortcuts(
  cheatsheetDefaults: Shortcut[],
  parserOverrides: Shortcut[],
): Shortcut[] {
  const defaults = new Map<string, Shortcut>();
  for (const s of cheatsheetDefaults) {
    defaults.set(s.rawCommand, s);
  }

  const overrides = new Map<string, Shortcut>();
  for (const s of parserOverrides) {
    overrides.set(s.rawCommand, s);
  }

  const result: Shortcut[] = [];

  // Process cheatsheet entries - apply overrides where they exist
  for (const [rawCmd, defaultEntry] of defaults) {
    const override = overrides.get(rawCmd);
    if (override) {
      result.push({
        ...defaultEntry,
        key: override.key,
        searchKey: override.searchKey,
        isDefault: false,
        isUnbound: override.isUnbound,
        origin: 'user-config',
        filePath: override.filePath,
        context: override.context ?? defaultEntry.context,
      });
      overrides.delete(rawCmd);
    } else {
      result.push({
        ...defaultEntry,
        isDefault: true,
        origin: 'cheatsheet',
      });
    }
  }

  // Add remaining overrides (user entries not in cheatsheet)
  for (const [, override] of overrides) {
    result.push({
      ...override,
      isDefault: false,
      origin: 'user-config',
    });
  }

  return result;
}
