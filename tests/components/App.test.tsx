// @vitest-environment jsdom
import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import type { ElectronAPI } from '../../src/preload/preload';
import type { AppSettings } from '../../src/shared/settings';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { App } from '../../src/renderer/App';
import { SettingsProvider } from '../../src/renderer/context/SettingsContext';
import { formatKeyCombo } from '../../src/main/parsers/key-normalizer';
import { makeCommand, makeParserMeta, makeShortcut } from '../helpers';

const layoutState = vi.hoisted(() => ({ italian: false }));
vi.mock('../../src/renderer/lib/keyboard-layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/renderer/lib/keyboard-layout')>();
  const { layoutMapOf } = await import('../../src/renderer/lib/keyboard-layouts.data');
  const italian = actual.makeLayout(layoutMapOf('it'));
  return {
    ...actual,
    useKeyboardLayout: () => (layoutState.italian ? italian : actual.US_KEYBOARD),
  };
});

/** A shortcut bound to a physical key (code), like VS Code's [Semicolon]. */
function physicalShortcut(combo: string, code: string, command: string) {
  const n = formatKeyCombo(combo);
  return makeShortcut({
    id: `phys-${code}`,
    source: 'tmux',
    sourceLabel: 'tmux',
    command,
    rawCommand: command,
    key: n.displayKey,
    searchKey: n.searchKey,
    strokes: n.strokes.map((st) => ({ ...st, code })),
  });
}

const SOURCES = [
  makeParserMeta({ id: 'vscode', label: 'VS Code' }),
  makeParserMeta({ id: 'tmux', label: 'tmux' }),
];

const SHORTCUTS = [
  makeShortcut({ id: 'v1', command: 'Toggle Sidebar', key: '⌘B', rawCommand: 'sidebar', category: 'View' }),
  makeShortcut({ id: 'v2', command: 'Cut Line', key: '⌘X', rawCommand: 'cut', category: 'Editing' }),
  makeShortcut({ id: 'v3', command: 'Toggle Panel', key: '⌘J', rawCommand: 'panel', category: 'View' }),
  makeShortcut({ id: 'v4', command: 'Toggle Terminal', key: '⌃`', rawCommand: 'terminal', category: 'View' }),
  makeShortcut({
    id: 't1',
    source: 'tmux',
    sourceLabel: 'tmux',
    command: 'Toggle Zoom',
    key: '⌃B Z',
    rawCommand: 'resize-pane -Z',
  }),
  physicalShortcut('cmd+;', 'Semicolon', 'Jump Semicolon'),
];

const COMMANDS = [
  makeCommand({
    name: 'gizmo',
    description: 'Fake CLI',
    bin: '/bin/gizmo',
    enrichedFrom: 'help',
    subcommands: [{ name: 'gizmo build', description: 'Build it' }],
    flags: [{ short: '-v', long: '--verbose', description: 'Verbose' }],
  }),
  makeCommand({ name: 'gizmo-lite', description: 'Smaller fake CLI', bin: '/bin/gizmo-lite' }),
];

let shownListeners: (() => void)[] = [];
let hiddenListeners: (() => void)[] = [];
let willHide: (() => void | Promise<void>) | undefined;
let api: Record<string, ReturnType<typeof vi.fn>>;
const writeText = vi.fn();

function settingsWith(overrides: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    resultLimits: { sources: 3, shortcuts: 2, commands: 5 },
    commandPrefixMode: false,
    dismissAfterCopy: false,
    ...overrides,
  };
}

function setup(overrides: Partial<AppSettings> = {}) {
  shownListeners = [];
  hiddenListeners = [];
  willHide = undefined;
  api = {
    getSources: vi.fn().mockResolvedValue(SOURCES),
    getAllKeybindings: vi.fn().mockResolvedValue(SHORTCUTS),
    refreshKeybindings: vi.fn().mockResolvedValue(SHORTCUTS),
    onKeybindingsUpdate: vi.fn(() => vi.fn()),
    onWindowShown: vi.fn((cb: () => void) => {
      shownListeners.push(cb);
      return () => {
        shownListeners = shownListeners.filter((l) => l !== cb);
      };
    }),
    getAllCommands: vi.fn().mockResolvedValue(COMMANDS),
    getCommandsStats: vi.fn().mockResolvedValue({ total: 2, enriched: 2, running: false }),
    onCommandsUpdate: vi.fn(() => vi.fn()),
    getSubcommandDetail: vi.fn().mockResolvedValue(null),
    getSettings: vi.fn().mockResolvedValue(settingsWith(overrides)),
    onSettingsChange: vi.fn(() => vi.fn()),
    setWindowHeight: vi.fn(),
    hideWindow: vi.fn(),
    onWindowHidden: vi.fn((cb: () => void) => {
      hiddenListeners.push(cb);
      return vi.fn();
    }),
    onWindowWillHide: vi.fn((cb: () => void | Promise<void>) => {
      willHide = cb;
      return vi.fn();
    }),
  };
  window.electronAPI = api as unknown as ElectronAPI;
  render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  );
  return screen.getByRole('searchbox');
}

