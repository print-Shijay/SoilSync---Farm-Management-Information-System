import { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { useAuth, userHasPassword } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import * as Network from 'expo-network';
import { useRouter, useNavigation } from 'expo-router';
import { Eye, EyeOff, Check, X, Lock, Info, WifiOff } from 'lucide-react-native';
import { UnsavedChangesModal } from '../../components/UnsavedChangesModal';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';

async function ensureOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected || !state.isInternetReachable) {
      Alert.alert('No Connection', 'You need an internet connection to update your password.');
      return false;
    }
    return true;
  } catch {
    Alert.alert('No Connection', 'Unable to verify network status. Please try again.');
    return false;
  }
}

interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'At least 1 uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'At least 1 lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'At least 1 number', test: (pw) => /[0-9]/.test(pw) },
  { label: 'At least 1 special character (!@#$...)', test: (pw) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pw) },
];

export default function ChangePassword() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, updatePassword } = useAuth();
  const { isOnline } = useNetworkStatus();
  const hasPassword = userHasPassword(user);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Set navigation header title dynamically
  useEffect(() => {
    navigation.setOptions({
      title: hasPassword ? 'Change Password' : 'Set Password',
    });
  }, [navigation, hasPassword]);

  // Unsaved changes navigation guard state
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const pendingActionRef = useRef<any>(null);
  const isBypassingGuardRef = useRef(false);

  const hasChanges = () => {
    return (hasPassword ? currentPassword.length > 0 : false) || newPassword.length > 0 || confirmPassword.length > 0;
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
  }, [navigation, currentPassword, newPassword, confirmPassword, hasPassword]);

  const ruleResults = useMemo(() => {
    return PASSWORD_RULES.map((rule) => ({
      ...rule,
      passed: rule.test(newPassword),
    }));
  }, [newPassword]);

  const allRulesPassed = ruleResults.every((r) => r.passed);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const strengthScore = ruleResults.filter((r) => r.passed).length;
  const strengthLabel = (() => {
    if (newPassword.length === 0) return '';
    if (strengthScore <= 2) return 'Weak';
    if (strengthScore <= 3) return 'Fair';
    if (strengthScore <= 4) return 'Good';
    return 'Strong';
  })();
  const strengthColor = (() => {
    if (strengthScore <= 2) return '#ef4444';
    if (strengthScore <= 3) return '#f59e0b';
    if (strengthScore <= 4) return '#3b82f6';
    return '#22c55e';
  })();

  const canSubmit =
    (hasPassword ? currentPassword.length > 0 : true) &&
    allRulesPassed &&
    passwordsMatch &&
    !loading;

  const handleChangePassword = async (onSuccessCallback?: () => void): Promise<boolean> => {
    if (hasPassword && !currentPassword) {
      Alert.alert('Validation Error', 'Please enter your current password.');
      return false;
    }
    if (!allRulesPassed) {
      Alert.alert('Validation Error', 'New password does not meet all complexity requirements.');
      return false;
    }
    if (!passwordsMatch) {
      Alert.alert('Validation Error', 'New password and confirmation do not match.');
      return false;
    }

    if (!(await ensureOnline())) return false;

    try {
      setLoading(true);

      if (hasPassword) {
        // Re-authenticate with current password
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user?.email || '',
          password: currentPassword,
        });

        if (signInError) {
          Alert.alert('Verification Failed', 'Your current password is incorrect.');
          return false;
        }
      }

      // Update or set the password
      await updatePassword(newPassword);

      const successTitle = hasPassword ? 'Password Changed' : 'Password Created';
      const successMessage = hasPassword
        ? 'Your password has been changed successfully.'
        : 'Your password has been set successfully. You can now log in using either your Google account or your email and password.';

      if (onSuccessCallback) {
        onSuccessCallback();
      } else {
        Alert.alert(successTitle, successMessage, [
          { text: 'OK', onPress: () => navigateAway() },
        ]);
      }
      return true;
    } catch (error) {
      Alert.alert(
        hasPassword ? 'Password Change Failed' : 'Failed to Set Password',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
      return false;
    } finally {
      setLoading(false);
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
    const success = await handleChangePassword(() => {
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

  return (
    <>
      <ScrollView className="flex-1 bg-champagne p-5" keyboardShouldPersistTaps="handled">
        {/* Offline Warning Banner */}
        {!isOnline && (
          <View className="bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-5 flex-row items-center">
            <WifiOff color="#B45309" size={20} strokeWidth={2.2} />
            <View className="ml-3 flex-1">
              <Text className="text-amber-900 font-bold text-sm mb-0.5">Offline Mode</Text>
              <Text className="text-amber-800 text-xs leading-4">
                You are currently offline. Changing or setting your account password requires an active internet connection.
              </Text>
            </View>
          </View>
        )}

        {/* Info Banner for Google Users Without a Password */}
        {!hasPassword && (
          <View className="bg-cognac/10 border border-cognac/20 rounded-2xl p-4 mb-5 flex-row items-start">
            <Info color="#8C4522" size={20} strokeWidth={2.2} />
            <View className="ml-3 flex-1">
              <Text className="text-espresso font-bold text-base mb-1">Set Account Password</Text>
              <Text className="text-espresso/80 text-sm leading-5">
                You currently sign in using Google. Create a password below so you can also log in with your email address ({user?.email}) and password.
              </Text>
            </View>
          </View>
        )}

        {/* Current Password (only shown if user already has a password) */}
        {hasPassword && (
          <View className="mb-5">
            <View className="flex-row items-center mb-2">
              <Lock color="#8C4522" size={18} strokeWidth={2.2} />
              <Text className="ml-2 text-base font-semibold text-espresso">Current Password</Text>
            </View>
            <View className={`flex-row items-center rounded-2xl border ${!isOnline ? 'bg-champagne/10 border-taupe/30 opacity-70' : 'bg-white border-champagne'}`}>
              <TextInput
                className="flex-1 px-4 py-3.5 text-espresso text-base"
                placeholder="Enter current password"
                placeholderTextColor="#8C7C70"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                maxLength={255}
                secureTextEntry={!showCurrent}
                editable={isOnline}
              />
              <TouchableOpacity className="pr-4" onPress={() => setShowCurrent(!showCurrent)}>
                {showCurrent ? <EyeOff color="#8C7C70" size={20} strokeWidth={2.2} /> : <Eye color="#8C7C70" size={20} strokeWidth={2.2} />}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* New Password */}
        <View className="mb-4">
          <View className="flex-row items-center mb-2">
            <Lock color="#8C4522" size={18} strokeWidth={2.2} />
            <Text className="ml-2 text-base font-semibold text-espresso">
              {hasPassword ? 'New Password' : 'Password'}
            </Text>
          </View>
          <View className={`flex-row items-center rounded-2xl border ${!isOnline ? 'bg-champagne/10 border-taupe/30 opacity-70' : 'bg-white border-champagne'}`}>
            <TextInput
              className="flex-1 px-4 py-3.5 text-espresso text-base"
              placeholder={hasPassword ? 'Enter new password' : 'Enter password'}
              placeholderTextColor="#8C7C70"
              value={newPassword}
              onChangeText={setNewPassword}
              maxLength={255}
              secureTextEntry={!showNew}
              editable={isOnline}
            />
            <TouchableOpacity className="pr-4" onPress={() => setShowNew(!showNew)}>
              {showNew ? <EyeOff color="#8C7C70" size={20} strokeWidth={2.2} /> : <Eye color="#8C7C70" size={20} strokeWidth={2.2} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Strength Indicator */}
        {newPassword.length > 0 && (
          <View className="mb-4">
            <View className="flex-row items-center mb-2">
              <View className="flex-1 h-2 rounded-full bg-black/10 overflow-hidden mr-3">
                <View
                  style={{
                    width: `${(strengthScore / PASSWORD_RULES.length) * 100}%`,
                    backgroundColor: strengthColor,
                    height: '100%',
                    borderRadius: 999,
                  }}
                />
              </View>
              <Text style={{ color: strengthColor }} className="text-sm font-semibold">
                {strengthLabel}
              </Text>
            </View>

            {/* Rule Checklist */}
            <View className="bg-white/70 rounded-2xl p-3 border border-champagne/50">
              {ruleResults.map((rule, index) => (
                <View key={index} className="flex-row items-center py-1">
                  {rule.passed ? (
                    <Check color="#22c55e" size={16} strokeWidth={2.5} />
                  ) : (
                    <X color="#8C7C70" size={16} strokeWidth={2.2} />
                  )}
                  <Text
                    className={`ml-2 text-sm ${rule.passed ? 'text-green-600' : 'text-taupe'}`}
                  >
                    {rule.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Confirm Password */}
        <View className="mb-5">
          <View className="flex-row items-center mb-2">
            <Lock color="#8C4522" size={18} strokeWidth={2.2} />
            <Text className="ml-2 text-base font-semibold text-espresso">
              {hasPassword ? 'Confirm New Password' : 'Confirm Password'}
            </Text>
          </View>
          <View className={`flex-row items-center rounded-2xl border ${!isOnline ? 'bg-champagne/10 border-taupe/30 opacity-70' : 'bg-white border-champagne'}`}>
            <TextInput
              className="flex-1 px-4 py-3.5 text-espresso text-base"
              placeholder={hasPassword ? 'Re-enter new password' : 'Confirm password'}
              placeholderTextColor="#8C7C70"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              maxLength={255}
              secureTextEntry={!showConfirm}
              editable={isOnline}
            />
            <TouchableOpacity className="pr-4" onPress={() => setShowConfirm(!showConfirm)}>
              {showConfirm ? <EyeOff color="#8C7C70" size={20} strokeWidth={2.2} /> : <Eye color="#8C7C70" size={20} strokeWidth={2.2} />}
            </TouchableOpacity>
          </View>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <Text className="mt-1.5 text-xs text-red-500 ml-1">Passwords do not match.</Text>
          )}
          {passwordsMatch && (
            <Text className="mt-1.5 text-xs text-green-600 ml-1">✓ Passwords match.</Text>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          className={`mt-2 rounded-2xl py-4 flex-row items-center justify-center ${
            canSubmit && isOnline ? 'bg-cognac active:opacity-80' : 'bg-taupe/50'
          }`}
          onPress={() => handleChangePassword()}
          disabled={!canSubmit || !isOnline}
        >
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <>
              <Lock color="white" size={20} />
              <Text className="ml-2 text-white font-bold text-lg">
                {hasPassword ? 'Change Password' : 'Set Password'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Unsaved Changes Modal */}
      <UnsavedChangesModal
        visible={showUnsavedModal}
        onSave={handleModalSave}
        onDisregard={handleModalDisregard}
        onKeepEditing={handleModalKeepEditing}
        saving={loading}
        saveDisabled={!isOnline}
        title={hasPassword ? 'Unsaved Password Changes' : 'Unsaved Password'}
        description={
          hasPassword
            ? 'You have entered information in the password form. Would you like to submit your new password before leaving, or disregard these changes?'
            : 'You have entered a new password. Would you like to set your password before leaving, or disregard these changes?'
        }
        saveButtonText={hasPassword ? 'Save Password' : 'Set Password'}
      />
    </>
  );
}

