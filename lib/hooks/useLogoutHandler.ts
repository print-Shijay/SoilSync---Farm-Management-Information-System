import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../AuthContext';
import { getPendingUploadDetails } from '../pending-uploads';

export function useLogoutHandler() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [isCheckingSync, setIsCheckingSync] = useState(false);

  const handleLogoutInitiated = async () => {
    setIsCheckingSync(true);
    try {
      const stats = await Promise.race([
        getPendingUploadDetails(),
        new Promise<{ count: number; items: any[]; tableCounts: Record<string, number> }>((resolve) =>
          setTimeout(() => resolve({ count: 0, items: [], tableCounts: {} }), 3000)
        ),
      ]);
      if (stats.count > 0) {
        // Unsynced items present -> show LogoutSyncModal
        setLogoutModalVisible(true);
      } else {
        // Queue clean -> normal fast sign out
        await signOut();
        router.replace('/auth/login');
      }
    } catch (error) {
      console.warn('[useLogoutHandler] Error checking pending queue:', error);
      // Fallback to opening modal to let user choose
      setLogoutModalVisible(true);
    } finally {
      setIsCheckingSync(false);
    }
  };

  const handleSignOutSuccess = () => {
    setLogoutModalVisible(false);
    router.replace('/auth/login');
  };

  return {
    logoutModalVisible,
    setLogoutModalVisible,
    isCheckingSync,
    handleLogoutInitiated,
    handleSignOutSuccess,
  };
}
