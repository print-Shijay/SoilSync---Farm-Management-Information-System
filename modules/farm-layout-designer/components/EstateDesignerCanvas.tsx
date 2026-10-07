/**
 * Farm Estate Designer — EstateDesignerCanvas
 *
 * Freeform 2D interactive canvas for arranging multiple farm parcels and centralized
 * facilities Clash-of-Clans style.
 *
 * Key Features:
 * 1. Auto-Adjusted Farm Area Box: automatically crops each farm parcel to only the space
 *    actually occupied by constituent planting beds, zones, and facilities with 1m clearance.
 * 2. Reset / Clear Farm Areas: dedicated action to clear all placed farm parcels while
 *    preserving central facilities.
 * 3. Real 2D Farm Area Map: renders actual zones, greenhouse styling, planting beds,
 *    and internal facilities live at 1:1 scale.
 * 4. Consistent Facility Design: colored card matching Farm Layout Editor with vector icons,
 *    meter dimensions, central badge, and 4-corner interactive resizing handles.
 * 5. Bottom Control Dock: contextually switches between Building Palette and Action Dock.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  PanResponder,
  useWindowDimensions,
  TextInput,
  Animated,
  Vibration,
  Platform,
  Switch,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Building2,
  Layers,
  Save,
  Trash2,
  Check,
  X,
  Box,
  MapPin,
  Pencil,
  Wrench,
  FlaskConical,
  Sprout,
  Recycle,
  Home,
  Egg,
  Package,
  Clock,
  Leaf,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Settings,
  Lock,
  LockOpen,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { FarmMapSkeleton } from '../../../components/skeleton';
import { useAuth } from '../../../lib/AuthContext';
import {
  getFarmEstateLayout,
  saveFarmEstateLayout,
  validateAndSyncEstateLayout,
  type FarmEstateRecord,
  type EstatePlacedFarm,
  type EstateFacility,
  type EstateFacilityFunction,
} from '../../../lib/estate-operations';
import { getFarmsByUser } from '../../../lib/db-operations';
import { loadFarmLayout } from '../db';
import type { LoadedLayout, DesignerPlot, FarmZone, FarmFacility, ResizeDirection, FacilityFunction } from '../types';
import {
  EstatePaletteCarousel,
  type AvailableFarmLayoutItem,
} from './EstatePaletteCarousel';
import {
  type FacilityTemplate,
  PIXELS_PER_UNIT,
  CANVAS_PADDING,
  GRID_CELL_SIZE,
  GRID_COLOR_MAJOR,
  GRID_COLOR_MINOR,
  CANVAS_BG,
  CANVAS_BORDER,
  SELECTED_BORDER_COLOR,
  SELECTED_BORDER_WIDTH,
  DEFAULT_BORDER_WIDTH,
} from '../constants';
import { forceSnapToGrid } from '../utils/grid';
import { ResizeHandle } from './ResizeHandle';
import { FacilityInventorySheet } from './FacilityInventorySheet';
import { FacilitySizeModal } from './FacilitySizeModal';
import { CanvasToolPalette, type ToolMode } from './CanvasToolPalette';
import { generateUUID } from '../../../lib/local-db';

type ActiveEstateDrag = {
  type: 'farm' | 'facility';
  data: any;
  screenPos: { x: number; y: number };
  worldPos: { x: number; y: number } | null;
  isValid: boolean;
};

type EstateDesignerCanvasProps = {
  onBack?: () => void;
  onOpenFacilities?: (estateId: string) => void;
};

export type FarmOccupiedBounds = {
  widthM: number;
  heightM: number;
  offsetX: number;
  offsetY: number;
  hasElements: boolean;
};

/**
 * Calculates the tight bounding box of actually used space (plots, zones, facilities)
 * for a farm layout so the estate parcel box only occupies the used space.
 */
export function getFarmOccupiedBounds(layout?: LoadedLayout | any | null): FarmOccupiedBounds {
  if (!layout) {
    return { widthM: 8, heightM: 8, offsetX: 4, offsetY: 4, hasElements: false };
  }

  let plots: any[] = layout.plots || [];
  let zones: any[] = layout.zones || [];
  let facilities: any[] = layout.facilities || [];

  if (plots.length === 0 && zones.length === 0 && facilities.length === 0) {
    const bp = layout.blueprintData ?? (
      typeof layout.blueprint_data_json === 'string'
        ? (() => {
            try {
              return JSON.parse(layout.blueprint_data_json || '{}');
            } catch {
              return {};
            }
          })()
        : layout.blueprint_data_json ?? {}
    );
    if (Array.isArray(bp?.items)) {
      plots = bp.items.map((it: any) => ({
        x: Number(it.x ?? 0),
        y: Number(it.z ?? it.y ?? 0),
        widthM: Number(it.widthM ?? it.width_m ?? it.width ?? 1.2),
        heightM: Number(it.depthM ?? it.heightM ?? it.height_m ?? it.length ?? it.height ?? 2.4),
      }));
    } else if (Array.isArray(bp?.plots)) {
      plots = bp.plots.map((it: any) => ({
        x: Number(it.x ?? 0),
        y: Number(it.z ?? it.y ?? 0),
        widthM: Number(it.widthM ?? it.width_m ?? it.width ?? 2),
        heightM: Number(it.heightM ?? it.depthM ?? it.height_m ?? it.height ?? 1),
      }));
    }
    if (Array.isArray(bp?.zones)) {
      zones = bp.zones.map((z: any) => ({
        x: Number(z.x ?? 0),
        y: Number(z.y ?? 0),
        widthM: Number(z.widthM ?? 4),
        heightM: Number(z.heightM ?? 4),
      }));
    }
    if (Array.isArray(bp?.facilities)) {
      facilities = bp.facilities.map((f: any) => ({
        x: Number(f.x ?? 0),
        y: Number(f.y ?? 0),
        widthM: Number(f.widthM ?? 3),
        heightM: Number(f.heightM ?? 3),
      }));
    }
  }

  const allBounds: { minX: number; maxX: number; minY: number; maxY: number }[] = [];

  plots.forEach((p: any) => {
    const w = p.widthM || 2;
    const h = p.heightM || 1;
    allBounds.push({
      minX: p.x - w / 2,
      maxX: p.x + w / 2,
      minY: p.y - h / 2,
      maxY: p.y + h / 2,
    });
  });

  zones.forEach((z: any) => {
    const w = z.widthM || 4;
    const h = z.heightM || 4;
    allBounds.push({
      minX: z.x - w / 2,
      maxX: z.x + w / 2,
      minY: z.y - h / 2,
      maxY: z.y + h / 2,
    });
  });

  facilities.forEach((f: any) => {
    const w = f.widthM || 3;
    const h = f.heightM || 2;
    allBounds.push({
      minX: f.x - w / 2,
      maxX: f.x + w / 2,
      minY: f.y - h / 2,
      maxY: f.y + h / 2,
    });
  });

  if (allBounds.length === 0) {
    const defaultW = Math.min(layout.widthM || 8, 8);
    const defaultH = Math.min(layout.heightM || 8, 8);
    return {
      widthM: defaultW,
      heightM: defaultH,
      offsetX: defaultW / 2,
      offsetY: defaultH / 2,
      hasElements: false,
    };
  }

  const minX = Math.min(...allBounds.map((b) => b.minX));
  const maxX = Math.max(...allBounds.map((b) => b.maxX));
  const minY = Math.min(...allBounds.map((b) => b.minY));
  const maxY = Math.max(...allBounds.map((b) => b.maxY));

  const occupiedW = maxX - minX;
  const occupiedH = maxY - minY;

  // 1 meter perimeter margin around elements for pathways and border aesthetics
  const PADDING = 1.0;
  const tightW = Math.max(4, Math.ceil((occupiedW + PADDING * 2) * 2) / 2);
  const tightH = Math.max(4, Math.ceil((occupiedH + PADDING * 2) * 2) / 2);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    widthM: tightW,
    heightM: tightH,
    offsetX: centerX,
    offsetY: centerY,
    hasElements: true,
  };
}

export type EstateObstacle = {
  id: string;
  type: 'farm' | 'facility';
  name?: string;
  x: number;
  y: number;
  widthM: number;
  heightM: number;
};

const EPSILON = 0.01; // 1cm tolerance
const ESTATE_EDGE_SNAP_THRESHOLD = 0.4; // 40cm magnetic snap threshold

/**
 * Check if two rectangular bounding boxes overlap on the estate canvas.
 */
export function doEstateRectsOverlap(
  r1: { left: number; right: number; top: number; bottom: number },
  r2: { left: number; right: number; top: number; bottom: number }
): boolean {
  return (
    r1.left < r2.right - EPSILON &&
    r1.right > r2.left + EPSILON &&
    r1.top < r2.bottom - EPSILON &&
    r1.bottom > r2.top + EPSILON
  );
}

/**
 * Checks whether a candidate block is completely within world boundaries
 * and does not overlap any other obstacle on the estate.
 */
export function isValidEstatePlacement(
  candidate: { id?: string; x: number; y: number; widthM: number; heightM: number },
  allObstacles: EstateObstacle[],
  worldWidthM: number,
  worldHeightM: number
): boolean {
  const halfW = candidate.widthM / 2;
  const halfH = candidate.heightM / 2;
  const rect = {
    left: candidate.x - halfW,
    right: candidate.x + halfW,
    top: candidate.y - halfH,
    bottom: candidate.y + halfH,
  };

  // 1. World boundary check
  if (
    rect.left < -EPSILON ||
    rect.right > worldWidthM + EPSILON ||
    rect.top < -EPSILON ||
    rect.bottom > worldHeightM + EPSILON
  ) {
    return false;
  }

  // 2. Overlap check with all existing obstacles
  for (const obs of allObstacles) {
    if (candidate.id && obs.id === candidate.id) continue;
    const obsHalfW = obs.widthM / 2;
    const obsHalfH = obs.heightM / 2;
    const obsRect = {
      left: obs.x - obsHalfW,
      right: obs.x + obsHalfW,
      top: obs.y - obsHalfH,
      bottom: obs.y + obsHalfH,
    };
    if (doEstateRectsOverlap(rect, obsRect)) {
      return false;
    }
  }

  return true;
}

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
 * Continuous physical collision and sliding drag engine:
 * - Sweeps from origin towards target.
 * - When an obstacle is hit, clamps motion flush against the obstacle edge (NEVER jumping back to start).
 * - Allows fluid multi-axis sliding around obstacle corners.
 * - Snaps to 0.5m grid and magnetically snaps to adjacent obstacle borders.
 */