/** Wait until settings and data are in, then type `text`. */
async function type(input: HTMLElement, text: string) {
  await waitFor(() => expect(api.getAllKeybindings).toHaveBeenCalled());
  await waitFor(() => expect(api.getSettings).toHaveBeenCalled());
  await act(async () => {});
  fireEvent.change(input, { target: { value: text } });
}

function press(input: HTMLElement, key: string): boolean {
  return fireEvent.keyDown(input, { key });
}

function emitShown() {
  act(() => {
    for (const listener of [...shownListeners]) listener();
  });
}

function selectedRow() {
  return screen.getByRole('option', { selected: true });
}

beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  layoutState.italian = false;
});

afterEach(() => {
  window.electronAPI = undefined as unknown as ElectronAPI;
});

describe('App navigation', () => {
  it('drills into a source: every entry grouped by category, no source label; Esc restores', async () => {
    const input = setup();
    await type(input, 'vsc');
    const source = await screen.findByTestId('source-row');
    expect(source).toHaveAttribute('aria-selected', 'true');

    press(input, 'Enter');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Search in VS Code...');

    const list = screen.getByRole('listbox');
    expect(within(list).getAllByTestId('shortcut-row')).toHaveLength(4);
    expect(within(list).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      'View',
      'Editing',
    ]);
    expect(within(list).queryByText('VS Code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('source-row')).not.toBeInTheDocument();

    press(input, 'ArrowDown');
    press(input, 'Escape');
    expect(input).toHaveValue('vsc');
    expect(input).toHaveAttribute('placeholder', 'Search shortcuts and commands...');
    expect(selectedRow()).toHaveAttribute('data-testid', 'source-row');
  });

  it('"Show all" is a selectable row that expands its section on Enter', async () => {
    const input = setup();
    await type(input, 'toggle');
    await screen.findAllByTestId('shortcut-row');
    expect(screen.getAllByTestId('shortcut-row')).toHaveLength(2);

    press(input, 'ArrowDown');
    press(input, 'ArrowDown');
    expect(selectedRow()).toHaveTextContent('Show all 4 shortcuts');

    press(input, 'Enter');
    expect(screen.getAllByTestId('shortcut-row')).toHaveLength(4);
    expect(screen.queryByTestId('show-all-row')).not.toBeInTheDocument();
    expect(selectedRow()).toHaveAttribute('data-testid', 'shortcut-row');
  });

  it('arrow keys wrap across sections', async () => {
    const input = setup();
    await type(input, 'gizmo');
    await screen.findAllByTestId('command-row');
    const options = screen.getAllByRole('option');
    press(input, 'ArrowUp');
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');
    press(input, 'ArrowDown');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('prefix mode: plain queries show no commands, ">" shows only commands', async () => {
    const input = setup({ commandPrefixMode: true });
    await type(input, 'gizmo');
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
    expect(screen.queryByTestId('command-row')).not.toBeInTheDocument();
    expect(screen.getByText('Type > first to search commands')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '>gizmo' } });
    expect(await screen.findAllByTestId('command-row')).toHaveLength(2);
    expect(screen.queryByTestId('shortcut-row')).not.toBeInTheDocument();
  });

  it('unified mode: plain queries include commands', async () => {
    const input = setup({ commandPrefixMode: false });
    await type(input, 'gizmo');
    expect(await screen.findAllByTestId('command-row')).toHaveLength(2);
  });

  it('Tab drills into a command; Esc returns with the query and selection restored', async () => {
    const input = setup();
    await type(input, 'gizmo');
    await screen.findAllByTestId('command-row');
    press(input, 'ArrowDown');
    press(input, 'ArrowUp');
    expect(press(input, 'Tab')).toBe(false); // default prevented
    expect(input).toHaveAttribute('placeholder', 'Filter subcommands and flags...');
    expect(screen.getByTestId('subcommand-row')).toHaveTextContent('gizmo build');
    expect(screen.getByTestId('detail-source')).toHaveTextContent('Source: --help');

    press(input, 'Escape');
    expect(input).toHaveValue('gizmo');
    expect(selectedRow()).toHaveTextContent('gizmo');
  });

  it('Tab on a shortcut row keeps focus in the search field', async () => {
    const input = setup();
    await type(input, 'toggle sidebar');
    await screen.findAllByTestId('shortcut-row');
    expect(press(input, 'Tab')).toBe(false);
    expect(input).toHaveAttribute('placeholder', 'Search shortcuts and commands...');
  });
});

describe('App help, copy and dismiss', () => {
  it('"?" opens the help sheet without closing it on the same keystroke; any key closes it', async () => {
    const input = setup();
    await type(input, '');
    press(input, '?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts help' })).toBeInTheDocument();
    expect(api.setWindowHeight).toHaveBeenLastCalledWith(580);

    press(input, 'a');
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts help' })).not.toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('the ? button in the search bar toggles the help sheet', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts help' })).toBeInTheDocument();
  });

  it('Enter copies the key, flashes the row and reports it in the footer', async () => {
    const input = setup();
    await type(input, 'cut line');
    await screen.findAllByTestId('shortcut-row');
    press(input, 'Enter');
    expect(writeText).toHaveBeenCalledWith('⌘X');
    expect(selectedRow()).toHaveClass('copy-flash');
    expect(screen.getByTestId('panel-footer')).toHaveTextContent('Copied⌘X');
    await waitFor(() => expect(selectedRow()).not.toHaveClass('copy-flash'));
    expect(api.hideWindow).not.toHaveBeenCalled();
  });

  it('copies the key as labelled on the user\'s keyboard layout', async () => {
    layoutState.italian = true;
    const input = setup();
    await type(input, 'jump semicolon');
    await screen.findAllByTestId('shortcut-row');
    press(input, 'Enter');
    expect(writeText).toHaveBeenCalledWith('⌘Ò');
  });

  it('leaves keys to an IME composition: no copy, dismiss or selection move', async () => {
    const input = setup({ dismissAfterCopy: true });
    await type(input, 'toggle');
    await screen.findAllByTestId('shortcut-row');
    const selected = selectedRow();

    // Arrows pick a candidate and Enter / Esc commit or cancel the composition.
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab']) {
      expect(fireEvent.keyDown(input, { key, isComposing: true })).toBe(true);
    }
    // Safari/older Chromium report the committing keydown as keyCode 229.
    expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })).toBe(true);

    expect(writeText).not.toHaveBeenCalled();
    expect(api.hideWindow).not.toHaveBeenCalled();
    expect(selectedRow()).toBe(selected);
    expect(input).toHaveValue('toggle');
  });

  it('dismisses after the copy flash when "dismiss after copy" is on', async () => {
    const input = setup({ dismissAfterCopy: true });
    await type(input, 'cut line');
    await screen.findAllByTestId('shortcut-row');
    press(input, 'Enter');
    expect(api.hideWindow).not.toHaveBeenCalled();
    await waitFor(() => expect(api.hideWindow).toHaveBeenCalledOnce());
  });

  it('Esc on an empty query asks main to hide the window', async () => {
    const input = setup();
    await type(input, '');
    press(input, 'Escape');
    expect(api.hideWindow).toHaveBeenCalledOnce();
  });

  it('plays the exit animation before main hides the window', async () => {
    setup();
    await waitFor(() => expect(willHide).toBeDefined());
    let pending: void | Promise<void> = undefined;
    act(() => {
      pending = willHide?.();
    });
    expect(screen.getByRole('dialog', { name: /Shortty/ })).toHaveClass('panel-exit');
    await expect(pending).resolves.toBeUndefined();
  });
});

