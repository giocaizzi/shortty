/**
 * README screenshots: the launcher on tmux, vim and a real kubectl help.
 * Skipped unless SHORTTY_E2E_README=1 (run via `make readme-screenshots`).
 * Writes the raw captures to docs/assets/raw/readme-*.png; `make readme-images`
 * frames them into docs/assets.
 */
import path from 'node:path';
import { test, expect, launchShortty, screenshot, waitForEnrichment } from './fixtures';

const OUT = path.resolve(__dirname, '../../docs/assets/raw');
const FIXTURES = path.resolve(__dirname, '../../fixtures');

/** Real captured help, served by fake binaries on the hermetic PATH. */
const BINS = {
  kubectl: `case "$1" in get) cat '${FIXTURES}/commands/kubectl/get-help.txt' ;; *) cat '${FIXTURES}/commands/kubectl/help.txt' ;; esac`,
  tmux: `case "$*" in *list-keys*) cat '${FIXTURES}/tmux-list-keys-defaults.txt' ;; *) cat '${FIXTURES}/commands/tmux/help.txt' ;; esac`,
};

test.skip(process.env.SHORTTY_E2E_README !== '1', 'set SHORTTY_E2E_README=1 (make readme-screenshots)');

test('README screenshots', async () => {
  test.setTimeout(120_000);
  const shortty = await launchShortty({}, BINS);
  await waitForEnrichment(shortty);
  const { win } = shortty;
  const shot = async (name: string) => {
    await win.waitForTimeout(300);
    await screenshot(win, path.join(OUT, `readme-${name}.png`));
  };
  const fresh = async () => {
    await shortty.hide();
    await shortty.show();
  };

  await shortty.show();
  await shortty.search.fill('pane');
  await expect(win.getByTestId('shortcut-row').first()).toBeVisible();
  await shot('tmux');

  await fresh();
  await shortty.search.fill('vim');
  await expect(win.getByTestId('source-row').first()).toBeVisible();
  await win.keyboard.press('Enter');
  await shortty.search.fill('word');
  await shot('vim');

  await fresh();
  await win.keyboard.type('>kubectl get ');
  await expect(win.getByTestId('flag-row').first()).toBeVisible();
  await shot('kubectl');

  await shortty.app.close();
});
