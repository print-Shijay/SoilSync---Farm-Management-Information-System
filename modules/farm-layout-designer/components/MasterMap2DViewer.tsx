/**
 * Farm Layout Designer — MasterMap2DViewer
 *
 * Dedicated read-only 2D top-down Master Map Viewer with smooth pan & pinch-to-zoom,
 * interactive parcel/zone inspection, planting bed highlights, and facility exploration.
 */

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  PanResponder,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ArrowLeft,
  Pencil,
  RefreshCw,
  Layers,
  Sparkles,
  Leaf,
  ShieldAlert,
  FlaskConical,
  Sprout,
  Home,
  Box,
  Settings,
} from '../../../components/Icons';
import { MapPin, X, Clock } from 'lucide-react-native';
import { FarmMapSkeleton } from '../../../components/skeleton';
import { loadFarmLayout, saveFarmLayout, getCachedFarmLayout, getCachedFarmInfo, setCachedFarmLayout } from '../db';
import { FacilityInventorySheet } from './FacilityInventorySheet';
import type { FarmZone, DesignerPlot, FarmFacility, LoadedLayout } from '../types';
import {
  CANVAS_PADDING,
  PIXELS_PER_UNIT,
  GRID_CELL_SIZE,
  GRID_COLOR_MAJOR,
  GRID_COLOR_MINOR,
  CANVAS_BG,
  CANVAS_BORDER,
} from '../constants';
import { getDatabase } from '../../../lib/local-db';

type MasterMap2DViewerProps = {
  farmId: string;
  onBack?: () => void;
  onEditLayout?: () => void;
};

type FilterLayer = 'all' | 'zones' | 'plots' | 'facilities';

