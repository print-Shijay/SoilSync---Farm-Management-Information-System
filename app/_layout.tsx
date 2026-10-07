import { useEffect, useState } from 'react';
import { Platform, AppState } from 'react-native';
import { Stack } from 'expo-router';
import * as Application from 'expo-application';
import { AuthProvider, useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { useBackgroundCheckupImageSync } from '../lib/checkup-storage';
import { ForceUpdateGate } from '../components/ForceUpdateGate';
import { GlobalAlertModal } from '../components/common/AppAlert';
import { ModalPortalHost } from '../components/common/ModalPortal';
import '../global.css';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { AccessibilityProvider, useAccessibility } from '../lib/accessibility';
import * as Notifications from 'expo-notifications';
import { initNotificationService, handleNotificationResponseData } from '../lib/notifications/notification-service';

function BackgroundSyncRunner() {
  const { user } = useAuth();
  useBackgroundCheckupImageSync(user?.id);
  return null;
}

// Suppress strict mode warnings when third-party components read/write shared values during render
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

function RootNavigationStack() {
  const { isReduceMotion } = useAccessibility();

  return (
    <Stack screenOptions={{ headerShown: false, animation: isReduceMotion ? 'none' : 'default' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
      <Stack.Screen name="auth/landing" options={{ headerShown: false }} />
      <Stack.Screen name="auth/login" options={{ headerShown: false }} />
      <Stack.Screen name="auth/register" options={{ headerShown: false }} />
      <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
      <Stack.Screen
        name="auth/lock"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'fade' }}
      />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen
        name="farm/layouts"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="farm/layout-designer/[farmId]"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="farm/master-map/[farmId]"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen name="farm/[id]" options={{ animation: 'none' }} />
      <Stack.Screen
        name="farm/planner/[id]"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="farm/npk-sensor/[id]"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="farm/[id]/members"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="farm/[id]/logs"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="todo/add"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="todo/edit/[id]"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="farming-module/modules"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="farming-module/book-module/[id]"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="announcements/index"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="user-folders/index"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="user-folders/folders/[id]"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="teams/index"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
      <Stack.Screen
        name="teams/[id]"
        options={{ headerShown: false, animation: isReduceMotion ? 'none' : 'slide_from_right' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [needsForceUpdate, setNeedsForceUpdate] = useState(false);
  const [updateConfig, setUpdateConfig] = useState<{
    updateUrl: string;
    minVersionCode?: number;
    currentVersionCode?: number;
    releaseNotes?: string | null;
  } | null>(null);

  useEffect(() => {
    initNotificationService();

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response?.notification?.request?.content?.data) {
          handleNotificationResponseData(response.notification.request.content.data);
        }
      })
      .catch((e) => {
        console.warn('Error checking last notification response:', e);
      });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const applyImmersiveMode = async () => {
        try {
          await NavigationBar.setVisibilityAsync('hidden');
        } catch {
          // Guard against platform warnings
        }
      };

      applyImmersiveMode();

      const subscription = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          applyImmersiveMode();
        }
      });

      const visibilitySubscription = NavigationBar.addVisibilityListener(({ visibility }) => {
        if (visibility === 'visible') {
          applyImmersiveMode();
        }
      });

      return () => {
        subscription.remove();
        visibilitySubscription.remove();
      };
    }
  }, []);

  useEffect(() => {
    async function checkAppVersion() {
      try {
        const rawBuildVersion = Application.nativeBuildVersion;
        const currentVersionCode = rawBuildVersion ? parseInt(rawBuildVersion, 10) : 1;

        const { data, error } = await supabase
          .from('app_version_config')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.warn('Could not fetch app version config:', error.message);
          return;
        }

        if (data && typeof data.min_supported_version_code === 'number') {
          if (currentVersionCode < data.min_supported_version_code) {
            setUpdateConfig({
              updateUrl:
                data.update_url ||
                'https://play.google.com/store/apps/details?id=com.shijaydev.SoilSync',
              minVersionCode: data.min_supported_version_code,
              currentVersionCode,
              releaseNotes: data.release_notes,
            });
            setNeedsForceUpdate(true);
          }
        }
      } catch (err) {
        console.warn('Version check error:', err);
      }
    }

    checkAppVersion();
  }, []);

  if (needsForceUpdate && updateConfig) {
    return (
      <ForceUpdateGate
        updateUrl={updateConfig.updateUrl}
        minVersionCode={updateConfig.minVersionCode}
        currentVersionCode={updateConfig.currentVersionCode}
        releaseNotes={updateConfig.releaseNotes}
      />
    );
  }

  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <AccessibilityProvider>
        <AuthProvider>
          <BackgroundSyncRunner />
          <StatusBar hidden />
          <RootNavigationStack />
          <ModalPortalHost />
          <GlobalAlertModal />
        </AuthProvider>
      </AccessibilityProvider>
    </KeyboardProvider>
  );
}


