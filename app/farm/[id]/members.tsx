import React, { useEffect, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MemberList } from '../../../modules/farm-members/components/MemberList';
import { getFarm } from '../../../lib/db-operations';
import { useAuth } from '../../../lib/AuthContext';
import { Users } from 'lucide-react-native';
import { BackButton } from '../../../components/common/BackButton';

export default function FarmMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [isOwner, setIsOwner] = useState(false);
  const [farmName, setFarmName] = useState<string>('');

  useEffect(() => {
    async function checkOwnerAndFarm() {
      if (!session?.user?.id || !id) return;
      try {
        const farm = await getFarm(id);
        if (farm) {
          setIsOwner(farm.user_id?.toLowerCase() === session.user.id?.toLowerCase());
          setFarmName(farm.farm_name || '');
        } else {
          setIsOwner(true);
        }
      } catch (e) {
        setIsOwner(true);
      }
    }
    checkOwnerAndFarm();
  }, [id, session]);

  if (!id) return null;

  return (
    <SafeAreaView className="flex-1 bg-champagne" edges={['top', 'left', 'right']}>
      {/* Apple-style Navigation Header */}
      <View className="flex-row items-center justify-between border-b border-black/5 bg-champagne px-5 py-3.5">
        <View className="flex-row items-center gap-3 flex-1">
          <BackButton />

          <View className="flex-1">
            <Text className="text-xl font-black tracking-tight text-espresso" numberOfLines={1}>
              Team Members
            </Text>
            {farmName ? (
              <Text className="text-[11px] font-bold uppercase tracking-[0.16em] text-cognac" numberOfLines={1}>
                {farmName}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="h-9 w-9 items-center justify-center rounded-xl bg-cognac/10 border border-cognac/20">
          <Users size={18} color="#8C4522" />
        </View>
      </View>

      <MemberList farmId={id} isOwner={isOwner} />
    </SafeAreaView>
  );
}
