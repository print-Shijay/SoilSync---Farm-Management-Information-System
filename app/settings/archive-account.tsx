import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { useAuth, userHasPassword } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import * as Network from 'expo-network';
import { useRouter } from 'expo-router';
import { Archive, CheckCircle2 } from 'lucide-react-native';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';

async function ensureOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected || !state.isInternetReachable) {
      Alert.alert('No Connection', 'You need an internet connection to deactivate your account.');
      return false;
    }
    return true;
  } catch {
    Alert.alert('No Connection', 'Unable to verify network status. Please try again.');
    return false;
  }
}

const BENEFIT_ITEMS = [
  'All farm blueprints, layouts, and crops are safely retained in the cloud.',
  'Local database storage is freed on this device.',
  'Reactivate effortlessly anytime by simply signing back in.',
  'No data is deleted, lost, or reset.',
];

export default function ArchiveAccount() {
  const router = useRouter();
  const { user, archiveAccount } = useAuth();
  const { isOnline } = useNetworkStatus();
  const hasPassword = userHasPassword(user);

  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = (hasPassword ? password.length > 0 : true) && !loading && isOnline;

  const handleArchive = async () => {
    if (!canSubmit) return;

    if (!(await ensureOnline())) return;

    Alert.alert(
      'Deactivate Account',
      'Are you sure you want to deactivate your account? You will be signed out, but your farm data will be safely preserved until you log in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          onPress: async () => {
            try {
              setLoading(true);

              if (hasPassword) {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                  email: user?.email || '',
                  password,
                });

                if (signInError) {
                  Alert.alert('Verification Failed', 'Your password is incorrect.');
                  return;
                }
              }

              await archiveAccount(reason.trim() || undefined);

              Alert.alert(
                'Account Deactivated',
                'Your account has been deactivated. You can sign in anytime to reactivate your data.',
                [{ text: 'OK', onPress: () => router.replace('/auth/login') }]
              );
            } catch (error) {
              Alert.alert(
                'Deactivation Failed',
                error instanceof Error
                  ? error.message
                  : 'Failed to deactivate your account. Please try again.'
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
      {/* Banner */}
      <View className="bg-amber-50 border border-amber-200 rounded-3xl p-5 mb-6 flex-row items-start">
        <View className="w-10 h-10 rounded-2xl bg-amber-100 items-center justify-center mr-3 mt-0.5">
          <Archive color="#8C4522" size={22} strokeWidth={2.2} />
        </View>
        <View className="flex-1">
          <Text className="text-espresso font-black text-base mb-1">
            Seasonal Deactivation / Archiving
          </Text>
          <Text className="text-taupe text-sm leading-5">
            Taking a seasonal break from farming? Deactivating preserves your data in the cloud without keeping active local storage on this phone.
          </Text>
        </View>
      </View>

      {!isOnline && (
        <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <Text className="text-amber-900 text-sm">
            Connect to the internet to deactivate your account.
          </Text>
        </View>
      )}

      {/* Preservation Guarantees */}
      <View className="bg-white rounded-3xl border border-champagne p-5 mb-6 shadow-sm">
        <Text className="text-espresso font-extrabold text-base mb-3 flex-row items-center">
          What happens when you deactivate:
        </Text>
        {BENEFIT_ITEMS.map((item, index) => (
          <View key={index} className="flex-row items-center py-2">
            <CheckCircle2 color="#22c55e" size={18} strokeWidth={2.2} />
            <Text className="ml-3 text-espresso text-sm flex-1 leading-5">{item}</Text>
          </View>
        ))}
      </View>

      {/* Optional Reason */}
      <View className="mb-5">
        <Text className="text-base font-bold text-espresso mb-2">
          Reason for deactivating (Optional)
        </Text>
        <TextInput
          className="bg-white rounded-2xl px-4 py-3.5 text-espresso text-base border border-champagne"
          placeholder="e.g. Taking an off-season break"
          placeholderTextColor="#8C7C70"
          value={reason}
          onChangeText={setReason}
          maxLength={150}
        />
      </View>

      {/* Password Verification (if user has a password) */}
      {hasPassword ? (
        <View className="mb-6">
          <Text className="text-base font-bold text-espresso mb-2">
            Enter password to confirm
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
        <View className="mb-6 bg-white rounded-2xl border border-champagne p-4">
          <Text className="text-xs font-semibold text-taupe mb-1">Authenticated Account</Text>
          <Text className="text-base font-bold text-espresso">{user?.email}</Text>
          <Text className="text-xs text-taupe mt-1">
            Signed in via Google. Tap Deactivate below to confirm.
          </Text>
        </View>
      )}

      {/* Submit Button */}
      <TouchableOpacity
        className={`rounded-2xl py-4 flex-row items-center justify-center shadow-md ${
          canSubmit ? 'bg-cognac active:opacity-90 shadow-cognac/30' : 'bg-cognac/40'
        }`}
        onPress={handleArchive}
        disabled={!canSubmit}
      >
        {loading ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <>
            <Archive color="white" size={20} strokeWidth={2.2} />
            <Text className="ml-2 text-white font-extrabold text-base">Deactivate My Account</Text>
          </>
        )}
      </TouchableOpacity>

      <Text className="mt-4 text-center text-xs text-taupe px-4 leading-4">
        You will be signed out immediately. You can log back in at any time to resume using SoilSync.
      </Text>
    </ScrollView>
  );
}
