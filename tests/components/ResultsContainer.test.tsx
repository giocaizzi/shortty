// @vitest-environment jsdom
import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultsContainer } from '../../src/renderer/components/ResultsContainer';
import type { SearchResults } from '../../src/renderer/hooks/useSearch';
import { makeShortcut, makeCommand, makeParserMeta } from '../helpers';

const emptyResults: SearchResults = {
  sources: [],
  shortcuts: [],
  commands: [],
  totalShortcuts: 0,
  totalCommands: 0,
};

const populatedResults: SearchResults = {
  sources: [
    {
      meta: makeParserMeta(),
      count: 10,
    },
  ],
  shortcuts: [makeShortcut({ id: 'sc-1', key: '⌘S', searchKey: 'cmd s' })],
  commands: [makeCommand({ description: 'Version control' })],
  totalShortcuts: 1,
  totalCommands: 1,
};

describe('ResultsContainer', () => {
  it('returns null when results are empty', () => {
    const { container } = render(
      <ResultsContainer
        results={emptyResults}
        selectedIndex={0}
        copyFlashIndex={null}
        onToggleShowAll={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders all sections when data is present', () => {
    render(
      <ResultsContainer
        results={populatedResults}
        selectedIndex={0}
        copyFlashIndex={null}
        onToggleShowAll={vi.fn()}
      />,
    );
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByText('VS Code').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Save File')).toBeInTheDocument();
    expect(screen.getByText('git')).toBeInTheDocument();
  });

  it('renders correct ARIA roles on result items', () => {
    render(
      <ResultsContainer
        results={populatedResults}
        selectedIndex={0}
        copyFlashIndex={null}
        onToggleShowAll={vi.fn()}
      />,
    );
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
    expect(options[2]).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the correct item as selected', () => {
    render(
      <ResultsContainer
        results={populatedResults}
        selectedIndex={2}
        copyFlashIndex={null}
        onToggleShowAll={vi.fn()}
      />,
    );
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[2]).toHaveAttribute('aria-selected', 'true');
  });
});
