import { app } from 'electron';
import path from 'node:path';

/**
 * Test-only hook for the Playwright end-to-end suite (see docs/runbooks/run-e2e-tests.md).
 *
 * Inactive unless SHORTTY_E2E=1. When active, all Electron storage (settings,
 * commands cache, logs, Chromium session data) is redirected into
 * SHORTTY_E2E_DIR so a run never touches the developer's real profile.
 *
 * Must be the first import of the main entry: settings-store creates its
 * electron-store at import time, which resolves app.getPath('userData').
 */
export const isE2E = process.env.SHORTTY_E2E === '1';

if (isE2E) {
  const dir = process.env.SHORTTY_E2E_DIR;
  if (!dir) {
    throw new Error('SHORTTY_E2E=1 requires SHORTTY_E2E_DIR');
  }
  app.setPath('userData', path.join(dir, 'userData'));
  app.setPath('sessionData', path.join(dir, 'sessionData'));
  app.setPath('logs', path.join(dir, 'logs'));
}

interface E2EControls {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  openPreferences: () => void;
  isTrayVisible: () => boolean;
}

/**
 * Expose window controls to Playwright's electronApp.evaluate() as
 * globalThis.__shorttyE2E. Called once the app is fully initialized, so its
 * presence doubles as the "app ready" signal. No-op outside e2e mode.
 */
export function exposeE2EControls(controls: E2EControls): void {
  if (!isE2E) return;
  (globalThis as { __shorttyE2E?: E2EControls }).__shorttyE2E = controls;
}
