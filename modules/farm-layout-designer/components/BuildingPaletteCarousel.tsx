/**
 * Farm Layout Designer — BuildingPaletteCarousel
 *
 * Clash of Clans inspired bottom building dock for browsing, tapping,
 * and dragging facilities, plots, and zones directly onto the farm canvas.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import {
  ChevronDown,
  Plus,
} from '../../../components/Icons';
import {
  FACILITY_TEMPLATES,
  ZONE_TEMPLATES,
  PLOT_TEMPLATES,
  type FacilityTemplate,
  type ZoneTemplate,
  type PlotTemplate,
} from '../constants';
import type { DragItemType } from './DragPlacementOverlay';
import { BuildingDockCard } from './BuildingDockCard';

type PaletteTab = 'facility' | 'plot' | 'zone';

type BuildingPaletteCarouselProps = {
  isMasterLayout?: boolean;
  placedPlots?: { label: string }[];
  placedFacilities?: { name: string }[];
  placedZones?: { name: string }[];
  onSelectFacility: (template: FacilityTemplate) => void;
  onSelectPlot: (template: PlotTemplate) => void;
  onSelectZone: (template: ZoneTemplate) => void;
  onOpenCustomModal?: () => void;
  onDragStart: (
    itemType: DragItemType,
    template: FacilityTemplate | ZoneTemplate | PlotTemplate,
    startScreenPos: { x: number; y: number }
  ) => void;
  onDragMove: (screenPos: { x: number; y: number }) => void;
  onDragEnd: () => void;
};

export function BuildingPaletteCarousel({
  isMasterLayout = true,
  placedPlots = [],
  placedFacilities = [],
  placedZones = [],
  onSelectFacility,
  onSelectPlot,
  onSelectZone,
  onOpenCustomModal,
  onDragStart,
  onDragMove,
  onDragEnd,
}: BuildingPaletteCarouselProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<PaletteTab>(
    isMasterLayout ? 'facility' : 'plot'
  );
  const [facilityFilter, setFacilityFilter] = useState<string>('all');

  // Filtered facilities
  const filteredFacilities = useMemo(() => {
    if (facilityFilter === 'all') return FACILITY_TEMPLATES;
    return FACILITY_TEMPLATES.filter((f) => f.category === facilityFilter);
  }, [facilityFilter]);

  // Counts mapped by template
  const getFacilityPlacedCount = (template: FacilityTemplate) => {
    return placedFacilities.filter(
      (f) => f.name.toLowerCase() === template.name.toLowerCase()
    ).length;
  };

  const getPlotPlacedCount = (template: PlotTemplate) => {
    return placedPlots.filter(
      (p) =>
        p.label.toLowerCase() === template.label.toLowerCase() ||
        p.label.toLowerCase().includes(template.category)
    ).length;
  };

  const getZonePlacedCount = (template: ZoneTemplate) => {
    return placedZones.filter(
      (z) => z.name.toLowerCase() === template.name.toLowerCase()
    ).length;
  };

  return (
    <View style={styles.paletteContainer}>
      {/* ─── Collapsed Mini Dock ───────────────────────────── */}
      {!isExpanded ? (
        <Pressable
          onPress={() => setIsExpanded(true)}
          style={styles.collapsedBar}>
          <View style={styles.collapsedLeft}>
            <View style={styles.dockHandleBar} />
            <Text style={styles.collapsedTitle}>Build Elements</Text>
            <Text style={styles.collapsedSubtitle}>
              {placedFacilities.length} Facilities • {placedPlots.length} Beds
            </Text>
          </View>
          <View style={styles.expandButton}>
            <Text style={styles.expandButtonText}>Open</Text>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <ChevronDown size={15} color="#8C4522" strokeWidth={2.5} />
            </View>
          </View>
        </Pressable>
      ) : (
        /* ─── Expanded Clash of Clans Dock ─────────────────── */
        <View style={styles.expandedTray}>
          {/* Header Row: Category Selector & Collapse */}
          <View style={styles.headerRow}>
            <View style={styles.tabsRow}>
              {/* Facilities Tab */}
              {isMasterLayout && (
                <Pressable
                  onPress={() => setActiveTab('facility')}
                  style={[
                    styles.tabButton,
                    activeTab === 'facility' && styles.tabButtonActive,
                  ]}>
                  <Text
                    style={[
                      styles.tabButtonText,
                      activeTab === 'facility' && styles.tabButtonTextActive,
                    ]}>
                    Facilities
                  </Text>
                </Pressable>
              )}

              {/* Beds & Plots Tab */}
              <Pressable
                onPress={() => setActiveTab('plot')}
                style={[
                  styles.tabButton,
                  activeTab === 'plot' && styles.tabButtonActive,
                ]}>
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'plot' && styles.tabButtonTextActive,
                  ]}>
                  Beds & Plots
                </Text>
              </Pressable>

              {/* Zones Tab */}
              {isMasterLayout && (
                <Pressable
                  onPress={() => setActiveTab('zone')}
                  style={[
                    styles.tabButton,
                    activeTab === 'zone' && styles.tabButtonActive,
                  ]}>
                  <Text
                    style={[
                      styles.tabButtonText,
                      activeTab === 'zone' && styles.tabButtonTextActive,
                    ]}>
                    Zones
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Right: Custom + Minimize */}
            <View style={styles.headerRightActions}>
              {onOpenCustomModal && (
                <Pressable
                  onPress={onOpenCustomModal}
                  style={styles.customButton}>
                  <Plus size={13} color="#8C4522" strokeWidth={3} />
                  <Text style={styles.customButtonText}>Custom</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setIsExpanded(false)}
                style={styles.collapseButton}>
                <ChevronDown size={18} color="#78716C" />
              </Pressable>
            </View>
          </View>

          {/* Sub-filter Chips for Facilities */}
          {activeTab === 'facility' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}>
              {[
                { id: 'all', label: 'All' },
                { id: 'storage', label: 'Storage' },
                { id: 'processing', label: 'Processing' },
                { id: 'livestock', label: 'Livestock' },
                { id: 'housing', label: 'Housing' },
                { id: 'amenity', label: 'Amenity' },
              ].map((chip) => {
                const isSelected = facilityFilter === chip.id;
                return (
                  <Pressable
                    key={chip.id}
                    onPress={() => setFacilityFilter(chip.id)}
                    style={[
                      styles.filterChip,
                      isSelected && styles.filterChipActive,
                    ]}>
                    <Text
                      style={[
                        styles.filterChipText,
                        isSelected && styles.filterChipTextActive,
                      ]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* ─── Horizontal Scrollable CoC Cards ──────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselCardsRow}
            keyboardShouldPersistTaps="handled">
            {activeTab === 'facility' &&
              filteredFacilities.map((facility) => (
                <BuildingDockCard
                  key={facility.name}
                  itemType="facility"
                  template={facility}
                  placedCount={getFacilityPlacedCount(facility)}
                  onSelect={() => onSelectFacility(facility)}
                  onDragStart={onDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                />
              ))}

            {activeTab === 'plot' &&
              PLOT_TEMPLATES.map((plot) => (
                <BuildingDockCard
                  key={plot.name}
                  itemType="plot"
                  template={plot}
                  placedCount={getPlotPlacedCount(plot)}
                  onSelect={() => onSelectPlot(plot)}
                  onDragStart={onDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                />
              ))}

            {activeTab === 'zone' &&
              ZONE_TEMPLATES.map((zone) => (
                <BuildingDockCard
                  key={zone.name}
                  itemType="zone"
                  template={zone}
                  placedCount={getZonePlacedCount(zone)}
                  onSelect={() => onSelectZone(zone)}
                  onDragStart={onDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                />
              ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  paletteContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderTopColor: '#E2D9CE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 5,
  },
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  collapsedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dockHandleBar: {
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D6CBC0',
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
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F2ECE4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  expandButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C4522',
  },
  expandedTray: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#F7F4EF',
  },
  tabButtonActive: {
    backgroundColor: '#8C4522',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#78716C',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(140, 69, 34, 0.1)',
  },
  customButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8C4522',
  },
  collapseButton: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#F5EFE6',
  },
  filterChipsRow: {
    paddingHorizontal: 14,
    gap: 5,
    marginBottom: 6,
  },
  filterChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F7F4EF',
    borderWidth: 1,
    borderColor: '#E7DFD5',
  },
  filterChipActive: {
    backgroundColor: '#0369A1',
    borderColor: '#0369A1',
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#78716C',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  carouselCardsRow: {
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
});
