import type { WebContents } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import log from './logger';

/** Where the app's own pages are served from. */
export interface AppLocations {
  /** Vite dev server origins (development only). */
  devOrigins: string[];
  /** Absolute paths of the built HTML entry points (production). */
  files: string[];
}

/** Whether `url` is one of the app's own pages; everything else is foreign. */
export function isAppUrl(url: string, locations: AppLocations): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'file:') {
    try {
      const file = path.resolve(fileURLToPath(parsed));
      return locations.files.some((f) => path.resolve(f) === file);
    } catch {
      return false;
    }
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return locations.devOrigins.includes(parsed.origin);
  }
  return false;
}

/**
 * The renderers only ever show the app's own pages: block navigation (a link,
 * a dropped file, `location = ...`) and redirects to anything else, deny
 * every new window and never attach a <webview>.
 */
export function guardWebContents(contents: WebContents, locations: AppLocations): void {
  const block = (event: { url: string; preventDefault: () => void }, kind: string) => {
    if (isAppUrl(event.url, locations)) return;
    event.preventDefault();
    log.warn(`Blocked ${kind} to ${event.url}`);
  };
  contents.on('will-frame-navigate', (event) => block(event, 'navigation'));
  contents.on('will-redirect', (event) => block(event, 'redirect'));
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    log.warn(`Blocked window.open to ${url}`);
    return { action: 'deny' };
  });
}
