/**
 * Baseline benchmark: timings and screenshots of key states.
 * Skipped unless SHORTTY_E2E_BENCHMARK=<label> (run via `make e2e-benchmark`).
 * Writes docs/wip/benchmark/<label>-*.png and <label>-timings.json.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, launchShortty, waitForEnrichment, type Shortty } from './fixtures';

const LABEL = process.env.SHORTTY_E2E_BENCHMARK;
const OUT = path.resolve(__dirname, '../../docs/wip/benchmark');
const LAUNCHES = 3;

/** Set the search query from inside the renderer and time it until `selector` renders. */
function timeSearch(win: Page, query: string, selector: string): Promise<number> {
  return win.evaluate(
    ([q, sel]) =>
      new Promise<number>((resolve, reject) => {
        const input = document.querySelector<HTMLInputElement>('input[role="searchbox"]');
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (!input || !setValue) return reject(new Error('search input not found'));
        setValue.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const t0 = performance.now();
        setValue.call(input, q);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const poll = () => {
          if (document.querySelector(sel)) resolve(performance.now() - t0);
          else if (performance.now() - t0 > 5000) reject(new Error(`no ${sel} for "${q}"`));
          else requestAnimationFrame(poll);
        };
        poll();
      }),
    [query, selector] as const,
  );
}

async function closeAndClean(shortty: Shortty): Promise<void> {
  await shortty.app.close();
  rmSync(shortty.hermetic.dir, { recursive: true, force: true });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const BACKDROPS: Record<'dark' | 'light', string> = { dark: '#1f1f23', light: '#ececef' };

/**
 * The real panel is transparent with macOS vibrancy composited by the OS,
 * which page screenshots cannot capture (text on nothing). Paint an opaque
 * backdrop close to the vibrancy material, for readable screenshots only.
 */
async function snap(win: Page, name: string, scheme: 'dark' | 'light' = 'dark'): Promise<void> {
  await win.emulateMedia({ colorScheme: scheme });
  await win.evaluate((color) => {
    let style = document.getElementById('benchmark-backdrop');
    if (!style) {
      style = document.createElement('style');
      style.id = 'benchmark-backdrop';
      document.head.appendChild(style);
    }
    style.textContent = `html, body { background: ${color} !important; }`;
  }, BACKDROPS[scheme]);
  // Let the show animation (120ms) finish.
  await win.waitForTimeout(200);
  await win.screenshot({ path: path.join(OUT, `${LABEL}-${name}.png`) });
}

test.skip(!LABEL, 'set SHORTTY_E2E_BENCHMARK=<label> (make e2e-benchmark)');

test('baseline benchmark', async () => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });

  const startup: number[] = [];
  const enrichment: number[] = [];
  let shortty: Shortty | null = null;
  for (let i = 0; i < LAUNCHES; i++) {
    shortty = await launchShortty();
    startup.push(shortty.readyAt - shortty.launchedAt);
    await waitForEnrichment(shortty);
    enrichment.push(Date.now() - shortty.launchedAt);
    if (i < LAUNCHES - 1) await closeAndClean(shortty);
  }
  if (!shortty) throw new Error('no launch');
  const { win } = shortty;

  const counts = await win.evaluate(async () => ({
    sources: (await window.electronAPI.getSources()).length,
    shortcuts: (await window.electronAPI.getAllKeybindings()).length,
    commands: (await window.electronAPI.getAllCommands()).length,
  }));
  // The ">" queries below need prefix mode, whatever the default is.
  await shortty.setSetting('commandPrefixMode', true);

  const showStart = Date.now();
  await shortty.show();
  const showToFocused = Date.now() - showStart;
  await snap(win, '01-empty');

  const search: Record<string, number | string> = {};
  const queries: [string, string][] = [
    ['vs', '[data-testid="source-row"]'],
    ['toggle', '[data-testid="shortcut-row"]'],
    ['>gizmo', '[data-testid="command-row"]'],
  ];
  // Each run starts from a freshly shown (reset) panel.
  const fresh = async () => {
    await shortty.hide();
    await shortty.show();
  };
  for (const [query, selector] of queries) {
    try {
      const runs = [];
      for (let i = 0; i < 5; i++) {
        await fresh();
        runs.push(await timeSearch(win, query, selector));
      }
      search[query] = Number(median(runs).toFixed(1));
    } catch (err) {
      search[query] = `no result (${(err as Error).message})`;
    }
  }

  // Screenshots wait for the expanded window when results are expected.
  const settle = () => win.waitForTimeout(300);

  await fresh();
  await shortty.search.fill('toggle');
  await settle();
  await snap(win, '02-search-toggle');

  await fresh();
  await shortty.search.fill('vs');
  await expect(win.getByTestId('source-row')).toBeVisible();
  await settle();
  await snap(win, '03-search-vs');

  await win.keyboard.press('Enter');
  await shortty.search.fill('toggle');
  await settle();
  await snap(win, '04-drilled-vscode');

  await fresh();
  await win.keyboard.type('>gizmo');
  await expect(win.getByTestId('command-row').first()).toBeVisible();
  await settle();
  await snap(win, '05-command-prefix');

  await win.keyboard.press('Tab');
  await expect(win.getByTestId('flag-row').first()).toBeVisible();
  await settle();
  await snap(win, '06-command-detail');

  // States added with the launcher rework (WP-D/E).
  await fresh();
  await shortty.search.fill('vs');
  await expect(win.getByTestId('source-row')).toBeVisible();
  await win.keyboard.press('Enter');
  await settle();
  await snap(win, '08-drilled-all');

  await fresh();
  await shortty.search.fill('toggle');
  await settle();
  await snap(win, '09-search-toggle-light', 'light');

  await fresh();
  await win.keyboard.type('>gizmo');
  await win.keyboard.press('Tab');
  await expect(win.getByTestId('flag-row').first()).toBeVisible();
  await settle();
  await snap(win, '10-command-detail-light', 'light');

  await fresh();
  await shortty.search.fill('zzzqqq');
  await settle();
  await snap(win, '11-no-results');

  await fresh();
  await win.keyboard.press('?');
  await settle();
  await snap(win, '12-help');
  await snap(win, '13-help-light', 'light');
  await win.emulateMedia({ colorScheme: 'dark' });

  const opened = shortty.app.waitForEvent('window');
  await shortty.openPreferences();
  const prefs = await opened;
  await prefs.waitForLoadState('domcontentloaded');
  await prefs.waitForTimeout(500);
  await snap(prefs, '07-preferences');

  const timings = {
    label: LABEL,
    date: new Date().toISOString(),
    host: `${process.platform}-${process.arch}`,
    counts,
    startupMs: { runs: startup, median: median(startup) },
    startupToEnrichedMs: { runs: enrichment, median: median(enrichment) },
    showToFocusedMs: showToFocused,
    searchRenderMs: search,
  };
  writeFileSync(path.join(OUT, `${LABEL}-timings.json`), `${JSON.stringify(timings, null, 2)}\n`);
  console.log(JSON.stringify(timings, null, 2));

  await closeAndClean(shortty);
});
