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

export interface CommandDetail {
  name: string;
  description: string;
}

export interface FlagDetail {
  short?: string;
  long?: string;
  arg?: string;
  description: string;
}

export interface SubcommandDetail {
  name: string;
  description: string;
  enrichment: 'none' | 'full' | 'failed';
  enrichedAt?: string;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
}

export interface Command {
  name: string;
  description: string;
  bin: string;
  mtime: number;
  enrichment: 'basic' | 'partial' | 'full' | 'failed';
  enrichedFrom?: 'zsh-completion' | 'bash-completion' | 'man' | 'help';
  enrichedAt?: string;
  hasManPage: boolean;
  hasCompletion: boolean;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
}

export interface SourceStatus {
  id: string;
  label: string;
  icon: string;
  platforms: ('darwin' | 'win32' | 'linux')[];
  hasParser: boolean;
  enabled: boolean;
  detected: boolean;
  configPaths: string[];
  shortcutCount: number;
}

export function generateKeybindingId(
  source: string,
  rawCommand: string,
): string {
  return createHash('sha256')
    .update(`${source}:${rawCommand}`)
    .digest('hex')
    .slice(0, 12);
}
