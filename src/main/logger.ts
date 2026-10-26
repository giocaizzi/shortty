import { app } from 'electron';
import log from 'electron-log/main';
import { existsSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

/** docs/spec.md §12.2: 3 files (the live one + 2 archives), 5MB each. */
const LOG_FILES = 3;

/**
 * Rotate `file` into numbered archives: main.log -> main.1.log -> main.2.log,
 * dropping the oldest, so at most `files` log files exist.
 */
export function rotateLogFiles(file: string, files = LOG_FILES): void {
  const { dir, name, ext } = path.parse(file);
  const archive = (i: number) => path.join(dir, `${name}.${i}${ext}`);
  const archives = files - 1;
  if (archives < 1) {
    rmSync(file, { force: true });
    return;
  }
  rmSync(archive(archives), { force: true });
  for (let i = archives - 1; i >= 1; i--) {
    if (existsSync(archive(i))) renameSync(archive(i), archive(i + 1));
  }
  renameSync(file, archive(1));
}

/**
 * A closed stdout/stderr pipe (the terminal that launched the app went away)
 * makes the next console write fail with EPIPE, emitted as an `error` event
 * that would otherwise become an "Uncaught Exception" dialog. Ignore EPIPE and
 * stop console logging (the file log keeps going); rethrow anything else.
 */
export function ignoreBrokenPipe(stream: NodeJS.EventEmitter): void {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') throw err;
    log.transports.console.level = false;
  });
}

// `app` is undefined when this module is imported outside Electron (unit tests).
// Tests must never write the developer's real ~/Library/Logs/Shortty/main.log.
log.transports.file.level = process.env.VITEST ? false : app?.isPackaged === false ? 'debug' : 'info';
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB per file
log.transports.file.archiveLogFn = (file) => rotateLogFiles(file.toString());
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';

export default log;
