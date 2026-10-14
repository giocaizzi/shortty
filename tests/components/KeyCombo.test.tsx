// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
});
