import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { useAuth, userHasPassword } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import * as Network from 'expo-network';
import { useRouter } from 'expo-router';
import { AlertTriangle, Trash2 } from 'lucide-react-native';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';

async function ensureOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected || !state.isInternetReachable) {
      Alert.alert('No Connection', 'You need an internet connection to delete your account.');
      return false;
    }
    return true;
  } catch {
    Alert.alert('No Connection', 'Unable to verify network status. Please try again.');
    return false;
  }
}

const DATA_TO_DELETE = [
  'Your profile information',
  'All farms and farm layouts',
  'Garden structures and crop cycles',
  'Todos and tasks',
  'Farm succession plans',
  'Farm checkup results',
  'Farm memberships and audit logs',
  'SMS settings and subscriptions',
];

export default function DeleteAccount() {
  const router = useRouter();
  const { user, deleteAccount } = useAuth();
  const { isOnline } = useNetworkStatus();
  const hasPassword = userHasPassword(user);

  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const purgeDateString = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(
    undefined,
    { year: 'numeric', month: 'long', day: 'numeric' }
  );

  const isConfirmValid = confirmText === 'DELETE';
  const canSubmit = (hasPassword ? password.length > 0 : true) && isConfirmValid && !loading && isOnline;

  const handleDelete = async () => {
    if (!canSubmit) return;

    if (!(await ensureOnline())) return;

    // Final confirmation
    Alert.alert(
      'Schedule Account Deletion',
      `Your account will be deactivated immediately and scheduled for permanent deletion on ${purgeDateString}. You can log back in within 30 days to cancel deletion. Proceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Schedule Deletion',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);

              if (hasPassword) {
                // Re-authenticate with password
                const { error: signInError } = await supabase.auth.signInWithPassword({
                  email: user?.email || '',
                  password,
                });

                if (signInError) {
                  Alert.alert('Verification Failed', 'Your password is incorrect.');
                  return;
                }
              }

              // Soft-delete the account (30-day grace period)
              await deleteAccount(reason.trim() || undefined);

              Alert.alert(
                'Deletion Scheduled',
                `Your account has been deactivated and scheduled for permanent deletion on ${purgeDateString}. If you change your mind, simply log in within 30 days to restore your account.`,
                [{ text: 'OK', onPress: () => router.replace('/auth/login') }]
              );
            } catch (error) {
              Alert.alert(
                'Deletion Failed',
                error instanceof Error
                  ? error.message
                  : 'Failed to schedule account deletion. Please try again.'
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView className="flex-1 bg-champagne p-5" keyboardShouldPersistTaps="handled">
      {/* Warning Banner */}
      <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex-row">
        <AlertTriangle color="#ef4444" size={24} />
        <View className="ml-3 flex-1">
          <Text className="text-red-700 font-bold text-base mb-1">
            30-Day Account Deletion Grace Period
          </Text>
          <Text className="text-red-600 text-sm leading-5">
            Your account will be deactivated immediately and permanently wiped on{' '}
            <Text className="font-bold">{purgeDateString}</Text>. You can log back in at any time
            within the 30-day window to cancel deletion and restore your farm data.
          </Text>
        </View>
      </View>

      {!isOnline && (
        <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <Text className="text-amber-900 text-sm">
            Connect to the internet to schedule account deletion.
          </Text>
        </View>
      )}

      {/* Data that will be deleted */}
      <View className="bg-white rounded-2xl border border-champagne p-4 mb-6">
        <Text className="text-espresso font-bold text-base mb-3">
          The following data will be permanently deleted:
        </Text>
        {DATA_TO_DELETE.map((item, index) => (
          <View key={index} className="flex-row items-center py-1.5">
            <View className="w-1.5 h-1.5 rounded-full bg-red-400 mr-3" />
            <Text className="text-espresso text-sm">{item}</Text>
          </View>
        ))}
      </View>

      {/* Password Verification (only if user has a password) */}
      {hasPassword ? (
        <View className="mb-5">
          <Text className="text-base font-semibold text-espresso mb-2">
            Enter your password to verify your identity
          </Text>
          <TextInput
            className="bg-white rounded-2xl px-4 py-3.5 text-espresso text-base border border-champagne"
            placeholder="Your current password"
            placeholderTextColor="#8C7C70"
            value={password}
            onChangeText={setPassword}
            maxLength={255}
            secureTextEntry
          />
        </View>
      ) : (
        <View className="mb-5 bg-white rounded-2xl border border-champagne p-4">
          <Text className="text-sm font-semibold text-taupe mb-1">Signed in with Google</Text>
          <Text className="text-base font-bold text-espresso">{user?.email}</Text>
          <Text className="text-xs text-taupe mt-1">
            You are authenticated via Google. Type DELETE below to confirm account deletion.
          </Text>
        </View>
      )}

      {/* Optional Reason for Deletion */}
      <View className="mb-5">
        <Text className="text-base font-semibold text-espresso mb-2">
          Why are you leaving? (Optional)
        </Text>
        <TextInput
          className="bg-white rounded-2xl px-4 py-3.5 text-espresso text-base border border-champagne"
          placeholder="Tell us what we can improve..."
          placeholderTextColor="#8C7C70"
          value={reason}
          onChangeText={setReason}
          maxLength={200}
        />
      </View>

      {/* Type DELETE Confirmation */}
      <View className="mb-6">
        <Text className="text-base font-semibold text-espresso mb-2">
          Type <Text className="text-red-500 font-bold">DELETE</Text> to confirm
        </Text>
        <TextInput
          className={`bg-white rounded-2xl px-4 py-3.5 text-espresso text-base border ${
            confirmText.length > 0 && !isConfirmValid
              ? 'border-red-300'
              : isConfirmValid
                ? 'border-green-300'
                : 'border-champagne'
          }`}
          placeholder="Type DELETE here"
          placeholderTextColor="#8C7C70"
          value={confirmText}
          onChangeText={setConfirmText}
          maxLength={255}
          autoCapitalize="characters"
        />
      </View>

      {/* Delete Button */}
      <TouchableOpacity
        className={`rounded-2xl py-4 flex-row items-center justify-center ${
          canSubmit ? 'bg-red-500 active:opacity-80' : 'bg-red-300/50'
        }`}
        onPress={handleDelete}
        disabled={!canSubmit}
      >
        {loading ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <>
            <Trash2 color="white" size={20} />
            <Text className="ml-2 text-white font-bold text-lg">Schedule Account Deletion</Text>
          </>
        )}
      </TouchableOpacity>

      <Text className="mt-4 text-center text-xs text-taupe px-4 leading-4">
        Your account will be deactivated immediately and permanently wiped after 30 days. You can sign in anytime before then to cancel deletion and restore your records.
      </Text>
    </ScrollView>
  );
}
