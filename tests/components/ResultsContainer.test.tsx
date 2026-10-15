// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { ResultsContainer } from '../../src/renderer/components/ResultsContainer';
import {
  buildResultGroups,
  NONE_EXPANDED,
} from '../../src/renderer/components/result-rows';
import type { SearchResults } from '../../src/renderer/hooks/useSearch';
import { makeShortcut, makeCommand, makeParserMeta } from '../helpers';

const LIMITS = { sources: 3, shortcuts: 2, commands: 5 };

const populated: SearchResults = {
  sources: [{ meta: makeParserMeta(), count: 10 }],
  shortcuts: [
    makeShortcut({ id: 'a', command: 'Save File' }),
    makeShortcut({ id: 'b', command: 'Save As' }),
    makeShortcut({ id: 'c', command: 'Save All' }),
  ],
  commands: [makeCommand({ description: 'Version control' })],
};

function flatGroups(results: SearchResults, expanded = NONE_EXPANDED) {
  return buildResultGroups(results, { limits: LIMITS, expanded, drilled: false, query: 'save' });
}

describe('ResultsContainer', () => {
  it('renders nothing without groups', () => {
    const { container } = render(
      <ResultsContainer groups={[]} selectedIndex={0} copyFlashIndex={null} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders sections in order with their match counts', () => {
    render(<ResultsContainer groups={flatGroups(populated)} selectedIndex={0} copyFlashIndex={null} />);
    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Sources', 'Shortcuts', 'Commands']);
    expect(within(groups[1]).getByText('3')).toBeInTheDocument();
  });

  it('truncates a section with a selectable "Show all" row', () => {
    render(<ResultsContainer groups={flatGroups(populated)} selectedIndex={3} copyFlashIndex={null} />);
    expect(screen.getAllByTestId('shortcut-row')).toHaveLength(2);
    const showAll = screen.getByTestId('show-all-row');
    expect(showAll).toHaveTextContent('Show all 3 shortcuts');
    expect(showAll).toHaveAttribute('aria-selected', 'true');
    // source + 2 shortcuts + show-all + command
    expect(screen.getAllByRole('option')).toHaveLength(5);
  });

  it('shows every row of an expanded section', () => {
    render(
      <ResultsContainer
        groups={flatGroups(populated, { ...NONE_EXPANDED, shortcuts: true })}
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    expect(screen.getAllByTestId('shortcut-row')).toHaveLength(3);
    expect(screen.queryByTestId('show-all-row')).not.toBeInTheDocument();
  });

  it('hides the source label on rows when drilled', () => {
    const groups = buildResultGroups(
      { sources: [], shortcuts: populated.shortcuts, commands: [] },
      { limits: LIMITS, expanded: NONE_EXPANDED, drilled: true, query: '' },
    );
    render(<ResultsContainer groups={groups} selectedIndex={0} copyFlashIndex={null} drilled />);
    expect(screen.getAllByTestId('shortcut-row')).toHaveLength(3);
    expect(screen.queryByText('VS Code')).not.toBeInTheDocument();
  });

  it('marks the copy flash on the right row', () => {
    render(<ResultsContainer groups={flatGroups(populated)} selectedIndex={1} copyFlashIndex={1} />);
    expect(screen.getAllByRole('option')[1]).toHaveClass('copy-flash');
  });
});
