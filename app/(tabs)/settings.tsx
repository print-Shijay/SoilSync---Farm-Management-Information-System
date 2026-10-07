import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  User,
  Bell,
  Shield,
  HelpCircle,
  Info,
  ChevronRight,
  LogOut,
  Sprout,
  Cpu,
  Eye,
  Users,
} from 'lucide-react-native';
import { useAccessibility } from '../../lib/accessibility';
import { LogoutSyncModal } from '../../components/LogoutSyncModal';
import { useLogoutHandler } from '../../lib/hooks/useLogoutHandler';
import {
  getActiveHealthModelId,
  isHealthModelDownloaded,
} from '../../modules/yolo-detector/modelLoader';
import { getHealthDetectionModel, HealthDetectionModel } from '../../lib/detection-preference';

interface SettingItemProps {
  icon: React.ElementType;
  title: string;
  route: string;
  subtitle?: string;
  badge?: string;
}

const SettingItem = ({ icon: Icon, title, route, subtitle, badge }: SettingItemProps) => {
  const { isGloveMode, isHighContrast, fontScale, triggerHaptic } = useAccessibility();

  return (
    <TouchableOpacity
      className={`flex-row items-center px-4 active:scale-[0.99] active:opacity-75 ${
        isGloveMode ? 'min-h-[58px] py-4' : 'py-3.5'
      }`}
      onPress={() => {
        triggerHaptic('selection');
        router.push(route);
      }}>
      <View className="mr-3.5 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
        <Icon color="#8C4522" size={19} strokeWidth={2.2} />
      </View>
      <View className="flex-1">
        <Text
          style={{ fontSize: 16 * fontScale }}
          className={`tracking-tight ${
            isHighContrast ? 'font-black text-black' : 'font-bold text-espresso'
          }`}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{ fontSize: 12 * fontScale }}
            className={`font-medium ${
              isHighContrast ? 'font-semibold text-black/80' : 'text-taupe'
            }`}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View className="mr-2 rounded-full bg-cognac/10 px-2.5 py-0.5">
          <Text className="text-[10px] font-bold text-cognac">{badge}</Text>
        </View>
      ) : null}
      <ChevronRight size={18} color="#8C7C70" strokeWidth={2.2} />
    </TouchableOpacity>
  );
};

const Divider = () => <View className="ml-16 mr-4 h-[1px] bg-black/5" />;

