import { createHash } from 'node:crypto';
import type { KeyStroke } from './keys';

export interface Shortcut {
  id: string;
  source: string;
  sourceLabel: string;
  key: string;
  searchKey: string;
  /**
   * Structured keystrokes behind `key`, used by the renderer to show the
   * key the user must press on their own keyboard layout. Absent for
   * shortcuts whose key could not be parsed (shown verbatim).
   */
  strokes?: KeyStroke[];
  command: string;
  rawCommand: string;
  /** Parser-specific context: vim mode, vscode "when" clause, shell editing mode, tmux key table */
  context?: string;
  category?: string;
  isDefault: boolean;
  isUnbound: boolean;
  filePath: string;
  origin: 'cheatsheet' | 'user-config' | 'app-defaults';
}

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

export interface ArgumentDetail {
  name: string;
  required: boolean;
  variadic: boolean;
  description: string;
}

export interface SubcommandDetail {
  name: string;
  description: string;
  synopsis?: string;
  longDescription?: string;
  enrichment: 'none' | 'full' | 'failed';
  enrichedAt?: string;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
  arguments: ArgumentDetail[];
}

export interface Command {
  name: string;
  description: string;
  synopsis?: string;
  longDescription?: string;
  bin: string;
  mtime: number;
  enrichment: 'basic' | 'full' | 'failed';
  enrichedFrom?: 'zsh-completion' | 'bash-completion' | 'man' | 'help';
  enrichedAt?: string;
  hasManPage: boolean;
  hasCompletion: boolean;
  subcommands: CommandDetail[];
  flags: FlagDetail[];
  arguments: ArgumentDetail[];
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

/**
 * Stable shortcut id. `discriminator` (key + context) keeps ids unique when
 * one config binds the same command to several keys or contexts.
 */
export function generateShortcutId(
  source: string,
  rawCommand: string,
  discriminator?: string,
): string {
  return createHash('sha256')
    .update(discriminator ? `${source}:${rawCommand}:${discriminator}` : `${source}:${rawCommand}`)
    .digest('hex')
    .slice(0, 12);
}
