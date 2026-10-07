/**
 * Farm Estate Layout — Dedicated Route Page
 *
 * Full-screen Clash of Clans style freeform canvas for arranging
 * farm parcels and central estate facilities.
 */

import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { EstateDesignerCanvas } from '../../../modules/farm-layout-designer';

export default function EstateScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#1E1B18' }}>
      <EstateDesignerCanvas
        onBack={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/farm/layouts');
          }
        }}
        onOpenFacilities={(estateId) => {
          router.push(`/farm/facilities/${estateId}?fromEstate=true`);
        }}
      />
    </View>
  );
}
