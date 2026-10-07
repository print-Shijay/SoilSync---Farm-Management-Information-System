import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AppAlert as Alert } from '../components/common/AppAlert';
import { Stack } from 'expo-router';
import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { getWeatherData, CachedWeather, getLocation, setLocation } from '../lib/weather-service';
import { CloudRain, CloudSun, Droplets, MapPin, Wind, Sun, Navigation, RefreshCw } from 'lucide-react-native';
import { BackButton } from '../components/common/BackButton';
import { useAccessibility } from '../lib/accessibility';
import { useNetworkStatus } from '../lib/hooks/useNetworkStatus';

async function ensureWeatherOnline(): Promise<boolean> {
  try {
    const networkState = await Network.getNetworkStateAsync();
    if (networkState.isConnected && networkState.isInternetReachable !== false) return true;
  } catch {
    // The fresh weather request cannot proceed without a confirmed connection.
  }
  Alert.alert('No Internet Connection', 'Connect to the internet to update weather data.');
  return false;
}

export default function WeatherScreen() {
  const { fontScale, isGloveMode, isHighContrast, triggerHaptic } = useAccessibility();
  const { isOnline } = useNetworkStatus();
  const [weather, setWeather] = useState<CachedWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingLocation, setUpdatingLocation] = useState(false);

  useEffect(() => {
    loadWeather();
  }, []);

  const loadWeather = async () => {
    setLoading(true);
    const data = await getWeatherData();
    setWeather(data);
    setLoading(false);
  };

  const executeRefresh = async () => {
    if (!isOnline || !(await ensureWeatherOnline())) return;
    try {
      setLoading(true);
      const freshWeather = await getWeatherData(true, false);
      if (!freshWeather) {
        Alert.alert('Refresh Failed', 'Fresh weather data could not be fetched. Your previous forecast is still shown.');
        return;
      }
      setWeather(freshWeather);
      Alert.alert('Refreshed', 'Successfully fetched the latest weather data!');
    } catch (error) {
      Alert.alert('Error', 'Failed to refresh weather data.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (!isOnline || loading || updatingLocation) return;
    triggerHaptic('selection');
    Alert.alert(
      'Refresh Weather',
      'Are you sure you want to pull fresh weather data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, refresh',
          onPress: () => {
            triggerHaptic('impactMedium');
            executeRefresh();
          },
        },
      ]
    );
  };

  const handleUpdateLocation = async () => {
    if (!isOnline || !(await ensureWeatherOnline())) return;
    try {
      setUpdatingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Allow location access to get local weather.');
        setUpdatingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      
      let locationName = 'Current Location';
      try {
        const reverse = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude
        });
        if (reverse && reverse.length > 0) {
          const r = reverse[0];
          locationName = [r.city, r.region].filter(Boolean).join(', ') || r.country || locationName;
        }
      } catch (e) {
        console.error('Reverse geocode failed', e);
      }

      const previousLocation = await getLocation();
      await setLocation(location.coords.latitude, location.coords.longitude, locationName);
      const freshWeather = await getWeatherData(true, false);
      if (!freshWeather) {
        await setLocation(previousLocation.lat, previousLocation.lon, previousLocation.name);
        Alert.alert('Weather Unavailable', 'Could not load weather for this GPS location. Your previous location is unchanged.');
        return;
      }
      setWeather(freshWeather);
      
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to get location');
    } finally {
      setUpdatingLocation(false);
    }
  };

  if (loading && !weather) {
    return (
      <View className="flex-1 items-center justify-center bg-champagne">
        <ActivityIndicator size="large" color="#8C4522" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-champagne">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-14 pb-3">
        <BackButton fallbackRoute="/(tabs)" />
        <Text
          style={{ fontSize: Math.round(14 * fontScale) }}
          className="font-black text-espresso tracking-[0.25em] uppercase">
          Weather Radar
        </Text>
        <TouchableOpacity 
          onPress={handleRefresh}
          disabled={!isOnline || loading || updatingLocation}
          activeOpacity={0.75}
          hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : { top: 10, bottom: 10, left: 10, right: 10 }}
          style={isGloveMode ? { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' } : undefined}
          className={`h-10 w-10 items-center justify-center rounded-full border border-cognac/20 bg-white shadow-xs active:scale-95 ${!isOnline || loading || updatingLocation ? 'opacity-50' : ''}`}
        >
          <RefreshCw size={18} color="#8C4522" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      {!isOnline && (
        <View className="mx-5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <Text className="text-sm text-amber-900">
            You are offline. Cached weather remains visible when available; reconnect to refresh it or update the weather location.
          </Text>
        </View>
      )}

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {/* Main Current Weather */}
        {weather && (
          <View className="mt-4 items-center">
            {/* Location Pill */}
            <View className="flex-row items-center border border-cognac/25 bg-white px-4 py-1.5 rounded-full mb-4 shadow-xs">
              <MapPin size={15} color="#8C4522" className="mr-1.5" />
              <Text
                style={{ fontSize: Math.round(12 * fontScale) }}
                className="text-cognac font-extrabold tracking-wider">
                {weather.locationName}
              </Text>
            </View>
            
            {/* Big Sun/Cloud Icon in radiant Gold */}
            <View className="flex-row items-center justify-center">
              <CloudSun size={Math.round(76 * Math.min(fontScale, 1.25))} color="#D99C2B" strokeWidth={1.8} />
            </View>
            
            {/* Big Temperature */}
            <Text
              style={{ fontSize: Math.round(88 * fontScale) }}
              className="mt-2 font-black text-espresso tracking-tighter">
              {Math.round(weather.data.current.temp)}°
            </Text>
            
            {/* Description in Cognac */}
            <Text
              style={{ fontSize: Math.round(18 * fontScale) }}
              className="font-bold text-cognac capitalize mt-1">
              {weather.data.current.weather[0]?.description}
            </Text>
            
            {/* Humidity & Wind Colored Pills */}
            <View className="flex-row items-center mt-4">
              <View className="flex-row items-center mx-2.5 rounded-full bg-blue-50 border border-blue-200 px-4 py-1.5 shadow-xs">
                <Droplets size={16} color="#2563EB" className="mr-1.5" />
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="text-blue-900 font-black">
                  {weather.data.current.humidity}%
                </Text>
              </View>
              <View className="flex-row items-center mx-2.5 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-1.5 shadow-xs">
                <Wind size={16} color="#059669" className="mr-1.5" />
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="text-emerald-900 font-black">
                  {weather.data.current.wind_speed} m/s
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Action Button */}
        <TouchableOpacity 
          onPress={() => {
            triggerHaptic('impactMedium');
            handleUpdateLocation();
          }}
          disabled={updatingLocation || loading || !isOnline}
          activeOpacity={0.85}
          hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
          style={isGloveMode ? { minHeight: 54, justifyContent: 'center' } : undefined}
          className={`mt-6 flex-row items-center justify-center rounded-full py-4 shadow-md shadow-cognac/30 active:scale-[0.98] ${!isOnline || loading ? 'bg-taupe/50' : 'bg-cognac'}`}
        >
          {updatingLocation ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Navigation size={18} color="#fff" className="mr-2" strokeWidth={2.2} />
              <Text
                style={{ fontSize: Math.round(16 * fontScale) }}
                className="font-extrabold text-white">
                {isOnline ? 'Update Location via GPS' : 'GPS Weather Update Unavailable Offline'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Hourly Forecast */}
        {weather && (
          <View className="mt-8 mb-4">
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className="font-bold text-cognac uppercase tracking-[0.25em] mb-3">
              {"Today's Forecast"}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              {weather.data.hourly.slice(0, 24).filter((_, i) => i % 3 === 0).map((hour, idx) => {
                const d = new Date(hour.dt * 1000);
                const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const isRain = hour.pop > 0.4;
                return (
                  <View
                    key={idx}
                    style={isGloveMode ? { minWidth: 96 } : undefined}
                    className="items-center border border-cognac/15 bg-white rounded-[22px] p-4 mr-3 min-w-[86px] shadow-sm shadow-espresso/5">
                    <Text
                      style={{ fontSize: Math.round(11 * fontScale) }}
                      className="text-taupe font-bold mb-2.5">
                      {timeStr}
                    </Text>
                    {isRain ? (
                      <CloudRain size={26} color="#2563EB" strokeWidth={2} />
                    ) : (
                      <CloudSun size={26} color="#D99C2B" strokeWidth={2} />
                    )}
                    <Text
                      style={{ fontSize: Math.round(18 * fontScale) }}
                      className="text-espresso font-black mt-2.5">
                      {Math.round(hour.temp)}°
                    </Text>
                    {hour.pop > 0 ? (
                      <View className="mt-1.5 rounded-full bg-blue-100 px-2 py-0.5">
                        <Text
                          style={{ fontSize: Math.round(10 * fontScale) }}
                          className="font-bold text-blue-700">
                          {Math.round(hour.pop * 100)}%
                        </Text>
                      </View>
                    ) : (
                      <View className="mt-1.5 rounded-full bg-emerald-50 px-2 py-0.5">
                        <Text
                          style={{ fontSize: Math.round(10 * fontScale) }}
                          className="font-bold text-emerald-700">
                          Dry
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Daily Forecast */}
        {weather && (
          <View className="mt-2 mb-12">
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className="font-bold text-espresso uppercase tracking-[0.25em] mb-3">
              7-Day Forecast
            </Text>
            <View className="border border-cognac/15 bg-white rounded-[28px] p-5 shadow-sm shadow-espresso/5">
              {weather.data.daily.map((day, idx) => {
                if (idx === 0) return null; // Skip today
                const d = new Date(day.dt * 1000);
                const dayName = d.toLocaleDateString([], { weekday: 'long' });
                const isRain = day.pop > 0.4;
                
                return (
                  <View key={idx} className={`flex-row items-center justify-between py-3.5 ${idx < weather.data.daily.length - 1 ? 'border-b border-black/5' : ''}`}>
                    <Text
                      style={{ fontSize: Math.round(15 * fontScale) }}
                      className="text-espresso font-bold flex-1">
                      {dayName}
                    </Text>
                    <View className="flex-row items-center flex-1 justify-center">
                      {isRain ? (
                         <CloudRain size={20} color="#2563EB" strokeWidth={2} />
                      ) : (
                         <Sun size={20} color="#D99C2B" strokeWidth={2} />
                      )}
                      {day.pop > 0 ? (
                        <View className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 border border-blue-200">
                          <Text
                            style={{ fontSize: Math.round(10 * fontScale) }}
                            className="font-bold text-blue-600">
                            {Math.round(day.pop * 100)}%
                          </Text>
                        </View>
                      ) : (
                        <View className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 border border-emerald-200">
                          <Text
                            style={{ fontSize: Math.round(10 * fontScale) }}
                            className="font-bold text-emerald-700">
                            0%
                          </Text>
                        </View>
                      )}
                    </View>
                    <View className="flex-1 items-end flex-row justify-end">
                      <Text
                        style={{ fontSize: Math.round(15 * fontScale) }}
                        className="text-cognac font-black">
                        {Math.round(day.temp.max)}°
                      </Text>
                      <Text
                        style={{ fontSize: Math.round(15 * fontScale) }}
                        className="text-taupe font-semibold ml-3">
                        {Math.round(day.temp.min)}°
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
}
