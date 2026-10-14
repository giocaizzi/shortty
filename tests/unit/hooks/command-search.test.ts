/**
 * Command search ranking on a realistic index: the 2,131 executables of a
 * real macOS PATH (Homebrew, /usr/local/bin, system dirs) with their apropos
 * descriptions, plus subcommands parsed from the captured git/docker/gh/
 * kubectl/uv/npm/brew/chezmoi fixtures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fuse from 'fuse.js';
import type { Command } from '../../../src/shared/types';
import { parseManContent } from '../../../src/main/commands/parsers/man-parser';
import { parseHelpOutput } from '../../../src/main/commands/parsers/help-parser';
import { COMMAND_FUSE_OPTIONS, searchCommands } from '../../../src/renderer/hooks/useSearch';

const ROOT = join(__dirname, '../../../fixtures/commands');
const index: [string, string][] = JSON.parse(readFileSync(join(ROOT, '_whatis/path-index.json'), 'utf-8'));
const ENRICHED: Record<string, string> = {
  git: 'git/man.txt', docker: 'docker/help.txt', gh: 'gh/help.txt', kubectl: 'kubectl/help.txt',
  uv: 'uv/help.txt', npm: 'npm/help.txt', brew: 'brew/man.txt', chezmoi: 'chezmoi/help.txt',
};

const commands: Command[] = index.map(([name, description]) => {
  const fixture = ENRICHED[name];
  const text = fixture ? readFileSync(join(ROOT, fixture), 'utf-8') : '';
  const parsed = fixture ? (fixture.includes('/man') ? parseManContent(text, name) : parseHelpOutput(text, name)) : null;
  return {
    name, description, bin: `/usr/bin/${name}`, mtime: 0, enrichment: parsed ? 'full' : 'basic',
    hasManPage: false, hasCompletion: false,
    subcommands: parsed?.subcommands ?? [], flags: parsed?.flags ?? [], arguments: [],
  };
});

const fuse = new Fuse(commands, COMMAND_FUSE_OPTIONS);
const top = (query: string, n = 5) => searchCommands(fuse, query).slice(0, n).map(c => c.name);

describe('command search ranking', () => {
  it('the index fixture is realistic', () => {
    expect(commands.length).toBeGreaterThan(2000);
    expect(commands.find(c => c.name === 'git')?.subcommands.length).toBe(154);
  });

  it.each([
    ['git', 'git'],
    ['ls', 'ls'],
    ['grep', 'grep'],
    ['docker', 'docker'],
    ['install', 'install'],
    ['pr', 'pr'],
  ])('an exact command name ranks first: %s', (query, first) => {
    expect(top(query)[0]).toBe(first);
  });

  it('"ls" ranks the ls command above names that merely contain "ls" (gnutls-cli)', () => {
    expect(top('ls', 5)).not.toContain('gnutls-cli');
  });

  it('"commit" finds git (via "git commit") first, docker (via "docker commit") next', () => {
    expect(top('commit', 2)).toEqual(['git', 'docker']);
  });

  it('"compose" finds docker through its compose subcommand', () => {
    expect(top('compose')).toEqual(expect.arrayContaining(['docker-compose', 'docker']));
  });

  it('"kubectl get" (command + subcommand) finds kubectl', () => {
    expect(top('kubectl get')[0]).toBe('kubectl');
  });

  it('"install" also surfaces package managers with an install subcommand', () => {
    expect(top('install', 5)).toEqual(expect.arrayContaining(['brew', 'npm']));
  });

  it('description words find commands: "copy files" -> cp, "json" -> jq', () => {
    expect(top('copy files')[0]).toBe('cp');
    expect(top('json', 10)).toContain('jq');
  });
});
