/**
 * Farm Layout Designer — DragPlacementOverlay
 *
 * Renders:
 * 1. Snapped Canvas Footprint: The real-time grid footprint rendered directly
 *    on the canvas inside the world coordinate space (green valid-placement box).
 * 2. Floating Drag Ghost: The finger-following preview badge rendered at screen level.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Wrench,
  FlaskConical,
  Sprout,
  Recycle,
  Home,
  Egg,
  Package,
  Layers,
  Building2,
  Check,
  AlertTriangle,
} from 'lucide-react-native';
import { PIXELS_PER_UNIT, CANVAS_PADDING } from '../constants';
import type { FacilityTemplate, ZoneTemplate, PlotTemplate } from '../constants';

export type DragItemType = 'facility' | 'plot' | 'zone';

export type ActiveDragState = {
  itemType: DragItemType;
  template: FacilityTemplate | ZoneTemplate | PlotTemplate;
  screenPos: { x: number; y: number };
  worldPos: { x: number; y: number } | null;
  isValid: boolean;
};

// ─── Helper: Get Icon for Template ───────────────────────────

export function getTemplateIcon(iconName?: string, color = '#FFFFFF', size = 18) {
  switch (iconName) {
    case 'wrench':
      return <Wrench size={size} color={color} strokeWidth={2.4} />;
    case 'flask':
      return <FlaskConical size={size} color={color} strokeWidth={2.4} />;
    case 'sprout':
      return <Sprout size={size} color={color} strokeWidth={2.4} />;
    case 'recycle':
      return <Recycle size={size} color={color} strokeWidth={2.4} />;
    case 'home':
      return <Home size={size} color={color} strokeWidth={2.4} />;
    case 'egg':
      return <Egg size={size} color={color} strokeWidth={2.4} />;
    case 'package':
      return <Package size={size} color={color} strokeWidth={2.4} />;
    case 'layers':
      return <Layers size={size} color={color} strokeWidth={2.4} />;
    default:
      return <Building2 size={size} color={color} strokeWidth={2.4} />;
  }
}

export function getTemplateDimensions(
  itemType: DragItemType,
  template: FacilityTemplate | ZoneTemplate | PlotTemplate
): { widthM: number; heightM: number; name: string; color: string; icon: string } {
  if (itemType === 'facility') {
    const f = template as FacilityTemplate;
    return {
      widthM: f.defaultWidthM,
      heightM: f.defaultHeightM,
      name: f.name,
      color: f.color,
      icon: f.icon,
    };
  } else if (itemType === 'zone') {
    const z = template as ZoneTemplate;
    return {
      widthM: z.defaultWidthM,
      heightM: z.defaultHeightM,
      name: z.name,
      color: z.color,
      icon: 'layers',
    };
  } else {
    const p = template as PlotTemplate;
    return {
      widthM: p.widthM,
      heightM: p.heightM,
      name: p.name,
      color: '#8C4522',
      icon: 'sprout',
    };
  }
}

// ─── 1. Snapped Canvas Footprint ─────────────────────────────

type CanvasFootprintProps = {
  activeDrag: ActiveDragState;
  worldWidth: number;
  worldHeight: number;
};

export function CanvasFootprint({ activeDrag, worldWidth, worldHeight }: CanvasFootprintProps) {
  if (!activeDrag.worldPos) return null;

  const { widthM, heightM, name, color, icon } = getTemplateDimensions(
    activeDrag.itemType,
    activeDrag.template
  );

  const widthPx = widthM * PIXELS_PER_UNIT;
  const heightPx = heightM * PIXELS_PER_UNIT;
  const leftPx = CANVAS_PADDING + (activeDrag.worldPos.x - widthM / 2) * PIXELS_PER_UNIT;
  const topPx = CANVAS_PADDING + (activeDrag.worldPos.y - heightM / 2) * PIXELS_PER_UNIT;

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
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        ) : (
          <AlertTriangle size={14} color="#FFFFFF" strokeWidth={3} />
        )}
        <Text style={styles.footprintBadgeText}>
          {widthM}m × {heightM}m
        </Text>
      </View>

      {/* Name Label */}
      <Text numberOfLines={1} style={styles.footprintNameText}>
        {name}
      </Text>
    </View>
  );
}

// ─── 2. Floating Drag Ghost ───────────────────────────────────

type FloatingDragGhostProps = {
  activeDrag: ActiveDragState;
};

export function FloatingDragGhost({ activeDrag }: FloatingDragGhostProps) {
  const { widthM, heightM, name, color, icon } = getTemplateDimensions(
    activeDrag.itemType,
    activeDrag.template
  );

  // Position the ghost slightly above and centered relative to the finger
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
      {/* Glowing Outer Card */}
      <View style={[styles.ghostCard, { borderColor: color }]}>
        <View style={[styles.ghostIconBox, { backgroundColor: color }]}>
          {getTemplateIcon(icon, '#FFFFFF', 16)}
        </View>
        <View style={styles.ghostTextContainer}>
          <Text numberOfLines={1} style={styles.ghostTitle}>
            {name}
          </Text>
          <Text style={styles.ghostSubtitle}>
            {widthM}m × {heightM}m • {activeDrag.isValid ? 'Release to place' : 'Drag onto field'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