export default function SettingsScreen() {
  const { isGloveMode, isHighContrast, fontScale, triggerHaptic } = useAccessibility();
  const {
    logoutModalVisible,
    setLogoutModalVisible,
    isCheckingSync,
    handleLogoutInitiated,
    handleSignOutSuccess,
  } = useLogoutHandler();

  const [activeEdgeModelName, setActiveEdgeModelName] = useState<string>('');
  const [detectionEngine, setDetectionEngine] = useState<HealthDetectionModel>('yolo');
  const [isModelDownloaded, setIsModelDownloaded] = useState<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      Promise.all([getActiveHealthModelId(), getHealthDetectionModel()])
        .then(async ([modelId, engine]) => {
          const downloaded = modelId ? await isHealthModelDownloaded(modelId) : false;
          if (isMounted) {
            setActiveEdgeModelName(modelId);
            setDetectionEngine(engine);
            setIsModelDownloaded(downloaded);
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }, [])
  );

  const cardStyle = isHighContrast
    ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
    : undefined;

  return (
    <View className="flex-1 bg-champagne">
      <ScrollView className="flex-1 px-5 pt-14" showsVerticalScrollIndicator={false}>
        <View className="mb-6">
          <Text
            style={{ fontSize: 28 * fontScale }}
            className={`tracking-tight ${
              isHighContrast ? 'font-black text-black' : 'font-black text-espresso'
            }`}>
            Settings
          </Text>
          <Text
            style={{ fontSize: 11 * fontScale }}
            className={`font-bold uppercase tracking-[0.25em] ${
              isHighContrast ? 'text-black font-black' : 'text-taupe'
            }`}>
            Preferences & Account
          </Text>
        </View>

        {/* Section 1: Account */}
        <View className="mb-5">
          <Text
            style={{ fontSize: 11 * fontScale }}
            className={`mb-2 ml-2 font-bold uppercase tracking-[0.2em] ${
              isHighContrast ? 'text-black font-black' : 'text-taupe'
            }`}>
            Account & Security
          </Text>
          <View
            style={cardStyle}
            className="overflow-hidden rounded-[26px] border border-white/90 bg-white/85 shadow-sm shadow-espresso/5">
            <SettingItem icon={User} title="Profile Account" route="/settings/account" />
            <Divider />
            <SettingItem
              icon={Shield}
              title="Privacy & Security"
              route="/settings/privacy-and-security"
            />
            <Divider />
            <SettingItem
              icon={Users}
              title="Teams"
              subtitle="Collaborators, farm & folder permissions"
              route="/teams"
            />
          </View>
        </View>

        {/* Section 2: Farming & Crops */}
        <View className="mb-5">
          <Text
            style={{ fontSize: 11 * fontScale }}
            className={`mb-2 ml-2 font-bold uppercase tracking-[0.2em] ${
              isHighContrast ? 'text-black font-black' : 'text-taupe'
            }`}>
            Farming & Crops
          </Text>
          <View
            style={cardStyle}
            className="overflow-hidden rounded-[26px] border border-white/90 bg-white/85 shadow-sm shadow-espresso/5">
            <SettingItem icon={Sprout} title="Custom Crops Catalog" route="/custom-crops" />
          </View>
        </View>

        {/* Section 3: AI & Offline Detection */}
        <View className="mb-5">
          <Text
            style={{ fontSize: 11 * fontScale }}
            className={`mb-2 ml-2 font-bold uppercase tracking-[0.2em] ${
              isHighContrast ? 'text-black font-black' : 'text-taupe'
            }`}>
            AI & Offline Detection
          </Text>
          <View
            style={cardStyle}
            className="overflow-hidden rounded-[26px] border border-white/90 bg-white/85 shadow-sm shadow-espresso/5">
            <SettingItem
              icon={Cpu}
              title="AI Edge Models"
              subtitle={
                detectionEngine === 'rfdetr'
                  ? 'Cloud AI (DETR)'
                  : isModelDownloaded && activeEdgeModelName
                  ? activeEdgeModelName
                  : 'No Model Downloaded'
              }
              badge={detectionEngine === 'yolo' ? 'Offline' : 'Cloud'}
              route="/settings/edge-models"
            />
          </View>
        </View>

        {/* Section 4: Preferences */}
        <View className="mb-5">
          <Text
            style={{ fontSize: 11 * fontScale }}
            className={`mb-2 ml-2 font-bold uppercase tracking-[0.2em] ${
              isHighContrast ? 'text-black font-black' : 'text-taupe'
            }`}>
            App Preferences
          </Text>
          <View
            style={cardStyle}
            className="overflow-hidden rounded-[26px] border border-white/90 bg-white/85 shadow-sm shadow-espresso/5">
            <SettingItem
              icon={Eye}
              title="Accessibility"
              route="/settings/accessibility"
            />
            <Divider />
            <SettingItem icon={Bell} title="Notifications" route="/settings/notifications" />
          </View>
        </View>

        {/* Section 5: Help & Support */}
        <View className="mb-6">
          <Text
            style={{ fontSize: 11 * fontScale }}
            className={`mb-2 ml-2 font-bold uppercase tracking-[0.2em] ${
              isHighContrast ? 'text-black font-black' : 'text-taupe'
            }`}>
            Support & Info
          </Text>
          <View
            style={cardStyle}
            className="overflow-hidden rounded-[26px] border border-white/90 bg-white/85 shadow-sm shadow-espresso/5">
            <SettingItem icon={HelpCircle} title="Support" route="/settings/support" />
            <Divider />
            <SettingItem icon={Info} title="About SoilSync" route="/settings/about" />
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : undefined}
          className={`mt-2 w-full items-center justify-center self-center rounded-full bg-cognac px-4 shadow-md shadow-cognac/30 active:scale-[0.98] ${
            isGloveMode ? 'min-h-[60px] py-4' : 'min-h-[52px] py-3.5'
          }`}
          onPress={() => {
            triggerHaptic('medium');
            handleLogoutInitiated();
          }}
          activeOpacity={0.85}
          disabled={isCheckingSync}>
          <View className="flex-row items-center justify-center" style={{ gap: 10 }}>
            {isCheckingSync ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <LogOut
                color="white"
                size={Math.round((isGloveMode ? 22 : 19) * Math.min(fontScale, 1.3))}
                strokeWidth={2.4}
              />
            )}
            <Text
              style={{
                fontSize: Math.round(16 * fontScale),
                lineHeight: Math.round(22 * fontScale),
                includeFontPadding: false,
              }}
              className="text-center font-extrabold text-white">
              {isCheckingSync ? 'Checking Sync Status...' : 'Log Out'}
            </Text>
          </View>
        </TouchableOpacity>

        <View className="h-[25vh]" />
      </ScrollView>

      <LogoutSyncModal
        visible={logoutModalVisible}
        onClose={() => setLogoutModalVisible(false)}
        onSignOutSuccess={handleSignOutSuccess}
      />
    </View>
  );
}
