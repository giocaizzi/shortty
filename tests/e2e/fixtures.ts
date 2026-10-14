/**
 * Playwright fixtures that launch the real, built Shortty app in hermetic
 * e2e mode. See docs/runbooks/run-e2e-tests.md for how the isolation works.
 */
import {
  test as base,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const FIXTURES = path.join(ROOT, 'fixtures');
const MAIN_ENTRY = path.join(ROOT, '.vite/build/index.cjs');

/**
 * Fixture config files, copied into the fake HOME at the macOS default
 * locations declared by the cheatsheets (src/cheatsheets/sources/*.json).
 */
const HOME_FILES: Record<string, string> = {
  'vscode-keybindings.json': 'Library/Application Support/Code/User/keybindings.json',
  'ghostty-config': 'Library/Application Support/com.mitchellh.ghostty/config',
  'chrome-preferences.json': 'Library/Application Support/Google/Chrome/Default/Preferences',
  'obsidian-hotkeys.json': 'Documents/Vault/.obsidian/hotkeys.json',
  zshrc: '.zshrc',
  vimrc: '.vimrc',
  bashrc: '.bashrc',
  inputrc: '.inputrc',
};

const GIZMO_HELP = `Usage: gizmo [options] <target>

Gizmo is a fake CLI used by the Shortty e2e suite.

Commands:
  build      Build the gizmo project
  deploy     Deploy gizmo to production

Options:
  -v, --verbose   Print verbose output
  -q, --quiet     Suppress all output
`;

const WIDGETCTL_HELP = `Usage: widgetctl [options]

Options:
  -l, --list      List all widgets
  -f, --force     Force the operation
`;

const GIZMO_LITE_HELP = `Usage: gizmo-lite [options]

Options:
  -n, --dry-run   Show what would happen
`;

/** Fake executables placed on the (only) PATH directory. */
const FAKE_BINS: Record<string, string> = {
  gizmo: GIZMO_HELP,
  'gizmo-lite': GIZMO_LITE_HELP,
  widgetctl: WIDGETCTL_HELP,
};

export const FAKE_COMMANDS = Object.keys(FAKE_BINS).sort();

function writeFakeBin(dir: string, name: string, help: string): void {
  const file = path.join(dir, name);
  // The app runs commands with PATH restricted to this dir, so the script
  // sets its own PATH before calling cat.
  writeFileSync(
    file,
    `#!/bin/sh\nPATH=/usr/bin:/bin\ncat <<'EOF'\n${help}EOF\n`,
  );
  chmodSync(file, 0o755);
}

export interface HermeticEnv {
  dir: string;
  home: string;
  bin: string;
  env: Record<string, string>;
}

/**
 * Build a throwaway HOME, PATH and e2e data dir for one app launch.
 * `extraBins` adds executables (name → shell script body) to the fake PATH.
 */
export function createHermeticEnv(
  settings: Record<string, unknown> = {},
  extraBins: Record<string, string> = {},
): HermeticEnv {
  // realpath: macOS tmpdir() is a /var -> /private/var symlink
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'shortty-e2e-')));
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  const tmp = path.join(dir, 'tmp');
  const userData = path.join(dir, 'userData');

  for (const d of [home, bin, tmp, userData]) mkdirSync(d, { recursive: true });

  for (const [fixture, rel] of Object.entries(HOME_FILES)) {
    const dest = path.join(home, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(path.join(FIXTURES, fixture), dest);
  }

  for (const [name, help] of Object.entries(FAKE_BINS)) writeFakeBin(bin, name, help);
  for (const [name, body] of Object.entries(extraBins)) {
    writeFileSync(path.join(bin, name), `#!/bin/sh\nPATH=/usr/bin:/bin\n${body}\n`);
    chmodSync(path.join(bin, name), 0o755);
  }

  // Seed electron-store so nothing is registered with the OS on first run.
  writeFileSync(
    path.join(userData, 'config.json'),
    // The specs exercise the ">" command prefix; the app default is off (docs/spec.md §9.1).
    JSON.stringify(
      { launchAtLogin: false, showDockIcon: false, commandPrefixMode: true, ...settings },
      null,
      2,
    ),
  );

  return {
    dir,
    home,
    bin,
    env: {
      SHORTTY_E2E: '1',
      SHORTTY_E2E_DIR: dir,
      HOME: home,
      PATH: bin,
      TMPDIR: tmp,
      LANG: 'en_US.UTF-8',
      USER: process.env.USER ?? 'shortty',
    },
  };
}

interface E2EControls {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  openPreferences: () => void;
  isTrayVisible: () => boolean;
}
type E2EGlobal = typeof globalThis & { __shorttyE2E?: E2EControls };

export class Shortty {
  constructor(
    readonly app: ElectronApplication,
    readonly win: Page,
    readonly hermetic: HermeticEnv,
    readonly launchedAt: number,
    readonly readyAt: number,
  ) {}

  get search(): Locator {
    return this.win.getByRole('searchbox');
  }

  get results(): Locator {
    return this.win.getByRole('listbox', { name: 'Search results' });
  }

  get selected(): Locator {
    return this.win.locator('[role="option"][aria-selected="true"]');
  }

  get help(): Locator {
    return this.win.getByRole('dialog', { name: 'Keyboard shortcuts help' });
  }

  sectionHeader(title: string): Locator {
    return this.win.getByText(title, { exact: true });
  }

