import React from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  GestureResponderEvent,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useAccessibility, HapticType } from '../../../lib/accessibility';

export interface AccessibleButtonProps extends TouchableOpacityProps {
  hapticType?: HapticType;
  /** Disable automatic haptic pulse on press for this button */
  disableHaptic?: boolean;
}

/**
 * AccessibleButton is a drop-in replacement for TouchableOpacity.
 * In Glove Mode, it expands minimum touch dimensions (52px+) and hitSlop for gloved/wet fingers.
 * Automatically triggers tactile feedback on tap when haptics are enabled.
 * In Outdoor High-Contrast Mode, it enhances contrast and borders.
 */
export const AccessibleButton: React.FC<AccessibleButtonProps> = ({
  children,
  onPress,
  style,
  hapticType = 'selection',
  disableHaptic = false,
  hitSlop,
  activeOpacity = 0.8,
  ...props
}) => {
  const { isGloveMode, isHighContrast, triggerHaptic } = useAccessibility();

  const handlePress = (e: GestureResponderEvent) => {
    if (!disableHaptic) {
      triggerHaptic(hapticType);
    }
    onPress?.(e);
  };

  const flatStyle = (StyleSheet.flatten(style) || {}) as ViewStyle;

  // Compute glove mode styles: increase touch target and padding
  const gloveStyle: ViewStyle = isGloveMode
    ? {
        minHeight: Math.max(Number(flatStyle.minHeight) || 0, 52),
        minWidth: Math.max(Number(flatStyle.minWidth) || 0, 52),
        paddingVertical: Math.max(Number(flatStyle.paddingVertical ?? flatStyle.padding) || 0, 14),
        paddingHorizontal: Math.max(Number(flatStyle.paddingHorizontal ?? flatStyle.padding) || 0, 18),
      }
    : {};

  // High contrast border boost
  const contrastStyle: ViewStyle =
    isHighContrast && flatStyle.borderWidth
      ? {
          borderWidth: Math.max(flatStyle.borderWidth, 2),
          borderColor: flatStyle.borderColor || '#000000',
        }
      : {};

  const resolvedHitSlop =
    hitSlop ??
    (isGloveMode
      ? { top: 12, bottom: 12, left: 12, right: 12 }
      : { top: 6, bottom: 6, left: 6, right: 6 });

  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={resolvedHitSlop}
      activeOpacity={activeOpacity}
      style={[flatStyle, gloveStyle, contrastStyle]}
      {...props}>
      {children}
    </TouchableOpacity>
  );
};
