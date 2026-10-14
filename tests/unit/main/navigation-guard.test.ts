import { describe, it, expect, vi } from 'vitest';
import { pathToFileURL } from 'node:url';

vi.mock('../../../src/main/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { isAppUrl, guardWebContents } = await import('../../../src/main/navigation-guard');

const LAUNCHER = '/Applications/Shortty.app/Contents/Resources/app.asar/.vite/renderer/main_window/index.html';
const PREFS = '/Applications/Shortty.app/Contents/Resources/app.asar/.vite/renderer/preferences_window/preferences.html';
const prod = { devOrigins: [], files: [LAUNCHER, PREFS] };
const dev = { devOrigins: ['http://localhost:5173'], files: [] };

describe('isAppUrl', () => {
  it('allows the built entry points (query and hash ignored)', () => {
    expect(isAppUrl(pathToFileURL(LAUNCHER).href, prod)).toBe(true);
    expect(isAppUrl(`${pathToFileURL(PREFS).href}?x=1#tab`, prod)).toBe(true);
  });

  it('rejects other files, including dropped ones and traversal', () => {
    expect(isAppUrl('file:///Users/me/Downloads/evil.html', prod)).toBe(false);
    expect(isAppUrl(`${pathToFileURL(LAUNCHER).href}/../../../../evil.html`, prod)).toBe(false);
    expect(isAppUrl('file:///etc/passwd', prod)).toBe(false);
  });

  it('allows the dev server origin only in development', () => {
    expect(isAppUrl('http://localhost:5173/preferences.html', dev)).toBe(true);
    expect(isAppUrl('http://localhost:5173/preferences.html', prod)).toBe(false);
    expect(isAppUrl('http://localhost:5174/', dev)).toBe(false);
  });

  it('rejects remote and special schemes', () => {
    for (const url of ['https://example.com', 'javascript:alert(1)', 'data:text/html,hi', 'about:blank', 'not a url']) {
      expect(isAppUrl(url, prod)).toBe(false);
    }
  });
});

describe('guardWebContents', () => {
  function fakeContents() {
    const listeners = new Map<string, (event: { url: string; preventDefault: () => void }) => void>();
    let openHandler: ((d: { url: string }) => { action: string }) | undefined;
    return {
      on: (name: string, fn: (event: { url: string; preventDefault: () => void }) => void) => listeners.set(name, fn),
      setWindowOpenHandler: (fn: typeof openHandler) => (openHandler = fn),
      emit(name: string, url: string) {
        const preventDefault = vi.fn();
        listeners.get(name)?.({ url, preventDefault });
        return preventDefault;
      },
      open: (url: string) => openHandler?.({ url }),
    };
  }

  it('cancels foreign navigation and redirects, keeps the app pages, denies new windows', () => {
    const contents = fakeContents();
    guardWebContents(contents as never, prod);
    expect(contents.emit('will-frame-navigate', 'file:///tmp/dropped.html')).toHaveBeenCalled();
    expect(contents.emit('will-redirect', 'https://example.com')).toHaveBeenCalled();
    expect(contents.emit('will-frame-navigate', pathToFileURL(LAUNCHER).href)).not.toHaveBeenCalled();
    expect(contents.emit('will-attach-webview', 'file:///x')).toHaveBeenCalled();
    expect(contents.open('https://example.com')).toEqual({ action: 'deny' });
  });
});
