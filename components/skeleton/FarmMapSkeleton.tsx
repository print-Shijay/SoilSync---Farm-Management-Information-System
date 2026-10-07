import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton } from './Skeleton';

export type FarmMapSkeletonProps = {
  title?: string;
};

export function FarmMapSkeleton({ title }: FarmMapSkeletonProps = {}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  return (
    <View className="flex-1 bg-champagne">
      {/* ─── Apple Navigation Header Skeleton ─── */}
      <View
        style={{ paddingTop: Math.max(insets.top, 14) }}
        className="border-b border-black/5 bg-white/95 px-4 pb-3 shadow-xs z-30">
        <View className="flex-row items-center justify-between">
          <Skeleton width={36} height={36} borderRadius={18} />

          <View className="flex-1 items-center px-4">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Skeleton width={8} height={8} borderRadius={4} />
              <Skeleton width={140} height={16} borderRadius={6} />
            </View>
            <Skeleton width={190} height={12} borderRadius={4} />
          </View>

          <View className="flex-row items-center gap-2">
            <Skeleton width={36} height={36} borderRadius={18} />
            <Skeleton width={62} height={34} borderRadius={17} />
          </View>
        </View>

        {/* Filter Pills Skeleton */}
        <View className="mt-3 flex-row items-center justify-center gap-2">
          <Skeleton width={70} height={28} borderRadius={14} />
          <Skeleton width={70} height={28} borderRadius={14} />
          <Skeleton width={70} height={28} borderRadius={14} />
          <Skeleton width={80} height={28} borderRadius={14} />
        </View>
      </View>

      {/* ─── Interactive Canvas Terrain Skeleton ─── */}
      <View className="flex-1 items-center justify-center p-6">
        {/* Terrain Board */}
        <View
          style={{
            width: Math.min(screenWidth - 48, 380),
            height: Math.min(screenHeight - 280, 420),
            borderRadius: 24,
            borderColor: '#D7C4B7',
            borderWidth: 2,
            backgroundColor: '#F5EFE6',
            padding: 16,
            justifyContent: 'space-between',
          }}>
          {/* Mock Zone 1 with plots */}
          <View
            style={{
              width: '100%',
              height: '45%',
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: '#E2D8CC',
              backgroundColor: '#ECE2D5',
              padding: 10,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'space-around',
            }}>
            <Skeleton width="45%" height="42%" borderRadius={8} />
            <Skeleton width="45%" height="42%" borderRadius={8} />
            <Skeleton width="45%" height="42%" borderRadius={8} />
            <Skeleton width="45%" height="42%" borderRadius={8} />
          </View>

          {/* Mock Facilities & Zone 2 */}
          <View className="flex-row items-center justify-between" style={{ height: '48%' }}>
            {/* Facility Card Skeleton */}
            <View
              style={{
                width: '38%',
                height: '100%',
                borderRadius: 16,
                backgroundColor: '#ECE2D5',
                borderWidth: 1.5,
                borderColor: '#E2D8CC',
                padding: 8,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}>
              <Skeleton width={28} height={28} borderRadius={8} />
              <Skeleton width="70%" height={12} borderRadius={4} />
              <Skeleton width="50%" height={10} borderRadius={3} />
            </View>

            {/* Zone 2 Beds Skeleton */}
            <View
              style={{
                width: '58%',
                height: '100%',
                borderRadius: 16,
                backgroundColor: '#ECE2D5',
                borderWidth: 1.5,
                borderColor: '#E2D8CC',
                padding: 10,
                flexDirection: 'column',
                justifyContent: 'space-around',
              }}>
              <Skeleton width="100%" height="26%" borderRadius={6} />
              <Skeleton width="100%" height="26%" borderRadius={6} />
              <Skeleton width="100%" height="26%" borderRadius={6} />
            </View>
          </View>
        </View>
      </View>

      {/* ─── Floating Left Tool Palette Skeleton ─── */}
      <View
        style={{
          position: 'absolute',
          left: 12,
          top: (screenHeight - 240) / 2,
          width: 44,
          height: 220,
          borderRadius: 22,
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.06)',
          alignItems: 'center',
          justifyContent: 'space-evenly',
          paddingVertical: 8,
        }}>
        <Skeleton width={30} height={30} borderRadius={15} />
        <Skeleton width={30} height={30} borderRadius={15} />
        <Skeleton width={30} height={30} borderRadius={15} />
        <Skeleton width={30} height={30} borderRadius={15} />
      </View>

      {/* ─── Bottom Floating Action Dock Skeleton ─── */}
      <View
        style={{
          position: 'absolute',
          bottom: Math.max(insets.bottom, 16) + 8,
          left: 20,
          right: 20,
          height: 60,
          borderRadius: 30,
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.06)',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-evenly',
          paddingHorizontal: 16,
        }}>
        <Skeleton width={75} height={32} borderRadius={16} />
        <Skeleton width={85} height={32} borderRadius={16} />
        <Skeleton width={80} height={32} borderRadius={16} />
      </View>
    </View>
  );
}
