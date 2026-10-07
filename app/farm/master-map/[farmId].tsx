/**
 * Farm Master Map — Dedicated 2D Map View Page
 *
 * Provides a full-screen, high-resolution interactive 2D top-down view
 * of the farm or master estate.
 */

import { View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MasterMap2DViewer } from '../../../modules/farm-layout-designer';

export default function MasterMapScreen() {
  const params = useLocalSearchParams();
  const farmId = Array.isArray(params.farmId) ? params.farmId[0] : params.farmId;

  if (!farmId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF8F4' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#2A1610' }}>
          Farm ID is missing.
        </Text>
      </View>
    );
  }

  return (
    <MasterMap2DViewer
      farmId={farmId}
      onBack={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(`/farm/${farmId}`);
        }
      }}
      onEditLayout={() => {
        router.push(`/farm/layout-designer/${farmId}`);
      }}
    />
  );
}
