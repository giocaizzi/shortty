import { describe, it, expect } from 'vitest';
import {
  describeArguments,
  parseAliases,
  parseArgumentEntries,
  parseEnvironment,
  parseExamples,
  parseSeeAlso,
  takeFlagEnvironment,
} from '../../../src/main/commands/parsers/help-extras';

describe('parseExamples', () => {
  it('joins backslash continuations and keeps the comment as description', () => {
    const text = '  # Deploy it\n  $ tool deploy \\\n      --prod\n';
    expect(parseExamples(text, 'tool')).toEqual([{ command: 'tool deploy --prod', description: 'Deploy it' }]);
  });

  it('takes a line piping into the program as a command', () => {
    expect(parseExamples('    echo hi | tool encode\n', 'tool')).toEqual([{ command: 'echo hi | tool encode', description: '' }]);
  });

  it('returns nothing for prose only', () => {
    expect(parseExamples('  See the manual for examples.\n', 'tool')).toEqual([]);
  });
});

describe('parseEnvironment', () => {
  it('reads "NAME  description" rows and NAME-over-description entries', () => {
    const text = '  TOOL_HOME   Where tool keeps its data\n  TOOL_DEBUG\n      Print debug output.\n';
    expect(parseEnvironment(text)).toEqual([
      { name: 'TOOL_HOME', description: 'Where tool keeps its data' },
      { name: 'TOOL_DEBUG', description: 'Print debug output.' },
    ]);
  });

  it('ignores prose', () => {
    expect(parseEnvironment('     The following variables are read:\n')).toEqual([]);
  });
});

describe('takeFlagEnvironment', () => {
  it('moves clap [env: X=] annotations into a variable list', () => {
    const flags = [{ long: '--cache-dir', description: 'Cache directory [env: TOOL_CACHE=]' }];
    expect(takeFlagEnvironment(flags)).toEqual([{ name: 'TOOL_CACHE', description: 'Same as --cache-dir' }]);
    expect(flags[0].description).toBe('Cache directory');
  });
});

describe('parseAliases / parseSeeAlso', () => {
  it('drops the command\'s own name', () => {
    expect(parseAliases('  tool container run, tool run\n', 'tool run')).toEqual(['tool container run']);
  });

  it('prefers man references and links over raw lines', () => {
    expect(parseSeeAlso('   tool-sub(1), other(5)\n   https://example.com/docs.\n')).toEqual([
      'tool-sub(1)', 'other(5)', 'https://example.com/docs',
    ]);
    expect(parseSeeAlso('  Read the manual\n')).toEqual(['Read the manual']);
  });
});

describe('parseArgumentEntries / describeArguments', () => {
  it('reads required, optional and variadic positionals', () => {
    const entries = parseArgumentEntries('  <name>...   The packages\n  [path]      Where to look\n');
    expect(entries).toEqual([
      { name: 'name', required: true, variadic: true, description: 'The packages' },
      { name: 'path', required: false, variadic: false, description: 'Where to look' },
    ]);
    expect(describeArguments([{ name: 'PATH', required: false, variadic: false, description: '' }], entries)).toEqual([
      { name: 'PATH', required: false, variadic: false, description: 'Where to look' },
    ]);
  });
});
