/**
 * Farm Layout Designer — DesignerCanvas
 *
 * Main canvas component that renders the grid, all plots, environmental zones,
 * and physical facilities, orchestrating drag/resize/selection interactions.
 *
 * This is the primary export of the farm-layout-designer module.
 */

import { useCallback, useEffect, useState, useRef, useMemo, type ReactNode } from 'react';
import { View, Text, Pressable, Animated, PanResponder, Vibration, Platform, ActivityIndicator } from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Save } from '../../../components/Icons';
import { Eye } from 'lucide-react-native';

import type { DesignerPlot, DesignerState, FarmZone, FarmFacility, FacilityFunction, SelectedElementType, AvailableFarmForImport } from '../types';
import {
  CANVAS_BG,
  CANVAS_BORDER,
  CANVAS_PADDING,
  CANVAS_WORLD_HEIGHT,
  CANVAS_WORLD_WIDTH,
  GRID_CELL_SIZE,
  GRID_COLOR_MAJOR,
  GRID_COLOR_MINOR,
  PIXELS_PER_UNIT,
  PLOT_COLORS,
  type FacilityTemplate,
  type ZoneTemplate,
  type PlotTemplate,
} from '../constants';

import { PlotItem } from './PlotItem';
import { CanvasActionDock } from './CanvasActionDock';
import { EmptyState } from './EmptyState';
import { FacilityItem } from './FacilityItem';
import { ZoneContainer } from './ZoneContainer';
import { FacilityInventorySheet } from './FacilityInventorySheet';
import { AddElementModal } from './AddElementModal';
import { BuildingPaletteCarousel } from './BuildingPaletteCarousel';
import { CanvasToolPalette, type ToolMode } from './CanvasToolPalette';
import {
  CanvasFootprint,
  FloatingDragGhost,
  getTemplateDimensions,
  type ActiveDragState,
  type DragItemType,
} from './DragPlacementOverlay';
import {
  loadFarmLayout,
  saveFarmLayout,
  isMasterFarmRecord,
  getFarmDetails,
  getCachedFarmLayout,
  getCachedFarmInfo,
} from '../db';
import {
  createPlot,
  createPlotWithDimensions,
  flipPlotOrientation,
  duplicatePlot,
  canFlipPlot,
} from '../utils/plot-manager';
import { findOpenPlacementPosition, type BoundingBox, type LayoutObstacle } from '../utils/collision';
import { generateUUID } from '../../../lib/local-db';
import { FarmMapSkeleton } from '../../../components/skeleton';

type DesignerCanvasProps = {
  farmId: string;
  /** Called after a successful save. */
  onSaveComplete: () => void;
  /** Called when the user wants to go back. */
  onBack: () => void;
  /** If true, layout is view-only (no editing, saving, dragging, or docks). */
  readOnly?: boolean;
};

