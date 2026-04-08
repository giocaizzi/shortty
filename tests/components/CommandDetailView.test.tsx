// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import {
  CommandDetailView,
  getCommandDetailItemCount,
  getCommandDetailCopyText,
} from '../../src/renderer/components/CommandDetailView';
import type { Command } from '../../src/shared/types';

const mockCommand: Command = {
  name: 'git',
  description: 'The fast version control system',
  bin: '/usr/bin/git',
  mtime: Date.now(),
  enrichment: 'full',
  hasManPage: true,
  hasCompletion: true,
  subcommands: [
    { name: 'git commit', description: 'Record changes to the repository' },
    { name: 'git push', description: 'Update remote refs' },
  ],
  flags: [
    { short: '-v', long: '--verbose', description: 'Be more verbose' },
  ],
};

describe('CommandDetailView', () => {
  it('renders command name and description', () => {
    render(
      <CommandDetailView
        command={mockCommand}
        filterQuery=""
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    expect(
      screen.getByText('The fast version control system'),
    ).toBeInTheDocument();
  });

  it('renders subcommands and flags', () => {
    render(
      <CommandDetailView
        command={mockCommand}
        filterQuery=""
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    expect(screen.getByText('git commit')).toBeInTheDocument();
    expect(screen.getByText('git push')).toBeInTheDocument();
    expect(screen.getByText('--verbose')).toBeInTheDocument();
  });

  it('filters items by query', () => {
    render(
      <CommandDetailView
        command={mockCommand}
        filterQuery="commit"
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    expect(screen.getByText('git commit')).toBeInTheDocument();
    expect(screen.queryByText('git push')).not.toBeInTheDocument();
  });

  it('shows enriching message when partially enriched', () => {
    const partialCommand: Command = { ...mockCommand, enrichment: 'partial' };
    render(
      <CommandDetailView
        command={partialCommand}
        filterQuery=""
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    expect(screen.getByText('— Enriching...')).toBeInTheDocument();
  });
});

describe('getCommandDetailItemCount', () => {
  it('returns total subcommands + flags', () => {
    expect(getCommandDetailItemCount(mockCommand, '')).toBe(3);
  });

  it('filters by query', () => {
    expect(getCommandDetailItemCount(mockCommand, 'commit')).toBe(1);
  });
});

describe('getCommandDetailCopyText', () => {
  it('returns prefixed subcommand name for subcommand index', () => {
    expect(getCommandDetailCopyText(mockCommand, '', 0)).toBe('git commit');
  });

  it('returns flag for flag index', () => {
    expect(getCommandDetailCopyText(mockCommand, '', 2)).toBe('--verbose');
  });

  it('returns null for out-of-range index', () => {
    expect(getCommandDetailCopyText(mockCommand, '', 10)).toBeNull();
  });
});
