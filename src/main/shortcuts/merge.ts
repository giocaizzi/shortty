import type { Shortcut } from '../../shared/types';

/** Command identity of a shortcut: VS Code removal rules are "-command". */
function commandIdentity(s: Shortcut): string {
  return s.rawCommand.replace(/^-/, '');
}

/**
 * Merge cheatsheet defaults with parser overrides (SPECS §6.2).
 *
 * - Overrides match defaults by source + rawCommand. The first override for
 *   a command replaces the default's key (isDefault: false, origin
 *   'user-config'); further overrides for the same command (another key or
 *   `when` context) are added as entries of their own.
 * - Unbind overrides (isUnbound: VS Code `-command`, Ghostty `unbind`)
 *   mark the matching default as unbound instead of adding an entry. A
 *   removal matches by command and, when it names a key, by that key too;
 *   a removal whose command is unknown to the cheatsheet (Ghostty `unbind`)
 *   matches defaults by key alone.
 * - Overrides that match nothing are added as new entries.
 * - Cheatsheet entries not overridden are kept with isDefault: true,
 *   origin 'cheatsheet'.
 */
export function mergeShortcuts(
  cheatsheetDefaults: Shortcut[],
  parserOverrides: Shortcut[],
): Shortcut[] {
  const result: Shortcut[] = cheatsheetDefaults.map((s) => ({
    ...s,
    isDefault: true,
    origin: 'cheatsheet' as const,
  }));

  const byCommand = new Map<string, number[]>();
  result.forEach((s, i) => {
    const id = commandIdentity(s);
    byCommand.set(id, [...(byCommand.get(id) ?? []), i]);
  });

  const replaced = new Set<number>();
  const added: Shortcut[] = [];

  for (const override of parserOverrides) {
    const sameCommand = byCommand.get(commandIdentity(override)) ?? [];

    if (override.isUnbound) {
      const matches = sameCommand.length > 0
        ? sameCommand.filter(
          (i) => !override.searchKey || result[i].searchKey === override.searchKey,
        )
        : result
          .map((_, i) => i)
          .filter((i) => override.searchKey && result[i].searchKey === override.searchKey);
      if (matches.length === 0) {
        added.push({ ...override, isDefault: false, origin: 'user-config' });
        continue;
      }
      for (const i of matches) {
        result[i] = {
          ...result[i],
          isUnbound: true,
          isDefault: false,
          origin: 'user-config',
          filePath: override.filePath,
        };
      }
      continue;
    }

    const target = sameCommand.find((i) => !replaced.has(i));
    if (target === undefined) {
      added.push({ ...override, isDefault: false, origin: 'user-config' });
      continue;
    }
    replaced.add(target);
    const defaultEntry = result[target];
    result[target] = {
      ...defaultEntry,
      key: override.key,
      searchKey: override.searchKey,
      strokes: override.strokes,
      isDefault: false,
      isUnbound: false,
      origin: 'user-config',
      filePath: override.filePath,
      context: override.context ?? defaultEntry.context,
    };
  }

  return [...result, ...added];
}
