import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readWhatis, parseWhatisOutput } from '../../../src/main/commands/whatis-reader';
import { withPlatform } from '../../helpers';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';

const mockExecFile = vi.mocked(execFile);

/** Real `apropos .` lines captured on macOS (subset). */
const APROPOS = readFileSync(join(__dirname, '../../../fixtures/commands/_whatis/apropos.txt'), 'utf-8');

function mockOutputs(outputs: Record<string, string | Error>) {
  mockExecFile.mockImplementation(((bin: string, _args: string[], _opts: unknown, cb: (e: Error | null, out: string) => void) => {
    const out = outputs[bin] ?? '';
    if (out instanceof Error) cb(out, '');
    else cb(null, out);
    return {} as ReturnType<typeof execFile>;
  }) as unknown as typeof execFile);
}

describe('parseWhatisOutput (real apropos output)', () => {
  const map = parseWhatisOutput(APROPOS);

  it('parses single-name lines', () => {
    expect(map.get('git')).toBe('the stupid content tracker');
    expect(map.get('ls')).toBe('list directory contents');
    expect(map.get('make')).toBe('GNU make utility to maintain groups of programs');
  });

  it('prefers the command section over library pages listed earlier', () => {
    // open(3) "perl pragma" comes first in apropos output
    expect(map.get('open')).toBe('open files and directories');
    expect(map.get('kill')).toBe('terminate or signal a process');
    expect(map.get('printf')).toBe('formatted output');
  });

  it('assigns the description to every name of a multi-name line', () => {
    expect(map.get('egrep')).toBe('file pattern searcher');
    expect(map.get('zfgrep')).toBe('file pattern searcher');
    expect(map.get('unbrotli')).toBe('compress or decompress files');
  });

  it('handles the Linux man-db "name (1) - desc" layout', () => {
    expect(parseWhatisOutput('ls (1)               - list directory contents\n').get('ls')).toBe('list directory contents');
  });

  it('ignores garbage lines', () => {
    expect(parseWhatisOutput('not a whatis line\n\n').size).toBe(0);
  });
});

describe('readWhatis', () => {
  withPlatform('darwin');

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('runs `apropos .` asynchronously (no shell)', async () => {
    mockOutputs({ apropos: APROPOS });
    const result = await readWhatis();
    expect(result.get('git')).toBe('the stupid content tracker');
    expect(mockExecFile).toHaveBeenCalledWith('apropos', ['.'], expect.any(Object), expect.any(Function));
  });

  it('falls back to `whatis -w *` (man-db) when apropos yields nothing', async () => {
    mockOutputs({ apropos: new Error('not found'), whatis: 'curl(1) - transfer a URL\n' });
    const result = await readWhatis();
    expect(result.get('curl')).toBe('transfer a URL');
  });

  it('returns an empty map when neither works (macOS whatis rejects -w)', async () => {
    mockOutputs({ apropos: '', whatis: new Error('whatis: illegal option -- w') });
    expect((await readWhatis()).size).toBe(0);
  });
});

describe('readWhatis on Windows', () => {
  withPlatform('win32');

  it('returns an empty map without spawning (no man database)', async () => {
    vi.resetAllMocks();
    expect((await readWhatis()).size).toBe(0);
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});
