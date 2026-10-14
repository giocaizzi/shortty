// @vitest-environment jsdom
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SourcesTab, SOURCES_SETTLE_MS } from '../../../src/renderer/preferences/components/SourcesTab';
import type { UpdateSetting } from '../../../src/renderer/preferences/hooks/useSettings';
import { DEFAULT_SETTINGS, type AppSettings } from '../../../src/shared/settings';
import type { SourceStatus } from '../../../src/shared/types';
import { installMockApi, makeSource, nth } from './mockApi';

function setup(
  sources: SourceStatus[] = [makeSource()],
  settings: Partial<AppSettings> = {},
) {
  const mock = installMockApi(settings);
  mock.api.getAllSources.mockResolvedValue(sources);
  const onUpdate: UpdateSetting = vi.fn(async () => ({ success: true }));
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const view = render(<SourcesTab settings={merged} onUpdate={onUpdate} />);
  const rerender = (next: Partial<AppSettings>) =>
    view.rerender(<SourcesTab settings={{ ...merged, ...next }} onUpdate={onUpdate} />);
  return { ...mock, onUpdate, rerender };
}

async function customPathField() {
  return screen.findByLabelText('Custom path');
}

describe('SourcesTab', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists sources with their detection status', async () => {
    setup([
      makeSource(),
      makeSource({ id: 'vim', label: 'vim', detected: false, configPaths: ['/home/me/missing/.vimrc'] }),
      makeSource({ id: 'finder', label: 'Finder', hasParser: false, configPaths: [] }),
    ]);
    const cards = await screen.findAllByTestId('source-card');
    expect(cards).toHaveLength(3);
    expect(within(nth(cards, 0)).getByText('Detected')).toBeInTheDocument();
    expect(within(nth(cards, 1)).getByText('Not detected')).toBeInTheDocument();
    expect(within(nth(cards, 2)).getByText('Cheatsheet only')).toBeInTheDocument();
    expect(within(nth(cards, 2)).getByText(/no config file/)).toBeInTheDocument();
  });

  it('marks each config path as existing or missing', async () => {
    setup([
      makeSource({ configPaths: ['/home/me/.config/ghostty/config', '/home/me/missing/config'] }),
    ]);
    const paths = await screen.findAllByTestId('config-path');
    await waitFor(() => {
      expect(within(nth(paths, 0)).getByRole('img', { name: 'Exists' })).toBeInTheDocument();
      expect(within(nth(paths, 1)).getByRole('img', { name: 'Missing' })).toBeInTheDocument();
    });
  });

  it('saves a typed path once, on blur', async () => {
    const { onUpdate } = setup();
    const field = await customPathField();
    fireEvent.focus(field);
    for (const value of ['~', '~/g', '~/ghostty.conf']) {
      fireEvent.change(field, { target: { value } });
    }
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.blur(field);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('sourcePathOverrides', { ghostty: '~/ghostty.conf' });
  });

  it('saves once on Enter', async () => {
    const { onUpdate } = setup();
    const field = await customPathField();
    field.focus();
    fireEvent.change(field, { target: { value: '/etc/ghostty' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('sourcePathOverrides', { ghostty: '/etc/ghostty' });
  });

  it('discards the edit on Escape', async () => {
    const { onUpdate } = setup();
    const field = await customPathField();
    field.focus();
    fireEvent.change(field, { target: { value: '/tmp/nope' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(field).toHaveValue('');
  });

  it('does not create an override when nothing changed', async () => {
    const { onUpdate } = setup();
    const field = await customPathField();
    fireEvent.focus(field);
    fireEvent.blur(field);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('Reset removes the override immediately', async () => {
    const { onUpdate, rerender } = setup([makeSource()], {
      sourcePathOverrides: { ghostty: '/custom/ghostty', vim: '~/.vimrc2' },
    });
    const field = await customPathField();
    expect(field).toHaveValue('/custom/ghostty');

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('sourcePathOverrides', { vim: '~/.vimrc2' });
    expect(field).toHaveValue('');

    rerender({ sourcePathOverrides: { vim: '~/.vimrc2' } });
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
  });

  it('Browse saves the picked path', async () => {
    const { api, onUpdate } = setup();
    api.pickPath.mockResolvedValue('/Users/me/ghostty/config');
    await customPathField();
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('sourcePathOverrides', {
        ghostty: '/Users/me/ghostty/config',
      }),
    );
    expect(api.pickPath).toHaveBeenCalledWith('/home/me/.config/ghostty/config');
  });

  it('Browse does nothing when the dialog is cancelled', async () => {
    const { api, onUpdate } = setup();
    await customPathField();
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() => expect(api.pickPath).toHaveBeenCalled());
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('warns while the typed path does not exist', async () => {
    setup();
    const field = await customPathField();
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '/home/me/missing/file' } });
    expect(await screen.findByText(/Nothing exists at this path yet/)).toBeInTheDocument();
  });

  it('toggles a source through disabledParsers', async () => {
    const { onUpdate } = setup([makeSource()], { disabledParsers: ['vim'] });
    fireEvent.click(await screen.findByRole('switch', { name: 'Use Ghostty' }));
    expect(onUpdate).toHaveBeenCalledWith('disabledParsers', ['vim', 'ghostty']);
  });

  it('re-reads detection status after source settings change', async () => {
    vi.useFakeTimers();
    const { api, rerender } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SOURCES_SETTLE_MS);
    });
    const before = api.getAllSources.mock.calls.length;

    rerender({ sourcePathOverrides: { ghostty: '/custom' } });
    expect(api.getAllSources.mock.calls.length).toBe(before + 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SOURCES_SETTLE_MS);
    });
    expect(api.getAllSources.mock.calls.length).toBe(before + 2);
  });
});
