// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeneralTab } from '../../../src/renderer/preferences/components/GeneralTab';
import { NOT_APPLIED, type UpdateSetting } from '../../../src/renderer/preferences/hooks/useSettings';
import { DEFAULT_SETTINGS, type AppSettings } from '../../../src/shared/settings';
import { installMockApi } from './mockApi';

const PREFS_DIR = path.resolve(__dirname, '../../../src/renderer/preferences');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

function setPlatform(platform: string) {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
}

function renderTab(
  settings: Partial<AppSettings> = {},
  onUpdate: UpdateSetting = vi.fn(async () => ({ success: true })),
) {
  const merged = { ...DEFAULT_SETTINGS, launchAtLogin: false, ...settings };
  render(<GeneralTab settings={merged} onUpdate={onUpdate} />);
  return { onUpdate };
}

function startRecording() {
  const field = screen.getByTestId('shortcut-recorder');
  fireEvent.click(field);
  return field;
}

describe('GeneralTab', () => {
  beforeEach(() => {
    installMockApi();
    setPlatform('MacIntel');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never reads Node globals in the isolated renderer', () => {
    for (const file of sourceFiles(PREFS_DIR)) {
      expect(readFileSync(file, 'utf8'), path.relative(PREFS_DIR, file)).not.toMatch(
        /\bprocess\.(platform|env|versions)/,
      );
    }
  });

  it('shows the Dock toggle on macOS only', () => {
    renderTab();
    expect(screen.getByRole('switch', { name: 'Show in Dock' })).toBeInTheDocument();
  });

  it('hides the Dock toggle elsewhere', () => {
    setPlatform('Linux x86_64');
    renderTab();
    expect(screen.queryByRole('switch', { name: 'Show in Dock' })).not.toBeInTheDocument();
  });

  it('writes each switch to its setting', () => {
    const { onUpdate } = renderTab();
    fireEvent.click(screen.getByRole('switch', { name: 'Launch at login' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Hide after copying' }));
    expect(onUpdate).toHaveBeenCalledWith('launchAtLogin', true);
    expect(onUpdate).toHaveBeenCalledWith('dismissAfterCopy', false);
  });

  it('writes window position and appearance', () => {
    const { onUpdate } = renderTab();
    fireEvent.click(screen.getByRole('radio', { name: 'Near Cursor' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(onUpdate).toHaveBeenCalledWith('windowPosition', 'mouse');
    expect(onUpdate).toHaveBeenCalledWith('theme', 'dark');
  });

  it('asks before hiding both the Dock and menu bar icons', () => {
    const { onUpdate } = renderTab({ showDockIcon: false, showMenuBar: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Show in menu bar' }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      "You'll only be able to open Shortty with the keyboard shortcut",
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide Icon' }));
    expect(onUpdate).toHaveBeenCalledWith('showMenuBar', false);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps the icon when the confirmation is cancelled', () => {
    const { onUpdate } = renderTab({ showDockIcon: false, showMenuBar: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Show in menu bar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  describe('shortcut recorder', () => {
    it('shows the current shortcut as macOS keycaps', () => {
      renderTab();
      expect(screen.getByTestId('shortcut-recorder')).toHaveTextContent('⇧⌘Space');
    });

    it('records Option+Shift+K by physical key on an Italian layout', async () => {
      const { onUpdate } = renderTab();
      const field = startRecording();
      expect(field).toHaveTextContent('Type shortcut');

      fireEvent.keyDown(field, { key: 'Alt', code: 'AltLeft', altKey: true });
      expect(field).toHaveTextContent('⌥');
      fireEvent.keyDown(field, { key: 'Ò', code: 'KeyK', altKey: true, shiftKey: true });

      await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('globalShortcut', 'Alt+Shift+K'));
    });

    it('records Control and Command as different modifiers', async () => {
      const { onUpdate } = renderTab();
      const field = startRecording();
      fireEvent.keyDown(field, { key: ' ', code: 'Space', ctrlKey: true, shiftKey: true });
      await waitFor(() =>
        expect(onUpdate).toHaveBeenCalledWith('globalShortcut', 'Control+Shift+Space'),
      );
    });

    it('rejects a key without modifiers', () => {
      const { onUpdate } = renderTab();
      const field = startRecording();
      fireEvent.keyDown(field, { key: 'k', code: 'KeyK' });
      expect(screen.getByRole('alert')).toHaveTextContent('Include ⌘, ⌃ or ⌥');
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('rejects shortcuts reserved by macOS', () => {
      const { onUpdate } = renderTab();
      const field = startRecording();
      fireEvent.keyDown(field, { key: ' ', code: 'Space', metaKey: true });
      expect(screen.getByRole('alert')).toHaveTextContent('macOS uses ⌘Space for Spotlight');
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('cancels on Escape', () => {
      const { onUpdate } = renderTab();
      const field = startRecording();
      fireEvent.keyDown(field, { key: 'Escape', code: 'Escape' });
      expect(field).toHaveTextContent('⇧⌘Space');
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it('reports a shortcut the system refused to register', async () => {
      const onUpdate = vi.fn(async () => ({ success: false, error: NOT_APPLIED }));
      renderTab({}, onUpdate);
      const field = startRecording();
      fireEvent.keyDown(field, { key: 'k', code: 'KeyK', ctrlKey: true, altKey: true });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't register ⌃⌥K. Another app or a system shortcut already uses it. Shortty kept ⇧⌘Space.",
      );
    });

    it('offers to restore the default shortcut', async () => {
      const { onUpdate } = renderTab({ globalShortcut: 'Alt+Shift+K' });
      fireEvent.click(screen.getByRole('button', { name: 'Restore Default' }));
      await waitFor(() =>
        expect(onUpdate).toHaveBeenCalledWith('globalShortcut', DEFAULT_SETTINGS.globalShortcut),
      );
    });
  });
});
