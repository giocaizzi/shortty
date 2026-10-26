// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { KeyPlatform } from '../../src/shared/keys';
import { KeyCombo } from '../../src/renderer/components/KeyCombo';

describe('KeyCombo', () => {
  it('renders a single key', () => {
    render(<KeyCombo keys="⌘C" />);
    expect(screen.getByText('⌘C')).toBeInTheDocument();
  });

  it('renders multi-chord key with separator', () => {
    render(<KeyCombo keys="⌘K ⌘C" />);
    expect(screen.getByText('⌘K')).toBeInTheDocument();
    expect(screen.getByText('⌘C')).toBeInTheDocument();
    // middot separator between chords
    expect(screen.getByText('·')).toBeInTheDocument();
  });

  it('renders "unbound" when keys is empty string', () => {
    render(<KeyCombo keys="" />);
    expect(screen.getByText('unbound')).toBeInTheDocument();
  });

  it('renders "unbound" when keys is undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<KeyCombo keys={undefined as any} />);
    expect(screen.getByText('unbound')).toBeInTheDocument();
  });

  it('paints the separator and "unbound" with the theme tokens, not white', () => {
    const { container } = render(<><KeyCombo keys="⌘K ⌘C" /><KeyCombo keys="" /></>);
    expect(screen.getByText('·')).toHaveClass('text-fg-4');
    expect(screen.getByText('unbound')).toHaveClass('text-fg-4');
    expect(container.innerHTML).not.toMatch(/white/);
  });

  describe('without strokes, off macOS', () => {
    const setPlatform = (platform: KeyPlatform | undefined) => {
      window.electronAPI = (platform ? { platform } : undefined) as unknown as typeof window.electronAPI;
    };
    afterEach(() => setPlatform(undefined));

    it('turns the macOS glyphs into Linux key names', () => {
      setPlatform('linux');
      render(<KeyCombo keys="⌃⌥⇧⌘P ⌥Return ⌘↩ ⌫ Q" />);
      expect(screen.getByText('Ctrl+Alt+Shift+Super+P')).toBeInTheDocument();
      expect(screen.getByText('Alt+Enter')).toBeInTheDocument();
      expect(screen.getByText('Super+Enter')).toBeInTheDocument();
      expect(screen.getByText('Backspace')).toBeInTheDocument();
      expect(screen.getByText('Q')).toBeInTheDocument();
    });

    it('says Win on Windows', () => {
      setPlatform('win32');
      render(<KeyCombo keys="⌘⇧P" />);
      expect(screen.getByText('Shift+Win+P')).toBeInTheDocument();
    });

    it('keeps the glyphs on macOS', () => {
      setPlatform('darwin');
      render(<KeyCombo keys="⌘⇧P" />);
      expect(screen.getByText('⌘⇧P')).toBeInTheDocument();
    });
  });
});
