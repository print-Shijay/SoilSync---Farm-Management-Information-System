import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal } from '../common/AppModal';
import { Bell, X, Calendar, Sparkles, ChevronRight } from 'lucide-react-native';
import { router } from 'expo-router';
import { AnnouncementRecord } from '../../lib/db-operations';
import { RichContentRenderer } from '../common/RichContentRenderer';
import { useAccessibility } from '../../lib/accessibility';

type AnnouncementModalProps = {
  announcement: AnnouncementRecord | null;
  visible: boolean;
  onClose: () => void;
  onViewAll?: () => void;
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr.slice(0, 10);
  }
}

export function AnnouncementModal({
  announcement,
  visible,
  onClose,
  onViewAll,
}: AnnouncementModalProps) {
  const { fontScale, isGloveMode, isHighContrast, triggerHaptic } = useAccessibility();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  if (!announcement) return null;

  const handleExploreAll = () => {
    triggerHaptic('selection');
    onClose();
    if (onViewAll) {
      onViewAll();
    } else {
      router.push('/announcements');
    }
  };

  const sheetHeight = Math.min(Math.round(screenHeight * 0.85), 780);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        {/* Dimming Backdrop Scrim - tapping outside sheet closes modal */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => {
            triggerHaptic('selection');
            onClose();
          }}
          accessibilityLabel="Close announcement modal"
        />

        {/* Floating Bottom Sheet */}
        <View
          style={{ height: sheetHeight }}
          className="rounded-t-[36px] border-t border-white/90 bg-champagne shadow-2xl overflow-hidden">
          {/* Drag Handle */}
          <View className="items-center pb-2 pt-3">
            <View className="h-1.5 w-10 rounded-full bg-taupe/30" />
          </View>

          {/* Unified Scrollable Announcement Body */}
          <ScrollView
            className="flex-1"
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={true}
            bounces={true}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom, 24) + 24,
            }}>
            {/* Header Row: Category Badge & Dismiss Button */}
            <View className="flex-row items-center justify-between mb-3.5">
              <View className="flex-row items-center gap-2">
                <View className="rounded-full bg-cognac/10 border border-cognac/20 px-3 py-1 flex-row items-center">
                  <Sparkles size={12} color="#8C4522" strokeWidth={2.5} />
                  <Text
                    style={{ fontSize: Math.round(11 * fontScale) }}
                    className="ml-1.5 font-bold uppercase tracking-[0.18em] text-cognac">
                    {announcement.category || 'Insights & Updates'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  triggerHaptic('selection');
                  onClose();
                }}
                activeOpacity={0.7}
                hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : { top: 12, bottom: 12, left: 12, right: 12 }}
                style={isGloveMode ? { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' } : undefined}
                className="h-8 w-8 items-center justify-center rounded-full bg-black/5">
                <X size={16} color="#1C120C" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            {/* Announcement Title */}
            <Text
              style={{ fontSize: Math.round(24 * fontScale), lineHeight: Math.round(32 * fontScale) }}
              className="font-black tracking-tight text-espresso mb-2">
              {announcement.title}
            </Text>

            {/* Published Date */}
            <View className="flex-row items-center mb-4">
              <Calendar size={13} color="#8C7C70" strokeWidth={2} />
              <Text
                style={{ fontSize: Math.round(12 * fontScale) }}
                className="ml-1.5 font-semibold text-taupe">
                Published: {formatDate(announcement.created_at)}
              </Text>
            </View>

            {/* Banner Image (if available) */}
            {announcement.banner_url ? (
              <View className="mb-5 overflow-hidden rounded-2xl border border-black/5 shadow-sm bg-black/5">
                <Image
                  source={{ uri: announcement.banner_url }}
                  className="h-48 w-full"
                  resizeMode="cover"
                />
              </View>
            ) : null}

            {/* Highlight Summary Box */}
            <View className="mb-4 rounded-2xl border border-cognac/15 bg-cognac/5 p-4">
              <View className="flex-row items-center mb-1.5">
                <Bell size={14} color="#8C4522" strokeWidth={2.2} />
                <Text
                  style={{ fontSize: Math.round(11 * fontScale) }}
                  className="ml-2 font-bold uppercase tracking-wider text-cognac">
                  Summary Highlight
                </Text>
              </View>
              <Text
                style={{ fontSize: Math.round(14 * fontScale) }}
                className="font-medium leading-relaxed text-espresso/90">
                {announcement.summary}
              </Text>
            </View>

            {/* Full Extended Article / Content */}
            {announcement.content ? (
              <View className="pt-2 pb-2 border-t border-taupe/15">
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="font-bold uppercase tracking-wider text-taupe mb-2">
                  Details & Guidelines
                </Text>
                <RichContentRenderer content={announcement.content} baseFontSize={Math.round(14 * fontScale)} />
              </View>
            ) : null}

            {/* Action Buttons Row */}
            <View className="mt-6 gap-2.5">
              {/* Primary CTA: Explore All Announcements */}
              <TouchableOpacity
                onPress={handleExploreAll}
                activeOpacity={0.75}
                hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                className="w-full flex-row items-center justify-center rounded-2xl bg-cognac py-3.5 px-4 shadow-sm shadow-cognac/20">
                <Text
                  style={{ fontSize: Math.round(14 * fontScale) }}
                  className="font-bold text-white tracking-wide mr-1.5">
                  More Announcements & Advisories
                </Text>
                <ChevronRight size={16} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>

              {/* Secondary Dismiss Button */}
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic('selection');
                  onClose();
                }}
                activeOpacity={0.7}
                hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                className="w-full items-center justify-center rounded-2xl bg-black/5 py-3">
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="font-bold text-taupe tracking-wide">
                  Dismiss
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
