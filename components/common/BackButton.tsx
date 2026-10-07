import React from 'react';
import { TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

export interface BackButtonProps {
  onPress?: () => void;
  color?: string; // default: #1C120C (espresso)
  size?: number; // default: 20
  strokeWidth?: number; // default: 2.4
  style?: StyleProp<ViewStyle>;
  className?: string;
  fallbackRoute?: string;
}

export function BackButton({
  onPress,
  color = '#1C120C',
  size = 20,
  strokeWidth = 2.4,
  style,
  className,
  fallbackRoute = '/(tabs)',
}: BackButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackRoute as any);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      className={`h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-white shadow-xs active:scale-95 active:bg-champagne ${className || ''}`}
      style={style}>
      <ArrowLeft size={size} color={color} strokeWidth={strokeWidth} />
    </TouchableOpacity>
  );
}
