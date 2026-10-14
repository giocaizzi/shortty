import type { AppSettings } from '../shared/settings';

/**
 * Launcher window geometry. Spotlight-style collapsible window: a fixed width,
 * a compact search-bar height when empty and a maximum height with results.
 * Positions are computed against the maximum height so the window can grow
 * downwards without ever leaving the work area of its display.
 */
export const WINDOW_WIDTH = 750;
export const SEARCH_BAR_HEIGHT = 72;
export const MAX_WINDOW_HEIGHT = 580;

/** Fraction of the work-area height above the window in top-center mode. */
const TOP_CENTER_OFFSET = 0.2;

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Top-left corner of the launcher on `workArea` (the work area of the display
 * under the cursor), for the configured position mode.
 */
export function computeWindowPosition(
  mode: AppSettings['windowPosition'],
  cursor: Point,
  workArea: Rect,
  width = WINDOW_WIDTH,
  maxHeight = MAX_WINDOW_HEIGHT,
): Point {
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - width;
  const minY = workArea.y;
  const maxY = workArea.y + workArea.height - maxHeight;

  let x: number;
  let y: number;
  if (mode === 'mouse') {
    x = cursor.x - width / 2;
    y = cursor.y - SEARCH_BAR_HEIGHT / 2;
  } else if (mode === 'center') {
    x = workArea.x + (workArea.width - width) / 2;
    y = workArea.y + (workArea.height - maxHeight) / 2;
  } else {
    x = workArea.x + (workArea.width - width) / 2;
    y = workArea.y + workArea.height * TOP_CENTER_OFFSET;
  }

  return { x: Math.round(clamp(x, minX, maxX)), y: Math.round(clamp(y, minY, maxY)) };
}

/**
 * Bounds for a height change requested by the renderer. The height is clamped
 * to [SEARCH_BAR_HEIGHT, MAX_WINDOW_HEIGHT]; the top edge stays put unless the
 * grown window would cross the bottom of the work area, then it moves up.
 * Returns null when the request is invalid or changes nothing.
 */
export function resizeBounds(current: Rect, requestedHeight: unknown, workArea: Rect): Rect | null {
  if (typeof requestedHeight !== 'number' || !Number.isFinite(requestedHeight)) return null;
  const height = Math.round(clamp(requestedHeight, SEARCH_BAR_HEIGHT, MAX_WINDOW_HEIGHT));
  const y = clamp(current.y, workArea.y, workArea.y + workArea.height - height);
  if (height === current.height && y === current.y && current.width === WINDOW_WIDTH) return null;
  return { x: current.x, y, width: WINDOW_WIDTH, height };
}
