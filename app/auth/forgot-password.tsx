import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { supabase } from '../../lib/supabase';
import * as Network from 'expo-network';
import { useRouter } from 'expo-router';
import { Mail, KeyRound, Lock, Eye, EyeOff, Check, X, ArrowLeft } from 'lucide-react-native';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';

async function ensureOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected || !state.isInternetReachable) {
      Alert.alert('No Connection', 'You need an internet connection to reset your password.');
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
  {
    label: 'At least 1 special character (!@#$...)',
    test: (pw) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pw),
  },
];

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { isOnline } = useNetworkStatus();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentWidth = Math.min(width - insets.left - insets.right, 480);
  const horizontalPadding = Math.max(16, Math.min(28, (contentWidth - 280) / 4));
  const compact = height - insets.top - insets.bottom < 700;

  // Wizard Step: 1 = Request OTP, 2 = Verify OTP, 3 = Reset Password
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  // MFA states
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  // Password rules validation
  const ruleResults = useMemo(() => {
    return PASSWORD_RULES.map((rule) => ({
      ...rule,
      passed: rule.test(newPassword),
    }));
  }, [newPassword]);

  const allRulesPassed = ruleResults.every((r) => r.passed);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const strengthScore = ruleResults.filter((r) => r.passed).length;
  const strengthColor = (() => {
    if (strengthScore <= 2) return '#ef4444';
    if (strengthScore <= 3) return '#f59e0b';
    if (strengthScore <= 4) return '#3b82f6';
    return '#22c55e';
  })();
  const strengthLabel = (() => {
    if (newPassword.length === 0) return '';
    if (strengthScore <= 2) return 'Weak';
    if (strengthScore <= 3) return 'Fair';
    if (strengthScore <= 4) return 'Good';
    return 'Strong';
  })();

  // ===== STEP 1: Request OTP =====
  const handleRequestOtp = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }

    if (!(await ensureOnline())) return;

    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

      if (error) {
        Alert.alert('Request Failed', error.message);
        return;
      }

      Alert.alert('OTP Sent', 'A verification code has been sent to your email.');
      setStep(2);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send OTP code.');
    } finally {
      setLoading(false);
    }
  };

  // ===== STEP 2: Verify OTP =====
  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6 && otpCode.length !== 8) {
      Alert.alert('Error', 'Please enter the verification code.');
      return;
    }

    if (!(await ensureOnline())) return;

    try {
      setLoading(true);
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: 'recovery',
      });

      if (error) {
        Alert.alert('Verification Failed', 'Invalid or expired OTP code. Please try again.');
        return;
      }

      // Check if user has MFA enabled and requires session elevation to AAL2
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totpFactor = factors?.totp?.find((f) => f.status === 'verified');
        if (totpFactor) {
          setMfaFactorId(totpFactor.id);
          setRequiresMfa(true);
          return;
        }
      }

      setStep(3);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  // ===== MFA verification to reach AAL2 =====
  const handleVerifyMfa = async () => {
    if (mfaCode.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit authenticator code.');
      return;
    }

    if (!mfaFactorId) {
      Alert.alert('Error', 'MFA factor details not found.');
      return;
    }

    if (!(await ensureOnline())) return;

    try {
      setMfaLoading(true);
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId,
      });

      if (challengeError) {
        Alert.alert('Verification Failed', challengeError.message);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challengeData.id,
        code: mfaCode.trim(),
      });

      if (verifyError) {
        Alert.alert('Verification Failed', verifyError.message);
        return;
      }

      // Session elevated to AAL2, ready for password update
      setStep(3);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'MFA verification failed.');
    } finally {
      setMfaLoading(false);
    }
  };

  // ===== STEP 3: Reset Password =====
  const handleResetPassword = async () => {
    if (!allRulesPassed) {
      Alert.alert('Validation Error', 'Please satisfy all password strength requirements.');
      return;
    }

    if (!passwordsMatch) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return;
    }

    if (!(await ensureOnline())) return;

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        Alert.alert('Reset Failed', error.message);
        return;
      }

      Alert.alert('Success', 'Your password has been reset successfully!', [
        { text: 'Go to Home', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: horizontalPadding, paddingVertical: compact ? 16 : 24 },
        ]}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="mb-6">
          <Text className="mb-2 text-2xl leading-8 font-extrabold text-cognac">Reset Password</Text>
          <Text className="text-base leading-6 text-espresso">
            {step === 1 && 'Enter your email to receive a verification code.'}
            {step === 2 && `Enter the verification code sent to ${email}`}
            {step === 3 && 'Create a new strong password for your account.'}
          </Text>
        </View>

        {!isOnline && (
          <View className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <Text className="text-sm text-amber-900">
              Connect to the internet to request or verify a code and reset your password.
            </Text>
          </View>
        )}

        {/* Step Indicator */}
        <View className="flex-row items-center mb-8">
          <View
            className={`min-w-8 min-h-8 p-1 rounded-full items-center justify-center ${step >= 1 ? 'bg-cognac' : 'bg-taupe/30'}`}>
            <Text className="text-white text-sm leading-5 font-bold">1</Text>
          </View>
          <View className={`flex-1 h-1 ${step >= 2 ? 'bg-cognac' : 'bg-taupe/30'}`} />
          <View
            className={`min-w-8 min-h-8 p-1 rounded-full items-center justify-center ${step >= 2 ? 'bg-cognac' : 'bg-taupe/30'}`}>
            <Text className="text-white text-sm leading-5 font-bold">2</Text>
          </View>
          <View className={`flex-1 h-1 ${step >= 3 ? 'bg-cognac' : 'bg-taupe/30'}`} />
          <View
            className={`min-w-8 min-h-8 p-1 rounded-full items-center justify-center ${step >= 3 ? 'bg-cognac' : 'bg-taupe/30'}`}>
            <Text className="text-white text-sm leading-5 font-bold">3</Text>
          </View>
        </View>

        {/* ===== STEP 1: Email Form ===== */}
        {step === 1 && (
          <View>
            <Text className="mb-2 text-base leading-6 font-semibold text-espresso">
              Email Address
            </Text>
            <View className="mb-6 flex-row items-center rounded-lg border border-taupe/50 bg-white pl-3 pr-2 min-h-[52px]">
              <Mail color="#8C4522" size={20} />
              <TextInput
                className="ml-3 min-w-0 flex-1 py-3 text-espresso text-base"
                placeholder="your@email.com"
                placeholderTextColor="#8C7C70"
                value={email}
                onChangeText={setEmail}
                maxLength={255}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <TouchableOpacity
              className={`rounded-lg min-h-[52px] px-4 py-3 mb-4 flex-row items-center justify-center ${
                email.trim() && !loading && isOnline ? 'bg-cognac active:opacity-80' : 'bg-taupe/50'
              }`}
              onPress={handleRequestOtp}
              disabled={!email.trim() || loading || !isOnline}>
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="flex-shrink text-center text-base leading-6 font-bold text-white">
                  Send OTP Code
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ===== STEP 2: OTP / MFA Verification Form ===== */}
        {step === 2 &&
          (requiresMfa ? (
            <View>
              <Text className="mb-2 text-base leading-6 font-semibold text-espresso">
                MFA Authenticator Code
              </Text>
              <Text className="mb-4 text-sm leading-5 text-espresso/80">
                Your account has Multi-Factor Authentication enabled. Please enter the 6-digit code
                from your authenticator app to authorize the password reset.
              </Text>
              <View className="mb-6 flex-row items-center rounded-lg border border-taupe/50 bg-white pl-3 pr-2 min-h-[52px]">
                <KeyRound color="#8C4522" size={20} />
                <TextInput
                  className="ml-3 min-w-0 flex-1 py-3 text-espresso text-lg font-mono tracking-wide text-center"
                  placeholder="000000"
                  placeholderTextColor="#8C7C70"
                  value={mfaCode}
                  onChangeText={(t) => setMfaCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              <TouchableOpacity
                className={`rounded-lg min-h-[52px] px-4 py-3 mb-4 flex-row items-center justify-center ${
                  mfaCode.length === 6 && !mfaLoading && isOnline
                    ? 'bg-cognac active:opacity-80'
                    : 'bg-taupe/50'
                }`}
                onPress={handleVerifyMfa}
                disabled={mfaCode.length !== 6 || mfaLoading || !isOnline}>
                {mfaLoading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="flex-shrink text-center text-base leading-6 font-bold text-white">
                    Verify Authenticator Code
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                className="min-h-11 px-3 py-2 items-center justify-center"
                onPress={() => {
                  setRequiresMfa(false);
                  setStep(1);
                }}
                disabled={mfaLoading}>
                <Text className="text-center text-sm leading-5 text-cognac font-semibold">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text className="mb-2 text-base leading-6 font-semibold text-espresso">
                Verification Code
              </Text>
              <View className="mb-6 flex-row items-center rounded-lg border border-taupe/50 bg-white pl-3 pr-2 min-h-[52px]">
                <KeyRound color="#8C4522" size={20} />
                <TextInput
                  className="ml-3 min-w-0 flex-1 py-3 text-espresso text-lg font-mono tracking-wide text-center"
                  placeholder="00000000"
                  placeholderTextColor="#8C7C70"
                  value={otpCode}
                  onChangeText={(t) => setOtpCode(t.replace(/[^0-9]/g, '').slice(0, 8))}
                  keyboardType="number-pad"
                  maxLength={8}
                />
              </View>

              <TouchableOpacity
                className={`rounded-lg min-h-[52px] px-4 py-3 mb-4 flex-row items-center justify-center ${
                  (otpCode.length === 6 || otpCode.length === 8) && !loading && isOnline
                    ? 'bg-cognac active:opacity-80'
                    : 'bg-taupe/50'
                }`}
                onPress={handleVerifyOtp}
                disabled={(otpCode.length !== 6 && otpCode.length !== 8) || loading || !isOnline}>
                {loading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="flex-shrink text-center text-base leading-6 font-bold text-white">
                    Verify OTP
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                className="min-h-11 px-3 py-2 items-center justify-center"
                onPress={handleRequestOtp}
                disabled={loading || !isOnline}>
                <Text className="text-center text-sm leading-5 text-cognac font-semibold">
                  Resend OTP Code
                </Text>
              </TouchableOpacity>
            </View>
          ))}

        {/* ===== STEP 3: Reset Password Form ===== */}
        {step === 3 && (
          <View>
            {/* New Password */}
            <Text className="mb-2 text-base leading-6 font-semibold text-espresso">
              New Password
            </Text>
            <View className="mb-4 flex-row items-center rounded-lg border border-taupe/50 bg-white pl-3 pr-2 min-h-[52px]">
              <Lock color="#8C4522" size={20} />
              <TextInput
                className="ml-3 min-w-0 flex-1 py-3 text-espresso text-base"
                placeholder="••••••••"
                placeholderTextColor="#8C7C70"
                value={newPassword}
                onChangeText={setNewPassword}
                maxLength={255}
                secureTextEntry={!showNewPassword}
              />
              <TouchableOpacity
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
                onPress={() => setShowNewPassword(!showNewPassword)}>
                {showNewPassword ? (
                  <EyeOff color="#8C7C70" size={20} />
                ) : (
                  <Eye color="#8C7C70" size={20} />
                )}
              </TouchableOpacity>
            </View>

            {/* Strength Bar */}
            {newPassword.length > 0 && (
              <View className="mb-4">
                <View className="flex-row items-center mb-2">
                  <View className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden mr-3">
                    <View
                      style={{
                        width: `${(strengthScore / PASSWORD_RULES.length) * 100}%`,
                        backgroundColor: strengthColor,
                        height: '100%',
                        borderRadius: 999,
                      }}
                    />
                  </View>
                  <Text
                    style={{ color: strengthColor }}
                    className="flex-shrink text-sm leading-5 font-semibold">
                    {strengthLabel}
                  </Text>
                </View>

                {/* Rule Checklist */}
                <View className="bg-white/70 rounded-xl p-3 border border-taupe/30">
                  {ruleResults.map((rule, index) => (
                    <View key={index} className="flex-row items-center py-1">
                      {rule.passed ? (
                        <Check color="#22c55e" size={16} />
                      ) : (
                        <X color="#d1d5db" size={16} />
                      )}
                      <Text
                        className={`ml-2 flex-1 text-sm leading-5 ${rule.passed ? 'text-green-600' : 'text-taupe'}`}>
                        {rule.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Confirm New Password */}
            <Text className="mb-2 text-base leading-6 font-semibold text-espresso">
              Confirm New Password
            </Text>
            <View className="mb-6 flex-row items-center rounded-lg border border-taupe/50 bg-white pl-3 pr-2 min-h-[52px]">
              <Lock color="#8C4522" size={20} />
              <TextInput
                className="ml-3 min-w-0 flex-1 py-3 text-espresso text-base"
                placeholder="••••••••"
                placeholderTextColor="#8C7C70"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                maxLength={255}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel={
                  showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                }
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                {showConfirmPassword ? (
                  <EyeOff color="#8C7C70" size={20} />
                ) : (
                  <Eye color="#8C7C70" size={20} />
                )}
              </TouchableOpacity>
            </View>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <Text className="mb-4 text-sm leading-5 text-red-500 ml-1">
                Passwords do not match.
              </Text>
            )}

            <TouchableOpacity
              className={`rounded-lg min-h-[52px] px-4 py-3 mb-4 flex-row items-center justify-center ${
                allRulesPassed && passwordsMatch && !loading && isOnline
                  ? 'bg-cognac active:opacity-80'
                  : 'bg-taupe/50'
              }`}
              onPress={handleResetPassword}
              disabled={!allRulesPassed || !passwordsMatch || loading || !isOnline}>
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="flex-shrink text-center text-base leading-6 font-bold text-white">
                  Update Password
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Back to Login */}
        <TouchableOpacity
          className="mt-4 min-h-11 flex-row items-center justify-center px-3 py-2"
          onPress={() => router.replace('/auth/login')}>
          <ArrowLeft color="#8C4522" size={18} />
          <Text className="ml-2 flex-shrink text-center font-semibold text-cognac text-base leading-6">
            Back to Login
          </Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FBF8F4' },
  scrollView: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    flexGrow: 1,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
