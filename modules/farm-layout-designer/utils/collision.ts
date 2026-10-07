/**
 * Farm Layout Designer — Collision Detection & Snapping Utilities
 *
 * Geometric hit-box validation, grid scanning for open space,
 * puzzle-style edge snapping, and non-overlapping movement/resize bounds.
 */

import type { DesignerPlot, ResizeDirection } from '../types';
import { GRID_CELL_SIZE, MIN_PLOT_WIDTH_M, MIN_PLOT_HEIGHT_M } from '../constants';
import { snapToGrid } from './grid';

export type PlotRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const EPSILON = 0.001;
const EDGE_SNAP_THRESHOLD = 0.25;

/**
 * Get bounding box of a plot (world units / meters).
 */
export function getPlotRect(plot: {
  x: number;
  y: number;
  widthM: number;
  heightM: number;
}): PlotRect {
  const halfW = plot.widthM / 2;
  const halfH = plot.heightM / 2;
  return {
    left: plot.x - halfW,
    right: plot.x + halfW,
    top: plot.y - halfH,
    bottom: plot.y + halfH,
  };
}

/**
 * Check if two plot rectangles overlap (excluding exact border contact).
 */
export function doRectsOverlap(rectA: PlotRect, rectB: PlotRect): boolean {
  return (
    rectA.left < rectB.right - EPSILON &&
    rectA.right > rectB.left + EPSILON &&
    rectA.top < rectB.bottom - EPSILON &&
    rectA.bottom > rectB.top + EPSILON
  );
}

/**
 * Check if a candidate plot placement is completely inside canvas bounds
 * and does not overlap any existing plot.
 */
