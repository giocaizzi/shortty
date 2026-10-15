// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  CommandDetailView,
  getDetailItemCount,
  getDetailCopyText,
  isSubcommandAtIndex,
} from '../../src/renderer/components/CommandDetailView';
import { groupTitle } from '../../src/renderer/components/detail-rows';
import { makeCommand } from '../helpers';

vi.mock('../../src/renderer/hooks/useCommandEnrichment', () => ({ useCommandEnrichment: () => undefined }));

const gh = makeCommand({
  name: 'gh pr list',
  description: 'List pull requests in a repository',
  aliases: ['gh pr ls'],
  subcommands: [],
  flags: [
    { short: '-s', long: '--state', arg: 'string', description: 'Filter by state', default: 'open', choices: ['open', 'closed', 'merged', 'all'], group: 'FLAGS' },
    { long: '--app', arg: 'string', description: 'Filter by GitHub App author', group: 'FLAGS' },
    { short: '-R', long: '--repo', arg: '[HOST/]OWNER/REPO', description: 'Select another repository', group: 'INHERITED FLAGS' },
    { long: '--old', description: 'Old flag', deprecated: true, group: 'INHERITED FLAGS' },
    { short: '-n', long: '--name', description: 'Name of the VM', required: true, group: 'INHERITED FLAGS' },
  ],
  examples: [
    { command: 'gh pr list --author "@me"', description: 'List PRs authored by you' },
    { command: 'gh pr list --app dependabot', description: '' },
  ],
  environment: [{ name: 'GH_TOKEN', description: 'Authentication token' }],
  seeAlso: ['gh-pr(1)', 'https://cli.github.com/manual'],
});

function view(data = gh, selectedIndex = 0, filterQuery = '') {
  return render(<CommandDetailView data={data} filterQuery={filterQuery} selectedIndex={selectedIndex} copyFlashIndex={null} />);
}

describe('CommandDetailView: flag groups and badges', () => {
  it('shows one header per flag group, in sentence case, with counts', () => {
    view();
    const flags = screen.getByRole('group', { name: 'Flags' });
    expect(within(flags).getAllByTestId('flag-row')).toHaveLength(2);
    const inherited = screen.getByRole('group', { name: 'Inherited flags' });
    expect(within(inherited).getAllByTestId('flag-row')).toHaveLength(3);
  });

  it('a single group keeps the plain "Flags" title', () => {
    view(makeCommand({ flags: [{ long: '--a', description: 'A', group: 'Options' }, { long: '--b', description: 'B', group: 'Options' }] }));
    expect(screen.getByRole('group', { name: 'Flags' })).toBeInTheDocument();
  });

  it('renders default, choices, required and deprecated badges', () => {
    view();
    const rows = screen.getAllByTestId('flag-row');
    expect(rows[0]).toHaveTextContent('= open');
    expect(rows[0]).toHaveTextContent('open | closed | merged | all');
    expect(within(rows[3]).getByText('deprecated')).toBeInTheDocument();
    expect(within(rows[4]).getByText('required')).toBeInTheDocument();
  });

  it('truncates long choice lists and keeps the full list in the title', () => {
    view(makeCommand({ flags: [{ long: '--x', description: 'X', choices: ['a', 'b', 'c', 'd', 'e', 'f'] }] }));
    const badge = screen.getByTitle('a | b | c | d | e | f');
    expect(badge).toHaveTextContent('a | b | c | d …');
  });

  it('formats section titles', () => {
    expect(groupTitle('INHERITED FLAGS')).toBe('Inherited flags');
    expect(groupTitle('Global Options')).toBe('Global Options');
    expect(groupTitle('positional arguments')).toBe('Positional arguments');
  });
});

describe('CommandDetailView: examples, environment, aliases, see also', () => {
  it('lists examples (command and description) before the flags', () => {
    view();
    const examples = screen.getByRole('group', { name: 'Examples' });
    const rows = within(examples).getAllByTestId('example-row');
    expect(rows[0]).toHaveTextContent('gh pr list --author "@me"');
    expect(rows[0]).toHaveTextContent('List PRs authored by you');
    expect(rows[0].getAttribute('data-index')).toBe('0');
  });

  it('lists environment variables last', () => {
    view();
    const row = screen.getByTestId('env-row');
    expect(row).toHaveTextContent('GH_TOKEN');
    expect(row.getAttribute('data-index')).toBe('7');
  });

  it('shows aliases in the header and see-also items at the bottom', () => {
    view();
    expect(screen.getByTestId('detail-aliases')).toHaveTextContent('Alias');
    expect(screen.getByTestId('detail-aliases')).toHaveTextContent('gh pr ls');
    expect(screen.getByTestId('detail-see-also')).toHaveTextContent('https://cli.github.com/manual');
  });

  it('keyboard model: examples copy their command, variables their name', () => {
    expect(getDetailItemCount(gh, '')).toBe(8);
    expect(getDetailCopyText(gh, '', 0)).toBe('gh pr list --author "@me"');
    expect(getDetailCopyText(gh, '', 2)).toBe('gh pr list --state');
    expect(getDetailCopyText(gh, '', 7)).toBe('GH_TOKEN');
    expect(isSubcommandAtIndex(gh, '', 0)).toBe(false);
  });

  it('filters examples and variables too', () => {
    expect(getDetailItemCount(gh, 'dependabot')).toBe(1);
    expect(getDetailCopyText(gh, 'token', 0)).toBe('GH_TOKEN');
    view(gh, 0, 'dependabot');
    expect(screen.queryByTestId('detail-see-also')).not.toBeInTheDocument();
  });
});

describe('CommandDetailView: long sections collapse', () => {
  const many = makeCommand({
    subcommands: Array.from({ length: 60 }, (_, i) => ({ name: `tool sub${i}`, description: `Sub ${i}`, group: 'GROUPS' })),
    flags: [{ long: '--one', description: 'One' }],
  });

  it('shows the first rows and "Show all N"', () => {
    view(many);
    expect(screen.getAllByTestId('subcommand-row')).toHaveLength(25);
    fireEvent.click(screen.getByTestId('detail-show-all'));
    expect(screen.getAllByTestId('subcommand-row')).toHaveLength(60);
  });

  it('expands when the keyboard selection moves past the cut; indices stay stable', () => {
    view(many, 25);
    expect(screen.getAllByTestId('subcommand-row')).toHaveLength(60);
    expect(screen.getByTestId('flag-row').getAttribute('data-index')).toBe('60');
    expect(getDetailCopyText(many, '', 60)).toBe('git --one');
  });

  it('a filter shows every match', () => {
    view(many, 0, 'sub');
    expect(screen.getAllByTestId('subcommand-row')).toHaveLength(60);
  });
});
