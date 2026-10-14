// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyboardHelp } from '../../src/renderer/components/KeyboardHelp';

describe('KeyboardHelp', () => {
  it('renders keyboard shortcuts', () => {
    render(<KeyboardHelp onDismiss={vi.fn()} />);
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Navigate results')).toBeInTheDocument();
  });

  it('lists the activation hotkey when given', () => {
    render(<KeyboardHelp onDismiss={vi.fn()} hotkey={['⌘', '⇧', 'Space']} />);
    expect(screen.getByText('Show or hide Shortty')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
  });

  it('does not listen to window keys itself (the panel closes it)', () => {
    const onDismiss = vi.fn();
    render(<KeyboardHelp onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('closes on a click outside the sheet', () => {
    const onDismiss = vi.fn();
    render(<KeyboardHelp onDismiss={onDismiss} />);
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onDismiss).toHaveBeenCalledOnce();
    fireEvent.mouseDown(screen.getByText('Navigate results'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
