import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brandIconForCommand, brandIconForSource, weakTheme } from '../../../src/renderer/lib/brand-icons';

const SOURCES = join(__dirname, '../../../src/cheatsheets/sources');

describe('brand icons', () => {
  it('covers every shipped source with an app icon, a glyph, or both', () => {
    for (const file of readdirSync(SOURCES)) {
      const cs = JSON.parse(readFileSync(join(SOURCES, file), 'utf-8'));
      expect(cs.app || brandIconForSource(cs.id), cs.id).toBeTruthy();
    }
  });

  it.each([
    ['git', 'Git'], ['gh', 'GitHub'], ['docker', 'Docker'], ['kubectl', 'Kubernetes'],
    ['gcloud', 'Google Cloud'], ['terraform', 'Terraform'], ['node', 'Node.js'], ['uv', 'uv'],
    ['brew', 'Homebrew'], ['bw', 'Bitwarden'], ['psql', 'PostgreSQL'], ['claude', 'Claude'],
  ])('maps %s to %s', (cmd, title) => {
    expect(brandIconForCommand(cmd)?.title).toBe(title);
  });

  it('strips version suffixes', () => {
    expect(brandIconForCommand('python3.12')?.title).toBe('Python');
    expect(brandIconForCommand('pip3')?.title).toBe('Python');
    expect(brandIconForCommand('psql-17')?.title).toBe('PostgreSQL');
  });

  it('has no glyph for unknown commands', () => {
    expect(brandIconForCommand('frobnicate')).toBeUndefined();
    expect(brandIconForCommand('code')).toBeUndefined();
  });

  it('flags brand colours too faint for a theme', () => {
    expect(weakTheme('181717')).toBe('dark'); // GitHub
    expect(weakTheme('F7DF1E')).toBe('light'); // JavaScript yellow
    expect(weakTheme('D03030')).toBeUndefined(); // mid red reads on both
  });
});
