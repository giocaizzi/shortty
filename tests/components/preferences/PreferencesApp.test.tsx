// @vitest-environment jsdom
import { act, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreferencesApp } from '../../../src/renderer/preferences/PreferencesApp';
import { useSettings } from '../../../src/renderer/preferences/hooks/useSettings';
import { DEFAULT_SETTINGS } from '../../../src/shared/settings';
import { installMockApi } from './mockApi';

describe('useSettings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads settings and follows broadcasts', async () => {
    const { emit } = installMockApi({ theme: 'dark' });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings?.theme).toBe('dark'));

    act(() => emit({ ...DEFAULT_SETTINGS, theme: 'light' }));
    expect(result.current.settings?.theme).toBe('light');
  });

  it('passes refusals from the main process through', async () => {
    const { api } = installMockApi();
    api.setSetting.mockResolvedValue({ success: false, error: 'taken' });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.updateSetting('globalShortcut', 'Alt+Shift+K');
    });
    expect(outcome).toEqual({ success: false, error: 'taken' });
    expect(result.current.settings?.globalShortcut).toBe(DEFAULT_SETTINGS.globalShortcut);
  });

  it('round-trips a write through the store', async () => {
    const { api } = installMockApi();
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.updateSetting('resultLimits', {
        sources: 4,
        shortcuts: 12,
        commands: 6,
      });
    });
    expect(outcome).toEqual({ success: true });
    expect(api.setSetting).toHaveBeenCalledWith('resultLimits', {
      sources: 4,
      shortcuts: 12,
      commands: 6,
    });
    expect(result.current.settings?.resultLimits.shortcuts).toBe(12);
  });
});

describe('PreferencesApp', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens on General and switches sections from the sidebar', async () => {
    installMockApi();
    render(<PreferencesApp />);
    expect(await screen.findByRole('heading', { name: 'General', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'General' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('heading', { name: 'Search', level: 1 })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Search' }), { key: 'ArrowDown' });
    expect(screen.getByRole('heading', { name: 'Commands', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commands' })).toHaveFocus();
  });

  it('applies Search tab edits to the store', async () => {
    const { api } = installMockApi();
    render(<PreferencesApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'Search' }));

    fireEvent.click(screen.getByRole('switch', { name: 'Command prefix mode' }));
    await waitFor(() =>
      expect(api.setSetting).toHaveBeenCalledWith(
        'commandPrefixMode',
        !DEFAULT_SETTINGS.commandPrefixMode,
      ),
    );

    fireEvent.change(screen.getByRole('slider', { name: 'Fuzziness' }), {
      target: { value: '0.6' },
    });
    await waitFor(() =>
      expect(api.setSetting).toHaveBeenCalledWith('search', {
        ...DEFAULT_SETTINGS.search,
        threshold: 0.6,
      }),
    );

    const shortcuts = screen.getByRole('spinbutton', { name: 'Shortcuts' });
    fireEvent.change(shortcuts, { target: { value: '99' } });
    expect(api.setSetting).not.toHaveBeenCalledWith('resultLimits', expect.anything());
    fireEvent.blur(shortcuts);
    await waitFor(() =>
      expect(api.setSetting).toHaveBeenCalledWith('resultLimits', {
        ...DEFAULT_SETTINGS.resultLimits,
        shortcuts: 50,
      }),
    );
  });

  it('applies the Theme setting to the window', async () => {
    const { emit } = installMockApi({ theme: 'dark' });
    render(<PreferencesApp />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    act(() => emit({ ...DEFAULT_SETTINGS, theme: 'light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('shows enrichment progress on the Commands tab', async () => {
    const { api } = installMockApi();
    api.getCommandsStats.mockResolvedValue({ total: 4127, enriched: 3842, running: true });
    render(<PreferencesApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'Commands' }));
    expect(await screen.findByText('3,842 of 4,127 commands')).toBeInTheDocument();
    expect(screen.getByText('Running in background')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '93');
  });
});
