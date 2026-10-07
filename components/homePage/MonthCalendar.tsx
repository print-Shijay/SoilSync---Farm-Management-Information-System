import { Pressable, Text, View } from 'react-native';
import { useAccessibility } from '../../lib/accessibility';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type CalendarCell = {
  dateKey: string;
  label: string;
  key: string;
};

type MonthCalendarProps = {
  monthLabel: string;
  cells: (CalendarCell | null)[];
  selectedDateKey: string;
  todayDateKey: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (dateKey: string) => void;
};

export function MonthCalendar({
  monthLabel,
  cells,
  selectedDateKey,
  todayDateKey,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: MonthCalendarProps) {
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();

  const handleSelectDate = (dateKey: string) => {
    triggerHaptic('selection');
    onSelectDate(dateKey);
  };

  const handlePrev = () => {
    triggerHaptic('light');
    onPrevMonth();
  };

  const handleNext = () => {
    triggerHaptic('light');
    onNextMonth();
  };

  const cellDimensionClass = isGloveMode ? 'h-11 w-11' : 'h-9 w-9';

  return (
    <View
      className="mt-5 rounded-[28px] border border-cognac/15 bg-white p-5 shadow-sm shadow-espresso/5"
      style={
        isHighContrast
          ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
          : undefined
      }>
      {/* Month Header: Schedule badge & Month Label */}
      <View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#729E3B' }} />
          <Text
            style={{ fontSize: 11 * fontScale }}
            className="font-extrabold uppercase tracking-[0.25em] text-cognac">
            Schedule
          </Text>
        </View>
        <Text
          style={{
            fontSize: 22 * fontScale,
            color: isHighContrast ? '#000000' : '#2D231E',
            fontWeight: isHighContrast ? '900' : '800',
          }}
          className="mt-1 tracking-tight">
          {monthLabel}
        </Text>
      </View>

      {/* Month Navigation Row: Prev and Next buttons in the next row */}
      <View className="mt-3 flex-row items-center justify-between">
        <Pressable
          className={`flex-row items-center justify-center rounded-full border border-cognac/20 bg-white shadow-xs active:scale-95 ${
            isGloveMode ? 'min-h-[44px] px-5 py-2.5' : 'px-4 py-2'
          }`}
          style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000' } : undefined}
          onPress={handlePrev}>
          <Text
            style={{
              fontSize: 12 * fontScale,
              color: isHighContrast ? '#000000' : '#8C4522',
              fontWeight: '800',
            }}>
            ‹ Prev
          </Text>
        </Pressable>
        <Pressable
          className={`flex-row items-center justify-center rounded-full border border-cognac/20 bg-white shadow-xs active:scale-95 ${
            isGloveMode ? 'min-h-[44px] px-5 py-2.5' : 'px-4 py-2'
          }`}
          style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000' } : undefined}
          onPress={handleNext}>
          <Text
            style={{
              fontSize: 12 * fontScale,
              color: isHighContrast ? '#000000' : '#8C4522',
              fontWeight: '800',
            }}>
            Next ›
          </Text>
        </Pressable>
      </View>

      {/* Weekday Header */}
      <View
        className="mt-4 flex-row border-b border-black/5 pb-2"
        style={isHighContrast ? { borderBottomColor: '#000000', borderBottomWidth: 1.5 } : undefined}>
        {WEEKDAYS.map((weekday, index) => (
          <View key={`weekday-${index}`} className="flex-1 items-center justify-center">
            <Text
              style={{
                fontSize: 11 * fontScale,
                color: isHighContrast ? '#000000' : '#8C7C70',
                fontWeight: isHighContrast ? '900' : '700',
              }}
              className="uppercase tracking-wider">
              {weekday}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid (Strict 7-column rows) */}
      <View className="mt-2">
        {Array.from({ length: Math.ceil(cells.length / 7) }).map((_, rowIndex) => {
          const rowCells = cells.slice(rowIndex * 7, rowIndex * 7 + 7);
          return (
            <View key={`row-${rowIndex}`} className="flex-row items-center py-1">
              {rowCells.map((cell, colIndex) => (
                <View
                  key={cell?.key || `empty-${rowIndex}-${colIndex}`}
                  className="flex-1 items-center justify-center p-0.5">
                  {cell ? (
                    <Pressable
                      onPress={() => handleSelectDate(cell.dateKey)}
                      hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                      className={`${cellDimensionClass} items-center justify-center rounded-full active:scale-90 ${
                        selectedDateKey === cell.dateKey
                          ? isHighContrast
                            ? 'bg-black'
                            : 'bg-cognac shadow-sm shadow-cognac/40'
                          : todayDateKey === cell.dateKey
                            ? isHighContrast
                              ? 'border-2 border-black bg-black/10'
                              : 'border border-cognac/40 bg-cognac/10'
                            : 'bg-transparent'
                      }`}>
                      <Text
                        style={{
                          fontSize: 14 * fontScale,
                          color:
                            selectedDateKey === cell.dateKey
                              ? '#FFFFFF'
                              : isHighContrast
                                ? '#000000'
                                : todayDateKey === cell.dateKey
                                  ? '#8C4522'
                                  : '#2D231E',
                          fontWeight:
                            selectedDateKey === cell.dateKey
                              ? '900'
                              : isHighContrast
                                ? '900'
                                : todayDateKey === cell.dateKey
                                  ? '800'
                                  : '600',
                        }}>
                        {cell.label}
                      </Text>
                      {todayDateKey === cell.dateKey && selectedDateKey !== cell.dateKey ? (
                        <View
                          className="absolute bottom-1 h-1 w-1 rounded-full"
                          style={{ backgroundColor: isHighContrast ? '#000000' : '#8C4522' }}
                        />
                      ) : null}
                    </Pressable>
                  ) : (
                    <View className={cellDimensionClass} />
                  )}
                </View>
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}