export function MasterMap2DViewer({ farmId, onBack, onEditLayout }: MasterMap2DViewerProps) {
  const insets = useSafeAreaInsets();
  const cachedLayout = getCachedFarmLayout(farmId);
  const cachedInfo = getCachedFarmInfo(farmId);

  const [layout, setLayout] = useState<LoadedLayout | null>(cachedLayout);
  const [farmName, setFarmName] = useState<string>(cachedInfo?.name || 'Master Farm Map');
  const [farmLocation, setFarmLocation] = useState<string>(cachedInfo?.location || '');
  const [farmAreaSqm, setFarmAreaSqm] = useState<number>(cachedInfo?.areaSqm || 0);
  const [isLoading, setIsLoading] = useState(!cachedLayout);

  // Layer filter toggle
  const [activeLayer, setActiveLayer] = useState<FilterLayer>('all');

  // Selected element for inspection sheet
  const [selectedZone, setSelectedZone] = useState<FarmZone | null>(null);
  const [selectedPlot, setSelectedPlot] = useState<DesignerPlot | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<FarmFacility | null>(null);
  const [isInventorySheetOpen, setIsInventorySheetOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  const handleUpdateFacilityInventory = async (updatedFacility: FarmFacility) => {
    setSelectedFacility(updatedFacility);
    if (!layout) return;

    const newFacilities = layout.facilities.map((f) =>
      f.id === updatedFacility.id ? updatedFacility : f
    );
    const updatedLayout = { ...layout, facilities: newFacilities };
    setLayout(updatedLayout);
    setCachedFarmLayout(farmId, updatedLayout);

    try {
      await saveFarmLayout(
        farmId,
        layout.plots,
        layout.widthM || 36,
        layout.heightM || 36,
        layout.zones,
        newFacilities
      );
    } catch (err) {
      console.warn('[MasterMap2DViewer] Failed to auto-save facility inventory update:', err);
    }
  };

  const handleDeleteFacility = async (facilityId: string) => {
    if (!layout) return;
    const newFacilities = layout.facilities.filter((f) => f.id !== facilityId);
    const updatedLayout = { ...layout, facilities: newFacilities };
    setLayout(updatedLayout);
    setCachedFarmLayout(farmId, updatedLayout);
    setSelectedFacility(null);
    setIsInventorySheetOpen(false);

    try {
      await saveFarmLayout(
        farmId,
        layout.plots,
        layout.widthM || 36,
        layout.heightM || 36,
        layout.zones,
        newFacilities
      );
    } catch (err) {
      console.warn('[MasterMap2DViewer] Failed to auto-save after facility deletion:', err);
    }
  };

  // Dimensions
  const worldWidth = layout?.widthM || 36;
  const worldHeight = layout?.heightM || 36;
  const canvasWidth = CANVAS_PADDING * 2 + worldWidth * PIXELS_PER_UNIT;
  const canvasHeight = CANVAS_PADDING * 2 + worldHeight * PIXELS_PER_UNIT;

  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isInitialFitDone, setIsInitialFitDone] = useState(false);
  const fitScale =
    viewportSize.width > 0 && viewportSize.height > 0 && canvasWidth > 0 && canvasHeight > 0
      ? Math.min(viewportSize.width / canvasWidth, viewportSize.height / canvasHeight) * 0.94
      : 1;
  const minScale = fitScale;

  // Pan & Zoom Engine
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const _lastPan = useRef({ x: 0, y: 0 });
  const _lastScale = useRef(1);
  const _initDistance = useRef(0);
  const [zoomScale, setZoomScale] = useState(1);

  // Fetch Farm and Layout (SWR: silent background revalidation if already cached)
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        if (!cachedLayout) {
          setIsLoading(true);
        }
        const db = getDatabase();
        const [farmRow, loadedLayout] = await Promise.all([
          db.get<any>('SELECT farm_name, location, area_sqm FROM farms WHERE id = ?', [farmId]),
          loadFarmLayout(farmId),
        ]);

        if (isMounted) {
          if (farmRow) {
            setFarmName(farmRow.farm_name || 'Master Farm Map');
            setFarmLocation(farmRow.location || '');
            setFarmAreaSqm(farmRow.area_sqm || 0);
          }
          if (loadedLayout) {
            setLayout(loadedLayout);
          }
        }
      } catch (err) {
        console.error('[MasterMap2DViewer] Failed to load layout:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [farmId, cachedLayout]);

  useEffect(() => {
    const pId = pan.addListener((v) => { _lastPan.current = v; });
    const sId = scale.addListener((v) => {
      _lastScale.current = v.value;
      setZoomScale(v.value);
    });
    return () => {
      pan.removeListener(pId);
      scale.removeListener(sId);
    };
  }, [pan, scale]);

  const fitToScreen = useCallback(() => {
    if (viewportSize.width > 0 && viewportSize.height > 0 && minScale > 0) {
      Animated.parallel([
        Animated.spring(scale, { toValue: minScale, useNativeDriver: false, friction: 8, tension: 40 }),
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 8, tension: 40 }),
      ]).start(() => {
        _lastScale.current = minScale;
        _lastPan.current = { x: 0, y: 0 };
        setZoomScale(minScale);
      });
    }
  }, [viewportSize, minScale, scale, pan]);

  useEffect(() => {
    if (viewportSize.width > 0 && viewportSize.height > 0 && !isLoading && minScale > 0) {
      scale.setValue(minScale);
      pan.setValue({ x: 0, y: 0 });
      _lastScale.current = minScale;
      _lastPan.current = { x: 0, y: 0 };
      setZoomScale(minScale);
    }
  }, [viewportSize.width, viewportSize.height, isLoading, minScale, scale, pan]);

  // Pan Responder
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (evt, g) => {
          const touches = evt.nativeEvent.touches;
          return touches.length >= 2 || (touches.length === 1 && (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6));
        },
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            _initDistance.current = Math.sqrt(dx * dx + dy * dy);
          }
          pan.setOffset({ x: _lastPan.current.x, y: _lastPan.current.y });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (evt, g) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (_initDistance.current > 0) {
              const factor = dist / _initDistance.current;
              const nextScale = Math.min(Math.max(minScale, _lastScale.current * factor), 4.0);
              scale.setValue(nextScale);
            }
          } else if (touches.length === 1) {
            pan.setValue({ x: g.dx, y: g.dy });
          }
        },
        onPanResponderRelease: () => {
          pan.flattenOffset();

          const currentScale = _lastScale.current > 0 ? _lastScale.current : minScale;
          const renderedW = canvasWidth * currentScale;
          const renderedH = canvasHeight * currentScale;

          // Clamped pan bounds: stays centered when full canvas fits inside viewport
          const maxPanX = renderedW > viewportSize.width ? (renderedW - viewportSize.width) / 2 + 20 : 0;
          const maxPanY = renderedH > viewportSize.height ? (renderedH - viewportSize.height) / 2 + 20 : 0;

          const curX = _lastPan.current.x;
          const curY = _lastPan.current.y;

          const clampedX = Math.max(-maxPanX, Math.min(maxPanX, curX));
          const clampedY = Math.max(-maxPanY, Math.min(maxPanY, curY));

          if (clampedX !== curX || clampedY !== curY) {
            Animated.spring(pan, {
              toValue: { x: clampedX, y: clampedY },
              useNativeDriver: false,
              friction: 8,
              tension: 40,
            }).start();
          }
          _lastPan.current = { x: clampedX, y: clampedY };
          _lastScale.current = currentScale;
        },
      }),
    [minScale, pan, scale, canvasWidth, canvasHeight, viewportSize]
  );

  const handleDeselect = () => {
    setSelectedZone(null);
    setSelectedPlot(null);
    setSelectedFacility(null);
  };

  const getFacilityIcon = (iconName: string) => {
    switch (iconName) {
      case 'wrench': return <Settings size={18} color="#FFFFFF" strokeWidth={2.4} />;
      case 'flask': return <FlaskConical size={18} color="#FFFFFF" strokeWidth={2.4} />;
      case 'sprout': return <Sprout size={18} color="#FFFFFF" strokeWidth={2.4} />;
      case 'recycle': return <RefreshCw size={18} color="#FFFFFF" strokeWidth={2.4} />;
      case 'home': return <Home size={18} color="#FFFFFF" strokeWidth={2.4} />;
      case 'egg': return <Layers size={18} color="#FFFFFF" strokeWidth={2.4} />;
      default: return <Box size={18} color="#FFFFFF" strokeWidth={2.4} />;
    }
  };

  // Native grid lines (Zero offscreen bitmap allocation — hardware accelerated)
  const gridLines = useMemo(() => {
    if (!showGrid) return null;
    const lines: React.ReactNode[] = [];
    const step = worldWidth > 20 || worldHeight > 20 ? 1 : GRID_CELL_SIZE;

    // Vertical lines
    for (let m = step; m < worldWidth; m += step) {
      const isMajor = m % 5 === 0;
      const isMid = m % 1 === 0;
      lines.push(
        <View
          key={`vx-${m}`}
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
          key={`hz-${m}`}
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
  }, [showGrid, worldWidth, worldHeight]);

  if (isLoading) {
    return <FarmMapSkeleton title="Master Map" />;
  }

  const plots = layout?.plots || [];
  const zones = layout?.zones || [];
  const facilities = layout?.facilities || [];

  return (
    <View className="flex-1 bg-champagne">
      {/* ─── Apple Navigation Header ─── */}
      <View
        style={{ paddingTop: Math.max(insets.top, 14) }}
        className="border-b border-black/5 bg-white/95 px-4 pb-3 shadow-xs z-30">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={onBack}
            className="h-9 w-9 items-center justify-center rounded-full bg-champagne/80 border border-taupe/20 active:scale-95">
            <ArrowLeft size={18} color="#2A1610" strokeWidth={2.4} />
          </Pressable>

          <View className="flex-1 items-center px-2">
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full bg-emerald-500" />
              <Text className="text-sm font-black text-espresso" numberOfLines={1}>
                {farmName}
              </Text>
            </View>
            <Text className="text-[11px] font-semibold text-taupe" numberOfLines={1}>
              2D Master Estate • {zones.length} Zones • {plots.length} Beds
            </Text>
          </View>

          <View className="flex-row items-center gap-1.5">
            <Pressable
              onPress={fitToScreen}
              className="h-9 w-9 items-center justify-center rounded-full bg-cognac/10 border border-cognac/20 active:scale-95">
              <RefreshCw size={16} color="#8C4522" strokeWidth={2.4} />
            </Pressable>

            {onEditLayout && (
              <Pressable
                onPress={onEditLayout}
                className="flex-row items-center gap-1 rounded-full bg-cognac px-3 py-2 shadow-xs active:scale-95">
                <Pencil size={13} color="#FFFFFF" strokeWidth={2.4} />
                <Text className="text-xs font-black text-white">Edit</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Layer Filter Badges */}
        <View className="mt-3 flex-row items-center gap-1.5">
          {(['all', 'zones', 'plots', 'facilities'] as FilterLayer[]).map((layer) => {
            const isSelected = activeLayer === layer;
            const count =
              layer === 'all'
                ? plots.length + zones.length + facilities.length
                : layer === 'zones'
                ? zones.length
                : layer === 'plots'
                ? plots.length
                : facilities.length;

            return (
              <Pressable
                key={layer}
                onPress={() => setActiveLayer(layer)}
                className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:scale-95 ${
                  isSelected
                    ? 'bg-espresso text-white'
                    : 'bg-white/80 border border-taupe/20'
                }`}>
                <Text
                  className={`text-[11px] font-black uppercase tracking-wider ${
                    isSelected ? 'text-white' : 'text-espresso'
                  }`}>
                  {layer}
                </Text>
                <View
                  className={`rounded-full px-1.5 py-0.2 ${
                    isSelected ? 'bg-white/20' : 'bg-black/5'
                  }`}>
                  <Text
                    className={`text-[9px] font-bold ${
                      isSelected ? 'text-white' : 'text-taupe'
                    }`}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ─── 2D Canvas Viewport ─── */}
      <View
        style={{
          flex: 1,
          backgroundColor: '#E6DDD1',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setViewportSize({ width, height });
        }}
        {...panResponder.panHandlers}>
        <Animated.View
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { scale: scale },
            ],
          }}>
          <Pressable onPress={handleDeselect} style={{ width: canvasWidth, height: canvasHeight }}>
            {/* Native Farm Terrain Base Board (Grid hidden by default so it looks like a continuous whole farm) */}
            <View
              style={{
                position: 'absolute',
                left: CANVAS_PADDING,
                top: CANVAS_PADDING,
                width: worldWidth * PIXELS_PER_UNIT,
                height: worldHeight * PIXELS_PER_UNIT,
                backgroundColor: '#F7F3EC',
                borderColor: '#BFAFA0',
                borderWidth: 2,
                borderRadius: 20,
                overflow: 'hidden',
                shadowColor: '#2A1610',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.08,
                shadowRadius: 16,
                elevation: 2,
              }}
              pointerEvents="none">
              {showGrid && gridLines}
            </View>

            {/* Elements Layer */}
            <View
              style={{
                position: 'absolute',
                left: CANVAS_PADDING,
                top: CANVAS_PADDING,
                width: worldWidth * PIXELS_PER_UNIT,
                height: worldHeight * PIXELS_PER_UNIT,
              }}
              pointerEvents="box-none">

              {/* 1. Zones */}
              {(activeLayer === 'all' || activeLayer === 'zones') &&
                zones.map((zone) => {
                  const isGreenhouse = zone.zoneType === 'greenhouse';
                  const isInConversion = zone.organicStatus === 'in_conversion';
                  const isInspected = selectedZone?.id === zone.id;

                  const widthPx = zone.widthM * PIXELS_PER_UNIT;
                  const heightPx = zone.heightM * PIXELS_PER_UNIT;
                  const leftPx = (zone.x - zone.widthM / 2) * PIXELS_PER_UNIT;
                  const topPx = (zone.y - zone.heightM / 2) * PIXELS_PER_UNIT;

                  return (
                    <Pressable
                      key={zone.id}
                      onPress={() => {
                        setSelectedPlot(null);
                        setSelectedFacility(null);
                        setSelectedZone(zone);
                      }}
                      style={{
                        position: 'absolute',
                        left: leftPx,
                        top: topPx,
                        width: widthPx,
                        height: heightPx,
                        zIndex: isInspected ? 4 : 2,
                        borderColor: isInspected ? '#8C4522' : zone.color,
                        borderWidth: isInspected ? 3 : 2,
                        borderStyle: isGreenhouse ? 'solid' : 'dashed',
                        backgroundColor: zone.fillColor || 'rgba(45, 106, 79, 0.06)',
                        borderRadius: 16,
                      }}
                      className="overflow-hidden">
                      {/* Zone Header Label */}
                      <View
                        style={{
                          backgroundColor: isGreenhouse ? '#2D6A4F' : isInConversion ? '#D97706' : zone.color,
                        }}
                        className="flex-row items-center justify-between px-2.5 py-1 shadow-xs">
                        <View className="flex-row items-center gap-1.5 flex-1 pr-1">
                          {isGreenhouse ? (
                            <Sparkles size={11} color="#FFFFFF" strokeWidth={2.4} />
                          ) : (
                            <Leaf size={11} color="#FFFFFF" strokeWidth={2.4} />
                          )}
                          <Text className="text-[11px] font-black text-white" numberOfLines={1}>
                            {zone.name}
                          </Text>
                        </View>
                        <View className="rounded bg-white/20 px-1 py-0.2">
                          <Text className="text-[9px] font-black text-white uppercase">
                            {zone.code}
                          </Text>
                        </View>
                      </View>

                      {/* Dimension watermark */}
                      <View className="absolute bottom-1 right-2">
                        <Text className="text-[9px] font-extrabold text-black/30">
                          {zone.widthM}m × {zone.heightM}m
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

              {/* 2. Plots / Planting Beds */}
              {(activeLayer === 'all' || activeLayer === 'plots') &&
                plots.map((plot) => {
                  const isInspected = selectedPlot?.id === plot.id;
                  const widthPx = plot.widthM * PIXELS_PER_UNIT;
                  const heightPx = plot.heightM * PIXELS_PER_UNIT;
                  const leftPx = (plot.x - plot.widthM / 2) * PIXELS_PER_UNIT;
                  const topPx = (plot.y - plot.heightM / 2) * PIXELS_PER_UNIT;

                  return (
                    <Pressable
                      key={plot.id}
                      onPress={() => {
                        setSelectedZone(null);
                        setSelectedFacility(null);
                        setSelectedPlot(plot);
                      }}
                      style={{
                        position: 'absolute',
                        left: leftPx,
                        top: topPx,
                        width: widthPx,
                        height: heightPx,
                        zIndex: isInspected ? 25 : 10,
                        backgroundColor: plot.color,
                        borderColor: isInspected ? '#2A1610' : 'rgba(255, 255, 255, 0.7)',
                        borderWidth: isInspected ? 2.5 : 1,
                        borderRadius: 6,
                      }}
                      className="items-center justify-center shadow-xs">
                      <Text
                        className="text-[10px] font-black text-white shadow-sm"
                        numberOfLines={1}>
                        {plot.label}
                      </Text>
                      <Text className="text-[8px] font-bold text-white/80">
                        {plot.widthM}m × {plot.heightM}m
                      </Text>
                    </Pressable>
                  );
                })}

              {/* 3. Physical Facilities */}
              {(activeLayer === 'all' || activeLayer === 'facilities') &&
                facilities.map((facility) => {
                  const isInspected = selectedFacility?.id === facility.id;
                  const widthPx = facility.widthM * PIXELS_PER_UNIT;
                  const heightPx = facility.heightM * PIXELS_PER_UNIT;
                  const leftPx = (facility.x - facility.widthM / 2) * PIXELS_PER_UNIT;
                  const topPx = (facility.y - facility.heightM / 2) * PIXELS_PER_UNIT;

                  return (
                    <Pressable
                      key={facility.id}
                      onPress={() => {
                        setSelectedZone(null);
                        setSelectedPlot(null);
                        setSelectedFacility(facility);
                      }}
                      style={{
                        position: 'absolute',
                        left: leftPx,
                        top: topPx,
                        width: widthPx,
                        height: heightPx,
                        zIndex: isInspected ? 25 : 10,
                        backgroundColor: facility.color,
                        borderColor: isInspected ? '#2A1610' : 'rgba(255, 255, 255, 0.8)',
                        borderWidth: isInspected ? 2.5 : 1.5,
                        borderRadius: 12,
                      }}
                      className="items-center justify-center p-1 shadow-sm">
                      {getFacilityIcon(facility.icon)}
                      <Text
                        className="text-[9px] font-black text-white text-center mt-0.5 shadow-sm"
                        numberOfLines={2}>
                        {facility.name}
                      </Text>
                    </Pressable>
                  );
                })}
            </View>
          </Pressable>
        </Animated.View>

        {/* Empty layout overlay */}
        {plots.length === 0 && zones.length === 0 && facilities.length === 0 && (
          <View pointerEvents="box-none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', paddingHorizontal: 22, paddingVertical: 20, borderRadius: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6, maxWidth: 300 }}>
              <Layers size={36} color="#8C4522" strokeWidth={2.2} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#1C120C', marginTop: 12, textAlign: 'center' }}>
                No Layout Defined Yet
              </Text>
              <Text style={{ fontSize: 12, color: '#8C7C70', marginTop: 5, textAlign: 'center', lineHeight: 18 }}>
                This farm doesn't have any beds or zones placed on its 2D master map yet.
              </Text>
              {onEditLayout && (
                <Pressable
                  onPress={onEditLayout}
                  style={{ marginTop: 16, backgroundColor: '#8C4522', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>
                    Open Layout Designer
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      {/* ─── Floating Controls: Zoom & Grid Toggle Pill ─── */}
      <View className="absolute bottom-6 right-5 z-20 flex-row items-center gap-2">
        <Pressable
          onPress={() => setShowGrid((v) => !v)}
          className={`rounded-full border px-3 py-1.5 shadow-sm active:scale-95 ${
            showGrid
              ? 'bg-espresso border-espresso'
              : 'bg-white/95 border-black/10'
          }`}>
          <Text
            className={`text-[10px] font-black ${
              showGrid ? 'text-white' : 'text-espresso'
            }`}>
            {showGrid ? '📐 HIDE GRID' : '📐 SHOW GRID'}
          </Text>
        </Pressable>

        <View className="rounded-full border border-black/10 bg-white/95 px-3 py-1.5 shadow-sm">
          <Text className="text-[10px] font-black text-espresso">
            {Math.round(zoomScale * 100)}% ZOOM
          </Text>
        </View>
      </View>

      {/* ─── Apple-style Interactive Bottom Inspector Sheet ─── */}
      {(selectedZone || selectedPlot || selectedFacility) && (
        <View
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          className="absolute bottom-0 left-0 right-0 z-30 rounded-t-[30px] border-t border-taupe/20 bg-white p-5 shadow-2xl">
          {/* Header row */}
          <View className="flex-row items-center justify-between pb-3 border-b border-black/5">
            <View className="flex-row items-center gap-2.5 flex-1 pr-2">
              <View
                style={{
                  backgroundColor: selectedZone
                    ? selectedZone.color
                    : selectedPlot
                    ? selectedPlot.color
                    : selectedFacility?.color,
                }}
                className="h-10 w-10 items-center justify-center rounded-2xl shadow-xs">
                {selectedZone ? (
                  <Layers size={18} color="#FFFFFF" strokeWidth={2.4} />
                ) : selectedPlot ? (
                  <Leaf size={18} color="#FFFFFF" strokeWidth={2.4} />
                ) : (
                  getFacilityIcon(selectedFacility?.icon || '')
                )}
              </View>

              <View className="flex-1">
                <Text className="text-sm font-black text-espresso" numberOfLines={1}>
                  {selectedZone?.name || selectedPlot?.label || selectedFacility?.name}
                </Text>
                <Text className="text-[11px] font-semibold text-taupe uppercase">
                  {selectedZone
                    ? `${selectedZone.zoneType.replace('_', ' ')} • ${selectedZone.code}`
                    : selectedPlot
                    ? 'Planting Bed'
                    : `${selectedFacility?.category} facility`}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handleDeselect}
              className="h-8 w-8 items-center justify-center rounded-full bg-champagne border border-taupe/20 active:scale-95">
              <X size={15} color="#2A1610" strokeWidth={2.4} />
            </Pressable>
          </View>

          {/* Details Body */}
          <View className="pt-3">
            {selectedZone && (
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <View className="rounded-lg bg-champagne px-2.5 py-1">
                    <Text className="text-xs font-bold text-espresso">
                      📐 {selectedZone.widthM}m × {selectedZone.heightM}m ({(selectedZone.widthM * selectedZone.heightM).toFixed(0)} m²)
                    </Text>
                  </View>
                  <View className="rounded-lg bg-emerald-50 px-2.5 py-1 border border-emerald-200">
                    <Text className="text-xs font-bold text-emerald-800">
                      🌿 {selectedZone.organicStatus.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                {(() => {
                  const childPlots = plots.filter((p) => p.zoneId === selectedZone.id);
                  const childFacs = facilities.filter((f) => f.zoneId === selectedZone.id);
                  return (
                    <Text className="text-xs font-semibold text-taupe mt-1">
                      Contains {childPlots.length} planting {childPlots.length === 1 ? 'bed' : 'beds'} and {childFacs.length} support {childFacs.length === 1 ? 'facility' : 'facilities'}.
                    </Text>
                  );
                })()}
              </View>
            )}

            {selectedPlot && (
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <View className="rounded-lg bg-champagne px-2.5 py-1">
                    <Text className="text-xs font-bold text-espresso">
                      📐 {selectedPlot.widthM}m × {selectedPlot.heightM}m ({(selectedPlot.widthM * selectedPlot.heightM).toFixed(1)} m²)
                    </Text>
                  </View>
                  {selectedPlot.zoneId && (
                    <View className="rounded-lg bg-blue-50 px-2.5 py-1 border border-blue-200">
                      <Text className="text-xs font-bold text-blue-800">
                        📍 {zones.find((z) => z.id === selectedPlot.zoneId)?.name || 'Assigned Zone'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs font-semibold text-taupe mt-1">
                  Active soil plot ready for crop cycle planting and nutrient monitoring.
                </Text>
              </View>
            )}

            {selectedFacility && (() => {
              const facilityInventories = Array.isArray(selectedFacility.inventories)
                ? selectedFacility.inventories
                : [];
              const facilityTimeLogs = Array.isArray(selectedFacility.timeLogs)
                ? selectedFacility.timeLogs
                : [];
              const fn = selectedFacility.facilityFunction || 'inventory';

              return (
                <View className="gap-2">
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <View className="rounded-lg bg-champagne px-2.5 py-1">
                      <Text className="text-xs font-bold text-espresso">
                        📐 {selectedFacility.widthM}m × {selectedFacility.heightM}m
                      </Text>
                    </View>
                    {fn !== 'time_keeping' && (
                      <View className="rounded-lg bg-amber-50 px-2.5 py-1 border border-amber-200">
                        <Text className="text-xs font-bold text-amber-800">
                          📦 {facilityInventories.length} {facilityInventories.length === 1 ? 'Item' : 'Items'}
                        </Text>
                      </View>
                    )}
                    {fn !== 'inventory' && (
                      <View className="rounded-lg bg-indigo-50 px-2.5 py-1 border border-indigo-200">
                        <Text className="text-xs font-bold text-indigo-800">
                          ⏱️ {facilityTimeLogs.length} {facilityTimeLogs.length === 1 ? 'Time Log' : 'Time Logs'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {facilityInventories.length > 0 && fn !== 'time_keeping' && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-1 flex-row gap-2">
                      {facilityInventories.map((inv) => (
                        <View key={inv.id} className="rounded-xl border border-taupe/20 bg-champagne/40 px-3 py-1.5">
                          <Text className="text-xs font-bold text-espresso">{inv.name}</Text>
                          <Text className="text-[10px] font-semibold text-taupe">
                            {inv.quantity} {inv.unit} • {inv.status}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}

                  <Pressable
                    onPress={() => setIsInventorySheetOpen(true)}
                    className={`mt-2 flex-row items-center justify-center gap-2 rounded-xl py-2.5 px-4 active:scale-98 shadow-sm ${
                      fn === 'time_keeping'
                        ? 'bg-indigo-900'
                        : fn === 'both'
                        ? 'bg-emerald-900'
                        : 'bg-espresso'
                    }`}>
                    {fn === 'time_keeping' ? (
                      <>
                        <Clock size={15} color="#FFFFFF" strokeWidth={2.4} />
                        <Text className="text-xs font-black text-white">Log Staff Hours & Manage</Text>
                      </>
                    ) : fn === 'both' ? (
                      <>
                        <Box size={15} color="#FFFFFF" strokeWidth={2.4} />
                        <Text className="text-xs font-black text-white">Manage Hub (Stock & Time)</Text>
                      </>
                    ) : (
                      <>
                        <Box size={15} color="#FFFFFF" strokeWidth={2.4} />
                        <Text className="text-xs font-black text-white">Manage Facility & Stock</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })()}
          </View>
        </View>
      )}

      {/* Facility Inventory Management Sheet */}
      <FacilityInventorySheet
        facility={selectedFacility}
        visible={isInventorySheetOpen}
        onClose={() => setIsInventorySheetOpen(false)}
        onUpdateFacility={handleUpdateFacilityInventory}
        onDeleteFacility={handleDeleteFacility}
      />
    </View>
  );
}
