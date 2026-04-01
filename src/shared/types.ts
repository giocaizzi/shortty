import { createHash } from 'node:crypto';

export interface Keybinding {
  id: string;
  source: string;
  sourceLabel: string;
  key: string;
  command: string;
  rawCommand: string;
  context?: string;
  isDefault: boolean;
  isUnbound: boolean;
  filePath: string;
}

export interface ParserMeta {
  id: string;
  label: string;
  icon: string;
  platforms: ('darwin' | 'win32' | 'linux')[];
}

export function generateKeybindingId(
  source: string,
  key: string,
  rawCommand: string,
  context?: string,
): string {
  return createHash('sha256')
    .update(`${source}:${key}:${rawCommand}:${context ?? ''}`)
    .digest('hex')
    .slice(0, 12);
}
