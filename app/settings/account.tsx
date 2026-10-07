import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { User, Lock, Shield, Archive, Trash2, LogOut, ChevronRight, LucideIcon, WifiOff } from 'lucide-react-native';
import { LogoutSyncModal } from '../../components/LogoutSyncModal';
import { useLogoutHandler } from '../../lib/hooks/useLogoutHandler';
import { useAuth, userHasPassword } from '../../lib/AuthContext';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';

interface ItemProps {
  icon: LucideIcon;
  title: string;
  isDestructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export default function AccountSettings() {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const hasPassword = userHasPassword(user);
  const {
    logoutModalVisible,
    setLogoutModalVisible,
    isCheckingSync,
    handleLogoutInitiated,
    handleSignOutSuccess,
  } = useLogoutHandler();

  const Item = ({ icon: Icon, title, isDestructive = false, disabled = false, onPress = () => {} }: ItemProps) => (
    <TouchableOpacity 
      className={`bg-white p-4 mb-3 flex-row items-center rounded-2xl shadow-sm border border-champagne ${disabled ? 'opacity-50' : 'active:scale-[0.99] active:opacity-75'}`}
      onPress={onPress}
      disabled={disabled}
    >
      <View className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDestructive ? 'bg-red-50' : 'bg-cognac/10'}`}>
        <Icon color={isDestructive ? '#ef4444' : '#8C4522'} size={20} strokeWidth={2.2} />
      </View>
      <Text className={`ml-4 text-base font-bold flex-1 ${isDestructive ? 'text-red-600' : 'text-espresso'}`}>{title}</Text>
      <ChevronRight color={isDestructive ? '#ef4444' : '#8C7C70'} size={18} strokeWidth={2.2} />
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-champagne">
      <ScrollView className="flex-1 p-5">
        {!isOnline && (
          <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex-row items-center">
            <WifiOff color="#B45309" size={18} />
            <Text className="text-amber-900 text-sm ml-3 flex-1">
              Connect to the internet to deactivate or delete your account.
            </Text>
          </View>
        )}
        <Item icon={User} title="Profile Information" onPress={() => router.push('/settings/profile-information')} />
        <Item icon={Lock} title={hasPassword ? 'Change Password' : 'Set Password'} onPress={() => router.push('/settings/change-password')} />
        <Item icon={Archive} title="Deactivate Account" disabled={!isOnline} onPress={() => router.push('/settings/archive-account')} />
        <Item icon={Trash2} title="Delete Account" isDestructive disabled={!isOnline} onPress={() => router.push('/settings/delete-account')} />
        
        <TouchableOpacity 
          className="mt-6 w-full rounded-full bg-cognac py-4 shadow-md shadow-cognac/30 active:scale-[0.98]" 
          onPress={handleLogoutInitiated}
          disabled={isCheckingSync}
          activeOpacity={0.85}
        >
          <View className="flex-row items-center justify-center space-x-2">
            {isCheckingSync ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <LogOut color="white" size={18} strokeWidth={2.2} />
            )}
            <Text className="ml-2 text-center text-base font-extrabold text-white">
              {isCheckingSync ? 'Checking Sync Status...' : 'Logout'}
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <LogoutSyncModal
        visible={logoutModalVisible}
        onClose={() => setLogoutModalVisible(false)}
        onSignOutSuccess={handleSignOutSuccess}
      />
    </View>
  );
}

