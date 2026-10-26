// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchTab } from '../../../src/renderer/preferences/components/SearchTab';
import type { UpdateSetting } from '../../../src/renderer/preferences/hooks/useSettings';
import { DEFAULT_SETTINGS, type AppSettings } from '../../../src/shared/settings';

function setup(settings: AppSettings = DEFAULT_SETTINGS) {
  const onUpdate: UpdateSetting = vi.fn(async () => ({ success: true }));
  const view = render(<SearchTab settings={settings} onUpdate={onUpdate} />);
  const rerender = (next: AppSettings) => view.rerender(<SearchTab settings={next} onUpdate={onUpdate} />);
  const field = () => screen.getByRole('spinbutton', { name: 'Shortcuts' });
  return { onUpdate, rerender, field };
}

const withShortcutsLimit = (shortcuts: number): AppSettings => ({
  ...DEFAULT_SETTINGS,
  resultLimits: { ...DEFAULT_SETTINGS.resultLimits, shortcuts },
});

describe('SearchTab result limits', () => {
  it('follows a value changed elsewhere (another window, a broadcast)', () => {
    const { rerender, field } = setup(withShortcutsLimit(8));
    expect(field()).toHaveValue(8);
    rerender(withShortcutsLimit(12));
    expect(field()).toHaveValue(12);
  });

  it('a value changed elsewhere replaces an uncommitted draft', () => {
    const { rerender, field } = setup(withShortcutsLimit(8));
    fireEvent.change(field(), { target: { value: '20' } });
    rerender(withShortcutsLimit(12));
    expect(field()).toHaveValue(12);
  });

  it('keeps an uncommitted draft while other settings change', () => {
    const { rerender, field, onUpdate } = setup(withShortcutsLimit(8));
    fireEvent.change(field(), { target: { value: '20' } });
    rerender({ ...withShortcutsLimit(8), search: { ...DEFAULT_SETTINGS.search, threshold: 0.6 } });
    expect(field()).toHaveValue(20);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('commits on blur, clamped, and shows the clamped value', () => {
    const { field, onUpdate } = setup(withShortcutsLimit(8));
    fireEvent.change(field(), { target: { value: '99' } });
    fireEvent.blur(field());
    expect(field()).toHaveValue(50);
    expect(onUpdate).toHaveBeenCalledWith('resultLimits', { ...DEFAULT_SETTINGS.resultLimits, shortcuts: 50 });
  });

  it('puts the value back when the draft is not a number', () => {
    const { field, onUpdate } = setup(withShortcutsLimit(8));
    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.blur(field());
    expect(field()).toHaveValue(8);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
