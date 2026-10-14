// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import type { ElectronAPI } from '../../src/preload/preload';
import { SearchInput } from '../../src/renderer/components/SearchInput';

const defaultProps = {
  query: '',
  onChange: vi.fn(),
  navMode: 'flat' as const,
  onHelpToggle: vi.fn(),
};

describe('SearchInput', () => {
  beforeEach(() => {
    window.electronAPI = {
      onWindowShown: vi.fn(() => vi.fn()),
    } as unknown as ElectronAPI;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.electronAPI = undefined as unknown as ElectronAPI;
  });

  it('renders input with correct placeholder for flat mode', () => {
    render(<SearchInput {...defaultProps} />);
    expect(
      screen.getByPlaceholderText('Search shortcuts and commands...'),
    ).toBeInTheDocument();
  });

  it('renders input with source label placeholder for drilled-source mode', () => {
    render(
      <SearchInput
        {...defaultProps}
        navMode="drilled-source"
        sourceLabel="VS Code"
      />,
    );
    expect(
      screen.getByPlaceholderText('Search in VS Code...'),
    ).toBeInTheDocument();
  });

  it('shows ">" badge when commandPrefixActive is true', () => {
    render(<SearchInput {...defaultProps} commandPrefixActive query=">" />);
    expect(screen.getByText('>')).toBeInTheDocument();
  });

  it('renders breadcrumbs when provided in command-detail mode', () => {
    render(
      <SearchInput
        {...defaultProps}
        navMode="command-detail"
        breadcrumbs={['git', 'commit']}
      />,
    );
    expect(screen.getByText('git')).toBeInTheDocument();
    expect(screen.getByText('commit')).toBeInTheDocument();
  });

  it('calls onChange when input value changes', () => {
    const onChange = vi.fn();
    render(<SearchInput {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'test' } });
    expect(onChange).toHaveBeenCalledWith('test');
  });

  it('has correct ARIA attributes', () => {
    render(<SearchInput {...defaultProps} />);
    const input = screen.getByRole('searchbox');
    expect(input).toHaveAttribute('aria-label', 'Search shortcuts');
  });
});
