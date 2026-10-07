/**
 * Farm Layout Designer — Grid Utilities
 *
 * Snap-to-grid logic and coordinate transforms between
 * world space (meters) and screen space (pixels).
 */

import { GRID_CELL_SIZE, SNAP_THRESHOLD, PIXELS_PER_UNIT, CANVAS_PADDING } from '../constants';

/**
 * Snap a world-space value to the nearest grid line.
 * Returns the original value if it's not within SNAP_THRESHOLD of a grid line.
 */
export function snapToGrid(value: number, cellSize: number = GRID_CELL_SIZE): number {
  const nearest = Math.round(value / cellSize) * cellSize;
  return Math.abs(value - nearest) <= SNAP_THRESHOLD ? nearest : value;
}

/**
 * Force-snap a value to the nearest grid line (always snaps, no threshold).
 */
export function forceSnapToGrid(value: number, cellSize: number = GRID_CELL_SIZE): number {
  return Math.round(value / cellSize) * cellSize;
}

/**
 * Convert world coordinates (units) to screen coordinates (pixels).
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  canvasOffsetX: number = 0,
  canvasOffsetY: number = 0
): { screenX: number; screenY: number } {
  return {
    screenX: CANVAS_PADDING + worldX * PIXELS_PER_UNIT + canvasOffsetX,
    screenY: CANVAS_PADDING + worldY * PIXELS_PER_UNIT + canvasOffsetY,
  };
}

/**
 * Convert screen coordinates (pixels) to world coordinates (units).
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  canvasOffsetX: number = 0,
  canvasOffsetY: number = 0
): { worldX: number; worldY: number } {
  return {
    worldX: (screenX - CANVAS_PADDING - canvasOffsetX) / PIXELS_PER_UNIT,
    worldY: (screenY - CANVAS_PADDING - canvasOffsetY) / PIXELS_PER_UNIT,
  };
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Round to one decimal place.
 */
export function roundToDecimal(value: number, decimals: number = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Format dimensions for display (e.g. "2 × 1" or "2.5 × 1.5").
 */
export function formatDimensions(widthM: number, heightM: number): string {
  const w = roundToDecimal(widthM);
  const h = roundToDecimal(heightM);
  return `${w} × ${h}`;
}
