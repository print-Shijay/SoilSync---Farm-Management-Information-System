/**
 * Farm Layout Designer — Route Page
 *
 * Thin route wrapper for the layout designer.
 * All logic lives in modules/farm-layout-designer.
 */

import { ActivityIndicator, View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DesignerCanvas } from '../../../modules/farm-layout-designer';
import { useEffectiveRole } from '../../../lib/hooks/useEffectiveRole';

export default function LayoutDesignerScreen() {
  const params = useLocalSearchParams();
  const farmId = Array.isArray(params.farmId) ? params.farmId[0] : params.farmId;
  const { permissions, loading } = useEffectiveRole({ farmId });

  if (!farmId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF8F4' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#2A1610' }}>
          Farm ID is missing.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF8F4' }}>
        <ActivityIndicator size="large" color="#8C4522" />
      </View>
    );
  }

  return (
    <DesignerCanvas
      farmId={farmId}
      readOnly={!permissions.canEditFarmLayout}
      onSaveComplete={() => {
        router.replace(`/farm/${farmId}`);
      }}
      onBack={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(`/farm/${farmId}`);
        }
      }}
    />
  );
}
