/**
 * Farm Layout Designer — Empty State
 *
 * Friendly guidance shown when the designer has no plots yet.
 */

import { View, Text } from 'react-native';

export function EmptyState() {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
      }}
      pointerEvents="none"
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: 'rgba(122, 62, 32, 0.12)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <Text style={{ fontSize: 32 }}>🌱</Text>
      </View>

      <Text
        style={{
          fontSize: 18,
          fontWeight: '800',
          color: '#1C120C',
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        Design your farm layout
      </Text>

      <Text
        style={{
          fontSize: 14,
          color: '#8C7C70',
          textAlign: 'center',
          lineHeight: 20,
        }}
      >
        Tap the{' '}
        <Text style={{ fontWeight: '800', color: '#8C4522' }}>＋ Add Plot</Text> button below
        to start placing plots on your farm. You can drag, resize, and arrange them however you like.
      </Text>
    </View>
  );
}
