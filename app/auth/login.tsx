import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
  Animated,
  StyleSheet,
  StatusBar,
  Pressable,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';
import { Modal } from '../../components/common/AppModal';
import { AuthFormLayout, authFormStyles } from '../../components/auth/AuthFormLayout';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, Eye, EyeOff, Check, ShieldCheck, X } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useAuth, AccountStatusInfo } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { logUserAction } from '../../lib/logger';
import { LegalModal } from '../../components/LegalModal';
import { AccountStatusModal } from '../../components/auth/AccountStatusModal';
import { SuspendedAccountModal } from '../../components/auth/SuspendedAccountModal';

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

function MfaLoadingScreen() {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 2500,
        useNativeDriver: false,
      })
    ).start();
  }, [animatedValue]);

  const animatedWidth = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <ImageBackground
      source={require('../../assets/loading-background.png')}
      style={styles.fullBackground}
      resizeMode="cover">
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.mfaProgressWrapper}>
        <View style={styles.mfaTrack}>
          <Animated.View
            style={[styles.mfaBar, { width: animatedWidth, backgroundColor: '#8C4522' }]}
          />
        </View>
      </View>
    </ImageBackground>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { isOnline } = useNetworkStatus();

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'terms' | 'privacy' | null>(null);

  // MFA State
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [verifyingMfa, setVerifyingMfa] = useState(false);

  // Account Status / Reactivation State
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [statusInfo, setStatusInfo] = useState<AccountStatusInfo | null>(null);

  // Suspended Account State
  const [showSuspendedModal, setShowSuspendedModal] = useState(false);
  const [suspendedUserEmail, setSuspendedUserEmail] = useState('');

  const isBannedError = (err: any) => {
    const msg = (err?.message || err?.msg || '').toLowerCase();
    const code = err?.code || (err as any)?.error_code || '';
    return msg.includes('banned') || msg.includes('suspended') || code === 'user_banned';
  };

  const { signIn, signInWithGoogle, verifyMfaLogin } = useAuth();

  const handleLogin = async () => {
    if (!isOnline) return;
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }

    try {
      setLoading(true);
      const res = await signIn(email.trim(), password);

      if (res?.error) {
        if (isBannedError(res.error)) {
          setSuspendedUserEmail(email.trim());
          setShowSuspendedModal(true);
          return;
        }
        Alert.alert('Login Failed', res.error.message);
        return;
      }

      if (res?.requiresMfa && res?.factorId) {
        setMfaFactorId(res.factorId);
        setMfaCode('');
        setShowMfaModal(true);
        return;
      }

      if (res?.requiresReactivation && res?.accountStatus) {
        setStatusInfo(res.accountStatus);
        setStatusModalVisible(true);
        return;
      }

      await logUserAction('LOGIN_SUCCESS', { method: 'email' });
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert(
        'Login Error',
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isOnline) return;
    try {
      setGoogleLoading(true);
      const res = await signInWithGoogle();

      if (res?.error) {
        if (isBannedError(res.error)) {
          setSuspendedUserEmail('');
          setShowSuspendedModal(true);
          return;
        }
        if (res.error.message !== 'Google sign-in was cancelled.') {
          Alert.alert('Google Sign-In Error', res.error.message);
        }
        return;
      }

      if (res?.requiresMfa && res?.factorId) {
        setMfaFactorId(res.factorId);
        setMfaCode('');
        setShowMfaModal(true);
        return;
      }

      if (res?.requiresReactivation && res?.accountStatus) {
        setStatusInfo(res.accountStatus);
        setStatusModalVisible(true);
        return;
      }

      await logUserAction('LOGIN_SUCCESS', { method: 'google' });
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

  const handleVerifyMfa = async () => {
    if (!isOnline) return;
    if (!mfaFactorId || mfaCode.length !== 6) return;

    setShowMfaModal(false);
    setVerifyingMfa(true);

    try {
      const res = await verifyMfaLogin(mfaFactorId, mfaCode);

      if (res?.error) {
        setVerifyingMfa(false);
        if (isBannedError(res.error)) {
          setSuspendedUserEmail(email.trim());
          setShowSuspendedModal(true);
          return;
        }
        setShowMfaModal(true);
        Alert.alert(
          'Verification Failed',
          'Invalid 6-digit code. Please check your authenticator app and try again.'
        );
        return;
      }

      if (res?.requiresReactivation && res?.accountStatus) {
        setVerifyingMfa(false);
        setStatusInfo(res.accountStatus);
        setStatusModalVisible(true);
        return;
      }

      await logUserAction('LOGIN_SUCCESS', { method: 'mfa' });
      router.replace('/(tabs)');
    } catch (err) {
      setVerifyingMfa(false);
      setShowMfaModal(true);
      Alert.alert(
        'Verification Error',
        err instanceof Error ? err.message : 'Failed to verify code.'
      );
    }
  };

  const handleCancelMfa = async () => {
    setShowMfaModal(false);
    setMfaFactorId(null);
    setMfaCode('');
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  };

  if (verifyingMfa) {
    return <MfaLoadingScreen />;
  }

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

      <AuthFormLayout title="Log in to stay on top of your tasks and projects." showLogos>
        {/* Title */}
        <Text style={styles.sheetTitle}>Login</Text>

        {!isOnline && (
          <Text className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Connect to the internet to sign in or verify your account.
          </Text>
        )}

        {/* Toggle Link */}
        <View style={styles.toggleLinkRow}>
          <Text style={styles.toggleLinkSubtext}>{"Don't Have An Account? "}</Text>
          <TouchableOpacity
            style={styles.textLinkButton}
            onPress={() => router.push('/auth/register')}>
            <Text style={styles.toggleLinkCognac}>Sign Up</Text>
          </TouchableOpacity>
        </View>

        {/* Functional Form Fields */}
        <View style={styles.formSection}>
          {/* Field 1: Email Input */}
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

          {/* Field 2: Password Input */}
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
        </View>

        {/* Options Row */}
        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={styles.rememberMeContainer}
            onPress={() => setRememberMe(!rememberMe)}
            activeOpacity={0.8}>
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Check color="#FFFFFF" size={12} strokeWidth={3} />}
            </View>
            <Text style={styles.rememberMeText}>Remember Me</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.textLinkButton}
            onPress={() => router.push('/auth/forgot-password')}>
            <Text style={styles.forgotPasswordCognac}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* Primary Button */}
        <TouchableOpacity
          style={[styles.primaryButton, !isOnline && { opacity: 0.5 }]}
          onPress={handleLogin}
          disabled={loading || !isOnline}
          activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Login</Text>
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

        {/* Google Sign-In Legal Disclosure */}
        <Text style={styles.googleLegalText}>
          By continuing with Google, you agree to SoilSync&apos;s{' '}
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

      {/* MFA Verification Modal */}
      <Modal
        visible={showMfaModal}
        animationType="slide"
        transparent
        onRequestClose={handleCancelMfa}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={handleCancelMfa}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalIconBadge}>
                  <ShieldCheck color="#8C4522" size={20} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Two-Factor Verification</Text>
                  <Text style={styles.modalSubtitle}>Authenticator Code Required</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleCancelMfa} style={{ padding: 4 }}>
                <X color="#8C7C70" size={20} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalBodyText}>
              Enter the 6-digit verification code generated by your authenticator app to log in:
            </Text>

            {!isOnline && (
              <Text className="mb-3 text-sm text-amber-800">
                Connect to the internet to verify your authenticator code.
              </Text>
            )}

            <TextInput
              style={styles.mfaInput}
              placeholder="000000"
              placeholderTextColor="#A9927D"
              value={mfaCode}
              onChangeText={(t) => setMfaCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              editable={isOnline}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={handleCancelMfa}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalVerifyButton,
                  mfaCode.length === 6 && isOnline
                    ? styles.modalVerifyActive
                    : styles.modalVerifyDisabled,
                ]}
                onPress={handleVerifyMfa}
                disabled={mfaCode.length !== 6 || !isOnline}>
                <Text style={styles.modalVerifyText}>Verify & Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AccountStatusModal
        visible={statusModalVisible}
        statusInfo={statusInfo}
        onRestored={() => {
          setStatusModalVisible(false);
          setStatusInfo(null);
          router.replace('/(tabs)');
        }}
        onDismiss={() => {
          setStatusModalVisible(false);
          setStatusInfo(null);
        }}
      />

      <SuspendedAccountModal
        visible={showSuspendedModal}
        userEmail={suspendedUserEmail}
        onDismiss={() => {
          setShowSuspendedModal(false);
          setSuspendedUserEmail('');
        }}
      />
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
  mfaProgressWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  mfaTrack: {
    width: 200,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  mfaBar: {
    height: '100%',
    borderRadius: 999,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    flexShrink: 1,
  },
  rememberMeText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#1C120C',
    fontWeight: '500',
  },
  forgotPasswordCognac: {
    fontSize: 14,
    lineHeight: 20,
    color: '#8C4522',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    width: '100%',
    maxWidth: 380,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F4EF',
    marginBottom: 14,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F7F4EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C120C',
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#8C7C70',
  },
  modalBodyText: {
    fontSize: 12.5,
    color: '#1C120C',
    lineHeight: 18,
    marginBottom: 14,
  },
  mfaInput: {
    backgroundColor: '#F7F4EF',
    borderRadius: 14,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 6,
    borderWidth: 1,
    borderColor: '#EFE7DE',
    color: '#1C120C',
    marginBottom: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#EFE7DE',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8C7C70',
  },
  modalVerifyButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalVerifyActive: {
    backgroundColor: '#8C4522',
  },
  modalVerifyDisabled: {
    backgroundColor: '#8C7C70',
  },
  modalVerifyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
