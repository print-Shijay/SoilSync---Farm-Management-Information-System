import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from './Skeleton';

export function FarmListItemSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="60%" height={18} borderRadius={6} />
          <Skeleton width="40%" height={12} borderRadius={4} />
        </View>

        <Skeleton width={28} height={28} borderRadius={14} />
      </View>

      <View style={styles.bottomRow}>
        <View style={{ gap: 4 }}>
          <Skeleton width={32} height={10} borderRadius={3} />
          <Skeleton width={50} height={14} borderRadius={4} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Skeleton width={40} height={10} borderRadius={3} />
          <Skeleton width={60} height={14} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

export function FarmListSkeletonGroup({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 14 }}>
      {Array.from({ length: count }).map((_, index) => (
        <FarmListItemSkeleton key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 20,
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  bottomRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
