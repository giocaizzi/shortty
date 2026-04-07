import { createHash } from 'node:crypto';

export interface Shortcut {
  id: string;
  source: string;
  sourceLabel: string;
  key: string;
  searchKey: string;
  command: string;
  rawCommand: string;
  context?: string;
  category?: string;
  isDefault: boolean;
  isUnbound: boolean;
  filePath: string;
  origin: 'cheatsheet' | 'user-config' | 'app-defaults';
}

/** @deprecated Use Shortcut instead. Kept for backward compatibility during refactor. */
export type Keybinding = Shortcut;

export interface ParserMeta {
  id: string;
  label: string;
  icon: string;
  platforms: ('darwin' | 'win32' | 'linux')[];
}

export function generateKeybindingId(
  source: string,
  keyOrRawCommand: string,
  rawCommand?: string,
  _context?: string,
): string {
  const cmd = rawCommand ?? keyOrRawCommand;
  return createHash('sha256')
    .update(`${source}:${cmd}`)
    .digest('hex')
    .slice(0, 12);
}
