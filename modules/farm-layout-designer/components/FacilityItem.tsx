import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Text,
  View,
  Vibration,
  Platform,
} from 'react-native';
import {
  Wrench,
  FlaskConical,
  Sprout,
  Recycle,
  Home,
  Egg,
  Package,
  Clock,
  Lock,
} from 'lucide-react-native';
import type { FarmFacility, FarmZone, ResizeDirection } from '../types';
import type { ToolMode } from './CanvasToolPalette';
import {
  PIXELS_PER_UNIT,
  SELECTED_BORDER_COLOR,
  SELECTED_BORDER_WIDTH,
  DEFAULT_BORDER_WIDTH,
  GRID_CELL_SIZE,
} from '../constants';
import {
  freeDragSnapAndClamp,
  doesItemCollide,
  snapAndClampResize,
  type LayoutObstacle,
} from '../utils/collision';
import { ResizeHandle } from './ResizeHandle';

type FacilityItemProps = {
  key?: React.Key;
  facility: FarmFacility;
  allObstacles?: LayoutObstacle[];
  isSelected: boolean;
  canvasWidthUnits: number;
  canvasHeightUnits: number;
  onSelect: (facilityId: string) => void;
  onMove: (facilityId: string, newX: number, newY: number) => void;
  onResize?: (
    facilityId: string,
    newWidthM: number,
    newHeightM: number,
    newX: number,
    newY: number
  ) => void;
  onOpenInventory: (facility: FarmFacility) => void;
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

// 4 Corner Anchors for resizing: leaves entire interior & all 4 sides wide open for dragging
const CORNER_ANCHORS: { dir: ResizeDirection; ax: number; ay: number }[] = [
  { dir: 'top-left', ax: 0, ay: 0 },
  { dir: 'top-right', ax: 1, ay: 0 },
  { dir: 'bottom-right', ax: 1, ay: 1 },
  { dir: 'bottom-left', ax: 0, ay: 1 },
];

const MIN_FACILITY_DIMENSION_M = 1.5;

export function FacilityItem({
  facility,
  allObstacles = [],
  isSelected,
  canvasWidthUnits,
  canvasHeightUnits,
  onSelect,
  onMove,
  onResize,
  onOpenInventory,
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
}: FacilityItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isColliding, setIsColliding] = useState(false);

  const isItemLocked = isLocked || facility.isLocked === true;

  const widthPx = facility.widthM * PIXELS_PER_UNIT;
  const heightPx = facility.heightM * PIXELS_PER_UNIT;

  const facilityRef = useRef(facility);
  facilityRef.current = facility;

  const allObstaclesRef = useRef<LayoutObstacle[]>(allObstacles);
  allObstaclesRef.current = allObstacles;

  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;

  const parentZoneRef = useRef(parentZone);
  parentZoneRef.current = parentZone;

  const initialPx = (facility.x - facility.widthM / 2) * PIXELS_PER_UNIT;
  const initialPy = (facility.y - facility.heightM / 2) * PIXELS_PER_UNIT;
  const pan = useRef(new Animated.ValueXY({ x: initialPx, y: initialPy })).current;

  // Keep pan aligned when parent updates props (or on reset/resize)
  useEffect(() => {
    const targetPx = (facility.x - facility.widthM / 2) * PIXELS_PER_UNIT;
    const targetPy = (facility.y - facility.heightM / 2) * PIXELS_PER_UNIT;
    pan.setValue({ x: targetPx, y: targetPy });
    facilityOriginRef.current = { x: facility.x, y: facility.y };
    lastClampedPosRef.current = { x: facility.x, y: facility.y };
    setIsDragging(false);
    setIsColliding(false);
  }, [facility.x, facility.y, facility.widthM, facility.heightM, pan]);

  const facilityOriginRef = useRef({ x: facility.x, y: facility.y });
  const groupOriginRef = useRef({ x: 0, y: 0 });
  const lastClampedPosRef = useRef({ x: facility.x, y: facility.y });
  const hasMovedRef = useRef(false);

  // --- Drag to Move ---
  const movePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (toolMode === 'pan' || isItemLocked) return false;
          return evt.nativeEvent.touches.length <= 1;
        },
        onMoveShouldSetPanResponder: (evt, g) => {
          if (toolMode === 'pan' || isItemLocked || evt.nativeEvent.touches.length >= 2) return false;
          return Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2;
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

          facilityOriginRef.current = { x: facilityRef.current.x, y: facilityRef.current.y };
          lastClampedPosRef.current = { x: facilityRef.current.x, y: facilityRef.current.y };
          setIsDragging(true);
          onSelect(facilityRef.current.id);
        },
        onPanResponderMove: (evt, gestureState) => {
          // If a second finger lands, immediately yield to parent canvas pinch-to-zoom!
          if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) {
            const originPx = (facilityOriginRef.current.x - facilityRef.current.widthM / 2) * PIXELS_PER_UNIT;
            const originPy = (facilityOriginRef.current.y - facilityRef.current.heightM / 2) * PIXELS_PER_UNIT;
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
            const dxUnits = gestureState.dx / PIXELS_PER_UNIT / scale;
            const dyUnits = gestureState.dy / PIXELS_PER_UNIT / scale;
            const rawX = groupOriginRef.current.x + dxUnits;
            const rawY = groupOriginRef.current.y + dyUnits;

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

          const f = facilityRef.current;
          const scale = zoomScaleRef.current > 0 ? zoomScaleRef.current : 1;
          const dxUnits = gestureState.dx / PIXELS_PER_UNIT / scale;
          const dyUnits = gestureState.dy / PIXELS_PER_UNIT / scale;
          const rawX = facilityOriginRef.current.x + dxUnits;
          const rawY = facilityOriginRef.current.y + dyUnits;

          // Free-flight drag with grid snap & boundary clamp
          const candidatePos = freeDragSnapAndClamp(
            f.id,
            rawX,
            rawY,
            f.widthM,
            f.heightM,
            allObstaclesRef.current,
            canvasWidthUnits,
            canvasHeightUnits
          );

          lastClampedPosRef.current = candidatePos;

          // Live collision check
          const colliding = doesItemCollide(
            { id: f.id, x: candidatePos.x, y: candidatePos.y, widthM: f.widthM, heightM: f.heightM },
            allObstaclesRef.current
          );
          setIsColliding(colliding);

          // Direct absolute GPU-accelerated Animated transform
          const targetPx = (candidatePos.x - f.widthM / 2) * PIXELS_PER_UNIT;
          const targetPy = (candidatePos.y - f.heightM / 2) * PIXELS_PER_UNIT;
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
            const f = facilityRef.current;
            const colliding = doesItemCollide(
              { id: f.id, x: lastClampedPosRef.current.x, y: lastClampedPosRef.current.y, widthM: f.widthM, heightM: f.heightM },
              allObstaclesRef.current
            );

            if (colliding) {
              // Bounce back to origin with haptic feedback
              try {
                Vibration.vibrate(Platform.OS === 'android' ? [0, 40, 40, 40] : 35);
              } catch {}

              const originPx = (facilityOriginRef.current.x - f.widthM / 2) * PIXELS_PER_UNIT;
              const originPy = (facilityOriginRef.current.y - f.heightM / 2) * PIXELS_PER_UNIT;
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
            onMove(facilityRef.current.id, lastClampedPosRef.current.x, lastClampedPosRef.current.y);
          } else {
            setIsColliding(false);
            onSelect(facilityRef.current.id);
          }
        },
        onPanResponderTerminate: () => {
          onDragEnd?.();
          setIsColliding(false);
          if (!isGroupLocked) {
            const originPx = (facility.x - facility.widthM / 2) * PIXELS_PER_UNIT;
            const originPy = (facility.y - facility.heightM / 2) * PIXELS_PER_UNIT;
            pan.setValue({ x: originPx, y: originPy });
            setIsDragging(false);
          }
        },
      }),
    [
      canvasWidthUnits,
      canvasHeightUnits,
      onSelect,
      onMove,
      isGroupLocked,
      isItemLocked,
      toolMode,
      onSelectGroup,
      onMoveGroup,
      onDragStart,
      onDragEnd,
      onCollisionReject,
      pan,
      facility.x,
      facility.y,
      facility.widthM,
      facility.heightM,
    ]
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
          const f = facilityRef.current;
          resizeStartRef.current = {
            w: f.widthM,
            h: f.heightM,
            x: f.x,
            y: f.y,
          };
        },
        onPanResponderMove: (_, g) => {
          const f = facilityRef.current;
          const scale = zoomScaleRef.current > 0 ? zoomScaleRef.current : 1;
          const dxM = g.dx / PIXELS_PER_UNIT / scale;
          const dyM = g.dy / PIXELS_PER_UNIT / scale;
          const start = resizeStartRef.current;

          const clampedResult = snapAndClampResize(
            f.id,
            dir,
            start.w,
            start.h,
            start.x,
            start.y,
            dxM,
            dyM,
            allObstaclesRef.current,
            canvasWidthUnits,
            canvasHeightUnits,
            MIN_FACILITY_DIMENSION_M,
            MIN_FACILITY_DIMENSION_M
          );

          onResize(
            f.id,
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

  const renderIcon = (iconName: string, size = 18) => {
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
      default:
        return <Package size={size} color="#FFFFFF" strokeWidth={2.4} />;
    }
  };

  const inventoryCount = facility.inventories?.length || 0;

  const effectiveBorderColor = isColliding
    ? '#EF4444'
    : isSelected
    ? SELECTED_BORDER_COLOR
    : 'rgba(0,0,0,0.25)';
  const effectiveBorderWidth = isColliding ? 3 : isSelected ? SELECTED_BORDER_WIDTH : DEFAULT_BORDER_WIDTH;
  const effectiveBgColor = isColliding ? 'rgba(239, 68, 68, 0.85)' : facility.color || '#334155';

  return (
    <Animated.View
      pointerEvents={toolMode === 'pan' ? 'none' : 'auto'}
      {...movePanResponder.panHandlers}
      onTouchEnd={() => {
        if (isItemLocked && toolMode !== 'pan') {
          onSelect(facility.id);
        }
      }}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: widthPx,
        height: heightPx,
        zIndex: isDragging ? 100 : isSelected ? 40 : 15,
        backgroundColor: effectiveBgColor,
        borderRadius: 14,
        borderWidth: effectiveBorderWidth,
        borderColor: effectiveBorderColor,
        shadowColor: '#000000',
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
      }}>
      {/* Inner visual content: pointerEvents="none" guarantees entire interior is a clean, frictionless drag surface */}
      <View pointerEvents="none" style={{ flex: 1, justifyContent: 'space-between' }}>
        {/* Top Header: Icon & Category & Lock badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.22)',
              borderRadius: 8,
              padding: 5,
            }}>
            {renderIcon(facility.icon, 16)}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {isItemLocked && (
              <View
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.45)',
                  padding: 3,
                  borderRadius: 6,
                }}>
                <Lock size={12} color="#FFFFFF" strokeWidth={2.4} />
              </View>
            )}

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
                  fontSize: 9,
                  fontWeight: '800',
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}>
                {facility.category}
              </Text>
            </View>
          </View>
        </View>

        {/* Center: Facility Name & Size */}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 13,
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
              fontSize: 10,
              fontWeight: '600',
              marginTop: 2,
            }}>
            {facility.widthM}m × {facility.heightM}m
          </Text>
        </View>

        {/* Bottom: Function & Inventory / Time Badge */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            paddingVertical: 3.5,
            paddingHorizontal: 8,
            borderRadius: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 2,
            gap: 4,
          }}>
          {facility.facilityFunction === 'time_keeping' ? (
            <>
              <Clock size={11} color="#3730A3" strokeWidth={2.4} />
              <Text
                style={{
                  color: '#3730A3',
                  fontSize: 10,
                  fontWeight: '800',
                }}>
                Time Keeping
              </Text>
            </>
          ) : facility.facilityFunction === 'both' ? (
            <>
              <Clock size={11} color="#065F46" strokeWidth={2.4} />
              <Text
                style={{
                  color: '#065F46',
                  fontSize: 10,
                  fontWeight: '800',
                }}>
                {inventoryCount} items • Time
              </Text>
            </>
          ) : (
            <>
              <Package size={11} color="#1C120C" strokeWidth={2.4} />
              <Text
                style={{
                  color: '#1C120C',
                  fontSize: 10,
                  fontWeight: '800',
                }}>
                {inventoryCount} {inventoryCount === 1 ? 'item' : 'items'}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* 4 Corner Resize Handles (rendered when selected and not dragging, not pan mode, and not locked) */}
      {isSelected &&
        !isDragging &&
        !isGroupLocked &&
        !isItemLocked &&
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
