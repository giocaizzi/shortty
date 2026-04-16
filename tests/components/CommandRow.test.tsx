// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { CommandRow } from '../../src/renderer/components/CommandRow';
import { makeCommand } from '../helpers';

const mockCommand = makeCommand();

describe('CommandRow', () => {
  it('renders command name and description', () => {
    render(
      <CommandRow command={mockCommand} selected={false} dataIndex={0} />,
    );
    expect(screen.getByText('git')).toBeInTheDocument();
    expect(
      screen.getByText('The fast version control system'),
    ).toBeInTheDocument();
  });

  it('applies selected state', () => {
    render(
      <CommandRow command={mockCommand} selected={true} dataIndex={0} />,
    );
    const row = screen.getByRole('option');
    expect(row).toHaveAttribute('aria-selected', 'true');
  });
});
