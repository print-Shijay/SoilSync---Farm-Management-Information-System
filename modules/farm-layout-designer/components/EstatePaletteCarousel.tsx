/**
 * Farm Estate Designer — EstatePaletteCarousel
 *
 * Clash of Clans inspired bottom building dock for Estate Farm layouts.
 * Features a selector toggle with values:
 * 1. "Farm Layouts" — drag & drop whole farm parcels onto the estate
 * 2. "Facilities" — drag & drop centralized estate facilities
 * (Plots are disabled at the estate level)
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  PanResponder,
  Vibration,
  Platform,
} from 'react-native';
import {
  ChevronDown,
  Layers,
  Building2,
  Box,
  MapPin,
  Check,
  RotateCcw,
} from 'lucide-react-native';
import { FACILITY_TEMPLATES, type FacilityTemplate } from '../constants';
import { BuildingDockCard } from './BuildingDockCard';

export type EstateDockTab = 'farms' | 'facilities';

export interface AvailableFarmLayoutItem {
  id: string; // farm ID
  name: string;
  widthM: number;
  heightM: number;
  plotCount: number;
  color?: string;
  isPlaced: boolean;
}

type EstatePaletteCarouselProps = {
  availableFarms: AvailableFarmLayoutItem[];
  placedFacilitiesCount?: Record<string, number>;
  onSelectFarm: (farm: AvailableFarmLayoutItem) => void;
  onSelectFacility: (template: FacilityTemplate) => void;
  onDragStartFarm: (farm: AvailableFarmLayoutItem, startPos: { x: number; y: number }) => void;
  onDragStartFacility: (template: FacilityTemplate, startPos: { x: number; y: number }) => void;
  onDragMove: (screenPos: { x: number; y: number }) => void;
  onDragEnd: () => void;
  onResetFarms?: () => void;
};

export function EstatePaletteCarousel({
  availableFarms,
  placedFacilitiesCount = {},
  onSelectFarm,
  onSelectFacility,
  onDragStartFarm,
  onDragStartFacility,
  onDragMove,
  onDragEnd,
  onResetFarms,
}: EstatePaletteCarouselProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<EstateDockTab>('farms');
  const [facilityFilter, setFacilityFilter] = useState<string>('all');

  const filteredFacilities = useMemo(() => {
    if (facilityFilter === 'all') return FACILITY_TEMPLATES;
    return FACILITY_TEMPLATES.filter((f) => f.category === facilityFilter);
  }, [facilityFilter]);

  return (
    <View style={styles.paletteContainer}>
      {/* ─── Collapsed Mini Dock ─── */}
      {!isExpanded ? (
        <Pressable
          onPress={() => setIsExpanded(true)}
          style={styles.collapsedBar}
          accessibilityLabel="Open Building Dock">
          <View style={styles.collapsedHandle} />
          <View style={styles.collapsedContent}>
            <View style={styles.collapsedIconChip}>
              <Layers size={14} color="#8C4522" strokeWidth={2.4} />
            </View>
            <Text style={styles.collapsedTitle}>
              {activeTab === 'farms' ? 'Farm Layouts' : 'Facilities'} Dock
            </Text>
            <Text style={styles.collapsedSubtitle}>
              Tap to expand • {activeTab === 'farms' ? `${availableFarms.length} Parcels` : 'Facilities'}
            </Text>
          </View>
        </Pressable>
      ) : (
        /* ─── Expanded Full Dock ─── */
        <View style={styles.expandedDock}>
          {/* Header Bar */}
          <View style={styles.headerBar}>
            {/* Primary Selector Toggle: Farm Layouts vs. Facilities */}
            <View style={styles.tabSelector}>
              <Pressable
                onPress={() => setActiveTab('farms')}
                style={[styles.tabButton, activeTab === 'farms' && styles.tabButtonActive]}>
                <Layers
                  size={12}
                  color={activeTab === 'farms' ? '#FFFFFF' : '#8C7C70'}
                  strokeWidth={2.4}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'farms' && styles.tabButtonTextActive,
                  ]}>
                  Farm Layouts ({availableFarms.length})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('facilities')}
                style={[styles.tabButton, activeTab === 'facilities' && styles.tabButtonActive]}>
                <Building2
                  size={12}
                  color={activeTab === 'facilities' ? '#FFFFFF' : '#8C7C70'}
                  strokeWidth={2.4}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'facilities' && styles.tabButtonTextActive,
                  ]}>
                  Facilities
                </Text>
              </Pressable>
            </View>

            {/* Right Action Icons */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* Collapse Arrow */}
              <Pressable
                onPress={() => setIsExpanded(false)}
                hitSlop={8}
                style={styles.collapseButton}>
                <ChevronDown size={18} color="#8C7C70" strokeWidth={2.4} />
              </Pressable>
            </View>
          </View>

          {/* Sub-Filters for Facilities */}
          {activeTab === 'facilities' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.facilityFilterRow}>
              {[
                { id: 'all', label: 'All' },
                { id: 'storage', label: 'Storage' },
                { id: 'processing', label: 'Processing' },
                { id: 'nursery', label: 'Nursery' },
                { id: 'infrastructure', label: 'Infra' },
              ].map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => setFacilityFilter(f.id)}
                  style={[
                    styles.filterChip,
                    facilityFilter === f.id && styles.filterChipActive,
                  ]}>
                  <Text
                    style={[
                      styles.filterChipText,
                      facilityFilter === f.id && styles.filterChipTextActive,
                    ]}>
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Horizontal Items Carousel */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselScrollContent}>
            {activeTab === 'farms' ? (
              availableFarms.length > 0 ? (
                availableFarms.map((farm) => (
                  <FarmLayoutDockCard
                    key={farm.id}
                    farm={farm}
                    onSelect={() => onSelectFarm(farm)}
                    onDragStart={(pos) => onDragStartFarm(farm, pos)}
                    onDragMove={onDragMove}
                    onDragEnd={onDragEnd}
                  />
                ))
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    No farm layouts found. Design your individual farm layouts first!
                  </Text>
                </View>
              )
            ) : (
              filteredFacilities.map((tmpl) => (
                <BuildingDockCard
                  key={tmpl.name}
                  itemType="facility"
                  template={tmpl}
                  placedCount={placedFacilitiesCount[tmpl.name] || 0}
                  onSelect={() => onSelectFacility(tmpl)}
                  onDragStart={(_, __, pos) => onDragStartFacility(tmpl, pos)}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                />
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/**
 * Tactical card for dragging/tapping an existing Farm Layout onto the Estate canvas.
 */
function FarmLayoutDockCard({
  farm,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  farm: AvailableFarmLayoutItem;
  onSelect: () => void;
  onDragStart: (startPos: { x: number; y: number }) => void;
  onDragMove: (screenPos: { x: number; y: number }) => void;
  onDragEnd: () => void;
}) {
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const isUpwardDrag =
            gestureState.dy < -6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 0.6;
          return isUpwardDrag;
        },
        onPanResponderGrant: (evt, gestureState) => {
          try {
            Vibration.vibrate(Platform.OS === 'android' ? 25 : 10);
          } catch {}
          onDragStart({
            x: evt.nativeEvent.pageX || gestureState.x0,
            y: evt.nativeEvent.pageY || gestureState.y0,
          });
        },
        onPanResponderMove: (evt, gestureState) => {
          onDragMove({
            x: evt.nativeEvent.pageX || gestureState.moveX,
            y: evt.nativeEvent.pageY || gestureState.moveY,
          });
        },
        onPanResponderRelease: () => onDragEnd(),
        onPanResponderTerminate: () => onDragEnd(),
      }),
    [onDragStart, onDragMove, onDragEnd]
  );

  return (
    <View style={styles.cardWrapper} {...panResponder.panHandlers}>
      <Pressable
        onPress={onSelect}
        style={[styles.farmCard, farm.isPlaced && styles.farmCardPlaced]}>
        {/* Status indicator */}
        <View style={styles.farmCardTopRow}>
          <View
            style={[styles.farmColorDot, { backgroundColor: farm.color || '#2D6A4F' }]}
          />
          {farm.isPlaced ? (
            <View style={styles.placedBadge}>
              <Check size={9} color="#047857" strokeWidth={3} />
              <Text style={styles.placedBadgeText}>Placed</Text>
            </View>
          ) : (
            <View style={styles.unplacedBadge}>
              <Text style={styles.unplacedBadgeText}>Ready</Text>
            </View>
          )}
        </View>

        {/* Thumbnail Preview Area */}
        <View style={styles.farmThumbnail}>
          <Layers size={22} color={farm.color || '#2D6A4F'} strokeWidth={2.2} />
        </View>

        {/* Name and dimensions */}
        <Text style={styles.farmName} numberOfLines={1}>
          {farm.name}
        </Text>
        <Text style={styles.farmMeta}>
          {farm.widthM}m × {farm.heightM}m • {farm.plotCount} {farm.plotCount === 1 ? 'bed' : 'beds'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  paletteContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderTopColor: '#E2D9CE',
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  collapsedBar: {
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(140, 69, 34, 0.15)',
  },
  collapsedHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(140, 124, 112, 0.3)',
    marginBottom: 8,
  },
  collapsedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsedIconChip: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(140, 69, 34, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2A1610',
  },
  collapsedSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8C7C70',
  },
  expandedDock: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(140, 69, 34, 0.15)',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 999,
    padding: 3,
    gap: 4,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tabButtonActive: {
    backgroundColor: '#8C4522',
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8C7C70',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  collapseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetFarmsHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  resetFarmsHeaderText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  facilityFilterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(140, 69, 34, 0.15)',
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8C7C70',
  },
  filterChipTextActive: {
    color: '#8C4522',
    fontWeight: '800',
  },
  carouselScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
    gap: 10,
    flexDirection: 'row',
  },
  cardWrapper: {
    width: 110,
    height: 120,
  },
  farmCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(140, 69, 34, 0.2)',
    padding: 8,
    justifyContent: 'space-between',
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  farmCardPlaced: {
    borderColor: 'rgba(4, 120, 87, 0.3)',
    backgroundColor: 'rgba(236, 253, 245, 0.5)',
  },
  farmCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  farmColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  placedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  placedBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#047857',
  },
  unplacedBadge: {
    backgroundColor: 'rgba(140, 69, 34, 0.1)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unplacedBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#8C4522',
  },
  farmThumbnail: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  farmName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2A1610',
  },
  farmMeta: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#8C7C70',
  },
  emptyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8C7C70',
    textAlign: 'center',
  },
});
