import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import { createFarm, getFarmsByUser, MAX_FARMS_PER_ACCOUNT } from '../../lib/db-operations';
import { LocationData, stringifyLocation, parseLocation } from '../../lib/location-utils';
import LocationPickerModal, { RecentLocationItem } from '../../components/LocationPickerModal';
import { MapPin, Clock, Check, AlertCircle, Sparkles } from 'lucide-react-native';
import { useAccessibility } from '../../lib/accessibility';

type FieldErrors = {
  farmName?: string;
  location?: string;
  areaSqm?: string;
  description?: string;
};

export default function AddFarmScreen() {
  const { user } = useAuth();
  const { fontScale, isGloveMode, isHighContrast, triggerHaptic } = useAccessibility();

  const [farmName, setFarmName] = useState('');
  const [locationObj, setLocationObj] = useState<LocationData | null>(null);
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [areaSqm, setAreaSqm] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [farmCount, setFarmCount] = useState<number>(0);
  const [checkingCount, setCheckingCount] = useState(true);
  const [recentLocations, setRecentLocations] = useState<RecentLocationItem[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});

  const hitSlop = isGloveMode
    ? { top: 12, bottom: 12, left: 12, right: 12 }
    : { top: 6, bottom: 6, left: 6, right: 6 };
  const gloveMinHeight = isGloveMode ? 52 : undefined;

  const fetchUserData = async () => {
    if (!user) return;
    try {
      setCheckingCount(true);
      const userFarms = await getFarmsByUser(user.id);
      setFarmCount(userFarms.length);

      // Extract top 3 unique recent farm locations for offline quick pick
      const recents: RecentLocationItem[] = [];
      const seenAddresses = new Set<string>();

      for (const farm of userFarms) {
        if (farm.location) {
          const parsed = parseLocation(farm.location);
          const addr = parsed.address?.trim();
          if (addr && !seenAddresses.has(addr.toLowerCase())) {
            seenAddresses.add(addr.toLowerCase());
            recents.push({
              farmName: farm.farm_name,
              location: parsed,
            });
            if (recents.length === 3) break;
          }
        }
      }
      setRecentLocations(recents);
    } catch (e) {
      console.error('Failed to fetch user farms data:', e);
    } finally {
      setCheckingCount(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void fetchUserData();
    }, [user])
  );

  const isMaxedOut = farmCount >= MAX_FARMS_PER_ACCOUNT;

  const validateForm = (): boolean => {
    const newErrors: FieldErrors = {};

    // 1. Farm Name (Required)
    const trimmedName = farmName.trim();
    if (!trimmedName) {
      newErrors.farmName = 'Farm name is required.';
    } else if (trimmedName.length < 2) {
      newErrors.farmName = 'Farm name must be at least 2 characters long.';
    } else if (trimmedName.length > 100) {
      newErrors.farmName = 'Farm name cannot exceed 100 characters.';
    }

    // 2. Location (Required)
    if (!locationObj || !locationObj.address || !locationObj.address.trim()) {
      newErrors.location = 'Location is required. Please pick a location.';
    }

    // 3. Area (Required)
    const trimmedArea = areaSqm.trim();
    if (!trimmedArea) {
      newErrors.areaSqm = 'Area is required.';
    } else {
      const parsedArea = Number(trimmedArea);
      if (isNaN(parsedArea) || parsedArea <= 0) {
        newErrors.areaSqm = 'Area must be a positive number greater than 0.';
      } else if (parsedArea > 1000000000) {
        newErrors.areaSqm = 'Area cannot exceed 1,000,000,000 sq meters.';
      }
    }

    // 4. Notes / Description (Optional)
    if (description.length > 3000) {
      newErrors.description = 'Description cannot exceed 3000 characters.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateFarm = async () => {
    if (!user) {
      return;
    }
    triggerHaptic('medium');

    if (isMaxedOut) {
      Alert.alert(
        'Limit Reached',
        `You have reached the maximum limit of ${MAX_FARMS_PER_ACCOUNT} farms per account.`
      );
      return;
    }

    if (!validateForm()) {
      triggerHaptic('warning');
      return;
    }

    try {
      setSaving(true);
      const locationString = locationObj ? stringifyLocation(locationObj) : undefined;
      const farmId = await createFarm(
        user.id,
        farmName.trim(),
        locationString,
        areaSqm.trim() ? Number(areaSqm.trim()) : undefined,
        description.trim() || undefined
      );
      triggerHaptic('success');
      Alert.alert('Farm created', 'Your farm has been saved.');
      router.push(`/farm/${farmId}`);
    } catch (error: any) {
      triggerHaptic('error');
      Alert.alert('Error', error.message || 'Failed to save farm.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-champagne">
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-28 pt-14">
        {/* Header */}
        <View className="mb-6">
          <Text
            className="font-black tracking-tight text-espresso"
            style={{ fontSize: Math.round(30 * fontScale) }}
          >
            Add Farm Area
          </Text>
          <Text
            className="font-bold uppercase tracking-[0.25em] text-taupe"
            style={{ fontSize: Math.round(11 * fontScale) }}
          >
            New Land Area
          </Text>
          <Text
            className="mt-2 max-w-sm text-taupe"
            style={{
              fontSize: Math.round(14 * fontScale),
              lineHeight: Math.round(20 * fontScale),
            }}
          >
            Set up your farm area profile to match your Farm.
          </Text>
        </View>

        {/* Max Limit Banner */}
        {isMaxedOut && (
          <View className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <Text
              className="font-bold text-amber-900"
              style={{ fontSize: Math.round(14 * fontScale) }}
            >
              Farm Limit Reached
            </Text>
            <Text
              className="mt-1 leading-4 text-amber-800"
              style={{ fontSize: Math.round(12 * fontScale) }}
            >
              You have {farmCount} of {MAX_FARMS_PER_ACCOUNT} farms registered.
            </Text>
          </View>
        )}

        {/* Form Card */}
        <View className="rounded-[28px] border border-white/90 bg-white/85 p-6 shadow-sm shadow-espresso/5">
          {/* Farm Name */}
          <View className="mb-4">
            <Text
              className="mb-1.5 font-bold uppercase tracking-wider text-taupe"
              style={{ fontSize: Math.round(12 * fontScale) }}
            >
              Farm Name <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={farmName}
              onChangeText={(text) => {
                setFarmName(text);
                if (errors.farmName) {
                  setErrors((prev) => ({ ...prev, farmName: undefined }));
                }
              }}
              placeholder="e.g. Green Valley Field"
              placeholderTextColor="#8C7C70"
              maxLength={100}
              editable={!isMaxedOut}
              className={`rounded-2xl border px-4 py-3.5 text-espresso ${
                errors.farmName ? 'border-red-400 bg-red-50/80' : 'border-black/10 bg-white'
              }`}
              style={{
                fontSize: Math.round(16 * fontScale),
                minHeight: gloveMinHeight,
              }}
            />
            {errors.farmName && (
              <View className="mt-1.5 flex-row items-center gap-1">
                <AlertCircle size={Math.round(14 * fontScale)} color="#EF4444" />
                <Text
                  className="font-semibold text-red-500"
                  style={{ fontSize: Math.round(12 * fontScale) }}
                >
                  {errors.farmName}
                </Text>
              </View>
            )}
          </View>

          {/* Location Picker */}
          <View className="mb-4">
            <Text
              className="mb-1.5 font-bold uppercase tracking-wider text-taupe"
              style={{ fontSize: Math.round(12 * fontScale) }}
            >
              Location <Text className="text-red-500">*</Text>
            </Text>
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                if (!isMaxedOut) setIsLocationModalVisible(true);
              }}
              hitSlop={hitSlop}
              style={{ minHeight: gloveMinHeight }}
              className={`flex-row items-center justify-between rounded-2xl border px-4 py-3.5 active:scale-[0.99] ${
                errors.location ? 'border-red-400 bg-red-50/80' : 'border-black/10 bg-white'
              }`}>
              <Text
                className={`flex-1 ${
                  locationObj?.address ? 'font-semibold text-espresso' : 'text-taupe'
                }`}
                style={{ fontSize: Math.round(16 * fontScale) }}
              >
                {locationObj?.address || 'Select map location...'}
              </Text>
              <MapPin size={Math.round(18 * fontScale)} color="#8C4522" strokeWidth={2.2} />
            </Pressable>

            {errors.location && (
              <View className="mt-1.5 flex-row items-center gap-1">
                <AlertCircle size={Math.round(14 * fontScale)} color="#EF4444" />
                <Text
                  className="font-semibold text-red-500"
                  style={{ fontSize: Math.round(12 * fontScale) }}
                >
                  {errors.location}
                </Text>
              </View>
            )}

            {/* Recent Locations (Top 3) for Offline Quick Select */}
            {recentLocations.length > 0 && (
              <View className="shadow-xs mt-3 rounded-2xl border border-black/5 bg-white/70 p-3">
                <View className="mb-2 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Clock size={Math.round(13 * fontScale)} color="#8C4522" />
                    <Text
                      className="font-bold uppercase tracking-wider text-cognac"
                      style={{ fontSize: Math.round(11 * fontScale) }}
                    >
                      Recent Farm Locations
                    </Text>
                  </View>
                </View>

                <View className="gap-2">
                  {recentLocations.map((item, idx) => {
                    const isSelected =
                      locationObj?.address?.trim().toLowerCase() ===
                      item.location.address?.trim().toLowerCase();

                    return (
                      <Pressable
                        key={idx}
                        hitSlop={hitSlop}
                        onPress={() => {
                          if (isMaxedOut) return;
                          triggerHaptic('selection');
                          setLocationObj(item.location);
                          if (errors.location) {
                            setErrors((prev) => ({ ...prev, location: undefined }));
                          }
                        }}
                        style={{ minHeight: isGloveMode ? 48 : undefined }}
                        className={`flex-row items-center justify-between rounded-xl border px-3 py-2.5 active:scale-[0.98] ${
                          isSelected
                            ? 'shadow-xs border-cognac bg-cognac/15'
                            : 'border-black/5 bg-white'
                        }`}>
                        <View className="mr-2 flex-1">
                          <Text
                            className="font-bold text-espresso"
                            style={{ fontSize: Math.round(12 * fontScale) }}
                          >
                            {item.farmName}
                          </Text>
                          <Text
                            className="mt-0.5 font-medium text-taupe"
                            numberOfLines={1}
                            style={{ fontSize: Math.round(11 * fontScale) }}
                          >
                            {item.location.address}
                          </Text>
                        </View>
                        {isSelected ? (
                          <View className="h-5 w-5 items-center justify-center rounded-full bg-cognac">
                            <Check size={Math.round(12 * fontScale)} color="#FFFFFF" strokeWidth={3} />
                          </View>
                        ) : (
                          <View className="h-5 w-5 items-center justify-center rounded-full border border-taupe/30" />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* Area (Square Meters) */}
          <View className="mb-4">
            <Text
              className="mb-1.5 font-bold uppercase tracking-wider text-taupe"
              style={{ fontSize: Math.round(12 * fontScale) }}
            >
              Area (Square Meters) <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={areaSqm}
              onChangeText={(text) => {
                setAreaSqm(text);
                if (errors.areaSqm) {
                  setErrors((prev) => ({ ...prev, areaSqm: undefined }));
                }
              }}
              placeholder="e.g. 1500"
              placeholderTextColor="#8C7C70"
              keyboardType="numeric"
              maxLength={15}
              editable={!isMaxedOut}
              className={`rounded-2xl border px-4 py-3.5 text-espresso ${
                errors.areaSqm ? 'border-red-400 bg-red-50/80' : 'border-black/10 bg-white'
              }`}
              style={{
                fontSize: Math.round(16 * fontScale),
                minHeight: gloveMinHeight,
              }}
            />
            {errors.areaSqm && (
              <View className="mt-1.5 flex-row items-center gap-1">
                <AlertCircle size={Math.round(14 * fontScale)} color="#EF4444" />
                <Text
                  className="font-semibold text-red-500"
                  style={{ fontSize: Math.round(12 * fontScale) }}
                >
                  {errors.areaSqm}
                </Text>
              </View>
            )}
          </View>

          {/* Notes / Description */}
          <View className="mb-6">
            <View className="mb-1.5 flex-row items-center justify-between">
              <Text
                className="font-bold uppercase tracking-wider text-taupe"
                style={{ fontSize: Math.round(12 * fontScale) }}
              >
                Notes / Description <Text className="font-normal text-taupe/60">(Optional)</Text>
              </Text>
              <Text
                className="font-semibold text-taupe"
                style={{ fontSize: Math.round(10 * fontScale) }}
              >
                {description.length}/3000
              </Text>
            </View>
            <TextInput
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                if (errors.description) {
                  setErrors((prev) => ({ ...prev, description: undefined }));
                }
              }}
              placeholder="Soil characteristics, crop history, or notes..."
              placeholderTextColor="#8C7C70"
              multiline
              numberOfLines={3}
              maxLength={3000}
              editable={!isMaxedOut}
              className={`min-h-[90px] rounded-2xl border px-4 py-3.5 text-espresso ${
                errors.description ? 'border-red-400 bg-red-50/80' : 'border-black/10 bg-white'
              }`}
              textAlignVertical="top"
              style={{
                fontSize: Math.round(16 * fontScale),
              }}
            />
            {errors.description && (
              <View className="mt-1.5 flex-row items-center gap-1">
                <AlertCircle size={Math.round(14 * fontScale)} color="#EF4444" />
                <Text
                  className="font-semibold text-red-500"
                  style={{ fontSize: Math.round(12 * fontScale) }}
                >
                  {errors.description}
                </Text>
              </View>
            )}
          </View>

          {/* Submit Button */}
          <Pressable
            onPress={handleCreateFarm}
            disabled={saving || checkingCount || isMaxedOut}
            hitSlop={hitSlop}
            style={{ minHeight: isGloveMode ? 54 : undefined }}
            className={`items-center justify-center rounded-full py-4 shadow-md shadow-cognac/20 active:scale-[0.98] ${
              saving || checkingCount || isMaxedOut ? 'bg-cognac/40' : 'bg-cognac'
            }`}>
            <Text
              className="text-center font-extrabold text-white"
              style={{ fontSize: Math.round(16 * fontScale) }}
            >
              {saving
                ? 'Saving Farm...'
                : checkingCount
                  ? 'Checking Limit...'
                  : isMaxedOut
                    ? `Limit Reached (${farmCount}/${MAX_FARMS_PER_ACCOUNT})`
                    : 'Create Farm'}
            </Text>
          </Pressable>
        </View>

        {/* Location Picker Modal */}
        <LocationPickerModal
          visible={isLocationModalVisible}
          onClose={() => setIsLocationModalVisible(false)}
          initialLocation={locationObj}
          recentLocations={recentLocations}
          onSelect={(loc) => {
            setLocationObj(loc);
            if (errors.location) {
              setErrors((prev) => ({ ...prev, location: undefined }));
            }
          }}
        />
      </ScrollView>
    </View>
  );
}
