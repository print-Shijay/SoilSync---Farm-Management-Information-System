import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useRouter } from 'expo-router';
import { View, Text, Animated, ImageBackground } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { useNetworkStatus } from '../lib/hooks/useNetworkStatus';

const BIOMETRIC_ENABLED_KEY = 'soilsync_biometric_enabled';
const PIN_ENABLED_KEY = 'soilsync_pin_enabled';
const PIN_VALUE_KEY = 'soilsync_pin_value';

export default function Index() {
  const router = useRouter();
  const { user, loading, accountStatus } = useAuth();
  const { isOffline } = useNetworkStatus();
  
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  
  // Animation for the progress bar (0 to 1)
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 3000, // 3 seconds minimum loading time
      useNativeDriver: false,
    }).start(() => {
      setMinTimeElapsed(true);
    });
  }, [animatedValue]);

  useEffect(() => {
    if (!loading && minTimeElapsed) {
      if (user && !accountStatus) {
        checkAppLockAndNavigate();
      } else if (user && accountStatus) {
        router.replace('/auth/login');
      } else {
        router.replace('/auth/landing');
      }
    }
  }, [user, loading, minTimeElapsed, accountStatus]);

  const checkAppLockAndNavigate = async () => {
    try {
      const [storedPin, pinEnabled, bioEnabled] = await Promise.all([
        SecureStore.getItemAsync(PIN_VALUE_KEY),
        SecureStore.getItemAsync(PIN_ENABLED_KEY),
        SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY),
      ]);

      const isPinActive = pinEnabled === 'true' && !!storedPin;
      const isBioActive = bioEnabled === 'true';

      if (isPinActive || isBioActive) {
        router.replace('/auth/lock');
      } else {
        router.replace('/(tabs)');
      }
    } catch {
      // Fallback to tabs if error checking lock
      router.replace('/(tabs)');
    }
  };

  const animatedWidth = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  return (
    <View className="flex-1 bg-black">
      <ImageBackground
        source={require('../assets/loading-background.png')}
        className="flex-1 justify-end pb-24 items-center"
        resizeMode="cover"
      >
        {/* Vignette Overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']}
          className="absolute inset-0"
        />

        {/* Loading Bar Container */}
        <View className="w-64 z-10 items-center">
          <View className="w-full h-1.5 bg-white/30 rounded-full overflow-hidden relative">
            {/* Realistic Progress Bar Indicator (Green) */}
            <Animated.View
              className="absolute left-0 top-0 bottom-0 rounded-full"
              style={{ width: animatedWidth, backgroundColor: '#22c55e' }}
            />
          </View>

          {/* Offline indicator badge */}
          {isOffline && (
            <View className="mt-2 flex-row items-center rounded-full border border-white/20 bg-black/60 px-2.5 py-0.5 shadow-sm">
              <View className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
              <Text className="text-[11px] font-medium text-white/90">
                You are currently offline
              </Text>
            </View>
          )}
        </View>
      </ImageBackground>
    </View>
  );
}
