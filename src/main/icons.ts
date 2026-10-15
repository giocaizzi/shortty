import { app, nativeImage } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

/**
 * Real app icons for sources and for commands shipped inside an .app
 * (docs/spec.md §15), or on Windows the icon of the source app's or the
 * command's .exe. Elsewhere every lookup resolves to null and the renderer
 * falls back to a brand glyph or the monogram tile.
 */

export interface AppRef {
  bundleId: string;
  name: string;
}

export type IconKind = 'source' | 'command';

const runFile = promisify(execFile);

/** Reverse-DNS only, so the id can never break out of the mdfind query. */
const BUNDLE_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const BUNDLE_NAME = /^[^/\0]+$/;

export interface BundleSearch {
  /** Ask Spotlight by bundle id before scanning `roots` by name. */
  spotlight: boolean;
  /** Folders holding `<name>.app`, in order of preference. */
  roots: string[];
}

export function defaultBundleSearch(
  e2e: boolean,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): BundleSearch {
  if (platform === 'win32') {
    // Install folders of WINDOWS_EXES: per-user first, then machine-wide.
    const local = env.LOCALAPPDATA;
    const roots = [
      local && path.win32.join(local, 'Programs'),
      env.ProgramFiles,
      env['ProgramFiles(x86)'],
      local,
    ].filter((r): r is string => !!r);
    return { spotlight: false, roots: e2e ? [] : roots };
  }
  const home = path.join(homedir(), 'Applications');
  // e2e runs with a fake HOME: never look at the machine's real apps there.
  if (e2e) return { spotlight: false, roots: [home] };
  return {
    spotlight: true,
    roots: [
      '/Applications',
      home,
      '/System/Applications',
      '/System/Applications/Utilities',
      '/System/Library/CoreServices',
    ],
  };
}

/** Locate an installed app bundle: Spotlight by bundle id, then by name. */
export async function findAppBundle(ref: AppRef, search: BundleSearch): Promise<string | null> {
  if (search.spotlight && BUNDLE_ID.test(ref.bundleId)) {
    try {
      const { stdout } = await runFile('mdfind', [`kMDItemCFBundleIdentifier == '${ref.bundleId}'`], {
        timeout: 2000,
      });
      const hits = stdout.split('\n').filter((p) => p.endsWith('.app'));
      // Prefer an installed copy over one in a mounted DMG, backup or Trash.
      const hit = hits.find((p) => search.roots.includes(path.dirname(p))) ?? hits[0];
      if (hit) return hit;
    } catch {
      // Spotlight off or slow: fall through to the folder scan.
    }
  }
  if (!BUNDLE_NAME.test(ref.name)) return null;
  for (const root of search.roots) {
    const candidate = path.join(root, `${ref.name}.app`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Each cheatsheet app's .exe under a Windows install folder, by AppRef name. */
const WINDOWS_EXES = new Map([
  ['Visual Studio Code', 'Microsoft VS Code\\Code.exe'],
  ['Google Chrome', 'Google\\Chrome\\Application\\chrome.exe'],
  ['Obsidian', 'Obsidian\\Obsidian.exe'],
]);

/** Locate an installed app's .exe on Windows under the search roots. */
export function findWindowsExe(ref: AppRef, search: BundleSearch): string | null {
  const exe = WINDOWS_EXES.get(ref.name);
  if (!exe) return null;
  for (const root of search.roots) {
    const candidate = path.win32.join(root, exe);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** The .app a binary lives in (after symlinks), e.g. /usr/local/bin/code → Visual Studio Code.app. */
export function appBundleOfBinary(bin: string): string | null {
  let real: string;
  try {
    real = realpathSync(bin);
  } catch {
    return null;
  }
  return /^(.+?\.app)\/Contents\//.exec(real)?.[1] ?? null;
}

async function iconDataUrl(bundle: string): Promise<string | null> {
  // Quick Look renders the bundle's icon at retina size; app.getFileIcon tops
  // out at 32px on macOS ('large' aborts the process in Electron 44).
  const image = await nativeImage.createThumbnailFromPath(bundle, { width: 64, height: 64 });
  return image.isEmpty() ? null : image.toDataURL();
}

async function exeIconDataUrl(exe: string): Promise<string | null> {
  // 'large' is 32px on Windows (on macOS it aborts, hence iconDataUrl there).
  const image = await app.getFileIcon(exe, { size: 'large' });
  return image.isEmpty() ? null : image.toDataURL();
}

export interface IconDeps {
  /** App bundle declared by a known source's cheatsheet; undefined for unknown ids. */
  sourceApp: (id: string) => AppRef | null | undefined;
  /** Binary path of a known command; undefined for unknown names. */
  commandBin: (name: string) => string | undefined;
  search: BundleSearch;
  platform?: NodeJS.Platform;
  /** Injectable for tests. */
  toDataUrl?: (bundle: string) => Promise<string | null>;
}

/**
 * Icon lookups for the `icons:get` IPC. The renderer only names a known
 * source id or command; paths never come from it. Results (hits and misses)
 * are cached for the session, so each icon is resolved and encoded once.
 */
export function createIconService(deps: IconDeps) {
  const cache = new Map<string, Promise<string | null>>();
  const windows = (deps.platform ?? process.platform) === 'win32';
  const toDataUrl = deps.toDataUrl ?? (windows ? exeIconDataUrl : iconDataUrl);

  /** The .app (macOS) or .exe (Windows) whose icon stands for the source or command. */
  async function bundleFor(kind: IconKind, name: string): Promise<string | null> {
    if (kind === 'source') {
      const ref = deps.sourceApp(name);
      if (!ref) return null;
      return windows ? findWindowsExe(ref, deps.search) : findAppBundle(ref, deps.search);
    }
    const bin = deps.commandBin(name);
    if (!bin) return null;
    // .cmd/.bat shims and scripts only have the generic file icon.
    if (windows) return /\.exe$/i.test(bin) ? bin : null;
    return appBundleOfBinary(bin);
  }

  return function getIcon(kind: unknown, name: unknown): Promise<string | null> {
    if ((kind !== 'source' && kind !== 'command') || typeof name !== 'string') {
      return Promise.resolve(null);
    }
    const known = kind === 'source' ? deps.sourceApp(name) !== undefined : deps.commandBin(name) !== undefined;
    if (!known) return Promise.resolve(null);
    const key = `${kind}:${name}`;
    let icon = cache.get(key);
    if (!icon) {
      icon = bundleFor(kind, name)
        .then((bundle) => (bundle ? toDataUrl(bundle) : null))
        .catch(() => null);
      cache.set(key, icon);
    }
    return icon;
  };
}