export function snapAndClampEstateMove(
  itemId: string,
  rawTargetX: number,
  rawTargetY: number,
  itemW: number,
  itemH: number,
  originX: number,
  originY: number,
  allObstacles: EstateObstacle[],
  worldWidthM: number,
  worldHeightM: number
): { x: number; y: number } {
  const halfW = itemW / 2;
  const halfH = itemH / 2;
  const otherObstacles = allObstacles.filter((o) => o.id !== itemId);

  // 1. Grid snap target (0.5m)
  let targetX = Math.round(rawTargetX * 2) / 2;
  let targetY = Math.round(rawTargetY * 2) / 2;

  // 2. Magnetic edge snapping for canvas boundaries
  if (Math.abs(targetX - halfW) < ESTATE_EDGE_SNAP_THRESHOLD) {
    targetX = halfW;
  } else if (Math.abs(targetX - (worldWidthM - halfW)) < ESTATE_EDGE_SNAP_THRESHOLD) {
    targetX = worldWidthM - halfW;
  }

  if (Math.abs(targetY - halfH) < ESTATE_EDGE_SNAP_THRESHOLD) {
    targetY = halfH;
  } else if (Math.abs(targetY - (worldHeightM - halfH)) < ESTATE_EDGE_SNAP_THRESHOLD) {
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
      if (Math.abs(targetX - (oLeft - halfW)) < ESTATE_EDGE_SNAP_THRESHOLD) {
        targetX = oLeft - halfW;
      } else if (Math.abs(targetX - (oRight + halfW)) < ESTATE_EDGE_SNAP_THRESHOLD) {
        targetX = oRight + halfW;
      }
    }

    // Y alignment snap
    if (targetX + halfW > oLeft - 0.2 && targetX - halfW < oRight + 0.2) {
      if (Math.abs(targetY - (oTop - halfH)) < ESTATE_EDGE_SNAP_THRESHOLD) {
        targetY = oTop - halfH;
      } else if (Math.abs(targetY - (oBottom + halfH)) < ESTATE_EDGE_SNAP_THRESHOLD) {
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
 * Free-flight dragging engine for Estate Canvas:
 * - Snaps to 0.5m grid.
 * - Magnetically snaps to canvas borders and adjacent obstacle borders.
 * - Clamps strictly inside estate world bounds.
 * - DOES NOT block flight over existing parcels/facilities (items can freely cross).
 */
export function freeDragSnapAndClampEstate(
  itemId: string,
  rawTargetX: number,
  rawTargetY: number,
  itemW: number,
  itemH: number,
  allObstacles: EstateObstacle[],
  worldWidthM: number,
  worldHeightM: number
): { x: number; y: number } {
  const halfW = itemW / 2;
  const halfH = itemH / 2;
  const otherObstacles = allObstacles.filter((o) => o.id !== itemId);

  // 1. Grid snap target (0.5m)
  let targetX = Math.round(rawTargetX * 2) / 2;
  let targetY = Math.round(rawTargetY * 2) / 2;

  // 2. Magnetic edge snapping for canvas boundaries
  if (Math.abs(targetX - halfW) < ESTATE_EDGE_SNAP_THRESHOLD) {
    targetX = halfW;
  } else if (Math.abs(targetX - (worldWidthM - halfW)) < ESTATE_EDGE_SNAP_THRESHOLD) {
    targetX = worldWidthM - halfW;
  }

  if (Math.abs(targetY - halfH) < ESTATE_EDGE_SNAP_THRESHOLD) {
    targetY = halfH;
  } else if (Math.abs(targetY - (worldHeightM - halfH)) < ESTATE_EDGE_SNAP_THRESHOLD) {
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
      if (Math.abs(targetX - (oLeft - halfW)) < ESTATE_EDGE_SNAP_THRESHOLD) {
        targetX = oLeft - halfW;
      } else if (Math.abs(targetX - (oRight + halfW)) < ESTATE_EDGE_SNAP_THRESHOLD) {
        targetX = oRight + halfW;
      }
    }

    // Y alignment snap
    if (targetX + halfW > oLeft - 0.2 && targetX - halfW < oRight + 0.2) {
      if (Math.abs(targetY - (oTop - halfH)) < ESTATE_EDGE_SNAP_THRESHOLD) {
        targetY = oTop - halfH;
      } else if (Math.abs(targetY - (oBottom + halfH)) < ESTATE_EDGE_SNAP_THRESHOLD) {
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
 * Check if candidate placement overlaps any existing estate obstacle.
 */
export function doesEstateItemCollide(
  candidate: { id?: string; x: number; y: number; widthM: number; heightM: number },
  allObstacles: EstateObstacle[]
): boolean {
  const halfW = candidate.widthM / 2;
  const halfH = candidate.heightM / 2;
  const rect = {
    left: candidate.x - halfW,
    right: candidate.x + halfW,
    top: candidate.y - halfH,
    bottom: candidate.y + halfH,
  };
  for (const obs of allObstacles) {
    if (candidate.id && obs.id === candidate.id) continue;
    const obsHalfW = obs.widthM / 2;
    const obsHalfH = obs.heightM / 2;
    const obsRect = {
      left: obs.x - obsHalfW,
      right: obs.x + obsHalfW,
      top: obs.y - obsHalfH,
      bottom: obs.y + obsHalfH,
    };
    if (doEstateRectsOverlap(rect, obsRect)) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate resizable bounds clamped to neighboring obstacles and canvas boundaries.
 */
export function snapAndClampEstateResize(
  facilityId: string,
  dir: ResizeDirection,
  startW: number,
  startH: number,
  startX: number,
  startY: number,
  dxM: number,
  dyM: number,
  allObstacles: EstateObstacle[],
  worldWidthM: number,
  worldHeightM: number
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

  // Determine requested changes with 0.5m grid snap
  if (dir.includes('right')) {
    const rawRight = startRect.right + dxM;
    newRight = Math.round(rawRight * 2) / 2;
  }
  if (dir.includes('left')) {
    const rawLeft = startRect.left + dxM;
    newLeft = Math.round(rawLeft * 2) / 2;
  }
  if (dir.includes('bottom')) {
    const rawBottom = startRect.bottom + dyM;
    newBottom = Math.round(rawBottom * 2) / 2;
  }
  if (dir.includes('top')) {
    const rawTop = startRect.top + dyM;
    newTop = Math.round(rawTop * 2) / 2;
  }

  const otherObstacles = allObstacles.filter((obs) => obs.id !== facilityId);

  // Clamp RIGHT expansion
  if (dir.includes('right')) {
    let maxAllowedRight = worldWidthM;
    for (const other of otherObstacles) {
      const oHalfW = other.widthM / 2;
      const oHalfH = other.heightM / 2;
      const oLeft = other.x - oHalfW;
      const oTop = other.y - oHalfH;
      const oBottom = other.y + oHalfH;

      if (newTop < oBottom - EPSILON && newBottom > oTop + EPSILON) {
        if (oLeft >= startRect.left - EPSILON) {
          maxAllowedRight = Math.min(maxAllowedRight, oLeft);
        }
      }
    }
    newRight = Math.min(newRight, maxAllowedRight);
    if (newRight - newLeft < MIN_FACILITY_DIMENSION_M) {
      newRight = newLeft + MIN_FACILITY_DIMENSION_M;
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
    if (newRight - newLeft < MIN_FACILITY_DIMENSION_M) {
      newLeft = newRight - MIN_FACILITY_DIMENSION_M;
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
    if (newBottom - newTop < MIN_FACILITY_DIMENSION_M) {
      newBottom = newTop + MIN_FACILITY_DIMENSION_M;
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
    if (newBottom - newTop < MIN_FACILITY_DIMENSION_M) {
      newTop = newBottom - MIN_FACILITY_DIMENSION_M;
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

/**
 * Automatically scans the estate to find a collision-free placement coordinate for a block.
 */
export function findOpenEstatePosition(
  widthM: number,
  heightM: number,
  allObstacles: EstateObstacle[],
  worldWidthM: number,
  worldHeightM: number
): { x: number; y: number } {
  // Try center first
  const centerX = Math.round((worldWidthM / 2) * 2) / 2;
  const centerY = Math.round((worldHeightM / 2) * 2) / 2;
  if (
    isValidEstatePlacement(
      { x: centerX, y: centerY, widthM, heightM },
      allObstacles,
      worldWidthM,
      worldHeightM
    )
  ) {
    return { x: centerX, y: centerY };
  }

  // Scan grid with 2m edge margin in 1m steps
  const margin = 2.0;
  const minX = widthM / 2 + margin;
  const maxX = worldWidthM - widthM / 2 - margin;
  const minY = heightM / 2 + margin;
  const maxY = worldHeightM - heightM / 2 - margin;

  for (let y = minY; y <= maxY; y += 1.0) {
    for (let x = minX; x <= maxX; x += 1.0) {
      const snapX = Math.round(x * 2) / 2;
      const snapY = Math.round(y * 2) / 2;
      if (
        isValidEstatePlacement(
          { x: snapX, y: snapY, widthM, heightM },
          allObstacles,
          worldWidthM,
          worldHeightM
        )
      ) {
        return { x: snapX, y: snapY };
      }
    }
  }

  return { x: centerX, y: centerY };
}

const CORNER_ANCHORS: { dir: ResizeDirection; ax: number; ay: number }[] = [
  { dir: 'top-left', ax: 0, ay: 0 },
  { dir: 'top-right', ax: 1, ay: 0 },
  { dir: 'bottom-right', ax: 1, ay: 1 },
  { dir: 'bottom-left', ax: 0, ay: 1 },
];

const MIN_FACILITY_DIMENSION_M = 1.5;

function renderFacilityIcon(iconName?: string, size = 16) {
  switch (iconName) {
    case 'wrench':
      return <Wrench size={size} color="#FFFFFF" strokeWidth={2.4} />;
    case 'flask':
      return <FlaskConical size={size} color="#FFFFFF" strokeWidth={2.4} />;
    case 'sprout':
      return <Sprout size={size} color="#FFFFFF" strokeWidth={2.4} />;
    case 'recycle':
      return <Recycle size={size} color="#FFFFFF" strokeWidth={2.4} />;
    case 'home':
      return <Home size={size} color="#FFFFFF" strokeWidth={2.4} />;
    case 'egg':
      return <Egg size={size} color="#FFFFFF" strokeWidth={2.4} />;
    case 'box':
      return <Box size={size} color="#FFFFFF" strokeWidth={2.4} />;
    case 'building':
    case 'building2':
      return <Building2 size={size} color="#FFFFFF" strokeWidth={2.4} />;
    default:
      return <Package size={size} color="#FFFFFF" strokeWidth={2.4} />;
  }
}

type CachedEstateState = {
  estate: FarmEstateRecord | null;
  allFarms: any[];
  farmLayoutsMap: Map<string, LoadedLayout>;
  timestamp: number;
};
let cachedEstateState: CachedEstateState | null = null;

export function EstateDesignerCanvas({ onBack, onOpenFacilities }: EstateDesignerCanvasProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [isLoading, setIsLoading] = useState(!cachedEstateState);
  const [isSaving, setIsSaving] = useState(false);
  const [estate, setEstate] = useState<FarmEstateRecord | null>(cachedEstateState?.estate || null);
  const [estateName, setEstateName] = useState(cachedEstateState?.estate?.estate_name || 'Farm Estate');
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(cachedEstateState?.estate?.estate_name || 'Farm Estate');

  // Canvas Dimensions
  const [worldWidthM, setWorldWidthM] = useState(cachedEstateState?.estate?.layout_data?.widthM || 60);
  const [worldHeightM, setWorldHeightM] = useState(cachedEstateState?.estate?.layout_data?.heightM || 60);

  const canvasPixelW = CANVAS_PADDING * 2 + worldWidthM * PIXELS_PER_UNIT;
  const canvasPixelH = CANVAS_PADDING * 2 + worldHeightM * PIXELS_PER_UNIT;

  // Active farms & loaded layouts
  const [allFarms, setAllFarms] = useState<any[]>(cachedEstateState?.allFarms || []);
  const [farmLayoutsMap, setFarmLayoutsMap] = useState<Map<string, LoadedLayout>>(
    cachedEstateState?.farmLayoutsMap || new Map()
  );

  // Placed elements
  const [placedFarms, setPlacedFarms] = useState<EstatePlacedFarm[]>(
    cachedEstateState?.estate?.layout_data?.placedFarms || []
  );
  const [placedFacilities, setPlacedFacilities] = useState<EstateFacility[]>(
    cachedEstateState?.estate?.layout_data?.facilities || []
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'farm' | 'facility' | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Active facility for inventory modal sheet
  const [activeFacilityForInventory, setActiveFacilityForInventory] = useState<EstateFacility | null>(null);
  const [isInventorySheetOpen, setIsInventorySheetOpen] = useState(false);
  const [isFacilitySettingsModalOpen, setIsFacilitySettingsModalOpen] = useState(false);

  // Viewport Pan/Zoom Engine
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(0.55)).current;
  const _lastPan = useRef({ x: 0, y: 0 });
  const _panStart = useRef({ x: 0, y: 0 });
  const _lastScale = useRef(0.55);
  const _initDistance = useRef(0);

  // Viewport measurements for absolute screen-to-canvas coordinate mapping
  const viewportRef = useRef<View>(null);
  const viewportWindowOffset = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isInitialFitDone, setIsInitialFitDone] = useState(false);
  const [currentZoomScale, setCurrentZoomScale] = useState(0.55);

  // Fit scale calculation (fits the full canvas into viewport)
  const fitScale =
    viewportSize.width > 0 && viewportSize.height > 0 && canvasPixelW > 0 && canvasPixelH > 0
      ? Math.min(viewportSize.width / canvasPixelW, viewportSize.height / canvasPixelH) * 0.94
      : 0.55;
  const minScale = fitScale;

  // Drag placement from bottom dock state
  const [activeDrag, setActiveDrag] = useState<ActiveEstateDrag | null>(null);
  const activeDragRef = useRef<ActiveEstateDrag | null>(null);
  const isDraggingItemRef = useRef(false);

  // Tool Mode: 'select' (default) vs 'pan' (hand tool — view navigation only)
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const lastNotifiedScale = useRef(0.55);

  // Sync pan & scale listeners (throttled to avoid 60fps re-render overhead)
  useEffect(() => {
    const pId = pan.addListener((v) => {
      _lastPan.current = v;
    });
    const sId = scale.addListener((v) => {
      _lastScale.current = v.value;
      if (Math.abs(v.value - lastNotifiedScale.current) > 0.08) {
        lastNotifiedScale.current = v.value;
        setCurrentZoomScale(v.value);
      }
    });
    return () => {
      pan.removeListener(pId);
      scale.removeListener(sId);
    };
  }, [pan, scale]);

  // Initial fit to center the canvas in the viewport
  useEffect(() => {
    if (viewportSize.width > 0 && viewportSize.height > 0 && !isInitialFitDone) {
      scale.setValue(minScale);
      pan.setValue({ x: 0, y: 0 });
      _lastScale.current = minScale;
      _lastPan.current = { x: 0, y: 0 };
      setCurrentZoomScale(minScale);
      setIsInitialFitDone(true);
    }
  }, [viewportSize.width, viewportSize.height, isInitialFitDone, minScale, scale, pan]);

  // Adapt scale if canvas size changes
  useEffect(() => {
    if (isInitialFitDone && minScale > 0 && _lastScale.current < minScale) {
      Animated.spring(scale, {
        toValue: minScale,
        useNativeDriver: false,
        friction: 8,
        tension: 40,
      }).start();
      _lastScale.current = minScale;
      setCurrentZoomScale(minScale);
    }
  }, [minScale, isInitialFitDone, scale]);

  // 1. Initial Load and Validation
  const loadEstateData = useCallback(async () => {
    if (!user) return;
    try {
      if (!cachedEstateState) {
        setIsLoading(true);
      }
      const [fetchedFarms, loadedEstate] = await Promise.all([
        getFarmsByUser(user.id),
        getFarmEstateLayout(user.id),
      ]);

      setAllFarms(fetchedFarms);

      // Load full layout (plots, zones, facilities) for each farm
      const layoutsMap = new Map<string, LoadedLayout>();
      await Promise.all(
        fetchedFarms.map(async (f) => {
          const l = await loadFarmLayout(f.id);
          if (l) layoutsMap.set(f.id, l);
        })
      );
      setFarmLayoutsMap(layoutsMap);

      if (loadedEstate) {
        // Run validation against active farms
        const validation = validateAndSyncEstateLayout(loadedEstate, fetchedFarms);
        if (validation.hasChanges) {
          Alert.alert(
            'Estate Map Reconciled',
            'There are Farm Area layouts and Facilities Changes this is now the new map'
          );
          // Persist the clean synced estate
          void saveFarmEstateLayout(
            validation.syncedEstate.id,
            user.id,
            validation.syncedEstate.estate_name,
            validation.syncedEstate.layout_data
          );
        }

        cachedEstateState = {
          estate: validation.syncedEstate,
          allFarms: fetchedFarms,
          farmLayoutsMap: layoutsMap,
          timestamp: Date.now(),
        };

        setEstate(validation.syncedEstate);
        setEstateName(validation.syncedEstate.estate_name);
        setNameInput(validation.syncedEstate.estate_name);
        setWorldWidthM(validation.syncedEstate.layout_data.widthM || 60);
        setWorldHeightM(validation.syncedEstate.layout_data.heightM || 60);
        setPlacedFarms(validation.syncedEstate.layout_data.placedFarms || []);
        setPlacedFacilities(validation.syncedEstate.layout_data.facilities || []);
      } else {
        // Create initial default estate layout
        const initial = await saveFarmEstateLayout(null, user.id, 'My Farm Estate', {
          widthM: 60,
          heightM: 60,
          placedFarms: [],
          facilities: [],
        });
        cachedEstateState = {
          estate: initial,
          allFarms: fetchedFarms,
          farmLayoutsMap: layoutsMap,
          timestamp: Date.now(),
        };
        setEstate(initial);
        setEstateName(initial.estate_name);
        setNameInput(initial.estate_name);
        setWorldWidthM(60);
        setWorldHeightM(60);
      }
    } catch (err) {
      console.error('[EstateCanvas] Error loading estate data:', err);
      Alert.alert('Error', 'Failed to load farm estate layout.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadEstateData();
  }, [loadEstateData]);

  // Available farms for dock (using auto-adjusted bounds)
  const availableFarmsForDock: AvailableFarmLayoutItem[] = useMemo(() => {
    const placedSet = new Set(placedFarms.map((pf) => pf.farmId));
    const PALETTES = ['#2D6A4F', '#8C4522', '#1E40AF', '#B45309', '#047857', '#6D28D9'];

    return allFarms
      .filter((f) => farmLayoutsMap.has(f.id))
      .map((f, idx) => {
        const layout = farmLayoutsMap.get(f.id);
        const bounds = getFarmOccupiedBounds(layout);
        return {
          id: f.id,
          name: f.farm_name,
          widthM: bounds.widthM,
          heightM: bounds.heightM,
          plotCount: layout?.plots?.length || 0,
          color: PALETTES[idx % PALETTES.length],
          isPlaced: placedSet.has(f.id),
        };
      });
  }, [allFarms, farmLayoutsMap, placedFarms]);

  // Memoized obstacle list combining placed farm areas (with tight auto-adjusted bounds) and central facilities
  const allEstateObstacles: EstateObstacle[] = useMemo(() => {
    const obstacles: EstateObstacle[] = [];

    placedFarms.forEach((pf) => {
      const farmObj = allFarms.find((f) => f.id === pf.farmId);
      const layoutObj = farmLayoutsMap.get(pf.farmId);
      const bounds = getFarmOccupiedBounds(layoutObj);
      obstacles.push({
        id: pf.farmId,
        type: 'farm',
        name: farmObj?.farm_name || 'Farm Area',
        x: pf.x,
        y: pf.y,
        widthM: bounds.widthM,
        heightM: bounds.heightM,
      });
    });

    placedFacilities.forEach((fac) => {
      obstacles.push({
        id: fac.id,
        type: 'facility',
        name: fac.name,
        x: fac.x,
        y: fac.y,
        widthM: fac.widthM,
        heightM: fac.heightM,
      });
    });

    return obstacles;
  }, [placedFarms, placedFacilities, allFarms, farmLayoutsMap]);

  // Selected farm details for Action Dock
  const selectedFarm = useMemo(() => {
    if (selectedType !== 'farm' || !selectedId) return null;
    const pf = placedFarms.find((p) => p.farmId === selectedId);
    if (!pf) return null;
    const farmObj = allFarms.find((f) => f.id === pf.farmId);
    return {
      id: pf.farmId,
      name: farmObj?.farm_name || 'Farm Parcel',
      x: pf.x,
      y: pf.y,
      isLocked: pf.isLocked,
    };
  }, [selectedType, selectedId, placedFarms, allFarms]);

  const selectedFarmLayout = useMemo(() => {
    if (selectedType !== 'farm' || !selectedId) return null;
    return farmLayoutsMap.get(selectedId) || null;
  }, [selectedType, selectedId, farmLayoutsMap]);

  const selectedFarmBounds = useMemo(() => {
    return getFarmOccupiedBounds(selectedFarmLayout);
  }, [selectedFarmLayout]);

  const selectedFacility = useMemo(() => {
    if (selectedType !== 'facility' || !selectedId) return null;
    return placedFacilities.find((f) => f.id === selectedId) || null;
  }, [selectedType, selectedId, placedFacilities]);

  const isSelectedLocked = useMemo(() => {
    if (selectedType === 'farm' && selectedFarm) return !!selectedFarm.isLocked;
    if (selectedType === 'facility' && selectedFacility) return !!selectedFacility.isLocked;
    return false;
  }, [selectedType, selectedFarm, selectedFacility]);

  const handleToggleLockSelected = useCallback(() => {
    if (!selectedId || !selectedType) return;
    if (selectedType === 'farm') {
      setPlacedFarms((prev) =>
        prev.map((f) => (f.farmId === selectedId ? { ...f, isLocked: !f.isLocked } : f))
      );
      setHasUnsavedChanges(true);
    } else if (selectedType === 'facility') {
      setPlacedFacilities((prev) =>
        prev.map((fac) => (fac.id === selectedId ? { ...fac, isLocked: !fac.isLocked } : fac))
      );
      setHasUnsavedChanges(true);
    }
  }, [selectedId, selectedType]);

  const handleZoomIn = useCallback(() => {
    const nextScale = Math.min(1.8, _lastScale.current * 1.15);
    Animated.spring(scale, {
      toValue: nextScale,
      useNativeDriver: false,
      friction: 10,
      tension: 35,
    }).start();
  }, [scale]);

  const handleZoomOut = useCallback(() => {
    const nextScale = Math.max(minScale, _lastScale.current / 1.15);
    Animated.spring(scale, {
      toValue: nextScale,
      useNativeDriver: false,
      friction: 10,
      tension: 35,
    }).start();
  }, [scale, minScale]);

  const handleFitCanvas = useCallback(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: minScale,
        useNativeDriver: false,
        friction: 7,
        tension: 40,
      }),
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
        friction: 7,
        tension: 40,
      }),
    ]).start();
  }, [scale, pan, minScale]);

  /**
   * Converts touch coordinates to snapped meters on the estate canvas.
   */
  const screenToCanvasWorld = useCallback(
    (screenX: number, screenY: number, itemWidthM: number, itemHeightM: number) => {
      const vp = viewportWindowOffset.current;
      if (!vp.width || !vp.height) {
        return { worldX: worldWidthM / 2, worldY: worldHeightM / 2, isInside: false };
      }

      const touchV_x = screenX - vp.x;
      const touchV_y = screenY - vp.y;

      const isInside =
        touchV_x >= 0 && touchV_x <= vp.width && touchV_y >= 0 && touchV_y <= vp.height;

      const V_cx = vp.width / 2;
      const V_cy = vp.height / 2;

      const curPan = _lastPan.current;
      const curScale = _lastScale.current > 0 ? _lastScale.current : 0.55;

      const dx = (touchV_x - V_cx - curPan.x) / curScale;
      const dy = (touchV_y - V_cy - curPan.y) / curScale;

      const px = canvasPixelW / 2 + dx;
      const py = canvasPixelH / 2 + dy;

      const worldX_raw = (px - CANVAS_PADDING) / PIXELS_PER_UNIT;
      const worldY_raw = (py - CANVAS_PADDING) / PIXELS_PER_UNIT;

      const snappedX = Math.round(worldX_raw / GRID_CELL_SIZE) * GRID_CELL_SIZE;
      const snappedY = Math.round(worldY_raw / GRID_CELL_SIZE) * GRID_CELL_SIZE;

      const halfW = itemWidthM / 2;
      const halfH = itemHeightM / 2;
      const clampedX = Math.max(halfW, Math.min(worldWidthM - halfW, snappedX));
      const clampedY = Math.max(halfH, Math.min(worldHeightM - halfH, snappedY));

      return {
        worldX: clampedX,
        worldY: clampedY,
        isInside,
      };
    },
    [worldWidthM, worldHeightM, canvasPixelW, canvasPixelH]
  );

  // Two-Finger Pinch & Viewport Pan Responder
  const canvasPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (toolMode === 'pan') return true;
          return evt.nativeEvent.touches.length >= 2;
        },
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          if (isDraggingItemRef.current) return false;
          if (toolMode === 'pan') return true;
          if (evt.nativeEvent.touches.length >= 2) return true;
          return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
        },
        onPanResponderGrant: (evt) => {
          _panStart.current = { x: _lastPan.current.x, y: _lastPan.current.y };
          if (evt.nativeEvent.touches.length === 2) {
            const [t0, t1] = evt.nativeEvent.touches;
            const dist = Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY);
            _initDistance.current = dist;
          }
        },
        onPanResponderMove: (evt, gestureState) => {
          if (isDraggingItemRef.current) return;

          // Pinch zoom
          if (evt.nativeEvent.touches.length === 2) {
            const [t0, t1] = evt.nativeEvent.touches;
            const dist = Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY);
            if (_initDistance.current > 0) {
              const rawRatio = dist / _initDistance.current;
              // Damped pinch zoom: calm, slow, and precise
              const dampedRatio = 1 + (rawRatio - 1) * 0.40;
              const newScale = Math.min(1.8, Math.max(minScale, _lastScale.current * dampedRatio));
              scale.setValue(newScale);
            }
            return;
          }

          // Single finger pan (scale-invariant: divides by scale so panning is never fast when zoomed in)
          const curScale = _lastScale.current > 0 ? _lastScale.current : 1;
          const PAN_SPEED = 0.85;
          const scaledDx = (gestureState.dx / curScale) * PAN_SPEED;
          const scaledDy = (gestureState.dy / curScale) * PAN_SPEED;

          const newX = _panStart.current.x + scaledDx;
          const newY = _panStart.current.y + scaledDy;

          const renderedW = canvasPixelW * _lastScale.current;
          const renderedH = canvasPixelH * _lastScale.current;

          const maxPanX =
            renderedW > viewportSize.width ? (renderedW - viewportSize.width) / 2 + 30 : 0;
          const maxPanY =
            renderedH > viewportSize.height ? (renderedH - viewportSize.height) / 2 + 30 : 0;

          const clampedX = Math.max(-maxPanX, Math.min(maxPanX, newX));
          const clampedY = Math.max(-maxPanY, Math.min(maxPanY, newY));

          pan.setValue({ x: clampedX, y: clampedY });
        },
        onPanResponderRelease: () => {
          if (isDraggingItemRef.current) return;
          setCurrentZoomScale(_lastScale.current);
          const renderedW = canvasPixelW * _lastScale.current;
          const renderedH = canvasPixelH * _lastScale.current;

          const maxPanX =
            renderedW > viewportSize.width ? (renderedW - viewportSize.width) / 2 + 20 : 0;
          const maxPanY =
            renderedH > viewportSize.height ? (renderedH - viewportSize.height) / 2 + 20 : 0;

          const clampedX = Math.max(-maxPanX, Math.min(maxPanX, _lastPan.current.x));
          const clampedY = Math.max(-maxPanY, Math.min(maxPanY, _lastPan.current.y));

          if (clampedX !== _lastPan.current.x || clampedY !== _lastPan.current.y) {
            Animated.spring(pan, {
              toValue: { x: clampedX, y: clampedY },
              useNativeDriver: false,
              friction: 8,
              tension: 40,
            }).start();
          }
          _initDistance.current = 0;
        },
      }),
    [pan, scale, canvasPixelW, canvasPixelH, minScale, viewportSize, toolMode]
  );

  // ─── Placement Actions ─────────────────────────────────────────
  const handlePlaceFarm = useCallback(
    (farmItem: AvailableFarmLayoutItem, targetPos?: { x: number; y: number }) => {
      if (placedFarms.some((pf) => pf.farmId === farmItem.id)) {
        return;
      }

      let newPos = targetPos;
      if (newPos) {
        const isValid = isValidEstatePlacement(
          { x: newPos.x, y: newPos.y, widthM: farmItem.widthM, heightM: farmItem.heightM },
          allEstateObstacles,
          worldWidthM,
          worldHeightM
        );
        if (!isValid) {
          try {
            Vibration.vibrate(Platform.OS === 'android' ? [0, 40, 40, 40] : 30);
          } catch {}
          return;
        }
      } else {
        newPos = findOpenEstatePosition(
          farmItem.widthM,
          farmItem.heightM,
          allEstateObstacles,
          worldWidthM,
          worldHeightM
        );
      }

      setPlacedFarms((prev) => [...prev, { farmId: farmItem.id, x: newPos!.x, y: newPos!.y }]);
      setSelectedId(farmItem.id);
      setSelectedType('farm');
      setHasUnsavedChanges(true);
    },
    [placedFarms, allEstateObstacles, worldWidthM, worldHeightM]
  );

  const handlePlaceFacility = useCallback(
    (template: FacilityTemplate, targetPos?: { x: number; y: number }) => {
      const facW = template.defaultWidthM || 4;
      const facH = template.defaultHeightM || 4;

      let newPos = targetPos;
      if (newPos) {
        const isValid = isValidEstatePlacement(
          { x: newPos.x, y: newPos.y, widthM: facW, heightM: facH },
          allEstateObstacles,
          worldWidthM,
          worldHeightM
        );
        if (!isValid) {
          try {
            Vibration.vibrate(Platform.OS === 'android' ? [0, 40, 40, 40] : 30);
          } catch {}
          return;
        }
      } else {
        newPos = findOpenEstatePosition(
          facW,
          facH,
          allEstateObstacles,
          worldWidthM,
          worldHeightM
        );
      }

      const newFacility: EstateFacility = {
        id: generateUUID(),
        name: template.name,
        category: template.category,
        widthM: facW,
        heightM: facH,
        x: newPos.x,
        y: newPos.y,
        color: template.color,
        icon: template.icon,
        facilityFunction: 'none',
        hasInventory: false,
        hasSchedule: false,
        inventoryName: `${template.name} Inventory`,
        scheduleName: `${template.name} Schedule`,
        inventories: [],
        timeLogs: [],
      };

      setPlacedFacilities((prev) => [...prev, newFacility]);
      setSelectedId(newFacility.id);
      setSelectedType('facility');
      setHasUnsavedChanges(true);
    },
    [allEstateObstacles, worldWidthM, worldHeightM]
  );

  const handleToggleFacilityInventory = useCallback((facilityId: string, enabled: boolean) => {
    setPlacedFacilities((prev) =>
      prev.map((f) => {
        if (f.id !== facilityId) return f;
        const currentSched =
          f.hasSchedule ??
          (f.facilityFunction === 'time_keeping' || f.facilityFunction === 'both');

        let newRole: EstateFacilityFunction = 'none';
        if (enabled && currentSched) newRole = 'both';
        else if (enabled && !currentSched) newRole = 'inventory';
        else if (!enabled && currentSched) newRole = 'time_keeping';
        else newRole = 'none';

        return {
          ...f,
          hasInventory: enabled,
          hasSchedule: currentSched,
          facilityFunction: newRole,
          inventoryName: f.inventoryName || `${f.name} Inventory`,
          inventories: enabled ? (f.inventories || []) : [],
        };
      })
    );
    setHasUnsavedChanges(true);
  }, []);

  const handleToggleFacilitySchedule = useCallback((facilityId: string, enabled: boolean) => {
    setPlacedFacilities((prev) =>
      prev.map((f) => {
        if (f.id !== facilityId) return f;
        const currentInv =
          f.hasInventory ??
          (f.facilityFunction === 'inventory' || f.facilityFunction === 'both');

        let newRole: EstateFacilityFunction = 'none';
        if (currentInv && enabled) newRole = 'both';
        else if (currentInv && !enabled) newRole = 'inventory';
        else if (!currentInv && enabled) newRole = 'time_keeping';
        else newRole = 'none';

        return {
          ...f,
          hasInventory: currentInv,
          hasSchedule: enabled,
          facilityFunction: newRole,
          scheduleName: f.scheduleName || `${f.name} Schedule`,
          timeLogs: enabled ? (f.timeLogs || []) : [],
        };
      })
    );
    setHasUnsavedChanges(true);
  }, []);

  const handleUpdateFacilityInventoryName = useCallback((facilityId: string, inventoryName: string) => {
    setPlacedFacilities((prev) =>
      prev.map((f) => (f.id === facilityId ? { ...f, inventoryName } : f))
    );
    setHasUnsavedChanges(true);
  }, []);

  const handleUpdateFacilityScheduleName = useCallback((facilityId: string, scheduleName: string) => {
    setPlacedFacilities((prev) =>
      prev.map((f) => (f.id === facilityId ? { ...f, scheduleName } : f))
    );
    setHasUnsavedChanges(true);
  }, []);

  const handleRenameFacility = useCallback((facilityId: string, newName: string) => {
    setPlacedFacilities((prev) =>
      prev.map((f) => (f.id === facilityId ? { ...f, name: newName } : f))
    );
    setHasUnsavedChanges(true);
  }, []);

  const handleSaveFacilitySizeAndRole = useCallback(
    (facilityId: string, widthM: number, heightM: number, role: FacilityFunction) => {
      const hasInv = role === 'inventory' || role === 'both';
      const hasSched = role === 'time_keeping' || role === 'both';

      setPlacedFacilities((prev) =>
        prev.map((f) =>
          f.id === facilityId
            ? {
                ...f,
                widthM,
                heightM,
                facilityFunction: role,
                hasInventory: hasInv,
                hasSchedule: hasSched,
                inventories: hasInv ? (f.inventories || []) : [],
                timeLogs: hasSched ? (f.timeLogs || []) : [],
              }
            : f
        )
      );
      setHasUnsavedChanges(true);
    },
    []
  );

  const handleResizeFacility = useCallback(
    (facilityId: string, newWidthM: number, newHeightM: number, newX: number, newY: number) => {
      setPlacedFacilities((prev) =>
        prev.map((f) =>
          f.id === facilityId
            ? { ...f, widthM: newWidthM, heightM: newHeightM, x: newX, y: newY }
            : f
        )
      );
      setHasUnsavedChanges(true);
    },
    []
  );

  const handleRemoveItem = useCallback((id: string, type: 'farm' | 'facility') => {
    if (type === 'farm') {
      setPlacedFarms((prev) => prev.filter((pf) => pf.farmId !== id));
    } else {
      setPlacedFacilities((prev) => prev.filter((f) => f.id !== id));
    }
    setSelectedId(null);
    setSelectedType(null);
    setHasUnsavedChanges(true);
  }, []);

  // ─── Reset / Remove All Farm Areas ────────────────────────────
  const handleResetFarmParcels = useCallback(() => {
    if (placedFarms.length === 0) return;
    Alert.alert(
      'Reset Farm Areas',
      `Remove all ${placedFarms.length} placed farm area${placedFarms.length === 1 ? '' : 's'} from the estate? Central facilities will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove All Farm Areas',
          style: 'destructive',
          onPress: () => {
            setPlacedFarms([]);
            if (selectedType === 'farm') {
              setSelectedId(null);
              setSelectedType(null);
            }
            setHasUnsavedChanges(true);
          },
        },
      ]
    );
  }, [placedFarms.length, selectedType]);

  // ─── Bottom Palette Drag Event Listeners ───────────────────────
  const handleDockDragStartFarm = useCallback(
    (farmItem: AvailableFarmLayoutItem, startPos: { x: number; y: number }) => {
      viewportRef.current?.measureInWindow((winX, winY, winW, winH) => {
        if (winW && winH) {
          viewportWindowOffset.current = { x: winX, y: winY, width: winW, height: winH };
        }
      });

      const res = screenToCanvasWorld(startPos.x, startPos.y, farmItem.widthM, farmItem.heightM);
      let isValid = res.isInside;
      if (isValid) {
        isValid = isValidEstatePlacement(
          { x: res.worldX, y: res.worldY, widthM: farmItem.widthM, heightM: farmItem.heightM },
          allEstateObstacles,
          worldWidthM,
          worldHeightM
        );
      }

      const state: ActiveEstateDrag = {
        type: 'farm',
        data: farmItem,
        screenPos: startPos,
        worldPos: res.isInside ? { x: res.worldX, y: res.worldY } : null,
        isValid,
      };
      activeDragRef.current = state;
      setActiveDrag(state);
    },
    [screenToCanvasWorld, allEstateObstacles, worldWidthM, worldHeightM]
  );

  const handleDockDragStartFacility = useCallback(
    (template: FacilityTemplate, startPos: { x: number; y: number }) => {
      viewportRef.current?.measureInWindow((winX, winY, winW, winH) => {
        if (winW && winH) {
          viewportWindowOffset.current = { x: winX, y: winY, width: winW, height: winH };
        }
      });

      const wM = template.defaultWidthM || 4;
      const hM = template.defaultHeightM || 4;
      const res = screenToCanvasWorld(startPos.x, startPos.y, wM, hM);
      let isValid = res.isInside;
      if (isValid) {
        isValid = isValidEstatePlacement(
          { x: res.worldX, y: res.worldY, widthM: wM, heightM: hM },
          allEstateObstacles,
          worldWidthM,
          worldHeightM
        );
      }

      const state: ActiveEstateDrag = {
        type: 'facility',
        data: template,
        screenPos: startPos,
        worldPos: res.isInside ? { x: res.worldX, y: res.worldY } : null,
        isValid,
      };
      activeDragRef.current = state;
      setActiveDrag(state);
    },
    [screenToCanvasWorld, allEstateObstacles, worldWidthM, worldHeightM]
  );

  const handleDockDragMove = useCallback(
    (screenPos: { x: number; y: number }) => {
      if (!activeDragRef.current) return;
      const cur = activeDragRef.current;
      const itemW = cur.type === 'farm' ? cur.data.widthM || 16 : cur.data.defaultWidthM || 4;
      const itemH = cur.type === 'farm' ? cur.data.heightM || 16 : cur.data.defaultHeightM || 4;

      const res = screenToCanvasWorld(screenPos.x, screenPos.y, itemW, itemH);
      let isValid = res.isInside;

      if (isValid) {
        isValid = isValidEstatePlacement(
          { x: res.worldX, y: res.worldY, widthM: itemW, heightM: itemH },
          allEstateObstacles,
          worldWidthM,
          worldHeightM
        );
      }

      const updated: ActiveEstateDrag = {
        ...cur,
        screenPos,
        worldPos: res.isInside ? { x: res.worldX, y: res.worldY } : null,
        isValid,
      };
      activeDragRef.current = updated;
      setActiveDrag(updated);
    },
    [screenToCanvasWorld, allEstateObstacles, worldWidthM, worldHeightM]
  );

  const handleDockDragEnd = useCallback(() => {
    const cur = activeDragRef.current;
    if (cur && cur.isValid && cur.worldPos) {
      if (cur.type === 'farm') {
        handlePlaceFarm(cur.data, cur.worldPos);
      } else {
        handlePlaceFacility(cur.data, cur.worldPos);
      }
      try {
        Vibration.vibrate(Platform.OS === 'android' ? 30 : 15);
      } catch {}
    } else if (cur && !cur.isValid) {
      try {
        Vibration.vibrate(Platform.OS === 'android' ? [0, 40, 40, 40] : 30);
      } catch {}
    }
    activeDragRef.current = null;
    setActiveDrag(null);
  }, [handlePlaceFarm, handlePlaceFacility]);

  // ─── Save Action ───────────────────────────────────────────────
  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const saved = await saveFarmEstateLayout(
        estate?.id,
        user.id,
        estateName,
        {
          widthM: worldWidthM,
          heightM: worldHeightM,
          placedFarms,
          facilities: placedFacilities,
        }
      );
      setEstate(saved);
      cachedEstateState = {
        estate: saved,
        allFarms,
        farmLayoutsMap,
        timestamp: Date.now(),
      };
      setHasUnsavedChanges(false);
      Alert.alert('Estate Saved', 'Your farm estate layout has been updated.');
    } catch (err) {
      console.error('[EstateCanvas] Save failed:', err);
      Alert.alert('Save Failed', 'Could not save the farm estate layout.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackPress = () => {
    if (hasUnsavedChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes on the estate layout. Are you sure you want to exit?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard & Exit',
            style: 'destructive',
            onPress: () => (onBack ? onBack() : router.back()),
          },
        ]
      );
    } else {
      if (onBack) onBack();
      else router.back();
    }
  };

  // Hardware-accelerated native grid lines
  const gridLines = useMemo(() => {
    const lines: ReactNode[] = [];
    const step = 2; // 2 meters per grid line

    // Vertical lines
    for (let m = step; m < worldWidthM; m += step) {
      const isMajor = m % 10 === 0;
      lines.push(
        <View
          key={`v-${m}`}
          style={{
            position: 'absolute',
            left: m * PIXELS_PER_UNIT,
            top: 0,
            bottom: 0,
            width: isMajor ? 1.5 : 1,
            backgroundColor: isMajor ? GRID_COLOR_MAJOR : GRID_COLOR_MINOR,
          }}
        />
      );
    }

    // Horizontal lines
    for (let m = step; m < worldHeightM; m += step) {
      const isMajor = m % 10 === 0;
      lines.push(
        <View
          key={`h-${m}`}
          style={{
            position: 'absolute',
            top: m * PIXELS_PER_UNIT,
            left: 0,
            right: 0,
            height: isMajor ? 1.5 : 1,
            backgroundColor: isMajor ? GRID_COLOR_MAJOR : GRID_COLOR_MINOR,
          }}
        />
      );
    }

    return lines;
  }, [worldWidthM, worldHeightM]);

  if (isLoading) {
    return <FarmMapSkeleton title="Farm Estate" />;
  }

  // Currently dragged item dimensions for footprint preview
  const dragItemW =
    activeDrag?.type === 'farm'
      ? activeDrag.data.widthM || 16
      : activeDrag?.data.defaultWidthM || 4;
  const dragItemH =
    activeDrag?.type === 'farm'
      ? activeDrag.data.heightM || 16
      : activeDrag?.data.defaultHeightM || 4;
  const dragItemName = activeDrag?.data.name || 'Item';
  const dragItemColor =
    activeDrag?.type === 'farm'
      ? activeDrag.data.color || '#2D6A4F'
      : activeDrag?.data.color || '#8C4522';
  const dragItemIcon = activeDrag?.type === 'farm' ? 'layers' : activeDrag?.data.icon || 'package';

  return (
    <View style={styles.root}>
      {/* ─── 1. Top Tactical Navigation Header ─── */}
      <View style={[styles.topHeader, { paddingTop: insets.top + 8 }]}>
        {/* Main Row: Back, Centered Title + Unsaved + Stats, Save */}
        <View style={styles.headerMainRow}>
          <Pressable onPress={handleBackPress} style={styles.iconButton}>
            <ArrowLeft size={18} color="#8C4522" strokeWidth={2.4} />
          </Pressable>

          <View style={styles.titleContainer}>
            {isRenaming ? (
              <View style={styles.renameRow}>
                <TextInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  autoFocus
                  style={styles.renameInput}
                />
                <Pressable
                  onPress={() => {
                    setEstateName(nameInput.trim() || 'Farm Estate');
                    setIsRenaming(false);
                    setHasUnsavedChanges(true);
                  }}
                  style={styles.renameCheck}>
                  <Check size={14} color="#047857" strokeWidth={2.4} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setIsRenaming(true)} style={styles.titleWrapper}>
                <View style={styles.titleTopRow}>
                  <Text style={styles.estateTitle} numberOfLines={1}>
                    {estateName}
                  </Text>
                  <Pencil size={11} color="#8C7C70" />
                  {hasUnsavedChanges && (
                    <View style={styles.unsavedBadge}>
                      <View style={styles.unsavedDot} />
                      <Text style={styles.unsavedText}>UNSAVED</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            )}
          </View>

          <View style={styles.headerRight}>
            {/* Save Button */}
            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              style={[styles.saveButton, hasUnsavedChanges && styles.saveButtonActive]}>
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Save size={13} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.saveButtonText}>Save</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* Sub-Row: Grid Area Size Stepper, Facilities Button & Reset Farm Areas */}
        <View style={styles.gridAreaRow}>
          <View style={styles.stepperContainer}>
            <Text style={styles.gridAreaLabel}>Area:</Text>
            <Pressable
              onPress={() => {
                setWorldWidthM((w) => Math.max(40, w - 10));
                setWorldHeightM((h) => Math.max(40, h - 10));
                setHasUnsavedChanges(true);
              }}
              disabled={worldWidthM <= 40}
              style={[styles.stepperButton, worldWidthM <= 40 && styles.stepperButtonDisabled]}>
              <Text style={styles.stepperText}>−</Text>
            </Pressable>
            <Text style={styles.gridAreaValue}>
              {worldWidthM}m × {worldHeightM}m
            </Text>
            <Pressable
              onPress={() => {
                setWorldWidthM((w) => Math.min(120, w + 10));
                setWorldHeightM((h) => Math.min(120, h + 10));
                setHasUnsavedChanges(true);
              }}
              disabled={worldWidthM >= 120}
              style={[styles.stepperButton, worldWidthM >= 120 && styles.stepperButtonDisabled]}>
              <Text style={styles.stepperText}>+</Text>
            </Pressable>
          </View>

          <View style={styles.subRowActions}>
            {/* Facilities Button (Multi-farm facilities handler) */}
            <Pressable
              onPress={() => {
                if (estate?.id) {
                  if (onOpenFacilities) {
                    onOpenFacilities(estate.id);
                  } else {
                    router.push(`/farm/facilities/${estate.id}?fromEstate=true`);
                  }
                }
              }}
              style={styles.subRowFacilitiesButton}>
              <Box size={11} color="#8C4522" strokeWidth={2.4} />
              <Text style={styles.subRowFacilitiesText}>Facilities</Text>
            </Pressable>

            {/* Reset Farm Areas Button */}
            {placedFarms.length > 0 && (
              <Pressable
                onPress={handleResetFarmParcels}
                style={styles.resetParcelsButton}>
                <RotateCcw size={10.5} color="#DC2626" strokeWidth={2.4} />
                <Text style={styles.resetParcelsText}>Reset</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* ─── 2. Canvas Viewport in the Middle (Pan & Pinch to Zoom) ─── */}
      {/* Left-side Floating Tool Palette (Pan / Select / Lock / Zoom) */}
      <CanvasToolPalette
        mode={toolMode}
        onModeChange={setToolMode}
        isSelectedLocked={isSelectedLocked}
        onToggleLockSelected={handleToggleLockSelected}
        hasSelectedElement={Boolean(selectedId)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitCanvas={handleFitCanvas}
      />

      <View
        {...canvasPanResponder.panHandlers}
        ref={viewportRef}
        onLayout={(e) => {
          const { width, height, x, y } = e.nativeEvent.layout;
          setViewportSize({ width, height });
          viewportRef.current?.measureInWindow((winX, winY, winW, winH) => {
            if (winW && winH) {
              viewportWindowOffset.current = { x: winX, y: winY, width: winW, height: winH };
            } else {
              viewportWindowOffset.current = { x, y: y + 90, width, height };
            }
          });
        }}
        style={styles.canvasViewportContainer}>
        <Animated.View
          style={[
            styles.canvasPlane,
            { width: canvasPixelW, height: canvasPixelH },
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { scale: scale },
              ],
            },
          ]}>
          <Pressable
            onPress={() => {
              setSelectedId(null);
              setSelectedType(null);
            }}
            style={{ flex: 1 }}>
            {/* Native Hardware-Accelerated Grid Base Board */}
            <View
              style={{
                position: 'absolute',
                left: CANVAS_PADDING,
                top: CANVAS_PADDING,
                width: worldWidthM * PIXELS_PER_UNIT,
                height: worldHeightM * PIXELS_PER_UNIT,
                backgroundColor: CANVAS_BG,
                borderColor: CANVAS_BORDER,
                borderWidth: 2,
                borderRadius: 16,
                overflow: 'hidden',
              }}
              pointerEvents="none">
              {gridLines}
            </View>

            {/* Placed Real Farm Parcels (Auto-adjusted to only used area dimensions) */}
            {placedFarms.map((pf) => {
              const farmObj = allFarms.find((f) => f.id === pf.farmId);
              const layoutObj = farmLayoutsMap.get(pf.farmId);
              const bounds = getFarmOccupiedBounds(layoutObj);
              const isSelected = selectedId === pf.farmId && selectedType === 'farm';

              return (
                <PlacedFarmParcelBlock
                  key={pf.farmId}
                  farmId={pf.farmId}
                  farmName={farmObj?.farm_name || 'Farm Parcel'}
                  currentX={pf.x}
                  currentY={pf.y}
                  bounds={bounds}
                  worldWidthM={worldWidthM}
                  worldHeightM={worldHeightM}
                  layout={layoutObj}
                  isSelected={isSelected}
                  zoomScale={currentZoomScale}
                  allObstacles={allEstateObstacles}
                  toolMode={toolMode}
                  isLocked={pf.isLocked}
                  onDragStart={() => {
                    isDraggingItemRef.current = true;
                  }}
                  onDragEnd={() => {
                    isDraggingItemRef.current = false;
                  }}
                  onSelect={() => {
                    setSelectedId(pf.farmId);
                    setSelectedType('farm');
                  }}
                  onMove={(newCenterM) => {
                    setPlacedFarms((prev) =>
                      prev.map((item) =>
                        item.farmId === pf.farmId ? { ...item, ...newCenterM } : item
                      )
                    );
                    setHasUnsavedChanges(true);
                  }}
                />
              );
            })}

            {/* Placed Estate Facilities (Matching Exact Farm Layout Facility Design with 4-Corner Resizing) */}
            {placedFacilities.map((fac) => {
              const isSelected = selectedId === fac.id && selectedType === 'facility';

              return (
                <PlacedFacilityBlock
                  key={fac.id}
                  facility={fac}
                  currentX={fac.x}
                  currentY={fac.y}
                  worldWidthM={worldWidthM}
                  worldHeightM={worldHeightM}
                  isSelected={isSelected}
                  zoomScale={currentZoomScale}
                  allObstacles={allEstateObstacles}
                  toolMode={toolMode}
                  isLocked={fac.isLocked}
                  onDragStart={() => {
                    isDraggingItemRef.current = true;
                  }}
                  onDragEnd={() => {
                    isDraggingItemRef.current = false;
                  }}
                  onSelect={() => {
                    setSelectedId(fac.id);
                    setSelectedType('facility');
                  }}
                  onMove={(newCenterM) => {
                    setPlacedFacilities((prev) =>
                      prev.map((item) => (item.id === fac.id ? { ...item, ...newCenterM } : item))
                    );
                    setHasUnsavedChanges(true);
                  }}
                  onResize={handleResizeFacility}
                  onOpenInventory={(f) => {
                    setActiveFacilityForInventory(f);
                    setIsInventorySheetOpen(true);
                  }}
                />
              );
            })}

            {/* Snapped Canvas Footprint when dragging from bottom dock */}
            {activeDrag && activeDrag.worldPos && (
              <EstateCanvasFootprint
                activeDrag={activeDrag}
                dragItemW={dragItemW}
                dragItemH={dragItemH}
                dragItemName={dragItemName}
              />
            )}
          </Pressable>
        </Animated.View>

        {/* Empty State Banner (Only when zero elements placed) */}
        {placedFarms.length === 0 && placedFacilities.length === 0 && (
          <View style={styles.emptyCanvasContainer} pointerEvents="none">
            <View style={styles.emptyIconBadge}>
              <Layers size={28} color="#8C4522" strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyCanvasTitle}>Your Estate Canvas is Empty</Text>
            <Text style={styles.emptyCanvasSubtitle}>
              Drag existing farm layouts or centralized facilities from the dock below onto the canvas.
            </Text>
          </View>
        )}
      </View>

      {/* ─── 3. Bottom Dock: Contextual Action Dock or Building Palette Dock ─── */}
      {selectedId && (selectedFarm || selectedFacility) ? (
        <EstateActionDock
          selectedType={selectedType!}
          selectedFarm={selectedFarm}
          selectedFarmBounds={selectedFarmBounds}
          selectedFarmLayout={selectedFarmLayout}
          selectedFacility={selectedFacility}
          isLocked={isSelectedLocked}
          onToggleLock={handleToggleLockSelected}
          onOpenFarmEditor={(farmId) => router.push(`/farm/layout-designer/${farmId}`)}
          onOpenFacilities={() => {
            if (selectedFacility) {
              setActiveFacilityForInventory(selectedFacility);
              setIsInventorySheetOpen(true);
            } else if (estate?.id) {
              if (onOpenFacilities) onOpenFacilities(estate.id);
              else router.push(`/farm/facilities/${estate.id}?fromEstate=true`);
            }
          }}
          onRemove={() => {
            if (selectedId && selectedType) {
              handleRemoveItem(selectedId, selectedType);
            }
          }}
          onDeselect={() => {
            setSelectedId(null);
            setSelectedType(null);
          }}
          onRenameFacility={handleRenameFacility}
          onToggleFacilityInventory={handleToggleFacilityInventory}
          onToggleFacilitySchedule={handleToggleFacilitySchedule}
          onUpdateFacilityInventoryName={handleUpdateFacilityInventoryName}
          onUpdateFacilityScheduleName={handleUpdateFacilityScheduleName}
          onOpenFacilitySettings={() => setIsFacilitySettingsModalOpen(true)}
        />
      ) : (
        <EstatePaletteCarousel
          availableFarms={availableFarmsForDock}
          onSelectFarm={(f) => handlePlaceFarm(f)}
          onSelectFacility={(fac) => handlePlaceFacility(fac)}
          onDragStartFarm={handleDockDragStartFarm}
          onDragStartFacility={handleDockDragStartFacility}
          onDragMove={handleDockDragMove}
          onDragEnd={handleDockDragEnd}
          onResetFarms={handleResetFarmParcels}
        />
      )}

      {/* ─── 4. Floating Drag Ghost following finger across whole screen ─── */}
      {activeDrag && (
        <EstateFloatingDragGhost
          activeDrag={activeDrag}
          dragItemName={dragItemName}
          dragItemW={dragItemW}
          dragItemH={dragItemH}
          dragItemColor={dragItemColor}
          dragItemIcon={dragItemIcon}
        />
      )}

      {/* ─── 5. Facility Inventory Sheet Modal ─── */}
      {activeFacilityForInventory && (
        <FacilityInventorySheet
          visible={isInventorySheetOpen}
          facility={{
            ...activeFacilityForInventory,
            inventories: (activeFacilityForInventory as any).inventories || [],
            timeLogs: (activeFacilityForInventory as any).timeLogs || [],
          } as FarmFacility}
          onClose={() => {
            setIsInventorySheetOpen(false);
            setActiveFacilityForInventory(null);
          }}
          onUpdateFacility={(updated) => {
            setPlacedFacilities((prev) =>
              prev.map((f) =>
                f.id === updated.id
                  ? {
                      ...f,
                      name: updated.name,
                      category: updated.category,
                      color: updated.color,
                      icon: updated.icon,
                      widthM: updated.widthM,
                      heightM: updated.heightM,
                      inventories: updated.inventories,
                      timeLogs: updated.timeLogs,
                    } as any
                  : f
              )
            );
            setActiveFacilityForInventory({
              ...activeFacilityForInventory,
              name: updated.name,
              category: updated.category,
              color: updated.color,
              icon: updated.icon,
            });
            setHasUnsavedChanges(true);
          }}
          onDeleteFacility={(facilityId) => {
            handleRemoveItem(facilityId, 'facility');
            setIsInventorySheetOpen(false);
            setActiveFacilityForInventory(null);
          }}
        />
      )}

      {/* ─── 6. Facility Size & Role Modal Sheet ─── */}
      {selectedFacility && isFacilitySettingsModalOpen && (
        <FacilitySizeModal
          facility={selectedFacility as any}
          visible={isFacilitySettingsModalOpen}
          onClose={() => setIsFacilitySettingsModalOpen(false)}
          onSaveSizeAndFunction={handleSaveFacilitySizeAndRole}
        />
      )}
    </View>
  );
}

/**
 * Snapped Canvas Footprint with Corner Brackets rendered inside the world coordinate space.
 */
function EstateCanvasFootprint({
  activeDrag,
  dragItemW,
  dragItemH,
  dragItemName,
}: {
  activeDrag: ActiveEstateDrag;
  dragItemW: number;
  dragItemH: number;
  dragItemName: string;
}) {
  if (!activeDrag.worldPos) return null;

  const widthPx = dragItemW * PIXELS_PER_UNIT;
  const heightPx = dragItemH * PIXELS_PER_UNIT;
  const leftPx = CANVAS_PADDING + (activeDrag.worldPos.x - dragItemW / 2) * PIXELS_PER_UNIT;
  const topPx = CANVAS_PADDING + (activeDrag.worldPos.y - dragItemH / 2) * PIXELS_PER_UNIT;

  const isValid = activeDrag.isValid;
  const borderColor = isValid ? '#16A34A' : '#DC2626';
  const bgColor = isValid ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)';

  return (
    <View
      pointerEvents="none"
      style={[
        styles.footprintContainer,
        {
          left: leftPx,
          top: topPx,
          width: widthPx,
          height: heightPx,
          borderColor,
          backgroundColor: bgColor,
        },
      ]}>
      {/* Corner brackets */}
      <View style={[styles.cornerBracket, styles.topLeftBracket, { borderColor }]} />
      <View style={[styles.cornerBracket, styles.topRightBracket, { borderColor }]} />
      <View style={[styles.cornerBracket, styles.bottomLeftBracket, { borderColor }]} />
      <View style={[styles.cornerBracket, styles.bottomRightBracket, { borderColor }]} />

      {/* Center preview badge */}
      <View style={[styles.footprintBadge, { backgroundColor: isValid ? '#15803D' : '#B91C1C' }]}>
        {isValid ? (
          <Check size={13} color="#FFFFFF" strokeWidth={3} />
        ) : (
          <AlertTriangle size={13} color="#FFFFFF" strokeWidth={3} />
        )}
        <Text style={styles.footprintBadgeText}>
          {dragItemW}m × {dragItemH}m
        </Text>
      </View>

      {/* Name Label */}
      <Text numberOfLines={1} style={styles.footprintNameText}>
        {dragItemName}
      </Text>
    </View>
  );
}

/**
 * Floating Drag Ghost following the finger across the screen.
 */
function EstateFloatingDragGhost({
  activeDrag,
  dragItemName,
  dragItemW,
  dragItemH,
  dragItemColor,
  dragItemIcon,
}: {
  activeDrag: ActiveEstateDrag;
  dragItemName: string;
  dragItemW: number;
  dragItemH: number;
  dragItemColor: string;
  dragItemIcon: string;
}) {
  const ghostX = activeDrag.screenPos.x - 70;
  const ghostY = activeDrag.screenPos.y - 85;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.ghostContainer,
        {
          transform: [{ translateX: ghostX }, { translateY: ghostY }],
        },
      ]}>
      <View style={[styles.ghostCard, { borderColor: dragItemColor }]}>
        <View style={[styles.ghostIconBox, { backgroundColor: dragItemColor }]}>
          {activeDrag.type === 'farm' ? (
            <Layers size={16} color="#FFFFFF" strokeWidth={2.4} />
          ) : (
            renderFacilityIcon(dragItemIcon, 16)
          )}
        </View>
        <View style={styles.ghostTextContainer}>
          <Text numberOfLines={1} style={styles.ghostTitle}>
            {dragItemName}
          </Text>
          <Text style={styles.ghostSubtitle}>
            {dragItemW}m × {dragItemH}m • {activeDrag.isValid ? 'Release to place' : 'Drag onto estate'}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Contextual Action Dock displayed at the bottom when a Farm Parcel or Facility is selected.
 */
function EstateActionDock({
  selectedType,
  selectedFarm,
  selectedFarmBounds,
  selectedFarmLayout,
  selectedFacility,
  isLocked,
  onToggleLock,
  onOpenFarmEditor,
  onOpenFacilities,
  onRemove,
  onDeselect,
  onRenameFacility,
  onToggleFacilityInventory,
  onToggleFacilitySchedule,
  onUpdateFacilityInventoryName,
  onUpdateFacilityScheduleName,
  onOpenFacilitySettings,
}: {
  selectedType: 'farm' | 'facility';
  selectedFarm?: { id: string; name: string; x: number; y: number } | null;
  selectedFarmBounds?: FarmOccupiedBounds;
  selectedFarmLayout?: LoadedLayout | null;
  selectedFacility?: EstateFacility | null;
  isLocked?: boolean;
  onToggleLock?: () => void;
  onOpenFarmEditor: (farmId: string) => void;
  onOpenFacilities: () => void;
  onRemove: () => void;
  onDeselect: () => void;
  onRenameFacility?: (facilityId: string, newName: string) => void;
  onToggleFacilityInventory?: (facilityId: string, enabled: boolean) => void;
  onToggleFacilitySchedule?: (facilityId: string, enabled: boolean) => void;
  onUpdateFacilityInventoryName?: (facilityId: string, name: string) => void;
  onUpdateFacilityScheduleName?: (facilityId: string, name: string) => void;
  onOpenFacilitySettings?: () => void;
}) {
  const farmW = selectedFarmBounds?.widthM || selectedFarmLayout?.widthM || 16;
  const farmH = selectedFarmBounds?.heightM || selectedFarmLayout?.heightM || 16;

  const currentTitle =
    selectedType === 'farm'
      ? selectedFarm?.name || 'Farm Area'
      : selectedFacility?.name || 'Facility';
  const dimensionText =
    selectedType === 'farm'
      ? `${farmW}m × ${farmH}m`
      : selectedFacility
      ? `${selectedFacility.widthM}m × ${selectedFacility.heightM}m`
      : '';

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState(currentTitle);
  const [inventoryNameText, setInventoryNameText] = useState('');
  const [scheduleNameText, setScheduleNameText] = useState('');
  const [isInventoryOn, setIsInventoryOn] = useState(false);
  const [isScheduleOn, setIsScheduleOn] = useState(false);

  useEffect(() => {
    setRenameText(currentTitle);
    setIsRenaming(false);

    if (selectedFacility) {
      setInventoryNameText(
        selectedFacility.inventoryName || `${selectedFacility.name} Inventory`
      );
      setScheduleNameText(
        selectedFacility.scheduleName || `${selectedFacility.name} Schedule`
      );

      const invActive =
        selectedFacility.hasInventory === true ||
        selectedFacility.facilityFunction === 'inventory' ||
        selectedFacility.facilityFunction === 'both';
      const schedActive =
        selectedFacility.hasSchedule === true ||
        selectedFacility.facilityFunction === 'time_keeping' ||
        selectedFacility.facilityFunction === 'both';
      setIsInventoryOn(invActive);
      setIsScheduleOn(schedActive);
    }
  }, [
    selectedFarm?.id,
    selectedFacility?.id,
    currentTitle,
    selectedFacility?.inventoryName,
    selectedFacility?.scheduleName,
    selectedFacility?.hasInventory,
    selectedFacility?.hasSchedule,
    selectedFacility?.facilityFunction,
  ]);

  const handleRenameSubmit = () => {
    const trimmed = renameText.trim().slice(0, 255);
    if (trimmed && trimmed !== currentTitle && selectedFacility && onRenameFacility) {
      onRenameFacility(selectedFacility.id, trimmed);
    }
    setIsRenaming(false);
  };

  const handleToggleInventorySwitch = (val: boolean) => {
    if (val) {
      setIsInventoryOn(true);
      if (selectedFacility && onToggleFacilityInventory) {
        onToggleFacilityInventory(selectedFacility.id, true);
      }
    } else {
      Alert.alert(
        'Delete Inventory?',
        'If you turn off this, your inventory will be deleted.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setIsInventoryOn(true);
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              setIsInventoryOn(false);
              if (selectedFacility && onToggleFacilityInventory) {
                onToggleFacilityInventory(selectedFacility.id, false);
              }
            },
          },
        ],
        { cancelable: false }
      );
    }
  };

  const handleToggleScheduleSwitch = (val: boolean) => {
    if (val) {
      setIsScheduleOn(true);
      if (selectedFacility && onToggleFacilitySchedule) {
        onToggleFacilitySchedule(selectedFacility.id, true);
      }
    } else {
      Alert.alert(
        'Delete Schedule?',
        'If you turn off this, your schedule will be deleted.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setIsScheduleOn(true);
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              setIsScheduleOn(false);
              if (selectedFacility && onToggleFacilitySchedule) {
                onToggleFacilitySchedule(selectedFacility.id, false);
              }
            },
          },
        ],
        { cancelable: false }
      );
    }
  };

  const handleInventoryNameBlur = () => {
    if (selectedFacility && onUpdateFacilityInventoryName) {
      const fallback = `${selectedFacility.name} Inventory`;
      const val = (inventoryNameText.trim() || fallback).slice(0, 255);
      setInventoryNameText(val);
      onUpdateFacilityInventoryName(selectedFacility.id, val);
    }
  };

  const handleScheduleNameBlur = () => {
    if (selectedFacility && onUpdateFacilityScheduleName) {
      const fallback = `${selectedFacility.name} Schedule`;
      const val = (scheduleNameText.trim() || fallback).slice(0, 255);
      setScheduleNameText(val);
      onUpdateFacilityScheduleName(selectedFacility.id, val);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Remove Element',
      `Are you sure you want to remove "${currentTitle}" from the estate?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: onRemove,
        },
      ]
    );
  };

  return (
    <View style={styles.actionDockContainer}>
      {/* ─── Top Control Row: Title & Size, Action Buttons ─── */}
      <View style={styles.actionDockTop}>
        <View style={styles.titleContainer}>
          {selectedType === 'facility' && isRenaming ? (
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              maxLength={255}
              onBlur={handleRenameSubmit}
              onSubmitEditing={handleRenameSubmit}
              autoFocus
              selectTextOnFocus
              style={styles.renameInput}
            />
          ) : selectedType === 'facility' ? (
            <Pressable
              onPress={() => {
                setRenameText(currentTitle);
                setIsRenaming(true);
              }}
              style={styles.titlePressable}>
              <Text numberOfLines={1} style={styles.actionDockTitle}>
                {currentTitle}
              </Text>
              <Pencil size={13} color="#8C4522" strokeWidth={2.4} />
            </Pressable>
          ) : (
            <Text numberOfLines={1} style={styles.actionDockTitle}>
              {currentTitle}
            </Text>
          )}

          <View style={styles.sizeBadge}>
            <Text style={styles.sizeText}>
              {selectedType === 'farm'
                ? `${dimensionText} • ${selectedFarmLayout?.plots?.length || 0} beds`
                : `${dimensionText} • ${selectedFacility?.category}`}
            </Text>
          </View>
        </View>

        {/* Right Side Buttons */}
        <View style={styles.topActionsRow}>
          {/* Farm-specific editor button */}
          {selectedType === 'farm' && selectedFarm && (
            <Pressable
              onPress={() => onOpenFarmEditor(selectedFarm.id)}
              hitSlop={6}
              style={[styles.iconButton, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
              accessibilityLabel="Open Farm Editor">
              <Pencil size={15} color="#16A34A" strokeWidth={2.4} />
            </Pressable>
          )}

          {/* Facility Settings Button (Size & Role) */}
          {selectedType === 'facility' && onOpenFacilitySettings && (
            <Pressable
              onPress={onOpenFacilitySettings}
              hitSlop={6}
              style={[styles.iconButton, styles.settingsButton]}
              accessibilityLabel="Facility Settings">
              <Settings size={16} color="#475569" strokeWidth={2.4} />
            </Pressable>
          )}

          {/* Lock / Unlock Toggle Button */}
          {onToggleLock && (
            <Pressable
              onPress={onToggleLock}
              hitSlop={6}
              style={[
                styles.iconButton,
                isLocked ? styles.lockedButtonActive : styles.unlockedButton,
              ]}
              accessibilityLabel={isLocked ? 'Unlock Element' : 'Lock Element'}>
              {isLocked ? (
                <Lock size={15} color="#D97706" strokeWidth={2.4} />
              ) : (
                <LockOpen size={15} color="#64748B" strokeWidth={2.4} />
              )}
            </Pressable>
          )}

          {/* Delete Button */}
          <Pressable
            onPress={confirmDelete}
            hitSlop={6}
            style={[styles.iconButton, styles.deleteButton]}
            accessibilityLabel="Remove Element">
            <Trash2 size={16} color="#DC2626" strokeWidth={2.4} />
          </Pressable>

          {/* Done Button */}
          <Pressable onPress={onDeselect} style={styles.donePill} hitSlop={6}>
            <Check size={14} color="#FFFFFF" strokeWidth={3} />
            <Text style={styles.donePillText}>Done</Text>
          </Pressable>
        </View>
      </View>

      {/* ─── Main Body: Dynamic Facility Sections with ON/OFF Switches ─── */}
      {selectedType === 'facility' && selectedFacility && (
        <View style={styles.mainBodyContainer}>
          {/* 1. Inventory Switch Card */}
          <View style={[styles.switchCard, isInventoryOn && styles.switchCardActiveInventory]}>
            <View style={styles.switchHeaderRow}>
              <View style={styles.switchLabelGroup}>
                <View
                  style={[
                    styles.switchIconBadge,
                    isInventoryOn && styles.switchIconBadgeActiveInventory,
                  ]}>
                  <Box size={14} color={isInventoryOn ? '#8C4522' : '#8C7C70'} strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.switchTitle, isInventoryOn && styles.switchTitleActiveInventory]}>
                      Inventory
                    </Text>
                    <View style={[styles.statusPill, isInventoryOn ? styles.statusPillOn : styles.statusPillOff]}>
                      <Text style={[styles.statusPillText, isInventoryOn ? styles.statusPillTextOn : styles.statusPillTextOff]}>
                        {isInventoryOn ? 'ON' : 'OFF'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.switchSubtitle} numberOfLines={1}>
                    {isInventoryOn ? 'Active • Stock & supplies tracking' : 'Disabled • Off by default'}
                  </Text>
                </View>
              </View>

              <Switch
                value={isInventoryOn}
                onValueChange={handleToggleInventorySwitch}
                trackColor={{ false: '#E2D9CE', true: '#F4BA89' }}
                thumbColor={isInventoryOn ? '#8C4522' : '#FFFFFF'}
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            </View>

            {/* If turned on, show the editable naming box */}
            {isInventoryOn && (
              <View style={styles.switchInputWrapper}>
                <Text style={styles.inputHelperLabel}>Inventory Name</Text>
                <TextInput
                  value={inventoryNameText}
                  onChangeText={setInventoryNameText}
                  maxLength={255}
                  onBlur={handleInventoryNameBlur}
                  placeholder={`${selectedFacility.name} Inventory`}
                  placeholderTextColor="#A9927D"
                  style={styles.fieldInput}
                />
              </View>
            )}
          </View>

          {/* 2. Schedule Switch Card */}
          <View style={[styles.switchCard, isScheduleOn && styles.switchCardActiveSchedule]}>
            <View style={styles.switchHeaderRow}>
              <View style={styles.switchLabelGroup}>
                <View
                  style={[
                    styles.switchIconBadge,
                    isScheduleOn && styles.switchIconBadgeActiveSchedule,
                  ]}>
                  <Clock size={14} color={isScheduleOn ? '#4338CA' : '#8C7C70'} strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.switchTitle, isScheduleOn && styles.switchTitleActiveSchedule]}>
                      Schedule
                    </Text>
                    <View style={[styles.statusPill, isScheduleOn ? styles.statusPillOnIndigo : styles.statusPillOff]}>
                      <Text style={[styles.statusPillText, isScheduleOn ? styles.statusPillTextOnIndigo : styles.statusPillTextOff]}>
                        {isScheduleOn ? 'ON' : 'OFF'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.switchSubtitle} numberOfLines={1}>
                    {isScheduleOn ? 'Active • Labor & task logs tracking' : 'Disabled • Off by default'}
                  </Text>
                </View>
              </View>

              <Switch
                value={isScheduleOn}
                onValueChange={handleToggleScheduleSwitch}
                trackColor={{ false: '#E2D9CE', true: '#C7D2FE' }}
                thumbColor={isScheduleOn ? '#4338CA' : '#FFFFFF'}
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            </View>

            {/* If turned on, show the editable naming box */}
            {isScheduleOn && (
              <View style={styles.switchInputWrapper}>
                <Text style={styles.inputHelperLabel}>Schedule Name</Text>
                <TextInput
                  value={scheduleNameText}
                  onChangeText={setScheduleNameText}
                  maxLength={255}
                  onBlur={handleScheduleNameBlur}
                  placeholder={`${selectedFacility.name} Schedule`}
                  placeholderTextColor="#A9927D"
                  style={styles.fieldInput}
                />
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Renders a placed Farm Area on the Estate Canvas with its ACTUAL constituent 2D farm map
 * auto-adjusted to only the occupied space, with smooth 60fps physical collision dragging.
 */
function PlacedFarmParcelBlock({
  farmId,
  farmName,
  currentX,
  currentY,
  bounds,
  worldWidthM,
  worldHeightM,
  layout,
  isSelected,
  zoomScale,
  allObstacles,
  toolMode = 'select',
  isLocked = false,
  onDragStart,
  onDragEnd,
  onSelect,
  onMove,
  onCollisionReject,
}: {
  farmId: string;
  farmName: string;
  currentX: number;
  currentY: number;
  bounds: FarmOccupiedBounds;
  worldWidthM: number;
  worldHeightM: number;
  layout?: LoadedLayout | null;
  isSelected: boolean;
  zoomScale: number;
  allObstacles: EstateObstacle[];
  toolMode?: ToolMode;
  isLocked?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onSelect: () => void;
  onMove: (pos: { x: number; y: number }) => void;
  onCollisionReject?: () => void;
}) {
  const parcelW = bounds.widthM;
  const parcelH = bounds.heightM;
  const widthPx = parcelW * PIXELS_PER_UNIT;
  const heightPx = parcelH * PIXELS_PER_UNIT;
  const [isDragging, setIsDragging] = useState(false);
  const [isColliding, setIsColliding] = useState(false);
  const isCollidingRef = useRef(false);

  const farmOriginRef = useRef({ x: currentX, y: currentY });
  const lastClampedPosRef = useRef({ x: currentX, y: currentY });
  const hasMovedRef = useRef(false);

  const allObstaclesRef = useRef(allObstacles);
  allObstaclesRef.current = allObstacles;

  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;

  const initialPx = CANVAS_PADDING + (currentX - parcelW / 2) * PIXELS_PER_UNIT;
  const initialPy = CANVAS_PADDING + (currentY - parcelH / 2) * PIXELS_PER_UNIT;
  const pan = useRef(new Animated.ValueXY({ x: initialPx, y: initialPy })).current;

  // Keep pan aligned when parent updates props (or on reset/load)
  useEffect(() => {
    const targetPx = CANVAS_PADDING + (currentX - parcelW / 2) * PIXELS_PER_UNIT;
    const targetPy = CANVAS_PADDING + (currentY - parcelH / 2) * PIXELS_PER_UNIT;
    pan.setValue({ x: targetPx, y: targetPy });
    farmOriginRef.current = { x: currentX, y: currentY };
    lastClampedPosRef.current = { x: currentX, y: currentY };
    setIsDragging(false);
    setIsColliding(false);
    isCollidingRef.current = false;
  }, [currentX, currentY, parcelW, parcelH, pan]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (toolMode === 'pan' || isLocked) return false;
          if (evt.nativeEvent.touches.length >= 2) return false;
          return true;
        },
        onMoveShouldSetPanResponder: (evt, g) => {
          if (toolMode === 'pan' || isLocked) return false;
          if (evt.nativeEvent.touches.length >= 2) return false;
          return Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3;
        },
        onPanResponderGrant: () => {
          onSelect();
          onDragStart();
          setIsDragging(true);
          hasMovedRef.current = false;
          isCollidingRef.current = false;
          setIsColliding(false);
          farmOriginRef.current = { x: currentX, y: currentY };
          lastClampedPosRef.current = { x: currentX, y: currentY };
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3) {
            hasMovedRef.current = true;
          }
          const scaleVal = zoomScaleRef.current > 0 ? zoomScaleRef.current : 0.55;
          const dxM = g.dx / PIXELS_PER_UNIT / scaleVal;
          const dyM = g.dy / PIXELS_PER_UNIT / scaleVal;

          const rawX = farmOriginRef.current.x + dxM;
          const rawY = farmOriginRef.current.y + dyM;

          const candidatePos = freeDragSnapAndClampEstate(
            farmId,
            rawX,
            rawY,
            parcelW,
            parcelH,
            allObstaclesRef.current,
            worldWidthM,
            worldHeightM
          );

          const collides = doesEstateItemCollide(
            { id: farmId, x: candidatePos.x, y: candidatePos.y, widthM: parcelW, heightM: parcelH },
            allObstaclesRef.current
          );

          isCollidingRef.current = collides;
          setIsColliding(collides);
          lastClampedPosRef.current = candidatePos;

          // Direct absolute GPU-accelerated Animated transform
          const targetPx = CANVAS_PADDING + (candidatePos.x - parcelW / 2) * PIXELS_PER_UNIT;
          const targetPy = CANVAS_PADDING + (candidatePos.y - parcelH / 2) * PIXELS_PER_UNIT;
          pan.setValue({ x: targetPx, y: targetPy });
        },
        onPanResponderRelease: () => {
          onDragEnd();
          setIsDragging(false);

          if (isCollidingRef.current) {
            try {
              Vibration.vibrate(Platform.OS === 'android' ? [0, 40, 40, 40] : 30);
            } catch {}

            const originPx = CANVAS_PADDING + (farmOriginRef.current.x - parcelW / 2) * PIXELS_PER_UNIT;
            const originPy = CANVAS_PADDING + (farmOriginRef.current.y - parcelH / 2) * PIXELS_PER_UNIT;

            Animated.spring(pan, {
              toValue: { x: originPx, y: originPy },
              useNativeDriver: false,
              friction: 6,
              tension: 50,
            }).start(() => {
              isCollidingRef.current = false;
              setIsColliding(false);
            });

            if (onCollisionReject) {
              onCollisionReject();
            }
            return;
          }

          if (
            hasMovedRef.current &&
            (lastClampedPosRef.current.x !== currentX || lastClampedPosRef.current.y !== currentY)
          ) {
            onMove(lastClampedPosRef.current);
          } else {
            onSelect();
          }
        },
        onPanResponderTerminate: () => {
          const originPx = CANVAS_PADDING + (currentX - parcelW / 2) * PIXELS_PER_UNIT;
          const originPy = CANVAS_PADDING + (currentY - parcelH / 2) * PIXELS_PER_UNIT;
          pan.setValue({ x: originPx, y: originPy });
          setIsDragging(false);
          isCollidingRef.current = false;
          setIsColliding(false);
          onDragEnd();
        },
      }),
    [farmId, parcelW, parcelH, currentX, currentY, worldWidthM, worldHeightM, toolMode, isLocked, onSelect, onDragStart, onDragEnd, onMove, onCollisionReject, pan]
  );

  const plots = layout?.plots || [];
  const zones = layout?.zones || [];
  const facilities = layout?.facilities || [];

  const borderColor = isColliding ? '#EF4444' : isSelected ? '#8C4522' : '#BFAFA0';

  return (
    <Animated.View
      style={[
        styles.parcelBlock,
        {
          left: 0,
          top: 0,
          width: widthPx,
          height: heightPx,
          zIndex: isDragging ? 80 : isSelected ? 35 : 10,
          borderWidth: isColliding ? 3 : isSelected ? 3 : 1.5,
          borderColor,
          borderStyle: 'solid',
          backgroundColor: isColliding ? 'rgba(239, 68, 68, 0.15)' : undefined,
          shadowColor: isColliding ? '#EF4444' : '#000000',
          shadowOffset: { width: 0, height: isDragging ? 10 : isSelected ? 4 : 2 },
          shadowOpacity: isDragging ? 0.45 : isSelected ? 0.3 : 0.15,
          shadowRadius: isDragging ? 14 : isSelected ? 8 : 4,
          elevation: isDragging ? 18 : isSelected ? 8 : 3,
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale: isDragging ? 1.02 : 1 },
          ],
        },
      ]}
      {...panResponder.panHandlers}>
      {/* Lock Tap-to-Select Overlay */}
      {isLocked && (
        <Pressable
          onPress={onSelect}
          style={StyleSheet.absoluteFillObject}
          accessibilityLabel={`Select locked farm ${farmName}`}
        />
      )}
      {/* Lock Badge */}
      {isLocked && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            backgroundColor: 'rgba(217, 119, 6, 0.9)',
            padding: 4,
            borderRadius: 6,
            zIndex: 99,
          }}>
          <Lock size={12} color="#FFFFFF" strokeWidth={2.5} />
        </View>
      )}
      
      {/* ── 1. Live Internal Farm Zones Layer (Centered inside auto-adjusted parcel box) ── */}
      {zones.map((zone) => {
        const zCenterX = (zone.x - bounds.offsetX) + parcelW / 2;
        const zCenterY = (zone.y - bounds.offsetY) + parcelH / 2;
        const zLeft = (zCenterX - zone.widthM / 2) * PIXELS_PER_UNIT;
        const zTop = (zCenterY - zone.heightM / 2) * PIXELS_PER_UNIT;
        const zWidth = zone.widthM * PIXELS_PER_UNIT;
        const zHeight = zone.heightM * PIXELS_PER_UNIT;
        const isGreenhouse = zone.zoneType === 'greenhouse';

        return (
          <View
            key={zone.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: zLeft,
              top: zTop,
              width: zWidth,
              height: zHeight,
              zIndex: 2,
              backgroundColor: zone.fillColor || (isGreenhouse ? 'rgba(45, 106, 79, 0.12)' : 'rgba(140, 69, 34, 0.08)'),
              borderColor: zone.color || (isGreenhouse ? '#2D6A4F' : '#8C4522'),
              borderWidth: 1.5,
              borderStyle: isGreenhouse ? 'solid' : 'dashed',
              borderRadius: 10,
              overflow: 'hidden',
            }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                backgroundColor: zone.color || (isGreenhouse ? '#2D6A4F' : '#8C4522'),
                paddingHorizontal: 5,
                paddingVertical: 1.5,
                alignSelf: 'flex-start',
                borderBottomRightRadius: 6,
              }}>
              {isGreenhouse ? (
                <Sparkles size={8} color="#FFFFFF" strokeWidth={2.5} />
              ) : (
                <Leaf size={8} color="#FFFFFF" strokeWidth={2.5} />
              )}
              <Text
                style={{
                  fontSize: 8,
                  fontWeight: '800',
                  color: '#FFFFFF',
                  textTransform: 'uppercase',
                }}
                numberOfLines={1}>
                {zone.name}
              </Text>
            </View>
          </View>
        );
      })}

      {/* ── 2. Live Internal Farm Plots / Planting Beds Layer (Centered inside auto-adjusted parcel box) ── */}
      {plots.map((plot) => {
        const pCenterX = (plot.x - bounds.offsetX) + parcelW / 2;
        const pCenterY = (plot.y - bounds.offsetY) + parcelH / 2;
        const pLeft = (pCenterX - plot.widthM / 2) * PIXELS_PER_UNIT;
        const pTop = (pCenterY - plot.heightM / 2) * PIXELS_PER_UNIT;
        const pWidth = plot.widthM * PIXELS_PER_UNIT;
        const pHeight = plot.heightM * PIXELS_PER_UNIT;

        return (
          <View
            key={plot.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: pLeft,
              top: pTop,
              width: pWidth,
              height: pHeight,
              zIndex: 5,
              backgroundColor: plot.color || '#2D6A4F',
              borderColor: 'rgba(255, 255, 255, 0.85)',
              borderWidth: 1,
              borderRadius: 4,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.15,
              shadowRadius: 1,
              elevation: 1,
            }}>
            <Text
              style={{
                fontSize: 8.5,
                fontWeight: '900',
                color: '#FFFFFF',
                textAlign: 'center',
              }}
              numberOfLines={1}>
              {plot.label}
            </Text>
          </View>
        );
      })}

      {/* ── 3. Live Internal Farm Facilities Layer (Centered inside auto-adjusted parcel box) ── */}
      {facilities.map((fac) => {
        const fCenterX = (fac.x - bounds.offsetX) + parcelW / 2;
        const fCenterY = (fac.y - bounds.offsetY) + parcelH / 2;
        const fLeft = (fCenterX - fac.widthM / 2) * PIXELS_PER_UNIT;
        const fTop = (fCenterY - fac.heightM / 2) * PIXELS_PER_UNIT;
        const fWidth = fac.widthM * PIXELS_PER_UNIT;
        const fHeight = fac.heightM * PIXELS_PER_UNIT;

        return (
          <View
            key={fac.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: fLeft,
              top: fTop,
              width: fWidth,
              height: fHeight,
              zIndex: 6,
              backgroundColor: fac.color || '#795548',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.7)',
              padding: 2,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {renderFacilityIcon(fac.icon, 10)}
            <Text
              style={{
                fontSize: 7.5,
                fontWeight: '800',
                color: '#FFFFFF',
                textAlign: 'center',
                marginTop: 1,
              }}
              numberOfLines={1}>
              {fac.name}
            </Text>
          </View>
        );
      })}

      {/* Empty Farm Layout Indicator when farm has no plots or zones */}
      {!bounds.hasElements && (
        <View pointerEvents="none" style={styles.emptyParcelNotice}>
          <Layers size={16} color="#8C7C70" strokeWidth={2} />
          <Text style={styles.emptyParcelText}>Empty Layout</Text>
          <Text style={styles.emptyParcelSubText}>Tap to design in Farm Editor</Text>
        </View>
      )}

      {/* ── 4. Tactical Farm Header Banner ── */}
      <View pointerEvents="none" style={styles.parcelHeader}>
        <View style={styles.parcelDot} />
        <Text style={styles.parcelTitle} numberOfLines={1}>
          {farmName}
        </Text>
        <Text style={styles.parcelDimText}>
          {parcelW}m × {parcelH}m • {plots.length} {plots.length === 1 ? 'bed' : 'beds'}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * Renders a placed centralized estate facility with consistent colored card & icon styling
 * matching the Farm Layout Editor (FacilityItem), with smooth 60fps dragging and physical corner resizing.
 */
