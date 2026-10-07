import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  StyleSheet,
  BackHandler,
  Platform,
  Animated,
} from 'react-native';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Trash2,
} from 'lucide-react-native';

export type MessagePopupType = 'success' | 'error' | 'warning' | 'info';

export interface MessagePopupButton {
  text?: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface MessagePopupProps {
  visible: boolean;
  title?: string;
  message?: string;
  type?: MessagePopupType;
  buttons?: MessagePopupButton[];
  onClose?: () => void;
  cancelable?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MAX_WIDTH = Math.min(SCREEN_WIDTH - 48, 380);

export function MessagePopup({
  visible,
  title,
  message,
  type = 'info',
  buttons,
  onClose,
  cancelable = false,
}: MessagePopupProps) {
  const animOpacity = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) {
      animOpacity.setValue(0);
      animScale.setValue(0.96);
      Animated.parallel([
        Animated.timing(animOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(animScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, animOpacity, animScale]);

  // Android hardware back button handler
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;

    const onBackPress = () => {
      if (cancelable) {
        onClose?.();
      }
      return true; // Prevents back navigation from firing behind the open popup
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [visible, cancelable, onClose]);

  if (!visible) return null;

  const normalizedButtons: MessagePopupButton[] =
    buttons && buttons.length > 0
      ? buttons
      : [{ text: 'OK', style: 'default' }];

  const handleButtonPress = (btn: MessagePopupButton) => {
    onClose?.();
    if (btn.onPress) {
      try {
        btn.onPress();
      } catch (err) {
        console.warn('[MessagePopup] Error executing button action:', err);
      }
    }
  };

  const handleBackdropPress = () => {
    if (cancelable) {
      onClose?.();
    }
  };

  const getStatusConfig = () => {
    const isDestructiveAction = normalizedButtons.some((b) => b.style === 'destructive');

    switch (type) {
      case 'success':
        return {
          icon: <CheckCircle2 size={32} color="#059669" strokeWidth={2.4} />,
          badgeBg: 'rgba(5, 150, 105, 0.1)',
          badgeBorder: 'rgba(5, 150, 105, 0.25)',
          accentColor: '#059669',
        };
      case 'error':
        return {
          icon: <AlertCircle size={32} color="#DC2626" strokeWidth={2.4} />,
          badgeBg: 'rgba(220, 38, 38, 0.1)',
          badgeBorder: 'rgba(220, 38, 38, 0.25)',
          accentColor: '#DC2626',
        };
      case 'warning':
        return {
          icon: isDestructiveAction ? (
            <Trash2 size={30} color="#DC2626" strokeWidth={2.2} />
          ) : (
            <AlertTriangle size={30} color="#D99C2B" strokeWidth={2.4} />
          ),
          badgeBg: isDestructiveAction ? 'rgba(220, 38, 38, 0.1)' : 'rgba(217, 156, 43, 0.1)',
          badgeBorder: isDestructiveAction ? 'rgba(220, 38, 38, 0.25)' : 'rgba(217, 156, 43, 0.25)',
          accentColor: isDestructiveAction ? '#DC2626' : '#D99C2B',
        };
      case 'info':
      default:
        return {
          icon: <Info size={30} color="#8C4522" strokeWidth={2.4} />,
          badgeBg: 'rgba(140, 69, 34, 0.1)',
          badgeBorder: 'rgba(140, 69, 34, 0.25)',
          accentColor: '#8C4522',
        };
    }
  };

  const status = getStatusConfig();
  const isTwoButtons = normalizedButtons.length === 2;
  const shouldStackButtons =
    normalizedButtons.length > 2 ||
    (isTwoButtons && normalizedButtons.some((b) => (b.text?.length || 0) > 13));

  return (
    <View
      pointerEvents="box-none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          zIndex: 99999,
          elevation: Platform.OS === 'android' ? 999 : undefined,
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}
    >
      {/* Animated Scrim / Backdrop */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: 'rgba(28, 18, 12, 0.65)',
            opacity: animOpacity,
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFillObject}
          onPress={handleBackdropPress}
        />
      </Animated.View>

      {/* Modal Card */}
      <Animated.View
        style={[
          {
            width: CARD_MAX_WIDTH,
            backgroundColor: '#FBF8F4',
            borderRadius: 24,
            padding: 24,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(140, 124, 112, 0.2)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 1000,
            zIndex: 100000,
            opacity: animOpacity,
            transform: [{ scale: animScale }],
          },
        ]}
      >
        {/* Status Icon Badge */}
        <View
          style={{
            height: 64,
            width: 64,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 16,
            borderWidth: 1,
            backgroundColor: status.badgeBg,
            borderColor: status.badgeBorder,
            marginBottom: 12,
          }}
        >
          {status.icon}
        </View>

        {/* Title */}
        {Boolean(title) && (
          <Text
            style={{
              textAlign: 'center',
              fontSize: 18,
              fontWeight: '900',
              color: '#1C120C',
              letterSpacing: -0.3,
              marginBottom: 8,
            }}
            numberOfLines={2}
          >
            {title}
          </Text>
        )}

        {/* Message Content */}
        {Boolean(message) && (
          <ScrollView
            style={{ maxHeight: 192, width: '100%', marginBottom: 20 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center' }}
          >
            <Text
              style={{
                textAlign: 'center',
                fontSize: 14,
                fontWeight: '500',
                color: '#8C7C70',
                lineHeight: 20,
              }}
            >
              {message}
            </Text>
          </ScrollView>
        )}

        {!message && <View style={{ marginBottom: 16 }} />}

        {/* Action Buttons */}
        <View style={{ width: '100%' }}>
          {isTwoButtons && !shouldStackButtons ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {normalizedButtons.map((btn, index) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';

                return (
                  <TouchableOpacity
                    key={`btn-${index}`}
                    activeOpacity={0.7}
                    onPress={() => handleButtonPress(btn)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 14,
                      borderRadius: 16,
                      marginLeft: index > 0 ? 12 : 0,
                      backgroundColor: isCancel
                        ? '#FFFFFF'
                        : isDestructive
                        ? '#DC2626'
                        : '#8C4522',
                      borderWidth: isCancel ? 1 : 0,
                      borderColor: 'rgba(140, 124, 112, 0.3)',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: isCancel ? '#1C120C' : '#FFFFFF',
                      }}
                      numberOfLines={1}
                    >
                      {btn.text || (isCancel ? 'Cancel' : 'OK')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={{ width: '100%' }}>
              {normalizedButtons.map((btn, index) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';

                return (
                  <TouchableOpacity
                    key={`btn-${index}`}
                    activeOpacity={0.7}
                    onPress={() => handleButtonPress(btn)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 14,
                      borderRadius: 16,
                      marginTop: index > 0 ? 10 : 0,
                      backgroundColor: isCancel
                        ? '#FFFFFF'
                        : isDestructive
                        ? '#DC2626'
                        : '#8C4522',
                      borderWidth: isCancel ? 1 : 0,
                      borderColor: 'rgba(140, 124, 112, 0.3)',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: isCancel ? '#1C120C' : '#FFFFFF',
                      }}
                    >
                      {btn.text || (isCancel ? 'Cancel' : 'OK')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

export default MessagePopup;
