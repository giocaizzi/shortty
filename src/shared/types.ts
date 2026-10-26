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
  /** Help section the entry is listed under ("Management Commands", gcloud "GROUPS"). */
  group?: string;
  deprecated?: boolean;
}

export interface FlagDetail {
  short?: string;
  long?: string;
  arg?: string;
  description: string;
  /** Default value as documented ("30", "open"). */
  default?: string;
  /** Allowed values, when the help lists them. */
  choices?: string[];
  required?: boolean;
  deprecated?: boolean;
  /** Help section the flag is listed under ("Global Flags", "INHERITED FLAGS"). */
  group?: string;
}

export interface ExampleDetail {
  command: string;
  /** What the example does (the comment or sentence before it); may be empty. */
  description: string;
}

export interface EnvVarDetail {
  name: string;
  description: string;
}

/** Optional extras parsed from help and man pages (docs/spec.md §7.8). */
export interface HelpExtras {
  /** Other names of this command ("gh pr ls"). */
  aliases?: string[];
  examples?: ExampleDetail[];
  environment?: EnvVarDetail[];
  /** Related pages and links: "gh-pr(1)", "https://cli.github.com/manual". */
  seeAlso?: string[];
}

export interface ArgumentDetail {
  name: string;
  required: boolean;
  variadic: boolean;
  description: string;
}

export interface SubcommandDetail extends HelpExtras {
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

export interface Command extends HelpExtras {
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

/** Update check state shown in Preferences and the tray (src/main/updates.ts). */
/** What Preferences → About shows (and copies for bug reports). */
export interface AppInfo {
  version: string;
  arch: string;
  platform: string;
  /** e.g. "macOS 26.0", "Windows 10.0.26100", "Linux 6.8.0". */
  os: string;
  electron: string;
  chrome: string;
  node: string;
}

/** Fixed links About can open; main builds the URL (no URL crosses IPC). */
export type AboutLink = 'releaseNotes' | 'repo' | 'issues' | 'license';

export interface UpdateStatus {
  /** Running version (app.getVersion()). */
  current: string;
  /** `disabled`: development and e2e builds never check. `idle`: not checked yet. */
  state: 'disabled' | 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';
  /** The newer version, when known (available, downloading, ready). */
  version?: string;
  /** Whether this copy can install updates itself (canAutoUpdate); absent until known, and in development and e2e. */
  canAutoUpdate?: boolean;
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
