import React from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { Skeleton } from './Skeleton';

export function FarmLayoutsSkeleton() {
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor((width - 40 - 12) / 2);

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}>
      {/* ─── Farm Estate Section Skeleton ─── */}
      <View className="mb-2.5 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Skeleton width={18} height={18} borderRadius={4} />
          <Skeleton width={110} height={18} borderRadius={6} />
        </View>
        <Skeleton width={120} height={14} borderRadius={4} />
      </View>

      {/* Estate Card Skeleton */}
      <View className="overflow-hidden rounded-[26px] border border-cognac/15 bg-white p-3.5 shadow-sm shadow-espresso/5">
        <View className="mb-2.5 flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center gap-2">
            <Skeleton width="45%" height={18} borderRadius={6} />
            <Skeleton width={75} height={20} borderRadius={10} />
          </View>
          <Skeleton width={55} height={16} borderRadius={8} />
        </View>

        {/* 3D Estate Preview Placeholder */}
        <View className="items-center justify-center overflow-hidden rounded-2xl bg-champagne/60 p-2">
          <Skeleton width="100%" height={160} borderRadius={16} />
        </View>

        {/* Estate Footer */}
        <View className="mt-3 flex-row items-center justify-between border-t border-black/5 pt-2">
          <Skeleton width="40%" height={14} borderRadius={4} />
          <Skeleton width={70} height={18} borderRadius={10} />
        </View>
      </View>

      {/* ─── Divider Skeleton ─── */}
      <View className="my-6 flex-row items-center gap-3">
        <View className="h-[1px] flex-1 bg-taupe/20" />
        <View className="h-1.5 w-1.5 rounded-full bg-taupe/30" />
        <View className="h-[1px] flex-1 bg-taupe/20" />
      </View>

      {/* ─── Farm Area Section Header Skeleton ─── */}
      <View className="mb-3.5 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Skeleton width={18} height={18} borderRadius={4} />
          <Skeleton width={90} height={18} borderRadius={6} />
          <Skeleton width={32} height={18} borderRadius={10} />
        </View>
        <Skeleton width={110} height={14} borderRadius={4} />
      </View>

      {/* ─── 2-Column Farm Area Cards Grid Skeleton ─── */}
      <View className="flex-row flex-wrap justify-between gap-y-4">
        {[0, 1, 2, 3].map((key) => (
          <View
            key={key}
            style={{ width: cardWidth }}
            className="overflow-hidden rounded-[26px] border border-cognac/15 bg-white p-3.5 shadow-sm shadow-espresso/5">
            {/* Card Header */}
            <View className="mb-2 flex-row items-center justify-between">
              <Skeleton width="60%" height={16} borderRadius={6} />
              <Skeleton width={24} height={24} borderRadius={12} />
            </View>

            {/* 3D Plot Layout Preview Placeholder */}
            <View className="items-center justify-center overflow-hidden rounded-2xl bg-champagne/60 py-1">
              <Skeleton width="100%" height={135} borderRadius={14} />
            </View>

            {/* Card Footer */}
            <View className="mt-3 flex-row items-center justify-between border-t border-black/5 pt-2">
              <Skeleton width="50%" height={12} borderRadius={4} />
              <Skeleton width={35} height={12} borderRadius={4} />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