describe('App window lifecycle', () => {
  it('sizes the window: bar when blank, compact for no results, full for results', async () => {
    const input = setup();
    await type(input, '');
    expect(api.setWindowHeight).toHaveBeenLastCalledWith(72);
    fireEvent.change(input, { target: { value: 'zzzzqqq' } });
    expect(api.setWindowHeight).toHaveBeenLastCalledWith(180);
    expect(screen.getByText('No matches for “zzzzqqq”')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'toggle' } });
    expect(api.setWindowHeight).toHaveBeenLastCalledWith(580);
  });

  it('grows at once but shrinks once, after a burst of deletes settles', async () => {
    const input = setup();
    await type(input, 'toggle');
    expect(api.setWindowHeight).toHaveBeenLastCalledWith(580);
    api.setWindowHeight.mockClear();
    for (const value of ['toggl', 'zzzz', 'zzz', 'zz', 'z', '']) {
      fireEvent.change(input, { target: { value } });
    }
    expect(api.setWindowHeight).not.toHaveBeenCalled();
    await waitFor(() => expect(api.setWindowHeight).toHaveBeenCalledTimes(1));
    expect(api.setWindowHeight).toHaveBeenCalledWith(72);
  });

  it('resets the query when the window hides, so it never flashes on reopen', async () => {
    const input = setup();
    await type(input, 'toggle');
    await screen.findAllByTestId('shortcut-row');
    act(() => {
      for (const listener of [...hiddenListeners]) listener();
    });
    expect(input).toHaveValue('');
    expect(screen.queryByTestId('shortcut-row')).not.toBeInTheDocument();
  });

  it('resets everything on show, replays the show animation and does not refetch the data', async () => {
    const input = setup();
    await type(input, 'vsc');
    await screen.findByTestId('source-row');
    press(input, 'Enter');
    press(input, '?');

    const panel = screen.getByRole('dialog', { name: /Shortty/ });
    panel.classList.remove('panel-enter');
    emitShown();

    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', 'Search shortcuts and commands...');
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts help' })).not.toBeInTheDocument();
    expect(panel).toHaveClass('panel-enter');

    await waitFor(() => expect(api.getSources).toHaveBeenCalledTimes(2));
    expect(api.getAllKeybindings).toHaveBeenCalledOnce();
    expect(api.getAllCommands).toHaveBeenCalledOnce();
  });
});
