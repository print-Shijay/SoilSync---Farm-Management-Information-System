import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  TextInput,
  BackHandler,
  Keyboard,
  Pressable,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../../components/common/AppModal';
import {
  Camera,
  MapPin,
  HardDrive,
  Bell,
  ShieldCheck,
  Settings as SettingsIcon,
  X,
  Check,
  Shield,
  KeyRound,
  ChevronRight,
  QrCode,
} from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';
import {
  PermissionFeature,
  PermissionStatus,
  getAppPermissionState,
  getSystemPermission,
  setAppPermissionPreference,
  requestAppPermission,
  openPhoneSettings,
} from '../../lib/permissions';

// SecureStore keys
const PIN_ENABLED_KEY = 'soilsync_pin_enabled';
const PIN_VALUE_KEY = 'soilsync_pin_value';

function parseSvgString(qrCodeStr: string | null | undefined): string | null {
  if (!qrCodeStr) return null;
  try {
    let svg = qrCodeStr;
    if (svg.startsWith('data:image/svg+xml;utf-8,')) {
      svg = decodeURIComponent(svg.substring('data:image/svg+xml;utf-8,'.length));
    } else if (svg.startsWith('data:image/svg+xml;base64,')) {
      const base64 = svg.substring('data:image/svg+xml;base64,'.length);
      if (typeof atob === 'function') {
        svg = atob(base64);
      }
    } else if (svg.includes('%3Csvg') || svg.includes('%3C')) {
      svg = decodeURIComponent(svg);
    }

    svg = svg.trim();
    if (!svg.startsWith('<svg')) {
      const svgStart = svg.indexOf('<svg');
      if (svgStart !== -1) {
        svg = svg.substring(svgStart);
      }
    }

    // Ensure viewBox exists for responsive vector scaling so corner finder patterns are never clipped
    if (!svg.includes('viewBox') && !svg.includes('viewbox')) {
      const widthMatch = svg.match(/width=["']?(\d+(?:\.\d+)?)(?:px)?["']?/i);
      const heightMatch = svg.match(/height=["']?(\d+(?:\.\d+)?)(?:px)?["']?/i);
      const w = widthMatch ? widthMatch[1] : '256';
      const h = heightMatch ? heightMatch[1] : '256';
      svg = svg.replace(/<svg\b([^>]*)>/i, `<svg$1 viewBox="0 0 ${w} ${h}">`);
    }

    return svg;
  } catch (err) {
    console.error('[Security] Failed to parse SVG QR code:', err);
    return qrCodeStr;
  }
}

async function ensureOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected || !state.isInternetReachable) {
      Alert.alert('No Connection', 'You need an internet connection for this action.');
      return false;
    }
    return true;
  } catch {
    Alert.alert('No Connection', 'Unable to verify network status. Please try again.');
    return false;
  }
}

interface FeatureConfig {
  key: PermissionFeature;
  title: string;
  icon: any;
  description: string;
  rationale: string;
  sampleUse: string;
}

const FEATURES: FeatureConfig[] = [
  {
    key: 'camera',
    title: 'Camera Access',
    icon: Camera,
    description: 'Soil photo capture, leaf disease diagnostics & edge AI scans',
    rationale:
      'SoilSync needs access to your device camera to photograph soil samples, capture crop foliage, and run real-time diagnostic health analysis.',
    sampleUse: 'Used in Farm Check-up and AI Soil Scanner',
  },
  {
    key: 'location',
    title: 'Location Services',
    icon: MapPin,
    description: 'Field mapping, soil geotagging & hyper-local weather alerts',
    rationale:
      'SoilSync uses your location to map farm field boundaries, tag soil samples with exact GPS coordinates, and deliver accurate local weather telemetry.',
    sampleUse: 'Used in Field Mapping, Weather, and Sample Logs',
  },
  {
    key: 'storage',
    title: 'Phone Storage & Media',
    icon: HardDrive,
    description: 'Photo gallery uploads & offline soil report downloads',
    rationale:
      'SoilSync requires media storage access to let you choose soil photos from your gallery and download PDF diagnostic reports directly to your device.',
    sampleUse: 'Used in Photo Selection and Exporting Reports',
  },
  {
    key: 'notifications',
    title: 'Push Notifications',
    icon: Bell,
    description: 'Soil moisture alerts, weather warnings & scheduled care reminders',
    rationale:
      'SoilSync sends timely notifications when your soil moisture drops below critical levels, extreme weather approaches, or crop care tasks are due.',
    sampleUse: 'Used for Moisture Alerts and Task Schedules',
  },
];

export default function PrivacyAndSecuritySettings() {
  const router = useRouter();
  const { syncNow } = useAuth();
  const { isOnline } = useNetworkStatus();

  const [loading, setLoading] = useState(true);

  // Permission states
  const [permissionStates, setPermissionStates] = useState<
    Record<PermissionFeature, PermissionStatus>
  >({
    camera: { granted: false, userDisabled: false, sysPermissionGranted: false, canAskAgain: true },
    location: {
      granted: false,
      userDisabled: false,
      sysPermissionGranted: false,
      canAskAgain: true,
    },
    storage: {
      granted: false,
      userDisabled: false,
      sysPermissionGranted: false,
      canAskAgain: true,
    },
    notifications: {
      granted: false,
      userDisabled: false,
      sysPermissionGranted: false,
      canAskAgain: true,
    },
  });

  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaQrUri, setMfaQrUri] = useState<string | null>(null);
  const [mfaQrSvg, setMfaQrSvg] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [mfaPendingFactorId, setMfaPendingFactorId] = useState<string | null>(null);
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [showManualKey, setShowManualKey] = useState(false);

  // PIN state
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');

  // Load all permission and security states
  const loadAllSettings = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadPermissionStates(),
        loadMfaStatus(),
        loadPinStatus(),
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPermissionStates = async () => {
    try {
      const camera = await getAppPermissionState('camera');
      const location = await getAppPermissionState('location');
      const storage = await getAppPermissionState('storage');
      const notifications = await getAppPermissionState('notifications');

      setPermissionStates({ camera, location, storage, notifications });
    } catch (error) {
      console.warn('Error loading permission states:', error);
    }
  };

  const loadMfaStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        console.error('[Security] Failed to list MFA factors:', error);
        return;
      }

      const verifiedTotp = data.totp?.find((f) => f.status === 'verified');
      if (verifiedTotp) {
        setMfaEnabled(true);
        setMfaFactorId(verifiedTotp.id);
      } else {
        setMfaEnabled(false);
        setMfaFactorId(null);
      }
    } catch (err) {
      console.error('[Security] Error loading MFA status:', err);
    }
  };

  const loadPinStatus = async () => {
    try {
      // Clear legacy biometric flags so device locks rely strictly on PIN
      await Promise.all([
        SecureStore.deleteItemAsync('soilsync_biometric_enabled'),
        SecureStore.deleteItemAsync('soilsync_face_enabled'),
        SecureStore.deleteItemAsync('soilsync_fingerprint_enabled'),
      ]).catch(() => {});

      const stored = await SecureStore.getItemAsync(PIN_ENABLED_KEY);
      setPinEnabled(stored === 'true');
    } catch (err) {
      console.error('[Security] Error loading PIN status:', err);
    }
  };

  useEffect(() => {
    loadAllSettings();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        loadAllSettings();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loadAllSettings]);

  // MFA Handlers
  const handleEnrollMfa = async () => {
    if (!isOnline || !(await ensureOnline())) return;

    // 1. Instantly open modal with loading indicator
    setShowMfaModal(true);
    setMfaEnrolling(true);
    setMfaLoading(true);
    setShowManualKey(false);
    setMfaQrSvg(null);
    setMfaSecret(null);
    setMfaVerifyCode('');

    try {
      // 2. Optimistic direct enrollment in a single API call
      let enrollRes = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'SoilSync Authenticator',
        issuer: 'SoilSync',
      });

      // 3. Fallback: If enroll failed due to existing unverified factor limits, clean up in parallel & retry
      if (enrollRes.error) {
        const { data: listData } = await supabase.auth.mfa.listFactors();
        if (listData?.totp) {
          const verified = listData.totp.find((f) => f.status === 'verified');
          if (verified) {
            setMfaEnabled(true);
            setMfaFactorId(verified.id);
            setShowMfaModal(false);
            setMfaEnrolling(false);
            Alert.alert(
              'MFA Active',
              'Two-factor authentication is already active on your account.'
            );
            return;
          }

          // Clean up all unverified factors in parallel
          const unverifiedList = listData.totp.filter((f) => (f.status as string) === 'unverified');
          if (unverifiedList.length > 0) {
            await Promise.allSettled(
              unverifiedList.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id }))
            );
          }

          // Retry enroll once with issuer
          enrollRes = await supabase.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'SoilSync Authenticator',
            issuer: 'SoilSync',
          });
        }
      }

      if (enrollRes.error || !enrollRes.data) {
        setShowMfaModal(false);
        setMfaEnrolling(false);
        Alert.alert('MFA Setup Failed', enrollRes.error?.message || 'Failed to start MFA setup.');
        return;
      }

      const { data } = enrollRes;
      const parsedSvg = parseSvgString(data.totp?.qr_code);
      setMfaQrSvg(parsedSvg);
      setMfaQrUri(data.totp.uri);
      setMfaSecret(data.totp.secret);
      setMfaPendingFactorId(data.id);
    } catch (error) {
      setShowMfaModal(false);
      setMfaEnrolling(false);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to start MFA setup.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyMfa = async () => {
    if (!mfaPendingFactorId || mfaVerifyCode.length !== 6) return;

    if (!(await ensureOnline())) return;

    try {
      setMfaLoading(true);

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaPendingFactorId,
      });

      if (challengeError) {
        Alert.alert('Verification Failed', challengeError.message);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaPendingFactorId,
        challengeId: challengeData.id,
        code: mfaVerifyCode,
      });

      if (verifyError) {
        Alert.alert('Verification Failed', 'Invalid code. Please try again.');
        return;
      }

      setMfaEnabled(true);
      setMfaFactorId(mfaPendingFactorId);
      setMfaEnrolling(false);
      setShowMfaModal(false);
      setMfaQrUri(null);
      setMfaQrSvg(null);
      setMfaSecret(null);
      setMfaVerifyCode('');
      setMfaPendingFactorId(null);
      setShowManualKey(false);

      syncNow().catch((err) =>
        console.error('[Security] Background sync after MFA enroll failed:', err)
      );

      Alert.alert('MFA Enabled', 'Two-factor authentication has been successfully enabled.');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Verification failed.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleUnenrollMfa = async () => {
    if (!mfaFactorId) return;

    if (!(await ensureOnline())) return;

    Alert.alert('Disable MFA', 'Are you sure you want to disable two-factor authentication?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disable',
        style: 'destructive',
        onPress: async () => {
          try {
            setMfaLoading(true);
            const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            setMfaEnabled(false);
            setMfaFactorId(null);

            syncNow().catch((err) =>
              console.error('[Security] Background sync after MFA unenroll failed:', err)
            );

            Alert.alert('MFA Disabled', 'Two-factor authentication has been disabled.');
          } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Failed to disable MFA.');
          } finally {
            setMfaLoading(false);
          }
        },
      },
    ]);
  };

  const cancelMfaEnroll = useCallback(async () => {
    if (mfaPendingFactorId) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: mfaPendingFactorId });
      } catch {
        // Ignore cleanup errors
      }
    }
    setMfaEnrolling(false);
    setShowMfaModal(false);
    setMfaQrUri(null);
    setMfaQrSvg(null);
    setMfaSecret(null);
    setMfaVerifyCode('');
    setMfaPendingFactorId(null);
    setCopiedSecret(false);
    setShowManualKey(false);
  }, [mfaPendingFactorId]);



  const handleClosePinModal = useCallback(() => {
    Keyboard.dismiss();
    setShowPinModal(false);
    setPinInput('');
    setPinConfirm('');
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showPinModal) {
          handleClosePinModal();
          return true;
        }
        if (showMfaModal) {
          void cancelMfaEnroll();
          return true;
        }
        if (router.canGoBack()) {
          router.back();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [showPinModal, showMfaModal, handleClosePinModal, cancelMfaEnroll, router])
  );

  // PIN Handlers
  const handleTogglePin = async (value: boolean) => {
    if (value) {
      setPinStep('enter');
      setPinInput('');
      setPinConfirm('');
      setShowPinModal(true);
    } else {
      await SecureStore.deleteItemAsync(PIN_VALUE_KEY);
      await SecureStore.setItemAsync(PIN_ENABLED_KEY, 'false');
      setPinEnabled(false);
      Alert.alert('PIN Disabled', 'PIN lock has been removed.');
    }
  };

  const handlePinSubmit = async () => {
    if (pinStep === 'enter') {
      if (pinInput.length < 4 || pinInput.length > 6) {
        Alert.alert('Invalid PIN', 'PIN must be 4 to 6 digits.');
        return;
      }
      setPinStep('confirm');
      setPinConfirm('');
    } else {
      if (pinConfirm !== pinInput) {
        Alert.alert('PIN Mismatch', 'PINs do not match. Please try again.');
        setPinStep('enter');
        setPinInput('');
        setPinConfirm('');
        return;
      }

      await SecureStore.setItemAsync(PIN_VALUE_KEY, pinInput);
      await SecureStore.setItemAsync(PIN_ENABLED_KEY, 'true');
      setPinEnabled(true);
      setShowPinModal(false);
      setPinInput('');
      setPinConfirm('');

      Alert.alert('PIN Set', 'Your PIN lock has been enabled.');
    }
  };

  // Permission Switch Toggle
  const handleToggleSwitch = async (feature: FeatureConfig, currentGranted: boolean) => {
    if (!currentGranted) {
      try {
        const sys = await getSystemPermission(feature.key);
        if (sys.granted) {
          await setAppPermissionPreference(feature.key, true);
          await loadPermissionStates();
          return;
        }

        const res = await requestAppPermission(feature.key);
        await loadPermissionStates();

        if (!res.granted) {
          Alert.alert(
            'Permission Blocked in Phone Settings',
            `${feature.title} access is currently turned off in your phone settings. Would you like to open Settings to enable it?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: openPhoneSettings },
            ]
          );
        }
      } catch (error) {
        console.warn('Error requesting permission:', error);
      }
    } else {
      try {
        await setAppPermissionPreference(feature.key, false);
        await loadPermissionStates();
      } catch (error) {
        console.warn('Error disabling permission:', error);
      }
    }
  };

  return (
    <ScrollView className="flex-1 bg-champagne px-4 py-5" showsVerticalScrollIndicator={false}>
      {/* Page Title Header */}
      <View className="mb-5 px-1">
        <Text className="text-2xl font-extrabold text-espresso">Privacy & Security</Text>
        <Text className="mt-1 text-xs text-taupe">
          Manage your account protection, passcode locks, and device permissions.
        </Text>
      </View>

      {/* SECTION 1: SECURITY & LOCK */}
      <Text className="mb-2 ml-2 text-[11px] font-bold uppercase tracking-[0.2em] text-taupe">
        Security & App Lock
      </Text>

      <View className="mb-6 overflow-hidden rounded-[26px] border border-white/90 bg-white shadow-sm shadow-espresso/5">
        {/* MFA Row */}
        <View className="flex-row items-center justify-between p-4">
          <View className="flex-1 flex-row items-center pr-3">
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
              <ShieldCheck color="#8C4522" size={18} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-base font-bold text-espresso">Two-Factor Authentication</Text>
              </View>
              <Text className="mt-0.5 text-xs text-taupe">
                {mfaEnabled
                  ? 'Protected with TOTP Authenticator'
                  : 'Extra security using an authenticator app'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={mfaEnabled ? handleUnenrollMfa : handleEnrollMfa}
            disabled={mfaLoading || !isOnline}
            className={`rounded-xl border px-3.5 py-1.5 ${
              !isOnline ? 'border-taupe/30 bg-taupe/40' : mfaEnabled ? 'border-red-200 bg-red-50' : 'border-cognac bg-cognac'
            }`}>
            {mfaLoading ? (
              <ActivityIndicator size="small" color={mfaEnabled ? '#ef4444' : 'white'} />
            ) : (
              <Text
                className={`text-xs font-semibold ${mfaEnabled ? 'text-red-500' : 'text-white'}`}>
                {mfaEnabled ? 'Disable' : 'Set Up'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {!isOnline && (
          <Text className="px-4 pb-3 text-xs text-amber-800">
            Connect to the internet to set up or disable authenticator protection.
          </Text>
        )}

        {/* Divider */}
        <View className="border-t border-cognac/10" />

        {/* PIN Lock Row */}
        <View className="flex-row items-center justify-between p-4">
          <View className="flex-1 flex-row items-center pr-3">
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
              <KeyRound color="#8C4522" size={18} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-espresso">PIN Passcode</Text>
              <Text className="mt-0.5 text-xs text-taupe">
                {pinEnabled
                  ? 'Active - Passcode required to unlock'
                  : 'Set a 4–6 digit security PIN'}
              </Text>
            </View>
          </View>
          <Switch
            value={pinEnabled}
            onValueChange={handleTogglePin}
            trackColor={{ false: '#D4C4B0', true: '#8C4522' }}
            thumbColor={pinEnabled ? '#8C4522' : '#f4f3f4'}
          />
        </View>
      </View>

      {/* SECTION 2: DEVICE PERMISSIONS */}
      <Text className="mb-2 ml-2 text-[11px] font-bold uppercase tracking-[0.2em] text-taupe">
        App Permissions
      </Text>

      <View className="mb-6 overflow-hidden rounded-[26px] border border-white/90 bg-white shadow-sm shadow-espresso/5">
        {loading ? (
          <View className="items-center justify-center py-8">
            <ActivityIndicator size="small" color="#8C4522" />
            <Text className="mt-2 text-xs text-taupe">Loading permissions...</Text>
          </View>
        ) : (
          FEATURES.map((item, index) => {
            const Icon = item.icon;
            const status = permissionStates[item.key];
            const isGranted = status?.granted;

            return (
              <View key={item.key}>
                {index > 0 && <View className="border-t border-cognac/10" />}
                <View className="flex-row items-center justify-between p-4">
                  <View className="flex-1 flex-row items-center pr-3">
                    <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
                      <Icon color="#8C4522" size={18} strokeWidth={2.2} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-base font-bold text-espresso">{item.title}</Text>
                        <View
                          className={`ml-2 flex-row items-center rounded-full px-1.5 py-0.5 ${
                            isGranted ? 'bg-green-100' : 'bg-amber-100'
                          }`}>
                          {isGranted ? (
                            <Text className="text-[9px] font-bold text-emerald-800">Allowed</Text>
                          ) : (
                            <Text className="text-[9px] font-bold text-rose-700">Off</Text>
                          )}
                        </View>
                      </View>
                      <Text className="mt-0.5 text-xs text-taupe" numberOfLines={1}>
                        {item.description}
                      </Text>
                    </View>
                  </View>

                  <Switch
                    trackColor={{ false: '#D4C4B0', true: '#8C4522' }}
                    thumbColor={isGranted ? '#8C4522' : '#f4f3f4'}
                    ios_backgroundColor="#E5E7EB"
                    onValueChange={() => handleToggleSwitch(item, isGranted)}
                    value={isGranted}
                  />
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* SECTION 3: SYSTEM SETTINGS */}
      <Text className="mb-2 ml-2 text-[11px] font-bold uppercase tracking-[0.2em] text-taupe">
        Advanced
      </Text>

      <View className="mb-6 overflow-hidden rounded-[26px] border border-white/90 bg-white shadow-sm shadow-espresso/5">
        <TouchableOpacity
          onPress={openPhoneSettings}
          activeOpacity={0.7}
          className="flex-row items-center justify-between p-4">
          <View className="flex-1 flex-row items-center pr-3">
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
              <SettingsIcon color="#8C4522" size={18} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-espresso">Phone System Settings</Text>
              <Text className="mt-0.5 text-xs text-taupe">
                Manage system-level app permissions in device settings
              </Text>
            </View>
          </View>
          <ChevronRight color="#8C7C70" size={18} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* Footer Info Note */}
      <View className="mb-10 px-2">
        <Text className="text-center text-[11px] leading-4 text-taupe">
          Two-Factor Authentication protects your online SoilSync account.{'\n'}
          PIN locks secure local app access on this device.
        </Text>
      </View>

      {/* PIN Setup Modal */}
      <Modal
        visible={showPinModal}
        animationType="slide"
        transparent
        onRequestClose={handleClosePinModal}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="flex-1 items-center justify-center bg-black/50 p-6">
            <Pressable
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onPress={handleClosePinModal}
            />
            <View className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
              <View className="mb-6 flex-row items-center justify-between">
                <Text className="text-lg font-bold text-espresso">
                  {pinStep === 'enter' ? 'Set Your PIN' : 'Confirm Your PIN'}
                </Text>
                <TouchableOpacity
                  onPress={handleClosePinModal}>
                  <X color="#8C7C70" size={20} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>

              <Text className="mb-4 text-sm text-taupe">
                {pinStep === 'enter' ? 'Enter a 4–6 digit PIN.' : 'Re-enter your PIN to confirm.'}
              </Text>

              <TextInput
                className="mb-6 rounded-2xl border border-cognac/15 bg-champagne px-4 py-4 text-center text-2xl tracking-widest text-espresso"
                placeholder="••••"
                placeholderTextColor="#8C7C70"
                value={pinStep === 'enter' ? pinInput : pinConfirm}
                onChangeText={(t) => {
                  const digits = t.replace(/[^0-9]/g, '').slice(0, 6);
                  if (pinStep === 'enter') {
                    setPinInput(digits);
                  } else {
                    setPinConfirm(digits);
                  }
                }}
                keyboardType="number-pad"
                maxLength={6}
                secureTextEntry
                autoFocus
              />

              <TouchableOpacity
                className={`items-center rounded-2xl py-4 ${
                  (pinStep === 'enter' ? pinInput.length >= 4 : pinConfirm.length >= 4)
                    ? 'bg-cognac active:scale-[0.98]'
                    : 'bg-taupe/50'
                }`}
                onPress={handlePinSubmit}
                disabled={pinStep === 'enter' ? pinInput.length < 4 : pinConfirm.length < 4}>
                <Text className="text-base font-bold text-white">
                  {pinStep === 'enter' ? 'Next' : 'Set PIN'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MFA Setup Modal */}
      <Modal
        visible={showMfaModal}
        animationType="slide"
        transparent
        onRequestClose={cancelMfaEnroll}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="flex-1 items-center justify-center bg-black/60 p-5">
            <Pressable
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onPress={cancelMfaEnroll}
            />
            <View className="max-h-[88%] w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
              {/* Modal Header */}
              <View className="mb-4 flex-row items-center justify-between border-b border-cognac/15 pb-4">
                <View className="flex-1 flex-row items-center">
                  <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-cognac/10">
                    <ShieldCheck color="#8C4522" size={22} strokeWidth={2.2} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-lg font-bold text-espresso">Set Up Two-Factor MFA</Text>
                    <Text className="text-xs text-taupe">
                      Authenticator App (Google / Authy / 1Password)
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={cancelMfaEnroll} className="p-1">
                  <X color="#8C7C70" size={20} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>

              {!isOnline && (
                <Text className="mb-3 text-sm text-amber-800">
                  Connect to the internet to verify and enable authenticator protection.
                </Text>
              )}

              {/* Modal Body */}
              <ScrollView showsVerticalScrollIndicator={false} className="flex-shrink">
                {/* Step 1: QR Code & Secret */}
                <View className="mb-5">
                  <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-cognac">
                    Step 1: Scan QR Code
                  </Text>
                  <Text className="mb-3 text-xs leading-5 text-espresso">
                    Scan this QR code with your authenticator app (Google Authenticator, Microsoft
                    Authenticator, Authy, etc.):
                  </Text>

                  {/* QR Code Container */}
                  <View className="mb-3 items-center justify-center">
                    <View className="items-center justify-center rounded-3xl border border-cognac/15 bg-white p-4 shadow-sm">
                      {mfaQrSvg ? (
                        <SvgXml xml={mfaQrSvg} width={190} height={190} />
                      ) : (
                        <View className="h-48 w-48 items-center justify-center rounded-2xl bg-champagne">
                          <ActivityIndicator size="small" color="#8C4522" />
                          <Text className="mt-2 text-xs font-medium text-taupe">
                            Loading QR Code...
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Manual Secret Key Fallback */}
                  {mfaSecret && (
                    <View className="rounded-2xl border border-cognac/15 bg-champagne p-3.5">
                      <TouchableOpacity
                        onPress={() => setShowManualKey(!showManualKey)}
                        className="flex-row items-center justify-between"
                        activeOpacity={0.7}>
                        <View className="flex-1 flex-row items-center">
                          <KeyRound color="#8C4522" size={15} strokeWidth={2.2} />
                          <Text className="ml-2 text-xs font-bold text-espresso">
                            {"Can't scan the QR code?"}
                          </Text>
                        </View>
                        <Text className="text-xs font-semibold text-cognac">
                          {showManualKey ? 'Hide Secret' : 'Enter Manually'}
                        </Text>
                      </TouchableOpacity>

                      {showManualKey && (
                        <View className="mt-3 items-center border-t border-cognac/10 pt-3">
                          <Text className="mb-1 text-[11px] font-medium text-taupe">
                            Authenticator Secret Key
                          </Text>
                          <Text
                            className="mb-3 w-full rounded-xl border border-cognac/15 bg-white px-2 py-1.5 text-center font-mono text-sm font-bold tracking-widest text-espresso"
                            selectable>
                            {mfaSecret}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              setCopiedSecret(true);
                              setTimeout(() => setCopiedSecret(false), 2000);
                            }}
                            className="shadow-xs flex-row items-center rounded-xl border border-cognac/15 bg-white px-4 py-2">
                            <Check color={copiedSecret ? '#2E6F40' : '#8C4522'} size={14} strokeWidth={2.2} />
                            <Text className="ml-2 text-xs font-semibold text-espresso">
                              {copiedSecret ? 'Secret Copied!' : 'Tap to Copy Secret'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Step 2 */}
                <View className="mb-2">
                  <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-cognac">
                    Step 2: Enter Verification Code
                  </Text>
                  <Text className="mb-3 text-xs leading-5 text-espresso">
                    Enter the 6-digit code generated by your authenticator app to activate MFA:
                  </Text>

                  <TextInput
                    className={`mb-2 rounded-2xl border border-cognac/15 bg-champagne px-4 py-3.5 text-center text-2xl font-bold tracking-[0.4em] text-espresso ${!isOnline ? 'opacity-50' : ''}`}
                    placeholder="000000"
                    placeholderTextColor="#8C7C70"
                    value={mfaVerifyCode}
                    onChangeText={(t) => setMfaVerifyCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={isOnline}
                  />
                </View>
              </ScrollView>

              {/* Modal Actions */}
              <View className="mt-4 flex-row gap-3 border-t border-cognac/10 pt-4">
                <TouchableOpacity
                  className="flex-1 items-center rounded-2xl border border-taupe/30 py-3.5"
                  onPress={cancelMfaEnroll}>
                  <Text className="text-sm font-semibold text-taupe">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 items-center rounded-2xl py-3.5 shadow-sm ${
                    mfaVerifyCode.length === 6 && isOnline ? 'bg-cognac' : 'bg-taupe/40'
                  }`}
                  onPress={handleVerifyMfa}
                  disabled={mfaVerifyCode.length !== 6 || mfaLoading || !isOnline}>
                  {mfaLoading ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text className="text-sm font-bold text-white">Verify & Enable</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
