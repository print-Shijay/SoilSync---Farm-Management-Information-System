/**
 * Farm Layout Designer — Plot Manager Utilities
 *
 * CRUD helpers for designer plots: create, reorder,
 * label generation, color assignment.
 */

import type { DesignerPlot } from '../types';
import {
  DEFAULT_PLOT_WIDTH_M,
  DEFAULT_PLOT_HEIGHT_M,
  PLOT_COLORS,
} from '../constants';
import { findOpenGridPosition, isValidPlotPlacement } from './collision';

/**
 * Generate a simple UUID v4 string.
 * Uses Math.random fallback for environments without crypto.
 */
export function generatePlotId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get the next auto-incremented plot label.
 * Scans existing labels to find the highest number.
 */
export function getNextPlotLabel(existingPlots: DesignerPlot[]): string {
  let maxNumber = 0;

  for (const plot of existingPlots) {
    const match = plot.label.match(/^Plot\s+(\d+)$/i);
    if (match) {
      maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
    }
  }

  return `Plot ${maxNumber + 1}`;
}

/**
 * Get a color for a new plot by cycling through the palette.
 */
export function getPlotColor(plotIndex: number): string {
  return PLOT_COLORS[plotIndex % PLOT_COLORS.length];
}

/**
 * Create a new DesignerPlot with custom or default dimensions and label.
 * Returns null if canvas grid has no open space remaining.
 */
export function createPlotWithDimensions(
  existingPlots: DesignerPlot[],
  canvasWidthUnits: number,
  canvasHeightUnits: number,
  widthM: number = DEFAULT_PLOT_WIDTH_M,
  heightM: number = DEFAULT_PLOT_HEIGHT_M,
  customLabel?: string,
  existingObstacles?: { x: number; y: number; widthM: number; heightM: number }[]
): DesignerPlot | null {
  const position = findOpenGridPosition(
    existingPlots,
    widthM,
    heightM,
    canvasWidthUnits,
    canvasHeightUnits,
    undefined,
    existingObstacles
  );

  if (!position) {
    return null; // Canvas is full
  }

  const label = customLabel || getNextPlotLabel(existingPlots);
  const color = getPlotColor(existingPlots.length);

  return {
    id: generatePlotId(),
    label,
    x: position.x,
    y: position.y,
    widthM,
    heightM,
    color,
    rotation: 0,
  };
}

/**
 * Create a new DesignerPlot with auto-generated label, color, and position.
 * Returns null if canvas grid has no open space remaining.
 */
export function createPlot(
  existingPlots: DesignerPlot[],
  canvasWidthUnits: number,
  canvasHeightUnits: number,
  existingObstacles?: { x: number; y: number; widthM: number; heightM: number }[]
): DesignerPlot | null {
  return createPlotWithDimensions(
    existingPlots,
    canvasWidthUnits,
    canvasHeightUnits,
    DEFAULT_PLOT_WIDTH_M,
    DEFAULT_PLOT_HEIGHT_M,
    undefined,
    existingObstacles
  );
}

/**
 * Check if flipping a plot's orientation is valid (does not collide or exceed bounds).
 */
export function canFlipPlot(
  plot: DesignerPlot,
  existingPlots: DesignerPlot[],
  canvasWidthUnits: number,
  canvasHeightUnits: number
): boolean {
  const flipped = {
    ...plot,
    widthM: plot.heightM,
    heightM: plot.widthM,
  };
  return isValidPlotPlacement(
    flipped,
    existingPlots,
    canvasWidthUnits,
    canvasHeightUnits
  );
}

/**
 * Flip a plot's orientation (swap width and height).
 */
export function flipPlotOrientation(plot: DesignerPlot): DesignerPlot {
  return {
    ...plot,
    widthM: plot.heightM,
    heightM: plot.widthM,
  };
}

/**
 * Duplicate a plot into an open grid space.
 * Returns null if canvas has no open space large enough.
 */
export function duplicatePlot(
  plotToDuplicate: DesignerPlot,
  existingPlots: DesignerPlot[],
  canvasWidthUnits: number,
  canvasHeightUnits: number
): DesignerPlot | null {
  const position = findOpenGridPosition(
    existingPlots,
    plotToDuplicate.widthM,
    plotToDuplicate.heightM,
    canvasWidthUnits,
    canvasHeightUnits
  );

  if (!position) {
    return null; // No space for duplicated plot
  }

  const label = getNextPlotLabel(existingPlots);

  return {
    id: generatePlotId(),
    label,
    x: position.x,
    y: position.y,
    widthM: plotToDuplicate.widthM,
    heightM: plotToDuplicate.heightM,
    color: plotToDuplicate.color,
    rotation: plotToDuplicate.rotation,
  };
}
