import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import log, { ignoreBrokenPipe, rotateLogFiles } from '../../../src/main/logger';

let dir: string;

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('rotateLogFiles', () => {
  it('keeps at most 3 files (live + 2 archives), newest archive first', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'shortty-log-'));
    const file = path.join(dir, 'main.log');

    for (const generation of ['a', 'b', 'c', 'd']) {
      writeFileSync(file, generation);
      rotateLogFiles(file);
    }
    writeFileSync(file, 'live');

    expect(readdirSync(dir).sort()).toEqual(['main.1.log', 'main.2.log', 'main.log']);
    expect(readFileSync(path.join(dir, 'main.1.log'), 'utf8')).toBe('d');
    expect(readFileSync(path.join(dir, 'main.2.log'), 'utf8')).toBe('c');
  });
});

describe('logger under tests', () => {
  it('never writes the real log file', () => {
    expect(log.transports.file.level).toBe(false);
  });
});

describe('ignoreBrokenPipe', () => {
  const pipeError = (code: string) => Object.assign(new Error(`write ${code}`), { code });

  it('swallows EPIPE on a closed stdout and stops console logging', () => {
    const stream = new EventEmitter();
    const level = log.transports.console.level;
    ignoreBrokenPipe(stream);
    try {
      expect(() => stream.emit('error', pipeError('EPIPE'))).not.toThrow();
      expect(log.transports.console.level).toBe(false);
    } finally {
      log.transports.console.level = level;
    }
  });

  it('still throws any other stream error', () => {
    const stream = new EventEmitter();
    ignoreBrokenPipe(stream);
    expect(() => stream.emit('error', pipeError('EIO'))).toThrow('write EIO');
  });
});
