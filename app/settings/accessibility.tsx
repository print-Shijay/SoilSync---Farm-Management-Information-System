import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Switch } from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { AppModal } from '../../components/common/AppModal';
import {
  Sun,
  Eye,
  Maximize2,
  Smartphone,
  Activity,
  RotateCcw,
  Sparkles,
  Zap,
  Leaf,
  Check,
  Info,
  X,
} from 'lucide-react-native';
import { useAccessibility, TextSizeOption } from '../../lib/accessibility';
import { StatusIndicator, AccessibleButton } from '../../components/common/accessible';

interface AccessibilityTopic {
  id: string;
  title: string;
  category: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  iconBgColor: string;
  iconBorderColor: string;
  iconColor: string;
  description: string;
  detailHint?: string;
  hasBadgesDemo?: boolean;
  hasHapticTest?: boolean;
}

const TOPIC_DETAILS: Record<string, AccessibilityTopic> = {
  textSize: {
    id: 'textSize',
    title: 'Text Size Scaling',
    category: 'Display & Text',
    icon: Sun,
    iconBgColor: '#FEF3C7',
    iconBorderColor: 'rgba(253, 230, 138, 0.8)',
    iconColor: '#D97706',
    description:
      'Increases font scale across all farm dashboards, soil telemetry, and task lists. Choose Standard (1.0x), Large (1.15x), or Extra Large (1.30x) for rapid legibility at arm’s length in the field.',
    detailHint: 'Line spacing scales automatically so words never overlap or clip.',
  },
  highContrast: {
    id: 'highContrast',
    title: 'Outdoor High Contrast',
    category: 'Display & Text',
    icon: Sun,
    iconBgColor: '#FEF3C7',
    iconBorderColor: 'rgba(253, 230, 138, 0.8)',
    iconColor: '#D97706',
    description:
      'Sharpens text to deep black and reinforces card borders with crisp outlines to cut through bright outdoor sunlight glare.',
    detailHint: 'Especially helpful when checking sensor readings during midday sun.',
  },
  colorblindSafe: {
    id: 'colorblindSafe',
    title: 'Colorblind-Safe Badges',
    category: 'Display & Text',
    icon: Eye,
    iconBgColor: '#CCFBF1',
    iconBorderColor: 'rgba(153, 246, 228, 0.8)',
    iconColor: '#0D9488',
    description:
      'Adds geometric shape indicators next to colors across all soil and crop health readings. Status is immediately recognizable without relying purely on color vision.',
    hasBadgesDemo: true,
    detailHint: 'Geometric symbols: [✓] Optimal, [▼] Low, [▲] High, [⚠] Warning, [✖] Critical.',
  },
  gloveMode: {
    id: 'gloveMode',
    title: 'Large Targets (Glove Mode)',
    category: 'Physical & Touch',
    icon: Maximize2,
    iconBgColor: 'rgba(140, 69, 34, 0.1)',
    iconBorderColor: 'rgba(140, 69, 34, 0.2)',
    iconColor: '#8C4522',
    description:
      'Expands button heights to 52–56px, enlarges padding, and extends interactive touch margins (hitSlop) to 16px for reliable taps with thick work gloves or damp hands.',
    detailHint: 'Designed for field work, muddy hands, and pesticide application gear.',
  },
  hapticFeedback: {
    id: 'hapticFeedback',
    title: 'Haptic Vibration Feedback',
    category: 'Physical & Touch',
    icon: Smartphone,
    iconBgColor: '#E0E7FF',
    iconBorderColor: 'rgba(199, 210, 254, 0.8)',
    iconColor: '#4F46E5',
    description:
      'Triggers tactile vibration pulses when tapping buttons, toggling switches, and syncing sensor data. Delivers physical confirmation in noisy field environments around machinery.',
    hasHapticTest: true,
  },
  reduceMotion: {
    id: 'reduceMotion',
    title: 'Reduce Motion Transitions',
    category: 'Motion & Speed',
    icon: Activity,
    iconBgColor: '#FFEDD5',
    iconBorderColor: 'rgba(254, 215, 170, 0.8)',
    iconColor: '#EA580C',
    description:
      'Replaces screen slide and fade animations with instantaneous transitions for faster navigation, lower battery drain, and reduced motion strain.',
    detailHint: 'Recommended for quick multi-field navigation on lower-power devices.',
  },
};

