/**
 * The command detail view's extra sections (docs/screens.md §2.3): flag
 * groups, default / choices / required / deprecated badges, examples,
 * environment variables, aliases and see-also links, from a fake cobra-style
 * CLI. Set SHORTTY_E2E_SHOTS=<dir> to also save light and dark screenshots.
 */
import { rmSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test as base, expect, launchShortty, waitForEnrichment, type Shortty } from './fixtures';

const CLOUDCTL_HELP = `Manage fake cloud resources from the command line.

USAGE
  cloudctl <command> [flags]

CORE COMMANDS
  deploy:      Deploy an application
  instances:   Manage virtual machine instances

ADDITIONAL COMMANDS
  completion:  Generate shell completion scripts
  legacy:      (DEPRECATED) Old deployment flow

FLAGS
  -o, --output string   Output format: {json|yaml|table} (default "table")
  -r, --region string   Region to use (default "eu-west-1")
      --name string     Name of the resource (required)
      --old-api         Use the old API (deprecated)

INHERITED FLAGS
      --help      Show help for command
  -q, --quiet     Suppress output

EXAMPLES
  # Deploy the current directory
  $ cloudctl deploy --region us-east-1

  # List instances as JSON
  $ cloudctl instances list -o json

ENVIRONMENT
  CLOUDCTL_TOKEN    Authentication token used for every request
  CLOUDCTL_REGION   Default region when --region is not given

LEARN MORE
  Read the manual at https://example.com/cloudctl
`;

const CLOUDCTL_DEPLOY_HELP = `Deploy an application to the fake cloud.

USAGE
  cloudctl deploy [flags]

ALIASES
  cloudctl ship

FLAGS
  -r, --region string   Region to use (default "eu-west-1")
`;

const CLOUDCTL = `case "$1" in
  deploy) cat <<'EOF'
${CLOUDCTL_DEPLOY_HELP}EOF
  ;;
  *) cat <<'EOF'
${CLOUDCTL_HELP}EOF
  ;;
esac`;

const test = base.extend<{ cloud: Shortty }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
  cloud: async ({}, use) => {
    const shortty = await launchShortty({}, { cloudctl: CLOUDCTL });
    // Clipboard is shared with the OS: restore it afterwards (as fixtures.ts does)
    const savedClipboard = await shortty.clipboard();
    await use(shortty);
    await shortty.app.evaluate(({ clipboard }, text) => clipboard.writeText(text), savedClipboard);
    await shortty.app.close();
    rmSync(shortty.hermetic.dir, { recursive: true, force: true });
  },
});

const BACKDROPS = { dark: '#1f1f23', light: '#ececef' } as const;

async function snap(win: Page, name: string): Promise<void> {
  const dir = process.env.SHORTTY_E2E_SHOTS;
  if (!dir) return;
  for (const scheme of ['light', 'dark'] as const) {
    await win.emulateMedia({ colorScheme: scheme });
    // The real panel is transparent over macOS vibrancy: paint a backdrop for readable shots
    await win.evaluate((color) => {
      let style = document.getElementById('shot-backdrop');
      if (!style) {
        style = document.createElement('style');
        style.id = 'shot-backdrop';
        document.head.appendChild(style);
      }
      style.textContent = `html, body { background: ${color} !important; }`;
    }, BACKDROPS[scheme]);
    await win.waitForTimeout(250);
    await win.screenshot({ path: path.join(dir, `${name}-${scheme}.png`) });
  }
}

test.describe('command detail sections', () => {
  test.beforeEach(async ({ cloud }) => {
    await waitForEnrichment(cloud);
    await cloud.setSetting('dismissAfterCopy', false);
    await cloud.show();
    await cloud.win.keyboard.type('>cloudctl');
    await cloud.win.keyboard.press('Tab');
  });

  test('groups, badges, examples and environment', async ({ cloud }) => {
    const { win } = cloud;
    await expect(cloud.sectionHeader('Core commands')).toBeVisible();
    await expect(cloud.sectionHeader('Additional commands')).toBeVisible();
    await expect(cloud.sectionHeader('Examples')).toBeVisible();
    await expect(cloud.sectionHeader('Inherited flags')).toBeVisible();
    await expect(cloud.sectionHeader('Environment')).toBeVisible();

    const output = win.getByTestId('flag-row').filter({ hasText: '--output' });
    await expect(output).toContainText('= table');
    await expect(output).toContainText('json | yaml | table');
    await expect(win.getByTestId('flag-row').filter({ hasText: '--name' })).toContainText('required');
    await expect(win.getByTestId('flag-row').filter({ hasText: '--old-api' })).toContainText('deprecated');
    await expect(win.getByTestId('subcommand-row').filter({ hasText: 'legacy' })).toContainText('deprecated');
    await expect(win.getByTestId('example-row').first()).toContainText('Deploy the current directory');
    await expect(win.getByTestId('env-row').first()).toContainText('CLOUDCTL_TOKEN');
    await expect(win.getByTestId('detail-see-also')).toContainText('https://example.com/cloudctl');
    await snap(win, 'cli-full-detail');

    // Scroll to the bottom for the second half of the view
    await win.locator('[data-scroll]').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await snap(win, 'cli-full-detail-bottom');
  });

  test('Enter on an example copies its command', async ({ cloud }) => {
    await cloud.selectRow(/Deploy the current directory/);
    await cloud.win.keyboard.press('Enter');
    await expect.poll(() => cloud.clipboard()).toBe('cloudctl deploy --region us-east-1');
  });

  test('a subcommand shows its aliases', async ({ cloud }) => {
    await cloud.selectRow(/cloudctl deploy/);
    await cloud.win.keyboard.press('Tab');
    await expect(cloud.win.getByTestId('detail-aliases')).toContainText('cloudctl ship');
    await snap(cloud.win, 'cli-full-subcommand');
  });
});
