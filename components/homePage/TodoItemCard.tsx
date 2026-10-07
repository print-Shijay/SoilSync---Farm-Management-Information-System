import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Pencil, Check, CalendarDays, Leaf } from '../../components/Icons';
import { useAccessibility } from '../../lib/accessibility';

export type TodoItemData = {
  id: string;
  title: string;
  notes: string | null;
  start_date: string | null;
  due_date: string | null;
  is_completed: boolean;
  progress?: number;
  farm_id: string;
};

type TodoItemCardProps = {
  todo: TodoItemData;
  farmName?: string;
  status: 'active' | 'completed' | 'late';
  showFarmName: boolean;
  onToggleComplete: () => void;
  onEdit?: () => void;
  onPress?: () => void;
};

export function TodoItemCard({
  todo,
  farmName,
  status,
  showFarmName,
  onToggleComplete,
  onEdit,
  onPress,
}: TodoItemCardProps) {
  const { isGloveMode, isHighContrast, isColorblindSafe, fontScale, triggerHaptic } =
    useAccessibility();

  const isLate = status === 'late';
  const isCompleted = todo.is_completed;

  // Linear Date Format
  const dateFormatted = todo.due_date
    ? `Due ${todo.due_date}`
    : todo.start_date
      ? `Start ${todo.start_date}`
      : null;

  return (
    <TouchableOpacity
      onPress={() => {
        triggerHaptic('selection');
        onPress?.();
      }}
      disabled={!onPress}
      activeOpacity={0.8}
      style={[
        styles.card,
        isLate ? styles.cardLate : isCompleted ? styles.cardCompleted : styles.cardDefault,
        isGloveMode && { minHeight: 74 },
        isHighContrast && { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' },
      ]}>
      {/* Linear Left Accent Bar */}
      <View
        style={[
          styles.accentBar,
          isLate
            ? styles.accentBarLate
            : isCompleted
              ? styles.accentBarCompleted
              : styles.accentBarDefault,
          isHighContrast && {
            width: 6,
            backgroundColor: isLate ? '#DC2626' : isCompleted ? '#16A34A' : '#000000',
          },
        ]}
      />

      <View style={[styles.cardBody, isGloveMode && { paddingVertical: 14 }]}>
        {/* Row 1: Status Icon + Title + Priority/Late Badge */}
        <View style={styles.topRow}>
          {/* Linear Check Box */}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              triggerHaptic('success');
              onToggleComplete();
            }}
            hitSlop={
              isGloveMode
                ? { top: 18, bottom: 18, left: 18, right: 18 }
                : { top: 10, bottom: 10, left: 10, right: 10 }
            }
            activeOpacity={0.7}
            style={[
              styles.checkbox,
              isGloveMode && { width: 28, height: 28, borderRadius: 8 },
              isCompleted
                ? styles.checkboxCompleted
                : isLate
                  ? styles.checkboxLate
                  : styles.checkboxDefault,
              isHighContrast && { borderWidth: 2.5, borderColor: '#000000' },
            ]}>
            {isCompleted ? (
              <Check size={isGloveMode ? 18 : 12} color="#FFFFFF" strokeWidth={3.2} />
            ) : null}
          </TouchableOpacity>

          <Text
            numberOfLines={1}
            style={[
              styles.title,
              isCompleted
                ? styles.titleCompleted
                : isLate
                  ? styles.titleLate
                  : styles.titleDefault,
              { fontSize: 14 * fontScale },
              isHighContrast && { color: '#000000', fontWeight: '900' },
            ]}>
            {todo.title}
          </Text>

          {/* Priority / Status Tag */}
          <View
            style={[
              styles.statusTag,
              isLate
                ? styles.statusTagLate
                : isCompleted
                  ? styles.statusTagCompleted
                  : styles.statusTagActive,
              isHighContrast && { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' },
            ]}>
            <Text
              style={[
                styles.statusTagText,
                isLate
                  ? styles.statusTagTextLate
                  : isCompleted
                    ? styles.statusTagTextCompleted
                    : styles.statusTagTextActive,
                { fontSize: 10 * fontScale },
                isHighContrast && { fontWeight: '900', color: '#000000' },
              ]}>
              {isLate
                ? isColorblindSafe
                  ? '⚠ OVERDUE'
                  : 'OVERDUE'
                : isCompleted
                  ? isColorblindSafe
                    ? '✓ DONE'
                    : 'DONE'
                  : typeof todo.progress === 'number' && todo.progress > 0
                    ? `● ${todo.progress}%`
                    : isColorblindSafe
                      ? '● IN PROGRESS'
                      : 'IN PROGRESS'}
            </Text>
          </View>
        </View>

        {/* Mini progress bar if in-progress */}
        {!isCompleted && typeof todo.progress === 'number' && todo.progress > 0 ? (
          <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.06)', marginTop: 8, marginBottom: 2, overflow: 'hidden' }}>
            <View
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, todo.progress))}%`,
                backgroundColor: todo.progress >= 75 ? '#059669' : '#8C4522',
                borderRadius: 2,
              }}
            />
          </View>
        ) : null}

        {/* Notes (if any) */}
        {todo.notes ? (
          <Text
            numberOfLines={2}
            style={[
              styles.notesText,
              isCompleted && styles.textMuted,
              { fontSize: 12.5 * fontScale },
              isHighContrast && { color: '#111111', fontWeight: '700' },
            ]}>
            {todo.notes}
          </Text>
        ) : null}

        {/* Row 2: Linear Metadata Badges & Quick Action */}
        <View style={styles.bottomRow}>
          <View style={styles.badgeGroup}>
            {showFarmName && farmName ? (
              <View
                style={[
                  styles.linearChip,
                  isHighContrast && { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' },
                ]}>
                <Leaf
                  size={isGloveMode ? 12 : 10}
                  color={isHighContrast ? '#000000' : '#8C4522'}
                  style={{ marginRight: 4 }}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.linearChipText,
                    { fontSize: 11 * fontScale },
                    isHighContrast && { color: '#000000', fontWeight: '800' },
                  ]}>
                  {farmName}
                </Text>
              </View>
            ) : null}

            {dateFormatted ? (
              <View
                style={[
                  styles.linearChip,
                  isLate && styles.linearChipLate,
                  isHighContrast && { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' },
                ]}>
                <CalendarDays
                  size={isGloveMode ? 12 : 10}
                  color={isHighContrast ? '#000000' : isLate ? '#DC2626' : '#64748B'}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.linearChipText,
                    isLate && styles.linearChipTextLate,
                    { fontSize: 11 * fontScale },
                    isHighContrast && { color: '#000000', fontWeight: '800' },
                  ]}>
                  {dateFormatted}
                </Text>
              </View>
            ) : null}
          </View>

          {onEdit ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                triggerHaptic('selection');
                onEdit();
              }}
              hitSlop={
                isGloveMode
                  ? { top: 16, bottom: 16, left: 16, right: 16 }
                  : { top: 8, bottom: 8, left: 8, right: 8 }
              }
              activeOpacity={0.7}
              style={[
                styles.editBtn,
                isGloveMode && { minWidth: 36, minHeight: 36, borderRadius: 12, padding: 8 },
                isHighContrast && { borderWidth: 1.5, borderColor: '#000000' },
              ]}>
              <Pencil size={isGloveMode ? 15 : 13} color={isHighContrast ? '#000000' : '#8C4522'} strokeWidth={2.4} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
    position: 'relative',
  },
  cardDefault: {
    borderColor: '#E2E8F0',
  },
  cardLate: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  cardCompleted: {
    borderColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
    opacity: 0.82,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  accentBarDefault: {
    backgroundColor: '#8C4522',
  },
  accentBarLate: {
    backgroundColor: '#EF4444',
  },
  accentBarCompleted: {
    backgroundColor: '#CBD5E1',
  },
  cardBody: {
    paddingLeft: 16,
    paddingRight: 14,
    paddingVertical: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxDefault: {
    borderWidth: 1.5,
    borderColor: '#8C4522',
    backgroundColor: '#FFFFFF',
  },
  checkboxLate: {
    borderWidth: 1.5,
    borderColor: '#EF4444',
    backgroundColor: '#FFFFFF',
  },
  checkboxCompleted: {
    backgroundColor: '#8C4522',
    borderWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
    flex: 1,
  },
  titleDefault: {
    color: '#1C120C',
  },
  titleLate: {
    color: '#991B1B',
  },
  titleCompleted: {
    color: '#8C7C70',
    textDecorationLine: 'line-through',
  },
  statusTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusTagActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  statusTagLate: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusTagCompleted: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  statusTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusTagTextActive: {
    color: '#166534',
  },
  statusTagTextLate: {
    color: '#991B1B',
  },
  statusTagTextCompleted: {
    color: '#8C7C70',
  },
  notesText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8C7C70',
    marginTop: 6,
    marginLeft: 30,
  },
  textMuted: {
    color: '#8C7C70',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginLeft: 30,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  linearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBF8F4',
    borderWidth: 1,
    borderColor: 'rgba(140, 124, 112, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  linearChipLate: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  linearChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1C120C',
  },
  linearChipTextLate: {
    color: '#DC2626',
  },
  editBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(140, 69, 34, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
