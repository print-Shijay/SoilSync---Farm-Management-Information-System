/**
 * Farm Layout Designer — CanvasToolPalette
 *
 * Left-side floating vertical toolbar allowing the user to:
 * 1. Switch between 🖐️ Pan Mode (Hand) and 👆 Select/Move Mode (Pointer).
 * 2. Toggle Lock/Unlock on the actively selected item (or global lock).
 * 3. Quickly zoom in, zoom out, and fit canvas with smooth 1-tap actions.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Vibration,
  Animated,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Hand,
  MousePointer2,
  Lock,
  LockOpen,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react-native';

const PALETTE_WIDTH = 48;
const DOCK_MARGIN = 14;

export type ToolMode = 'pan' | 'select';

type CanvasToolPaletteProps = {
  mode: ToolMode;
  onModeChange: (mode: ToolMode) => void;
  /** Whether the currently selected element is locked */
  isSelectedLocked?: boolean;
  /** Callback to toggle lock on selected element (hidden if no element selected) */
  onToggleLockSelected?: () => void;
  /** Has an element actively selected */
  hasSelectedElement?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitCanvas: () => void;
  theme?: 'light' | 'dark';
  topOffset?: number;
  initialSide?: 'left' | 'right';
};

export function CanvasToolPalette({
  mode,
  onModeChange,
  isSelectedLocked = false,
  onToggleLockSelected,
  hasSelectedElement = false,
  onZoomIn,
  onZoomOut,
  onFitCanvas,
  theme = 'light',
  topOffset,
  initialSide = 'left',
}: CanvasToolPaletteProps) {
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const leftDockX = DOCK_MARGIN;
  const rightDockX = Math.max(leftDockX, screenWidth - PALETTE_WIDTH - DOCK_MARGIN);

  // Default: Vertically centered on the left side
  const defaultY = topOffset !== undefined
    ? topOffset
    : Math.max(insets.top + 60, Math.round((screenHeight - 260) / 2));
  const defaultX = initialSide === 'right' ? rightDockX : leftDockX;

  const pan = useRef(new Animated.ValueXY({ x: defaultX, y: defaultY })).current;
  const currentPos = useRef({ x: defaultX, y: defaultY });

  // Keep docked to wall if screen size changes
  useEffect(() => {
    const isRight = currentPos.current.x > screenWidth / 2;
    const targetX = isRight ? rightDockX : leftDockX;
    const minTotalY = insets.top + 50;
    const maxTotalY = Math.max(minTotalY, screenHeight - 280);
    const targetY = Math.min(Math.max(currentPos.current.y, minTotalY), maxTotalY);
    currentPos.current = { x: targetX, y: targetY };
    pan.setValue({ x: targetX, y: targetY });
  }, [screenWidth, screenHeight, insets.top, leftDockX, rightDockX, pan]);

  const triggerHaptic = () => {
    try {
      Vibration.vibrate(Platform.OS === 'android' ? 15 : 10);
    } catch {}
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.hypot(gestureState.dx, gestureState.dy) > 5;
        },
        onPanResponderGrant: () => {
          pan.setOffset({ x: currentPos.current.x, y: currentPos.current.y });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (_, gestureState) => {
          pan.setValue({ x: gestureState.dx, y: gestureState.dy });
        },
        onPanResponderRelease: (_, gestureState) => {
          pan.flattenOffset();
          const rawX = currentPos.current.x + gestureState.dx;
          const rawY = currentPos.current.y + gestureState.dy;

          // Magnetic stick: cannot stay in the center — snaps to left or right wall!
          let targetX: number;
          if (gestureState.vx > 0.6) {
            targetX = rightDockX;
          } else if (gestureState.vx < -0.6) {
            targetX = leftDockX;
          } else {
            targetX = rawX + PALETTE_WIDTH / 2 < screenWidth / 2 ? leftDockX : rightDockX;
          }

          const minTotalY = insets.top + 50;
          const maxTotalY = Math.max(minTotalY, screenHeight - 280);
          const targetY = Math.min(Math.max(rawY, minTotalY), maxTotalY);

          currentPos.current = { x: targetX, y: targetY };
          triggerHaptic();

          Animated.spring(pan, {
            toValue: { x: targetX, y: targetY },
            useNativeDriver: true,
            bounciness: 8,
            speed: 15,
          }).start();
        },
        onPanResponderTerminate: () => {
          pan.flattenOffset();
          Animated.spring(pan, {
            toValue: currentPos.current,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        },
      }),
    [insets.top, screenWidth, screenHeight, leftDockX, rightDockX, pan]
  );

  const handleModeChange = (nextMode: ToolMode) => {
    triggerHaptic();
    onModeChange(nextMode);
  };

  const bgColor = isDark ? 'rgba(30, 27, 24, 0.92)' : 'rgba(255, 255, 255, 0.94)';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(140, 124, 112, 0.22)';
  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(140, 124, 112, 0.15)';
  const activeBg = isDark ? '#8C4522' : '#8C4522';
  const activeIconColor = '#FFFFFF';
  const inactiveIconColor = isDark ? '#D6C8B8' : '#6B5E54';

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderColor: borderColor,
          transform: pan.getTranslateTransform(),
        },
      ]}>
      <View style={styles.innerCard}>
        {/* ─── Drag Handle Indicator ─── */}
        <View style={styles.dragHandle}>
          <View style={[styles.dragPill, { backgroundColor: dividerColor }]} />
        </View>

        {/* ─── Mode Switch: Pan vs Select ─── */}
        <Pressable
          onPress={() => handleModeChange('pan')}
          hitSlop={6}
          style={[
            styles.toolBtn,
            mode === 'pan' && { backgroundColor: activeBg },
          ]}>
          <Hand
            size={19}
            color={mode === 'pan' ? activeIconColor : inactiveIconColor}
            strokeWidth={mode === 'pan' ? 2.4 : 1.9}
          />
        </Pressable>

        <Pressable
          onPress={() => handleModeChange('select')}
          hitSlop={6}
          style={[
            styles.toolBtn,
            mode === 'select' && { backgroundColor: activeBg },
          ]}>
          <MousePointer2
            size={19}
            color={mode === 'select' ? activeIconColor : inactiveIconColor}
            strokeWidth={mode === 'select' ? 2.4 : 1.9}
          />
        </Pressable>

        {/* ─── Lock Action (Active when an element is selected) ─── */}
        {hasSelectedElement && onToggleLockSelected && (
          <>
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />
            <Pressable
              onPress={() => {
                triggerHaptic();
                onToggleLockSelected();
              }}
              hitSlop={6}
              style={[
                styles.toolBtn,
                isSelectedLocked && { backgroundColor: '#F59E0B' },
              ]}>
              {isSelectedLocked ? (
                <Lock size={18} color="#FFFFFF" strokeWidth={2.4} />
              ) : (
                <LockOpen size={18} color={inactiveIconColor} strokeWidth={1.9} />
              )}
            </Pressable>
          </>
        )}

        <View style={[styles.divider, { backgroundColor: dividerColor }]} />

        {/* ─── Zoom Controls ─── */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            onZoomIn();
          }}
          hitSlop={6}
          style={styles.toolBtn}>
          <ZoomIn size={18} color={inactiveIconColor} strokeWidth={2} />
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            onZoomOut();
          }}
          hitSlop={6}
          style={styles.toolBtn}>
          <ZoomOut size={18} color={inactiveIconColor} strokeWidth={2} />
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
            onFitCanvas();
          }}
          hitSlop={6}
          style={styles.toolBtn}>
          <Maximize2 size={17} color={inactiveIconColor} strokeWidth={2} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 110,
    borderRadius: 20,
    borderWidth: 1,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 8,
  },
  innerCard: {
    alignItems: 'center',
    gap: 5,
  },
  toolBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 22,
    height: 1,
    marginVertical: 2,
  },
  dragHandle: {
    width: '100%',
    paddingTop: 3,
    paddingBottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragPill: {
    width: 16,
    height: 3.5,
    borderRadius: 2,
  },
});
