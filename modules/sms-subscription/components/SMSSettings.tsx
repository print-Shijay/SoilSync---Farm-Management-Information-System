import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity, ActivityIndicator, Platform, Pressable } from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { Modal } from '../../../components/common/AppModal';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Clock, WifiOff } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/AuthContext';
import { logUserAction } from '../../../lib/logger';
import {
  getDatabase,
  getUserSmsSettings,
  upsertUserSmsSettings,
} from '../../../lib/db-operations';
import { useRouter, useNavigation } from 'expo-router';
import { UnsavedChangesModal } from '../../../components/UnsavedChangesModal';
import { useAccessibility } from '../../../lib/accessibility';
import { useNetworkStatus } from '../../../lib/hooks/useNetworkStatus';

const SMS_BACKEND_URL = process.env.EXPO_PUBLIC_SMS_BACKEND_URL || 'http://localhost:8000';

const PRESET_TIMES = [
  { label: '6:00 AM', value: '06:00' },
  { label: '7:00 AM', value: '07:00' },
  { label: '8:00 AM', value: '08:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '5:00 PM', value: '17:00' },
  { label: '6:00 PM', value: '18:00' },
];

const parseTimeStringToDate = (timeStr: string): Date => {
  const [hours, minutes] = (timeStr || '08:00').split(':').map(Number);
  const date = new Date();
  date.setHours(isNaN(hours) ? 8 : hours, isNaN(minutes) ? 0 : minutes, 0, 0);
  return date;
};

const formatTime24 = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatTime12 = (timeStr: string): string => {
  const [hours, minutes] = (timeStr || '08:00').split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

export const SMSSettings = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { fontScale, isGloveMode, isHighContrast, triggerHaptic } = useAccessibility();
  const { isOnline } = useNetworkStatus();

  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [originalPhoneNumber, setOriginalPhoneNumber] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [originalIsSubscribed, setOriginalIsSubscribed] = useState(false);

  const [wantsWeatherSms, setWantsWeatherSms] = useState(true);
  const [originalWantsWeatherSms, setOriginalWantsWeatherSms] = useState(true);

  const [preferredTime, setPreferredTime] = useState('08:00'); // Default time in HH:mm
  const [originalPreferredTime, setOriginalPreferredTime] = useState('08:00');

  const [showIosTimePicker, setShowIosTimePicker] = useState(false);
  const [tempIosTime, setTempIosTime] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Unsaved changes navigation guard state
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const pendingActionRef = useRef<any>(null);
  const isBypassingGuardRef = useRef(false);

  const hitSlop = isGloveMode
    ? { top: 12, bottom: 12, left: 12, right: 12 }
    : { top: 6, bottom: 6, left: 6, right: 6 };
  const gloveMinHeight = isGloveMode ? 52 : undefined;

  const hasChanges = () => {
    return (
      phoneNumber !== originalPhoneNumber ||
      isSubscribed !== originalIsSubscribed ||
      wantsWeatherSms !== originalWantsWeatherSms ||
      preferredTime !== originalPreferredTime
    );
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!hasChanges() || isBypassingGuardRef.current) {
        return;
      }
      e.preventDefault();
      pendingActionRef.current = e.data.action;
      setShowUnsavedModal(true);
    });

    return unsubscribe;
  }, [
    navigation,
    phoneNumber,
    originalPhoneNumber,
    isSubscribed,
    originalIsSubscribed,
    wantsWeatherSms,
    originalWantsWeatherSms,
    preferredTime,
    originalPreferredTime,
  ]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [resendTimer]);

  useEffect(() => {
    if (userId) {
      fetchSettings();
    }
  }, [userId]);

  const fetchSettings = async () => {
    if (!userId) return;
    try {
      setLoading(true);

      // 1. Fetch phone number from local SQLite users table
      const db = getDatabase();
      const localUser = await db.get<{ phone_number: string | null }>(
        'SELECT phone_number FROM users WHERE id = ?',
        [userId]
      );
      let foundPhone = localUser?.phone_number;

      // 2. Fetch SMS settings from local SQLite user_sms_settings
      let settingsData = await getUserSmsSettings(userId);

      // Fallback check if not yet cached locally
      if (!foundPhone || !settingsData) {
        try {
          if (!foundPhone) {
            const { data: userData } = await supabase
              .from('users')
              .select('phone_number')
              .eq('id', userId)
              .maybeSingle();
            if (userData?.phone_number) {
              foundPhone = userData.phone_number;
            }
          }
          if (!settingsData) {
            const { data: cloudSettings } = await supabase
              .from('user_sms_settings')
              .select('*')
              .eq('user_id', userId)
              .maybeSingle();
            if (cloudSettings) {
              settingsData = cloudSettings as any;
            }
          }
        } catch {
          // If offline, rely strictly on local state
        }
      }

      if (foundPhone) {
        setPhoneNumber(foundPhone);
        setOriginalPhoneNumber(foundPhone);
        setIsVerified(true);
      }

      if (settingsData) {
        const subVal = settingsData.is_subscribed === 1;
        const weatherVal = settingsData.wants_weather_sms !== 0;
        const timeVal = settingsData.preferred_time ? settingsData.preferred_time.substring(0, 5) : '08:00';

        setIsSubscribed(subVal);
        setOriginalIsSubscribed(subVal);

        setWantsWeatherSms(weatherVal);
        setOriginalWantsWeatherSms(weatherVal);

        setPreferredTime(timeVal);
        setOriginalPreferredTime(timeVal);
      }
    } catch (error: any) {
      console.warn('[SMSSettings] Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (text: string) => {
    if (!isOnline) return;

    // Remove any non-numeric characters
    const numericText = text.replace(/[^0-9]/g, '');
    // If they type a leading 0, ignore it so it stays 10 digits
    const cleanText = numericText.startsWith('0') ? numericText.substring(1) : numericText;
    
    // Store as 09... in state so backend logic works as before
    const fullNumber = cleanText ? `0${cleanText}` : '';
    setPhoneNumber(fullNumber);
    
    if (fullNumber !== originalPhoneNumber) {
      setIsVerified(false);
      setAwaitingOtp(false);
      setOtpCode('');
      setResendTimer(0);
    } else {
      setIsVerified(true);
      setAwaitingOtp(false);
      setOtpCode('');
    }
  };

  const handleRequestOtp = async () => {
    triggerHaptic('medium');
    if (!isOnline) {
      Alert.alert(
        'Offline Mode',
        'You need an active internet connection to request and verify SMS OTP codes.'
      );
      return;
    }

    if (phoneNumber.length !== 11 || !phoneNumber.startsWith('09')) {
      Alert.alert('Invalid Format', 'Please enter a valid 10-digit Philippine mobile number starting with 9 (e.g. 9558364712).');
      return;
    }
    
    try {
      setVerifying(true);
      const response = await fetch(`${SMS_BACKEND_URL}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to request OTP');
      
      setAwaitingOtp(true);
      setResendTimer(300); // 5 minutes
      Alert.alert('OTP Sent', 'Please check your messages for the verification code.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyOtp = async () => {
    triggerHaptic('medium');
    if (!isOnline) {
      Alert.alert(
        'Offline Mode',
        'You need an active internet connection to verify SMS OTP codes.'
      );
      return;
    }

    if (!otpCode || otpCode.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP code.');
      return;
    }
    
    try {
      setVerifying(true);
      const response = await fetch(`${SMS_BACKEND_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber, otp_code: otpCode }),
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to verify OTP');
      
      setIsVerified(true);
      setAwaitingOtp(false);
      setOriginalPhoneNumber(phoneNumber);
      Alert.alert('Success', 'Phone number verified! You can now enable SMS Notifications.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async (onSuccessCallback?: () => void): Promise<boolean> => {
    if (!userId) return false;
    triggerHaptic('medium');

    if (!isOnline) {
      Alert.alert('Offline Mode', 'Connect to the internet to save SMS notification settings.');
      return false;
    }

    if (phoneNumber !== originalPhoneNumber) {
      if (!isVerified) {
        Alert.alert(
          'Phone Number Unverified',
          'You changed your phone number but have not verified it via OTP. Please verify your phone number or disregard the changes before leaving.'
        );
        return false;
      }
    }

    try {
      setSaving(true);

      // 1. If phone number changed, update online directly (not staged as an unverified offline mutation)
      if (phoneNumber !== originalPhoneNumber && isVerified && isOnline) {
        try {
          await supabase.from('users').update({ phone_number: phoneNumber }).eq('id', userId);
          await supabase.auth.updateUser({
            data: { phone_number: phoneNumber },
          });
        } catch (onlineErr) {
          console.warn('[SMSSettings] Online phone update notice:', onlineErr);
        }
      }

      // Confirm the server has the new preferences before reporting success to the user.
      const { error: settingsError } = await supabase.from('user_sms_settings').upsert(
        {
          user_id: userId,
          is_subscribed: isSubscribed ? 1 : 0,
          wants_weather_sms: wantsWeatherSms ? 1 : 0,
          preferred_time: `${preferredTime}:00`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        { onConflict: 'user_id' }
      );
      if (settingsError) throw settingsError;

      // Keep the local cache current while PowerSync processes the server change.
      try {
        await upsertUserSmsSettings({
          userId,
          isSubscribed,
          wantsWeatherSms: Boolean(wantsWeatherSms),
          preferredTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      } catch (localError) {
        // The server already saved the settings; PowerSync can refresh the local cache.
        console.warn('[SMSSettings] Local cache update failed:', localError);
      }

      // Update originals
      setOriginalPhoneNumber(phoneNumber);
      setOriginalIsSubscribed(isSubscribed);
      setOriginalWantsWeatherSms(wantsWeatherSms);
      setOriginalPreferredTime(preferredTime);

      // Log the action
      await logUserAction(isSubscribed ? 'SMS_SUBSCRIBED' : 'SMS_UNSUBSCRIBED', {
        wants_weather_sms: wantsWeatherSms,
        preferred_time: preferredTime,
      });

      if (onSuccessCallback) {
        onSuccessCallback();
      } else {
        Alert.alert('Success', 'SMS settings saved successfully.');
      }
      return true;
    } catch (error: any) {
      Alert.alert('Error saving settings', error.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const navigateAway = () => {
    isBypassingGuardRef.current = true;
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      navigation.dispatch(action);
    } else {
      router.back();
    }
  };

  const handleModalSave = async () => {
    const success = await handleSave(() => {
      setShowUnsavedModal(false);
      navigateAway();
    });
    if (!success) {
      setShowUnsavedModal(false);
    }
  };

  const handleModalDisregard = () => {
    setShowUnsavedModal(false);
    navigateAway();
  };

  const handleModalKeepEditing = () => {
    setShowUnsavedModal(false);
    pendingActionRef.current = null;
  };

  if (loading) {
    return <ActivityIndicator size="large" className="mt-4" />;
  }

  // Calculate the display value (strip the leading '0' if it exists)
  const displayValue = phoneNumber.startsWith('0') ? phoneNumber.substring(1) : phoneNumber;

  const openTimePicker = () => {
    triggerHaptic('selection');
    const currentDate = parseTimeStringToDate(preferredTime);

    if (Platform.OS === 'android') {
      try {
        DateTimePickerAndroid.open({
          value: currentDate,
          mode: 'time',
          is24Hour: false,
          onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
            if (event.type === 'set' && selectedDate) {
              const formatted = formatTime24(selectedDate);
              setPreferredTime(formatted);
            }
          },
        });
      } catch (err: any) {
        Alert.alert('Time Picker Error', err.message || 'Could not open native time picker.');
      }
    } else {
      // iOS and Web modal picker
      setTempIosTime(currentDate);
      setShowIosTimePicker(true);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <View className="p-5 bg-white rounded-2xl shadow-sm border border-champagne">
        <Text
          className="font-bold mb-4 text-cognac"
          style={{ fontSize: Math.round(20 * fontScale) }}
        >
          Notification Settings
        </Text>

        {!isOnline && (
          <View className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-300 flex-row items-center">
            <WifiOff size={18} color="#B45309" style={{ marginRight: 8 }} />
            <Text
              className="text-amber-900 flex-1 font-medium text-xs leading-4"
              style={{ fontSize: Math.round(12 * fontScale) }}
            >
              You are currently offline. Changing your phone number, verifying OTP, and saving SMS notification settings require an internet connection.
            </Text>
          </View>
        )}

        <View className="mb-4">
          <Text
            className="text-espresso font-semibold mb-2"
            style={{ fontSize: Math.round(14 * fontScale) }}
          >
            Phone Number
          </Text>
          <View className={`flex-row items-center border border-taupe rounded-xl overflow-hidden ${!isOnline ? 'bg-champagne/10 opacity-70' : 'bg-champagne/30'}`}>
            <View className="flex-row items-center px-3 py-3 border-r border-taupe bg-champagne/50">
              <Text style={{ fontSize: Math.round(18 * fontScale), marginRight: 8 }}>🇵🇭</Text>
              <Text
                className="text-espresso font-semibold"
                style={{ fontSize: Math.round(16 * fontScale) }}
              >
                +63
              </Text>
            </View>
            <TextInput
              className="flex-1 p-3 text-espresso bg-transparent"
              placeholder="955 836 4712"
              placeholderTextColor="#A9927D"
              value={displayValue}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              maxLength={10}
              editable={isOnline}
              accessibilityState={{ disabled: !isOnline }}
              style={{ fontSize: Math.round(16 * fontScale) }}
            />
          </View>
          {!isVerified && !awaitingOtp && (
            <TouchableOpacity 
              className={`mt-2 p-3 rounded-xl items-center justify-center ${
                !isOnline ? 'bg-taupe/50' : 'bg-espresso'
              }`}
              onPress={handleRequestOtp}
              disabled={verifying || !isOnline}
              hitSlop={hitSlop}
              style={{ minHeight: gloveMinHeight }}
            >
              <Text
                className="text-white font-bold"
                style={{ fontSize: Math.round(14 * fontScale) }}
              >
                {verifying ? 'Sending...' : !isOnline ? 'Verify Disabled (Offline)' : 'Verify Phone Number'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!isVerified && awaitingOtp && (
          <View className="mb-6 p-4 bg-champagne/50 rounded-xl border border-taupe">
            <Text
              className="text-espresso font-semibold mb-2"
              style={{ fontSize: Math.round(14 * fontScale) }}
            >
              Enter 6-digit OTP
            </Text>
            <TextInput
              className={`border border-taupe rounded-xl p-3 text-espresso mb-3 ${isOnline ? 'bg-white' : 'bg-champagne/10 opacity-70'}`}
              placeholder="XXXXXX"
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="number-pad"
              maxLength={6}
              editable={isOnline}
              accessibilityState={{ disabled: !isOnline }}
              style={{ fontSize: Math.round(16 * fontScale) }}
            />
            <TouchableOpacity 
              className={`${isOnline ? 'bg-cognac' : 'bg-taupe/50'} p-3 rounded-xl items-center justify-center`}
              onPress={handleVerifyOtp}
              disabled={verifying || !isOnline}
              hitSlop={hitSlop}
              style={{ minHeight: gloveMinHeight }}
            >
              <Text
                className="text-white font-bold"
                style={{ fontSize: Math.round(14 * fontScale) }}
              >
                {verifying ? 'Verifying...' : 'Submit OTP'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className={`p-3 rounded-xl items-center justify-center mt-3 ${resendTimer > 0 || !isOnline ? 'bg-taupe opacity-70' : 'border border-cognac'}`}
              onPress={handleRequestOtp}
              disabled={resendTimer > 0 || verifying || !isOnline}
              hitSlop={hitSlop}
              style={{ minHeight: gloveMinHeight }}
            >
              <Text
                className={`${resendTimer > 0 ? 'text-white' : 'text-cognac'} font-bold`}
                style={{ fontSize: Math.round(14 * fontScale) }}
              >
                {resendTimer > 0 ? `Resend OTP in ${formatTime(resendTimer)}` : 'Resend OTP'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isVerified && (
          <>
            <View className="flex-row justify-between items-center mb-4 mt-2">
              <Text
                className="text-espresso font-semibold flex-1 pr-2"
                style={{ fontSize: Math.round(14 * fontScale) }}
              >
                Enable SMS Reminders (Tasks)
              </Text>
              <Switch
                value={isSubscribed}
                onValueChange={(val) => {
                  triggerHaptic('selection');
                  setIsSubscribed(val);
                }}
                trackColor={{ false: '#D1D5DB', true: '#8C4522' }}
                thumbColor={isSubscribed ? '#F2ECE4' : '#f4f3f4'}
              />
            </View>

            <View className="flex-row justify-between items-center mb-4">
              <Text
                className="text-espresso font-semibold flex-1 pr-2"
                style={{ fontSize: Math.round(14 * fontScale) }}
              >
                Enable Weather Forecast Notifications
              </Text>
              <Switch
                value={wantsWeatherSms}
                onValueChange={(val) => {
                  triggerHaptic('selection');
                  setWantsWeatherSms(val);
                }}
                trackColor={{ false: '#D1D5DB', true: '#8C4522' }}
                thumbColor={wantsWeatherSms ? '#F2ECE4' : '#f4f3f4'}
              />
            </View>

        {(isSubscribed || wantsWeatherSms) && (
          <View className="mb-5">
            <Text
              className="text-espresso font-semibold mb-2"
              style={{ fontSize: Math.round(14 * fontScale) }}
            >
              Preferred Delivery Time
            </Text>
            
            {/* Interactive Time Selector Card */}
            <TouchableOpacity
              activeOpacity={0.75}
              className="border border-taupe rounded-2xl p-4 bg-champagne/30 flex-row items-center justify-between"
              onPress={openTimePicker}
              hitSlop={hitSlop}
              style={{ minHeight: gloveMinHeight }}
            >
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-cognac/10 items-center justify-center border border-cognac/20">
                  <Clock size={Math.round(20 * fontScale)} color="#8C4522" />
                </View>
                <View>
                  <Text
                    className="text-espresso font-bold"
                    style={{ fontSize: Math.round(18 * fontScale) }}
                  >
                    {formatTime12(preferredTime)}
                  </Text>
                  <Text
                    className="text-taupe font-medium"
                    style={{ fontSize: Math.round(12 * fontScale) }}
                  >
                    Standard 24h format: {preferredTime}
                  </Text>
                </View>
              </View>
              <View className="bg-cognac/10 px-3.5 py-2 rounded-xl border border-cognac/30">
                <Text
                  className="text-cognac font-bold"
                  style={{ fontSize: Math.round(12 * fontScale) }}
                >
                  Change
                </Text>
              </View>
            </TouchableOpacity>

            {/* Quick Presets */}
            <View className="mt-3">
              <Text
                className="text-taupe font-semibold mb-2 uppercase tracking-wider"
                style={{ fontSize: Math.round(11 * fontScale) }}
              >
                Quick Presets
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {PRESET_TIMES.map((preset) => {
                  const isSelected = preferredTime === preset.value;
                  return (
                    <TouchableOpacity
                      key={preset.value}
                      activeOpacity={0.8}
                      onPress={() => {
                        triggerHaptic('selection');
                        setPreferredTime(preset.value);
                      }}
                      hitSlop={hitSlop}
                      className={`px-3 py-2 rounded-xl border items-center justify-center ${
                        isSelected
                          ? 'bg-cognac border-cognac shadow-sm'
                          : 'bg-white border-taupe/40'
                      }`}
                      style={{ minHeight: isGloveMode ? 46 : undefined }}
                    >
                      <Text
                        className={`font-bold ${
                          isSelected ? 'text-white' : 'text-espresso'
                        }`}
                        style={{ fontSize: Math.round(12 * fontScale) }}
                      >
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* iOS Modal Spinner */}
            {Platform.OS === 'ios' && (
              <Modal
                visible={showIosTimePicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowIosTimePicker(false)}
              >
                <View className="flex-1 justify-end bg-black/50">
                  <Pressable className="flex-1" onPress={() => setShowIosTimePicker(false)} />
                  <View className="bg-white rounded-t-3xl p-6 shadow-xl border-t border-taupe/20">
                    <View className="flex-row justify-between items-center mb-4">
                      <Text
                        className="font-bold text-espresso"
                        style={{ fontSize: Math.round(18 * fontScale) }}
                      >
                        Select Delivery Time
                      </Text>
                      <TouchableOpacity
                        hitSlop={hitSlop}
                        onPress={() => setShowIosTimePicker(false)}
                      >
                        <Text
                          className="text-taupe font-semibold"
                          style={{ fontSize: Math.round(16 * fontScale) }}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <DateTimePicker
                      value={tempIosTime}
                      mode="time"
                      display="spinner"
                      is24Hour={false}
                      onChange={(_event: DateTimePickerEvent, date?: Date) => {
                        if (date) setTempIosTime(date);
                      }}
                      textColor="#2E1F14"
                    />

                    <TouchableOpacity
                      className="mt-4 bg-cognac p-4 rounded-xl items-center justify-center"
                      hitSlop={hitSlop}
                      style={{ minHeight: gloveMinHeight }}
                      onPress={() => {
                        triggerHaptic('selection');
                        setPreferredTime(formatTime24(tempIosTime));
                        setShowIosTimePicker(false);
                      }}
                    >
                      <Text
                        className="text-white font-bold"
                        style={{ fontSize: Math.round(16 * fontScale) }}
                      >
                        Confirm Time
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            )}
          </View>
        )}
          </>
        )}

        <TouchableOpacity
          className={`p-4 rounded-xl items-center justify-center mt-4 ${isVerified && !saving && isOnline ? 'bg-cognac' : 'bg-taupe'}`}
          onPress={() => handleSave()}
          disabled={saving || !isVerified || !isOnline}
          hitSlop={hitSlop}
          style={{ minHeight: isGloveMode ? 54 : undefined }}
        >
          <Text
            className="text-white font-bold"
            style={{ fontSize: Math.round(16 * fontScale) }}
          >
            {saving ? 'Saving...' : !isOnline ? 'Save Disabled (Offline)' : 'Save Settings'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Unsaved Changes Modal */}
      <UnsavedChangesModal
        visible={showUnsavedModal}
        onSave={handleModalSave}
        onDisregard={handleModalDisregard}
        onKeepEditing={handleModalKeepEditing}
        saving={saving}
        saveDisabled={!isOnline || !isVerified}
        title="Unsaved Notification Settings"
        description={isOnline
          ? 'You have unsaved changes to your notification settings. Would you like to save these changes before leaving, or disregard them?'
          : 'Connect to the internet to save these settings, or disregard your changes before leaving.'}
      />
    </>
  );
};

