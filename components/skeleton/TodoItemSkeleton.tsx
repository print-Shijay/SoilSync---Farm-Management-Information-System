import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from './Skeleton';

export function TodoItemSkeleton() {
  return (
    <View style={styles.card}>
      {/* Accent Bar Placeholder */}
      <View style={styles.accentBar} />

      <View style={styles.cardBody}>
        {/* Top Row: Checkbox + Title + Status Pill */}
        <View style={styles.topRow}>
          <Skeleton width={20} height={20} borderRadius={6} style={styles.checkboxSkeleton} />
          <Skeleton width="55%" height={15} borderRadius={6} />
          <Skeleton width={50} height={18} borderRadius={12} style={styles.pillSkeleton} />
        </View>

        {/* Bottom Row: Date & Extra info */}
        <View style={styles.bottomRow}>
          <Skeleton width="35%" height={12} borderRadius={4} />
          <Skeleton width="20%" height={12} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

export function TodoItemsSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, index) => (
        <TodoItemSkeleton key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    gap: 8,
  },
  card: {
    position: 'relative',
    marginBottom: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFEAE4',
    overflow: 'hidden',
    shadowColor: '#2C1810',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#D7C4B7',
  },
  cardBody: {
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 16,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxSkeleton: {
    marginRight: 10,
  },
  pillSkeleton: {
    marginLeft: 'auto',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 30,
  },
});
