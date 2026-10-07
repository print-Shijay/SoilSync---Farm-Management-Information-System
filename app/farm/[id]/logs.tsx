import React, { useEffect, useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { AuditLogViewer } from '../../../modules/farm-members/components/AuditLogViewer';
import { History } from 'lucide-react-native';
import { BackButton } from '../../../components/common/BackButton';
import { useAuth } from '../../../lib/AuthContext';
import { getFarm } from '../../../lib/db-operations';

export default function AuditLogsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [farmName, setFarmName] = useState<string>('');
  const [isOwner, setIsOwner] = useState(false);

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
              Farm History
            </Text>
            {farmName ? (
              <Text className="text-[11px] font-bold uppercase tracking-[0.16em] text-cognac" numberOfLines={1}>
                {farmName}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="h-9 w-9 items-center justify-center rounded-xl bg-cognac/10 border border-cognac/20">
          <History size={18} color="#8C4522" />
        </View>
      </View>

      {/* Main Stream */}
      <AuditLogViewer farmId={id} isOwner={isOwner} showHeader={false} />
    </SafeAreaView>
  );
}
