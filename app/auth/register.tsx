import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';
import { AuthFormLayout, authFormStyles } from '../../components/auth/AuthFormLayout';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, Eye, EyeOff, Check, User, X } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../../lib/AuthContext';
import { LegalModal } from '../../components/LegalModal';

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

// Google multi-color SVG icon component
function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </Svg>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  const { isOnline } = useNetworkStatus();

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'terms' | 'privacy' | null>(null);

  const { signUp, signInWithGoogle } = useAuth();

  const ruleResults = useMemo(() => {
    return PASSWORD_RULES.map((rule) => ({
      ...rule,
      passed: rule.test(password),
    }));
  }, [password]);

  const allRulesPassed = ruleResults.every((r) => r.passed);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const strengthScore = ruleResults.filter((r) => r.passed).length;
  const strengthLabel = (() => {
    if (password.length === 0) return '';
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

  const handleRegister = async () => {
    if (!isOnline) return;
    if (!firstName || !email || !password) {
      Alert.alert('Error', 'Please enter your first name, email, and password.');
      return;
    }

    if (!allRulesPassed) {
      Alert.alert(
        'Weak Password',
        'Please ensure your password satisfies all password requirements.'
      );
      return;
    }

    if (!passwordsMatch) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return;
    }

    if (!agreeToTerms) {
      Alert.alert(
        'Agreement Required',
        'Please agree to the Terms of Service and Privacy Policy to create an account.'
      );
      return;
    }

    setLoading(true);
    const { error } = await signUp(email.trim(), password, firstName.trim(), lastName.trim());
    setLoading(false);

    if (error) {
      Alert.alert('Registration Failed', error.message);
    } else {
      Alert.alert('Success', 'Account created! Please check your email to verify.', [
        { text: 'OK', onPress: () => router.replace('/auth/login') },
      ]);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isOnline) return;
    try {
      setGoogleLoading(true);
      const res = await signInWithGoogle();

      if (res?.error) {
        if (res.error.message !== 'Google sign-in was cancelled.') {
          Alert.alert('Google Sign-In Error', res.error.message);
        }
        return;
      }

      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert(
        'Google Sign-In Error',
        err instanceof Error ? err.message : 'An unexpected error occurred during Google Sign-In.'
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/loading-background.png')}
      style={styles.fullBackground}
      resizeMode="cover">
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.8)']}
        style={StyleSheet.absoluteFillObject}
      />

      <AuthFormLayout title="Create Your Account and Simplify Your Workday">
        {/* Title */}
        <Text style={styles.sheetTitle}>Sign up</Text>

        {!isOnline && (
          <Text className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Connect to the internet to create an account.
          </Text>
        )}

        {/* Toggle Link */}
        <View style={styles.toggleLinkRow}>
          <Text style={styles.toggleLinkSubtext}>Already Have An Account? </Text>
          <TouchableOpacity
            style={styles.textLinkButton}
            onPress={() => router.push('/auth/login')}>
            <Text style={styles.toggleLinkCognac}>Log In</Text>
          </TouchableOpacity>
        </View>

        {/* Functional Form Fields */}
        <View style={styles.formSection}>
          {/* Field 1: First Name */}
          <View style={styles.inputWrapper}>
            <User color="#A9927D" size={18} style={styles.leftIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="First Name"
              placeholderTextColor="#A9927D"
              value={firstName}
              onChangeText={setFirstName}
              maxLength={255}
              autoCapitalize="words"
            />
          </View>

          {/* Field 2: Last Name */}
          <View style={styles.inputWrapper}>
            <User color="#A9927D" size={18} style={styles.leftIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="Last Name"
              placeholderTextColor="#A9927D"
              value={lastName}
              onChangeText={setLastName}
              maxLength={255}
              autoCapitalize="words"
            />
          </View>

          {/* Field 3: Email Input */}
          <View style={styles.inputWrapper}>
            <Mail color="#A9927D" size={18} style={styles.leftIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="Enter your email address"
              placeholderTextColor="#A9927D"
              value={email}
              onChangeText={setEmail}
              maxLength={255}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* Field 4: Password */}
          <View style={styles.inputWrapper}>
            <Lock color="#A9927D" size={18} style={styles.leftIcon} />
            <TextInput
              style={[styles.textInput, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor="#A9927D"
              value={password}
              onChangeText={setPassword}
              maxLength={255}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.rightIconButton}
              onPress={() => setShowPassword(!showPassword)}>
              {showPassword ? (
                <EyeOff color="#A9927D" size={18} />
              ) : (
                <Eye color="#A9927D" size={18} />
              )}
            </TouchableOpacity>
          </View>

          {/* Strength Indicator & Checklist */}
          {password.length > 0 && (
            <View style={styles.strengthContainer}>
              <View style={styles.strengthBarRow}>
                <View style={styles.strengthBarTrack}>
                  <View
                    style={[
                      styles.strengthBarFill,
                      {
                        width: `${(strengthScore / PASSWORD_RULES.length) * 100}%`,
                        backgroundColor: strengthColor,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.strengthText, { color: strengthColor }]}>{strengthLabel}</Text>
              </View>

              {/* Rule Checklist */}
              <View style={styles.ruleChecklistCard}>
                {ruleResults.map((rule, index) => (
                  <View key={index} style={styles.ruleRow}>
                    {rule.passed ? (
                      <Check color="#22c55e" size={14} />
                    ) : (
                      <X color="#A9927D" size={14} />
                    )}
                    <Text style={[styles.ruleText, { color: rule.passed ? '#166534' : '#78716c' }]}>
                      {rule.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Field 5: Confirm Password */}
          <View style={styles.inputWrapper}>
            <Lock color="#A9927D" size={18} style={styles.leftIcon} />
            <TextInput
              style={[styles.textInput, styles.passwordInput]}
              placeholder="Confirm Password"
              placeholderTextColor="#A9927D"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              maxLength={255}
              secureTextEntry={!showConfirmPassword}
            />
            <TouchableOpacity
              style={styles.rightIconButton}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? (
                <EyeOff color="#A9927D" size={18} />
              ) : (
                <Eye color="#A9927D" size={18} />
              )}
            </TouchableOpacity>
          </View>

          {confirmPassword.length > 0 && !passwordsMatch && (
            <Text style={styles.matchErrorText}>Passwords do not match.</Text>
          )}
          {passwordsMatch && <Text style={styles.matchSuccessText}>✓ Passwords match.</Text>}
        </View>

        {/* Terms & Privacy Agreement Checkbox */}
        <View style={styles.termsAgreementContainer}>
          <TouchableOpacity
            style={styles.termsCheckboxTouch}
            onPress={() => setAgreeToTerms(!agreeToTerms)}
            activeOpacity={0.8}>
            <View style={[styles.checkbox, agreeToTerms && styles.checkboxChecked]}>
              {agreeToTerms && <Check color="#FFFFFF" size={12} strokeWidth={3} />}
            </View>
          </TouchableOpacity>
          <View style={styles.termsTextWrapper}>
            <Text style={styles.termsNormalText}>
              I agree to the{' '}
              <Text style={styles.termsLinkText} onPress={() => setLegalModalType('terms')}>
                Terms of Service
              </Text>
              {' and '}
              <Text style={styles.termsLinkText} onPress={() => setLegalModalType('privacy')}>
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
        </View>

        {/* Primary Button */}
        <TouchableOpacity
          style={[
            styles.primaryButton,
            ((!allRulesPassed || !passwordsMatch) && password.length > 0) ||
            !agreeToTerms ||
            !isOnline
              ? styles.disabledButton
              : null,
          ]}
          onPress={handleRegister}
          disabled={loading || !isOnline}
          activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Sign Up</Text>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Or Continue With</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social Auth */}
        <TouchableOpacity
          style={[styles.googleButton, !isOnline && { opacity: 0.5 }]}
          onPress={handleGoogleSignIn}
          disabled={googleLoading || loading || !isOnline}
          activeOpacity={0.7}>
          {googleLoading ? (
            <ActivityIndicator color="#8C4522" size="small" />
          ) : (
            <>
              <GoogleLogo size={18} />
              <Text style={styles.googleButtonText}>Google</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Google Legal Notice */}
        <Text style={styles.googleLegalText}>
          By signing up with Google, you acknowledge that you have read and agree to SoilSync&apos;s{' '}
          <Text style={styles.termsLinkText} onPress={() => setLegalModalType('terms')}>
            Terms of Service
          </Text>
          {' and '}
          <Text style={styles.termsLinkText} onPress={() => setLegalModalType('privacy')}>
            Privacy Policy
          </Text>
          .
        </Text>

        {/* Legal Modal Component */}
        <LegalModal
          visible={legalModalType !== null}
          type={legalModalType}
          onClose={() => setLegalModalType(null)}
        />
      </AuthFormLayout>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  ...authFormStyles,
  fullBackground: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  strengthContainer: {
    marginVertical: 4,
    paddingHorizontal: 4,
  },
  strengthBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  strengthBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(28, 18, 12, 0.08)',
    overflow: 'hidden',
    marginRight: 10,
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  strengthText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  ruleChecklistCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(28, 18, 12, 0.08)',
    gap: 5,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ruleText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  matchErrorText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#ef4444',
    marginLeft: 12,
    marginTop: -4,
  },
  matchSuccessText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#22c55e',
    marginLeft: 12,
    marginTop: -4,
  },
  termsAgreementContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  termsCheckboxTouch: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  termsTextWrapper: {
    flex: 1,
  },
  termsNormalText: {
    fontSize: 13,
    color: '#8C7C70',
    lineHeight: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
