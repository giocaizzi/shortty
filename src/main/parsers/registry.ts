import type { Keybinding, ParserMeta } from '../../shared/types';
import { generateKeybindingId } from '../../shared/types';
import type { ParserPlugin } from './types';
import { loadCheatsheets, type CheatsheetDefinition } from '../cheatsheets/loader';
import { mergeShortcuts } from '../shortcuts/merge';
import { resolveDefaultPaths, resolvePath } from '../utils/path-resolver';
import { VscodeParser } from './vscode.parser';
import { GhosttyParser } from './ghostty.parser';
import { TmuxParser } from './tmux.parser';
import { ZshParser } from './zsh.parser';
import { ObsidianParser } from './obsidian.parser';
import { ChromeParser } from './chrome.parser';
import { MacosSystemParser } from './macos-system.parser';
import { VimParser } from './vim.parser';
import { BashParser } from './bash.parser';
import { BaseParser } from './base-parser';

type Platform = 'darwin' | 'win32' | 'linux';

/** Map of parser IDs to their constructor. */
const PARSERS: Record<string, new () => BaseParser> = {
  vscode: VscodeParser,
  ghostty: GhosttyParser,
  tmux: TmuxParser,
  zsh: ZshParser,
  obsidian: ObsidianParser,
  chrome: ChromeParser,
  'macos-system': MacosSystemParser,
  vim: VimParser,
  bash: BashParser,
};

export interface SourceInfo {
  id: string;
  label: string;
  icon: string;
  platforms: Platform[];
  parser: ParserPlugin | null;
  cheatsheet: CheatsheetDefinition | null;
  enabled: boolean;
  detected: boolean;
  configPaths: string[];
}

export class ParserRegistry {
  private sources: Map<string, SourceInfo> = new Map();
  private cache: Map<string, Keybinding[]> = new Map();

  async initialize(
    disabledIds: string[] = [],
    pathOverrides: Record<string, string | string[]> = {},
  ): Promise<void> {
    const cheatsheets = await loadCheatsheets();
    const platform = process.platform as Platform;

    // Register sources from cheatsheets
    for (const cs of cheatsheets) {
      if (!cs.platforms.includes(platform)) continue;

      const ParserClass = cs.parser ? PARSERS[cs.parser] : null;
      const parser = ParserClass ? new ParserClass() : null;

      // Resolve config paths: user override > cheatsheet defaults
      let configPaths: string[];
      const override = pathOverrides[cs.id];
      if (override) {
        configPaths = (Array.isArray(override) ? override : [override]).map(resolvePath);
      } else {
        configPaths = resolveDefaultPaths(cs.defaultPaths);
      }

      if (parser) {
        parser.setConfigPaths(configPaths);
      }

      const source: SourceInfo = {
        id: cs.id,
        label: cs.label,
        icon: cs.icon,
        platforms: cs.platforms,
        parser,
        cheatsheet: cs,
        enabled: !disabledIds.includes(cs.id),
        detected: parser ? await parser.isAvailable().catch(() => false) : false,
        configPaths,
      };

      this.sources.set(cs.id, source);
    }

    // Register standalone parsers (in PARSERS map but no cheatsheet)
    for (const [id, ParserClass] of Object.entries(PARSERS)) {
      if (this.sources.has(id)) continue;

      const parser = new ParserClass();
      const source: SourceInfo = {
        id,
        label: parser.meta.label,
        icon: parser.meta.icon,
        platforms: parser.meta.platforms,
        parser,
        cheatsheet: null,
        enabled: !disabledIds.includes(id),
        detected: await parser.isAvailable().catch(() => false),
        configPaths: [],
      };

      this.sources.set(id, source);
    }

    await this.parseAll();
  }

