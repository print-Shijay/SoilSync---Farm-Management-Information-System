import { Tabs, router } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import { useEffect } from 'react';
import { CustomTabBar } from '../../components/CustomTabBar';

export default function TabLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [user, loading]);

  if (loading) return null;

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="farms"
        options={{
          title: 'Farms',
        }}
      />
      <Tabs.Screen
        name="addFarm"
        options={{
          title: 'Add',
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
        }}
      />
    </Tabs>
  );
}
