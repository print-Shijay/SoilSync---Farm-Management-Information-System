import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Platform } from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { SMSSettings } from '../../modules/sms-subscription';
import { Bell, Sun, Moon, Users, CheckCircle2, WifiOff } from 'lucide-react-native';
import {
  getAppPermissionState,
  requestAppPermission,
  openPhoneSettings,
  setAppPermissionPreference,
} from '../../lib/permissions';
import { useAuth } from '../../lib/AuthContext';
import { scheduleDailyReminders } from '../../lib/notifications/notification-service';
import { useAccessibility } from '../../lib/accessibility';

export default function NotificationsSettings() {
  const { fontScale, isGloveMode, isHighContrast, triggerHaptic } = useAccessibility();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkState() {
      try {
        const state = await getAppPermissionState('notifications');
        setIsEnabled(state.granted);
      } catch {}
      setLoading(false);
    }
    void checkState();
  }, []);

  const handleToggle = async (val: boolean) => {
    triggerHaptic('selection');
    if (val) {
      const res = await requestAppPermission('notifications');
      if (res.granted) {
        setIsEnabled(true);
        if (userId) void scheduleDailyReminders(userId);
      } else {
        setIsEnabled(false);
        Alert.alert(
          'Notifications Permission',
          'Notification permission was not granted by your phone. Please allow notifications in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void openPhoneSettings() },
          ]
        );
      }
    } else {
      await setAppPermissionPreference('notifications', false);
      setIsEnabled(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-champagne p-5" showsVerticalScrollIndicator={false}>
      {/* 1. Master Push Notifications Switch */}
      <View className="mb-5">
        <Text
          style={{ fontSize: Math.round(11 * fontScale) }}
          className="mb-2 ml-2 font-bold uppercase tracking-[0.2em] text-taupe">
          Device Notifications
        </Text>
        <View
          style={isGloveMode ? { minHeight: 64 } : undefined}
          className="flex-row items-center overflow-hidden rounded-[26px] border border-white/90 bg-white p-4 shadow-sm shadow-espresso/5">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-cognac/10">
            <Bell color="#8C4522" size={20} strokeWidth={2.2} />
          </View>
          <View className="ml-3.5 flex-1">
            <Text
              style={{ fontSize: Math.round(15 * fontScale) }}
              className="font-bold tracking-tight text-espresso">
              Allow Notifications
            </Text>
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className="text-taupe font-medium">
              Daily briefings, due tasks, and team activity
            </Text>
          </View>
          <Switch
            value={isEnabled}
            onValueChange={handleToggle}
            trackColor={{ false: '#E5E0D8', true: '#8C4522' }}
            thumbColor="#FFFFFF"
            disabled={loading}
          />
        </View>
      </View>

      {/* 2. Scheduled Reminders Breakdown Card */}
      <View className="mb-6">
        <Text
          style={{ fontSize: Math.round(11 * fontScale) }}
          className="mb-2 ml-2 font-bold uppercase tracking-[0.2em] text-taupe">
          Automated Schedules
        </Text>
        <View className="overflow-hidden rounded-[26px] border border-white/90 bg-white p-4 shadow-sm shadow-espresso/5">
          {/* 5:00 AM Morning Briefing */}
          <View className="flex-row items-start pb-3.5 border-b border-black/5">
            <View className="h-8 w-8 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 mr-3">
              <Sun size={16} color="#D97706" strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="font-black text-espresso">
                  Morning Briefing
                </Text>
                <Text
                  style={{ fontSize: Math.round(11 * fontScale) }}
                  className="font-extrabold text-cognac">
                  5:00 AM GMT+8
                </Text>
              </View>
              <Text
                style={{ fontSize: Math.round(11.5 * fontScale) }}
                className="mt-0.5 text-taupe leading-relaxed">
                Daily field agenda summarizing today's tasks and priorities.
              </Text>
            </View>
          </View>

          {/* 5:00 PM Evening Wrap-up */}
          <View className="flex-row items-start py-3.5 border-b border-black/5">
            <View className="h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-200 mr-3">
              <Moon size={16} color="#4F46E5" strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="font-black text-espresso">
                  Evening Wrap-up
                </Text>
                <Text
                  style={{ fontSize: Math.round(11 * fontScale) }}
                  className="font-extrabold text-cognac">
                  5:00 PM GMT+8
                </Text>
              </View>
              <Text
                style={{ fontSize: Math.round(11.5 * fontScale) }}
                className="mt-0.5 text-taupe leading-relaxed">
                Urgent digest of pending and overdue tasks across your farms.
              </Text>
            </View>
          </View>

          {/* Instant Collaboration Events */}
          <View className="flex-row items-start pt-3.5">
            <View className="h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 mr-3">
              <Users size={16} color="#059669" strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="font-black text-espresso">
                  Team Collaboration
                </Text>
                <Text
                  style={{ fontSize: Math.round(11 * fontScale) }}
                  className="font-bold text-emerald-700">
                  Real-time
                </Text>
              </View>
              <Text
                style={{ fontSize: Math.round(11.5 * fontScale) }}
                className="mt-0.5 text-taupe leading-relaxed">
                Instant alerts when you are invited to a farm or a member finishes a task.
              </Text>
            </View>
          </View>

          {/* Offline Badge Pill */}
          <View className="mt-3.5 flex-row items-center gap-2 rounded-xl bg-cognac/5 border border-cognac/15 p-2.5">
            <WifiOff size={14} color="#8C4522" strokeWidth={2.2} />
            <Text
              style={{ fontSize: Math.round(10.5 * fontScale) }}
              className="flex-1 font-bold text-cognac">
              100% Offline Capable: Scheduled directly with your phone's OS alarm manager.
            </Text>
          </View>
        </View>
      </View>

      {/* 3. SMS Notifications Section */}
      <Text
        style={{ fontSize: Math.round(11 * fontScale) }}
        className="mb-2 ml-2 font-bold uppercase tracking-[0.2em] text-taupe">
        SMS Notifications
      </Text>
      <SMSSettings />
    </ScrollView>
  );
}
