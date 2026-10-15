/**
 * Small app-icon-like tile identifying a source (or the shell, for commands).
 * Emoji icons from the cheatsheets render inconsistently next to text and
 * clash with the glass; a tinted monogram reads like a Dock icon instead.
 */

interface Tile {
  glyph: string;
  hue: string;
}

const TILES: Record<string, Tile> = {
  vscode: { glyph: 'VS', hue: '#1a7fd4' },
  chrome: { glyph: 'Ch', hue: '#d9822b' },
  ghostty: { glyph: 'Gh', hue: '#4a4458' },
  tmux: { glyph: 'tm', hue: '#2f9e44' },
  vim: { glyph: 'vi', hue: '#14804a' },
  zsh: { glyph: 'z', hue: '#c2581c' },
  bash: { glyph: '$', hue: '#3f4a3c' },
  obsidian: { glyph: 'Ob', hue: '#7048e8' },
  finder: { glyph: 'F', hue: '#1c8ce6' },
  'macos-system': { glyph: '⌘', hue: '#6e6e76' },
  commands: { glyph: '>_', hue: '#3a3a40' },
};

function fallbackTile(id: string, label: string): Tile {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const initial = label.trim().charAt(0) || id.charAt(0);
  return { glyph: initial.toUpperCase(), hue: `hsl(${hash % 360} 45% 42%)` };
}

interface SourceIconProps {
  /** Source id (ParserMeta.id), or "commands" for the shell tile. */
  id: string;
  label: string;
  size?: number;
}

export function SourceIcon({ id, label, size = 20 }: SourceIconProps) {
  const tile = TILES[id] ?? fallbackTile(id, label);
  return (
    <span
      aria-hidden="true"
      data-source-icon={id}
      data-glyph={tile.glyph}
      className="source-icon inline-flex shrink-0 items-center justify-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * (tile.glyph.length > 1 ? 0.46 : 0.56)),
        letterSpacing: '-0.02em',
        backgroundColor: tile.hue,
        backgroundImage:
          'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 60%)',
        boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.18), 0 0.5px 1px rgba(0,0,0,0.25)',
        fontFamily: tile.glyph === '>_' ? 'var(--font-mono)' : undefined,
      }}
    />
  );
}
