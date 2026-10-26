// @vitest-environment jsdom
// Typed drill-down (docs/spec.md §10.2) as main sees it: what the launcher
// shows after each event, and the window heights it asks main for. A typed or
// pasted line resolves while rendering, so the levels it passes through are
// never committed and main gets one resize, not one per passing state.
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ElectronAPI } from '../../src/preload/preload';
import type { Command, SubcommandDetail } from '../../src/shared/types';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { App } from '../../src/renderer/App';
import { SettingsProvider } from '../../src/renderer/context/SettingsContext';
import { makeCommand } from '../helpers';

// The launcher's heights (App.tsx): full, no results, bare search bar
const WINDOW_HEIGHT_EXPANDED = 580;
const WINDOW_HEIGHT_EMPTY_STATE = 180;
const WINDOW_HEIGHT_COLLAPSED = 72;

const sub = (name: string) => ({ name, description: '' });
const detail = (name: string, subs: string[] = [], flags: string[] = []): SubcommandDetail => ({
  name,
  description: `${name} help`,
  enrichment: 'full',
  subcommands: subs.map((s) => sub(`${name} ${s}`)),
  flags: flags.map((long) => ({ long, description: `${long} flag` })),
  arguments: [],
});

const GH = makeCommand({ name: 'gh', bin: '/bin/gh', subcommands: [sub('gh auth'), sub('gh pr')] });
const COMMANDS: Command[] = [
  GH,
  makeCommand({ name: 'gh-dash', bin: '/bin/gh-dash' }),
  makeCommand({ name: 'git', bin: '/bin/git', subcommands: [sub('git commit'), sub('git commit-tree')] }),
  makeCommand({ name: 'cloud', bin: '/bin/cloud', subcommands: [sub('cloud compute')] }),
];
const DETAILS: Record<string, SubcommandDetail> = Object.fromEntries(
  [
    detail('gh auth', ['login', 'logout', 'status'], ['--hostname']),
    detail('cloud compute', ['instances']),
    detail('cloud compute instances', ['create', 'delete']),
    detail('cloud compute instances create', ['from-template'], ['--zone']),
    detail('cloud compute instances create from-template', [], ['--template']),
  ].map((d) => [d.name, d]),
);

let pushUpdate: (batch: Command[]) => void = () => undefined;
let setWindowHeight: ReturnType<typeof vi.fn>;

function setup(commands: Command[] = COMMANDS) {
  setWindowHeight = vi.fn();
  const api = {
    getSources: vi.fn().mockResolvedValue([]),
    getAllKeybindings: vi.fn().mockResolvedValue([]),
    refreshKeybindings: vi.fn().mockResolvedValue([]),
    onKeybindingsUpdate: vi.fn(() => vi.fn()),
    onWindowShown: vi.fn(() => vi.fn()),
    getAllCommands: vi.fn().mockResolvedValue(commands),
    getCommandsStats: vi.fn().mockResolvedValue({ total: 4, enriched: 4, running: false }),
    onCommandsUpdate: vi.fn((cb: (batch: Command[]) => void) => {
      pushUpdate = cb;
      return vi.fn();
    }),
    getCommandDetail: vi.fn().mockResolvedValue(null),
    getSubcommandDetail: vi.fn((name: string) =>
      Promise.resolve(DETAILS[name] ?? { ...detail(name), enrichment: 'failed' as const }),
    ),
    getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, commandPrefixMode: true, dismissAfterCopy: false }),
    onSettingsChange: vi.fn(() => vi.fn()),
    setWindowHeight,
    hideWindow: vi.fn(),
    onWindowHidden: vi.fn(() => vi.fn()),
    onWindowWillHide: vi.fn(() => vi.fn()),
    getIcon: vi.fn().mockResolvedValue(null),
  };
  window.electronAPI = api as unknown as ElectronAPI;
  render(
    <SettingsProvider>
      <App />
    </SettingsProvider>,
  );
  return screen.getByRole('searchbox');
}

const crumbs = () => screen.queryAllByTestId('breadcrumb').map((c) => c.textContent);
const shown = (input: HTMLElement) => ({ value: (input as HTMLInputElement).value, crumbs: crumbs() });

