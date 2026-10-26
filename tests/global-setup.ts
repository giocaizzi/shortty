import { createRequire } from 'node:module';

/**
 * Resolving `electron` downloads its binary on first use when npm skipped the
 * package's install script (npm 11 holds install scripts for approval). Test
 * workers that import it in parallel would race on that download ("Electron
 * failed to install correctly"), so resolve it once here, before they start.
 */
export default function setup(): void {
  createRequire(import.meta.url)('electron');
}
