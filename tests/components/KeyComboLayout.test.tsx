// @vitest-environment jsdom
import { render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { KeyCombo } from '../../src/renderer/components/KeyCombo';
import { refreshKeyboardLayout } from '../../src/renderer/lib/keyboard-layout';
import { layoutMapOf } from '../../src/renderer/lib/keyboard-layouts.data';

function setLayout(id: string | null) {
  Object.defineProperty(navigator, 'keyboard', {
    configurable: true,
    value: id === null ? undefined : { getLayoutMap: async () => layoutMapOf(id) },
  });
}

describe('KeyCombo with keyboard layouts', () => {
  afterEach(async () => {
    setLayout('us');
    await act(() => refreshKeyboardLayout());
    setLayout(null);
  });

  it('falls back to US labels when navigator.keyboard is unavailable', () => {
    setLayout(null);
    render(<KeyCombo keys="⌘[" strokes={[{ mods: ['cmd'], key: '[', code: 'BracketLeft' }]} />);
    expect(screen.getByText('⌘[')).toBeInTheDocument();
  });

  it('shows the Italian keycap for a physical key, with a hint', async () => {
    setLayout('it');
    render(<KeyCombo keys="⌘[" strokes={[{ mods: ['cmd'], key: '[', code: 'BracketLeft' }]} />);
    const kbd = await screen.findByText('⌘È');
    expect(kbd).toHaveAttribute('title', expect.stringContaining('“[” key of a US keyboard'));
    expect(kbd).toHaveAttribute('data-layout-hint');
  });

  it('keeps a character key and explains how to type it', async () => {
    setLayout('it');
    render(<KeyCombo keys="⌘[" strokes={[{ mods: ['cmd'], key: '[' }]} />);
    await waitFor(() => expect(screen.getByText('⌘[')).toHaveAttribute('title', 'Type “[” with ⌥È on your keyboard.'));
  });

  it('renders named keys as glyphs and chords as separate pills', () => {
    render(<KeyCombo keys="⌘K ⌘Return" strokes={[{ mods: ['cmd'], key: 'K' }, { mods: ['cmd'], key: 'Return' }]} />);
    expect(screen.getByText('⌘K')).toBeInTheDocument();
    expect(screen.getByText('⌘↩')).toBeInTheDocument();
    expect(screen.getByText('·')).toBeInTheDocument();
  });

  it('shows "unbound" for an empty stroke list', () => {
    render(<KeyCombo keys="" strokes={[]} />);
    expect(screen.getByText('unbound')).toBeInTheDocument();
  });
});
