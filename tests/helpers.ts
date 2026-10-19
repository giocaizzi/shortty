import { afterAll, beforeAll, expect } from 'vitest';
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

/**
 * Pretend to run on `platform` for the enclosing describe block, so each
 * platform's branch is tested on every OS. Code under test must read
 * `process.platform` at call time. A POSIX platform runs as a regular user
 * (`process.getuid()` is 501), also on a Windows host or as root in a container.
 */
export function withPlatform(platform: NodeJS.Platform): void {
  let previous: NodeJS.Platform;
  const hadGetuid = 'getuid' in process;
  const getuid = process.getuid;
  beforeAll(() => {
    previous = process.platform;
    Object.defineProperty(process, 'platform', { value: platform });
    if (platform !== 'win32') process.getuid = () => 501;
  });
  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: previous });
    if (hadGetuid) process.getuid = getuid;
    else delete process.getuid;
  });
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
