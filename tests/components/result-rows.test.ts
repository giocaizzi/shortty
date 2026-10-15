import {
  buildResultGroups,
  flattenGroups,
  plural,
  NONE_EXPANDED,
} from '../../src/renderer/components/result-rows';
import type { SearchResults } from '../../src/renderer/hooks/useSearch';
import { makeShortcut, makeCommand, makeParserMeta } from '../helpers';

const LIMITS = { sources: 1, shortcuts: 2, commands: 1 };

const shortcuts = [
  makeShortcut({ id: 'a', command: 'Cut', category: 'Editing' }),
  makeShortcut({ id: 'b', command: 'Quick Open', category: 'General' }),
  makeShortcut({ id: 'c', command: 'Odd One' }),
  makeShortcut({ id: 'd', command: 'Copy', category: 'Editing' }),
];

const results: SearchResults = {
  sources: [
    { meta: makeParserMeta(), count: 4 },
    { meta: makeParserMeta({ id: 'vim', label: 'vim' }), count: 0 },
  ],
  shortcuts,
  commands: [makeCommand()],
};

describe('buildResultGroups (flat)', () => {
  it('cuts each section at its limit and appends a "Show all" row', () => {
    const groups = buildResultGroups(results, {
      limits: LIMITS,
      expanded: NONE_EXPANDED,
      drilled: false,
      query: 'x',
    });
    expect(groups.map((g) => [g.title, g.total])).toEqual([
      ['Sources', 2],
      ['Shortcuts', 4],
      ['Commands', 1],
    ]);
    expect(flattenGroups(groups).map((i) => i.type)).toEqual([
      'source',
      'show-all',
      'shortcut',
      'shortcut',
      'show-all',
      'command',
    ]);
  });

  it('shows every row of an expanded section', () => {
    const groups = buildResultGroups(results, {
      limits: LIMITS,
      expanded: { ...NONE_EXPANDED, shortcuts: true },
      drilled: false,
      query: 'x',
    });
    const types = flattenGroups(groups).map((i) => i.type);
    expect(types.filter((t) => t === 'shortcut')).toHaveLength(4);
    expect(types.filter((t) => t === 'show-all')).toHaveLength(1);
  });

  it('omits empty sections', () => {
    const groups = buildResultGroups(
      { sources: [], shortcuts: [], commands: [makeCommand()] },
      { limits: LIMITS, expanded: NONE_EXPANDED, drilled: false, query: 'x' },
    );
    expect(groups.map((g) => g.key)).toEqual(['commands']);
  });
});

describe('buildResultGroups (drilled into a source)', () => {
  it('groups an empty query by category, first-seen order, uncategorized last, no limit', () => {
    const groups = buildResultGroups(
      { sources: [], shortcuts, commands: [] },
      { limits: LIMITS, expanded: NONE_EXPANDED, drilled: true, query: '' },
    );
    expect(groups.map((g) => g.title)).toEqual(['Editing', 'General', 'Other']);
    expect(groups[0].items).toHaveLength(2);
    expect(flattenGroups(groups).some((i) => i.type === 'show-all')).toBe(false);
  });

  it('uses one "Shortcuts" group when the source has no categories', () => {
    const groups = buildResultGroups(
      { sources: [], shortcuts: [makeShortcut({ id: 'x' }), makeShortcut({ id: 'y' })], commands: [] },
      { limits: LIMITS, expanded: NONE_EXPANDED, drilled: true, query: '' },
    );
    expect(groups.map((g) => g.title)).toEqual(['Shortcuts']);
  });

  it('lists ranked matches in one group, without a limit, when typing', () => {
    const groups = buildResultGroups(
      { sources: [], shortcuts, commands: [] },
      { limits: LIMITS, expanded: NONE_EXPANDED, drilled: true, query: 'o' },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(4);
  });
});

describe('plural', () => {
  it('pluralizes by count', () => {
    expect(plural(1, 'source')).toBe('1 source');
    expect(plural(0, 'source')).toBe('0 sources');
    expect(plural(12, 'shortcut')).toBe('12 shortcuts');
  });
});
