import { app, shell } from 'electron';
import os from 'node:os';
import type { AppInfo } from '../shared/types';
import { REPO, releasePage } from './updates';

const OS_NAMES: Partial<Record<NodeJS.Platform, string>> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

/** macOS reports its Darwin kernel version in os.release(); the product version is what users know. */
function osVersion(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? process.getSystemVersion() : os.release();
}

export function appInfo(platform: NodeJS.Platform = process.platform): AppInfo {
  return {
    version: app.getVersion(),
    arch: process.arch,
    platform,
    os: `${OS_NAMES[platform] ?? platform} ${osVersion(platform)}`,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  };
}

/** URL of an AboutLink; null for anything else (the renderer is not trusted). */
export function aboutLinkUrl(link: unknown, version: string): string | null {
  switch (link) {
    case 'releaseNotes':
      return releasePage(version);
    case 'repo':
      return `https://github.com/${REPO}`;
    case 'issues':
      return `https://github.com/${REPO}/issues/new`;
    case 'license':
      return `https://github.com/${REPO}/blob/main/LICENSE`;
    default:
      return null;
  }
}

export function openAboutLink(link: unknown): void {
  const url = aboutLinkUrl(link, app.getVersion());
  if (url) void shell.openExternal(url);
}
