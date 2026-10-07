import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { AppAlert as Alert } from './common/AppAlert';
import { Modal, KeyboardAvoidingView } from './common/AppModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import {
  X,
  MapPin,
  Navigation,
  Check,
  WifiOff,
  Compass,
  Clock,
} from 'lucide-react-native';
import { LocationData } from '../lib/location-utils';

export type RecentLocationItem = {
  farmName: string;
  location: LocationData;
};

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (location: LocationData) => void;
  initialLocation?: LocationData | null;
  recentLocations?: RecentLocationItem[];
}

const DEFAULT_REGION: Region = {
  latitude: 14.0722, // San Pablo City, Laguna default center
  longitude: 121.3259,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

export default function LocationPickerModal({
  visible,
  onClose,
  onSelect,
  initialLocation,
  recentLocations,
}: LocationPickerModalProps) {
  const [address, setAddress] = useState(initialLocation?.address || '');
  const [region, setRegion] = useState<Region>(() => {
    if (initialLocation?.latitude && initialLocation?.longitude) {
      return {
        latitude: initialLocation.latitude,
        longitude: initialLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }
    return DEFAULT_REGION;
  });

  const [markerCoordinate, setMarkerCoordinate] = useState<{
    latitude: number;
    longitude: number;
  } | null>(
    initialLocation?.latitude && initialLocation?.longitude
      ? { latitude: initialLocation.latitude, longitude: initialLocation.longitude }
      : null
  );

  const [loadingLocation, setLoadingLocation] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (visible) {
      checkNetwork();
      initializeLocation();
    }
  }, [visible, initialLocation]);

  const checkNetwork = async () => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      setIsOffline(!networkState.isConnected);
    } catch (err) {
      console.warn('Network check error:', err);
      setIsOffline(false);
    }
  };

  const initializeLocation = async () => {
    try {
      if (initialLocation?.latitude && initialLocation?.longitude) {
        const coords = {
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
        };
        setMarkerCoordinate(coords);
        setRegion({
          ...coords,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        if (initialLocation.address) {
          setAddress(initialLocation.address);
        }
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setHasLocationPermission(granted);

      if (granted && (!initialLocation?.latitude || !initialLocation?.longitude)) {
        await handleUseCurrentLocation(true);
      }
    } catch (error) {
      console.error('Error initializing location/permissions:', error);
      setHasLocationPermission(false);
    }
  };

  const reverseGeocodeCoords = async (coords: { latitude: number; longitude: number }) => {
    if (isOffline) return;
    setIsGeocoding(true);
    try {
      const geocode = await Location.reverseGeocodeAsync(coords);
      if (geocode && geocode.length > 0) {
        const place = geocode[0];
        const parts = [
          place.name !== place.street ? place.name : null,
          place.street,
          place.subregion || place.district,
          place.city,
          place.region,
        ].filter(Boolean);

        const formatted = Array.from(new Set(parts)).join(', ');
        if (formatted) {
          setAddress(formatted);
        }
      }
    } catch (geoErr) {
      console.warn('Reverse geocoding error:', geoErr);
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleUseCurrentLocation = async (isAutoDetect = false) => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setHasLocationPermission(false);
        if (!isAutoDetect) {
          Alert.alert(
            'Permission Required',
            'Location permission is needed to access your current position. Please enable permission in system settings or select location manually.'
          );
        }
        return;
      }

      setHasLocationPermission(true);

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (location?.coords) {
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        setMarkerCoordinate(coords);
        const newRegion = {
          ...coords,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        };
        setRegion(newRegion);

        try {
          mapRef.current?.animateToRegion(newRegion, 800);
        } catch (mapErr) {
          console.warn('Map animation failed:', mapErr);
        }

        await reverseGeocodeCoords(coords);
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      if (!isAutoDetect) {
        Alert.alert(
          'Location Error',
          'Could not retrieve your current location. Please ensure location services (GPS) are enabled.'
        );
      }
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleMapPress = async (e: any) => {
    try {
      if (e?.nativeEvent?.coordinate) {
        const coords = e.nativeEvent.coordinate;
        setMarkerCoordinate(coords);
        await reverseGeocodeCoords(coords);
      }
    } catch (err) {
      console.warn('Map press error:', err);
    }
  };

  const handleSave = () => {
    if (!address.trim()) {
      Alert.alert('Missing Address', 'Please enter a name or address label for this location.');
      return;
    }

    onSelect({
      address: address.trim(),
      latitude: markerCoordinate?.latitude,
      longitude: markerCoordinate?.longitude,
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-champagne" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-taupe/20 bg-champagne px-4 py-3">
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-taupe/10 active:bg-taupe/20">
              <X size={20} className="text-espresso" />
            </Pressable>

            <View className="items-center">
              <Text className="text-base font-bold text-espresso">Select Farm Location</Text>
              <Text className="text-xs font-medium text-taupe">
                Tap map or use GPS to set pin
              </Text>
            </View>

            <Pressable
              onPress={handleSave}
              className="flex-row items-center gap-1 rounded-full bg-cognac px-4 py-2 shadow-xs active:opacity-90">
              <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text className="text-sm font-bold text-white">Save</Text>
            </Pressable>
          </View>

          {/* Offline Warning Banner */}
          {isOffline && (
            <View className="flex-row items-center gap-2 bg-amber-50 px-4 py-2.5 border-b border-amber-200">
              <WifiOff size={16} className="text-amber-700" />
              <Text className="flex-1 text-xs font-medium text-amber-800">
                You are offline. Map tiles may not render, but GPS pin and manual text entry work.
              </Text>
            </View>
          )}

          {/* Search / Address Label Card */}
          <View className="bg-champagne px-4 py-3 border-b border-taupe/15">
            <View className="flex-row items-center rounded-2xl border border-taupe/30 bg-white px-3.5 py-2.5 shadow-xs">
              <MapPin size={20} className="mr-2 text-cognac" />
              <TextInput
                value={address}
                onChangeText={setAddress}
                maxLength={255}
                placeholder="Search or enter farm address (e.g. Brgy. San Jose, San Pablo)"
                placeholderTextColor="#8C7C70"
                className="flex-1 text-sm font-medium text-espresso p-0"
                returnKeyType="done"
              />
              {isGeocoding ? (
                <ActivityIndicator size="small" color="#8C4522" className="ml-2" />
              ) : (
                address.length > 0 && (
                  <Pressable onPress={() => setAddress('')} hitSlop={6} className="ml-1 p-1">
                    <X size={16} className="text-taupe" />
                  </Pressable>
                )
              )}
            </View>
          </View>

          {/* Quick Pick Recent Locations */}
          {recentLocations && recentLocations.length > 0 && (
            <View className="bg-champagne/80 px-4 py-2 border-b border-taupe/15">
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center gap-1">
                  <Clock size={12} color="#8C4522" />
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-cognac">
                    Recent Farm Locations
                  </Text>
                </View>
                <Text className="text-[9px] font-semibold text-taupe/80">Offline Ready</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-0.5">
                {recentLocations.map((item, idx) => {
                  const isSelected = address.trim() === item.location.address.trim();
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        setAddress(item.location.address);
                        if (item.location.latitude && item.location.longitude) {
                          const coords = {
                            latitude: item.location.latitude,
                            longitude: item.location.longitude,
                          };
                          setMarkerCoordinate(coords);
                          const newRegion = {
                            ...coords,
                            latitudeDelta: 0.008,
                            longitudeDelta: 0.008,
                          };
                          setRegion(newRegion);
                          try {
                            mapRef.current?.animateToRegion(newRegion, 600);
                          } catch (e) {
                            // ignore animation error
                          }
                        }
                      }}
                      className={`mr-2 flex-row items-center rounded-xl border px-3 py-1.5 active:scale-95 ${
                        isSelected
                          ? 'border-cognac bg-cognac/10 shadow-xs'
                          : 'border-black/10 bg-white'
                      }`}>
                      <View className="mr-1.5">
                        <Text className="text-xs font-bold text-espresso">{item.farmName}</Text>
                        <Text className="text-[10px] text-taupe max-w-[150px]" numberOfLines={1}>
                          {item.location.address}
                        </Text>
                      </View>
                      {isSelected && <Check size={13} color="#8C4522" strokeWidth={2.5} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Map View Area */}
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
              region={region}
              onRegionChangeComplete={setRegion}
              onPress={handleMapPress}
              showsUserLocation={hasLocationPermission}
              showsMyLocationButton={false}>
              {markerCoordinate && (
                <Marker
                  coordinate={markerCoordinate}
                  title="Farm Location"
                  description={address || 'Selected position'}
                />
              )}
            </MapView>

            {/* Instruction Floating Badge */}
            <View className="absolute top-3 left-4 right-4 items-center">
              <View className="flex-row items-center gap-1.5 rounded-full bg-espresso/80 px-3.5 py-1.5 shadow-md">
                <Compass size={14} color="#D4AF37" />
                <Text className="text-xs font-semibold text-white">
                  Tap anywhere on map to move pin
                </Text>
              </View>
            </View>

            {/* Floating GPS Button */}
            <View className="absolute bottom-4 right-4">
              <Pressable
                onPress={() => handleUseCurrentLocation(false)}
                disabled={loadingLocation}
                className="flex-row items-center gap-2 rounded-full border border-taupe/20 bg-white px-4 py-3 shadow-lg shadow-espresso/25 active:bg-champagne">
                {loadingLocation ? (
                  <ActivityIndicator color="#8C4522" size="small" />
                ) : (
                  <Navigation size={18} className="text-cognac" />
                )}
                <Text className="text-xs font-bold text-espresso">
                  {loadingLocation ? 'Locating...' : 'Use GPS'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Bottom Location Summary & Action Bar */}
          <View className="border-t border-taupe/20 bg-white px-4 pt-3.5 pb-7 shadow-lg">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 mr-3">
                <Text className="text-xs font-semibold uppercase tracking-wider text-taupe">
                  Selected Position
                </Text>
                <Text className="text-sm font-bold text-espresso" numberOfLines={1}>
                  {address.trim() || 'No address specified'}
                </Text>
              </View>
              {markerCoordinate ? (
                <View className="rounded-lg bg-champagne px-2.5 py-1 border border-taupe/20">
                  <Text className="text-[11px] font-bold text-cognac">
                    {markerCoordinate.latitude.toFixed(4)}°, {markerCoordinate.longitude.toFixed(4)}°
                  </Text>
                </View>
              ) : (
                <View className="rounded-lg bg-amber-50 px-2.5 py-1 border border-amber-200">
                  <Text className="text-[11px] font-semibold text-amber-700">
                    No Pin Set
                  </Text>
                </View>
              )}
            </View>

            <Pressable
              onPress={handleSave}
              className="flex-row items-center justify-center gap-2 rounded-2xl bg-cognac py-3.5 shadow-md active:opacity-90">
              <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text className="text-base font-bold text-white">Confirm Location</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
