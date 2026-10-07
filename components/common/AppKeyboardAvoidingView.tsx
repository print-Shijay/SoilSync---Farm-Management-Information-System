import React from 'react';
import { KeyboardAvoidingView as ControllerKAV } from 'react-native-keyboard-controller';
import { Platform, StyleProp, ViewStyle, ViewProps } from 'react-native';

export interface AppKeyboardAvoidingViewProps extends ViewProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  behavior?: 'padding' | 'height' | 'position' | 'translate-with-padding';
  contentContainerStyle?: StyleProp<ViewStyle>;
  enabled?: boolean;
  keyboardVerticalOffset?: number;
}

/**
 * AppKeyboardAvoidingView
 * 
 * Powered by react-native-keyboard-controller to provide frame-perfect, native-synchronized
 * keyboard avoidance for all modals and screens across both iOS and Android.
 * 
 * Permanently solves:
 * 1. The floating gap between modal and keyboard on Android that only resolved after typing.
 * 2. Soft keyboard overlapping/covering input fields and action buttons.
 * 3. Layout snapping and frame calculation mismatches with Android immersive mode.
 */
export function AppKeyboardAvoidingView({
  behavior = 'padding',
  style,
  children,
  ...props
}: AppKeyboardAvoidingViewProps) {
  // react-native-keyboard-controller handles 'padding' natively and flawlessly on both iOS and Android.
  // If 'height' is passed for Android, normalize to 'padding' to prevent the initial frame measurement gap.
  const resolvedBehavior =
    behavior === 'height' && Platform.OS === 'android' ? 'padding' : behavior;

  return (
    <ControllerKAV
      behavior={resolvedBehavior}
      style={style}
      {...props}
    >
      {children}
    </ControllerKAV>
  );
}

export { AppKeyboardAvoidingView as KeyboardAvoidingView };
export default AppKeyboardAvoidingView;
