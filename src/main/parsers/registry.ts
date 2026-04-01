import type { Keybinding, ParserMeta } from '../../shared/types';
import type { ParserPlugin } from './types';
import { VscodeParser } from './vscode.parser';
import { GhosttyParser } from './ghostty.parser';
import { TmuxParser } from './tmux.parser';
import { ZshParser } from './zsh.parser';
import { ObsidianParser } from './obsidian.parser';
import { ChromeParser } from './chrome.parser';
import { MacosSystemParser } from './macos-system.parser';

export class ParserRegistry {
  private parsers: ParserPlugin[] = [];
  private cache: Map<string, Keybinding[]> = new Map();
  private activeParsers: ParserPlugin[] = [];

  constructor() {
    this.parsers = [
      new VscodeParser(),
      new GhosttyParser(),
      new TmuxParser(),
      new ZshParser(),
      new ObsidianParser(),
      new ChromeParser(),
      new MacosSystemParser(),
    ];
  }

  async initialize(): Promise<void> {
    const results = await Promise.allSettled(
      this.parsers.map(async (p) => ({
        parser: p,
        available: await p.isAvailable(),
      })),
    );

    this.activeParsers = results
      .filter(
        (r): r is PromiseFulfilledResult<{ parser: ParserPlugin; available: boolean }> =>
          r.status === 'fulfilled' && r.value.available,
      )
      .map((r) => r.value.parser);

    // Initial parse of all available sources
    await this.parseAll();
  }

  async parseAll(): Promise<Keybinding[]> {
    const results = await Promise.allSettled(
      this.activeParsers.map(async (p) => {
        const keybindings = await p.parse();
        this.cache.set(p.meta.id, keybindings);
        return keybindings;
      }),
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<Keybinding[]> =>
          r.status === 'fulfilled',
      )
      .flatMap((r) => r.value);
  }

  async parseSource(sourceId: string): Promise<Keybinding[]> {
    const parser = this.activeParsers.find((p) => p.meta.id === sourceId);
    if (!parser) return [];

    const keybindings = await parser.parse();
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
    return this.activeParsers.map((p) => p.meta);
  }

  getWatchPaths(): Map<string, string[]> {
    const paths = new Map<string, string[]>();
    for (const parser of this.activeParsers) {
      paths.set(parser.meta.id, parser.getWatchPaths());
    }
    return paths;
  }
}
