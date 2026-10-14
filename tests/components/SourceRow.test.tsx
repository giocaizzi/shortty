// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { SourceRow } from '../../src/renderer/components/SourceRow';

describe('SourceRow', () => {
  it('renders the source tile, label and count', () => {
    const { container } = render(
      <SourceRow sourceId="vscode" label="VS Code" count={42} selected={false} dataIndex={0} />,
    );
    expect(container.querySelector('[data-source-icon="vscode"]')).toHaveAttribute('data-glyph', 'VS');
    expect(screen.getByText('VS Code')).toBeInTheDocument();
    expect(screen.getByText('42 shortcuts')).toBeInTheDocument();
  });

  it('pluralizes a single shortcut', () => {
    render(<SourceRow sourceId="tmux" label="tmux" count={1} selected={false} dataIndex={0} />);
    expect(screen.getByText('1 shortcut')).toBeInTheDocument();
  });

  it('falls back to a monogram for unknown sources', () => {
    const { container } = render(
      <SourceRow sourceId="kitty" label="kitty" count={3} selected={false} dataIndex={0} />,
    );
    expect(container.querySelector('[data-source-icon="kitty"]')).toHaveAttribute('data-glyph', 'K');
  });

  it('applies selected state', () => {
    render(<SourceRow sourceId="vscode" label="VS Code" count={42} selected={true} dataIndex={3} />);
    const row = screen.getByRole('option');
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).toHaveAttribute('id', 'option-3');
  });
});
