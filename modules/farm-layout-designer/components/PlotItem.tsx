/**
 * Farm Layout Designer — PlotItem
 *
 * A single draggable, resizable plot rendered on the canvas.
 * Uses PanResponder for drag interactions.
 * Enforces border collision prevention and puzzle-style edge snapping.
 * Shows label, dimensions, resize handles when selected.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Text, View, Vibration, Platform } from 'react-native';
import { Lock } from 'lucide-react-native';
import type { DesignerPlot, FarmZone, ResizeDirection } from '../types';
import type { ToolMode } from './CanvasToolPalette';
import {
  GRID_CELL_SIZE,
  PIXELS_PER_UNIT,
  SELECTED_BORDER_COLOR,
  SELECTED_BORDER_WIDTH,
  DEFAULT_BORDER_WIDTH,
  HANDLE_RADIUS,
  HANDLE_HIT_SLOP,
  MIN_PLOT_WIDTH_M,
  MIN_PLOT_HEIGHT_M,
} from '../constants';
import { formatDimensions } from '../utils/grid';
import {
  freeDragSnapAndClamp,
  doesItemCollide,
  snapAndClampResize,
  type LayoutObstacle,
} from '../utils/collision';

type PlotItemProps = {
  key?: React.Key;
  plot: DesignerPlot;
  allObstacles?: LayoutObstacle[];
  existingPlots?: DesignerPlot[];
  isSelected: boolean;
  canvasOffsetX: number;
  canvasOffsetY: number;
  canvasWidthUnits: number;
  canvasHeightUnits: number;
  onSelect: (plotId: string) => void;
  onMove: (plotId: string, newX: number, newY: number) => void;
  onResize: (
    plotId: string,
    newWidthM: number,
    newHeightM: number,
    newX: number,
    newY: number
  ) => void;
  zoomScale?: number;
  isGroupLocked?: boolean;
  parentZone?: FarmZone | null;
  onSelectGroup?: () => void;
  onMoveGroup?: (newZoneX: number, newZoneY: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  toolMode?: ToolMode;
  isLocked?: boolean;
  onCollisionReject?: () => void;
};

// Handle positions relative to plot (0–1 range)
const HANDLE_ANCHORS: { dir: ResizeDirection; ax: number; ay: number }[] = [
  { dir: 'top-left', ax: 0, ay: 0 },
  { dir: 'top', ax: 0.5, ay: 0 },
  { dir: 'top-right', ax: 1, ay: 0 },
  { dir: 'right', ax: 1, ay: 0.5 },
  { dir: 'bottom-right', ax: 1, ay: 1 },
  { dir: 'bottom', ax: 0.5, ay: 1 },
  { dir: 'bottom-left', ax: 0, ay: 1 },
  { dir: 'left', ax: 0, ay: 0.5 },
];

export function PlotItem({
  plot,
  allObstacles = [],
  existingPlots = [],
  isSelected,
  canvasOffsetX,
  canvasOffsetY,
  canvasWidthUnits,
  canvasHeightUnits,
  onSelect,
  onMove,
  onResize,
  zoomScale = 1,
  isGroupLocked = false,
  parentZone = null,
  onSelectGroup,
  onMoveGroup,
  onDragStart,
  onDragEnd,
  toolMode = 'select',
  isLocked = false,
  onCollisionReject,
}: PlotItemProps) {
  const padding = HANDLE_RADIUS * 2 + HANDLE_HIT_SLOP;

  const [isDragging, setIsDragging] = useState(false);
  const [isColliding, setIsColliding] = useState(false);

  const isItemLocked = isLocked || plot.isLocked === true;

  const widthPx = plot.widthM * PIXELS_PER_UNIT;
  const heightPx = plot.heightM * PIXELS_PER_UNIT;

  const plotRef = useRef(plot);
  plotRef.current = plot;

  const allObstaclesRef = useRef<LayoutObstacle[]>(allObstacles);
  allObstaclesRef.current =
    allObstacles.length > 0
      ? allObstacles
      : existingPlots.map((p) => ({ id: p.id, x: p.x, y: p.y, widthM: p.widthM, heightM: p.heightM }));

  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;

  const parentZoneRef = useRef(parentZone);
  parentZoneRef.current = parentZone;

  const initialPx = (plot.x - plot.widthM / 2) * PIXELS_PER_UNIT - padding;
  const initialPy = (plot.y - plot.heightM / 2) * PIXELS_PER_UNIT - padding;
  const pan = useRef(new Animated.ValueXY({ x: initialPx, y: initialPy })).current;

  // Keep pan aligned when parent updates props (or on reset/resize)
  useEffect(() => {
    const targetPx = (plot.x - plot.widthM / 2) * PIXELS_PER_UNIT - padding;
    const targetPy = (plot.y - plot.heightM / 2) * PIXELS_PER_UNIT - padding;
    pan.setValue({ x: targetPx, y: targetPy });
    plotOriginRef.current = { x: plot.x, y: plot.y };
    lastClampedPosRef.current = { x: plot.x, y: plot.y };
    setIsDragging(false);
    setIsColliding(false);
  }, [plot.x, plot.y, plot.widthM, plot.heightM, padding, pan]);

  // --- Drag to move ---
  const plotOriginRef = useRef({ x: plot.x, y: plot.y });
  const groupOriginRef = useRef({ x: 0, y: 0 });
  const lastClampedPosRef = useRef({ x: plot.x, y: plot.y });
  const hasMovedRef = useRef(false);

  const movePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (toolMode === 'pan' || isItemLocked) return false;
          return evt.nativeEvent.touches.length <= 1;
        },
        onMoveShouldSetPanResponder: (evt, g) => {
          if (toolMode === 'pan' || isItemLocked || evt.nativeEvent.touches.length >= 2) return false;
          return Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3;
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => false,
        onPanResponderGrant: () => {
          hasMovedRef.current = false;
          setIsColliding(false);
          onDragStart?.();

          if (isGroupLocked) {
            if (parentZoneRef.current) {
              groupOriginRef.current = { x: parentZoneRef.current.x, y: parentZoneRef.current.y };
            }
            onSelectGroup?.();
            return;
          }

          plotOriginRef.current = { x: plotRef.current.x, y: plotRef.current.y };
          lastClampedPosRef.current = { x: plotRef.current.x, y: plotRef.current.y };
          setIsDragging(true);
          onSelect(plotRef.current.id);
        },
        onPanResponderMove: (evt, gestureState) => {
          // If a second finger lands, immediately yield to parent canvas pinch-to-zoom!
          if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) {
            const originPx = (plotOriginRef.current.x - plotRef.current.widthM / 2) * PIXELS_PER_UNIT - padding;
            const originPy = (plotOriginRef.current.y - plotRef.current.heightM / 2) * PIXELS_PER_UNIT - padding;
            pan.setValue({ x: originPx, y: originPy });
            setIsDragging(false);
            setIsColliding(false);
            onDragEnd?.();
            return;
          }

          if (Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3) {
            hasMovedRef.current = true;
          }

          if (isGroupLocked) {
            if (!parentZoneRef.current || !onMoveGroup) return;
            const pz = parentZoneRef.current;
            const scale = zoomScaleRef.current > 0 ? zoomScaleRef.current : 1;
            const dx = gestureState.dx / PIXELS_PER_UNIT / scale;
            const dy = gestureState.dy / PIXELS_PER_UNIT / scale;
            const rawX = groupOriginRef.current.x + dx;
            const rawY = groupOriginRef.current.y + dy;

            // Snap to grid
            const snappedX = Math.round(rawX / GRID_CELL_SIZE) * GRID_CELL_SIZE;
            const snappedY = Math.round(rawY / GRID_CELL_SIZE) * GRID_CELL_SIZE;

            const halfW = pz.widthM / 2;
            const halfH = pz.heightM / 2;
            const minX = Math.min(halfW, canvasWidthUnits / 2);
            const maxX = Math.max(halfW, canvasWidthUnits - halfW, canvasWidthUnits / 2);
            const minY = Math.min(halfH, canvasHeightUnits / 2);
            const maxY = Math.max(halfH, canvasHeightUnits - halfH, canvasHeightUnits / 2);

            const clampedX = Math.max(minX, Math.min(maxX, snappedX));
            const clampedY = Math.max(minY, Math.min(maxY, snappedY));

            onMoveGroup(clampedX, clampedY);
            return;
          }

          const p = plotRef.current;
          const scale = zoomScaleRef.current > 0 ? zoomScaleRef.current : 1;
          const dx = gestureState.dx / PIXELS_PER_UNIT / scale;
          const dy = gestureState.dy / PIXELS_PER_UNIT / scale;
          const rawX = plotOriginRef.current.x + dx;
          const rawY = plotOriginRef.current.y + dy;

          // Free-flight dragging across canvas with grid snapping & boundary clamping
          const candidatePos = freeDragSnapAndClamp(
            p.id,
            rawX,
            rawY,
            p.widthM,
            p.heightM,
            allObstaclesRef.current,
            canvasWidthUnits,
            canvasHeightUnits
          );

          lastClampedPosRef.current = candidatePos;

          // Live collision check
          const colliding = doesItemCollide(
            { id: p.id, x: candidatePos.x, y: candidatePos.y, widthM: p.widthM, heightM: p.heightM },
            allObstaclesRef.current
          );
          setIsColliding(colliding);

          // Direct absolute manipulation on GPU
          const targetPx = (candidatePos.x - p.widthM / 2) * PIXELS_PER_UNIT - padding;
          const targetPy = (candidatePos.y - p.heightM / 2) * PIXELS_PER_UNIT - padding;
          pan.setValue({ x: targetPx, y: targetPy });
        },
        onPanResponderRelease: () => {
          onDragEnd?.();

          if (isGroupLocked) {
            if (!hasMovedRef.current) {
              onSelectGroup?.();
            }
            return;
          }

          setIsDragging(false);

          if (hasMovedRef.current) {
            const p = plotRef.current;
            const colliding = doesItemCollide(
              { id: p.id, x: lastClampedPosRef.current.x, y: lastClampedPosRef.current.y, widthM: p.widthM, heightM: p.heightM },
              allObstaclesRef.current
            );

            if (colliding) {
              // Collision detected on release: gentle error haptic and bounce back to origin
              try {
                Vibration.vibrate(Platform.OS === 'android' ? [0, 40, 40, 40] : 35);
              } catch {}

              const originPx = (plotOriginRef.current.x - p.widthM / 2) * PIXELS_PER_UNIT - padding;
              const originPy = (plotOriginRef.current.y - p.heightM / 2) * PIXELS_PER_UNIT - padding;
              Animated.spring(pan, {
                toValue: { x: originPx, y: originPy },
                useNativeDriver: false,
                friction: 7,
                tension: 45,
              }).start();

              setIsColliding(false);
              onCollisionReject?.();
              return;
            }

            setIsColliding(false);
            onMove(plotRef.current.id, lastClampedPosRef.current.x, lastClampedPosRef.current.y);
          } else {
            setIsColliding(false);
            onSelect(plotRef.current.id);
          }
        },
        onPanResponderTerminate: () => {
          onDragEnd?.();
          setIsColliding(false);
          if (!isGroupLocked) {
            const originPx = (plot.x - plot.widthM / 2) * PIXELS_PER_UNIT - padding;
            const originPy = (plot.y - plot.heightM / 2) * PIXELS_PER_UNIT - padding;
            pan.setValue({ x: originPx, y: originPy });
            setIsDragging(false);
          }
        },
      }),
    [
      onSelect,
      onMove,
      canvasWidthUnits,
      canvasHeightUnits,
      isGroupLocked,
      isItemLocked,
      toolMode,
      onSelectGroup,
      onMoveGroup,
      onDragStart,
      onDragEnd,
      onCollisionReject,
      pan,
      plot.x,
      plot.y,
      plot.widthM,
      plot.heightM,
      padding,
    ]
  );

  // --- Resize handles ---
  const resizeStartRef = useRef({ w: 0, h: 0, x: 0, y: 0 });

  const resizeResponders = useMemo(() => {
    const responders: Record<string, any> = {};
    HANDLE_ANCHORS.forEach(({ dir }) => {
      responders[dir] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          onDragStart?.();
          const p = plotRef.current;
          resizeStartRef.current = {
            w: p.widthM,
            h: p.heightM,
            x: p.x,
            y: p.y,
          };
        },
        onPanResponderMove: (_, gestureState) => {
          const p = plotRef.current;
          const scale = zoomScaleRef.current > 0 ? zoomScaleRef.current : 1;
          const dxUnits = gestureState.dx / PIXELS_PER_UNIT / scale;
          const dyUnits = gestureState.dy / PIXELS_PER_UNIT / scale;
          const start = resizeStartRef.current;

          const clampedResult = snapAndClampResize(
            p.id,
            dir,
            start.w,
            start.h,
            start.x,
            start.y,
            dxUnits,
            dyUnits,
            allObstaclesRef.current,
            canvasWidthUnits,
            canvasHeightUnits,
            MIN_PLOT_WIDTH_M,
            MIN_PLOT_HEIGHT_M
          );

          onResize(
            p.id,
            clampedResult.widthM,
            clampedResult.heightM,
            clampedResult.x,
            clampedResult.y
          );
        },
        onPanResponderRelease: () => {
          onDragEnd?.();
        },
        onPanResponderTerminate: () => {
          onDragEnd?.();
        },
      });
    });

    return responders;
  }, [onResize, canvasWidthUnits, canvasHeightUnits, onDragStart, onDragEnd]);

  const effectiveBorderColor = isColliding
    ? '#EF4444'
    : isSelected
    ? SELECTED_BORDER_COLOR
    : DEFAULT_BORDER_WIDTH > 0
    ? 'rgba(0,0,0,0.2)'
    : 'transparent';
  const effectiveBorderWidth = isColliding ? 3 : isSelected ? SELECTED_BORDER_WIDTH : DEFAULT_BORDER_WIDTH;
  const effectiveBgColor = isColliding ? 'rgba(239, 68, 68, 0.75)' : plot.color;

  return (
    <Animated.View
      pointerEvents={toolMode === 'pan' ? 'none' : 'box-none'}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: widthPx + padding * 2,
        height: heightPx + padding * 2,
        zIndex: isDragging ? 100 : isSelected ? 40 : 15,
        elevation: isDragging ? 20 : isSelected ? 8 : 4,
        transform: [
          { translateX: pan.x },
          { translateY: pan.y },
          { scale: isDragging ? 1.03 : 1 },
        ],
      }}
    >
      {/* Plot body */}
      <View
        {...movePanResponder.panHandlers}
        onTouchEnd={() => {
          if (isItemLocked && toolMode !== 'pan') {
            onSelect(plot.id);
          }
        }}
        style={{
          position: 'absolute',
          left: padding,
          top: padding,
          width: widthPx,
          height: heightPx,
          backgroundColor: effectiveBgColor,
          borderColor: effectiveBorderColor,
          borderWidth: effectiveBorderWidth,
          borderRadius: 8,
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          zIndex: isSelected ? 41 : 16,
          // Subtle shadow
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isSelected ? 0.25 : 0.12,
          shadowRadius: isSelected ? 6 : 3,
          elevation: isSelected ? 8 : 4,
        }}
      >
        {/* Lock indicator */}
        {isItemLocked && (
          <View
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              backgroundColor: 'rgba(0,0,0,0.45)',
              borderRadius: 6,
              padding: 2.5,
              zIndex: 10,
            }}>
            <Lock size={11} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        )}

        {/* Plot label */}
        <Text
          style={{
            fontSize: Math.min(14, widthPx * 0.14, heightPx * 0.2),
            fontWeight: '800',
            color: '#ffffff',
            textAlign: 'center',
            textShadowColor: 'rgba(0,0,0,0.3)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
          }}
          numberOfLines={1}
        >
          {plot.label}
        </Text>

        {/* Dimension label */}
        <Text
          style={{
            fontSize: Math.min(10, widthPx * 0.1, heightPx * 0.14),
            fontWeight: '600',
            color: 'rgba(255,255,255,0.8)',
            marginTop: 2,
            textShadowColor: 'rgba(0,0,0,0.2)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 1,
          }}
          numberOfLines={1}
        >
          {formatDimensions(plot.widthM, plot.heightM)}
        </Text>
      </View>

      {/* Resize handles — only when selected, NOT dragging, NOT in pan mode, and not locked */}
      {isSelected &&
        !isDragging &&
        !isGroupLocked &&
        !isItemLocked &&
        toolMode !== 'pan' &&
        HANDLE_ANCHORS.map(({ dir, ax, ay }) => {
          const hx = ax * widthPx + padding;
          const hy = ay * heightPx + padding;
          const responder = resizeResponders[dir];
          const isCorner = dir.includes('-');
          const size = isCorner ? HANDLE_RADIUS * 2 : HANDLE_RADIUS * 1.6;

          return (
            <View
              key={dir}
              {...responder.panHandlers}
              style={{
                position: 'absolute',
                left: hx - size / 2,
                top: hy - size / 2,
                width: size + HANDLE_HIT_SLOP * 2,
                height: size + HANDLE_HIT_SLOP * 2,
                marginLeft: -HANDLE_HIT_SLOP,
                marginTop: -HANDLE_HIT_SLOP,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 60,
                elevation: 10,
              }}
            >
              <View
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: '#ffffff',
                  borderWidth: 2,
                  borderColor: SELECTED_BORDER_COLOR,
                  ...(isCorner
                    ? {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.2,
                        shadowRadius: 2,
                        elevation: 3,
                      }
                    : {}),
                }}
              />
            </View>
          );
        })}
    </Animated.View>
  );
}
