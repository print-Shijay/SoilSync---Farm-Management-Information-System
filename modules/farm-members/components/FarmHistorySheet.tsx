import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { Modal } from '../../../components/common/AppModal';
import { X, History } from 'lucide-react-native';
import { AuditLogViewer } from './AuditLogViewer';

interface FarmHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  farmId: string;
  farmName?: string;
  isOwner?: boolean;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;

// Apple rubber-band resistance formula (SKILL.md #9)
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function FarmHistorySheet({
  visible,
  onClose,
  farmId,
  farmName,
  isOwner = true,
}: FarmHistorySheetProps) {
  const [modalVisible, setModalVisible] = useState(visible);
  const translateY = useRef(new Animated.Value(visible ? 0 : SHEET_HEIGHT)).current;
  const scrimOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  // Handle open / close transitions with Apple spring physics
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
          duration: 220,
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

  // Direct manipulation PanResponder (SKILL.md #2, #5, #9)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          // 1:1 finger tracking downwards
          translateY.setValue(gestureState.dy);
        } else {
          // Rubber-band resistance upwards past top edge
          const resisted = rubberband(gestureState.dy, SHEET_HEIGHT);
          translateY.setValue(resisted);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // Flick or drag threshold to dismiss
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
          // Snap back to resting position with smooth spring
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
      visible={modalVisible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}>
      <View className="flex-1 justify-end">
        {/* Dimming Backdrop Scrim */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: 'rgba(28, 18, 12, 0.45)',
              opacity: scrimOpacity,
            },
          ]}>
          <Pressable className="flex-1" onPress={handleDismiss} />
        </Animated.View>

        {/* Floating Apple Bottom Sheet */}
        <Animated.View
          style={{
            height: SHEET_HEIGHT,
            transform: [{ translateY }],
          }}
          className="rounded-t-[36px] border-t border-white/90 bg-champagne shadow-2xl overflow-hidden">
          {/* Gesture Drag Bar & Header Container */}
          <View {...panResponder.panHandlers} className="bg-champagne pt-3 pb-2.5 px-6 border-b border-black/5">
            {/* Grab Handle */}
            <View className="items-center pb-2.5">
              <View className="h-1.5 w-10 rounded-full bg-taupe/35" />
            </View>

            {/* Header Content */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2 flex-1">
                <View className="h-8 w-8 items-center justify-center rounded-xl bg-cognac/10 border border-cognac/20">
                  <History size={17} color="#8C4522" />
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-black tracking-tight text-espresso">
                    Farm History
                  </Text>
                  {farmName ? (
                    <Text className="text-[11px] font-bold uppercase tracking-[0.16em] text-cognac" numberOfLines={1}>
                      {farmName}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Close Button */}
              <Pressable
                onPress={handleDismiss}
                hitSlop={12}
                className="h-8 w-8 items-center justify-center rounded-full bg-taupe/15 active:scale-95">
                <X size={16} color="#1C120C" />
              </Pressable>
            </View>
          </View>

          {/* Audit Log Content Stream */}
          <View className="flex-1 pb-5">
            <AuditLogViewer farmId={farmId} isOwner={isOwner} showHeader={false} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
