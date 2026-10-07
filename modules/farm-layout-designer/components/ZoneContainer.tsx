import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Text,
  View,
  Pressable,
} from 'react-native';
import { Leaf, ShieldAlert, Sparkles, Trash2, Lock, Layers } from 'lucide-react-native';
import type { FarmZone, ResizeDirection } from '../types';
import {
  PIXELS_PER_UNIT,
  GRID_CELL_SIZE,
} from '../constants';
import { forceSnapToGrid } from '../utils/grid';
import { ResizeHandle } from './ResizeHandle';

import type { ToolMode } from './CanvasToolPalette';

type ZoneContainerProps = {
  key?: React.Key;
  zone: FarmZone;
  isSelected: boolean;
  canvasWidthUnits: number;
  canvasHeightUnits: number;
  onSelect: (zoneId: string) => void;
  onMove: (zoneId: string, newX: number, newY: number) => void;
  onResize?: (
    zoneId: string,
    newWidthM: number,
    newHeightM: number,
    newX: number,
    newY: number
  ) => void;
  onDelete?: (zoneId: string) => void;
  onToggleLock?: (zoneId: string) => void;
  zoomScale?: number;
  minAllowedWidthM?: number;
  minAllowedHeightM?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  toolMode?: ToolMode;
  isLocked?: boolean;
};

const CORNER_ANCHORS: { dir: ResizeDirection; ax: number; ay: number }[] = [
  { dir: 'top-left', ax: 0, ay: 0 },
  { dir: 'top-right', ax: 1, ay: 0 },
  { dir: 'bottom-right', ax: 1, ay: 1 },
  { dir: 'bottom-left', ax: 0, ay: 1 },
];

