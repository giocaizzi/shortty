import { expect } from 'vitest';
import type { Shortcut, ParserMeta, Command } from '@shared/types';

/**
 * Assert that a value is defined (not null or undefined), narrowing
 * the type for subsequent accesses. Uses `expect` internally so the
 * test fails with a clear message when the value is missing.
 */
export function assertDefined<T>(
  val: T | undefined | null,
): asserts val is T {
  expect(val).toBeDefined();
  expect(val).not.toBeNull();
}

/** Create a Shortcut with sensible defaults, merging any overrides. */
export function makeShortcut(overrides?: Partial<Shortcut>): Shortcut {
  return {
    id: 'test-1',
    source: 'vscode',
    sourceLabel: 'VS Code',
    key: '⌘+S',
    searchKey: 'cmd+s',
    command: 'Save File',
    rawCommand: 'workbench.action.files.save',
    isDefault: true,
    isUnbound: false,
    filePath: '/path/to/config',
    origin: 'user-config',
    ...overrides,
  };
}

/** Create a Command with sensible defaults, merging any overrides. */
export function makeCommand(overrides?: Partial<Command>): Command {
  return {
    name: 'git',
    description: 'The fast version control system',
    bin: '/usr/bin/git',
    mtime: Date.now(),
    enrichment: 'full',
    hasManPage: true,
    hasCompletion: true,
    subcommands: [],
    flags: [],
    arguments: [],
    ...overrides,
  };
}

/** Create a ParserMeta with sensible defaults, merging any overrides. */
export function makeParserMeta(overrides?: Partial<ParserMeta>): ParserMeta {
  return {
    id: 'vscode',
    label: 'VS Code',
    icon: '⌨️',
    platforms: ['darwin'],
    ...overrides,
  };
}
