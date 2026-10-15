import { afterAll, beforeAll } from 'vitest';
import { join } from 'node:path';
import type { Shortcut } from '../../../src/shared/types';

export const FIXTURES = join(__dirname, '../../../fixtures');

/** Compact, hand-verifiable view of a parsed shortcut. */
export type Row = [key: string, command: string, context: string | null, isUnbound: boolean];

export function rows(shortcuts: Shortcut[]): Row[] {
  return shortcuts.map((s) => [s.key, s.command, s.context ?? null, s.isUnbound]);
}

/** Pretend to run on `platform` for the enclosing describe block. */
export function withPlatform(platform: NodeJS.Platform): void {
  const original = process.platform;
  beforeAll(() => {
    Object.defineProperty(process, 'platform', { value: platform });
  });
  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: original });
  });
}
