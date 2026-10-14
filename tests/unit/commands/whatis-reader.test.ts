import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readWhatis } from '../../../src/main/commands/whatis-reader';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';

const mockExecSync = vi.mocked(execSync);

describe('readWhatis', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses standard whatis output', () => {
    mockExecSync.mockReturnValue(
      'git(1) - the stupid content tracker\n' +
      'ls(1) - list directory contents\n' +
      'curl(1) - transfer a URL\n',
    );

    const result = readWhatis();

    expect(result.get('git')).toBe('the stupid content tracker');
    expect(result.get('ls')).toBe('list directory contents');
    expect(result.get('curl')).toBe('transfer a URL');
    expect(result.size).toBe(3);
  });

  it('keeps first occurrence for duplicate names', () => {
    mockExecSync.mockReturnValue(
      'printf(1) - formatted output\n' +
      'printf(3) - formatted output conversion\n',
    );

    const result = readWhatis();

    expect(result.get('printf')).toBe('formatted output');
    expect(result.size).toBe(1);
  });

  it('handles empty output', () => {
    mockExecSync.mockReturnValue('');

    const result = readWhatis();
    expect(result.size).toBe(0);
  });

  it('skips malformed lines', () => {
    mockExecSync.mockReturnValue(
      'git(1) - the stupid content tracker\n' +
      'this is not a valid line\n' +
      '\n' +
      'ls(1) - list directory contents\n',
    );

    const result = readWhatis();

    expect(result.size).toBe(2);
    expect(result.has('git')).toBe(true);
    expect(result.has('ls')).toBe(true);
  });

  it('returns empty map when whatis fails', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('command not found');
    });

    const result = readWhatis();
    expect(result.size).toBe(0);
  });
});