function PlacedFacilityBlock({
  facility,
  currentX,
  currentY,
  worldWidthM,
  worldHeightM,
  isSelected,
  zoomScale,
  allObstacles,
  toolMode = 'select',
  isLocked = false,
  onDragStart,
  onDragEnd,
  onSelect,
  onMove,
  onResize,
  onOpenInventory,
  onCollisionReject,
}: {
  facility: EstateFacility;
  currentX: number;
  currentY: number;
  worldWidthM: number;
  worldHeightM: number;
  isSelected: boolean;
  zoomScale: number;
  allObstacles: EstateObstacle[];
  toolMode?: ToolMode;
  isLocked?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onSelect: () => void;
  onMove: (pos: { x: number; y: number }) => void;
  onResize?: (id: string, widthM: number, heightM: number, x: number, y: number) => void;
  onOpenInventory?: (facility: EstateFacility) => void;
  onCollisionReject?: () => void;
}) {
  const widthPx = facility.widthM * PIXELS_PER_UNIT;
  const heightPx = facility.heightM * PIXELS_PER_UNIT;
  const [isDragging, setIsDragging] = useState(false);
  const [isColliding, setIsColliding] = useState(false);
  const isCollidingRef = useRef(false);

  const facilityRef = useRef(facility);
  facilityRef.current = facility;

  const facilityOriginRef = useRef({ x: currentX, y: currentY });
  const lastClampedPosRef = useRef({ x: currentX, y: currentY });
  const hasMovedRef = useRef(false);

  const allObstaclesRef = useRef(allObstacles);
  allObstaclesRef.current = allObstacles;

  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;

  const initialPx = CANVAS_PADDING + (currentX - facility.widthM / 2) * PIXELS_PER_UNIT;
  const initialPy = CANVAS_PADDING + (currentY - facility.heightM / 2) * PIXELS_PER_UNIT;
  const pan = useRef(new Animated.ValueXY({ x: initialPx, y: initialPy })).current;

  // Keep pan aligned when parent updates props (or on reset/resize)
  useEffect(() => {
    const targetPx = CANVAS_PADDING + (currentX - facility.widthM / 2) * PIXELS_PER_UNIT;
    const targetPy = CANVAS_PADDING + (currentY - facility.heightM / 2) * PIXELS_PER_UNIT;
    pan.setValue({ x: targetPx, y: targetPy });
    facilityOriginRef.current = { x: currentX, y: currentY };
    lastClampedPosRef.current = { x: currentX, y: currentY };
    setIsDragging(false);
    setIsColliding(false);
    isCollidingRef.current = false;
  }, [currentX, currentY, facility.widthM, facility.heightM, pan]);

  // --- Move Drag Responder ---
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (toolMode === 'pan' || isLocked) return false;
          if (evt.nativeEvent.touches.length >= 2) return false;
          return true;
        },
        onMoveShouldSetPanResponder: (evt, g) => {
          if (toolMode === 'pan' || isLocked) return false;
          if (evt.nativeEvent.touches.length >= 2) return false;
          return Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3;
        },
        onPanResponderGrant: () => {
          onSelect();
          onDragStart();
          setIsDragging(true);
          hasMovedRef.current = false;
          isCollidingRef.current = false;
          setIsColliding(false);
          facilityOriginRef.current = { x: currentX, y: currentY };
          lastClampedPosRef.current = { x: currentX, y: currentY };
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3) {
            hasMovedRef.current = true;
          }
          const scaleVal = zoomScaleRef.current > 0 ? zoomScaleRef.current : 0.55;
          const dxM = g.dx / PIXELS_PER_UNIT / scaleVal;
          const dyM = g.dy / PIXELS_PER_UNIT / scaleVal;

          const rawX = facilityOriginRef.current.x + dxM;
          const rawY = facilityOriginRef.current.y + dyM;

          const candidatePos = freeDragSnapAndClampEstate(
            facilityRef.current.id,
            rawX,
            rawY,
            facilityRef.current.widthM,
            facilityRef.current.heightM,
            allObstaclesRef.current,
            worldWidthM,
            worldHeightM
          );

          const collides = doesEstateItemCollide(
            {
              id: facilityRef.current.id,
              x: candidatePos.x,
              y: candidatePos.y,
              widthM: facilityRef.current.widthM,
              heightM: facilityRef.current.heightM,
            },
            allObstaclesRef.current
          );

          isCollidingRef.current = collides;
          setIsColliding(collides);
          lastClampedPosRef.current = candidatePos;

          // Direct absolute GPU-accelerated Animated transform
          const targetPx = CANVAS_PADDING + (candidatePos.x - facilityRef.current.widthM / 2) * PIXELS_PER_UNIT;
          const targetPy = CANVAS_PADDING + (candidatePos.y - facilityRef.current.heightM / 2) * PIXELS_PER_UNIT;
          pan.setValue({ x: targetPx, y: targetPy });
        },
        onPanResponderRelease: () => {
          onDragEnd();
          setIsDragging(false);

          if (isCollidingRef.current) {
            try {
              Vibration.vibrate(Platform.OS === 'android' ? [0, 40, 40, 40] : 30);
            } catch {}

            const originPx = CANVAS_PADDING + (facilityOriginRef.current.x - facility.widthM / 2) * PIXELS_PER_UNIT;
            const originPy = CANVAS_PADDING + (facilityOriginRef.current.y - facility.heightM / 2) * PIXELS_PER_UNIT;

            Animated.spring(pan, {
              toValue: { x: originPx, y: originPy },
              useNativeDriver: false,
              friction: 6,
              tension: 50,
            }).start(() => {
              isCollidingRef.current = false;
              setIsColliding(false);
            });

            if (onCollisionReject) {
              onCollisionReject();
            }
            return;
          }

          if (
            hasMovedRef.current &&
            (lastClampedPosRef.current.x !== currentX || lastClampedPosRef.current.y !== currentY)
          ) {
            onMove(lastClampedPosRef.current);
          } else {
            onSelect();
          }
        },
        onPanResponderTerminate: () => {
          const originPx = CANVAS_PADDING + (currentX - facility.widthM / 2) * PIXELS_PER_UNIT;
          const originPy = CANVAS_PADDING + (currentY - facility.heightM / 2) * PIXELS_PER_UNIT;
          pan.setValue({ x: originPx, y: originPy });
          setIsDragging(false);
          isCollidingRef.current = false;
          setIsColliding(false);
          onDragEnd();
        },
      }),
    [facility.id, facility.widthM, facility.heightM, currentX, currentY, worldWidthM, worldHeightM, toolMode, isLocked, onSelect, onDragStart, onDragEnd, onMove, onCollisionReject, pan]
  );

  // --- Resize Responders (4 Corner Anchors matching FacilityItem with physical clamping) ---
  const resizeStartRef = useRef({ w: 0, h: 0, x: 0, y: 0 });

  const resizeResponders = useMemo(() => {
    if (!onResize) return {};
    const responders: Record<string, any> = {};

    CORNER_ANCHORS.forEach(({ dir }) => {
      responders[dir] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          onDragStart();
          const f = facilityRef.current;
          resizeStartRef.current = {
            w: f.widthM,
            h: f.heightM,
            x: f.x,
            y: f.y,
          };
        },
        onPanResponderMove: (_, g) => {
          const scaleVal = zoomScaleRef.current > 0 ? zoomScaleRef.current : 0.55;
          const dxM = g.dx / PIXELS_PER_UNIT / scaleVal;
          const dyM = g.dy / PIXELS_PER_UNIT / scaleVal;
          const start = resizeStartRef.current;

          const clampedResult = snapAndClampEstateResize(
            facilityRef.current.id,
            dir,
            start.w,
            start.h,
            start.x,
            start.y,
            dxM,
            dyM,
            allObstaclesRef.current,
            worldWidthM,
            worldHeightM
          );

          onResize(
            facilityRef.current.id,
            clampedResult.widthM,
            clampedResult.heightM,
            clampedResult.x,
            clampedResult.y
          );
        },
        onPanResponderRelease: () => {
          onDragEnd();
        },
        onPanResponderTerminate: () => {
          onDragEnd();
        },
      });
    });

    return responders;
  }, [onResize, worldWidthM, worldHeightM, onDragStart, onDragEnd]);

  const borderColor = isColliding ? '#EF4444' : isSelected ? SELECTED_BORDER_COLOR : 'rgba(0,0,0,0.25)';

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: widthPx,
        height: heightPx,
        zIndex: isDragging ? 100 : isSelected ? 40 : 15,
        backgroundColor: isColliding ? '#EF4444' : facility.color || '#334155',
        borderRadius: 14,
        borderWidth: isColliding ? 3 : isSelected ? SELECTED_BORDER_WIDTH : DEFAULT_BORDER_WIDTH,
        borderColor,
        borderStyle: 'solid',
        shadowColor: isColliding ? '#EF4444' : '#000000',
        shadowOffset: { width: 0, height: isDragging ? 10 : isSelected ? 4 : 2 },
        shadowOpacity: isDragging ? 0.5 : isSelected ? 0.35 : 0.2,
        shadowRadius: isDragging ? 16 : isSelected ? 8 : 4,
        elevation: isDragging ? 20 : isSelected ? 8 : 4,
        padding: 8,
        justifyContent: 'space-between',
        transform: [
          { translateX: pan.x },
          { translateY: pan.y },
          { scale: isDragging ? 1.03 : 1 },
        ],
      }}
      {...panResponder.panHandlers}>
      {/* Lock Tap-to-Select Overlay */}
      {isLocked && (
        <Pressable
          onPress={onSelect}
          style={StyleSheet.absoluteFillObject}
          accessibilityLabel={`Select locked facility ${facility.name}`}
        />
      )}
      {/* Lock Badge */}
      {isLocked && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            backgroundColor: 'rgba(217, 119, 6, 0.9)',
            padding: 4,
            borderRadius: 6,
            zIndex: 99,
          }}>
          <Lock size={12} color="#FFFFFF" strokeWidth={2.5} />
        </View>
      )}
      {/* Top Header: Icon & Category */}
      <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.22)',
            borderRadius: 8,
            padding: 4.5,
          }}>
          {renderFacilityIcon(facility.icon, 15)}
        </View>

        <View
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
          }}>
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 8.5,
              fontWeight: '800',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}>
            {facility.category || 'Facility'}
          </Text>
        </View>
      </View>

      {/* Center: Facility Name & Size */}
      <View pointerEvents="none" style={{ flex: 1, justifyContent: 'center', marginVertical: 2 }}>
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 12.5,
            fontWeight: '900',
            textAlign: 'left',
            letterSpacing: -0.2,
          }}
          numberOfLines={2}>
          {facility.name}
        </Text>
        <Text
          style={{
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: 9.5,
            fontWeight: '600',
            marginTop: 1.5,
          }}>
          {facility.widthM}m × {facility.heightM}m
        </Text>
      </View>

      {/* Bottom: Function / Operational Status Badge */}
      <View
        pointerEvents="none"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          paddingVertical: 3,
          paddingHorizontal: 7,
          borderRadius: 8,
          gap: 4,
        }}>
        {facility.facilityFunction === 'time_keeping' || (!facility.hasInventory && facility.hasSchedule) ? (
          <>
            <Clock size={11} color="#3730A3" strokeWidth={2.4} />
            <Text
              style={{
                color: '#3730A3',
                fontSize: 9.5,
                fontWeight: '800',
              }}>
              Time Keeping
            </Text>
          </>
        ) : facility.facilityFunction === 'both' || (facility.hasInventory && facility.hasSchedule) ? (
          <>
            <Clock size={11} color="#065F46" strokeWidth={2.4} />
            <Text
              style={{
                color: '#065F46',
                fontSize: 9.5,
                fontWeight: '800',
              }}>
              {facility.inventories?.length || 0} items • Time
            </Text>
          </>
        ) : facility.facilityFunction === 'inventory' || facility.hasInventory ? (
          <>
            <Package size={11} color="#1C120C" strokeWidth={2.4} />
            <Text
              style={{
                color: '#1C120C',
                fontSize: 9.5,
                fontWeight: '800',
              }}>
              {facility.inventories?.length || 0}{' '}
              {(facility.inventories?.length || 0) === 1 ? 'item' : 'items'}
            </Text>
          </>
        ) : (
          <>
            <Building2 size={11} color="#8C4522" strokeWidth={2.4} />
            <Text
              style={{
                color: '#8C4522',
                fontSize: 9.5,
                fontWeight: '800',
              }}>
              Central Facility
            </Text>
          </>
        )}
      </View>

      {/* 4 Corner Resize Handles (rendered when selected and not dragging or locked or in pan mode) */}
      {isSelected &&
        !isDragging &&
        !isLocked &&
        toolMode !== 'pan' &&
        onResize &&
        CORNER_ANCHORS.map(({ dir, ax, ay }) => {
          const responder = resizeResponders[dir];
          if (!responder) return null;
          return (
            <View
              key={dir}
              {...responder.panHandlers}
              style={{
                position: 'absolute',
                left: ax * widthPx,
                top: ay * heightPx,
                width: 0,
                height: 0,
                zIndex: 999,
              }}>
              <ResizeHandle direction={dir} offsetX={0} offsetY={0} />
            </View>
          );
        })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5EFE6',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FBF8F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#8C4522',
  },
  topHeader: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2D9CE',
    paddingHorizontal: 12,
    paddingBottom: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
    zIndex: 100,
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F7F4EF',
    borderWidth: 1,
    borderColor: '#E2D9CE',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  lockedButtonActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  unlockedButton: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  titleContainer: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  titleWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  titleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    maxWidth: '100%',
  },
  estateTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#2A1610',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    marginTop: 1.5,
  },
  statsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8C7C70',
    textAlign: 'center',
    flexShrink: 1,
  },
  unsavedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    flexShrink: 0,
  },
  unsavedDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: '#D97706',
  },
  unsavedText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#D97706',
    letterSpacing: 0.4,
  },
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  renameInput: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#2A1610',
    backgroundColor: '#F7F4EF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#8C4522',
    flex: 1,
    minWidth: 0,
    maxWidth: 160,
  },
  renameCheck: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    minWidth: 36,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#BFAFA0',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#8C4522',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
    flexShrink: 0,
  },
  saveButtonActive: {
    backgroundColor: '#8C4522',
  },
  saveButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gridAreaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0ECE4',
    gap: 8,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  gridAreaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8C7C70',
  },
  gridAreaValue: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#2A1610',
    minWidth: 68,
    textAlign: 'center',
  },
  stepperButton: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#F7F4EF',
    borderWidth: 1,
    borderColor: '#E2D9CE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.35,
  },
  stepperText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#8C4522',
    lineHeight: 16,
  },
  subRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  subRowFacilitiesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: '#F7F4EF',
    borderRadius: 8,
    paddingHorizontal: 7.5,
    paddingVertical: 4.5,
    borderWidth: 1,
    borderColor: '#E2D9CE',
  },
  subRowFacilitiesText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#8C4522',
  },
  resetParcelsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 7.5,
    paddingVertical: 4.5,
  },
  resetParcelsText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  canvasViewportContainer: {
    flex: 1,
    backgroundColor: '#E6DDD1',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasPlane: {
    position: 'relative',
  },
  emptyCanvasContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(140, 69, 34, 0.2)',
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 12,
  },
  emptyCanvasTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2A1610',
    textAlign: 'center',
    marginBottom: 4,
  },
  emptyCanvasSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8C7C70',
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 260,
  },
  parcelBlock: {
    position: 'absolute',
    backgroundColor: '#F7F3EC',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowRadius: 8,
  },
  parcelHeader: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  parcelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  parcelTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#2A1610',
    flex: 1,
  },
  parcelDimText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#8C7C70',
  },
  emptyParcelNotice: {
    position: 'absolute',
    top: 36,
    bottom: 10,
    left: 10,
    right: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D4C7B8',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  emptyParcelText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#8C7C70',
  },
  emptyParcelSubText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#BFAFA0',
  },
  actionDockContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderTopColor: '#E2D9CE',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  actionDockTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  actionDockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  actionDockIconChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDockTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#2A1610',
    maxWidth: '85%',
  },
  actionDockSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8C7C70',
    marginTop: 1,
  },
  titlePressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sizeBadge: {
    marginTop: 2,
  },
  sizeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8C7C70',
    letterSpacing: 0.1,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingsButton: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  deleteButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  donePillText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  mainBodyContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F2ECE4',
    gap: 8,
  },
  switchCard: {
    backgroundColor: '#FAF7F4',
    borderWidth: 1.2,
    borderColor: '#EAE1D7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  switchCardActiveInventory: {
    backgroundColor: '#FFFBF7',
    borderColor: '#F4BA89',
  },
  switchCardActiveSchedule: {
    backgroundColor: '#F8FAFF',
    borderColor: '#C7D2FE',
  },
  switchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  switchIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#EAE1D7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchIconBadgeActiveInventory: {
    backgroundColor: '#FDEEE2',
  },
  switchIconBadgeActiveSchedule: {
    backgroundColor: '#EEF2FF',
  },
  switchTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#57534E',
  },
  switchTitleActiveInventory: {
    color: '#8C4522',
  },
  switchTitleActiveSchedule: {
    color: '#4338CA',
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  statusPillOff: {
    backgroundColor: '#E7E5E4',
  },
  statusPillOn: {
    backgroundColor: '#FDEEE2',
  },
  statusPillOnIndigo: {
    backgroundColor: '#EEF2FF',
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusPillTextOff: {
    color: '#78716C',
  },
  statusPillTextOn: {
    color: '#8C4522',
  },
  statusPillTextOnIndigo: {
    color: '#4338CA',
  },
  switchSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#A8A29E',
    marginTop: 1,
  },
  switchInputWrapper: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0E8DF',
  },
  inputHelperLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#78716C',
    marginBottom: 4,
  },
  fieldInput: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C120C',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2D9CE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionDockDoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionDockDoneText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
  actionDockButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionDockSecondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F7F4EF',
    borderWidth: 1,
    borderColor: '#E2D9CE',
    borderRadius: 10,
    paddingVertical: 9,
  },
  actionDockSecondaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2A1610',
  },
  actionDockDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionDockDeleteText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
  },
  // Footprint Styles
  footprintContainer: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  cornerBracket: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderWidth: 3,
  },
  topLeftBracket: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
  },
  topRightBracket: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 6,
  },
  bottomLeftBracket: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
  },
  bottomRightBracket: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 6,
  },
  footprintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  footprintBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  footprintNameText: {
    color: '#1C1917',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  // Ghost Styles
  ghostContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 99999,
    width: 150,
  },
  ghostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 8,
    borderWidth: 2,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  ghostIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostTextContainer: {
    flex: 1,
  },
  ghostTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C1917',
  },
  ghostSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#78716C',
    marginTop: 1,
  },
});
