import { describe, it, expect, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolvePath } from '../../../src/main/utils/path-resolver';

describe('resolvePath', () => {
  const saved = process.env.XDG_CONFIG_HOME;
  afterEach(() => {
    if (saved === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = saved;
  });

  it('expands ~', () => {
    expect(resolvePath('~/.vimrc')).toBe(join(homedir(), '.vimrc'));
  });

  it('expands a Windows-style ~\\', () => {
    expect(resolvePath('~\\_vimrc')).toBe(join(homedir(), '_vimrc'));
  });

  it('expands %VAR% names with parentheses', () => {
    process.env['ProgramFiles(x86)'] = join(homedir(), 'pf86');
    try {
      expect(resolvePath('%ProgramFiles(x86)%/app')).toBe(resolve(homedir(), 'pf86', 'app'));
    } finally {
      delete process.env['ProgramFiles(x86)'];
    }
  });

  it('falls back to ~/.config when XDG_CONFIG_HOME is unset', () => {
    delete process.env.XDG_CONFIG_HOME;
    expect(resolvePath('$XDG_CONFIG_HOME/ghostty/config')).toBe(join(homedir(), '.config/ghostty/config'));
    expect(resolvePath('${XDG_CONFIG_HOME}/tmux/tmux.conf')).toBe(join(homedir(), '.config/tmux/tmux.conf'));
  });

  it('uses XDG_CONFIG_HOME when set', () => {
    process.env.XDG_CONFIG_HOME = '/custom/config';
    // resolve(): on Windows the path gets the current drive
    expect(resolvePath('$XDG_CONFIG_HOME/ghostty/config')).toBe(resolve('/custom/config/ghostty/config'));
  });
});
