import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from './Skeleton';

export function FarmCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.contentRow}>
        <View style={styles.leftCol}>
          {/* Icon Placeholder */}
          <Skeleton width={30} height={30} borderRadius={14} style={styles.iconSkeleton} />

          <View style={{ flex: 1, gap: 4 }}>
            {/* Farm Name */}
            <Skeleton width="75%" height={14} borderRadius={6} />
            {/* Location */}
            <Skeleton width="50%" height={11} borderRadius={4} />
          </View>
        </View>

        <View style={styles.rightCol}>
          {/* Area */}
          <Skeleton width={38} height={12} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

export function FarmCardsSkeletonList() {
  return (
    <View style={styles.horizontalList}>
      <FarmCardSkeleton />
      <FarmCardSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  horizontalList: {
    flexDirection: 'row',
    paddingRight: 20,
    paddingTop: 4,
    paddingBottom: 10,
  },
  card: {
    marginRight: 12,
    width: 230,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(140, 69, 34, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconSkeleton: {
    marginRight: 10,
  },
  rightCol: {
    marginLeft: 8,
  },
});
