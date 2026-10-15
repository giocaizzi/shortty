import { existsSync } from 'node:fs';
import type { Shortcut, ParserMeta } from '../../shared/types';
import { BaseParser } from './base-parser';
import { Modifier, type NormalizedKey, normalizeSequence, parseKeyCombo } from './key-normalizer';
import { findOnPath, shellDefaults } from './shell-defaults';
import { resolvePath } from '../utils/path-resolver';
import { PSREADLINE_DEFAULTS } from './data/psreadline-defaults';

/** One row of `Get-PSReadLineKeyHandler -Bound`. */
interface KeyHandler {
  Key?: unknown;
  Function?: unknown;
  Group?: unknown;
}

/** Functions that are not shortcuts worth listing. */
const NOISE_FUNCTIONS = new Set(['DigitArgument', 'SelfInsert', 'Ignore']);

/** KeyHandlerGroup → category. */
const GROUPS: Record<string, string> = {
  Basic: 'Editing',
  Completion: 'Completion',
  CursorMovement: 'Cursor Movement',
  History: 'History',
  Miscellaneous: 'Miscellaneous',
  Prediction: 'Prediction',
  Search: 'Search',
  Selection: 'Selection',
  Custom: 'Custom',
};

/** Where default bindings come from, shown as their file path. */
const DEFAULTS_SOURCE = 'Get-PSReadLineKeyHandler';

/** Windows PowerShell 5.1 starts slowly on a cold cache. */
const POWERSHELL_TIMEOUT_MS = 10_000;

/**
 * PowerShell line-editor (PSReadLine) bindings: the defaults of the edit
 * mode the profile selects (`pwsh -NoProfile` + `Get-PSReadLineKeyHandler
 * -Bound`, or the bundled Windows-mode list when no PowerShell runs),
 * merged with the `Set-PSReadLineKeyHandler` / `Remove-PSReadLineKeyHandler`
 * lines of the $PROFILE files. A profile binding replaces the default bound
 * to the same key (PSReadLine keeps one handler per key).
 */
export class PsReadLineParser extends BaseParser {
  get meta(): ParserMeta {
    return {
      id: 'psreadline',
      label: 'PowerShell',
      icon: '💠',
      platforms: ['win32'],
    };
  }

  /** Windows PowerShell ships with every Windows, and the bundled defaults cover a failed run. */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  getWatchPaths(): string[] {
    return this.getConfigPaths().filter((p) => existsSync(p));
  }

