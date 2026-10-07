import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import { ShieldAlert, Mail, Send, CheckCircle2, ArrowLeft, X } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { AppAlert as Alert } from '../common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../common/AppModal';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';

interface SuspendedAccountModalProps {
  visible: boolean;
  userEmail?: string;
  onDismiss: () => void;
}

export function SuspendedAccountModal({
  visible,
  userEmail = '',
  onDismiss,
}: SuspendedAccountModalProps) {
  const [viewState, setViewState] = useState<'info' | 'appeal_form' | 'success'>('info');
  const [emailInput, setEmailInput] = useState(userEmail);
  const [appealReason, setAppealReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isOnline } = useNetworkStatus();

  // Synchronize email input whenever userEmail prop updates
  React.useEffect(() => {
    if (userEmail) {
      setEmailInput(userEmail);
    }
  }, [userEmail]);

  const handleClose = () => {
    setViewState('info');
    setAppealReason('');
    onDismiss();
  };

  const handleOpenEmailAppeal = async () => {
    const supportEmail = 'support@soilsync.app';
    const emailToUse = emailInput.trim() || userEmail || 'your-email@example.com';
    const subject = encodeURIComponent(`Account Suspension Appeal - [${emailToUse}]`);
    const body = encodeURIComponent(
      `Hello SoilSync Administration,\n\n` +
      `My account (${emailToUse}) has been suspended. I would like to request an administrative review and appeal this suspension.\n\n` +
      `Reason / Context:\n` +
      `[Please provide explanation here]\n\n` +
      `---\n` +
      `Platform: ${Platform.OS}\n` +
      `Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n`
    );

    const mailtoUrl = `mailto:${supportEmail}?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          'Email Client Unavailable',
          `Please email our support desk directly at:\n\n${supportEmail}\n\nSubject: Account Suspension Appeal (${emailToUse})`
        );
      }
    } catch {
      Alert.alert(
        'Email Support',
        `Please send an email to ${supportEmail} with your account details.`
      );
    }
  };

  const handleSubmitInAppAppeal = async () => {
    if (!isOnline) return;
    const finalEmail = emailInput.trim() || userEmail;
    if (!finalEmail) {
      Alert.alert('Email Required', 'Please provide the email address associated with your account.');
      return;
    }

    if (!appealReason.trim()) {
      Alert.alert('Explanation Required', 'Please provide a brief explanation for your appeal.');
      return;
    }

    try {
      setIsSubmitting(true);

      // Attempt submission via Supabase RPC
      const { data, error } = await supabase.rpc('submit_account_appeal', {
        user_email: finalEmail,
        appeal_reason: appealReason.trim(),
      });

      if (error || (data && !data.success)) {
        console.warn('[SuspendedModal] RPC appeal notice:', error || data?.error);
        // Fallback: If RPC not yet installed on backend, prompt email appeal seamlessly
        Alert.alert(
          'Direct Email Appeal',
          'Would you like to send your appeal directly to our helpdesk via email?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Email', onPress: handleOpenEmailAppeal },
          ]
        );
        return;
      }

      setViewState('success');
    } catch (err: any) {
      Alert.alert(
        'Submission Error',
        err instanceof Error ? err.message : 'Failed to submit appeal. Please use email support.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleClose}>
      <View className="flex-1 bg-black/60 backdrop-blur-md items-center justify-center p-6">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="w-full max-w-sm"
        >
          <View className="w-full bg-white rounded-3xl p-6 shadow-2xl border border-champagne">
            {/* Header Close button */}
            <View className="flex-row justify-end mb-1">
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color="#8C7C70" />
              </TouchableOpacity>
            </View>

            {/* VIEW 1: Information Screen */}
            {viewState === 'info' && (
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                <View className="items-center mb-5">
                  <View className="w-16 h-16 rounded-full bg-red-100 items-center justify-center mb-3">
                    <ShieldAlert size={32} color="#ef4444" strokeWidth={2.2} />
                  </View>

                  <Text className="text-xl font-black text-espresso text-center">
                    Account Access Suspended
                  </Text>

                  <View className="mt-2 px-3 py-1 rounded-full bg-red-50 border border-red-200">
                    <Text className="text-xs font-bold text-red-700">
                      Administrative Action
                    </Text>
                  </View>
                </View>

                {/* Explanation Card */}
                <View className="bg-champagne/60 rounded-2xl p-4 mb-6 border border-champagne">
                  <Text className="text-sm text-espresso leading-5">
                    Your SoilSync account has been suspended by the administration. Mobile access and synchronization for this account are currently restricted.
                  </Text>
                  {Boolean(userEmail) && (
                    <Text className="text-xs font-semibold text-taupe mt-3 font-mono">
                      Account: {userEmail}
                    </Text>
                  )}
                </View>

                {/* Action Buttons */}
                <View className="space-y-3">
                  {/* Primary: In-App Appeal */}
                  <TouchableOpacity
                    className="w-full py-4 px-4 rounded-2xl bg-cognac flex-row items-center justify-center shadow-md shadow-cognac/30 active:opacity-90"
                    onPress={() => setViewState('appeal_form')}
                  >
                    <Send size={18} color="white" strokeWidth={2.2} />
                    <Text className="ml-2 text-white font-extrabold text-base">
                      Submit Appeal
                    </Text>
                  </TouchableOpacity>

                  {/* Secondary: Email Support */}
                  <TouchableOpacity
                    className="mt-3 w-full py-3.5 px-4 rounded-2xl bg-amber-50 border border-amber-200 flex-row items-center justify-center active:bg-amber-100"
                    onPress={handleOpenEmailAppeal}
                  >
                    <Mail size={18} color="#8C4522" strokeWidth={2.2} />
                    <Text className="ml-2 text-cognac font-bold text-sm">
                      Send Email Appeal
                    </Text>
                  </TouchableOpacity>

                  {/* Dismiss */}
                  <TouchableOpacity
                    className="mt-3 w-full py-3 px-4 rounded-2xl bg-gray-100 flex-row items-center justify-center active:bg-gray-200"
                    onPress={handleClose}
                  >
                    <Text className="text-taupe font-bold text-sm">
                      Dismiss
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* VIEW 2: In-App Appeal Form */}
            {viewState === 'appeal_form' && (
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  onPress={() => setViewState('info')}
                  className="flex-row items-center mb-3 text-taupe"
                >
                  <ArrowLeft size={16} color="#8C7C70" />
                  <Text className="ml-1 text-xs font-bold text-taupe">Back to Details</Text>
                </TouchableOpacity>

                <Text className="text-lg font-black text-espresso mb-1">
                  Appeal Suspension
                </Text>
                <Text className="text-xs text-taupe mb-4">
                  Please provide details for the administration team to review your case.
                </Text>

                {!isOnline && (
                  <Text className="text-sm text-amber-800 mb-4">
                    Connect to the internet to submit an in-app appeal. You can prepare the form while offline.
                  </Text>
                )}

                {/* Email Field */}
                <Text className="text-xs font-bold text-espresso mb-1">Your Account Email</Text>
                <TextInput
                  className="bg-champagne/40 border border-champagne rounded-xl px-3 py-2.5 text-xs text-espresso mb-3 font-mono"
                  placeholder="name@example.com"
                  placeholderTextColor="#8C7C70"
                  value={emailInput}
                  onChangeText={setEmailInput}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                {/* Appeal Reason Field */}
                <Text className="text-xs font-bold text-espresso mb-1">Reason for Appeal</Text>
                <TextInput
                  className="bg-champagne/40 border border-champagne rounded-xl p-3 text-xs text-espresso mb-5 h-28"
                  placeholder="Explain why you believe your account should be reactivated..."
                  placeholderTextColor="#8C7C70"
                  value={appealReason}
                  onChangeText={setAppealReason}
                  multiline
                  textAlignVertical="top"
                />

                {/* Submit Appeal Button */}
                <TouchableOpacity
                  className={`w-full py-3.5 px-4 rounded-2xl flex-row items-center justify-center ${isOnline ? 'bg-cognac shadow-md shadow-cognac/30 active:opacity-90' : 'bg-taupe/40'}`}
                  onPress={handleSubmitInAppAppeal}
                  disabled={isSubmitting || !isOnline}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <Send size={16} color="white" strokeWidth={2.2} />
                      <Text className="ml-2 text-white font-extrabold text-sm">
                        Send Appeal Ticket
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* VIEW 3: Appeal Submitted Confirmation */}
            {viewState === 'success' && (
              <View className="items-center py-2">
                <View className="w-14 h-14 rounded-full bg-emerald-100 items-center justify-center mb-3">
                  <CheckCircle2 size={32} color="#10b981" strokeWidth={2.2} />
                </View>

                <Text className="text-lg font-black text-espresso text-center mb-1">
                  Appeal Submitted
                </Text>
                <Text className="text-xs text-taupe text-center leading-5 mb-5">
                  Your appeal ticket has been received and forwarded to the SoilSync administration. We will review your account and follow up with you.
                </Text>

                <TouchableOpacity
                  className="w-full py-3.5 px-4 rounded-2xl bg-cognac flex-row items-center justify-center active:opacity-90"
                  onPress={handleClose}
                >
                  <Text className="text-white font-bold text-sm">
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
