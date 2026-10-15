import type { AppSettings, ResultLimits, SearchSettings } from '../shared/settings';
import { DEFAULT_SETTINGS } from '../shared/settings';

/**
 * Per-key validation of settings coming from the renderer (SETTINGS_SET) or
 * from a hand-edited config.json. A bad value must never reach the store:
 * the settings listeners and applyInitialSettings() pass it straight to
 * Electron APIs (nativeTheme.themeSource throws on an unknown theme).
 */

type Check = (value: unknown) => string | null;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const boolean: Check = (v) => (typeof v === 'boolean' ? null : 'must be true or false');

const oneOf =
  (...allowed: string[]): Check =>
  (v) =>
    typeof v === 'string' && allowed.includes(v) ? null : `must be one of ${allowed.join(', ')}`;

const numberIn =
  (min: number, max: number, integer = false): Check =>
  (v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v))
      ? null
      : `must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`;

/** Checks for each field of an object setting. */
const SEARCH_FIELDS: Record<keyof SearchSettings, Check> = {
  keyWeight: numberIn(0, 1),
  commandWeight: numberIn(0, 1),
  sourceWeight: numberIn(0, 1),
  contextWeight: numberIn(0, 1),
  threshold: numberIn(0, 1),
};

/** Ranges of the Preferences fields (SearchTab). */
const RESULT_LIMIT_FIELDS: Record<keyof ResultLimits, Check> = {
  sources: numberIn(1, 20, true),
  shortcuts: numberIn(1, 50, true),
  commands: numberIn(1, 50, true),
};

const objectOf =
  (fields: Record<string, Check>): Check =>
  (v) => {
    if (!isPlainObject(v)) return 'must be an object';
    for (const [field, check] of Object.entries(fields)) {
      const error = check(v[field]);
      if (error) return `${field} ${error}`;
    }
    return null;
  };

const CHECKS: Record<keyof AppSettings, Check> = {
  launchAtLogin: boolean,
  showDockIcon: boolean,
  showMenuBar: boolean,
  dismissAfterCopy: boolean,
  resetLauncher: oneOf('immediately', '90s', 'never'),
  theme: oneOf('light', 'dark', 'system'),
  globalShortcut: (v) =>
    typeof v === 'string' && v.trim() !== '' && v.length <= 100 ? null : 'must be a non-empty shortcut',
  windowPosition: oneOf('center', 'top-center', 'mouse'),
  disabledParsers: (v) =>
    Array.isArray(v) && v.every((s) => typeof s === 'string') ? null : 'must be a list of source ids',
  sourcePathOverrides: (v) =>
    isPlainObject(v) &&
    Object.values(v).every(
      (p) => typeof p === 'string' || (Array.isArray(p) && p.every((s) => typeof s === 'string')),
    )
      ? null
      : 'must map source ids to a path or a list of paths',
  search: objectOf(SEARCH_FIELDS),
  commandPrefixMode: boolean,
  resultLimits: objectOf(RESULT_LIMIT_FIELDS),
  commandsEnabled: boolean,
};

export function isSettingKey(key: unknown): key is keyof AppSettings {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(CHECKS, key);
}

/** Error message for an invalid key/value pair, or null when it may be saved. */
export function validateSetting(key: unknown, value: unknown): string | null {
  if (!isSettingKey(key)) return `Unknown setting: ${String(key)}`;
  const error = CHECKS[key](value);
  return error ? `Invalid ${key}: ${error}` : null;
}

/**
 * Repair a loaded settings object: every invalid key falls back to its
 * default (object settings field by field). Returns the repaired values of
 * the keys that changed, so only those are written back.
 */
export function sanitizeSettings(raw: Record<string, unknown>): Partial<AppSettings> {
  const repaired: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const value = raw[key];
    if (!CHECKS[key](value)) continue;
    const fallback = DEFAULT_SETTINGS[key];
    const fields = key === 'search' ? SEARCH_FIELDS : key === 'resultLimits' ? RESULT_LIMIT_FIELDS : null;
    if (fields && isPlainObject(value) && isPlainObject(fallback)) {
      const merged: Record<string, unknown> = { ...fallback };
      for (const [field, check] of Object.entries(fields)) {
        if (!check(value[field])) merged[field] = value[field];
      }
      repaired[key] = merged;
    } else {
      repaired[key] = fallback;
    }
  }
  return repaired as Partial<AppSettings>;
}
