import type { Shortcut, ParserMeta } from '../../shared/types';

export interface ParserPlugin {
  meta: ParserMeta;
  isAvailable(): Promise<boolean>;
  getWatchPaths(): string[];
  parse(): Promise<Shortcut[]>;
}
