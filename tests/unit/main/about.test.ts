import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getVersion: () => '0.2.1' }, shell: { openExternal: vi.fn() } }));
vi.mock('../../../src/main/logger', () => ({ default: { info: vi.fn(), warn: vi.fn() } }));

const { aboutLinkUrl, appInfo } = await import('../../../src/main/about');

describe('aboutLinkUrl', () => {
  it('maps the fixed links to the repo', () => {
    expect(aboutLinkUrl('releaseNotes', '0.2.1')).toBe('https://github.com/giocaizzi/shortty/releases/tag/v0.2.1');
    expect(aboutLinkUrl('issues', '0.2.1')).toBe('https://github.com/giocaizzi/shortty/issues/new');
  });

  it('opens nothing for anything else the renderer sends', () => {
    expect(aboutLinkUrl('https://evil.example', '0.2.1')).toBeNull();
    expect(aboutLinkUrl(undefined, '0.2.1')).toBeNull();
  });
});

describe('appInfo', () => {
  it('names the OS', () => {
    expect(appInfo('win32').os).toMatch(/^Windows /);
    expect(appInfo('linux')).toMatchObject({ version: '0.2.1', platform: 'linux' });
  });
});
