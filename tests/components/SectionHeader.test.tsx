// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { SectionHeader } from '../../src/renderer/components/SectionHeader';

describe('SectionHeader', () => {
  it('renders the title and the match count', () => {
    render(<SectionHeader title="Sources" count={1} />);
    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('1 sources')).not.toBeInTheDocument();
  });

  it('renders without a count', () => {
    const { container } = render(<SectionHeader title="Editing" />);
    expect(container.textContent).toBe('Editing');
  });
});