export function DesignerCanvas({
  farmId,
  onSaveComplete,
  onBack,
  readOnly = false,
}: DesignerCanvasProps) {
  const cachedLayout = getCachedFarmLayout(farmId);
  const cachedInfo = getCachedFarmInfo(farmId);

  const [state, setState] = useState<DesignerState>({
    plots: cachedLayout?.plots || [],
    zones: cachedLayout?.zones || [],
    facilities: cachedLayout?.facilities || [],
    selectedId: null,
    selectedType: null,
    hasUnsavedChanges: false,
  });
  const [isMasterFarm, setIsMasterFarm] = useState(false);
  const [farmName, setFarmName] = useState(cachedInfo?.name || '');
  const [isLoading, setIsLoading] = useState(!cachedLayout);
  const [isSaving, setIsSaving] = useState(false);
  const insets = useSafeAreaInsets();

  // Active facility for inventory modal sheet
  const [activeFacilityForInventory, setActiveFacilityForInventory] = useState<FarmFacility | null>(null);
  const [isAddElementModalVisible, setIsAddElementModalVisible] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>('select');

  const [worldWidth, setWorldWidth] = useState(cachedLayout?.widthM || CANVAS_WORLD_WIDTH);
  const [worldHeight, setWorldHeight] = useState(cachedLayout?.heightM || CANVAS_WORLD_HEIGHT);

  const canvasWidth = CANVAS_PADDING * 2 + worldWidth * PIXELS_PER_UNIT;
  const canvasHeight = CANVAS_PADDING * 2 + worldHeight * PIXELS_PER_UNIT;

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isInitialFitDone, setIsInitialFitDone] = useState(false);

  // Maximum zoom out limit: precisely fits the full canvas inside the viewport so it never shrinks into a tiny dot
  const fitScale =
    viewportSize.width > 0 && viewportSize.height > 0 && canvasWidth > 0 && canvasHeight > 0
      ? Math.min(viewportSize.width / canvasWidth, viewportSize.height / canvasHeight) * 0.94
      : 1;
  const minScale = fitScale;

  // Viewport measurements for absolute screen-to-canvas coordinate mapping
  const viewportRef = useRef<View>(null);
  const viewportWindowOffset = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Active Clash of Clans drag state from carousel
  const activeDragRef = useRef<ActiveDragState | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null);

  const updateActiveDrag = useCallback((drag: ActiveDragState | null) => {
    activeDragRef.current = drag;
    setActiveDrag(drag);
  }, []);

  /**
   * Translates screen touch coordinates (moveX, moveY) into snapped world meters
   * taking into account viewport window offset, current pan, and zoom scale.
   */
  const screenToCanvasWorld = useCallback(
    (screenX: number, screenY: number, itemWidthM: number, itemHeightM: number) => {
      const vp = viewportWindowOffset.current;
      if (!vp.width || !vp.height) {
        return { worldX: worldWidth / 2, worldY: worldHeight / 2, isInside: false };
      }

      const touchV_x = screenX - vp.x;
      const touchV_y = screenY - vp.y;

      const isInside =
        touchV_x >= 0 &&
        touchV_x <= vp.width &&
        touchV_y >= 0 &&
        touchV_y <= vp.height;

      const V_cx = vp.width / 2;
      const V_cy = vp.height / 2;

      const curPan = _lastPan.current;
      const curScale = _lastScale.current > 0 ? _lastScale.current : 1;

      const dx = (touchV_x - V_cx - curPan.x) / curScale;
      const dy = (touchV_y - V_cy - curPan.y) / curScale;

      const px = canvasWidth / 2 + dx;
      const py = canvasHeight / 2 + dy;

      const worldX_raw = (px - CANVAS_PADDING) / PIXELS_PER_UNIT;
      const worldY_raw = (py - CANVAS_PADDING) / PIXELS_PER_UNIT;

      const snappedX = Math.round(worldX_raw / GRID_CELL_SIZE) * GRID_CELL_SIZE;
      const snappedY = Math.round(worldY_raw / GRID_CELL_SIZE) * GRID_CELL_SIZE;

      const halfW = itemWidthM / 2;
      const halfH = itemHeightM / 2;
      const clampedX = Math.max(halfW, Math.min(worldWidth - halfW, snappedX));
      const clampedY = Math.max(halfH, Math.min(worldHeight - halfH, snappedY));

      return {
        worldX: clampedX,
        worldY: clampedY,
        isInside,
      };
    },
    [worldWidth, worldHeight, canvasWidth, canvasHeight]
  );

  // --- Pan & Zoom Engine ---
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;

  const _lastPan = useRef({ x: 0, y: 0 });
  const _lastScale = useRef(1);
  const _lastReportedScale = useRef(1);
  const _initDistance = useRef(0);
  const [zoomScale, setZoomScale] = useState(1);

  useEffect(() => {
    const pId = pan.addListener((v) => { _lastPan.current = v; });
    const sId = scale.addListener((v) => {
      _lastScale.current = v.value;
      if (Math.abs(v.value - _lastReportedScale.current) > 0.08) {
        _lastReportedScale.current = v.value;
        setZoomScale(v.value);
      }
    });
    return () => {
      pan.removeListener(pId);
      scale.removeListener(sId);
    };
  }, [pan, scale]);

  const handleZoomIn = useCallback(() => {
    const nextScale = Math.min(3, _lastScale.current * 1.15);
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
        friction: 8,
        tension: 40,
      }),
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
        friction: 8,
        tension: 40,
      }),
    ]).start();
  }, [scale, pan, minScale]);

  useEffect(() => {
    if (viewportSize.width > 0 && viewportSize.height > 0 && !isInitialFitDone) {
      scale.setValue(minScale);
      pan.setValue({ x: 0, y: 0 });
      _lastScale.current = minScale;
      _lastPan.current = { x: 0, y: 0 };
      setZoomScale(minScale);
      setIsInitialFitDone(true);
    }
  }, [viewportSize.width, viewportSize.height, isInitialFitDone, minScale, scale, pan]);

  // Prevent canvas PanResponder from stealing single-touch gestures while dragging an element
  const isDraggingItemRef = useRef(false);
  const handleDragStart = useCallback(() => {
    isDraggingItemRef.current = true;
  }, []);
  const handleDragEnd = useCallback(() => {
    isDraggingItemRef.current = false;
  }, []);

  // Safeguard: adapt minimum scale if canvas area expands or shrinks
  useEffect(() => {
    if (isInitialFitDone && minScale > 0 && _lastScale.current < minScale) {
      Animated.spring(scale, {
        toValue: minScale,
        useNativeDriver: false,
        friction: 8,
        tension: 40,
      }).start();
      _lastScale.current = minScale;
      setZoomScale(minScale);
    }
  }, [minScale, isInitialFitDone, scale]);

  // Build list of all obstacles across both plots and physical facilities
  const allObstacles: LayoutObstacle[] = useMemo(() => {
    const plotObs: LayoutObstacle[] = state.plots.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      widthM: p.widthM,
      heightM: p.heightM,
    }));
    const facObs: LayoutObstacle[] = state.facilities.map((f) => ({
      id: f.id,
      x: f.x,
      y: f.y,
      widthM: f.widthM,
      heightM: f.heightM,
    }));
    return [...plotObs, ...facObs];
  }, [state.plots, state.facilities]);

  const canvasPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      if (isDraggingItemRef.current) return false;
      if (toolMode === 'pan') return true;
      if (evt.nativeEvent.touches.length >= 2) return true;
      return false;
    },
    onMoveShouldSetPanResponder: (evt, g) => {
      if (isDraggingItemRef.current) return false;
      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) return true;
      if (toolMode === 'pan' && touches.length === 1 && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2)) return true;
      if (touches.length === 1 && (Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10)) return true;
      return false;
    },
    onPanResponderGrant: (evt) => {
      pan.setOffset({ x: _lastPan.current.x, y: _lastPan.current.y });
      pan.setValue({ x: 0, y: 0 });

      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) {
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        _initDistance.current = Math.sqrt(dx * dx + dy * dy);
      } else {
        _initDistance.current = 0;
      }
    },
    onPanResponderMove: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches;
      if (touches.length >= 2) {
         const dx = touches[0].pageX - touches[1].pageX;
         const dy = touches[0].pageY - touches[1].pageY;
         const dist = Math.sqrt(dx * dx + dy * dy);
          if (_initDistance.current === 0) {
            _initDistance.current = dist;
          } else {
            const rawRatio = dist / _initDistance.current;
            // Damped pinch zoom ratio: smooth and slow, giving fine control
            const dampedRatio = 1 + (rawRatio - 1) * 0.45;
            let newScale = _lastScale.current * dampedRatio;
            newScale = Math.max(minScale, Math.min(newScale, 3));
            scale.setValue(newScale);
          }
      } else if (touches.length === 1) {
         const curScale = _lastScale.current > 0 ? _lastScale.current : 1;
         const PAN_SPEED = 0.85;
         // Scale-invariant: divides by curScale so camera panning never speeds up when zoomed in
         pan.setValue({
           x: (gestureState.dx / curScale) * PAN_SPEED,
           y: (gestureState.dy / curScale) * PAN_SPEED,
         });
      }
    },
    onPanResponderRelease: () => {
      pan.flattenOffset();
      setZoomScale(_lastScale.current);

      const currentScale = _lastScale.current > 0 ? _lastScale.current : minScale;
      const renderedW = canvasWidth * currentScale;
      const renderedH = canvasHeight * currentScale;

      // When zoomed out to fit-screen (rendered canvas <= viewport), keep it centered.
      // When zoomed in, allow smooth panning up to the edges with a subtle 20px elastic buffer.
      const maxPanX = renderedW > viewportSize.width ? (renderedW - viewportSize.width) / 2 + 20 : 0;
      const maxPanY = renderedH > viewportSize.height ? (renderedH - viewportSize.height) / 2 + 20 : 0;

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
    }
  }), [pan, scale, canvasWidth, canvasHeight, minScale, viewportSize, toolMode]);

  // Lock toggles & status
  const isCurrentSelectedLocked = useMemo(() => {
    if (!state.selectedId || !state.selectedType) return false;
    if (state.selectedType === 'plot') {
      return !!state.plots.find((p) => p.id === state.selectedId)?.isLocked;
    }
    if (state.selectedType === 'facility') {
      return !!state.facilities.find((f) => f.id === state.selectedId)?.isLocked;
    }
    if (state.selectedType === 'zone') {
      const z = state.zones.find((z) => z.id === state.selectedId);
      return !!(z?.isLocked || z?.isLockedGroup);
    }
    return false;
  }, [state.selectedId, state.selectedType, state.plots, state.facilities, state.zones]);

  const handleTogglePlotLock = useCallback((plotId: string) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      plots: prev.plots.map((p) => (p.id === plotId ? { ...p, isLocked: !p.isLocked } : p)),
    }));
  }, []);

  const handleToggleFacilityLock = useCallback((facilityId: string) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      facilities: prev.facilities.map((f) => (f.id === facilityId ? { ...f, isLocked: !f.isLocked } : f)),
    }));
  }, []);

  const handleToggleZoneLock = useCallback((zoneId: string) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      zones: prev.zones.map((z) =>
        z.id === zoneId
          ? { ...z, isLockedGroup: z.isLockedGroup === false ? true : false }
          : z
      ),
    }));
  }, []);

  const handleToggleLockSelected = useCallback(() => {
    if (!state.selectedId || !state.selectedType) return;
    if (state.selectedType === 'plot') handleTogglePlotLock(state.selectedId);
    else if (state.selectedType === 'facility') handleToggleFacilityLock(state.selectedId);
    else if (state.selectedType === 'zone') handleToggleZoneLock(state.selectedId);
  }, [state.selectedId, state.selectedType, handleTogglePlotLock, handleToggleFacilityLock, handleToggleZoneLock]);

  // Load existing layout on mount
  useEffect(() => {
    let mounted = true;
    Promise.all([loadFarmLayout(farmId), getFarmDetails(farmId)])
      .then(([loaded, farmRow]) => {
        if (!mounted) return;
        if (farmRow) {
          setFarmName(farmRow.farm_name || '');
        }
        const isMaster = isMasterFarmRecord(farmRow, loaded);
        setIsMasterFarm(isMaster);

        if (loaded) {
          setState((prev) => {
            if (prev.hasUnsavedChanges) return prev;
            return {
              plots: loaded.plots || [],
              zones: loaded.zones || [],
              facilities: loaded.facilities || [],
              selectedId: prev.selectedId,
              selectedType: prev.selectedType,
              hasUnsavedChanges: false,
            };
          });
          const hasMasterElements =
            (loaded.zones && loaded.zones.length > 0) ||
            (loaded.facilities && loaded.facilities.length > 0);
          const minDim = isMaster || hasMasterElements ? 28 : CANVAS_WORLD_WIDTH;
          const w = Math.max(loaded.widthM || minDim, minDim);
          const h = Math.max(loaded.heightM || minDim, minDim);
          setWorldWidth(w);
          setWorldHeight(h);
        }
      })
      .catch((e) => console.warn('[DesignerCanvas] Failed to load layout:', e))
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [farmId]);

  // ─── Plot CRUD ───────────────────────────────

  const handleAddPlotWithDimensions = useCallback(
    (widthM: number, heightM: number, customLabel?: string) => {
      setState((prev) => {
        const cw = worldWidth;
        const ch = worldHeight;
        const newPlot = createPlotWithDimensions(
          prev.plots,
          cw,
          ch,
          widthM,
          heightM,
          customLabel,
          prev.facilities
        );
        if (!newPlot) {
          Alert.alert(
            'No Space Available',
            'There is no open space remaining on the farm grid for a plot of this size. Please move, resize, or delete existing elements, or expand the area.'
          );
          return prev;
        }
        return {
          ...prev,
          plots: [...prev.plots, newPlot],
          selectedId: newPlot.id,
          selectedType: 'plot',
          hasUnsavedChanges: true,
        };
      });
    },
    [worldWidth, worldHeight]
  );

  const handleAddPlot = useCallback(() => {
    setState((prev) => {
      const cw = worldWidth;
      const ch = worldHeight;
      const newPlot = createPlot(prev.plots, cw, ch, prev.facilities);
      if (!newPlot) {
        Alert.alert(
          'No Space Available',
          'There is no open space remaining on the farm grid for a new plot. Please move, resize, or delete existing plots, or expand the farm area.'
        );
        return prev;
      }
      return {
        ...prev,
        plots: [...prev.plots, newPlot],
        selectedId: newPlot.id,
        selectedType: 'plot',
        hasUnsavedChanges: true,
      };
    });
  }, [worldWidth, worldHeight]);

  const handleSelectPlot = useCallback((plotId: string) => {
    setState((prev) => ({
      ...prev,
      selectedId: plotId,
      selectedType: 'plot',
    }));
  }, []);

  const handleMovePlot = useCallback((plotId: string, newX: number, newY: number) => {
    if (readOnly) return;
    setState((prev) => {
      const targetPlot = prev.plots.find((p) => p.id === plotId);
      const currentParentZone = targetPlot?.zoneId ? prev.zones.find((z) => z.id === targetPlot.zoneId) : null;

      const containingZone = prev.zones.find((z) => {
        // Compound imported farm parcels are closed entities!
        if (z.isCompoundAsset) return false;
        const left = z.x - z.widthM / 2;
        const right = z.x + z.widthM / 2;
        const top = z.y - z.heightM / 2;
        const bottom = z.y + z.heightM / 2;
        return newX >= left && newX <= right && newY >= top && newY <= bottom;
      });

      const finalZoneId = currentParentZone?.isCompoundAsset
        ? currentParentZone.id
        : containingZone
        ? containingZone.id
        : undefined;

      return {
        ...prev,
        hasUnsavedChanges: true,
        plots: prev.plots.map((p) =>
          p.id === plotId
            ? { ...p, x: newX, y: newY, zoneId: finalZoneId }
            : p
        ),
      };
    });
  }, [readOnly]);

  const handleResizePlot = useCallback(
    (plotId: string, newWidthM: number, newHeightM: number, newX?: number, newY?: number) => {
      if (readOnly) return;
      setState((prev) => {
        const targetPlot = prev.plots.find((p) => p.id === plotId);
        if (!targetPlot) return prev;
        const finalX = newX !== undefined ? newX : targetPlot.x;
        const finalY = newY !== undefined ? newY : targetPlot.y;
        const currentParentZone = targetPlot?.zoneId ? prev.zones.find((z) => z.id === targetPlot.zoneId) : null;

        // Boundary clamp to canvas bounds
        const halfW = newWidthM / 2;
        const halfH = newHeightM / 2;
        const clampedX = Math.max(halfW, Math.min(worldWidth - halfW, finalX));
        const clampedY = Math.max(halfH, Math.min(worldHeight - halfH, finalY));

        const containingZone = prev.zones.find((z) => {
          // Compound imported farm parcels are closed entities!
          if (z.isCompoundAsset) return false;
          const left = z.x - z.widthM / 2;
          const right = z.x + z.widthM / 2;
          const top = z.y - z.heightM / 2;
          const bottom = z.y + z.heightM / 2;
          return clampedX >= left && clampedX <= right && clampedY >= top && clampedY <= bottom;
        });

        const finalZoneId = currentParentZone?.isCompoundAsset
          ? currentParentZone.id
          : containingZone
          ? containingZone.id
          : undefined;

        return {
          ...prev,
          hasUnsavedChanges: true,
          plots: prev.plots.map((p) =>
            p.id === plotId
              ? {
                  ...p,
                  widthM: newWidthM,
                  heightM: newHeightM,
                  x: clampedX,
                  y: clampedY,
                  zoneId: finalZoneId,
                }
              : p
          ),
        };
      });
    },
    [worldWidth, worldHeight]
  );

  const handleRenamePlot = useCallback((plotId: string, newLabel: string) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      plots: prev.plots.map((p) =>
        p.id === plotId ? { ...p, label: newLabel } : p
      ),
    }));
  }, []);

  const handleDeletePlot = useCallback((plotId: string) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      selectedId: prev.selectedId === plotId ? null : prev.selectedId,
      selectedType: prev.selectedId === plotId ? null : prev.selectedType,
      plots: prev.plots.filter((p) => p.id !== plotId),
    }));
  }, []);

  const handleFlipPlot = useCallback(
    (plotId: string) => {
      setState((prev) => {
        const targetPlot = prev.plots.find((p) => p.id === plotId);
        if (!targetPlot) return prev;

        if (!canFlipPlot(targetPlot, prev.plots, worldWidth, worldHeight)) {
          Alert.alert(
            'Cannot Flip Plot',
            'Flipping this plot would overlap with an adjacent plot or exceed farm boundaries.'
          );
          return prev;
        }

        return {
          ...prev,
          hasUnsavedChanges: true,
          plots: prev.plots.map((p) =>
            p.id === plotId ? flipPlotOrientation(p) : p
          ),
        };
      });
    },
    [worldWidth, worldHeight]
  );

  const handleDuplicatePlot = useCallback(() => {
    setState((prev) => {
      if (!prev.selectedId || prev.selectedType !== 'plot') return prev;
      const plotToDuplicate = prev.plots.find((p) => p.id === prev.selectedId);
      if (!plotToDuplicate) return prev;

      const cw = worldWidth;
      const ch = worldHeight;
      const newPlot = duplicatePlot(plotToDuplicate, prev.plots, cw, ch);
      if (!newPlot) {
        Alert.alert(
          'No Space Available',
          'Cannot duplicate plot because there is no open space large enough for this plot on the layout.'
        );
        return prev;
      }

      return {
        ...prev,
        plots: [...prev.plots, newPlot],
        selectedId: newPlot.id,
        selectedType: 'plot',
        hasUnsavedChanges: true,
      };
    });
  }, [worldWidth, worldHeight]);

  // ─── Master Plan: Facility & Zone Handlers ───

  const handleAddFacility = useCallback((template: FacilityTemplate, customName?: string, customFunction?: FacilityFunction) => {
    setState((prev) => {
      const existingElements: BoundingBox[] = [
        ...prev.plots.map((p) => ({ x: p.x, y: p.y, widthM: p.widthM, heightM: p.heightM })),
        ...prev.facilities.map((f) => ({ x: f.x, y: f.y, widthM: f.widthM, heightM: f.heightM })),
        ...prev.zones.map((z) => ({ x: z.x, y: z.y, widthM: z.widthM, heightM: z.heightM })),
      ];

      const currentW = Math.max(worldWidth, 28);
      const currentH = Math.max(worldHeight, 28);

      const placement = findOpenPlacementPosition(
        template.defaultWidthM,
        template.defaultHeightM,
        existingElements,
        currentW,
        currentH,
        1.0 // 1.0m clearance buffer
      );

      if (placement.newWorldW > worldWidth) setWorldWidth(placement.newWorldW);
      if (placement.newWorldH > worldHeight) setWorldHeight(placement.newWorldH);

      const generatedName =
        customName?.trim() ||
        (template.name === 'Generic Facility'
          ? `Facility ${prev.facilities.length + 1}`
          : template.name);

      const newFacility: FarmFacility = {
        id: generateUUID(),
        name: generatedName,
        category: template.category,
        facilityFunction: 'none',
        hasInventory: false,
        hasSchedule: false,
        inventoryName: `${generatedName} Inventory`,
        scheduleName: `${generatedName} Schedule`,
        icon: template.icon,
        x: placement.x,
        y: placement.y,
        widthM: template.defaultWidthM,
        heightM: template.defaultHeightM,
        color: template.color,
        inventories: template.initialItems.map((item) => ({
          ...item,
          id: generateUUID(),
          updatedAt: new Date().toISOString(),
        })),
        timeLogs: [],
        zoneId: undefined, // Always independent, never part of a compound group
      };

      return {
        ...prev,
        facilities: [...prev.facilities, newFacility],
        selectedId: newFacility.id,
        selectedType: 'facility',
        hasUnsavedChanges: true,
      };
    });
  }, [worldWidth, worldHeight]);

  const handleAddZone = useCallback((template: ZoneTemplate, customName?: string) => {
    setState((prev) => {
      const existingElements: BoundingBox[] = [
        ...prev.plots.map((p) => ({ x: p.x, y: p.y, widthM: p.widthM, heightM: p.heightM })),
        ...prev.facilities.map((f) => ({ x: f.x, y: f.y, widthM: f.widthM, heightM: f.heightM })),
        ...prev.zones.map((z) => ({ x: z.x, y: z.y, widthM: z.widthM, heightM: z.heightM })),
      ];

      const currentW = Math.max(worldWidth, 28);
      const currentH = Math.max(worldHeight, 28);

      const placement = findOpenPlacementPosition(
        template.defaultWidthM,
        template.defaultHeightM,
        existingElements,
        currentW,
        currentH,
        1.5 // 1.5m buffer for zone boundaries
      );

      if (placement.newWorldW > worldWidth) setWorldWidth(placement.newWorldW);
      if (placement.newWorldH > worldHeight) setWorldHeight(placement.newWorldH);

      const generatedName =
        customName?.trim() ||
        (template.name === 'Generic Zone'
          ? `Zone ${prev.zones.length + 1}`
          : template.name);

      const newZone: FarmZone = {
        id: generateUUID(),
        name: generatedName,
        code: template.code,
        zoneType: template.zoneType,
        organicStatus: template.organicStatus,
        x: placement.x,
        y: placement.y,
        widthM: template.defaultWidthM,
        heightM: template.defaultHeightM,
        color: template.color,
        fillColor: template.fillColor,
      };

      return {
        ...prev,
        zones: [...prev.zones, newZone],
        selectedId: newZone.id,
        selectedType: 'zone',
        hasUnsavedChanges: true,
      };
    });
  }, [worldWidth, worldHeight]);

  // ─── Direct Drag-and-Drop Placement Handlers (Clash of Clans) ───

  const handleAddFacilityAtPosition = useCallback(
    (template: FacilityTemplate, targetX: number, targetY: number) => {
      setState((prev) => {
        const generatedName =
          template.name === 'Generic Facility'
            ? `Facility ${prev.facilities.length + 1}`
            : template.name;

        const newFacility: FarmFacility = {
          id: generateUUID(),
          name: generatedName,
          category: template.category,
          facilityFunction: 'none',
          hasInventory: false,
          hasSchedule: false,
          inventoryName: `${generatedName} Inventory`,
          scheduleName: `${generatedName} Schedule`,
          icon: template.icon,
          x: targetX,
          y: targetY,
          widthM: template.defaultWidthM,
          heightM: template.defaultHeightM,
          color: template.color,
          inventories: template.initialItems.map((item) => ({
            ...item,
            id: generateUUID(),
            updatedAt: new Date().toISOString(),
          })),
          timeLogs: [],
          zoneId: undefined,
        };

        try {
          Vibration.vibrate(Platform.OS === 'android' ? 30 : 15);
        } catch {}

        return {
          ...prev,
          facilities: [...prev.facilities, newFacility],
          selectedId: newFacility.id,
          selectedType: 'facility',
          hasUnsavedChanges: true,
        };
      });
    },
    []
  );

  const handleAddPlotAtPosition = useCallback(
    (template: PlotTemplate, targetX: number, targetY: number) => {
      setState((prev) => {
        const newPlot: DesignerPlot = {
          id: generateUUID(),
          label: `${template.label} ${prev.plots.length + 1}`,
          x: targetX,
          y: targetY,
          widthM: template.widthM,
          heightM: template.heightM,
          color: PLOT_COLORS[prev.plots.length % PLOT_COLORS.length],
          rotation: 0,
          zoneId: undefined,
        };

        try {
          Vibration.vibrate(Platform.OS === 'android' ? 30 : 15);
        } catch {}

        return {
          ...prev,
          plots: [...prev.plots, newPlot],
          selectedId: newPlot.id,
          selectedType: 'plot',
          hasUnsavedChanges: true,
        };
      });
    },
    []
  );

  const handleAddZoneAtPosition = useCallback(
    (template: ZoneTemplate, targetX: number, targetY: number) => {
      setState((prev) => {
        const generatedName =
          template.name === 'Generic Zone'
            ? `Zone ${prev.zones.length + 1}`
            : template.name;

        const newZone: FarmZone = {
          id: generateUUID(),
          name: generatedName,
          code: template.code,
          zoneType: template.zoneType,
          organicStatus: template.organicStatus,
          x: targetX,
          y: targetY,
          widthM: template.defaultWidthM,
          heightM: template.defaultHeightM,
          color: template.color,
          fillColor: template.fillColor,
        };

        try {
          Vibration.vibrate(Platform.OS === 'android' ? 30 : 15);
        } catch {}

        return {
          ...prev,
          zones: [...prev.zones, newZone],
          selectedId: newZone.id,
          selectedType: 'zone',
          hasUnsavedChanges: true,
        };
      });
    },
    []
  );

  // Palette Drag Event Listeners
  const handlePaletteDragStart = useCallback(
    (
      itemType: DragItemType,
      template: FacilityTemplate | ZoneTemplate | PlotTemplate,
      startScreenPos: { x: number; y: number }
    ) => {
      // Re-measure viewport for fresh screen coordinates
      viewportRef.current?.measureInWindow((x, y, width, height) => {
        if (width && height) {
          viewportWindowOffset.current = { x, y, width, height };
        }
      });

      const dims = getTemplateDimensions(itemType, template);
      const res = screenToCanvasWorld(startScreenPos.x, startScreenPos.y, dims.widthM, dims.heightM);

      updateActiveDrag({
        itemType,
        template,
        screenPos: startScreenPos,
        worldPos: res.isInside ? { x: res.worldX, y: res.worldY } : null,
        isValid: res.isInside,
      });
    },
    [screenToCanvasWorld, updateActiveDrag]
  );

  const handlePaletteDragMove = useCallback(
    (screenPos: { x: number; y: number }) => {
      if (!activeDragRef.current) return;
      const dims = getTemplateDimensions(
        activeDragRef.current.itemType,
        activeDragRef.current.template
      );
      const res = screenToCanvasWorld(screenPos.x, screenPos.y, dims.widthM, dims.heightM);

      updateActiveDrag({
        ...activeDragRef.current,
        screenPos,
        worldPos: res.isInside ? { x: res.worldX, y: res.worldY } : null,
        isValid: res.isInside,
      });
    },
    [screenToCanvasWorld, updateActiveDrag]
  );

  const handlePaletteDragEnd = useCallback(() => {
    const current = activeDragRef.current;
    if (current && current.isValid && current.worldPos) {
      if (current.itemType === 'facility') {
        handleAddFacilityAtPosition(
          current.template as FacilityTemplate,
          current.worldPos.x,
          current.worldPos.y
        );
      } else if (current.itemType === 'plot') {
        handleAddPlotAtPosition(
          current.template as PlotTemplate,
          current.worldPos.x,
          current.worldPos.y
        );
      } else if (current.itemType === 'zone') {
        handleAddZoneAtPosition(
          current.template as ZoneTemplate,
          current.worldPos.x,
          current.worldPos.y
        );
      }
    }
    updateActiveDrag(null);
  }, [
    handleAddFacilityAtPosition,
    handleAddPlotAtPosition,
    handleAddZoneAtPosition,
    updateActiveDrag,
  ]);

  const handleRenameFacility = useCallback((facilityId: string, newName: string) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      facilities: prev.facilities.map((f) =>
        f.id === facilityId ? { ...f, name: newName } : f
      ),
    }));
  }, []);

  const handleUpdateFacilityRole = useCallback((facilityId: string, role: FacilityFunction) => {
    const hasInv = role === 'inventory' || role === 'both';
    const hasSched = role === 'time_keeping' || role === 'both';

    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      facilities: prev.facilities.map((f) =>
        f.id === facilityId
          ? {
              ...f,
              facilityFunction: role,
              hasInventory: hasInv,
              hasSchedule: hasSched,
              inventories: hasInv ? (f.inventories || []) : [],
              timeLogs: hasSched ? (f.timeLogs || []) : [],
            }
          : f
      ),
    }));
  }, []);

  const handleToggleFacilityInventory = useCallback((facilityId: string, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      facilities: prev.facilities.map((f) => {
        if (f.id !== facilityId) return f;
        const currentSched =
          f.hasSchedule ??
          (f.facilityFunction === 'time_keeping' || f.facilityFunction === 'both');

        let newRole: FacilityFunction = 'none';
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
      }),
    }));
  }, []);

  const handleToggleFacilitySchedule = useCallback((facilityId: string, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      facilities: prev.facilities.map((f) => {
        if (f.id !== facilityId) return f;
        const currentInv =
          f.hasInventory ??
          (f.facilityFunction === 'inventory' || f.facilityFunction === 'both');

        let newRole: FacilityFunction = 'none';
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
      }),
    }));
  }, []);

  const handleUpdateFacilityInventoryName = useCallback((facilityId: string, inventoryName: string) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      facilities: prev.facilities.map((f) =>
        f.id === facilityId ? { ...f, inventoryName } : f
      ),
    }));
  }, []);

  const handleUpdateFacilityScheduleName = useCallback((facilityId: string, scheduleName: string) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      facilities: prev.facilities.map((f) =>
        f.id === facilityId ? { ...f, scheduleName } : f
      ),
    }));
  }, []);

  const handleRenameZone = useCallback((zoneId: string, newName: string) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      zones: prev.zones.map((z) =>
        z.id === zoneId ? { ...z, name: newName } : z
      ),
    }));
  }, []);

  const handleSelectFacility = useCallback((facilityId: string) => {
    setState((prev) => ({
      ...prev,
      selectedId: facilityId,
      selectedType: 'facility',
    }));
  }, []);

  const handleMoveFacility = useCallback((facilityId: string, newX: number, newY: number) => {
    if (readOnly) return;
    setState((prev) => {
      const targetFac = prev.facilities.find((f) => f.id === facilityId);
      const currentParentZone = targetFac?.zoneId ? prev.zones.find((z) => z.id === targetFac.zoneId) : null;

      const containingZone = prev.zones.find((z) => {
        // Compound imported farm parcels are closed entities!
        if (z.isCompoundAsset) return false;
        const left = z.x - z.widthM / 2;
        const right = z.x + z.widthM / 2;
        const top = z.y - z.heightM / 2;
        const bottom = z.y + z.heightM / 2;
        return newX >= left && newX <= right && newY >= top && newY <= bottom;
      });

      const finalZoneId = currentParentZone?.isCompoundAsset
        ? currentParentZone.id
        : containingZone
        ? containingZone.id
        : undefined;

      return {
        ...prev,
        hasUnsavedChanges: true,
        facilities: prev.facilities.map((f) =>
          f.id === facilityId
            ? { ...f, x: newX, y: newY, zoneId: finalZoneId }
            : f
        ),
      };
    });
  }, [readOnly]);

  const handleResizeFacility = useCallback(
    (facilityId: string, newWidthM: number, newHeightM: number, newX?: number, newY?: number) => {
      if (readOnly) return;
      setState((prev) => {
        const current = prev.facilities.find((f) => f.id === facilityId);
        if (!current) return prev;
        const finalX = newX !== undefined ? newX : current.x;
        const finalY = newY !== undefined ? newY : current.y;

        // Boundary clamp to canvas bounds
        const halfW = newWidthM / 2;
        const halfH = newHeightM / 2;
        const clampedX = Math.max(halfW, Math.min(worldWidth - halfW, finalX));
        const clampedY = Math.max(halfH, Math.min(worldHeight - halfH, finalY));

        const currentParentZone = current.zoneId ? prev.zones.find((z) => z.id === current.zoneId) : null;

        const containingZone = prev.zones.find((z) => {
          // Compound imported farm parcels are closed entities!
          if (z.isCompoundAsset) return false;
          const left = z.x - z.widthM / 2;
          const right = z.x + z.widthM / 2;
          const top = z.y - z.heightM / 2;
          const bottom = z.y + z.heightM / 2;
          return clampedX >= left && clampedX <= right && clampedY >= top && clampedY <= bottom;
        });

        const finalZoneId = currentParentZone?.isCompoundAsset
          ? currentParentZone.id
          : containingZone
          ? containingZone.id
          : undefined;

        return {
          ...prev,
          hasUnsavedChanges: true,
          facilities: prev.facilities.map((f) =>
            f.id === facilityId
              ? {
                  ...f,
                  widthM: newWidthM,
                  heightM: newHeightM,
                  x: clampedX,
                  y: clampedY,
                  zoneId: finalZoneId,
                }
              : f
          ),
        };
      });
    },
    [worldWidth, worldHeight]
  );

  const handleUpdateFacility = useCallback((updatedFacility: FarmFacility) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      facilities: prev.facilities.map((f) =>
        f.id === updatedFacility.id ? updatedFacility : f
      ),
    }));
    setActiveFacilityForInventory(updatedFacility);
  }, []);

  const handleDeleteFacility = useCallback((facilityId: string) => {
    setState((prev) => ({
      ...prev,
      hasUnsavedChanges: true,
      selectedId: prev.selectedId === facilityId ? null : prev.selectedId,
      selectedType: prev.selectedId === facilityId ? null : prev.selectedType,
      facilities: prev.facilities.filter((f) => f.id !== facilityId),
    }));
  }, []);

  const handleSelectZone = useCallback((zoneId: string) => {
    setState((prev) => ({
      ...prev,
      selectedId: zoneId,
      selectedType: 'zone',
    }));
  }, []);

  const handleMoveZone = useCallback((zoneId: string, newX: number, newY: number) => {
    if (readOnly) return;
    setState((prev) => {
      const currentZone = prev.zones.find((z) => z.id === zoneId);
      const dx = currentZone ? newX - currentZone.x : 0;
      const dy = currentZone ? newY - currentZone.y : 0;

      return {
        ...prev,
        hasUnsavedChanges: true,
        zones: prev.zones.map((z) =>
          z.id === zoneId ? { ...z, x: newX, y: newY } : z
        ),
        plots: prev.plots.map((p) =>
          p.zoneId === zoneId ? { ...p, x: Math.round((p.x + dx) * 10) / 10, y: Math.round((p.y + dy) * 10) / 10 } : p
        ),
        facilities: prev.facilities.map((f) =>
          f.zoneId === zoneId ? { ...f, x: Math.round((f.x + dx) * 10) / 10, y: Math.round((f.y + dy) * 10) / 10 } : f
        ),
      };
    });
  }, []);

  const handleResizeZone = useCallback(
    (zoneId: string, newWidthM: number, newHeightM: number, newX?: number, newY?: number) => {
      setState((prev) => {
        const current = prev.zones.find((z) => z.id === zoneId);
        if (!current) return prev;
        const finalX = newX !== undefined ? newX : current.x;
        const finalY = newY !== undefined ? newY : current.y;

        // Boundary clamp to canvas bounds
        const halfW = newWidthM / 2;
        const halfH = newHeightM / 2;
        const clampedX = Math.max(halfW, Math.min(worldWidth - halfW, finalX));
        const clampedY = Math.max(halfH, Math.min(worldHeight - halfH, finalY));

        return {
          ...prev,
          hasUnsavedChanges: true,
          zones: prev.zones.map((z) =>
            z.id === zoneId
              ? {
                  ...z,
                  widthM: newWidthM,
                  heightM: newHeightM,
                  x: clampedX,
                  y: clampedY,
                }
              : z
          ),
        };
      });
    },
    [worldWidth, worldHeight]
  );

  const handleDeleteZone = useCallback((zoneId: string) => {
    setState((prev) => {
      const targetZone = prev.zones.find((z) => z.id === zoneId);
      const isCompound = targetZone?.isCompoundAsset;

      return {
        ...prev,
        hasUnsavedChanges: true,
        selectedId: prev.selectedId === zoneId ? null : prev.selectedId,
        selectedType: prev.selectedId === zoneId ? null : prev.selectedType,
        zones: prev.zones.filter((z) => z.id !== zoneId),
        plots: isCompound
          ? prev.plots.filter((p) => p.zoneId !== zoneId)
          : prev.plots.map((p) => (p.zoneId === zoneId ? { ...p, zoneId: undefined } : p)),
        facilities: isCompound
          ? prev.facilities.filter((f) => f.zoneId !== zoneId)
          : prev.facilities.map((f) => (f.zoneId === zoneId ? { ...f, zoneId: undefined } : f)),
      };
    });
  }, []);

  // ─── Master Estate: Import Farm Layout ────────

  const IMPORT_PALETTES = useMemo(
    () => [
      { color: '#2D6A4F', fill: 'rgba(45, 106, 79, 0.08)' },
      { color: '#8C4522', fill: 'rgba(140, 69, 34, 0.08)' },
      { color: '#1E40AF', fill: 'rgba(30, 64, 175, 0.08)' },
      { color: '#B45309', fill: 'rgba(180, 83, 9, 0.08)' },
      { color: '#047857', fill: 'rgba(4, 120, 87, 0.08)' },
      { color: '#6D28D9', fill: 'rgba(109, 40, 217, 0.08)' },
    ],
    []
  );

  const handleImportFarmLayout = useCallback(
    (importedFarm: AvailableFarmForImport) => {
      // 1. Calculate tight bounding box of actual occupied space (plots + facilities + internal zones)
      const allItems: { x: number; y: number; w: number; h: number }[] = [
        ...importedFarm.layout.plots.map((p) => ({ x: p.x, y: p.y, w: p.widthM, h: p.heightM })),
        ...importedFarm.layout.facilities.map((f) => ({ x: f.x, y: f.y, w: f.widthM, h: f.heightM })),
        ...importedFarm.layout.zones.map((z) => ({ x: z.x, y: z.y, w: z.widthM, h: z.heightM })),
      ];

      let importedW = 8;
      let importedH = 8;
      let contentCenterX = (importedFarm.layout.widthM || 12) / 2;
      let contentCenterY = (importedFarm.layout.heightM || 12) / 2;

      if (allItems.length > 0) {
        const minX = Math.min(...allItems.map((it) => it.x - it.w / 2));
        const maxX = Math.max(...allItems.map((it) => it.x + it.w / 2));
        const minY = Math.min(...allItems.map((it) => it.y - it.h / 2));
        const maxY = Math.max(...allItems.map((it) => it.y + it.h / 2));

        const occupiedW = maxX - minX;
        const occupiedH = maxY - minY;

        // 1 meter perimeter margin around occupied items for pathways and fencing
        const PADDING = 1.0;
        importedW = Math.max(4, Math.ceil(occupiedW + PADDING * 2));
        importedH = Math.max(4, Math.ceil(occupiedH + PADDING * 2));
        contentCenterX = (minX + maxX) / 2;
        contentCenterY = (minY + maxY) / 2;
      }

      setState((prev) => {
        const existingElements: BoundingBox[] = [
          ...prev.plots.map((p) => ({ x: p.x, y: p.y, widthM: p.widthM, heightM: p.heightM })),
          ...prev.facilities.map((f) => ({ x: f.x, y: f.y, widthM: f.widthM, heightM: f.heightM })),
          ...prev.zones.map((z) => ({ x: z.x, y: z.y, widthM: z.widthM, heightM: z.heightM })),
        ];

        const placement = findOpenPlacementPosition(
          importedW,
          importedH,
          existingElements,
          worldWidth,
          worldHeight,
          2.0 // generous 2m buffer for imported farm parcel
        );

        if (placement.newWorldW > worldWidth) setWorldWidth(placement.newWorldW);
        if (placement.newWorldH > worldHeight) setWorldHeight(placement.newWorldH);

        const newZoneId = generateUUID();
        const palette = IMPORT_PALETTES[prev.zones.length % IMPORT_PALETTES.length];
        const zoneType =
          importedFarm.layout.zones.length > 0 && importedFarm.layout.zones[0].zoneType
            ? importedFarm.layout.zones[0].zoneType
            : 'open_field';

        const newZone: FarmZone = {
          id: newZoneId,
          name: importedFarm.farmName,
          code: importedFarm.farmName.substring(0, 3).toUpperCase(),
          zoneType,
          organicStatus: 'certified_organic',
          x: placement.x,
          y: placement.y,
          widthM: importedW,
          heightM: importedH,
          color: palette.color,
          fillColor: palette.fill,
          isCompoundAsset: true,
          isLockedGroup: true,
          sourceFarmId: importedFarm.farmId,
        };

        // Map plots to new zone coordinates & associate zoneId
        const importedPlots = importedFarm.layout.plots.map((p) => ({
          ...p,
          id: generateUUID(),
          label: p.label,
          zoneId: newZoneId,
          x: Math.round((newZone.x + (p.x - contentCenterX)) * 10) / 10,
          y: Math.round((newZone.y + (p.y - contentCenterY)) * 10) / 10,
        }));

        // Map facilities to new zone coordinates & associate zoneId
        const importedFacilities = importedFarm.layout.facilities.map((f) => ({
          ...f,
          id: generateUUID(),
          zoneId: newZoneId,
          x: Math.round((newZone.x + (f.x - contentCenterX)) * 10) / 10,
          y: Math.round((newZone.y + (f.y - contentCenterY)) * 10) / 10,
        }));

        Alert.alert(
          'Layout Imported',
          `"${importedFarm.farmName}" has been imported as a single unified farm parcel (${importedPlots.length} plots, ${importedFacilities.length} facilities). Touch and drag anywhere on it to freely place it on your map!`
        );

        return {
          ...prev,
          zones: [...prev.zones, newZone],
          plots: [...prev.plots, ...importedPlots],
          facilities: [...prev.facilities, ...importedFacilities],
          selectedId: newZoneId,
          selectedType: 'zone',
          hasUnsavedChanges: true,
        };
      });
    },
    [worldWidth, worldHeight, IMPORT_PALETTES]
  );

  // ─── Save ────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (readOnly) return;
    const totalElements = state.plots.length + state.facilities.length + state.zones.length;
    if (totalElements === 0) {
      Alert.alert('Empty Layout', 'Add at least one plot, facility, or zone before saving.');
      return;
    }

    setIsSaving(true);
    try {
      await saveFarmLayout(
        farmId,
        state.plots,
        worldWidth,
        worldHeight,
        state.zones,
        state.facilities
      );
      setState((prev) => ({ ...prev, hasUnsavedChanges: false }));
      Alert.alert('Master Layout Saved', 'Your farm master plan and inventories have been saved.', [
        { text: 'OK', onPress: onSaveComplete },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save layout.';
      Alert.alert('Save Error', message);
    } finally {
      setIsSaving(false);
    }
  }, [farmId, state.plots, state.zones, state.facilities, worldWidth, worldHeight, onSaveComplete]);

  // ─── Back with unsaved changes check ─────────

  const handleBack = useCallback(() => {
    if (state.hasUnsavedChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Are you sure you want to go back?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onBack },
        ]
      );
    } else {
      onBack();
    }
  }, [state.hasUnsavedChanges, onBack]);

  const handleCanvasTap = useCallback(() => {
    setState((prev) => ({ ...prev, selectedId: null, selectedType: null }));
  }, []);

  // ─── Render ──────────────────────────────────

  const selectedPlot =
    state.selectedType === 'plot'
      ? state.plots.find((p) => p.id === state.selectedId) || null
      : null;

  const selectedFacility =
    state.selectedType === 'facility'
      ? state.facilities.find((f) => f.id === state.selectedId) || null
      : null;

  const selectedZone =
    state.selectedType === 'zone'
      ? state.zones.find((z) => z.id === state.selectedId) || null
      : null;

  // Minimum dimensions for selected zone based on contained items
  const selectedZoneMinDimensions = useMemo(() => {
    if (!selectedZone) return { minW: 2, minH: 2 };
    const childPlots = state.plots.filter((p) => p.zoneId === selectedZone.id);
    const childFacs = state.facilities.filter((f) => f.zoneId === selectedZone.id);
    if (childPlots.length === 0 && childFacs.length === 0) {
      return { minW: 2, minH: 2 };
    }
    const allChildBounds = [
      ...childPlots.map((p) => ({
        minX: p.x - p.widthM / 2,
        maxX: p.x + p.widthM / 2,
        minY: p.y - p.heightM / 2,
        maxY: p.y + p.heightM / 2,
      })),
      ...childFacs.map((f) => ({
        minX: f.x - f.widthM / 2,
        maxX: f.x + f.widthM / 2,
        minY: f.y - f.heightM / 2,
        maxY: f.y + f.heightM / 2,
      })),
    ];
    const spanX = Math.max(...allChildBounds.map((b) => b.maxX)) - Math.min(...allChildBounds.map((b) => b.minX));
    const spanY = Math.max(...allChildBounds.map((b) => b.maxY)) - Math.min(...allChildBounds.map((b) => b.minY));
    return {
      minW: Math.max(2, Math.ceil(spanX + 1.0)),
      minH: Math.max(2, Math.ceil(spanY + 1.0)),
    };
  }, [selectedZone, state.plots, state.facilities]);

  // Native grid lines (Zero offscreen bitmap allocation — eliminates Android Canvas bitmap crash)
  const gridLines = useMemo(() => {
    const lines: ReactNode[] = [];
    const step = worldWidth > 20 || worldHeight > 20 ? 1 : GRID_CELL_SIZE;

    // Vertical lines
    for (let m = step; m < worldWidth; m += step) {
      const isMajor = m % 5 === 0;
      const isMid = m % 1 === 0;
      lines.push(
        <View
          key={`v-${m}`}
          style={{
            position: 'absolute',
            left: m * PIXELS_PER_UNIT,
            top: 0,
            bottom: 0,
            width: isMajor ? 1.5 : 1,
            backgroundColor: isMajor ? GRID_COLOR_MAJOR : isMid ? '#E2D8CC' : GRID_COLOR_MINOR,
          }}
        />
      );
    }

    // Horizontal lines
    for (let m = step; m < worldHeight; m += step) {
      const isMajor = m % 5 === 0;
      const isMid = m % 1 === 0;
      lines.push(
        <View
          key={`h-${m}`}
          style={{
            position: 'absolute',
            top: m * PIXELS_PER_UNIT,
            left: 0,
            right: 0,
            height: isMajor ? 1.5 : 1,
            backgroundColor: isMajor ? GRID_COLOR_MAJOR : isMid ? '#E2D8CC' : GRID_COLOR_MINOR,
          }}
        />
      );
    }

    return lines;
  }, [worldWidth, worldHeight]);

  if (isLoading) {
    return <FarmMapSkeleton title="Farm Designer" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FBF8F4' }}>
      {/* Top Floating Control Bar (Clash of Clans Style Navigation & Actions) */}
      <View
        style={{
          paddingTop: Math.max(insets.top, 20) + 8,
          paddingBottom: 8,
          paddingHorizontal: 16,
          backgroundColor: '#ffffff',
          borderBottomWidth: 1,
          borderBottomColor: '#E2D9CE',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 3,
          elevation: 2,
        }}>
        {/* Main Row: Back Button, Centered Title + Element Summary, Save Action */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
          {/* Back Button */}
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: '#F7F4EF',
              borderWidth: 1,
              borderColor: '#E2D9CE',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <ArrowLeft size={18} color="#8C4522" strokeWidth={2.5} />
          </Pressable>

          {/* Title & Stats Summary */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '900',
                color: '#1C120C',
                letterSpacing: -0.2,
              }}
              numberOfLines={1}>
              {farmName ? farmName : isMasterFarm ? 'Estate Master Plan' : 'Plots & Zones'}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                marginTop: 2,
              }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#8C7C70' }}>
                {state.plots.length} Beds • {state.facilities.length} Facilities
                {state.zones.length > 0 ? ` • ${state.zones.length} Zones` : ''}
              </Text>
              {state.hasUnsavedChanges && (
                <View
                  style={{
                    backgroundColor: '#D97706',
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    borderRadius: 4,
                  }}>
                  <Text style={{ fontSize: 8, fontWeight: '900', color: '#FFFFFF' }}>
                    UNSAVED
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Save Button with Dirty State Highlight or View Only Badge */}
          {readOnly ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: '#F3F4F6',
                borderWidth: 1,
                borderColor: '#E5E7EB',
              }}>
              <Eye size={14} color="#6B7280" strokeWidth={2.2} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#4B5563' }}>
                View Only
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              hitSlop={8}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: state.hasUnsavedChanges ? '#8C4522' : '#2D6A4F',
                shadowColor: state.hasUnsavedChanges ? '#8C4522' : '#2D6A4F',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 3,
                elevation: 3,
              }}>
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Save size={15} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>
                    Save
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {/* Sub-row: Grid Size Stepper */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 6,
            paddingTop: 6,
            borderTopWidth: 1,
            borderTopColor: '#F2ECE4',
          }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#8C7C70' }}>
            Grid Area:
          </Text>
          {!readOnly && (
            <Pressable
              onPress={() => {
                setWorldWidth((w) => Math.max(8, w - 4));
                setWorldHeight((h) => Math.max(12, h - 4));
              }}
              style={{
                width: 26,
                height: 22,
                backgroundColor: 'rgba(140, 69, 34, 0.1)',
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#8C4522' }}>−</Text>
            </Pressable>
          )}
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#1C120C' }}>
            {worldWidth}m × {worldHeight}m
          </Text>
          {!readOnly && (
            <Pressable
              onPress={() => {
                setWorldWidth((w) => Math.min(48, w + 4));
                setWorldHeight((h) => Math.min(48, h + 4));
              }}
              disabled={worldWidth >= 48 && worldHeight >= 48}
              style={{
                width: 26,
                height: 22,
                backgroundColor:
                  worldWidth >= 48 ? '#E2E8F0' : 'rgba(140, 69, 34, 0.1)',
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#8C4522' }}>+</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Left-side Floating Tool Palette (Pan / Select / Lock / Zoom) */}
      <CanvasToolPalette
        mode={toolMode}
        onModeChange={setToolMode}
        isSelectedLocked={isCurrentSelectedLocked}
        onToggleLockSelected={handleToggleLockSelected}
        hasSelectedElement={Boolean(state.selectedId)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitCanvas={handleFitCanvas}
      />

      {/* Canvas Viewport (Pan & Pinch to Zoom) */}
      <View
        {...canvasPanResponder.panHandlers}
        ref={viewportRef}
        onLayout={(e) => {
          const { width, height, x, y } = e.nativeEvent.layout;
          setViewportSize({ width, height });
          if (!viewportWindowOffset.current.width) {
            viewportWindowOffset.current = { x, y: y + 80, width, height };
          }
          viewportRef.current?.measureInWindow((winX, winY, winW, winH) => {
            if (winW && winH) {
              viewportWindowOffset.current = { x: winX, y: winY, width: winW, height: winH };
            }
          });
        }}
        style={{
          flex: 1,
          margin: 14,
          backgroundColor: '#E6DDD1',
          borderColor: CANVAS_BORDER,
          borderWidth: 2,
          borderRadius: 8,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Animated.View
          style={{
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor: CANVAS_BG,
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { scale: scale },
            ],
          }}>
          <Pressable onPress={handleCanvasTap} style={{ flex: 1 }}>
            {/* Native Grid Base Board & Lines (Zero offscreen bitmap allocation — hardware accelerated) */}
            <View
              style={{
                position: 'absolute',
                left: CANVAS_PADDING,
                top: CANVAS_PADDING,
                width: worldWidth * PIXELS_PER_UNIT,
                height: worldHeight * PIXELS_PER_UNIT,
                backgroundColor: CANVAS_BG,
                borderColor: CANVAS_BORDER,
                borderWidth: 2,
                borderRadius: 16,
                overflow: 'hidden',
              }}
              pointerEvents="none">
              {gridLines}
            </View>

            {/* Elements container */}
            <View
              style={{
                position: 'absolute',
                left: CANVAS_PADDING,
                top: CANVAS_PADDING,
                width: worldWidth * PIXELS_PER_UNIT,
                height: worldHeight * PIXELS_PER_UNIT,
              }}
              pointerEvents="box-none">
              {/* Clash of Clans Live Snapped Grid Footprint */}
              {activeDrag && (
                <CanvasFootprint
                  activeDrag={activeDrag}
                  worldWidth={worldWidth}
                  worldHeight={worldHeight}
                />
              )}

              {/* 1. Environmental Zones (Greenhouses, Open Areas, Imported Parcels) */}
              {state.zones.map((zone) => {
                const childPlots = state.plots.filter((p) => p.zoneId === zone.id);
                const childFacs = state.facilities.filter((f) => f.zoneId === zone.id);
                let minW = 2;
                let minH = 2;
                if (childPlots.length > 0 || childFacs.length > 0) {
                  const allChildBounds = [
                    ...childPlots.map((p) => ({
                      minX: p.x - p.widthM / 2,
                      maxX: p.x + p.widthM / 2,
                      minY: p.y - p.heightM / 2,
                      maxY: p.y + p.heightM / 2,
                    })),
                    ...childFacs.map((f) => ({
                      minX: f.x - f.widthM / 2,
                      maxX: f.x + f.widthM / 2,
                      minY: f.y - f.heightM / 2,
                      maxY: f.y + f.heightM / 2,
                    })),
                  ];
                  const spanX = Math.max(...allChildBounds.map((b) => b.maxX)) - Math.min(...allChildBounds.map((b) => b.minX));
                  const spanY = Math.max(...allChildBounds.map((b) => b.maxY)) - Math.min(...allChildBounds.map((b) => b.minY));
                  minW = Math.max(2, Math.ceil(spanX + 1.0));
                  minH = Math.max(2, Math.ceil(spanY + 1.0));
                }

                return (
                  <ZoneContainer
                    key={zone.id}
                    zone={zone}
                    isSelected={zone.id === state.selectedId && state.selectedType === 'zone'}
                    canvasWidthUnits={worldWidth}
                    canvasHeightUnits={worldHeight}
                    onSelect={handleSelectZone}
                    onMove={handleMoveZone}
                    onResize={handleResizeZone}
                    onDelete={handleDeleteZone}
                    onToggleLock={handleToggleZoneLock}
                    zoomScale={zoomScale}
                    minAllowedWidthM={minW}
                    minAllowedHeightM={minH}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    toolMode={toolMode}
                    isLocked={zone.isLocked}
                  />
                );
              })}

              {/* 2. Planting Plots (Beds & Trellises) */}
              {state.plots.map((plot) => {
                const parentZone = plot.zoneId ? state.zones.find((z) => z.id === plot.zoneId) : null;
                const isPlotGroupLocked = !!(parentZone?.isCompoundAsset && parentZone?.isLockedGroup !== false);

                return (
                  <PlotItem
                    key={plot.id}
                    plot={plot}
                    allObstacles={allObstacles}
                    existingPlots={state.plots}
                    isSelected={plot.id === state.selectedId && state.selectedType === 'plot'}
                    canvasOffsetX={0}
                    canvasOffsetY={0}
                    canvasWidthUnits={worldWidth}
                    canvasHeightUnits={worldHeight}
                    onSelect={handleSelectPlot}
                    onMove={handleMovePlot}
                    onResize={handleResizePlot}
                    zoomScale={zoomScale}
                    isGroupLocked={isPlotGroupLocked}
                    parentZone={parentZone}
                    onSelectGroup={() => parentZone && handleSelectZone(parentZone.id)}
                    onMoveGroup={(newX, newY) => parentZone && handleMoveZone(parentZone.id, newX, newY)}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    toolMode={toolMode}
                    isLocked={plot.isLocked}
                  />
                );
              })}

              {/* 3. Physical Facilities & Storages */}
              {state.facilities.map((facility) => {
                const parentZone = facility.zoneId ? state.zones.find((z) => z.id === facility.zoneId) : null;
                const isFacilityGroupLocked = !!(parentZone?.isCompoundAsset && parentZone?.isLockedGroup !== false);

                return (
                  <FacilityItem
                    key={facility.id}
                    facility={facility}
                    allObstacles={allObstacles}
                    isSelected={facility.id === state.selectedId && state.selectedType === 'facility'}
                    canvasWidthUnits={worldWidth}
                    canvasHeightUnits={worldHeight}
                    onSelect={handleSelectFacility}
                    onMove={handleMoveFacility}
                    onResize={handleResizeFacility}
                    onOpenInventory={(f) => setActiveFacilityForInventory(f)}
                    zoomScale={zoomScale}
                    isGroupLocked={isFacilityGroupLocked}
                    parentZone={parentZone}
                    onSelectGroup={() => parentZone && handleSelectZone(parentZone.id)}
                    onMoveGroup={(newX, newY) => parentZone && handleMoveZone(parentZone.id, newX, newY)}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    toolMode={toolMode}
                    isLocked={facility.isLocked}
                  />
                );
              })}
            </View>
          </Pressable>
        </Animated.View>

        {/* Empty state overlay */}
        {state.plots.length === 0 && state.facilities.length === 0 && state.zones.length === 0 && (
          <EmptyState />
        )}
      </View>

      {/* Contextual Tactical Actions or Clash of Clans Bottom Building Dock */}
      {readOnly ? null : selectedPlot || selectedFacility || selectedZone ? (
        <CanvasActionDock
          selectedPlot={selectedPlot}
          selectedFacility={selectedFacility}
          selectedZone={selectedZone}
          onFlipPlot={handleFlipPlot}
          onDuplicatePlot={handleDuplicatePlot}
          onDeletePlot={handleDeletePlot}
          onRenamePlot={handleRenamePlot}
          onResizePlot={(id, w, h) => handleResizePlot(id, w, h)}
          onDeleteFacility={handleDeleteFacility}
          onRenameFacility={handleRenameFacility}
          onResizeFacility={(id, w, h) => handleResizeFacility(id, w, h)}
          onUpdateFacilityRole={handleUpdateFacilityRole}
          onUpdateFacilityInventoryName={handleUpdateFacilityInventoryName}
          onUpdateFacilityScheduleName={handleUpdateFacilityScheduleName}
          onToggleFacilityInventory={handleToggleFacilityInventory}
          onToggleFacilitySchedule={handleToggleFacilitySchedule}
          onToggleZoneLock={handleToggleZoneLock}
          onTogglePlotLock={handleTogglePlotLock}
          onToggleFacilityLock={handleToggleFacilityLock}
          onDeleteZone={handleDeleteZone}
          onRenameZone={handleRenameZone}
          onResizeZone={(id, w, h) => handleResizeZone(id, w, h)}
          minZoneWidthM={selectedZoneMinDimensions.minW}
          minZoneHeightM={selectedZoneMinDimensions.minH}
          onDeselect={handleCanvasTap}
        />
      ) : (
        <BuildingPaletteCarousel
          isMasterLayout={isMasterFarm}
          placedPlots={state.plots}
          placedFacilities={state.facilities}
          placedZones={state.zones}
          onSelectFacility={handleAddFacility}
          onSelectPlot={(p) => handleAddPlotWithDimensions(p.widthM, p.heightM, p.label)}
          onSelectZone={handleAddZone}
          onOpenCustomModal={() => setIsAddElementModalVisible(true)}
          onDragStart={handlePaletteDragStart}
          onDragMove={handlePaletteDragMove}
          onDragEnd={handlePaletteDragEnd}
        />
      )}

      {/* Facility Inventory Sheet */}
      <FacilityInventorySheet
        facility={activeFacilityForInventory}
        visible={!!activeFacilityForInventory}
        onClose={() => setActiveFacilityForInventory(null)}
        onUpdateFacility={readOnly ? () => {} : handleUpdateFacility}
        onDeleteFacility={readOnly ? undefined : handleDeleteFacility}
      />

      {/* Add Element Modal (Facilities & Zones Picker) */}
      <AddElementModal
        visible={isAddElementModalVisible}
        onClose={() => setIsAddElementModalVisible(false)}
        onSelectFacility={handleAddFacility}
        onSelectZone={handleAddZone}
        onSelectPlot={handleAddPlotWithDimensions}
        onImportFarmLayout={handleImportFarmLayout}
        currentFarmId={farmId}
        isMasterLayout={isMasterFarm}
      />

      {/* Floating Finger-following Drag Ghost */}
      {activeDrag && <FloatingDragGhost activeDrag={activeDrag} />}
    </View>
  );
}

