import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: '#FBF8F4' },
        headerTintColor: '#1C120C',
        headerTitleStyle: {
          color: '#1C120C',
          fontWeight: '800',
        },
      }}>
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="profile-information" options={{ title: 'Profile Information' }} />
      <Stack.Screen name="change-password" options={{ title: 'Change Password' }} />
      <Stack.Screen name="archive-account" options={{ title: 'Deactivate Account' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete Account' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="privacy-and-security" options={{ title: 'Privacy & Security' }} />
      <Stack.Screen name="support" options={{ title: 'Support' }} />
      <Stack.Screen name="accessibility" options={{ title: 'Accessibility' }} />
      <Stack.Screen name="about" options={{ title: 'About' }} />
      <Stack.Screen name="edge-models" options={{ title: 'AI Edge Models' }} />
    </Stack>
  );
}