export default function AccessibilitySettingsScreen() {
  const {
    settings,
    fontScale,
    isHighContrast,
    isGloveMode,
    setTextSize,
    setHighContrast,
    setColorblindSafe,
    setGloveMode,
    setHapticFeedback,
    setReduceMotion,
    resetToDefaults,
    triggerHaptic,
  } = useAccessibility();

  const [testButtonPressed, setTestButtonPressed] = useState(false);
  const [activeTopic, setActiveTopic] = useState<AccessibilityTopic | null>(null);

  const handleReset = () => {
    triggerHaptic('warning');
    Alert.alert(
      'Reset Accessibility',
      'Are you sure you want to reset all display and touch options to the default settings?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset to Defaults',
          style: 'destructive',
          onPress: () => void resetToDefaults(),
        },
      ]
    );
  };

  const handleTestPress = () => {
    triggerHaptic('success');
    setTestButtonPressed(true);
    setTimeout(() => setTestButtonPressed(false), 1200);
  };

  const openTopic = (topicKey: keyof typeof TOPIC_DETAILS, isLongPress = false) => {
    triggerHaptic(isLongPress ? 'medium' : 'light');
    setActiveTopic(TOPIC_DETAILS[topicKey]);
  };

  const textSizeOptions: { label: string; value: TextSizeOption; scale: string }[] = [
    { label: 'Standard', value: 'standard', scale: '1.0x' },
    { label: 'Large', value: 'large', scale: '1.20x' },
    { label: 'Extra Large', value: 'extra-large', scale: '1.38x' },
  ];

  const InfoButton = ({ topicKey }: { topicKey: keyof typeof TOPIC_DETAILS }) => (
    <TouchableOpacity
      onLongPress={() => openTopic(topicKey, true)}
      onPress={() => openTopic(topicKey, false)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`Info on ${TOPIC_DETAILS[topicKey].title}. Hold for details.`}
      className="ml-2 h-5 w-5 items-center justify-center rounded-full bg-taupe/15 active:bg-cognac/25">
      <Info size={11} color="#8C7C70" strokeWidth={2.4} />
    </TouchableOpacity>
  );

  return (
    <ScrollView className="flex-1 bg-champagne p-5" showsVerticalScrollIndicator={false}>
      {/* 1. Compact Live Field Preview Card */}
      <View className="mb-5">
        <View className="mb-2 ml-2 flex-row items-center justify-between">
          <Text className="text-[11px] font-bold uppercase tracking-[0.2em] text-taupe">
            Live Field Preview
          </Text>
          <View className="flex-row items-center gap-1">
            <Sparkles size={12} color="#8C4522" strokeWidth={2.2} />
            <Text className="text-[10px] font-extrabold uppercase text-cognac">Real-time Test</Text>
          </View>
        </View>

        <View
          className="overflow-hidden rounded-[26px] bg-white p-4"
          style={
            isHighContrast
              ? {
                  borderWidth: 2,
                  borderColor: 'rgba(0,0,0,0.35)',
                  elevation: 3,
                }
              : {
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.9)',
                  elevation: 1,
                }
          }>
          {/* Header of Preview */}
          <View className="mb-3 flex-row items-center justify-between border-b border-black/5 pb-2.5">
            <View className="flex-row items-center">
              <View className="mr-2.5 h-8 w-8 items-center justify-center rounded-xl bg-cognac/10">
                <Leaf size={16} color="#8C4522" strokeWidth={2.2} />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 13.5 * fontScale,
                    color: isHighContrast ? '#000000' : '#2D231E',
                    fontWeight: isHighContrast ? '900' : '700',
                  }}
                  className="tracking-tight">
                  Field A - Zone 3
                </Text>
                <Text style={{ fontSize: 10.5 * fontScale }} className="font-medium text-taupe">
                  ESP32 Soil Sensor
                </Text>
              </View>
            </View>

            {/* Live Status Indicator Pill */}
            <StatusIndicator status="optimal" label="Moisture 68%" size="sm" />
          </View>

          {/* Interactive Action Button */}
          <AccessibleButton
            onPress={handleTestPress}
            className="w-full items-center justify-center rounded-2xl"
            style={{
              backgroundColor: isHighContrast ? '#2D231E' : '#8C4522',
              borderWidth: isHighContrast ? 1 : 0,
              borderColor: '#000000',
              paddingVertical: isGloveMode ? 14 : 10,
            }}>
            <View className="flex-row items-center justify-center">
              {testButtonPressed ? (
                <>
                  <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={{ fontSize: 13 * fontScale }} className="ml-2 font-black text-white">
                    Vibration Confirmed!
                  </Text>
                </>
              ) : (
                <>
                  <Zap size={15} color="#FFFFFF" strokeWidth={2.2} />
                  <Text style={{ fontSize: 13 * fontScale }} className="ml-2 font-bold text-white">
                    {isGloveMode ? 'Tap With Glove to Test' : 'Test Touch & Haptic'}
                  </Text>
                </>
              )}
            </View>
          </AccessibleButton>
        </View>
      </View>

      {/* 2. Display & Text Card */}
      <View className="mb-5">
        <Text className="mb-2 ml-2 text-[11px] font-bold uppercase tracking-[0.2em] text-taupe">
          Display & Visibility
        </Text>
        <View className="overflow-hidden rounded-[26px] border border-white/90 bg-white p-4 shadow-sm shadow-espresso/5">
          {/* Text Size Selector */}
          <View className="border-b border-black/5 pb-3.5">
            <View className="mb-2.5 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Text className="text-[14.5px] font-bold text-espresso">Text Size</Text>
                <InfoButton topicKey="textSize" />
              </View>
              <Text className="text-xs font-black uppercase text-cognac">
                {settings.textSize.replace('-', ' ')}
              </Text>
            </View>

            {/* Segmented Control with stable styles */}
            <View className="flex-row rounded-2xl border border-black/5 bg-champagne p-1">
              {textSizeOptions.map((opt) => {
                const isSelected = settings.textSize === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => void setTextSize(opt.value)}
                    activeOpacity={0.8}
                    className="flex-1 items-center justify-center rounded-xl border py-2"
                    style={{
                      backgroundColor: isSelected ? '#FFFFFF' : 'transparent',
                      borderColor: isSelected ? 'rgba(0, 0, 0, 0.06)' : 'transparent',
                      elevation: isSelected ? 1 : 0,
                      shadowColor: '#2D231E',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: isSelected ? 0.08 : 0,
                      shadowRadius: 2,
                    }}>
                    <Text
                      className="text-xs"
                      style={{
                        color: isSelected ? '#2D231E' : '#8C7C70',
                        fontWeight: isSelected ? '800' : '700',
                      }}>
                      {opt.label}
                    </Text>
                    <Text
                      className="text-[9.5px]"
                      style={{
                        color: isSelected ? '#8C4522' : 'rgba(140, 124, 112, 0.7)',
                        fontWeight: isSelected ? '700' : '600',
                      }}>
                      {opt.scale}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Outdoor High-Contrast Mode Toggle */}
          <View className="flex-row items-center justify-between border-b border-black/5 py-3">
            <View className="mr-3 flex-1 flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-50">
                <Sun size={17} color="#D97706" strokeWidth={2.2} />
              </View>
              <Text className="text-[14px] font-bold text-espresso">Outdoor High Contrast</Text>
              <InfoButton topicKey="highContrast" />
            </View>
            <Switch
              value={settings.highContrast}
              onValueChange={(val) => void setHighContrast(val)}
              trackColor={{ false: '#E5E0D8', true: '#8C4522' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Colorblind-Safe Indicators Toggle */}
          <View className="flex-row items-center justify-between pt-3">
            <View className="mr-3 flex-1 flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-xl border border-teal-200/80 bg-teal-50">
                <Eye size={17} color="#0D9488" strokeWidth={2.2} />
              </View>
              <Text className="text-[14px] font-bold text-espresso">Colorblind Badges</Text>
              <InfoButton topicKey="colorblindSafe" />
            </View>
            <Switch
              value={settings.colorblindSafe}
              onValueChange={(val) => void setColorblindSafe(val)}
              trackColor={{ false: '#E5E0D8', true: '#8C4522' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </View>

      {/* 3. Physical & Touch Card */}
      <View className="mb-5">
        <Text className="mb-2 ml-2 text-[11px] font-bold uppercase tracking-[0.2em] text-taupe">
          Physical & Touch
        </Text>
        <View className="overflow-hidden rounded-[26px] border border-white/90 bg-white p-4 shadow-sm shadow-espresso/5">
          {/* Glove Mode (Large Touch Targets) Toggle */}
          <View className="flex-row items-center justify-between border-b border-black/5 pb-3">
            <View className="mr-3 flex-1 flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-xl border border-cognac/20 bg-cognac/10">
                <Maximize2 size={17} color="#8C4522" strokeWidth={2.2} />
              </View>
              <Text className="text-[14px] font-bold text-espresso">
                Large Targets (Glove Mode)
              </Text>
              <InfoButton topicKey="gloveMode" />
            </View>
            <Switch
              value={settings.gloveMode}
              onValueChange={(val) => void setGloveMode(val)}
              trackColor={{ false: '#E5E0D8', true: '#8C4522' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Haptic Vibration Feedback Toggle */}
          <View className="flex-row items-center justify-between pt-3">
            <View className="mr-3 flex-1 flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-50">
                <Smartphone size={17} color="#4F46E5" strokeWidth={2.2} />
              </View>
              <Text className="text-[14px] font-bold text-espresso">Haptic Vibration</Text>
              <InfoButton topicKey="hapticFeedback" />
            </View>
            <Switch
              value={settings.hapticFeedback}
              onValueChange={(val) => void setHapticFeedback(val)}
              trackColor={{ false: '#E5E0D8', true: '#8C4522' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </View>

      {/* 4. Motion & Speed Card */}
      <View className="mb-5">
        <Text className="mb-2 ml-2 text-[11px] font-bold uppercase tracking-[0.2em] text-taupe">
          Motion & Speed
        </Text>
        <View className="overflow-hidden rounded-[26px] border border-white/90 bg-white p-4 shadow-sm shadow-espresso/5">
          <View className="flex-row items-center justify-between">
            <View className="mr-3 flex-1 flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-xl border border-orange-200/80 bg-orange-50">
                <Activity size={17} color="#EA580C" strokeWidth={2.2} />
              </View>
              <Text className="text-[14px] font-bold text-espresso">Reduce Motion</Text>
              <InfoButton topicKey="reduceMotion" />
            </View>
            <Switch
              value={settings.reduceMotion}
              onValueChange={(val) => void setReduceMotion(val)}
              trackColor={{ false: '#E5E0D8', true: '#8C4522' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </View>

      {/* 5. Reset to Defaults Action */}
      <TouchableOpacity
        onPress={handleReset}
        activeOpacity={0.8}
        className="mb-8 flex-row items-center justify-center rounded-2xl border border-black/10 bg-white/70 py-3.5">
        <RotateCcw size={15} color="#8C7C70" strokeWidth={2.2} />
        <Text className="ml-2 text-xs font-bold text-taupe">Reset Accessibility to Defaults</Text>
      </TouchableOpacity>

      <View className="h-16" />

      {/* 6. Hold-to-View Explanation Modal */}
      <AppModal
        visible={activeTopic !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveTopic(null)}>
        <View className="flex-1 items-center justify-center bg-black/55 px-6">
          <Pressable className="absolute inset-0" onPress={() => setActiveTopic(null)} />

          <View className="w-full max-w-sm overflow-hidden rounded-[28px] border border-black/5 bg-white p-5 shadow-2xl">
            {/* Modal Header */}
            <View className="mb-3.5 flex-row items-center justify-between border-b border-black/5 pb-2">
              <View className="mr-2 flex-1 flex-row items-center">
                <View
                  className="mr-2.5 h-9 w-9 items-center justify-center rounded-2xl border"
                  style={{
                    backgroundColor: activeTopic?.iconBgColor || 'rgba(140, 69, 34, 0.1)',
                    borderColor: activeTopic?.iconBorderColor || 'rgba(140, 69, 34, 0.2)',
                  }}>
                  {activeTopic && (
                    <activeTopic.icon size={18} color={activeTopic.iconColor} strokeWidth={2.2} />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-taupe">
                    {activeTopic?.category}
                  </Text>
                  <Text className="text-[15px] font-black text-espresso">{activeTopic?.title}</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  triggerHaptic('light');
                  setActiveTopic(null);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="h-8 w-8 items-center justify-center rounded-full bg-black/5 active:bg-black/10">
                <X size={16} color="#8C7C70" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {/* Explanation Body */}
            <Text className="mb-3.5 text-[13px] font-medium leading-relaxed text-taupe">
              {activeTopic?.description}
            </Text>

            {/* Visual Demo for Colorblind-Safe Badges */}
            {activeTopic?.hasBadgesDemo && (
              <View className="mb-3.5 rounded-2xl border border-black/5 bg-champagne/70 p-3">
                <Text className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-taupe">
                  Dual-Channel Symbol Badges
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  <StatusIndicator status="optimal" label="Optimal" size="sm" />
                  <StatusIndicator status="low" label="Low" size="sm" />
                  <StatusIndicator status="high" label="High" size="sm" />
                  <StatusIndicator status="warning" label="Warning" size="sm" />
                </View>
              </View>
            )}

            {/* In-Modal Haptic Test */}
            {activeTopic?.hasHapticTest && (
              <View className="mb-3.5">
                <TouchableOpacity
                  onPress={() => triggerHaptic('heavy')}
                  activeOpacity={0.8}
                  className="flex-row items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-50 py-2.5">
                  <Zap size={14} color="#4F46E5" strokeWidth={2.2} />
                  <Text className="ml-2 text-xs font-bold text-indigo-700">
                    Tap to Test Vibration Pulse
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Contextual Hint */}
            {activeTopic?.detailHint && (
              <Text className="mb-4 text-[11px] font-semibold leading-relaxed text-cognac">
                💡 {activeTopic.detailHint}
              </Text>
            )}

            {/* Dismiss Action Button */}
            <TouchableOpacity
              onPress={() => {
                triggerHaptic('selection');
                setActiveTopic(null);
              }}
              activeOpacity={0.85}
              className="w-full items-center justify-center rounded-2xl bg-espresso py-3 shadow-sm active:bg-espresso/90">
              <Text className="text-xs font-bold uppercase tracking-wider text-white">Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppModal>
    </ScrollView>
  );
}
