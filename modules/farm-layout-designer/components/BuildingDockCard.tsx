/**
 * Farm Layout Designer — BuildingDockCard
 *
 * Clash of Clans inspired tactical building card for the bottom dock.
 * Displays 3D isometric building illustrations, count badges, dimension tags,
 * and handles both instant tap-to-add and smooth drag-to-canvas gestures.
 */

import React, { useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  PanResponder,
  Vibration,
  StyleSheet,
  Platform,
} from 'react-native';
import type { FacilityTemplate, ZoneTemplate, PlotTemplate } from '../constants';
import type { DragItemType } from './DragPlacementOverlay';
import { getTemplateDimensions, getTemplateIcon } from './DragPlacementOverlay';
import { getBuildingImage } from '../buildingAssets';

type BuildingDockCardProps = {
  itemType: DragItemType;
  template: FacilityTemplate | ZoneTemplate | PlotTemplate;
  placedCount?: number;
  onSelect: () => void;
  onDragStart: (
    itemType: DragItemType,
    template: FacilityTemplate | ZoneTemplate | PlotTemplate,
    startScreenPos: { x: number; y: number }
  ) => void;
  onDragMove: (screenPos: { x: number; y: number }) => void;
  onDragEnd: () => void;
};

export function BuildingDockCard({
  itemType,
  template,
  placedCount = 0,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: BuildingDockCardProps) {
  const { widthM, heightM, name, color, icon } = getTemplateDimensions(
    itemType,
    template
  );

  const imageAsset = useMemo(() => getBuildingImage(name), [name]);
  const isDraggingRef = useRef(false);

  // Dedicated PanResponder for upward drag onto the farm canvas
  const cardPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const isUpwardDrag =
            gestureState.dy < -8 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 0.7;
          return isUpwardDrag;
        },
        onPanResponderGrant: (evt, gestureState) => {
          isDraggingRef.current = true;
          try {
            Vibration.vibrate(Platform.OS === 'android' ? 25 : 10);
          } catch {}
          onDragStart(itemType, template, {
            x: evt.nativeEvent.pageX || gestureState.x0,
            y: evt.nativeEvent.pageY || gestureState.y0,
          });
        },
        onPanResponderMove: (evt, gestureState) => {
          if (!isDraggingRef.current) return;
          onDragMove({
            x: evt.nativeEvent.pageX || gestureState.moveX,
            y: evt.nativeEvent.pageY || gestureState.moveY,
          });
        },
        onPanResponderRelease: () => {
          isDraggingRef.current = false;
          onDragEnd();
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
          onDragEnd();
        },
      }),
    [itemType, template, onDragStart, onDragMove, onDragEnd]
  );

  // Clean short name for the card badge
  const shortName = useMemo(() => {
    if (name.includes('(')) {
      return name.split('(')[0].trim();
    }
    return name;
  }, [name]);

  return (
    <View style={styles.cardWrapper} {...cardPanResponder.panHandlers}>
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => [
          styles.cardContainer,
          pressed && styles.cardPressed,
        ]}>
        {/* Top Count Badge (CoC style: 'x2' or '+') */}
        <View style={[styles.badge, placedCount > 0 ? styles.badgeActive : styles.badgeZero]}>
          <Text style={styles.badgeText}>
            {placedCount > 0 ? `x${placedCount}` : '+'}
          </Text>
        </View>

        {/* 3D Isometric Building Asset / Icon */}
        <View style={styles.imageContainer}>
          {imageAsset ? (
            <Image
              source={imageAsset}
              style={styles.buildingImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.fallbackIcon, { backgroundColor: color }]}>
              {getTemplateIcon(icon, '#FFFFFF', 24)}
            </View>
          )}
        </View>

        {/* Bottom Label (CoC style level / title bar) */}
        <View style={styles.bottomLabelBox}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {shortName}
          </Text>
          <Text style={styles.cardDimension}>
            {widthM}×{heightM}m
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    width: 78,
    marginRight: 8,
  },
  cardContainer: {
    width: 78,
    height: 94,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2D9CE',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 4,
    shadowColor: '#2A1610',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  cardPressed: {
    transform: [{ scale: 0.94 }],
    borderColor: '#8C4522',
    backgroundColor: '#FBF8F4',
  },
  badge: {
    position: 'absolute',
    top: 3,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    zIndex: 10,
  },
  badgeActive: {
    backgroundColor: '#8C4522',
  },
  badgeZero: {
    backgroundColor: 'rgba(140, 69, 34, 0.15)',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  imageContainer: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  buildingImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  fallbackIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomLabelBox: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'rgba(242, 236, 228, 0.65)',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2A1610',
    textAlign: 'center',
  },
  cardDimension: {
    fontSize: 8,
    fontWeight: '700',
    color: '#8C7C70',
    textAlign: 'center',
    marginTop: -1,
  },
});
