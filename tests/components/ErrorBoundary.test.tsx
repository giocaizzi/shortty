// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../../src/renderer/components/ErrorBoundary';

function ThrowingChild(): never {
  throw new Error('test error');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>Hello</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('shows default error message when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(
      screen.getByText('Something went wrong. Press Cmd+Shift+Space to reopen.'),
    ).toBeInTheDocument();
  });

  it('shows custom fallback when provided and child throws', () => {
    render(
      <ErrorBoundary fallback={<p>Custom fallback</p>}>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(
      screen.queryByText('Something went wrong. Press Cmd+Shift+Space to reopen.'),
    ).not.toBeInTheDocument();
  });

  it('calls console.error when error is caught', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      '[ErrorBoundary]',
      expect.any(Error),
      expect.any(String),
    );
  });
});
