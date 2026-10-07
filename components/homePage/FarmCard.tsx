import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { useAccessibility } from '../../lib/accessibility';

export type FarmCardData = {
  id: string;
  farm_name: string;
  location?: string | null;
  area_sqm?: number | null;
};

type FarmCardProps = {
  farm: FarmCardData;
  active: boolean;
  onPress: () => void;
};

export function FarmCard({ farm, active, onPress }: FarmCardProps) {
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();

  const handlePress = () => {
    triggerHaptic('selection');
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[
        styles.card,
        active ? styles.cardActive : styles.cardInactive,
        isGloveMode && { paddingVertical: 14, paddingHorizontal: 16, minHeight: 68 },
        isHighContrast && {
          borderWidth: 2,
          borderColor: '#000000',
          backgroundColor: '#FFFFFF',
        },
      ]}>
      <View style={styles.contentRow}>
        <View style={styles.leftCol}>
          <View
            style={[
              styles.iconContainer,
              active ? styles.iconActive : styles.iconInactive,
              isGloveMode && { padding: 9, borderRadius: 16 },
              isHighContrast && { borderWidth: 1, borderColor: '#000000' },
            ]}>
            <MapPin
              size={isGloveMode ? 18 : 16}
              color={active ? '#ffffff' : isHighContrast ? '#000000' : '#8C4522'}
              strokeWidth={2.4}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.farmName,
                { fontSize: 14 * fontScale },
                isHighContrast && { color: '#000000', fontWeight: '900' },
              ]}
              numberOfLines={1}>
              {farm.farm_name}
            </Text>
            <View style={styles.locationRow}>
              <Text
                style={[
                  styles.locationText,
                  { fontSize: 11 * fontScale },
                  isHighContrast && { color: '#111111', fontWeight: '700' },
                ]}
                numberOfLines={1}>
                {(() => {
                  if (!farm.location) return 'No location';
                  try {
                    const parsed = JSON.parse(farm.location);
                    return parsed.address || farm.location;
                  } catch {
                    return farm.location;
                  }
                })()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.rightCol}>
          <Text
            style={[
              styles.areaText,
              { fontSize: 12 * fontScale },
              isHighContrast && { color: '#000000', fontWeight: '900' },
            ]}>
            {farm.area_sqm ? `${farm.area_sqm}m²` : '—'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginRight: 12,
    width: 230,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  cardActive: {
    borderColor: 'rgba(140, 69, 34, 0.4)',
    backgroundColor: '#ffffff',
    shadowColor: '#1C120C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardInactive: {
    borderColor: 'rgba(140, 69, 34, 0.12)',
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
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
  iconContainer: {
    marginRight: 10,
    borderRadius: 14,
    padding: 7,
  },
  iconActive: {
    backgroundColor: '#8C4522',
    shadowColor: '#8C4522',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  iconInactive: {
    backgroundColor: 'rgba(140, 69, 34, 0.08)',
  },
  farmName: {
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: -0.2,
    color: '#1C120C',
  },
  locationRow: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8C7C70',
  },
  rightCol: {
    marginLeft: 8,
    alignItems: 'flex-end',
  },
  areaText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8C4522',
  },
});
