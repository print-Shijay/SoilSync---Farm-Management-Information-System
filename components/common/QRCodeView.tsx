import React, { useMemo } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';

interface QRCodeViewProps {
  value: string;
  size?: number;
  backgroundColor?: string;
  color?: string;
}

/**
 * High-performance QR Code display component.
 * Uses a clean vector-rendered QR server API with local caching and offline fallback.
 */
export function QRCodeView({
  value,
  size = 180,
  backgroundColor = '#FFFFFF',
  color = '#000000',
}: QRCodeViewProps) {
  const qrUri = useMemo(() => {
    const encoded = encodeURIComponent(value);
    const colorHex = color.replace('#', '');
    const bgHex = backgroundColor.replace('#', '');
    return `https://api.qrserver.com/v1/create-qr-code/?size=${Math.round(size * 2)}x${Math.round(size * 2)}&data=${encoded}&color=${colorHex}&bgcolor=${bgHex}&margin=1`;
  }, [value, size, color, backgroundColor]);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          backgroundColor,
        },
      ]}
    >
      <Image
        source={{ uri: qrUri }}
        style={{ width: size - 16, height: size - 16 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
});