/** Data and settings in, then ">" typed (the command prefix badge). */
async function ready(input: HTMLElement) {
  await waitFor(() => expect(window.electronAPI.getSettings).toHaveBeenCalled());
  await waitFor(() => expect(window.electronAPI.getAllCommands).toHaveBeenCalled());
  await act(async () => {});
  fireEvent.change(input, { target: { value: '>' } });
  expect(shown(input)).toEqual({ value: '', crumbs: [] });
  setWindowHeight.mockClear();
}

/** Heights sent to main since the last ready(). */
const heights = () => setWindowHeight.mock.calls.map(([h]) => h);

afterEach(() => {
  window.electronAPI = undefined as unknown as ElectronAPI;
});

describe('App typed drill-down: what main sees', () => {
  it('a paste that resolves two levels: one resize, straight to the full height', async () => {
    const input = setup();
    await ready(input);
    fireEvent.change(input, { target: { value: 'gh auth lo' } });
    expect(shown(input)).toEqual({ value: 'lo', crumbs: ['gh', 'auth'] });
    expect(heights()).toEqual([WINDOW_HEIGHT_EXPANDED]);
  });

  it('a paste that matches nothing at the top never asks for the no-results height', async () => {
    const input = setup();
    await ready(input);
    fireEvent.change(input, { target: { value: 'gh nope auth' } });
    expect(shown(input)).toEqual({ value: 'nope auth', crumbs: ['gh'] });
    expect(screen.getByText(/No matches for/)).toBeInTheDocument();
    expect(heights()).toEqual([WINDOW_HEIGHT_EXPANDED]);
    expect(heights()).not.toContain(WINDOW_HEIGHT_EMPTY_STATE);
  });

  it('a paste 5 deep: one resize while each level\'s --help arrives', async () => {
    const input = setup();
    await ready(input);
    fireEvent.change(input, { target: { value: 'cloud compute instances create from-template --tem' } });
    expect(shown(input)).toEqual({ value: 'instances create from-template --tem', crumbs: ['cloud', 'compute'] });
    await waitFor(() =>
      expect(shown(input)).toEqual({
        value: '--tem',
        crumbs: ['cloud', 'compute', 'instances', 'create', 'from-template'],
      }),
    );
    // The last level's own --help answered too (nothing left in flight)
    await screen.findByText('--template flag');
    expect(heights()).toEqual([WINDOW_HEIGHT_EXPANDED]);
    expect(heights()).not.toContain(WINDOW_HEIGHT_COLLAPSED);
  });

  it('a paste into an unenriched command: one resize, then it resolves once enriched', async () => {
    const input = setup([{ ...GH, enrichment: 'basic', subcommands: [] }, ...COMMANDS.slice(1)]);
    await ready(input);
    fireEvent.change(input, { target: { value: 'gh auth lo' } });
    expect(shown(input)).toEqual({ value: 'auth lo', crumbs: ['gh'] });
    await waitFor(() => expect(window.electronAPI.getCommandDetail).toHaveBeenCalledWith('gh'));

    act(() => pushUpdate([GH]));
    expect(shown(input)).toEqual({ value: 'lo', crumbs: ['gh', 'auth'] });
    expect(heights()).toEqual([WINDOW_HEIGHT_EXPANDED]);
  });

  it('typing shows each keystroke on the level it resolves to', async () => {
    const input = setup();
    await ready(input);
    const seen: ReturnType<typeof shown>[] = [];
    for (const ch of 'gh auth lo') {
      fireEvent.change(input, { target: { value: (input as HTMLInputElement).value + ch } });
      seen.push(shown(input));
    }
    expect(seen).toEqual([
      { value: 'g', crumbs: [] },
      { value: 'gh', crumbs: [] }, // gh-dash also starts with "gh": wait for the space
      { value: '', crumbs: ['gh'] },
      { value: 'a', crumbs: ['gh'] },
      { value: 'au', crumbs: ['gh'] },
      { value: 'aut', crumbs: ['gh'] },
      { value: '', crumbs: ['gh', 'auth'] }, // "auth" is exact and unambiguous
      { value: '', crumbs: ['gh', 'auth'] }, // a filter never starts with a space
      { value: 'l', crumbs: ['gh', 'auth'] },
      { value: 'lo', crumbs: ['gh', 'auth'] },
    ]);
    expect(heights()).toEqual([WINDOW_HEIGHT_EXPANDED]);
  });
});