  /**
   * Show the launcher. Retried because the panel hides on blur and macOS may
   * hand focus back to the previously active app right after a hide.
   */
  async show(): Promise<void> {
    await expect(async () => {
      if (!(await this.isVisible())) {
        await this.app.evaluate(() => (globalThis as E2EGlobal).__shorttyE2E?.show());
      }
      await expect.poll(() => this.isVisible(), { timeout: 2_000 }).toBe(true);
      await expect(this.search).toBeFocused({ timeout: 2_000 });
    }).toPass({ timeout: 10_000 });
  }

  /**
   * Hide the launcher and wait until it is gone: the hide waits for the
   * renderer's exit animation, so an immediate show() would otherwise see a
   * still-visible window, skip, and then lose it to the delayed hide.
   */
  async hide(): Promise<void> {
    await this.app.evaluate(() => (globalThis as E2EGlobal).__shorttyE2E?.hide());
    await expect.poll(() => this.isVisible(), { timeout: 2_000 }).toBe(false);
  }

  async toggle(): Promise<void> {
    await this.app.evaluate(() => (globalThis as E2EGlobal).__shorttyE2E?.toggle());
  }

  async openPreferences(): Promise<void> {
    await this.app.evaluate(() => (globalThis as E2EGlobal).__shorttyE2E?.openPreferences());
  }

  /** Visibility of the launcher (the first window created). */
  isVisible(): Promise<boolean> {
    return this.app.evaluate(({ BrowserWindow }) => {
      const [main] = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id);
      return main?.isVisible() ?? false;
    });
  }

  bounds(): Promise<{ x: number; y: number; width: number; height: number }> {
    return this.app.evaluate(({ BrowserWindow }) => {
      const [main] = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id);
      return main.getBounds();
    });
  }

  clipboard(): Promise<string> {
    return this.app.evaluate(({ clipboard }) => clipboard.readText());
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.win.evaluate(
      ([k, v]) => window.electronAPI.setSetting(k as never, v),
      [key, value] as const,
    );
  }

  /** Press ArrowDown until the selected row contains `text`. */
  async selectRow(text: string | RegExp, maxSteps = 30): Promise<void> {
    for (let i = 0; i < maxSteps; i++) {
      const current = (await this.selected.count()) > 0 ? await this.selected.innerText() : '';
      if (typeof text === 'string' ? current.includes(text) : text.test(current)) return;
      await this.win.keyboard.press('ArrowDown');
    }
    throw new Error(`No row matching ${String(text)} after ${maxSteps} steps`);
  }
}

/** Launch the built app against a fresh hermetic environment. */
export async function launchShortty(
  settings: Record<string, unknown> = {},
  extraBins: Record<string, string> = {},
): Promise<Shortty> {
  if (!existsSync(MAIN_ENTRY)) {
    throw new Error(`${MAIN_ENTRY} missing: run \`make e2e\` (it builds first)`);
  }
  const hermetic = createHermeticEnv(settings, extraBins);
  const launchedAt = Date.now();
  const app = await electron.launch({ args: [ROOT], cwd: ROOT, env: hermetic.env });
  const win = await app.firstWindow();
  await expect
    .poll(() => app.evaluate(() => Boolean((globalThis as E2EGlobal).__shorttyE2E)), {
      timeout: 30_000,
    })
    .toBe(true);
  const readyAt = Date.now();
  await win.waitForLoadState('domcontentloaded');
  return new Shortty(app, win, hermetic, launchedAt, readyAt);
}

/** Wait until the commands engine finished enriching the fake PATH. */
export async function waitForEnrichment(shortty: Shortty): Promise<void> {
  await expect
    .poll(
      () =>
        shortty.win.evaluate(async () => {
          const s = await window.electronAPI.getCommandsStats();
          return s.total > 0 && !s.running && s.enriched === s.total;
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
}

/**
 * Physical-key events dispatched through CDP, so the produced character
 * (KeyboardEvent.key) can differ from the US position (KeyboardEvent.code),
 * as it does on non-US layouts.
 */
export async function pressLayoutKey(
  win: Page,
  key: { key: string; code: string; shift?: boolean; keyCode: number },
): Promise<void> {
  const cdp = await win.context().newCDPSession(win);
  const base = {
    key: key.key,
    code: key.code,
    windowsVirtualKeyCode: key.keyCode,
    modifiers: key.shift ? 8 : 0,
  };
  await cdp.send('Input.dispatchKeyEvent', {
    ...base,
    type: 'keyDown',
    text: key.key,
    unmodifiedText: key.key,
  });
  await cdp.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
  await cdp.detach();
}

/**
 * Mark the running test as a known bug (reported as "fixme", not run to the
 * end). Set SHORTTY_E2E_FIXME=1 to run these anyway and check a fix.
 * Kept while no test needs it: it is the documented convention (docs/runbooks/run-e2e-tests.md).
 * @public
 */
export function knownBug(reason: string): void {
  base.fixme(process.env.SHORTTY_E2E_FIXME !== '1', reason);
}

export const test = base.extend<{ shortty: Shortty }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
  shortty: async ({}, use) => {
    const shortty = await launchShortty();
    // Clipboard is the one shared OS resource we touch: restore it afterwards.
    const savedClipboard = await shortty.clipboard();
    await use(shortty);
    await shortty.app.evaluate(({ clipboard }, text) => clipboard.writeText(text), savedClipboard);
    await shortty.app.close();
    if (process.env.SHORTTY_E2E_KEEP !== '1') {
      rmSync(shortty.hermetic.dir, { recursive: true, force: true });
    }
  },
});

export { expect };
