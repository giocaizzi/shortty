import { describe, it, expect } from 'vitest';
import {
  computeWindowPosition,
  resizeBounds,
  WINDOW_WIDTH,
  SEARCH_BAR_HEIGHT,
  MAX_WINDOW_HEIGHT,
} from '../../../src/main/window-geometry';

// Primary display at the origin, a second display to its right, offset down.
const primary = { x: 0, y: 25, width: 1440, height: 875 };
const secondary = { x: 1440, y: 300, width: 1920, height: 1055 };

describe('computeWindowPosition', () => {
  it('top-center: horizontally centered, 20% down the work area', () => {
    expect(computeWindowPosition('top-center', { x: 10, y: 10 }, primary)).toEqual({
      x: (1440 - WINDOW_WIDTH) / 2,
      y: Math.round(25 + 875 * 0.2),
    });
  });

  it('uses the work area it is given (the display under the cursor), not the primary', () => {
    const pos = computeWindowPosition('top-center', { x: 2000, y: 600 }, secondary);
    expect(pos.x).toBe(1440 + (1920 - WINDOW_WIDTH) / 2);
    expect(pos.y).toBe(Math.round(300 + 1055 * 0.2));
  });

  it('center: centers the fully expanded window', () => {
    expect(computeWindowPosition('center', { x: 0, y: 0 }, secondary)).toEqual({
      x: 1440 + (1920 - WINDOW_WIDTH) / 2,
      y: Math.round(300 + (1055 - MAX_WINDOW_HEIGHT) / 2),
    });
  });

  it('mouse: centers the search bar on the cursor', () => {
    expect(computeWindowPosition('mouse', { x: 2500, y: 600 }, secondary)).toEqual({
      x: 2500 - WINDOW_WIDTH / 2,
      y: 600 - SEARCH_BAR_HEIGHT / 2,
    });
  });

  it('mouse: never lets the expanded window leave the work area', () => {
    const nearBottomRight = computeWindowPosition(
      'mouse',
      { x: 1440 + 1915, y: 300 + 1050 },
      secondary,
    );
    expect(nearBottomRight.x + WINDOW_WIDTH).toBeLessThanOrEqual(1440 + 1920);
    expect(nearBottomRight.y + MAX_WINDOW_HEIGHT).toBeLessThanOrEqual(300 + 1055);

    const nearTopLeft = computeWindowPosition('mouse', { x: 1441, y: 301 }, secondary);
    expect(nearTopLeft).toEqual({ x: 1440, y: 300 });
  });

  it('top-center on a short display keeps the expanded window on screen', () => {
    const short = { x: 0, y: 0, width: 1024, height: 640 };
    const pos = computeWindowPosition('top-center', { x: 0, y: 0 }, short);
    expect(pos.y + MAX_WINDOW_HEIGHT).toBeLessThanOrEqual(640);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });
});

describe('resizeBounds', () => {
  const at = { x: 345, y: 200, width: WINDOW_WIDTH, height: SEARCH_BAR_HEIGHT };

  it('grows downwards, keeping the top edge', () => {
    expect(resizeBounds(at, 580, primary)).toEqual({ ...at, height: 580 });
  });

  it('clamps to the compact and maximum heights', () => {
    expect(resizeBounds(at, 5000, primary)?.height).toBe(MAX_WINDOW_HEIGHT);
    expect(resizeBounds({ ...at, height: 580 }, 0, primary)?.height).toBe(SEARCH_BAR_HEIGHT);
  });

  it('returns null when nothing changes (no redundant resize)', () => {
    expect(resizeBounds(at, SEARCH_BAR_HEIGHT, primary)).toBeNull();
  });

  it('ignores non-numeric heights', () => {
    expect(resizeBounds(at, Number.NaN, primary)).toBeNull();
    expect(resizeBounds(at, '580', primary)).toBeNull();
  });

  it('moves up instead of growing past the bottom of the work area', () => {
    const low = { ...at, y: 700 };
    const next = resizeBounds(low, 580, primary);
    expect(next).toEqual({ ...low, y: 25 + 875 - 580, height: 580 });
  });
});
