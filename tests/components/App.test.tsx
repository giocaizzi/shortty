// @vitest-environment jsdom
import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import type { ElectronAPI } from '../../src/preload/preload';
import type { AppSettings } from '../../src/shared/settings';
import type { Command, SubcommandDetail } from '../../src/shared/types';
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

function setup(
  overrides: Partial<AppSettings> = {},
  commands: Command[] = COMMANDS,
  apiOverrides: Record<string, ReturnType<typeof vi.fn>> = {},
) {
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
    getAllCommands: vi.fn().mockResolvedValue(commands),
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
    ...apiOverrides,
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

describe('App typed drill-down (docs/spec.md §10.2)', () => {
  const sub = (name: string, description = '') => ({ name, description });
  const detail = (name: string, subs: string[] = [], flags: string[] = []): SubcommandDetail => ({
    name,
    description: `${name} help`,
    enrichment: 'full',
    subcommands: subs.map((s) => sub(`${name} ${s}`)),
    flags: flags.map((long) => ({ long, description: `${long} flag` })),
    arguments: [],
  });

  const GH = makeCommand({
    name: 'gh',
    description: 'GitHub CLI',
    bin: '/bin/gh',
    subcommands: [sub('gh auth', 'Authenticate'), sub('gh pr', 'Pull requests')],
  });
  const DRILL_COMMANDS = [
    GH,
    makeCommand({ name: 'gh-dash', description: 'Dashboard', bin: '/bin/gh-dash' }),
    makeCommand({
      name: 'git',
      bin: '/bin/git',
      subcommands: [sub('git commit', 'Record changes'), sub('git commit-tree', 'Create a tree')],
    }),
    makeCommand({ name: 'cloud', description: 'Cloud CLI', bin: '/bin/cloud', subcommands: [sub('cloud compute')] }),
  ];
  const DETAILS: Record<string, SubcommandDetail> = Object.fromEntries(
    [
      detail('gh auth', ['login', 'logout', 'status'], ['--hostname']),
      detail('gh pr', ['create', 'list']),
      detail('gh pr create', [], ['--title', '--body']),
      detail('git commit', [], ['--amend', '--all']),
      detail('cloud compute', ['instances']),
      detail('cloud compute instances', ['create', 'delete']),
      detail('cloud compute instances create', ['from-template'], ['--zone']),
      detail('cloud compute instances create from-template', [], ['--template']),
    ].map((d) => [d.name, d]),
  );

  /** Subcommand details answer at once unless held with `hold(name)`. */
  let held: Map<string, (() => void) | null>;
  const hold = (name: string) => held.set(name, null);
  async function release(name: string) {
    const go = held.get(name);
    held.delete(name);
    await act(async () => go?.());
  }

  let pushUpdate: (batch: Command[]) => void;

  function drillSetup(commands: Command[] = DRILL_COMMANDS) {
    held = new Map();
    pushUpdate = () => undefined;
    return setup({ commandPrefixMode: true }, commands, {
      getCommandDetail: vi.fn().mockResolvedValue(null),
      getSubcommandDetail: vi.fn((name: string) => {
        const answer = DETAILS[name] ?? { ...detail(name), enrichment: 'failed' as const };
        if (!held.has(name)) return Promise.resolve(answer);
        return new Promise((resolve) => held.set(name, () => resolve(answer)));
      }),
      onCommandsUpdate: vi.fn((cb: (batch: Command[]) => void) => {
        pushUpdate = cb;
        return vi.fn();
      }),
    });
  }

  /** Type `text` one keystroke at a time, as fast as events go. */
  function typeKeys(input: HTMLElement, text: string) {
    for (const ch of text) {
      fireEvent.change(input, { target: { value: (input as HTMLInputElement).value + ch } });
    }
  }

  const crumbs = () => screen.queryAllByTestId('breadcrumb').map((c) => c.textContent);
  const rowNames = (testId: string) =>
    screen.queryAllByTestId(testId).map((r) => r.querySelector('.font-mono')?.textContent);

  it('a trailing space drills; the last partial word filters', async () => {
    const input = drillSetup();
    await type(input, '>gh auth ');
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'auth']));
    expect(input).toHaveValue('');
    await waitFor(() =>
      expect(rowNames('subcommand-row')).toEqual(['gh auth login', 'gh auth logout', 'gh auth status']),
    );

    fireEvent.change(input, { target: { value: 'lo' } });
    expect(rowNames('subcommand-row')).toEqual(['gh auth login', 'gh auth logout']);
  });

  it('an exact, unambiguous last word drills without a space', async () => {
    const input = drillSetup();
    await type(input, '>gh auth');
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'auth']));
    expect(input).toHaveValue('');
  });

  it('an ambiguous exact word waits for the space; more letters keep filtering the parent', async () => {
    const input = drillSetup();
    await type(input, '>gh');
    // gh-dash also starts with "gh"
    expect(await screen.findAllByTestId('command-row')).toHaveLength(2);
    expect(crumbs()).toEqual([]);

    fireEvent.change(input, { target: { value: 'git commit' } });
    await waitFor(() => expect(crumbs()).toEqual(['git']));
    expect(input).toHaveValue('commit');
    expect(rowNames('subcommand-row')).toEqual(['git commit', 'git commit-tree']);

    fireEvent.change(input, { target: { value: 'commit-t' } });
    expect(crumbs()).toEqual(['git']);
    expect(rowNames('subcommand-row')).toEqual(['git commit-tree']);

    fireEvent.change(input, { target: { value: 'commit ' } });
    await waitFor(() => expect(crumbs()).toEqual(['git', 'commit']));
    expect(input).toHaveValue('');
  });

  it('Tab still drills into an ambiguous exact match', async () => {
    const input = drillSetup();
    await type(input, '>git commit');
    await waitFor(() => expect(crumbs()).toEqual(['git']));
    press(input, 'Tab');
    await waitFor(() => expect(crumbs()).toEqual(['git', 'commit']));
  });

  it('a word that is only a prefix filters the current level', async () => {
    const input = drillSetup();
    await type(input, '>gh au');
    await waitFor(() => expect(crumbs()).toEqual(['gh']));
    expect(input).toHaveValue('au');
    expect(rowNames('subcommand-row')).toEqual(['gh auth']);
  });

  it('words after the subcommand filter its flags', async () => {
    const input = drillSetup();
    await type(input, '>git commit --am');
    await waitFor(() => expect(crumbs()).toEqual(['git', 'commit']));
    expect(input).toHaveValue('--am');
    await waitFor(() => expect(rowNames('flag-row')).toEqual(['--amend']));
  });

  it('a pasted line resolves every level, 5 deep', async () => {
    const input = drillSetup();
    await type(input, '>cloud compute instances create from-template --tem');
    await waitFor(() =>
      expect(crumbs()).toEqual(['cloud', 'compute', 'instances', 'create', 'from-template']),
    );
    expect(input).toHaveValue('--tem');
    await waitFor(() => expect(rowNames('flag-row')).toEqual(['--template']));
  });

  it('fast typing ahead of the --help answers ends where a paste does', async () => {
    const input = drillSetup();
    hold('gh pr');
    hold('gh pr create');
    await type(input, '>');
    typeKeys(input, 'gh pr create --title');
    expect(crumbs()).toEqual(['gh', 'pr']);
    expect(input).toHaveValue('create --title');

    await release('gh pr');
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'pr', 'create']));
    expect(input).toHaveValue('--title');
    await release('gh pr create');
    await waitFor(() => expect(rowNames('flag-row')).toEqual(['--title']));
  });

  it('keeps resolving when a subcommand\'s details arrive later', async () => {
    const input = drillSetup();
    hold('gh pr');
    await type(input, '>gh pr create --t');
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'pr']));
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    typeKeys(input, 'i');
    await release('gh pr');
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'pr', 'create']));
    expect(input).toHaveValue('--ti');
  });

  it('enriches an unenriched command on demand, then resolves the typed words', async () => {
    const basic = { ...GH, enrichment: 'basic' as const, subcommands: [] };
    const input = drillSetup([basic, ...DRILL_COMMANDS.slice(1)]);
    await type(input, '>gh auth lo');
    await waitFor(() => expect(crumbs()).toEqual(['gh']));
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    await waitFor(() => expect(api.getCommandDetail).toHaveBeenCalledWith('gh'));

    act(() => pushUpdate([GH]));
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'auth']));
    expect(input).toHaveValue('lo');
  });

  it('an unknown word stays at the last resolved level and filters', async () => {
    const input = drillSetup();
    await type(input, '>gh nope auth');
    await waitFor(() => expect(crumbs()).toEqual(['gh']));
    expect(input).toHaveValue('nope auth');
    expect(screen.getByText(/No matches for/)).toBeInTheDocument();
  });

  it('Backspace on an empty filter pops a level and puts the word back; Esc does not re-drill', async () => {
    const input = drillSetup();
    await type(input, '>gh auth ');
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'auth']));

    press(input, 'Backspace');
    expect(crumbs()).toEqual(['gh']);
    expect(input).toHaveValue('auth');

    fireEvent.change(input, { target: { value: 'aut' } });
    expect(crumbs()).toEqual(['gh']);
    fireEvent.change(input, { target: { value: 'pr ' } });
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'pr']));

    press(input, 'Escape');
    expect(crumbs()).toEqual(['gh']);
    expect(input).toHaveValue('pr');
    press(input, 'Escape'); // clears "pr"
    press(input, 'Escape'); // back to the results
    expect(crumbs()).toEqual([]);
    // Restored after the ">" badge, and not drilled again
    expect(input).toHaveValue('gh');
    expect(screen.getAllByTestId('command-row').length).toBeGreaterThan(0);
  });

  it('a late answer for a level the user left does not win', async () => {
    const input = drillSetup();
    hold('gh pr');
    await type(input, '>gh pr ');
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'pr']));
    press(input, 'Backspace');
    fireEvent.change(input, { target: { value: 'auth ' } });
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'auth']));
    await release('gh pr');
    expect(crumbs()).toEqual(['gh', 'auth']);
    await waitFor(() =>
      expect(rowNames('subcommand-row')).toEqual(['gh auth login', 'gh auth logout', 'gh auth status']),
    );
  });

  it('waits for an IME composition to end before drilling', async () => {
    const input = drillSetup();
    await type(input, '>');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'gh auth ' } });
    await act(async () => {});
    expect(crumbs()).toEqual([]);
    fireEvent.compositionEnd(input);
    await waitFor(() => expect(crumbs()).toEqual(['gh', 'auth']));
  });

  it('Enter copies the full command path', async () => {
    const input = drillSetup();
    await type(input, '>gh auth lo');
    await waitFor(() => expect(rowNames('subcommand-row')).toEqual(['gh auth login', 'gh auth logout']));
    press(input, 'Enter');
    expect(writeText).toHaveBeenCalledWith('gh auth login');
  });
});
