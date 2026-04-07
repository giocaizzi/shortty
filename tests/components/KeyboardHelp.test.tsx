// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyboardHelp } from '../../src/renderer/components/KeyboardHelp';

describe('KeyboardHelp', () => {
  it('renders keyboard shortcuts', () => {
    render(<KeyboardHelp onDismiss={vi.fn()} />);
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Navigate results')).toBeInTheDocument();
  });

  it('calls onDismiss on keydown', () => {
    const onDismiss = vi.fn();
    render(<KeyboardHelp onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalled();
  });
});
