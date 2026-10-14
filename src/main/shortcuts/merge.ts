import type { Shortcut } from '../../shared/types';

/**
 * How an app combines a user binding with the built-in default of the same
 * command (docs/spec.md §6.2):
 *
 * - `additive`: user bindings add to the defaults (VS Code, Ghostty, tmux,
 *   vim, zsh); a default goes away only through an explicit removal.
 * - `replace`: a user binding for a command replaces its default key
 *   (Obsidian hotkeys.json, macOS symbolic hotkeys).
 */
export type MergeMode = 'additive' | 'replace';

/** Command identity of a shortcut: VS Code removal rules are "-command". */
function commandIdentity(s: Shortcut): string {
  return s.rawCommand.replace(/^-/, '');
}

/**
 * Merge cheatsheet defaults with parser overrides (docs/spec.md §6.2).
 *
 * Overrides match defaults by source + rawCommand.
 *
 * - Removals (isUnbound: VS Code `-command`, Ghostty `unbind`, vim `unmap`)
 *   mark the matching default as unbound instead of adding an entry. A
 *   removal matches by command and, when it names a key, by that key too;
 *   a removal whose command is unknown to the cheatsheet (Ghostty `unbind`,
 *   vim `unmap`) matches defaults by key alone.
 * - `additive`: a binding is added as a user-config entry next to the
 *   default. Re-binding the exact key of a default turns that default into
 *   the user entry instead of duplicating it (and undoes an earlier
 *   removal of it).
 * - `replace`: the first binding for a command replaces the default's key;
 *   further bindings for the same command are added as entries of their own.
 * - Overrides that match nothing are added as new entries.
 * - Cheatsheet entries not overridden keep isDefault: true, origin
 *   'cheatsheet'.
 */
export function mergeShortcuts(
  cheatsheetDefaults: Shortcut[],
  parserOverrides: Shortcut[],
  mode: MergeMode = 'additive',
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

    const target = mode === 'additive'
      ? sameCommand.find((i) => result[i].searchKey === override.searchKey)
      : sameCommand.find((i) => !replaced.has(i));
    if (target === undefined) {
      // A new key for a known command keeps the cheatsheet's label.
      const known = sameCommand.length > 0 ? result[sameCommand[0]] : undefined;
      added.push({
        ...override,
        command: known?.command ?? override.command,
        category: known?.category ?? override.category,
        isDefault: false,
        origin: 'user-config',
      });
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
