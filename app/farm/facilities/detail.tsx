import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Building2, Box, Copy } from '../../../components/Icons';
import { Clock } from 'lucide-react-native';
import { BackButton } from '../../../components/common/BackButton';
import { getFarm } from '../../../lib/db-operations';
import {
  CombinedFacility,
  FacilityInventoryItem,
  FacilityTimeLog,
  getFacilityDetail,
  saveFacilityInventory,
  saveFacilitySchedule,
} from '../../../lib/facility-operations';
import { FacilityInventoryView } from './components/FacilityInventoryView';
import { FacilityScheduleView } from './components/FacilityScheduleView';

function formatTimestamp(isoString?: string): string {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function FacilityDetailScreen() {
  const params = useLocalSearchParams<{ farmId: string; facilityId: string }>();
  const farmId = Array.isArray(params.farmId) ? params.farmId[0] : params.farmId;
  const facilityId = Array.isArray(params.facilityId)
    ? params.facilityId[0]
    : params.facilityId;

  const [farm, setFarm] = useState<any | null>(null);
  const [facility, setFacility] = useState<CombinedFacility | null>(null);
  const [loading, setLoading] = useState(true);

  // Tab switching state for dual-purpose facilities (pure conditional rendering)
  const [activeTab, setActiveTab] = useState<'inventory' | 'schedule'>('inventory');

  const loadData = useCallback(async () => {
    if (!farmId || !facilityId) {
      setLoading(false);
      return;
    }
    try {
      const [farmData, facilityData] = await Promise.all([
        getFarm(farmId),
        getFacilityDetail(farmId, facilityId),
      ]);
      setFarm(farmData);
      setFacility(facilityData);

      // Set initial tab based on configured capabilities
      if (facilityData) {
        if (!facilityData.hasInventory && facilityData.hasTime) {
          setActiveTab('schedule');
        } else {
          setActiveTab('inventory');
        }
      }
    } catch (err) {
      console.error('[FacilityDetailScreen] Error loading facility:', err);
    } finally {
      setLoading(false);
    }
  }, [farmId, facilityId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (router.canGoBack()) {
          router.back();
          return true;
        } else {
          router.replace('/(tabs)/farms');
          return true;
        }
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  // ─── Inventory Persistence ───────────────────────────────────
  const handleSaveInventory = async (updatedItems: FacilityInventoryItem[]) => {
    if (!farmId || !facilityId) return;

    const existingRowId = facility?.inventoryRow?.id;

    // Optimistic UI state update
    setFacility((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        hasInventory: true,
        inventoryItemsCount: updatedItems.length,
        totalItemsCount: updatedItems.length + prev.timeLogsCount,
        inventoryRow: {
          id: prev.inventoryRow?.id || '',
          name: prev.inventoryRow?.name || `${prev.name} Inventory`,
          contents: updatedItems,
          rawContents: JSON.stringify(updatedItems, null, 2),
          created_at: prev.inventoryRow?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };
    });

    try {
      const res = await saveFacilityInventory(farmId, facilityId, updatedItems, existingRowId);
      if (res?.rowId) {
        setFacility((prev) => {
          if (!prev || !prev.inventoryRow) return prev;
          return {
            ...prev,
            inventoryRow: {
              ...prev.inventoryRow,
              id: res.rowId!,
            },
          };
        });
      }
    } catch (err) {
      console.error('[FacilityDetailScreen] Failed to save inventory:', err);
      Alert.alert('Save Error', 'Could not save inventory to database.');
    }
  };

  // ─── Schedule Persistence ────────────────────────────────────
  const handleSaveSchedule = async (updatedLogs: FacilityTimeLog[]) => {
    if (!farmId || !facilityId) return;

    const existingRowId = facility?.timeRow?.id;

    // Optimistic UI state update
    setFacility((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        hasTime: true,
        timeLogsCount: updatedLogs.length,
        totalItemsCount: prev.inventoryItemsCount + updatedLogs.length,
        timeRow: {
          id: prev.timeRow?.id || '',
          name: prev.timeRow?.name || `${prev.name} Schedule`,
          contents: updatedLogs,
          rawContents: JSON.stringify(updatedLogs, null, 2),
          created_at: prev.timeRow?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };
    });

    try {
      const res = await saveFacilitySchedule(farmId, facilityId, updatedLogs, existingRowId);
      if (res?.rowId) {
        setFacility((prev) => {
          if (!prev || !prev.timeRow) return prev;
          return {
            ...prev,
            timeRow: {
              ...prev.timeRow,
              id: res.rowId!,
            },
          };
        });
      }
    } catch (err) {
      console.error('[FacilityDetailScreen] Failed to save schedule:', err);
      Alert.alert('Save Error', 'Could not save schedule to database.');
    }
  };

  // ─── JSON Sharing ────────────────────────────────────────────
  const handleShareOrCopy = async (title: string, text: string) => {
    try {
      await Share.share({
        title,
        message: text,
      });
    } catch (err: any) {
      Alert.alert('Share Error', err?.message || 'Could not copy/share content.');
    }
  };

  const handleShareAllJson = () => {
    if (!facility) return;
    const fullPayload: Record<string, any> = {
      facility_id: facility.facility_id,
      name: facility.name,
      category: facility.category,
      farm_id: facility.farm_id,
      farm_layout_id: facility.farm_layout_id,
      hasInventory: facility.hasInventory,
      hasTime: facility.hasTime,
    };
    if (facility.hasInventory && facility.inventoryRow) {
      fullPayload.inventory = {
        name: facility.inventoryRow.name,
        items: facility.inventoryRow.contents,
        updated_at: facility.inventoryRow.updated_at,
      };
    }
    if (facility.hasTime && facility.timeRow) {
      fullPayload.schedule = {
        name: facility.timeRow.name,
        logs: facility.timeRow.contents,
        updated_at: facility.timeRow.updated_at,
      };
    }
    fullPayload.updated_at = facility.updated_at;

    handleShareOrCopy(
      `${facility.name} — Full JSON Export`,
      JSON.stringify(fullPayload, null, 2)
    );
  };

  return (
    <View className="flex-1 bg-champagne">
      {/* ─── Header Bar ─── */}
      <View className="border-b border-taupe/15 bg-white/90 px-5 pb-3 pt-14 shadow-sm shadow-espresso/5">
        <View className="flex-row items-center justify-between">
          <BackButton />

          <View className="flex-1 items-center px-2">
            <Text className="text-base font-black tracking-tight text-espresso" numberOfLines={1}>
              {facility?.name || 'Facility Detail'}
            </Text>
            <Text className="text-xs font-semibold text-taupe" numberOfLines={1}>
              {farm?.farm_name || 'Farm'} · Facility Station
            </Text>
          </View>

          <Pressable
            onPress={handleShareAllJson}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-champagne active:scale-95">
            <Copy size={16} color="#1C120C" />
          </Pressable>
        </View>
      </View>

      {/* ─── Main Content Body ─── */}
      {loading ? (
        <View className="flex-1 items-center justify-center p-8">
          <ActivityIndicator size="large" color="#047857" />
          <Text className="mt-3 text-xs font-bold uppercase tracking-wider text-taupe">
            Loading facility contents...
          </Text>
        </View>
      ) : !facility ? (
        <View className="flex-1 items-center justify-center p-8">
          <View className="h-16 w-16 items-center justify-center rounded-3xl border border-taupe/20 bg-champagne/50">
            <Building2 size={28} color="#8C7C70" />
          </View>
          <Text className="mt-4 text-base font-black text-espresso">Facility Not Found</Text>
          <Text className="mt-1 text-center text-xs text-taupe">
            This facility record does not exist or was removed from the farm layout.
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 rounded-xl bg-cognac px-4 py-2 active:scale-95">
            <Text className="text-xs font-bold text-white">Back to Facilities</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          {/* ─── Facility Overview Hero Card ─── */}
          <View className="mb-5 overflow-hidden rounded-[28px] border border-black/[0.06] bg-white p-4 shadow-sm shadow-espresso/5">
            <View className="flex-row items-center gap-3.5">
              {facility.imageAsset ? (
                <View className="h-16 w-16 overflow-hidden rounded-2xl border border-black/5 bg-champagne/40">
                  <Image source={facility.imageAsset} className="h-full w-full" resizeMode="cover" />
                </View>
              ) : (
                <View className="h-16 w-16 items-center justify-center rounded-2xl border border-emerald-800/15 bg-emerald-50/70">
                  <Building2 size={28} color="#047857" />
                </View>
              )}

              <View className="flex-1">
                <Text className="text-lg font-black text-espresso" numberOfLines={1}>
                  {facility.name}
                </Text>
                <Text className="mt-0.5 text-xs font-bold capitalize text-cognac">
                  {facility.category ? facility.category.replace(/_/g, ' ') : 'General Facility'}
                </Text>
                <Text className="mt-0.5 font-mono text-[10px] text-taupe" numberOfLines={1}>
                  ID: {facility.facility_id}
                </Text>
              </View>
            </View>

            {/* Feature Badges */}
            <View className="mt-3.5 flex-row flex-wrap gap-2 border-t border-black/[0.05] pt-3">
              {facility.hasInventory && (
                <View className="flex-row items-center gap-1.5 rounded-xl border border-emerald-600/20 bg-emerald-50 px-2.5 py-1">
                  <Box size={12} color="#047857" />
                  <Text className="text-xs font-bold text-emerald-800">
                    Inventory ({facility.inventoryItemsCount})
                  </Text>
                </View>
              )}

              {facility.hasTime && (
                <View className="flex-row items-center gap-1.5 rounded-xl border border-cognac/20 bg-cognac/10 px-2.5 py-1">
                  <Clock size={12} color="#8C4522" />
                  <Text className="text-xs font-bold text-cognac">
                    Schedule ({facility.timeLogsCount})
                  </Text>
                </View>
              )}

              {!facility.hasInventory && !facility.hasTime && (
                <View className="rounded-xl bg-taupe/10 px-2.5 py-1">
                  <Text className="text-xs font-bold text-taupe">Layout Facility</Text>
                </View>
              )}
            </View>

            {/* Timestamps */}
            <View className="mt-3 flex-row items-center justify-between border-t border-black/[0.05] pt-2.5">
              <Text className="text-[11px] font-medium text-taupe">
                Updated: {formatTimestamp(facility.updated_at)}
              </Text>
              <Text className="text-[11px] font-medium text-taupe">
                Created: {formatTimestamp(facility.created_at)}
              </Text>
            </View>
          </View>

          {/* ─── Segmented Tab Switcher (Only if both functions configured) ─── */}
          {facility.hasInventory && facility.hasTime && (
            <View className="mb-5 flex-row rounded-2xl border border-black/[0.06] bg-white p-1 shadow-xs">
              <Pressable
                onPress={() => setActiveTab('inventory')}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 active:scale-95 ${
                  activeTab === 'inventory' ? 'bg-emerald-800 shadow-xs' : 'bg-transparent'
                }`}>
                <Box size={14} color={activeTab === 'inventory' ? '#FFFFFF' : '#8C7C70'} />
                <Text
                  className={`text-xs font-black ${
                    activeTab === 'inventory' ? 'text-white' : 'text-taupe'
                  }`}>
                  Supplies ({facility.inventoryItemsCount})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('schedule')}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 active:scale-95 ${
                  activeTab === 'schedule' ? 'bg-cognac shadow-xs' : 'bg-transparent'
                }`}>
                <Clock size={14} color={activeTab === 'schedule' ? '#FFFFFF' : '#8C7C70'} />
                <Text
                  className={`text-xs font-black ${
                    activeTab === 'schedule' ? 'text-white' : 'text-taupe'
                  }`}>
                  Schedule ({facility.timeLogsCount})
                </Text>
              </Pressable>
            </View>
          )}

          {/* ─── Conditional View Rendering (Pure React State, No Dependencies) ─── */}
          {facility.hasInventory && facility.hasTime ? (
            activeTab === 'inventory' ? (
              <FacilityInventoryView
                items={facility.inventoryRow?.contents || []}
                facilityName={facility.name}
                facilityCategory={facility.category}
                onSaveItems={handleSaveInventory}
              />
            ) : (
              <FacilityScheduleView
                logs={facility.timeRow?.contents || []}
                facilityName={facility.name}
                onSaveLogs={handleSaveSchedule}
              />
            )
          ) : facility.hasInventory ? (
            <FacilityInventoryView
              items={facility.inventoryRow?.contents || []}
              facilityName={facility.name}
              facilityCategory={facility.category}
              onSaveItems={handleSaveInventory}
            />
          ) : facility.hasTime ? (
            <FacilityScheduleView
              logs={facility.timeRow?.contents || []}
              facilityName={facility.name}
              onSaveLogs={handleSaveSchedule}
            />
          ) : (
            <View className="items-center justify-center rounded-[28px] border border-black/[0.06] bg-white p-8 shadow-sm shadow-espresso/5">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-taupe/10">
                <Building2 size={24} color="#8C7C70" />
              </View>
              <Text className="mt-3 text-sm font-bold text-espresso">
                Layout Asset
              </Text>
              <Text className="mt-1 text-center text-xs text-taupe">
                This facility exists in the farm layout as a physical building without extra tracking.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