  async parse(): Promise<Shortcut[]> {
    const config: Shortcut[] = [];
    let editMode: string | null = null;

    for (const filePath of this.getWatchPaths()) {
      const content = await this.readFileIfExists(filePath);
      if (!content) continue;
      // Join backtick line continuations.
      for (const line of content.replace(/`\r?\n/g, ' ').split(/\r?\n/)) {
        const mode = line.match(/^\s*Set-PSReadLineOption\b.*-EditMode\s+['"]?(Windows|Emacs|Vi)\b/i);
        if (mode) editMode = mode[1];
        config.push(...this.parseProfileLine(line, filePath));
      }
    }

    const output = await this.loadDefaults(editMode);
    const handlers = output ? parseHandlerJson(output) : null;
    // ponytail: the bundled list is Windows mode only; an Emacs/Vi profile without a runnable PowerShell shows Windows defaults
    const defaults = (handlers ?? PSREADLINE_DEFAULTS.map(([Key, Function, Group]) => ({ Key, Function, Group })))
      .flatMap((h) => this.fromHandler(h));
    return mergeByKey(defaults, config);
  }

  /** JSON of `Get-PSReadLineKeyHandler -Bound`; null when no PowerShell runs. */
  protected async loadDefaults(editMode: string | null): Promise<string | null> {
    const script = [
      editMode ? `Set-PSReadLineOption -EditMode ${editMode}` : '',
      "Get-PSReadLineKeyHandler -Bound | Select-Object Key,Function,@{n='Group';e={[string]$_.Group}} | ConvertTo-Json -Compress",
    ].filter(Boolean).join('; ');
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script];
    const candidates = [
      await findOnPath('pwsh.exe'),
      await findOnPath('powershell.exe'),
      resolvePath('%SystemRoot%/System32/WindowsPowerShell/v1.0/powershell.exe'),
    ];
    for (const bin of candidates) {
      if (!bin) continue;
      const output = await shellDefaults(bin, args, {}, POWERSHELL_TIMEOUT_MS);
      if (output) return output;
    }
    return null;
  }

  private fromHandler(h: KeyHandler): Shortcut[] {
    if (typeof h.Key !== 'string' || typeof h.Function !== 'string') return [];
    if (NOISE_FUNCTIONS.has(h.Function)) return [];
    return [this.shortcut(h.Key, h.Function, humanize(h.Function), DEFAULTS_SOURCE, {
      category: typeof h.Group === 'string' ? GROUPS[h.Group] : undefined,
    })];
  }

  /**
   * `Set-PSReadLineKeyHandler [-Chord|-Key] 'Ctrl+d','Ctrl+e' -Function DeleteChar`,
   * `... -ScriptBlock { … } [-BriefDescription name]`, `Remove-PSReadLineKeyHandler -Chord 'Ctrl+r'`.
   */
  private parseProfileLine(line: string, filePath: string): Shortcut[] {
    const cmd = line.match(/^\s*(Set|Remove)-PSReadLineKeyHandler\b(.*)$/i);
    if (!cmd) return [];
    const params = psParams(cmd[2]);
    const positional = params.get('') ?? [];
    const chords = params.get('-chord') ?? params.get('-key') ?? positional.slice(0, 1);
    const isRemove = cmd[1].toLowerCase() === 'remove';
    const fn = params.get('-function')?.[0] ?? (isRemove ? undefined : positional[1]);
    const brief = params.get('-briefdescription')?.[0] ?? params.get('-description')?.[0];
    if (!isRemove && !fn && !params.has('-scriptblock')) return [];
    const rawCommand = isRemove ? 'Remove' : fn ?? `ScriptBlock:${brief ?? ''}`;
    const command = isRemove ? 'Unbind' : fn ? humanize(fn) : brief ? humanize(brief) : 'Script Block';
    return chords.map((chord) => this.shortcut(chord, rawCommand, command, filePath, { isUnbound: isRemove }));
  }

  private shortcut(
    chord: string,
    rawCommand: string,
    command: string,
    filePath: string,
    { category, isUnbound = false }: { category?: string; isUnbound?: boolean },
  ): Shortcut {
    const isDefault = filePath === DEFAULTS_SOURCE;
    const { displayKey, searchKey, strokes } = normalizeChord(chord);
    return this.makeShortcut({
      key: displayKey,
      searchKey,
      strokes,
      command,
      rawCommand,
      category,
      isDefault,
      isUnbound,
      filePath,
      origin: isDefault ? 'app-defaults' : 'user-config',
    });
  }
}

/** `[{"Key":…}]` or a single `{"Key":…}` (one handler), ignoring any noise around it. */
export function parseHandlerJson(output: string): KeyHandler[] | null {
  const start = output.search(/[[{]/);
  const end = Math.max(output.lastIndexOf(']'), output.lastIndexOf('}'));
  if (start === -1 || end < start) return null;
  try {
    const parsed: unknown = JSON.parse(output.slice(start, end + 1));
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter((h): h is KeyHandler => !!h && typeof h === 'object');
  } catch {
    return null;
  }
}

/**
 * A PSReadLine chord: `Ctrl+a`, `Shift+Ctrl+LeftArrow`, `Alt+?`, sequences
 * `Ctrl+x,Ctrl+e`. An upper-case letter means Shift (`Ctrl+C` is
 * Ctrl+Shift+c); a comma right after `+` is the key itself (`Alt+,`).
 */
export function normalizeChord(chord: string): NormalizedKey {
  const parts = chord.trim().split(/(?<=[^+]),(?=.)/);
  return normalizeSequence(parts.map((part) => {
    const parsed = parseKeyCombo(part);
    const base = part.slice(part.lastIndexOf('+', part.length - 2) + 1);
    if (/^[A-Z]$/.test(base) && !parsed.modifiers.includes(Modifier.Shift)) {
      parsed.modifiers.push(Modifier.Shift);
    }
    return parsed;
  }));
}

/** Parameters of a cmdlet call: `-Name value[,value]`; positional values under ''. Stops at a script block. */
function psParams(args: string): Map<string, string[]> {
  const params = new Map<string, string[]>();
  let current = '';
  const TOKEN = /'((?:[^']|'')*)'|"((?:[^"`]|`.)*)"|(,)|(\{)|([^\s,{]+)/g;
  for (const m of args.matchAll(TOKEN)) {
    if (m[4]) break;
    if (m[3]) continue;
    const bare = m[5];
    if (bare !== undefined && /^-[A-Za-z]+$/.test(bare)) {
      current = bare.toLowerCase();
      if (!params.has(current)) params.set(current, []);
      if (current === '-scriptblock') break;
      continue;
    }
    const value = m[1]?.replace(/''/g, "'") ?? m[2] ?? bare ?? '';
    params.set(current, [...(params.get(current) ?? []), value]);
    // A switch or single-valued parameter takes one value; the next bare word is positional again.
    if (current !== '' && !/^-(?:chord|key)$/.test(current)) current = '';
  }
  return params;
}

/** A profile binding replaces the default on the same key; a removal marks it unbound. */
function mergeByKey(defaults: Shortcut[], config: Shortcut[]): Shortcut[] {
  const byKey = new Map<string, Shortcut>();
  for (const s of defaults) if (!byKey.has(s.searchKey)) byKey.set(s.searchKey, s);
  for (const s of config) {
    const existing = byKey.get(s.searchKey);
    if (s.isUnbound && existing) {
      byKey.set(s.searchKey, { ...existing, isUnbound: true, isDefault: false, origin: 'user-config', filePath: s.filePath });
    } else {
      byKey.set(s.searchKey, s);
    }
  }
  return Array.from(byKey.values());
}

/** `BackwardDeleteChar` → "Backward delete char". */
function humanize(name: string): string {
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.replace(/^./, (c) => c.toUpperCase());
}
