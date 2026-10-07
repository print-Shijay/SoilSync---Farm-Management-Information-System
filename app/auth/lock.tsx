import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Shield, Fingerprint, LogOut, Delete } from 'lucide-react-native';

import { LogoutSyncModal } from '../../components/LogoutSyncModal';
import { useLogoutHandler } from '../../lib/hooks/useLogoutHandler';

const BIOMETRIC_ENABLED_KEY = 'soilsync_biometric_enabled';
const PIN_ENABLED_KEY = 'soilsync_pin_enabled';
const PIN_VALUE_KEY = 'soilsync_pin_value';

export default function AppLockScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentWidth = Math.min(width - insets.left - insets.right, 480);
  const horizontalPadding = Math.max(16, Math.min(28, (contentWidth - 280) / 4));
  const compact = height - insets.top - insets.bottom < 700;
  const keypadWidth = Math.min(compact ? 224 : 288, contentWidth - horizontalPadding * 2);
  // Keys can grow vertically with system text size while retaining equal column widths.
  const keyDimensions = {
    flex: 1,
    minHeight: Math.max(48, (keypadWidth - 24) / 3),
    paddingVertical: 10,
  };
  const {
    logoutModalVisible,
    setLogoutModalVisible,
    isCheckingSync,
    handleLogoutInitiated,
    handleSignOutSuccess,
  } = useLogoutHandler();

  const [pinInput, setPinInput] = useState('');
  const [expectedPin, setExpectedPin] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);

  // Load lock configuration on mount
  useEffect(() => {
    initLockScreen();
  }, []);

  const initLockScreen = async () => {
    try {
      setLoading(true);

      const pinValue = await SecureStore.getItemAsync(PIN_VALUE_KEY);
      setExpectedPin(pinValue);

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);

      const bioFlag = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      const isBioActive = bioFlag === 'true' && hasHardware && isEnrolled;
      setBiometricEnabled(isBioActive);

      // If no lock is active at all, bypass to tabs
      if (!pinValue && !isBioActive) {
        router.replace('/(tabs)');
        return;
      }

      if (isBioActive) {
        authenticateWithBiometrics();
      }
    } catch (e) {
      console.warn('Failed to load lock screen config:', e);
    } finally {
      setLoading(false);
    }
  };

  const authenticateWithBiometrics = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock SoilSync',
        fallbackLabel: 'Use PIN',
      });

      if (result.success) {
        router.replace('/(tabs)');
      }
    } catch (e) {
      console.warn('Biometric auth error:', e);
    }
  };

  const handleKeyPress = (digit: string) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + digit;
      setPinInput(newPin);
      setErrorMessage('');

      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const handleDeletePress = () => {
    if (pinInput.length > 0) {
      setPinInput(pinInput.slice(0, -1));
      setErrorMessage('');
    }
  };

  const verifyPin = (enteredPin: string) => {
    if (expectedPin && enteredPin === expectedPin) {
      router.replace('/(tabs)');
    } else {
      setErrorMessage('Incorrect PIN. Please try again.');
      setPinInput('');
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Sign Out',
      'If you forgot your PIN, signing out will require your password to log back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            handleLogoutInitiated();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-champagne items-center justify-center">
        <ActivityIndicator size="large" color="#8C4522" />
      </View>
    );
  }

  const expectedLength = expectedPin ? expectedPin.length : 4;

  return (
    <SafeAreaView className="flex-1 bg-champagne">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          width: '100%',
          maxWidth: 480,
          alignSelf: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: horizontalPadding,
          paddingVertical: compact ? 16 : 24,
          gap: compact ? 16 : 24,
        }}
        showsVerticalScrollIndicator={false}>
        {/* Header Info */}
        <View className="items-center">
          <View className="w-16 h-16 rounded-2xl bg-cognac/10 items-center justify-center mb-3.5 border border-cognac/20">
            <Shield color="#8C4522" size={30} strokeWidth={2.2} />
          </View>
          <Text className="text-2xl leading-8 text-center font-black tracking-tight text-espresso mb-1">
            Enter Passcode
          </Text>
          <Text className="text-sm leading-5 font-semibold text-taupe text-center">
            {biometricAvailable
              ? 'Use Touch/Face ID or Enter PIN'
              : 'Enter your 4-digit PIN to continue'}
          </Text>
        </View>

        {/* PIN Dots Display */}
        <View className="items-center">
          <View className="flex-row flex-wrap justify-center gap-5 mb-1">
            {Array.from({ length: expectedLength }).map((_, index) => {
              const isFilled = index < pinInput.length;
              return (
                <View
                  key={index}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    isFilled
                      ? 'bg-cognac border-cognac shadow-sm shadow-cognac/30 scale-110'
                      : 'bg-transparent border-taupe/40'
                  }`}
                />
              );
            })}
          </View>

          {errorMessage ? (
            <Text className="text-red-500 text-sm leading-5 text-center font-bold mt-2">
              {errorMessage}
            </Text>
          ) : null}
        </View>

        {/* Keypad Grid */}
        <View className="self-center" style={{ width: keypadWidth }}>
          <View className="flex-row gap-3 mb-3">
            {['1', '2', '3'].map((num) => (
              <TouchableOpacity
                key={num}
                activeOpacity={0.7}
                className="rounded-full bg-white border border-black/5 items-center justify-center shadow-sm shadow-espresso/5 active:scale-95 active:bg-black/5"
                style={keyDimensions}
                accessibilityRole="button"
                accessibilityLabel={num}
                onPress={() => handleKeyPress(num)}>
                <Text className="text-2xl leading-8 text-center font-semibold text-espresso">
                  {num}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row gap-3 mb-3">
            {['4', '5', '6'].map((num) => (
              <TouchableOpacity
                key={num}
                activeOpacity={0.7}
                className="rounded-full bg-white border border-black/5 items-center justify-center shadow-sm shadow-espresso/5 active:scale-95 active:bg-black/5"
                style={keyDimensions}
                accessibilityRole="button"
                accessibilityLabel={num}
                onPress={() => handleKeyPress(num)}>
                <Text className="text-2xl leading-8 text-center font-semibold text-espresso">
                  {num}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row gap-3 mb-3">
            {['7', '8', '9'].map((num) => (
              <TouchableOpacity
                key={num}
                activeOpacity={0.7}
                className="rounded-full bg-white border border-black/5 items-center justify-center shadow-sm shadow-espresso/5 active:scale-95 active:bg-black/5"
                style={keyDimensions}
                accessibilityRole="button"
                accessibilityLabel={num}
                onPress={() => handleKeyPress(num)}>
                <Text className="text-2xl leading-8 text-center font-semibold text-espresso">
                  {num}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row gap-3 mb-3">
            {/* Biometric or blank button */}
            {biometricAvailable ? (
              <TouchableOpacity
                activeOpacity={0.7}
                className="rounded-full bg-cognac/10 items-center justify-center border border-cognac/20 active:scale-95"
                style={keyDimensions}
                accessibilityRole="button"
                accessibilityLabel="Unlock with biometrics"
                onPress={authenticateWithBiometrics}>
                <Fingerprint color="#8C4522" size={28} strokeWidth={2.2} />
              </TouchableOpacity>
            ) : (
              <View style={keyDimensions} />
            )}

            {/* Zero digit */}
            <TouchableOpacity
              activeOpacity={0.7}
              className="rounded-full bg-white border border-black/5 items-center justify-center shadow-sm shadow-espresso/5 active:scale-95 active:bg-black/5"
              style={keyDimensions}
              accessibilityRole="button"
              accessibilityLabel="0"
              onPress={() => handleKeyPress('0')}>
              <Text className="text-2xl leading-8 text-center font-semibold text-espresso">0</Text>
            </TouchableOpacity>

            {/* Delete Key */}
            <TouchableOpacity
              activeOpacity={0.7}
              className="rounded-full bg-white border border-black/5 items-center justify-center shadow-sm shadow-espresso/5 active:scale-95 active:bg-black/5"
              style={keyDimensions}
              accessibilityRole="button"
              accessibilityLabel="Delete last digit"
              onPress={handleDeletePress}>
              <Delete color="#8C4522" size={22} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer Logout Button */}
        <TouchableOpacity
          className="min-h-11 flex-row items-center justify-center px-3 py-2 active:opacity-75"
          onPress={handleLogout}
          disabled={isCheckingSync}>
          {isCheckingSync ? (
            <ActivityIndicator size="small" color="#8C4522" />
          ) : (
            <LogOut color="#8C4522" size={16} strokeWidth={2.2} />
          )}
          <Text className="ml-2 flex-shrink text-center font-bold text-cognac text-sm leading-5">
            {isCheckingSync ? 'Checking Sync Status...' : 'Forgot PIN? Sign Out'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <LogoutSyncModal
        visible={logoutModalVisible}
        onClose={() => setLogoutModalVisible(false)}
        onSignOutSuccess={handleSignOutSuccess}
      />
    </SafeAreaView>
  );
}