  async updateActiveParsers(
    disabledIds: string[],
    pathOverrides: Record<string, string | string[]> = {},
  ): Promise<void> {
    for (const [id, source] of this.sources) {
      const wasEnabled = source.enabled;
      source.enabled = !disabledIds.includes(id);

      // Update path overrides if provided
      const override = pathOverrides[id];
      if (override) {
        const newPaths = (Array.isArray(override) ? override : [override]).map(resolvePath);
        source.configPaths = newPaths;
        if (source.parser && source.parser instanceof BaseParser) {
          source.parser.setConfigPaths(newPaths);
        }
      }

      // If just disabled, remove from cache
      if (wasEnabled && !source.enabled) {
        this.cache.delete(id);
      }
    }

    await this.parseAll();
  }

  getAvailableSources(): ParserMeta[] {
    return Array.from(this.sources.values())
      .filter((s) => s.detected || (s.cheatsheet && s.cheatsheet.shortcuts.length > 0))
      .map((s) => ({
        id: s.id,
        label: s.label,
        icon: s.icon,
        platforms: s.platforms,
      }));
  }

  getAllSources(): SourceInfo[] {
    return Array.from(this.sources.values());
  }

  async parseAll(): Promise<Keybinding[]> {
    const results = await Promise.allSettled(
      Array.from(this.sources.values())
        .filter((s) => s.enabled)
        .map(async (source) => {
          const keybindings = await this.parseSource(source);
          this.cache.set(source.id, keybindings);
          return keybindings;
        }),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<Keybinding[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value);
  }

  private async parseSource(source: SourceInfo): Promise<Keybinding[]> {
    const cheatsheetDefaults = this.convertCheatsheetToShortcuts(source);

    let parserResults: Keybinding[] = [];
    if (source.parser && source.detected) {
      try {
        parserResults = await source.parser.parse();
      } catch {
        // Parser failed - fall back to cheatsheet only
      }
    }

    // Merge: cheatsheet defaults + parser overrides
    if (cheatsheetDefaults.length > 0 && parserResults.length > 0) {
      return mergeShortcuts(cheatsheetDefaults, parserResults);
    }
    if (cheatsheetDefaults.length > 0) return cheatsheetDefaults;
    return parserResults;
  }

  /** Convert cheatsheet shortcuts to Keybinding objects for current platform. */
  private convertCheatsheetToShortcuts(source: SourceInfo): Keybinding[] {
    if (!source.cheatsheet || source.cheatsheet.shortcuts.length === 0) return [];

    const platform = process.platform as Platform;
    const shortcuts: Keybinding[] = [];

    for (const cs of source.cheatsheet.shortcuts) {
      const keyForPlatform = cs.key[platform];
      if (!keyForPlatform) continue;

      shortcuts.push({
        id: generateKeybindingId(source.id, cs.rawCommand),
        source: source.id,
        sourceLabel: source.label,
        key: keyForPlatform,
        searchKey: keyForPlatform.toLowerCase(),
        command: cs.command,
        rawCommand: cs.rawCommand,
        context: cs.context,
        category: cs.category,
        isDefault: true,
        isUnbound: false,
        filePath: '',
        origin: 'cheatsheet',
      });
    }

    return shortcuts;
  }

  async parseSingleSource(sourceId: string): Promise<Keybinding[]> {
    const source = this.sources.get(sourceId);
    if (!source || !source.enabled) return [];

    const keybindings = await this.parseSource(source);
    this.cache.set(sourceId, keybindings);
    return keybindings;
  }

  getAllCached(): Keybinding[] {
    return Array.from(this.cache.values()).flat();
  }

  getCachedBySource(sourceId: string): Keybinding[] {
    return this.cache.get(sourceId) ?? [];
  }

  getSources(): ParserMeta[] {
    return Array.from(this.sources.values())
      .filter((s) => s.enabled)
      .map((s) => ({
        id: s.id,
        label: s.label,
        icon: s.icon,
        platforms: s.platforms,
      }));
  }

  getWatchPaths(): Map<string, string[]> {
    const paths = new Map<string, string[]>();
    for (const [id, source] of this.sources) {
      if (!source.enabled || !source.parser) continue;
      paths.set(id, source.parser.getWatchPaths());
    }
    return paths;
  }
}
