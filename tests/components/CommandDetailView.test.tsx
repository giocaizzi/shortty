// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import {
  CommandDetailView,
  getDetailItemCount,
  getDetailCopyText,
  isSubcommandAtIndex,
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
        data={mockCommand}
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
        data={mockCommand}
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
        data={mockCommand}
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
        data={partialCommand}
        filterQuery=""
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    expect(screen.getByText('— Enriching...')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <CommandDetailView
        data={mockCommand}
        filterQuery=""
        selectedIndex={0}
        copyFlashIndex={null}
        loading={true}
      />,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

describe('getDetailItemCount', () => {
  it('returns total subcommands + flags', () => {
    expect(getDetailItemCount(mockCommand, '')).toBe(3);
  });

  it('filters by query', () => {
    expect(getDetailItemCount(mockCommand, 'commit')).toBe(1);
  });
});

describe('getDetailCopyText', () => {
  it('returns subcommand name for subcommand index', () => {
    expect(getDetailCopyText(mockCommand, '', 0)).toBe('git commit');
  });

  it('returns flag for flag index', () => {
    expect(getDetailCopyText(mockCommand, '', 2)).toBe('--verbose');
  });

  it('returns null for out-of-range index', () => {
    expect(getDetailCopyText(mockCommand, '', 10)).toBeNull();
  });
});

describe('isSubcommandAtIndex', () => {
  it('returns true for subcommand index', () => {
    expect(isSubcommandAtIndex(mockCommand, '', 0)).toBe(true);
    expect(isSubcommandAtIndex(mockCommand, '', 1)).toBe(true);
  });

  it('returns false for flag index', () => {
    expect(isSubcommandAtIndex(mockCommand, '', 2)).toBe(false);
  });
});
