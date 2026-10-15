import { useEffect, useState, type CSSProperties } from 'react';
import { brandIconForCommand, brandIconForSource, weakTheme, type BrandIcon } from '../lib/brand-icons';

/**
 * Small app-icon-like tile identifying a source or a command. In order of
 * preference (docs/spec.md §15): the real macOS app icon, found by main; a
 * brand glyph tinted with the brand colour; a tinted monogram, which reads
 * like a Dock icon where emoji would clash with the glass.
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

// Session cache shared by every tile: one IPC round trip per source or command.
const appIcons = new Map<string, Promise<string | null>>();
const resolvedIcons = new Map<string, string | null>();

function loadAppIcon(kind: 'source' | 'command', name: string): Promise<string | null> {
  const key = `${kind}:${name}`;
  let icon = appIcons.get(key);
  if (!icon) {
    icon = Promise.resolve(window.electronAPI?.getIcon?.(kind, name) ?? null)
      .catch(() => null)
      .then((url) => {
        resolvedIcons.set(key, url);
        return url;
      });
    appIcons.set(key, icon);
  }
  return icon;
}

/** The app icon data URL, or null while loading and when there is none. */
function useAppIcon(kind: 'source' | 'command', name: string, enabled: boolean): string | null {
  const key = `${kind}:${name}`;
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!enabled || resolvedIcons.has(key)) return;
    let live = true;
    loadAppIcon(kind, name).then(() => {
      if (live) rerender((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [enabled, key, kind, name]);
  return enabled ? (resolvedIcons.get(key) ?? null) : null;
}

interface SourceIconProps {
  /** Source id (ParserMeta.id), or "commands" for the shell tile. */
  id: string;
  label: string;
  /** Command name: shows that command's icon instead of the shell tile. */
  command?: string;
  size?: number;
}

export function SourceIcon({ id, label, command, size = 20 }: SourceIconProps) {
  const brand = command ? brandIconForCommand(command) : brandIconForSource(id);
  // A curated command glyph beats the bundle a binary happens to live in
  // (kubectl ships inside Docker.app); for sources the app icon wins.
  const appIcon = useAppIcon(command ? 'command' : 'source', command ?? id, !(command && brand));
  const radius = Math.round(size * 0.28);

  if (appIcon) {
    return (
      <span
        aria-hidden="true"
        data-source-icon={id}
        data-icon="app"
        className="inline-flex shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
      >
        {/* macOS icons carry ~10% transparent margin: scale up to match the tiles. */}
        <img src={appIcon} alt="" draggable={false} width={size} height={size} style={{ transform: 'scale(1.12)' }} />
      </span>
    );
  }

  if (brand) return <BrandTile id={id} brand={brand} size={size} radius={radius} />;

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
        borderRadius: radius,
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

function BrandTile({ id, brand, size, radius }: { id: string; brand: BrandIcon; size: number; radius: number }) {
  return (
    <span
      aria-hidden="true"
      data-source-icon={id}
      data-icon="brand"
      data-brand={brand.title}
      data-weak-on={weakTheme(brand.hex)}
      className="brand-tile inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: radius, '--brand': `#${brand.hex}` } as CSSProperties}
    >
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} fill="currentColor">
        <path d={brand.path} />
      </svg>
    </span>
  );
}
