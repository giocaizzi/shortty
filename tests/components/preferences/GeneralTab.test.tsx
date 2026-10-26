// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeneralTab } from '../../../src/renderer/preferences/components/GeneralTab';
import type { UpdateSetting } from '../../../src/renderer/preferences/hooks/useSettings';
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
    installMockApi({}, 'linux');
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

  it('writes when a reopened launcher starts blank', () => {
    const { onUpdate } = renderTab();
    fireEvent.click(screen.getByRole('radio', { name: 'After 90 s' }));
    expect(onUpdate).toHaveBeenCalledWith('resetLauncher', '90s');
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

  it('names the installed app in the reset command on macOS', () => {
    renderTab({ showDockIcon: false, showMenuBar: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Show in menu bar' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '/Applications/Shortty.app/Contents/MacOS/shortty --reset-settings',
    );
  });

  it('says system tray on Windows and names the Squirrel launcher in the reset command', () => {
    installMockApi({}, 'win32');
    const { onUpdate } = renderTab({ showMenuBar: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Show in system tray' }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Add a Shortty icon to the system tray.')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '%LOCALAPPDATA%\\shortty\\shortty.exe --reset-settings',
    );
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

    it('reports a registration error returned by the main process', async () => {
      const onUpdate = vi.fn(async () => ({
        success: false,
        error: 'Control+Alt+K is already in use or is not a valid shortcut',
      }));
      renderTab({}, onUpdate);
      const field = startRecording();
      fireEvent.keyDown(field, { key: 'k', code: 'KeyK', ctrlKey: true, altKey: true });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't register ⌃⌥K. Another app or a system shortcut already uses it. Shortty kept ⇧⌘Space.",
      );
      expect(field).toHaveTextContent('⇧⌘Space');
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

describe('GeneralTab updates row', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the version and status, and checks on demand', async () => {
    const { api } = installMockApi();
    renderTab();
    expect(await screen.findByText('Shortty 0.1.0')).toBeInTheDocument();
    expect(screen.getByText('Up to date.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check Now' }));
    expect(api.checkForUpdates).toHaveBeenCalled();
  });

  it('follows status pushes: available opens the download, ready restarts', async () => {
    const { api, emitUpdateStatus } = installMockApi();
    renderTab();
    await screen.findByText('Up to date.');

    act(() => emitUpdateStatus({ current: '0.1.0', state: 'available', version: '0.2.0' }));
    expect(screen.getByText('Version 0.2.0 is available.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download…' }));
    expect(api.installUpdate).toHaveBeenCalledTimes(1);

    act(() => emitUpdateStatus({ current: '0.1.0', state: 'ready', version: '0.2.0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart to Update' }));
    expect(api.installUpdate).toHaveBeenCalledTimes(2);
  });

  it('cannot check in development builds', async () => {
    const { api } = installMockApi();
    api.getUpdateStatus.mockResolvedValue({ current: '0.1.0', state: 'disabled' });
    renderTab();
    expect(await screen.findByRole('button', { name: 'Check Now' })).toBeDisabled();
  });

  it('offers the auto-update switch on a copy that can update itself', async () => {
    const { api } = installMockApi();
    api.getUpdateStatus.mockResolvedValue({ current: '0.1.0', state: 'up-to-date', canAutoUpdate: true });
    const { onUpdate } = renderTab();
    fireEvent.click(await screen.findByRole('switch', { name: 'Download updates automatically' }));
    expect(onUpdate).toHaveBeenCalledWith('autoUpdate', false);
    expect(screen.getByText('Updates install in the background and apply when you restart.')).toBeInTheDocument();
  });

  it.each([false, undefined])('notify only without the switch when canAutoUpdate is %s', async (canAutoUpdate) => {
    const { api } = installMockApi({}, 'darwin');
    api.getUpdateStatus.mockResolvedValue({ current: '0.1.0', state: 'up-to-date', canAutoUpdate });
    renderTab();
    expect(
      await screen.findByText(
        "This copy can't update itself. Shortty will tell you when a new version is out and link to the download.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Download updates automatically' })).not.toBeInTheDocument();
  });
});