export function isValidPlotPlacement(
  candidate: { id?: string; x: number; y: number; widthM: number; heightM: number },
  existingPlots: DesignerPlot[],
  worldWidth: number,
  worldHeight: number,
  existingObstacles?: { x: number; y: number; widthM: number; heightM: number }[]
): boolean {
  const rect = getPlotRect(candidate);

  // Canvas bounds check
  if (
    rect.left < -EPSILON ||
    rect.right > worldWidth + EPSILON ||
    rect.top < -EPSILON ||
    rect.bottom > worldHeight + EPSILON
  ) {
    return false;
  }

  // Overlap check with other plots
  for (const plot of existingPlots) {
    if (candidate.id && plot.id === candidate.id) continue;
    const otherRect = getPlotRect(plot);
    if (doRectsOverlap(rect, otherRect)) {
      return false;
    }
  }

  // Overlap check with other obstacles (e.g. facilities)
  if (existingObstacles) {
    for (const obs of existingObstacles) {
      const obsRect = getPlotRect(obs);
      if (doRectsOverlap(rect, obsRect)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Scan the grid to find the first open non-overlapping position
 * for a plot of size widthM x heightM.
 * Returns { x, y } center coordinates or null if canvas is full.
 */
export function findOpenGridPosition(
  existingPlots: DesignerPlot[],
  widthM: number,
  heightM: number,
  worldWidth: number,
  worldHeight: number,
  cellSize: number = GRID_CELL_SIZE,
  existingObstacles?: { x: number; y: number; widthM: number; heightM: number }[]
): { x: number; y: number } | null {
  const maxLeft = worldWidth - widthM;
  const maxTop = worldHeight - heightM;

  if (maxLeft < -EPSILON || maxTop < -EPSILON) {
    return null; // Plot size exceeds canvas size
  }

  // Scan grid from top-left to bottom-right
  const stepsY = Math.floor(maxTop / cellSize + EPSILON);
  const stepsX = Math.floor(maxLeft / cellSize + EPSILON);

  for (let sy = 0; sy <= stepsY; sy++) {
    const top = sy * cellSize;
    const candidateY = top + heightM / 2;

    for (let sx = 0; sx <= stepsX; sx++) {
      const left = sx * cellSize;
      const candidateX = left + widthM / 2;

      if (
        isValidPlotPlacement(
          { x: candidateX, y: candidateY, widthM, heightM },
          existingPlots,
          worldWidth,
          worldHeight,
          existingObstacles
        )
      ) {
        return { x: candidateX, y: candidateY };
      }
    }
  }

  return null; // No space available
}

/**
 * Layout obstacle definition for continuous collision detection.
 */
export type LayoutObstacle = {
  id: string;
  x: number;
  y: number;
  widthM: number;
  heightM: number;
};

/**
 * Clamps motion along a single 1D axis against obstacles and world boundaries.
 */
export function clampAxisMotion(
  curCenter: number,
  targetCenter: number,
  halfDim: number,
  worldLimit: number,
  obstaclesAlongAxis: { min: number; max: number }[]
): number {
  const minWorld = halfDim;
  const maxWorld = worldLimit - halfDim;
  const target = Math.max(minWorld, Math.min(maxWorld, targetCenter));

  if (target > curCenter) {
    let maxAllowed = target;
    for (const obs of obstaclesAlongAxis) {
      if (obs.min >= curCenter + halfDim - EPSILON) {
        const stopPos = obs.min - halfDim;
        if (stopPos < maxAllowed) {
          maxAllowed = Math.max(curCenter, stopPos);
        }
      }
    }
    return maxAllowed;
  } else if (target < curCenter) {
    let minAllowed = target;
    for (const obs of obstaclesAlongAxis) {
      if (obs.max <= curCenter - halfDim + EPSILON) {
        const stopPos = obs.max + halfDim;
        if (stopPos > minAllowed) {
          minAllowed = Math.min(curCenter, stopPos);
        }
      }
    }
    return minAllowed;
  }

  return curCenter;
}

/**
 * Free-flight dragging engine:
 * - Snaps to 0.5m grid.
 * - Magnetically snaps to canvas borders and adjacent obstacle borders.
 * - Clamps strictly inside canvas world bounds.
 * - DOES NOT block flight over existing obstacles (items can freely cross).
 */
export function freeDragSnapAndClamp(
  itemId: string,
  rawTargetX: number,
  rawTargetY: number,
  itemW: number,
  itemH: number,
  allObstacles: LayoutObstacle[],
  worldWidthM: number,
  worldHeightM: number
): { x: number; y: number } {
  const halfW = itemW / 2;
  const halfH = itemH / 2;
  const otherObstacles = allObstacles.filter((o) => o.id !== itemId);

  // 1. Grid snap target (0.5m / GRID_CELL_SIZE)
  let targetX = Math.round(rawTargetX / GRID_CELL_SIZE) * GRID_CELL_SIZE;
  let targetY = Math.round(rawTargetY / GRID_CELL_SIZE) * GRID_CELL_SIZE;

  // 2. Magnetic edge snapping for canvas boundaries
  if (Math.abs(targetX - halfW) < EDGE_SNAP_THRESHOLD) {
    targetX = halfW;
  } else if (Math.abs(targetX - (worldWidthM - halfW)) < EDGE_SNAP_THRESHOLD) {
    targetX = worldWidthM - halfW;
  }

  if (Math.abs(targetY - halfH) < EDGE_SNAP_THRESHOLD) {
    targetY = halfH;
  } else if (Math.abs(targetY - (worldHeightM - halfH)) < EDGE_SNAP_THRESHOLD) {
    targetY = worldHeightM - halfH;
  }

  // 3. Magnetic edge snapping for adjacent obstacles
  for (const obs of otherObstacles) {
    const oHalfW = obs.widthM / 2;
    const oHalfH = obs.heightM / 2;
    const oLeft = obs.x - oHalfW;
    const oRight = obs.x + oHalfW;
    const oTop = obs.y - oHalfH;
    const oBottom = obs.y + oHalfH;

    // X alignment snap
    if (targetY + halfH > oTop - 0.2 && targetY - halfH < oBottom + 0.2) {
      if (Math.abs(targetX - (oLeft - halfW)) < EDGE_SNAP_THRESHOLD) {
        targetX = oLeft - halfW;
      } else if (Math.abs(targetX - (oRight + halfW)) < EDGE_SNAP_THRESHOLD) {
        targetX = oRight + halfW;
      }
    }

    // Y alignment snap
    if (targetX + halfW > oLeft - 0.2 && targetX - halfW < oRight + 0.2) {
      if (Math.abs(targetY - (oTop - halfH)) < EDGE_SNAP_THRESHOLD) {
        targetY = oTop - halfH;
      } else if (Math.abs(targetY - (oBottom + halfH)) < EDGE_SNAP_THRESHOLD) {
        targetY = oBottom + halfH;
      }
    }
  }

  // 4. World bounds clamping
  const clampedX = Math.max(halfW, Math.min(worldWidthM - halfW, targetX));
  const clampedY = Math.max(halfH, Math.min(worldHeightM - halfH, targetY));

  return {
    x: Math.round(clampedX * 100) / 100,
    y: Math.round(clampedY * 100) / 100,
  };
}

/**
 * Check if candidate placement overlaps any obstacle.
 */
export function doesItemCollide(
  candidate: { id?: string; x: number; y: number; widthM: number; heightM: number },
  allObstacles: LayoutObstacle[]
): boolean {
  const rect = getPlotRect(candidate);
  for (const obs of allObstacles) {
    if (candidate.id && obs.id === candidate.id) continue;
    const obsRect = getPlotRect(obs);
    if (doRectsOverlap(rect, obsRect)) {
      return true;
    }
  }
  return false;
}

/**
 * Continuous physical collision and sliding drag engine:
 * - Sweeps from origin towards target.
 * - When an obstacle is hit, clamps motion flush against the obstacle edge (NEVER jumping back to start).
 * - Allows fluid multi-axis sliding around obstacle corners.
 * - Snaps to 0.5m grid and magnetically snaps to adjacent obstacle borders.
 */
export function snapAndClampMove(
  itemId: string,
  rawTargetX: number,
  rawTargetY: number,
  itemW: number,
  itemH: number,
  originX: number,
  originY: number,
  allObstacles: LayoutObstacle[],
  worldWidthM: number,
  worldHeightM: number
): { x: number; y: number } {
  const halfW = itemW / 2;
  const halfH = itemH / 2;
  const otherObstacles = allObstacles.filter((o) => o.id !== itemId);

  // 1. Grid snap target (0.5m / GRID_CELL_SIZE)
  let targetX = Math.round(rawTargetX / GRID_CELL_SIZE) * GRID_CELL_SIZE;
  let targetY = Math.round(rawTargetY / GRID_CELL_SIZE) * GRID_CELL_SIZE;

  // 2. Magnetic edge snapping for canvas boundaries
  if (Math.abs(targetX - halfW) < EDGE_SNAP_THRESHOLD) {
    targetX = halfW;
  } else if (Math.abs(targetX - (worldWidthM - halfW)) < EDGE_SNAP_THRESHOLD) {
    targetX = worldWidthM - halfW;
  }

  if (Math.abs(targetY - halfH) < EDGE_SNAP_THRESHOLD) {
    targetY = halfH;
  } else if (Math.abs(targetY - (worldHeightM - halfH)) < EDGE_SNAP_THRESHOLD) {
    targetY = worldHeightM - halfH;
  }

  // 3. Magnetic edge snapping for adjacent obstacles
  for (const obs of otherObstacles) {
    const oHalfW = obs.widthM / 2;
    const oHalfH = obs.heightM / 2;
    const oLeft = obs.x - oHalfW;
    const oRight = obs.x + oHalfW;
    const oTop = obs.y - oHalfH;
    const oBottom = obs.y + oHalfH;

    // X alignment snap
    if (targetY + halfH > oTop - 0.2 && targetY - halfH < oBottom + 0.2) {
      if (Math.abs(targetX - (oLeft - halfW)) < EDGE_SNAP_THRESHOLD) {
        targetX = oLeft - halfW;
      } else if (Math.abs(targetX - (oRight + halfW)) < EDGE_SNAP_THRESHOLD) {
        targetX = oRight + halfW;
      }
    }

    // Y alignment snap
    if (targetX + halfW > oLeft - 0.2 && targetX - halfW < oRight + 0.2) {
      if (Math.abs(targetY - (oTop - halfH)) < EDGE_SNAP_THRESHOLD) {
        targetY = oTop - halfH;
      } else if (Math.abs(targetY - (oBottom + halfH)) < EDGE_SNAP_THRESHOLD) {
        targetY = oBottom + halfH;
      }
    }
  }

  // Path 1: Move X first, then Y
  const xObstacles1 = otherObstacles
    .filter(
      (o) =>
        originY - halfH < o.y + o.heightM / 2 - EPSILON &&
        originY + halfH > o.y - o.heightM / 2 + EPSILON
    )
    .map((o) => ({ min: o.x - o.widthM / 2, max: o.x + o.widthM / 2 }));
  const resolvedX1 = clampAxisMotion(originX, targetX, halfW, worldWidthM, xObstacles1);

  const yObstacles1 = otherObstacles
    .filter(
      (o) =>
        resolvedX1 - halfW < o.x + o.widthM / 2 - EPSILON &&
        resolvedX1 + halfW > o.x - o.widthM / 2 + EPSILON
    )
    .map((o) => ({ min: o.y - o.heightM / 2, max: o.y + o.heightM / 2 }));
  const resolvedY1 = clampAxisMotion(originY, targetY, halfH, worldHeightM, yObstacles1);

  // Path 2: Move Y first, then X
  const yObstacles2 = otherObstacles
    .filter(
      (o) =>
        originX - halfW < o.x + o.widthM / 2 - EPSILON &&
        originX + halfW > o.x - o.widthM / 2 + EPSILON
    )
    .map((o) => ({ min: o.y - o.heightM / 2, max: o.y + o.heightM / 2 }));
  const resolvedY2 = clampAxisMotion(originY, targetY, halfH, worldHeightM, yObstacles2);

  const xObstacles2 = otherObstacles
    .filter(
      (o) =>
        resolvedY2 - halfH < o.y + o.heightM / 2 - EPSILON &&
        resolvedY2 + halfH > o.y - o.heightM / 2 + EPSILON
    )
    .map((o) => ({ min: o.x - o.widthM / 2, max: o.x + o.widthM / 2 }));
  const resolvedX2 = clampAxisMotion(originX, targetX, halfW, worldWidthM, xObstacles2);

  // Choose the path that gets closest to requested target
  const dist1 = Math.hypot(resolvedX1 - targetX, resolvedY1 - targetY);
  const dist2 = Math.hypot(resolvedX2 - targetX, resolvedY2 - targetY);

  const chosenX = dist1 <= dist2 ? resolvedX1 : resolvedX2;
  const chosenY = dist1 <= dist2 ? resolvedY1 : resolvedY2;

  return {
    x: Math.round(chosenX * 100) / 100,
    y: Math.round(chosenY * 100) / 100,
  };
}

/**
 * Calculate resizable bounds clamped to neighboring obstacles and canvas boundaries.
 */
export function snapAndClampResize(
  itemId: string,
  dir: ResizeDirection,
  startW: number,
  startH: number,
  startX: number,
  startY: number,
  dxM: number,
  dyM: number,
  allObstacles: LayoutObstacle[],
  worldWidthM: number,
  worldHeightM: number,
  minWidthM: number = MIN_PLOT_WIDTH_M,
  minHeightM: number = MIN_PLOT_HEIGHT_M
): { widthM: number; heightM: number; x: number; y: number } {
  const startRect = {
    left: startX - startW / 2,
    right: startX + startW / 2,
    top: startY - startH / 2,
    bottom: startY + startH / 2,
  };

  let newLeft = startRect.left;
  let newRight = startRect.right;
  let newTop = startRect.top;
  let newBottom = startRect.bottom;

  // Determine requested changes
  if (dir.includes('right')) {
    const rawRight = startRect.right + dxM;
    newRight = snapToGrid(rawRight);
  }
  if (dir.includes('left')) {
    const rawLeft = startRect.left + dxM;
    newLeft = snapToGrid(rawLeft);
  }
  if (dir.includes('bottom')) {
    const rawBottom = startRect.bottom + dyM;
    newBottom = snapToGrid(rawBottom);
  }
  if (dir.includes('top')) {
    const rawTop = startRect.top + dyM;
    newTop = snapToGrid(rawTop);
  }

  // Other obstacles filter
  const otherObstacles = allObstacles.filter((p) => p.id !== itemId);

  // Clamp RIGHT expansion
  if (dir.includes('right')) {
    let maxAllowedRight = worldWidthM;
    for (const other of otherObstacles) {
      const oHalfW = other.widthM / 2;
      const oHalfH = other.heightM / 2;
      const oLeft = other.x - oHalfW;
      const oTop = other.y - oHalfH;
      const oBottom = other.y + oHalfH;
      // Check if vertical ranges overlap
      if (newTop < oBottom - EPSILON && newBottom > oTop + EPSILON) {
        if (oLeft >= startRect.left - EPSILON) {
          maxAllowedRight = Math.min(maxAllowedRight, oLeft);
        }
      }
    }
    newRight = Math.min(newRight, maxAllowedRight);
    if (newRight - newLeft < minWidthM) {
      newRight = newLeft + minWidthM;
    }
  }

  // Clamp LEFT expansion
  if (dir.includes('left')) {
    let minAllowedLeft = 0;
    for (const other of otherObstacles) {
      const oHalfW = other.widthM / 2;
      const oHalfH = other.heightM / 2;
      const oRight = other.x + oHalfW;
      const oTop = other.y - oHalfH;
      const oBottom = other.y + oHalfH;
      if (newTop < oBottom - EPSILON && newBottom > oTop + EPSILON) {
        if (oRight <= startRect.right + EPSILON) {
          minAllowedLeft = Math.max(minAllowedLeft, oRight);
        }
      }
    }
    newLeft = Math.max(newLeft, minAllowedLeft);
    if (newRight - newLeft < minWidthM) {
      newLeft = newRight - minWidthM;
    }
  }

  // Clamp BOTTOM expansion
  if (dir.includes('bottom')) {
    let maxAllowedBottom = worldHeightM;
    for (const other of otherObstacles) {
      const oHalfW = other.widthM / 2;
      const oHalfH = other.heightM / 2;
      const oLeft = other.x - oHalfW;
      const oRight = other.x + oHalfW;
      const oTop = other.y - oHalfH;
      if (newLeft < oRight - EPSILON && newRight > oLeft + EPSILON) {
        if (oTop >= startRect.top - EPSILON) {
          maxAllowedBottom = Math.min(maxAllowedBottom, oTop);
        }
      }
    }
    newBottom = Math.min(newBottom, maxAllowedBottom);
    if (newBottom - newTop < minHeightM) {
      newBottom = newTop + minHeightM;
    }
  }

  // Clamp TOP expansion
  if (dir.includes('top')) {
    let minAllowedTop = 0;
    for (const other of otherObstacles) {
      const oHalfW = other.widthM / 2;
      const oHalfH = other.heightM / 2;
      const oLeft = other.x - oHalfW;
      const oRight = other.x + oHalfW;
      const oBottom = other.y + oHalfH;
      if (newLeft < oRight - EPSILON && newRight > oLeft + EPSILON) {
        if (oBottom <= startRect.bottom + EPSILON) {
          minAllowedTop = Math.max(minAllowedTop, oBottom);
        }
      }
    }
    newTop = Math.max(newTop, minAllowedTop);
    if (newBottom - newTop < minHeightM) {
      newTop = newBottom - minHeightM;
    }
  }

  const finalW = Math.round((newRight - newLeft) * 10) / 10;
  const finalH = Math.round((newBottom - newTop) * 10) / 10;
  const finalX = Math.round((newLeft + finalW / 2) * 10) / 10;
  const finalY = Math.round((newTop + finalH / 2) * 10) / 10;

  return {
    widthM: finalW,
    heightM: finalH,
    x: finalX,
    y: finalY,
  };
}

// ─── Free-Space Placement for Facilities, Zones & Imports ───

export type BoundingBox = {
  x: number;
  y: number;
  widthM: number;
  heightM: number;
};

/**
 * Check if two generic rectangular boxes overlap (with optional margin/padding).
 */
export function doBoxesOverlap(
  boxA: BoundingBox,
  boxB: BoundingBox,
  padding: number = 0.5
): boolean {
  const halfWA = boxA.widthM / 2 + padding;
  const halfHA = boxA.heightM / 2 + padding;
  const halfWB = boxB.widthM / 2;
  const halfHB = boxB.heightM / 2;

  const leftA = boxA.x - halfWA;
  const rightA = boxA.x + halfWA;
  const topA = boxA.y - halfHA;
  const bottomA = boxA.y + halfHA;

  const leftB = boxB.x - halfWB;
  const rightB = boxB.x + halfWB;
  const topB = boxB.y - halfHB;
  const bottomB = boxB.y + halfHB;

  return (
    leftA < rightB - EPSILON &&
    rightA > leftB + EPSILON &&
    topA < bottomB - EPSILON &&
    bottomA > topB + EPSILON
  );
}

/**
 * Scan the canvas to find guaranteed collision-free coordinates for any new element
 * (e.g. newly added facilities, newly created zones, or imported farm layouts).
 *
 * If the current canvas area is crowded or doesn't have sufficient free space,
 * it places the element adjacent to existing occupied items with clean spacing
 * and returns the required canvas expansion (newWorldW, newWorldH).
 */
export function findOpenPlacementPosition(
  elementWidthM: number,
  elementHeightM: number,
  existingElements: BoundingBox[],
  currentWorldW: number,
  currentWorldH: number,
  padding: number = 1.0,
  stepSize: number = 1.0
): { x: number; y: number; newWorldW: number; newWorldH: number } {
  // 1. If canvas is empty, place comfortably near top-left with perimeter margin
  if (existingElements.length === 0) {
    const initX = Math.round((elementWidthM / 2 + 2) * 10) / 10;
    const initY = Math.round((elementHeightM / 2 + 2) * 10) / 10;
    const reqW = Math.max(currentWorldW, Math.ceil(initX + elementWidthM / 2 + 3));
    const reqH = Math.max(currentWorldH, Math.ceil(initY + elementHeightM / 2 + 3));
    return { x: initX, y: initY, newWorldW: reqW, newWorldH: reqH };
  }

  // 2. Scan existing canvas space from top-left to bottom-right
  const startMargin = 2.0; // 2 meters away from canvas boundary
  const maxSearchX = currentWorldW - elementWidthM / 2 - startMargin;
  const maxSearchY = currentWorldH - elementHeightM / 2 - startMargin;

  if (maxSearchX >= elementWidthM / 2 + startMargin && maxSearchY >= elementHeightM / 2 + startMargin) {
    for (let cy = elementHeightM / 2 + startMargin; cy <= maxSearchY; cy += stepSize) {
      for (let cx = elementWidthM / 2 + startMargin; cx <= maxSearchX; cx += stepSize) {
        const candidate: BoundingBox = {
          x: Math.round(cx * 10) / 10,
          y: Math.round(cy * 10) / 10,
          widthM: elementWidthM,
          heightM: elementHeightM,
        };

        const collides = existingElements.some((existing) =>
          doBoxesOverlap(candidate, existing, padding)
        );

        if (!collides) {
          return {
            x: candidate.x,
            y: candidate.y,
            newWorldW: currentWorldW,
            newWorldH: currentWorldH,
          };
        }
      }
    }
  }

  // 3. If no open space fits within current bounds, place adjacent to occupied envelope
  const maxRight = Math.max(...existingElements.map((el) => el.x + el.widthM / 2));
  const maxBottom = Math.max(...existingElements.map((el) => el.y + el.heightM / 2));

  // Try placing to the right first if world width isn't excessively large
  let placeX = Math.round((maxRight + elementWidthM / 2 + padding + 1.0) * 10) / 10;
  let placeY = Math.round((elementHeightM / 2 + 2) * 10) / 10;

  // If extending horizontally exceeds 60m, wrap to the next row below
  if (placeX + elementWidthM / 2 > 60) {
    placeX = Math.round((elementWidthM / 2 + 2) * 10) / 10;
    placeY = Math.round((maxBottom + elementHeightM / 2 + padding + 1.5) * 10) / 10;
  }

  const expW = Math.max(currentWorldW, Math.ceil(placeX + elementWidthM / 2 + 3));
  const expH = Math.max(currentWorldH, Math.ceil(placeY + elementHeightM / 2 + 3));

  return {
    x: placeX,
    y: placeY,
    newWorldW: expW,
    newWorldH: expH,
  };
}

