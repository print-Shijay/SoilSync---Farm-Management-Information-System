import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { Modal } from '../../../components/common/AppModal';
import { X, Check, XCircle, Users, Mail } from 'lucide-react-native';
import { usePendingInvites, PendingInvite } from '../../../lib/hooks/usePendingInvites';

interface PendingInvitesModalProps {
  visible: boolean;
  onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.72;

export function PendingInvitesModal({ visible, onClose }: PendingInvitesModalProps) {
  const { invites, loading, respondToInvite } = usePendingInvites();
  const [processingId, setProcessingId] = React.useState<string | null>(null);

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

  const handleRespond = async (invite: PendingInvite, status: 'accepted' | 'declined') => {
    setProcessingId(invite.id);
    try {
      await respondToInvite(invite.id, status);
      const isLast = invites.length <= 1;
      if (isLast) {
        handleDismiss();
        setTimeout(() => {
          Alert.alert(
            'Success',
            status === 'accepted'
              ? 'You have successfully joined the farm workspace!'
              : 'You have declined the farm invitation.'
          );
        }, 350);
      } else {
        Alert.alert(
          'Success',
          status === 'accepted'
            ? 'You have successfully joined the farm workspace!'
            : 'You have declined the farm invitation.'
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An error occurred.');
    } finally {
      setProcessingId(null);
    }
  };

  const renderInvite = ({ item }: { item: PendingInvite }) => {
    const ownerName = item.owner_first_name
      ? `${item.owner_first_name} ${item.owner_last_name || ''}`.trim()
      : item.owner_email || 'Farm Owner';

    const farmName = item.farm_name || 'Farm Invitation';
    const date = new Date(item.created_at);

    return (
      <View className="mb-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm shadow-espresso/5">
        <View className="mb-3 flex-row items-center">
          <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl border border-cognac/20 bg-cognac/10">
            <Users size={18} color="#8C4522" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-espresso" numberOfLines={1}>
              {farmName}
            </Text>
            <Text className="text-xs text-taupe mt-0.5">
              Invited by <Text className="font-semibold text-cognac">{ownerName}</Text>
            </Text>
          </View>
        </View>

        <Text className="mb-3.5 text-[11px] font-medium text-taupe">
          Received: {date.toLocaleDateString()}
        </Text>

        <View className="flex-row gap-2.5">
          <Pressable
            onPress={() => handleRespond(item, 'declined')}
            disabled={processingId !== null}
            hitSlop={4}
            className="flex-1 flex-row items-center justify-center rounded-xl border border-black/10 bg-white py-3 active:scale-95">
            {processingId === item.id ? (
              <ActivityIndicator color="#8C7C70" size="small" />
            ) : (
              <>
                <X size={15} color="#E11D48" className="mr-1.5" />
                <Text className="text-xs font-bold text-rose-600">Decline</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => handleRespond(item, 'accepted')}
            disabled={processingId !== null}
            hitSlop={4}
            className="flex-1 flex-row items-center justify-center rounded-xl bg-cognac py-3 shadow-sm shadow-cognac/30 active:scale-95">
            {processingId === item.id ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Check size={15} color="#ffffff" className="mr-1.5" />
                <Text className="text-xs font-bold text-white">Accept & Join</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  if (!modalVisible) return null;

  return (
    <Modal
      transparent
      visible={modalVisible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}>
      <View className="flex-1 justify-end">
        {/* Backdrop Scrim */}
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

        {/* Sheet Content */}
        <Animated.View
          style={{
            height: SHEET_HEIGHT,
            transform: [{ translateY }],
          }}
          className="rounded-t-[36px] border-t border-white/90 bg-champagne px-6 pt-3 pb-8 shadow-2xl">
          {/* Grab Handle */}
          <View className="items-center pb-2.5">
            <View className="h-1.5 w-10 rounded-full bg-taupe/35" />
          </View>

          {/* Header */}
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-8 w-8 items-center justify-center rounded-xl border border-cognac/20 bg-cognac/10">
                <Mail size={17} color="#8C4522" />
              </View>
              <Text className="text-xl font-black tracking-tight text-espresso">
                Pending Invitations
              </Text>
            </View>

            <Pressable
              onPress={handleDismiss}
              hitSlop={10}
              className="h-8 w-8 items-center justify-center rounded-full bg-taupe/15 active:scale-95">
              <X size={16} color="#1C120C" />
            </Pressable>
          </View>

          {loading && invites.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#8C4522" />
            </View>
          ) : (
            <FlatList
              data={invites}
              keyExtractor={(item) => item.id}
              renderItem={renderInvite}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 30 }}
              ListEmptyComponent={
                <View className="mt-8 items-center justify-center rounded-3xl border border-dashed border-taupe/30 bg-white/70 p-8 shadow-sm">
                  <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-cognac/10">
                    <Users size={24} color="#8C4522" />
                  </View>
                  <Text className="text-base font-bold text-espresso">No Pending Invitations</Text>
                  <Text className="mt-1 text-center text-xs leading-5 text-taupe">
                    When farm owners invite you to collaborate on their farm layouts or tasks, invitations will appear here.
                  </Text>
                </View>
              }
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
