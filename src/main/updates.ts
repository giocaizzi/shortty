import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { UpdateStatus } from '../shared/types';
import log from './logger';

/**
 * Updates (docs/spec.md §12.4). Where Squirrel can install an update (a
 * Squirrel.Windows install, a Developer ID signed macOS app), Electron's
 * autoUpdater downloads it from update.electronjs.org and the user restarts
 * into it. Everywhere else (Linux, unsigned macOS, the portable Windows ZIP)
 * Shortty only asks the GitHub API for the latest release and links to it.
 */

export const REPO = 'giocaizzi/shortty';
const FEED_HOST = 'https://update.electronjs.org';
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** First check after startup, out of the way of indexing (and of Squirrel's first-run lock). */
export const FIRST_CHECK_DELAY_MS = 30_000;
const AUTO_INTERVAL_MS = 60 * 60 * 1000;
const NOTIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** [major, minor, patch] of `X.Y.Z` or `vX.Y.Z`; null for anything else (prereleases included). */
export function parseVersion(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? match.slice(1).map(Number) : null;
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export function releasePage(version: string): string {
  return `https://github.com/${REPO}/releases/tag/v${version}`;
}

/** `codesign -dv` details of a bundle (printed on stderr), or '' when it fails. */
function codesignDetails(bundle: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('codesign', ['-dv', '--verbose=2', bundle], { timeout: 5000 }, (err, _stdout, stderr) =>
      resolve(err ? '' : String(stderr)),
    );
  });
}

/**
 * Whether Squirrel can install updates for this copy of the app: on Windows
 * a Squirrel install (Update.exe one folder above app-x.y.z), on macOS a
 * bundle signed with a Developer ID (Squirrel.Mac refuses anything else;
 * unsigned arm64 builds are ad-hoc signed and have no Authority line).
 */
export async function canAutoUpdate(
  platform: NodeJS.Platform = process.platform,
  execPath: string = process.execPath,
  exists: (p: string) => boolean = existsSync,
  codesign: (bundle: string) => Promise<string> = codesignDetails,
): Promise<boolean> {
  if (platform === 'win32') {
    return exists(path.win32.resolve(path.win32.dirname(execPath), '..', 'Update.exe'));
  }
  if (platform === 'darwin') {
    // .../Shortty.app/Contents/MacOS/shortty
    const bundle = path.posix.resolve(execPath, '../../..');
    return /^Authority=Developer ID Application:/m.test(await codesign(bundle));
  }
  return false;
}

/**
 * Latest published release version (X.Y.Z), or null when it cannot be read
 * (offline, rate limited, a draft or prerelease, an odd tag).
 */
export async function fetchLatestVersion(
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<string | null> {
  try {
    const res = await fetchFn(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: unknown; draft?: unknown; prerelease?: unknown };
    if (body.draft || body.prerelease || typeof body.tag_name !== 'string') return null;
    return parseVersion(body.tag_name) ? body.tag_name.replace(/^v/, '') : null;
  } catch {
    return null;
  }
}

/** The part of Electron's autoUpdater the Updater drives. */
interface AutoUpdater {
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface UpdaterDeps {
  /** False in development and e2e runs: no check ever runs. */
  enabled: boolean;
  currentVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  canAutoUpdate: () => Promise<boolean>;
  fetchLatestVersion: () => Promise<string | null>;
  autoUpdater: AutoUpdater;
  openExternal: (url: string) => void;
  /** Called right before quitAndInstall (lets the launcher window close). */
  beforeInstall: () => void;
  onStatus: (status: UpdateStatus) => void;
}

export class Updater {
  private status: UpdateStatus;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private capable: Promise<boolean> | null = null;
  private auto = false;
  private listening = false;

  constructor(private readonly deps: UpdaterDeps) {
    this.status = { current: deps.currentVersion, state: deps.enabled ? 'idle' : 'disabled' };
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  /** (Re)start periodic checks; call again when the autoUpdate setting changes. */
  async start(autoUpdate: boolean, delayMs = FIRST_CHECK_DELAY_MS): Promise<void> {
    if (!this.deps.enabled) return;
    this.stop();
    this.capable ??= this.deps.canAutoUpdate().catch(() => false);
    this.auto = autoUpdate && (await this.capable);
    if (this.auto) this.listen();
    log.info(`Updates: ${this.auto ? 'auto-update' : 'notify only'}`);
    const interval = this.auto ? AUTO_INTERVAL_MS : NOTIFY_INTERVAL_MS;
    this.timer = setTimeout(() => {
      void this.check();
      this.timer = setInterval(() => void this.check(), interval);
    }, delayMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async check(): Promise<void> {
    const { state } = this.status;
    if (state === 'disabled' || state === 'ready' || state === 'downloading') return;
    if (this.auto) {
      this.deps.autoUpdater.checkForUpdates();
      return;
    }
    await this.checkLatestRelease();
  }

  /** Restart into a downloaded update, or open the page of a newer release. */
  install(): void {
    const { state, version } = this.status;
    if (state === 'ready') {
      this.deps.beforeInstall();
      this.deps.autoUpdater.quitAndInstall();
    } else if (state === 'available' && version) {
      this.deps.openExternal(releasePage(version));
    }
  }

  private async checkLatestRelease(): Promise<void> {
    this.set({ state: 'checking' });
    const latest = await this.deps.fetchLatestVersion();
    if (latest === null) this.set({ state: 'error' });
    else if (isNewer(latest, this.deps.currentVersion)) this.set({ state: 'available', version: latest });
    else this.set({ state: 'up-to-date' });
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    const { autoUpdater, platform, arch, currentVersion } = this.deps;
    autoUpdater.setFeedURL({ url: `${FEED_HOST}/${REPO}/${platform}-${arch}/${currentVersion}` });
    autoUpdater.on('checking-for-update', () => this.auto && this.set({ state: 'checking' }));
    autoUpdater.on('update-available', () => this.auto && this.set({ state: 'downloading' }));
    autoUpdater.on('update-not-available', () => this.auto && this.set({ state: 'up-to-date' }));
    // A finished download is applied whatever the setting says now.
    autoUpdater.on('update-downloaded', (_event: unknown, _notes: unknown, releaseName: unknown) => {
      const version = typeof releaseName === 'string' ? /\d+\.\d+\.\d+/.exec(releaseName)?.[0] : undefined;
      this.set({ state: 'ready', version });
    });
    // e.g. a translocated or read-only app on macOS: still tell the user.
    autoUpdater.on('error', (err: unknown) => {
      log.warn('Auto-update failed, checking the latest release instead', err);
      if (this.auto && this.status.state !== 'ready') void this.checkLatestRelease();
    });
  }

  private set(next: Omit<UpdateStatus, 'current'>): void {
    this.status = { current: this.deps.currentVersion, ...next };
    this.deps.onStatus(this.status);
  }
}
