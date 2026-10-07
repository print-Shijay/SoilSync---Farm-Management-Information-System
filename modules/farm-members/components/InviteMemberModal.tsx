import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Animated,
  StyleSheet,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../../../components/common/AppModal';
import { X, Mail, ShieldCheck, Check, UserPlus } from 'lucide-react-native';
import { useFarmMembers } from '../hooks/useFarmMembers';
import { useNetworkStatus } from '../../../lib/hooks/useNetworkStatus';

interface InviteMemberModalProps {
  visible: boolean;
  onClose: () => void;
  farmId: string;
}

export function InviteMemberModal({ visible, onClose, farmId }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member'>('member');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { inviteMember } = useFarmMembers(farmId);
  const { isOnline } = useNetworkStatus();

  const [modalVisible, setModalVisible] = useState(visible);
  const translateY = useRef(new Animated.Value(visible ? 0 : 450)).current;
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
          toValue: 450,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scrimOpacity, {
          toValue: 0,
          duration: 180,
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
        toValue: 450,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(scrimOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const handleInvite = async () => {
    if (!isOnline) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    const result = await inviteMember(cleanEmail, role);
    setIsSubmitting(false);

    if (result.success) {
      setEmail('');
      handleDismiss();
      setTimeout(() => {
        Alert.alert('Invitation Sent', `An invitation has been sent to ${cleanEmail}.`);
      }, 350);
    } else {
      Alert.alert('Invitation Failed', result.error || 'Failed to send invitation. Please try again.');
    }
  };

  if (!modalVisible) return null;

  return (
    <Modal
      transparent
      visible={modalVisible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

          {/* Floating Apple Form Sheet */}
          <Animated.View
            style={{
              transform: [{ translateY }],
            }}
            className="rounded-t-[36px] border-t border-white/90 bg-champagne px-6 pt-3 pb-9 shadow-2xl">
            {/* Grab Handle */}
            <View className="items-center pb-2.5">
              <View className="h-1.5 w-10 rounded-full bg-taupe/35" />
            </View>

            {/* Header */}
            <View className="mb-5 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <View className="h-8 w-8 items-center justify-center rounded-xl border border-cognac/20 bg-cognac/10">
                  <UserPlus size={17} color="#8C4522" />
                </View>
                <Text className="text-xl font-black tracking-tight text-espresso">
                  Invite Member
                </Text>
              </View>

              <Pressable
                onPress={handleDismiss}
                hitSlop={10}
                className="h-8 w-8 items-center justify-center rounded-full bg-taupe/15 active:scale-95">
                <X size={16} color="#1C120C" />
              </Pressable>
            </View>

            {!isOnline && (
              <Text className="mb-4 text-sm text-amber-800">
                Connect to the internet to send a farm invitation.
              </Text>
            )}

            {/* Email Field */}
            <View className="mb-4">
              <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-taupe">
                Colleague Email Address
              </Text>
              <View className="flex-row items-center rounded-2xl border border-black/10 bg-white px-4 py-3.5 shadow-sm shadow-espresso/5">
                <Mail size={18} color="#8C7C70" className="mr-2.5" />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="colleague@example.com"
                  placeholderTextColor="#8C7C70"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={255}
                  className="flex-1 text-base font-medium text-espresso"
                />
                {email.length > 0 && (
                  <Pressable onPress={() => setEmail('')} className="p-1">
                    <X size={14} color="#8C7C70" />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Role Field */}
            <View className="mb-6">
              <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-taupe">
                Farm Role & Permissions
              </Text>
              <View className="flex-row rounded-2xl border border-black/10 bg-white p-1.5 shadow-sm shadow-espresso/5">
                <Pressable
                  onPress={() => setRole('member')}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-cognac/10 border border-cognac/30 py-2.5 active:scale-98">
                  <ShieldCheck size={16} color="#8C4522" />
                  <Text className="text-sm font-bold text-cognac">Farm Member</Text>
                  <Check size={14} color="#8C4522" />
                </Pressable>
              </View>
              <Text className="mt-2 text-xs leading-4 text-taupe">
                Members can collaborate in real-time on farm layouts, task completion, crop plans, and sensor diagnostics.
              </Text>
            </View>

            {/* Submit Button */}
            <Pressable
              onPress={handleInvite}
              disabled={isSubmitting || !isOnline}
              className={`flex-row items-center justify-center gap-2 rounded-2xl py-4 shadow-md shadow-cognac/30 active:scale-95 ${
                isSubmitting || !isOnline ? 'bg-taupe/40' : 'bg-cognac'
              }`}>
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <UserPlus size={18} color="white" />
                  <Text className="text-base font-bold text-white">Send Invitation</Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