export function ZoneContainer({
  zone,
  isSelected,
  canvasWidthUnits,
  canvasHeightUnits,
  onSelect,
  onMove,
  onResize,
  onDelete,
  onToggleLock,
  zoomScale = 1,
  minAllowedWidthM = 2,
  minAllowedHeightM = 2,
  onDragStart,
  onDragEnd,
  toolMode = 'select',
  isLocked = false,
}: ZoneContainerProps) {
  const isZoneLocked = isLocked || zone.isLocked === true;

  const widthPx = zone.widthM * PIXELS_PER_UNIT;
  const heightPx = zone.heightM * PIXELS_PER_UNIT;
  const leftPx = (zone.x - zone.widthM / 2) * PIXELS_PER_UNIT;
  const topPx = (zone.y - zone.heightM / 2) * PIXELS_PER_UNIT;

  const zoneRef = useRef(zone);
  zoneRef.current = zone;

  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;

  const zoneOriginRef = useRef({ x: zone.x, y: zone.y });
  const hasMovedRef = useRef(false);

  // --- Move Pan Responder ---
  const movePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (toolMode === 'pan' || isZoneLocked) return false;
          return evt.nativeEvent.touches.length <= 1;
        },
        onMoveShouldSetPanResponder: (evt, g) => {
          if (toolMode === 'pan' || isZoneLocked || evt.nativeEvent.touches.length >= 2) return false;
          return Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2;
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => false,
        onPanResponderGrant: () => {
          zoneOriginRef.current = { x: zoneRef.current.x, y: zoneRef.current.y };
          hasMovedRef.current = false;
          onDragStart?.();
          onSelect(zoneRef.current.id);
        },
        onPanResponderMove: (evt, gestureState) => {
          // If a second finger lands, immediately yield to parent canvas pinch-to-zoom!
          if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) {
            onDragEnd?.();
            return;
          }

          if (Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3) {
            hasMovedRef.current = true;
          }
          const z = zoneRef.current;
          const scale = zoomScaleRef.current > 0 ? zoomScaleRef.current : 1;
          const dx = gestureState.dx / PIXELS_PER_UNIT / scale;
          const dy = gestureState.dy / PIXELS_PER_UNIT / scale;
          const rawX = zoneOriginRef.current.x + dx;
          const rawY = zoneOriginRef.current.y + dy;

          // Snap to grid
          const snappedX = Math.round(rawX / GRID_CELL_SIZE) * GRID_CELL_SIZE;
          const snappedY = Math.round(rawY / GRID_CELL_SIZE) * GRID_CELL_SIZE;

          // Clamped bounds allowing fluid movement
          const halfW = z.widthM / 2;
          const halfH = z.heightM / 2;
          const minX = Math.min(halfW, canvasWidthUnits / 2);
          const maxX = Math.max(halfW, canvasWidthUnits - halfW, canvasWidthUnits / 2);
          const minY = Math.min(halfH, canvasHeightUnits / 2);
          const maxY = Math.max(halfH, canvasHeightUnits - halfH, canvasHeightUnits / 2);

          const clampedX = Math.max(minX, Math.min(maxX, snappedX));
          const clampedY = Math.max(minY, Math.min(maxY, snappedY));

          onMove(z.id, clampedX, clampedY);
        },
        onPanResponderRelease: () => {
          onDragEnd?.();
          if (!hasMovedRef.current) {
            onSelect(zoneRef.current.id);
          }
        },
        onPanResponderTerminate: () => {
          onDragEnd?.();
        },
      }),
    [canvasWidthUnits, canvasHeightUnits, onSelect, onMove, onDragStart, onDragEnd, toolMode, isZoneLocked]
  );

  // --- Resize Responders ---
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
          onDragStart?.();
          const z = zoneRef.current;
          resizeStartRef.current = {
            w: z.widthM,
            h: z.heightM,
            x: z.x,
            y: z.y,
          };
        },
        onPanResponderMove: (_, g) => {
          const scale = zoomScaleRef.current > 0 ? zoomScaleRef.current : 1;
          const dxM = g.dx / PIXELS_PER_UNIT / scale;
          const dyM = g.dy / PIXELS_PER_UNIT / scale;
          const start = resizeStartRef.current;

          let startLeft = start.x - start.w / 2;
          let startRight = start.x + start.w / 2;
          let startTop = start.y - start.h / 2;
          let startBottom = start.y + start.h / 2;

          let newLeft = startLeft;
          let newRight = startRight;
          let newTop = startTop;
          let newBottom = startBottom;

          const minW = Math.max(2, minAllowedWidthM);
          const minH = Math.max(2, minAllowedHeightM);

          if (dir.includes('right')) {
            newRight = forceSnapToGrid(startRight + dxM);
            newRight = Math.min(canvasWidthUnits, newRight);
            if (newRight - newLeft < minW) {
              newRight = newLeft + minW;
            }
          }
          if (dir.includes('left')) {
            newLeft = forceSnapToGrid(startLeft + dxM);
            newLeft = Math.max(0, newLeft);
            if (newRight - newLeft < minW) {
              newLeft = newRight - minW;
            }
          }
          if (dir.includes('bottom')) {
            newBottom = forceSnapToGrid(startBottom + dyM);
            newBottom = Math.min(canvasHeightUnits, newBottom);
            if (newBottom - newTop < minH) {
              newBottom = newTop + minH;
            }
          }
          if (dir.includes('top')) {
            newTop = forceSnapToGrid(startTop + dyM);
            newTop = Math.max(0, newTop);
            if (newBottom - newTop < minH) {
              newTop = newBottom - minH;
            }
          }

          const newW = Math.round((newRight - newLeft) * 10) / 10;
          const newH = Math.round((newBottom - newTop) * 10) / 10;
          const newX = Math.round(((newLeft + newRight) / 2) * 10) / 10;
          const newY = Math.round(((newTop + newBottom) / 2) * 10) / 10;

          onResize(zoneRef.current.id, newW, newH, newX, newY);
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
  }, [onResize, canvasWidthUnits, canvasHeightUnits, minAllowedWidthM, minAllowedHeightM, onDragStart, onDragEnd]);

  const isGreenhouse = zone.zoneType === 'greenhouse';
  const isInConversion = zone.organicStatus === 'in_conversion';
  const isCompound = zone.isCompoundAsset;
  const isCompoundLocked = zone.isLockedGroup !== false;

  return (
    <View
      pointerEvents={toolMode === 'pan' ? 'none' : 'box-none'}
      onTouchEnd={() => {
        if (isZoneLocked && toolMode !== 'pan') {
          onSelect(zone.id);
        }
      }}
      style={{
        position: 'absolute',
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: heightPx,
        zIndex: isSelected ? 8 : 2,
        elevation: isSelected ? 3 : 1,
      }}>
      {/* Zone border & fill container */}
      <View
        pointerEvents="box-none"
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: zone.fillColor || (isGreenhouse ? 'rgba(45, 106, 79, 0.08)' : 'rgba(140, 69, 34, 0.05)'),
          borderColor: isSelected ? '#8C4522' : (zone.color || '#2D6A4F'),
          borderWidth: isSelected ? 3.5 : (isGreenhouse ? 2.5 : 2),
          borderStyle: isGreenhouse ? 'solid' : 'dashed',
          borderRadius: isGreenhouse ? 20 : 16,
          padding: 6,
          justifyContent: 'space-between',
        }}>
        {/* Full Header Bar — Draggable Zone Handle */}
        <View
          {...movePanResponder.panHandlers}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isCompound
              ? '#1E3A8A'
              : isGreenhouse
              ? '#2D6A4F'
              : isInConversion
              ? '#D97706'
              : '#8C4522',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 4,
          }}>
          {/* Left: Icon, Name & Type */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            {isCompound ? (
              <Layers size={14} color="#FFFFFF" strokeWidth={2.4} />
            ) : isGreenhouse ? (
              <Sparkles size={14} color="#FFFFFF" strokeWidth={2.4} />
            ) : isInConversion ? (
              <ShieldAlert size={14} color="#FFFFFF" strokeWidth={2.4} />
            ) : (
              <Leaf size={14} color="#FFFFFF" strokeWidth={2.4} />
            )}

            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 12,
                fontWeight: '900',
                letterSpacing: 0.2,
              }}
              numberOfLines={1}>
              {zone.name}
            </Text>

            <Pressable
              disabled={!isCompound || !onToggleLock}
              onPress={() => onToggleLock?.(zone.id)}
              hitSlop={8}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}>
              {isCompound && (
                isCompoundLocked ? (
                  <Lock size={10} color="#FFFFFF" strokeWidth={2.6} />
                ) : (
                  <Layers size={10} color="#FFFFFF" strokeWidth={2.6} />
                )
              )}
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 9,
                  fontWeight: '800',
                }}>
                {isCompound
                  ? (isCompoundLocked ? 'FARM PARCEL (LOCKED)' : 'FARM PARCEL (UNGROUPED)')
                  : isInConversion
                  ? 'IN CONVERSION'
                  : isGreenhouse
                  ? 'GREENHOUSE'
                  : 'ORGANIC'}
              </Text>
            </Pressable>
          </View>

          {/* Right: Actions (Delete Button when selected or Lock Indicator) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isZoneLocked && (
              <View
                style={{
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  paddingHorizontal: 5,
                  paddingVertical: 3,
                  borderRadius: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                }}>
                <Lock size={11} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>LOCKED</Text>
              </View>
            )}

            {isSelected && onDelete ? (
              <Pressable
                onPress={() => onDelete(zone.id)}
                hitSlop={8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  backgroundColor: '#fee2e2',
                  borderColor: '#fca5a5',
                  borderWidth: 1,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                }}>
                <Trash2 size={12} color="#dc2626" strokeWidth={2.5} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#dc2626' }}>
                  Delete
                </Text>
              </Pressable>
            ) : (
              !isZoneLocked && (
                <Text style={{ fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)' }}>
                  Drag to move
                </Text>
              )
            )}
          </View>
        </View>

        {/* Clickable & Draggable Zone Background Body */}
        <View
          {...movePanResponder.panHandlers}
          style={{ flex: 1 }}
        />

        {/* Footer info: Footprint badge */}
        <View
          style={{
            alignSelf: 'flex-end',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.08)',
          }}>
          <Text
            style={{
              color: '#524037',
              fontSize: 10,
              fontWeight: '800',
            }}>
            {zone.widthM}m × {zone.heightM}m ({Math.round(zone.widthM * zone.heightM)} m²)
          </Text>
        </View>
      </View>

      {/* Corner Resize Handles when selected (hidden if locked or in pan mode) */}
      {isSelected &&
        onResize &&
        !isZoneLocked &&
        toolMode !== 'pan' &&
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
    </View>
  );
}
