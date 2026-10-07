import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  BackHandler,
  Platform,
  useWindowDimensions,
  Animated,
  Easing,
} from 'react-native';

export interface ModalPortalItem {
  id: string;
  visible: boolean;
  children: React.ReactNode;
  animationType?: 'none' | 'slide' | 'fade';
  transparent?: boolean;
  onRequestClose?: (event?: any) => void;
  onShow?: (event?: any) => void;
  onDismiss?: () => void;
  zIndex?: number;
}

type ModalListener = (items: ModalPortalItem[]) => void;

let activeModals: ModalPortalItem[] = [];
let listeners: ModalListener[] = [];

function notify() {
  const shallowCopy = [...activeModals];
  listeners.forEach((listener) => {
    try {
      listener(shallowCopy);
    } catch (e) {
      console.warn('[ModalPortal] Listener error:', e);
    }
  });
}

export const ModalPortal = {
  upsertModal(item: ModalPortalItem) {
    const index = activeModals.findIndex((m) => m.id === item.id);
    if (index >= 0) {
      activeModals[index] = item;
      notify();
    } else if (item.visible) {
      activeModals.push(item);
      notify();
    }
  },

  removeModal(id: string) {
    const initialLen = activeModals.length;
    activeModals = activeModals.filter((m) => m.id !== id);
    if (activeModals.length !== initialLen) {
      notify();
    }
  },

  subscribe(listener: ModalListener) {
    listeners.push(listener);
    listener([...activeModals]);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },

  getActiveCount() {
    return activeModals.length;
  },
};

interface AnimatedModalWrapperProps {
  item: ModalPortalItem;
  onExited: (id: string) => void;
}

function AnimatedModalWrapper({ item, onExited }: AnimatedModalWrapperProps) {
  const { height: screenHeight } = useWindowDimensions();
  const animValue = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);
  const onShowCalledRef = useRef(false);

  const animationType = item.animationType || 'none';

  // Run enter animation
  useEffect(() => {
    if (item.visible) {
      isClosingRef.current = false;
      animValue.stopAnimation();

      if (animationType === 'none') {
        animValue.setValue(1);
        if (!onShowCalledRef.current) {
          onShowCalledRef.current = true;
          item.onShow?.();
        }
      } else {
        Animated.timing(animValue, {
          toValue: 1,
          duration: animationType === 'slide' ? 140 : 100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && !onShowCalledRef.current) {
            onShowCalledRef.current = true;
            item.onShow?.();
          }
        });
      }
    }
  }, [item.visible, animationType]);

  // Instant clean exit when visible becomes false:
  // Preserves smooth enter animation while eliminating any race conditions or lingering white boxes on close
  const runExit = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      item.onDismiss?.();
      onExited(item.id);
    };

    if (animationType === 'none') {
      animValue.setValue(0);
      cleanup();
    } else {
      const duration = animationType === 'slide' ? 100 : 80;
      Animated.timing(animValue, {
        toValue: 0,
        duration,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        cleanup();
      });

      // Safety timeout: guaranteed unmount even if animation callback is interrupted
      setTimeout(cleanup, duration + 30);
    }
  }, [animationType, item, onExited, animValue]);

  useEffect(() => {
    if (!item.visible) {
      runExit();
    }
  }, [item.visible, runExit]);

  // Compute animated style
  const getAnimatedStyle = () => {
    if (animationType === 'slide') {
      return {
        transform: [
          {
            translateY: animValue.interpolate({
              inputRange: [0, 1],
              outputRange: [screenHeight + 400, 0],
            }),
          },
        ],
      };
    }
    if (animationType === 'fade') {
      return {
        opacity: animValue,
      };
    }
    return {};
  };

  return (
    <Animated.View
      pointerEvents={item.visible ? 'box-none' : 'none'}
      style={[
        StyleSheet.absoluteFillObject,
        item.transparent === false ? { backgroundColor: '#FFFFFF' } : undefined,
        getAnimatedStyle(),
      ]}
    >
      {item.visible ? item.children : null}
    </Animated.View>
  );
}

export function ModalPortalHost() {
  const [modals, setModals] = useState<ModalPortalItem[]>([]);

  useEffect(() => {
    return ModalPortal.subscribe((updated) => {
      setModals(updated);
    });
  }, []);

  const handleExited = useCallback((id: string) => {
    ModalPortal.removeModal(id);
  }, []);

  // Hardware back press handling on Android
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (modals.length === 0) return;

    const onBackPress = () => {
      // Find the topmost visible modal that handles onRequestClose
      for (let i = modals.length - 1; i >= 0; i--) {
        const modal = modals[i];
        if (modal && modal.visible && modal.onRequestClose) {
          modal.onRequestClose();
          return true; // Consumes event, stops back navigation of the screen
        }
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [modals]);

  const hasVisibleModal = modals.some((m) => m.visible);

  if (modals.length === 0) {
    return null;
  }

  return (
    <View
      pointerEvents={hasVisibleModal ? 'box-none' : 'none'}
      style={[
        StyleSheet.absoluteFillObject,
        {
          zIndex: 1000,
          elevation: Platform.OS === 'android' ? 10 : undefined,
        },
      ]}
    >
      {modals.map((modal, index) => (
        <View
          key={modal.id}
          pointerEvents={modal.visible ? 'box-none' : 'none'}
          style={[
            StyleSheet.absoluteFillObject,
            {
              zIndex: 1000 + index,
              elevation: Platform.OS === 'android' ? 10 + index : undefined,
            },
          ]}
        >
          <AnimatedModalWrapper item={modal} onExited={handleExited} />
        </View>
      ))}
    </View>
  );
}

export default ModalPortal;
