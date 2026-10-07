import React, { useState } from 'react';
import { View, TouchableOpacity, LayoutChangeEvent, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Leaf, CalendarDays, Settings, Plus } from './Icons';

const ACTIVE_COLOR = '#8C4522';
const INACTIVE_COLOR = '#8C7C70';

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const [layoutWidth, setLayoutWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    setLayoutWidth(e.nativeEvent.layout.width);
  };

  const W = layoutWidth;
  const H = 64; // Height of the pill bar
  const R = 32; // Corner radius of the pill
  const cx = W / 2;
  const notchRadius = 46; // Width of the notch from center
  const notchDepth = 44; // Depth of the curve dip

  // Mathematically derived control point offsets for pure G1/G2 smooth curvature
  const cpTop = Math.round(notchRadius * 0.75);
  const cpBottom = Math.round(notchRadius * 0.64);

  // Build the smooth notched contour using cubic bezier curves
  const pathD =
    W > 0
      ? `M ${R} 0 ` +
        `L ${cx - notchRadius} 0 ` +
        `C ${cx - cpTop} 0, ${cx - cpBottom} ${notchDepth}, ${cx} ${notchDepth} ` +
        `C ${cx + cpBottom} ${notchDepth}, ${cx + cpTop} 0, ${cx + notchRadius} 0 ` +
        `L ${W - R} 0 ` +
        `A ${R} ${R} 0 0 1 ${W} ${R} ` +
        `L ${W} ${H - R} ` +
        `A ${R} ${R} 0 0 1 ${W - R} ${H} ` +
        `L ${R} ${H} ` +
        `A ${R} ${R} 0 0 1 0 ${H - R} ` +
        `L 0 ${R} ` +
        `A ${R} ${R} 0 0 1 ${R} 0 ` +
        `Z`
      : '';

  const renderTabItem = (routeName: string, IconComponent: React.ComponentType<any>) => {
    const routeIndex = state.routes.findIndex((r) => r.name === routeName);
    if (routeIndex === -1) return null;

    const route = state.routes[routeIndex];
    const isFocused = state.index === routeIndex;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <TouchableOpacity
        key={route.key}
        activeOpacity={0.65}
        onPress={onPress}
        style={styles.tabButton}>
        <View style={styles.iconWrapper}>
          <IconComponent
            size={22}
            color={isFocused ? ACTIVE_COLOR : INACTIVE_COLOR}
            strokeWidth={isFocused ? 2.4 : 1.9}
          />
        </View>
        <View style={[styles.dot, { backgroundColor: isFocused ? ACTIVE_COLOR : 'transparent' }]} />
      </TouchableOpacity>
    );
  };

  const handleAddPress = () => {
    const addRoute = state.routes.find((r) => r.name === 'addFarm');
    if (addRoute) {
      const event = navigation.emit({
        type: 'tabPress',
        target: addRoute.key,
        canPreventDefault: true,
      });
      if (!event.defaultPrevented) {
        navigation.navigate('addFarm');
      }
    } else {
      navigation.navigate('addFarm');
    }
  };

  const isAddFocused = state.routes[state.index]?.name === 'addFarm';

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.barWrapper} onLayout={onLayout} pointerEvents="box-none">
        {/* SVG Pill Background with Smooth Curved Cutout */}
        {W > 0 && (
          <View style={styles.svgContainer}>
            <Svg width={W} height={H}>
              <Path
                d={pathD}
                fill="rgba(251, 248, 244, 0.96)"
                stroke="rgba(140, 69, 34, 0.18)"
                strokeWidth={1}
              />
            </Svg>
          </View>
        )}

        {/* Tab Items Row */}
        <View style={styles.tabsRow} pointerEvents="box-none">
          {/* Left Tabs */}
          <View style={styles.sideTabsGroup} pointerEvents="box-none">
            {renderTabItem('index', Home)}
            {renderTabItem('farms', Leaf)}
          </View>

          {/* Center Space for the Cutout */}
          <View style={styles.centerSpace} pointerEvents="none" />

          {/* Right Tabs */}
          <View style={styles.sideTabsGroup} pointerEvents="box-none">
            {renderTabItem('calendar', CalendarDays)}
            {renderTabItem('settings', Settings)}
          </View>
        </View>

        {/* Floating Center Button */}
        <View style={styles.centerButtonContainer} pointerEvents="box-none">
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleAddPress}
            style={[styles.centerButton, isAddFocused && styles.centerButtonActive]}>
            <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    height: 80,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barWrapper: {
    width: '100%',
    height: 80,
    position: 'relative',
  },
  svgContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    shadowColor: '#1C120C',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  tabsRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  sideTabsGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  centerSpace: {
    width: 68,
    height: 64,
  },
  centerButtonContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#8C4522',
    borderWidth: 3.5,
    borderColor: '#FBF8F4',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8C4522',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  centerButtonActive: {
    transform: [{ scale: 1.05 }],
    borderColor: '#E5D2C0',
  },
  tabButton: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 26,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 9999,
    overflow: 'hidden',
    marginTop: 4,
  },
});
