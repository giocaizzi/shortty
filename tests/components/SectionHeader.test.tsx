// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { SectionHeader } from '../../src/renderer/components/SectionHeader';

describe('SectionHeader', () => {
  it('renders title and count', () => {
    render(<SectionHeader title="Sources" count={3} />);
    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByText('3 sources')).toBeInTheDocument();
  });

  it('shows "Show all" button when totalCount exceeds count', () => {
    const onToggle = vi.fn();
    render(
      <SectionHeader
        title="Shortcuts"
        count={5}
        totalCount={20}
        onToggleShowAll={onToggle}
      />,
    );
    expect(screen.getByText('Show all 20')).toBeInTheDocument();
  });

  it('hides "Show all" button when showAll is true', () => {
    render(
      <SectionHeader
        title="Shortcuts"
        count={5}
        totalCount={20}
        showAll={true}
        onToggleShowAll={vi.fn()}
      />,
    );
    expect(screen.queryByText('Show all 20')).not.toBeInTheDocument();
  });
});
