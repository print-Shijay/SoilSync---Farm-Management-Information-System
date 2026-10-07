import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AlertTriangle, Archive, RotateCcw, LogOut, CheckCircle2 } from 'lucide-react-native';
import { AccountStatusInfo, useAuth } from '../../lib/AuthContext';
import { AppAlert as Alert } from '../common/AppAlert';
import { Modal } from '../common/AppModal';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';

interface AccountStatusModalProps {
  visible: boolean;
  statusInfo: AccountStatusInfo | null;
  onRestored: () => void;
  onDismiss: () => void;
}

export function AccountStatusModal({
  visible,
  statusInfo,
  onRestored,
  onDismiss,
}: AccountStatusModalProps) {
  const { restoreAccount, signOut } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [restoring, setRestoring] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  if (!visible || !statusInfo) {
    return null;
  }

  const isSoftDeleted = statusInfo.isSoftDeleted;
  const isArchived = statusInfo.isArchived;

  // Calculate days remaining if scheduled for deletion
  let daysRemaining = 30;
  let formattedPurgeDate = '';
  if (statusInfo.scheduledPurgeAt) {
    const purgeTime = new Date(statusInfo.scheduledPurgeAt).getTime();
    const nowTime = Date.now();
    const diffDays = Math.ceil((purgeTime - nowTime) / (1000 * 60 * 60 * 24));
    daysRemaining = Math.max(0, diffDays);
    try {
      formattedPurgeDate = new Date(statusInfo.scheduledPurgeAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      formattedPurgeDate = statusInfo.scheduledPurgeAt;
    }
  }

  const handleRestore = async () => {
    if (!isOnline) return;
    try {
      setRestoring(true);
      await restoreAccount();
      Alert.alert(
        'Account Restored',
        isSoftDeleted
          ? 'Your account deletion has been cancelled. Welcome back to SoilSync!'
          : 'Your account has been reactivated successfully. Welcome back!',
        [{ text: 'Continue', onPress: onRestored }]
      );
    } catch (err) {
      Alert.alert(
        'Restoration Failed',
        err instanceof Error ? err.message : 'Failed to reactivate account. Please try again.'
      );
    } finally {
      setRestoring(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setLoggingOut(true);
      await signOut({ force: true });
      onDismiss();
    } catch (err) {
      console.warn('[AccountStatusModal] Sign out notice:', err);
      onDismiss();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View className="flex-1 bg-black/60 backdrop-blur-md items-center justify-center p-6">
        <View className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-champagne">
          {/* Status Icon Header */}
          <View className="items-center mb-5">
            <View
              className={`w-16 h-16 rounded-full items-center justify-center mb-3 ${
                isSoftDeleted ? 'bg-red-100' : 'bg-amber-100'
              }`}
            >
              {isSoftDeleted ? (
                <AlertTriangle size={32} color="#ef4444" strokeWidth={2.2} />
              ) : (
                <Archive size={32} color="#8C4522" strokeWidth={2.2} />
              )}
            </View>

            <Text className="text-xl font-black text-espresso text-center">
              {isSoftDeleted ? 'Account Scheduled for Deletion' : 'Welcome Back!'}
            </Text>

            <View
              className={`mt-2 px-3 py-1 rounded-full border ${
                isSoftDeleted
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  isSoftDeleted ? 'text-red-700' : 'text-cognac'
                }`}
              >
                {isSoftDeleted
                  ? `Grace Period: ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
                  : 'Account Currently Archived'}
              </Text>
            </View>
          </View>

          {/* Description */}
          <View className="bg-champagne/60 rounded-2xl p-4 mb-6 border border-champagne">
            {isSoftDeleted ? (
              <Text className="text-sm text-espresso leading-5">
                This account was scheduled for permanent deletion. All data is retained during the 30-day grace period until{' '}
                <Text className="font-bold text-red-600">
                  {formattedPurgeDate || 'the countdown expires'}
                </Text>
                .
                {'\n\n'}
                Would you like to cancel deletion and restore your account and all farm records?
              </Text>
            ) : (
              <Text className="text-sm text-espresso leading-5">
                Your SoilSync account is currently deactivated/archived. All your farm layouts, crop cycles, and sensor configurations are safely intact.
                {'\n\n'}
                Tap below to reactivate your account and resume cloud synchronization.
              </Text>
            )}
          </View>

          {!isOnline && (
            <Text className="mb-4 text-center text-sm text-amber-800">
              Connect to the internet to restore this account.
            </Text>
          )}

          {/* Action Buttons */}
          <View className="space-y-3">
            {/* Primary: Restore Account */}
            <TouchableOpacity
              className={`w-full py-4 px-4 rounded-2xl flex-row items-center justify-center ${isOnline ? 'bg-cognac shadow-md shadow-cognac/30 active:opacity-90' : 'bg-taupe/40'}`}
              onPress={handleRestore}
              disabled={restoring || loggingOut || !isOnline}
            >
              {restoring ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  {isSoftDeleted ? (
                    <RotateCcw size={18} color="white" strokeWidth={2.4} />
                  ) : (
                    <CheckCircle2 size={18} color="white" strokeWidth={2.4} />
                  )}
                  <Text className="ml-2 text-white font-extrabold text-base">
                    {isSoftDeleted ? 'Cancel Deletion & Restore' : 'Reactivate Account'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Secondary: Log Out / Keep Deletion */}
            <TouchableOpacity
              className="mt-3 w-full py-3.5 px-4 rounded-2xl bg-gray-100 flex-row items-center justify-center active:bg-gray-200"
              onPress={handleSignOut}
              disabled={restoring || loggingOut}
            >
              {loggingOut ? (
                <ActivityIndicator color="#8C7C70" size="small" />
              ) : (
                <>
                  <LogOut size={16} color="#8C7C70" strokeWidth={2} />
                  <Text className="ml-2 text-taupe font-bold text-sm">
                    {isSoftDeleted ? 'Keep Deletion & Log Out' : 'Stay Logged Out'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
