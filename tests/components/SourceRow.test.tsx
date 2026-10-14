// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { SourceRow } from '../../src/renderer/components/SourceRow';

describe('SourceRow', () => {
  it('renders icon, label, and count', () => {
    render(
      <SourceRow icon="⌨️" label="VS Code" count={42} selected={false} dataIndex={0} />,
    );
    expect(screen.getByText('⌨️')).toBeInTheDocument();
    expect(screen.getByText('VS Code')).toBeInTheDocument();
    expect(screen.getByText('42 shortcuts')).toBeInTheDocument();
  });

  it('applies selected styling', () => {
    render(
      <SourceRow icon="⌨️" label="VS Code" count={42} selected={true} dataIndex={0} />,
    );
    const row = screen.getByRole('option');
    expect(row).toHaveAttribute('aria-selected', 'true');
  });
});
