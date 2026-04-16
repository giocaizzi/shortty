// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import {
  CommandDetailView,
  getDetailItemCount,
  getDetailCopyText,
  isSubcommandAtIndex,
} from '../../src/renderer/components/CommandDetailView';
import { assertDefined, makeCommand } from '../helpers';

const mockCommand = makeCommand({
  subcommands: [
    { name: 'git commit', description: 'Record changes to the repository' },
    { name: 'git push', description: 'Update remote refs' },
  ],
  flags: [
    { short: '-v', long: '--verbose', description: 'Be more verbose' },
  ],
});

const mockCommandWithArgs = makeCommand({
  subcommands: [
    { name: 'git commit', description: 'Record changes to the repository' },
    { name: 'git push', description: 'Update remote refs' },
  ],
  flags: [
    { short: '-v', long: '--verbose', description: 'Be more verbose' },
  ],
  synopsis: 'git [-v | --version] <command> [<args>]',
  longDescription: 'Git is a fast, scalable, distributed revision control system.',
  arguments: [
    { name: 'command', required: true, variadic: false, description: 'The Git command to run' },
    { name: 'args', required: false, variadic: true, description: 'Arguments for the command' },
  ],
});

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

  it('shows enriching message when basic enrichment', () => {
    const partialCommand: Command = { ...mockCommand, enrichment: 'basic' };
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

  it('renders synopsis when available', () => {
    render(
      <CommandDetailView
        data={mockCommandWithArgs}
        filterQuery=""
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    assertDefined(mockCommandWithArgs.synopsis);
    expect(screen.getByText(mockCommandWithArgs.synopsis)).toBeInTheDocument();
  });

  it('renders long description when available', () => {
    render(
      <CommandDetailView
        data={mockCommandWithArgs}
        filterQuery=""
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    assertDefined(mockCommandWithArgs.longDescription);
    expect(screen.getByText(mockCommandWithArgs.longDescription)).toBeInTheDocument();
  });

  it('renders arguments section when arguments exist', () => {
    render(
      <CommandDetailView
        data={mockCommandWithArgs}
        filterQuery=""
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    expect(screen.getByText('Arguments')).toBeInTheDocument();
    expect(screen.getByText('<command>')).toBeInTheDocument();
    expect(screen.getByText('<args>')).toBeInTheDocument();
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.getAllByText('optional')).toHaveLength(1);
  });

  it('renders argument descriptions', () => {
    render(
      <CommandDetailView
        data={mockCommandWithArgs}
        filterQuery=""
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    expect(screen.getByText('The Git command to run')).toBeInTheDocument();
  });

  it('does not render arguments section when empty', () => {
    render(
      <CommandDetailView
        data={mockCommand}
        filterQuery=""
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    expect(screen.queryByText('Arguments')).not.toBeInTheDocument();
  });

  it('filters arguments by query', () => {
    render(
      <CommandDetailView
        data={mockCommandWithArgs}
        filterQuery="Git command"
        selectedIndex={0}
        copyFlashIndex={null}
      />,
    );
    expect(screen.getByText('<command>')).toBeInTheDocument();
    // "args" has description "Arguments for the command" which doesn't match "Git command"
    expect(screen.queryByText('<args>')).not.toBeInTheDocument();
  });
});

describe('getDetailItemCount', () => {
  it('returns total subcommands + flags (no arguments)', () => {
    expect(getDetailItemCount(mockCommand, '')).toBe(3);
  });

  it('includes arguments in count', () => {
    // 2 arguments + 2 subcommands + 1 flag = 5
    expect(getDetailItemCount(mockCommandWithArgs, '')).toBe(5);
  });

  it('filters by query', () => {
    expect(getDetailItemCount(mockCommand, 'commit')).toBe(1);
  });

  it('filters arguments by query', () => {
    // "command" matches argument "command" + subcommand "git commit" (has "command" in it? no. name=command)
    // Actually "command" matches argument name "command"
    expect(getDetailItemCount(mockCommandWithArgs, 'command')).toBeGreaterThanOrEqual(1);
  });
});

describe('getDetailCopyText', () => {
  it('returns argument name for argument index', () => {
    expect(getDetailCopyText(mockCommandWithArgs, '', 0)).toBe('<command>');
    expect(getDetailCopyText(mockCommandWithArgs, '', 1)).toBe('<args>');
  });

  it('returns subcommand name for subcommand index (after arguments)', () => {
    // 2 arguments, then subcommands start at index 2
    expect(getDetailCopyText(mockCommandWithArgs, '', 2)).toBe('git commit');
    expect(getDetailCopyText(mockCommandWithArgs, '', 3)).toBe('git push');
  });

  it('returns flag for flag index (after arguments + subcommands)', () => {
    // 2 arguments + 2 subcommands = 4, flag at index 4
    expect(getDetailCopyText(mockCommandWithArgs, '', 4)).toBe('--verbose');
  });

  it('returns subcommand name for index 0 when no arguments', () => {
    expect(getDetailCopyText(mockCommand, '', 0)).toBe('git commit');
  });

  it('returns flag for flag index when no arguments', () => {
    expect(getDetailCopyText(mockCommand, '', 2)).toBe('--verbose');
  });

  it('returns null for out-of-range index', () => {
    expect(getDetailCopyText(mockCommand, '', 10)).toBeNull();
  });
});

describe('isSubcommandAtIndex', () => {
  it('returns true for subcommand index (after arguments)', () => {
    // With args: indices 0,1 = arguments, 2,3 = subcommands
    expect(isSubcommandAtIndex(mockCommandWithArgs, '', 2)).toBe(true);
    expect(isSubcommandAtIndex(mockCommandWithArgs, '', 3)).toBe(true);
  });

  it('returns false for argument index', () => {
    expect(isSubcommandAtIndex(mockCommandWithArgs, '', 0)).toBe(false);
    expect(isSubcommandAtIndex(mockCommandWithArgs, '', 1)).toBe(false);
  });

  it('returns false for flag index', () => {
    expect(isSubcommandAtIndex(mockCommandWithArgs, '', 4)).toBe(false);
  });

  it('returns true for subcommand index with no arguments', () => {
    expect(isSubcommandAtIndex(mockCommand, '', 0)).toBe(true);
    expect(isSubcommandAtIndex(mockCommand, '', 1)).toBe(true);
  });

  it('returns false for flag index with no arguments', () => {
    expect(isSubcommandAtIndex(mockCommand, '', 2)).toBe(false);
  });
});
