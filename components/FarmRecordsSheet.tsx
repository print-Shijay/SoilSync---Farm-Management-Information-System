import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Modal } from './common/AppModal';
import { X, FileText, Activity, History, ChevronRight, Plus } from 'lucide-react-native';
import { Pencil, Users } from './Icons';
import { useAccessibility } from '../lib/accessibility';

interface FarmRecordsSheetProps {
  visible: boolean;
  onClose: () => void;
  farmName?: string;
  isOwner?: boolean;
  onEditFarm?: () => void;
  onOpenTeam?: () => void;
  dailyReportsCount?: number;
  hasReportedToday?: boolean;
  onOpenDailyLogs: () => void;
  onOpenDiagnostics: () => void;
  onOpenHistory: () => void;
  onOpenNewDailyLog?: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.82, 620);

function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function FarmRecordsSheet({
  visible,
  onClose,
  farmName,
  isOwner = true,
  onEditFarm,
  onOpenTeam,
  dailyReportsCount = 0,
  hasReportedToday = false,
  onOpenDailyLogs,
  onOpenDiagnostics,
  onOpenHistory,
  onOpenNewDailyLog,
}: FarmRecordsSheetProps) {
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();
  const [modalVisible, setModalVisible] = useState(visible);
  const translateY = useRef(new Animated.Value(visible ? 0 : SHEET_HEIGHT)).current;
  const scrimOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      translateY.stopAnimation();
      scrimOpacity.stopAnimation();
      translateY.setValue(0);
      scrimOpacity.setValue(1);
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SHEET_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scrimOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setModalVisible(false);
      });
    }
  }, [visible, translateY, scrimOpacity]);

  const handleDismiss = () => {
    triggerHaptic('light');
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scrimOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        } else {
          const resisted = rubberband(gestureState.dy, SHEET_HEIGHT);
          translateY.setValue(resisted);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.6) {
          Animated.spring(translateY, {
            toValue: SHEET_HEIGHT,
            velocity: gestureState.vy,
            damping: 20,
            stiffness: 220,
            useNativeDriver: true,
          }).start(() => {
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 22,
            stiffness: 260,
            mass: 0.9,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!modalVisible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      visible={modalVisible}
      onRequestClose={handleDismiss}
      statusBarTranslucent>
      <View className="flex-1 justify-end">
        {/* Scrim Backdrop */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: 'rgba(0, 0, 0, 0.45)',
              opacity: scrimOpacity,
            },
          ]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleDismiss} />
        </Animated.View>

        {/* Sheet Content Container */}
        <Animated.View
          style={[
            {
              transform: [{ translateY }],
              maxHeight: SHEET_HEIGHT,
            },
            isHighContrast && { borderWidth: 2, borderColor: '#000000' },
          ]}
          className="rounded-t-[32px] border-t border-black/[0.08] bg-white pb-6 shadow-2xl shadow-black/20">
          {/* Gesture / Handle Area */}
          <View {...panResponder.panHandlers} className="w-full items-center pt-3">
            <View className="h-1.5 w-12 rounded-full bg-taupe/30" />
          </View>

          {/* Header Row */}
          <View className="flex-row items-center justify-between px-6 pb-3 pt-3">
            <View className="flex-1 pr-3">
              <Text
                style={{
                  fontSize: 18 * fontScale,
                  color: isHighContrast ? '#000000' : '#2D231E',
                  fontWeight: isHighContrast ? '900' : '800',
                }}
                numberOfLines={1}>
                Farm Options & Records
              </Text>
              {farmName ? (
                <Text
                  style={{
                    fontSize: 12 * fontScale,
                    color: isHighContrast ? '#333333' : '#8C7C70',
                  }}
                  className="mt-0.5"
                  numberOfLines={1}>
                  {farmName}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={handleDismiss}
              hitSlop={10}
              className="h-8 w-8 items-center justify-center rounded-full bg-taupe/15 active:scale-90"
              accessibilityLabel="Close sheet"
              accessibilityRole="button">
              <X size={16} color={isHighContrast ? '#000000' : '#2D231E'} strokeWidth={2.2} />
            </Pressable>
          </View>

          {/* Scrollable Options List */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            <View className="gap-2.5 pt-1">
              {/* 1. Edit Farm (Top Option) */}
              {isOwner && onEditFarm ? (
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    handleDismiss();
                    setTimeout(() => {
                      onEditFarm();
                    }, 220);
                  }}
                  className={`flex-row items-center justify-between rounded-2xl border border-black/[0.06] bg-champagne/40 active:scale-[0.98] active:bg-champagne/70 ${
                    isGloveMode ? 'p-4' : 'p-3.5'
                  }`}
                  style={
                    isHighContrast
                      ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }>
                  <View className="flex-1 flex-row items-center gap-3.5 pr-2">
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-cognac/15">
                      <Pencil
                        size={19}
                        color={isHighContrast ? '#000000' : '#8C4522'}
                        strokeWidth={2}
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        style={{
                          fontSize: 14 * fontScale,
                          color: isHighContrast ? '#000000' : '#2D231E',
                          fontWeight: isHighContrast ? '900' : '700',
                        }}>
                        Edit Farm
                      </Text>
                      <Text
                        style={{
                          fontSize: 11.5 * fontScale,
                          color: isHighContrast ? '#333333' : '#73655C',
                        }}
                        className="mt-0.5"
                        numberOfLines={1}>
                        Modify name, boundary area & location
                      </Text>
                    </View>
                  </View>
                  <ChevronRight
                    size={18}
                    color={isHighContrast ? '#000000' : '#8C7C70'}
                    strokeWidth={2.2}
                  />
                </Pressable>
              ) : null}

              {/* 2. Team Members (2nd Option) */}
              {onOpenTeam ? (
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    handleDismiss();
                    setTimeout(() => {
                      onOpenTeam();
                    }, 220);
                  }}
                  className={`flex-row items-center justify-between rounded-2xl border border-black/[0.06] bg-champagne/40 active:scale-[0.98] active:bg-champagne/70 ${
                    isGloveMode ? 'p-4' : 'p-3.5'
                  }`}
                  style={
                    isHighContrast
                      ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }>
                  <View className="flex-1 flex-row items-center gap-3.5 pr-2">
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/15">
                      <Users
                        size={19}
                        color={isHighContrast ? '#000000' : '#047857'}
                        strokeWidth={2}
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        style={{
                          fontSize: 14 * fontScale,
                          color: isHighContrast ? '#000000' : '#2D231E',
                          fontWeight: isHighContrast ? '900' : '700',
                        }}>
                        Team Members
                      </Text>
                      <Text
                        style={{
                          fontSize: 11.5 * fontScale,
                          color: isHighContrast ? '#333333' : '#73655C',
                        }}
                        className="mt-0.5"
                        numberOfLines={1}>
                        Manage farm collaborators & member roles
                      </Text>
                    </View>
                  </View>
                  <ChevronRight
                    size={18}
                    color={isHighContrast ? '#000000' : '#8C7C70'}
                    strokeWidth={2.2}
                  />
                </Pressable>
              ) : null}

              {/* 3. Daily Field Logs */}
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  handleDismiss();
                  setTimeout(() => {
                    onOpenDailyLogs();
                  }, 220);
                }}
                className={`flex-row items-center justify-between rounded-2xl border border-black/[0.06] bg-champagne/40 active:scale-[0.98] active:bg-champagne/70 ${
                  isGloveMode ? 'p-4' : 'p-3.5'
                }`}
                style={
                  isHighContrast
                    ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                    : undefined
                }>
                <View className="flex-1 flex-row items-center gap-3.5 pr-2">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-taupe/15">
                    <FileText
                      size={19}
                      color={isHighContrast ? '#000000' : '#8C7C70'}
                      strokeWidth={2}
                    />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text
                        style={{
                          fontSize: 14 * fontScale,
                          color: isHighContrast ? '#000000' : '#2D231E',
                          fontWeight: isHighContrast ? '900' : '700',
                        }}>
                        Daily Field Logs
                      </Text>
                      {dailyReportsCount > 0 ? (
                        <View className="rounded-full bg-cognac/15 px-2 py-0.5">
                          <Text
                            style={{ fontSize: 10 * fontScale }}
                            className="font-bold text-cognac">
                            {dailyReportsCount}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={{
                        fontSize: 11.5 * fontScale,
                        color: isHighContrast ? '#333333' : '#73655C',
                      }}
                      className="mt-0.5"
                      numberOfLines={1}>
                      Review questionnaires & check-in history
                    </Text>
                  </View>
                </View>
                <ChevronRight
                  size={18}
                  color={isHighContrast ? '#000000' : '#8C7C70'}
                  strokeWidth={2.2}
                />
              </Pressable>

              {/* 4. Scan History & Diagnostics */}
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  handleDismiss();
                  setTimeout(() => {
                    onOpenDiagnostics();
                  }, 220);
                }}
                className={`flex-row items-center justify-between rounded-2xl border border-black/[0.06] bg-champagne/40 active:scale-[0.98] active:bg-champagne/70 ${
                  isGloveMode ? 'p-4' : 'p-3.5'
                }`}
                style={
                  isHighContrast
                    ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                    : undefined
                }>
                <View className="flex-1 flex-row items-center gap-3.5 pr-2">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/15">
                    <Activity
                      size={19}
                      color={isHighContrast ? '#000000' : '#047857'}
                      strokeWidth={2}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      style={{
                        fontSize: 14 * fontScale,
                        color: isHighContrast ? '#000000' : '#2D231E',
                        fontWeight: isHighContrast ? '900' : '700',
                      }}>
                      Scan History & Diagnostics
                    </Text>
                    <Text
                      style={{
                        fontSize: 11.5 * fontScale,
                        color: isHighContrast ? '#333333' : '#73655C',
                      }}
                      className="mt-0.5"
                      numberOfLines={1}>
                      Visual plant health detections & pest history
                    </Text>
                  </View>
                </View>
                <ChevronRight
                  size={18}
                  color={isHighContrast ? '#000000' : '#8C7C70'}
                  strokeWidth={2.2}
                />
              </Pressable>

              {/* 5. Farm Activity History */}
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  handleDismiss();
                  setTimeout(() => {
                    onOpenHistory();
                  }, 220);
                }}
                className={`flex-row items-center justify-between rounded-2xl border border-black/[0.06] bg-champagne/40 active:scale-[0.98] active:bg-champagne/70 ${
                  isGloveMode ? 'p-4' : 'p-3.5'
                }`}
                style={
                  isHighContrast
                    ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                    : undefined
                }>
                <View className="flex-1 flex-row items-center gap-3.5 pr-2">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15">
                    <History
                      size={19}
                      color={isHighContrast ? '#000000' : '#2563EB'}
                      strokeWidth={2}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      style={{
                        fontSize: 14 * fontScale,
                        color: isHighContrast ? '#000000' : '#2D231E',
                        fontWeight: isHighContrast ? '900' : '700',
                      }}>
                      Farm Activity History
                    </Text>
                    <Text
                      style={{
                        fontSize: 11.5 * fontScale,
                        color: isHighContrast ? '#333333' : '#73655C',
                      }}
                      className="mt-0.5"
                      numberOfLines={1}>
                      Audit timeline of farm edits, tasks & member actions
                    </Text>
                  </View>
                </View>
                <ChevronRight
                  size={18}
                  color={isHighContrast ? '#000000' : '#8C7C70'}
                  strokeWidth={2.2}
                />
              </Pressable>

              {/* Quick Submit Log Option if available and not reported today */}
              {onOpenNewDailyLog && !hasReportedToday ? (
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    handleDismiss();
                    setTimeout(() => {
                      onOpenNewDailyLog();
                    }, 220);
                  }}
                  className={`mt-1 flex-row items-center justify-center gap-2 rounded-2xl bg-cognac/10 border border-cognac/20 active:scale-[0.98] ${
                    isGloveMode ? 'py-3.5' : 'py-3'
                  }`}
                  style={
                    isHighContrast
                      ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }>
                  <Plus size={16} color={isHighContrast ? '#000000' : '#8C4522'} strokeWidth={2.5} />
                  <Text
                    style={{
                      fontSize: 13 * fontScale,
                      color: isHighContrast ? '#000000' : '#8C4522',
                      fontWeight: '800',
                    }}>
                    Submit Today's Field Log
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
