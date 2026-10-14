import { test, expect, pressLayoutKey, waitForEnrichment } from './fixtures';

// Shortcuts must follow the produced character (KeyboardEvent.key), not the
// physical key position (KeyboardEvent.code). On an Italian layout:
//   "?" is Shift + the key right of 0 (code "Minus")
//   ">" is Shift + the key left of Z (code "IntlBackslash")
//   Shift + code "Slash" (US "?") produces "_"
const IT = {
  question: { key: '?', code: 'Minus', shift: true, keyCode: 219 },
  greater: { key: '>', code: 'IntlBackslash', shift: true, keyCode: 226 },
  underscore: { key: '_', code: 'Slash', shift: true, keyCode: 189 },
};
const US = {
  question: { key: '?', code: 'Slash', shift: true, keyCode: 191 },
  greater: { key: '>', code: 'Period', shift: true, keyCode: 190 },
};

test.describe('keyboard layouts', () => {
  for (const [layout, keys] of [['US', US], ['Italian', IT]] as const) {
    test(`${layout}: "?" is intercepted as the help key`, async ({ shortty }) => {
      await shortty.show();
      await pressLayoutKey(shortty.win, keys.question);
      // Only the help handler preventDefaults "?" on an empty query; the
      // overlay itself is covered (as a known bug) in launcher.spec.ts.
      await expect(shortty.search).toHaveValue('');
    });

    test(`${layout}: ">" enters command prefix mode`, async ({ shortty }) => {
      await waitForEnrichment(shortty);
      await shortty.show();
      await pressLayoutKey(shortty.win, keys.greater);
      await expect(shortty.search).toHaveValue('');
      await shortty.win.keyboard.type('widget');
      await expect(shortty.win.getByTestId('command-row')).toHaveCount(1);
      await expect(shortty.win.getByTestId('source-row')).toHaveCount(0);
    });
  }

  test('Italian: the US "?" key position types "_" and does not open help', async ({ shortty }) => {
    await shortty.show();
    await pressLayoutKey(shortty.win, IT.underscore);
    await expect(shortty.help).toHaveCount(0);
    await expect(shortty.search).toHaveValue('_');
  });
});
