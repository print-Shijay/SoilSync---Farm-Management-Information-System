import React from 'react';
import { View, Text, TouchableOpacity, Linking, Image, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react-native';

interface ForceUpdateGateProps {
  updateUrl: string;
  minVersionCode?: number;
  currentVersionCode?: number;
  releaseNotes?: string | null;
}

export function ForceUpdateGate({
  updateUrl,
  minVersionCode,
  currentVersionCode,
  releaseNotes,
}: ForceUpdateGateProps) {
  const handleUpdate = () => {
    if (updateUrl) {
      Linking.openURL(updateUrl).catch((err) => {
        console.error('Failed to open update URL:', err);
      });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-champagne justify-between px-6 py-8">
      <StatusBar barStyle="dark-content" backgroundColor="#FBF8F4" />

      {/* Top Section / Header */}
      <View className="items-center mt-6">
        <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/90 bg-white p-2 shadow-sm shadow-espresso/10 mb-5">
          <Image
            source={require('../assets/soilsync-icon.png')}
            className="h-full w-full rounded-2xl"
            resizeMode="contain"
          />
        </View>

        <View className="flex-row items-center bg-cognac/10 px-3.5 py-1 rounded-full border border-cognac/20 mb-3">
          <ShieldAlert color="#8C4522" size={14} strokeWidth={2.4} />
          <Text className="ml-1.5 text-xs font-bold uppercase tracking-wider text-cognac">
            Update Required
          </Text>
        </View>

        <Text className="text-2xl font-black text-espresso text-center tracking-tight">
          SoilSync Needs an Update
        </Text>

        <Text className="mt-3 text-center text-sm text-taupe leading-relaxed px-2">
          A newer version of SoilSync is required to ensure database synchronization, sensor telemetry stability, and account security.
        </Text>
      </View>

      {/* Middle Specs & Notes */}
      <View className="my-6 rounded-3xl border border-cognac/15 bg-white p-5 shadow-sm shadow-espresso/5">
        <Text className="text-xs font-bold uppercase tracking-wider text-taupe mb-3">
          Version Notice
        </Text>

        {currentVersionCode !== undefined && minVersionCode !== undefined && (
          <View className="flex-row justify-between border-b border-cognac/10 pb-2.5 mb-2.5">
            <Text className="text-xs text-taupe">Installed Build</Text>
            <Text className="text-xs font-semibold text-espresso">
              v{currentVersionCode} (Minimum required: v{minVersionCode})
            </Text>
          </View>
        )}

        <View className="mt-1">
          <Text className="text-xs text-taupe mb-1">Update Details</Text>
          <Text className="text-xs text-espresso leading-relaxed">
            {releaseNotes || 'Includes critical security enhancements and required cloud backend upgrades.'}
          </Text>
        </View>
      </View>

      {/* Bottom Action Button */}
      <View className="mb-4">
        <TouchableOpacity
          onPress={handleUpdate}
          activeOpacity={0.85}
          className="w-full flex-row items-center justify-center rounded-2xl bg-cognac py-4 shadow-md shadow-cognac/25 active:scale-[0.99]"
        >
          <Sparkles color="#ffffff" size={20} strokeWidth={2.2} />
          <Text className="ml-2 text-base font-bold text-white">
            Update on Google Play
          </Text>
        </TouchableOpacity>

        <Text className="mt-3 text-center text-[11px] text-taupe">
          Please update your app to continue accessing your farm records.
        </Text>
      </View>
    </SafeAreaView>
  );
}
