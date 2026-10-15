/**
 * Source and command icons (docs/spec.md §15): app icon autofound in the fake
 * HOME's Applications, brand glyphs, monogram fallback. With
 * SHORTTY_E2E_BENCHMARK=<label> it also writes docs/wip/benchmark/<label>-*.png.
 */
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, launchShortty, waitForEnrichment, type Shortty } from './fixtures';

const LABEL = process.env.SHORTTY_E2E_BENCHMARK;
const OUT = path.resolve(__dirname, '../../docs/wip/benchmark');
const CLIS = ['git', 'gh', 'docker', 'kubectl', 'terraform', 'node', 'brew', 'psql'];

async function snap(win: Page, name: string, scheme: 'dark' | 'light'): Promise<void> {
  if (!LABEL) return;
  mkdirSync(OUT, { recursive: true });
  await win.emulateMedia({ colorScheme: scheme });
  await win.addStyleTag({
    content: `html, body { background: ${scheme === 'dark' ? '#1f1f23' : '#ececef'} !important; }`,
  });
  await win.waitForTimeout(200);
  await win.screenshot({ path: path.join(OUT, `${LABEL}-${name}.png`) });
}

let shortty: Shortty;

test.beforeAll(async () => {
  const bins = Object.fromEntries(CLIS.map((c) => [c, `echo "usage: ${c} [options]"`]));
  shortty = await launchShortty({ dismissAfterCopy: false }, bins);
  await waitForEnrichment(shortty);
});

test.afterAll(async () => {
  await shortty.app.close();
  rmSync(shortty.hermetic.dir, { recursive: true, force: true });
});

test('sources show the autofound app icon, else a brand glyph, else the monogram', async () => {
  await shortty.show();
  const icon = (id: string) => shortty.win.locator(`[data-testid="source-row"] [data-source-icon="${id}"]`);

  await shortty.search.fill('chrome');
  // Google Chrome.app exists only in the fake HOME (fixtures.ts).
  const img = icon('chrome').locator('img');
  await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/);
  // Decoded, not blocked (the CSP must allow data: images).
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(64);
  await snap(shortty.win, 'app-icon', 'dark');

  await shortty.search.fill('tmux');
  await expect(icon('tmux')).toHaveAttribute('data-icon', 'brand');

  // VS Code is not installed in the fake HOME and has no glyph: monogram.
  await shortty.search.fill('vs code');
  await expect(icon('vscode')).toHaveAttribute('data-glyph', 'VS');

  // A query matching several sources, for the screenshots.
  await shortty.search.fill('s');
  await expect(shortty.win.getByTestId('source-row').nth(2)).toBeVisible();
  await snap(shortty.win, 'sources', 'dark');
  await snap(shortty.win, 'sources-light', 'light');
});

test('commands show their brand glyph', async () => {
  await shortty.show();
  await shortty.search.fill('');
  await shortty.win.keyboard.type('>');
  const rows = shortty.win.getByTestId('command-row');
  for (const [cmd, brand] of [['git', 'Git'], ['kubectl', 'Kubernetes'], ['docker', 'Docker']]) {
    await shortty.search.fill('');
    // A partial query: an exact command name drills straight into it.
    await shortty.win.keyboard.type(cmd.slice(0, -1));
    const row = rows.filter({ has: shortty.win.getByText(cmd, { exact: true }) });
    await expect(row.locator('[data-brand]')).toHaveAttribute('data-brand', brand);
  }
  await shortty.search.fill('');
  await shortty.win.keyboard.type('widgetct');
  await expect(rows.first().locator('[data-glyph=">_"]')).toBeVisible();
  // A broad query, for the screenshots.
  await shortty.search.fill('');
  await shortty.win.keyboard.type('e');
  await expect(rows.nth(3)).toBeVisible();
  await snap(shortty.win, 'commands', 'dark');
  await snap(shortty.win, 'commands-light', 'light');
});
