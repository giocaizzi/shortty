import path from 'node:path';

/**
 * Comparable form of a path: normalised (separators, `.` and `..`), and
 * case-folded on Windows, whose file system ignores case.
 */
export function pathKey(p: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? path.win32.normalize(p).toLowerCase() : path.posix.normalize(p);
}
