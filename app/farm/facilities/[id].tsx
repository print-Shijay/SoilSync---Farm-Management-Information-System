import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  BackHandler,
} from 'react-native';
import { Modal } from '../../../components/common/AppModal';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Building2, Box, Check, ChevronRight } from '../../../components/Icons';
import {
  Calendar,
  Clock,
  Layers,
  RotateCcw,
  Search,
  X,
  Sparkles,
} from 'lucide-react-native';
import { BackButton } from '../../../components/common/BackButton';
import { useAuth } from '../../../lib/AuthContext';
import { getFarm, getFarmsByUser } from '../../../lib/db-operations';
import {
  getFarmEstateLayout,
  type FarmEstateRecord,
} from '../../../lib/estate-operations';
import {
  CombinedFacility,
  getCombinedFarmFacilities,
  getEstateFacilities,
  getAllUserCombinedFacilities,
} from '../../../lib/facility-operations';

type FilterTab = 'all' | 'inventory' | 'schedule' | 'both';
type SortOption = 'name_asc' | 'name_desc' | 'updated_desc' | 'items_desc';

function formatTimestamp(isoString?: string): string {
  if (!isoString) return 'Recently';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) {
    const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${mins}m ago`;
  }
  if (diffHours < 24 && now.getDate() === date.getDate()) {
    return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  if (diffDays === 1) {
    return `Yesterday`;
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FarmFacilitiesScreen() {
  const params = useLocalSearchParams<{ id?: string; fromEstate?: string }>();
  const routeFarmId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();

  const [userFarms, setUserFarms] = useState<any[]>([]);
  const [estateRecord, setEstateRecord] = useState<FarmEstateRecord | null>(null);
  const [selectedScope, setSelectedScope] = useState<string>('all');
  const [farm, setFarm] = useState<any | null>(null);
  const [facilities, setFacilities] = useState<CombinedFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search, Filter & Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [sortOption, setSortOption] = useState<SortOption>('name_asc');
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);

  // Initialize selectedScope from route params
  useEffect(() => {
    if (params.fromEstate === 'true' || routeFarmId === 'estate') {
      setSelectedScope('estate');
    } else if (routeFarmId && routeFarmId !== 'all') {
      setSelectedScope(routeFarmId);
    } else {
      setSelectedScope('all');
    }
  }, [routeFarmId, params.fromEstate]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isSortModalVisible) {
          setIsSortModalVisible(false);
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [isSortModalVisible])
  );

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [fetchedFarms, fetchedEstate] = await Promise.all([
        getFarmsByUser(user.id),
        getFarmEstateLayout(user.id),
      ]);
      setUserFarms(fetchedFarms);
      setEstateRecord(fetchedEstate);

      let facData: CombinedFacility[] = [];

      if (selectedScope === 'all') {
        facData = await getAllUserCombinedFacilities(user.id);
        setFarm(null);
      } else if (selectedScope === 'estate') {
        const estateId = fetchedEstate?.id || routeFarmId || '';
        facData = await getEstateFacilities(estateId);
        setFarm(null);
      } else {
        const [farmData, farmFacs] = await Promise.all([
          getFarm(selectedScope),
          getCombinedFarmFacilities(selectedScope),
        ]);
        setFarm(farmData);
        facData = farmFacs;
      }

      setFacilities(facData);
    } catch (err) {
      console.error('[FarmFacilitiesScreen] Error loading facilities:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, selectedScope, routeFarmId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Counts for filter chips
  const counts = useMemo(() => {
    return {
      all: facilities.length,
      inventory: facilities.filter((f) => f.hasInventory).length,
      schedule: facilities.filter((f) => f.hasTime).length,
      both: facilities.filter((f) => f.hasInventory && f.hasTime).length,
    };
  }, [facilities]);

  // Filtered & Sorted Facilities
  const filteredAndSortedFacilities = useMemo(() => {
    let list = [...facilities];

    // 1. Filter by Tab
    if (activeFilter === 'inventory') {
      list = list.filter((f) => f.hasInventory);
    } else if (activeFilter === 'schedule') {
      list = list.filter((f) => f.hasTime);
    } else if (activeFilter === 'both') {
      list = list.filter((f) => f.hasInventory && f.hasTime);
    }

    // 2. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((f) => {
        if (f.name.toLowerCase().includes(q)) return true;
        if (f.category && f.category.toLowerCase().includes(q)) return true;

        // Search within inventory item names
        if (f.inventoryRow?.contents?.some((item) => item.name?.toLowerCase().includes(q))) {
          return true;
        }

        // Search within time log activity names or notes
        if (
          f.timeRow?.contents?.some(
            (log) =>
              log.activity?.toLowerCase().includes(q) ||
              log.staffName?.toLowerCase().includes(q) ||
              log.notes?.toLowerCase().includes(q)
          )
        ) {
          return true;
        }

        return false;
      });
    }

    // 3. Sort
    list.sort((a, b) => {
      switch (sortOption) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'updated_desc':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case 'items_desc':
          return b.totalItemsCount - a.totalItemsCount;
        default:
          return 0;
      }
    });

    return list;
  }, [facilities, activeFilter, searchQuery, sortOption]);

  const getSortLabel = (opt: SortOption) => {
    switch (opt) {
      case 'name_asc':
        return 'Name (A to Z)';
      case 'name_desc':
        return 'Name (Z to A)';
      case 'updated_desc':
        return 'Recently Updated';
      case 'items_desc':
        return 'Most Items / Logs';
    }
  };

  const currentScopeTitle = useMemo(() => {
    if (selectedScope === 'all') return 'All Farms & Estate';
    if (selectedScope === 'estate') return estateRecord?.estate_name || 'Farm Estate';
    const foundFarm = userFarms.find((f) => f.id === selectedScope);
    return foundFarm?.farm_name || farm?.farm_name || 'Farm';
  }, [selectedScope, estateRecord, userFarms, farm]);

  const renderFacilityCard = ({ item }: { item: CombinedFacility }) => {
    const targetFarmId =
      item.estate_layout_id ||
      item.farm_id ||
      (selectedScope === 'estate' ? (estateRecord?.id || routeFarmId) : selectedScope);

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/farm/facilities/detail',
            params: {
              farmId: targetFarmId,
              facilityId: item.facility_id,
            },
          })
        }
        className="mb-3.5 overflow-hidden rounded-[28px] border border-black/[0.06] bg-white p-4 shadow-sm shadow-espresso/5 active:scale-[0.99] active:bg-champagne/20">
        <View className="flex-row items-start gap-3.5">
          {/* Facility 3D Illustration or Icon Chip */}
          {item.imageAsset ? (
            <View className="h-14 w-14 overflow-hidden rounded-2xl border border-black/5 bg-champagne/40">
              <Image source={item.imageAsset} className="h-full w-full" resizeMode="cover" />
            </View>
          ) : (
            <View className="h-14 w-14 items-center justify-center rounded-2xl border border-emerald-800/15 bg-emerald-50/70">
              <Building2 size={24} color="#047857" />
            </View>
          )}

          {/* Facility Titles & Meta */}
          <View className="flex-1 pr-1">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-black text-espresso" numberOfLines={1}>
                {item.name}
              </Text>
              <ChevronRight size={18} color="#8C7C70" />
            </View>

            <View className="flex-row items-center gap-1.5 mt-0.5">
              <Text className="text-xs font-semibold capitalize text-taupe">
                {item.category ? item.category.replace(/_/g, ' ') : 'Farm Facility'}
              </Text>
              {item.farmName ? (
                <>
                  <Text className="text-xs text-taupe/40">•</Text>
                  <Text className="text-xs font-bold text-cognac" numberOfLines={1}>
                    {item.farmName}
                  </Text>
                </>
              ) : null}
            </View>

            {/* Badges Row */}
            <View className="mt-2.5 flex-row flex-wrap items-center gap-1.5">
              {item.farmName && (
                <View className="rounded-lg bg-black/5 px-2 py-0.5 border border-black/5">
                  <Text className="text-[10px] font-bold text-espresso">{item.farmName}</Text>
                </View>
              )}
              {item.hasInventory && item.hasTime ? (
                <>
                  <View className="flex-row items-center gap-1 rounded-lg border border-emerald-600/20 bg-emerald-50 px-2 py-0.5">
                    <Box size={11} color="#047857" />
                    <Text className="text-[10px] font-bold text-emerald-800">Inventory</Text>
                  </View>
                  <View className="flex-row items-center gap-1 rounded-lg border border-cognac/20 bg-cognac/10 px-2 py-0.5">
                    <Clock size={11} color="#8C4522" />
                    <Text className="text-[10px] font-bold text-cognac">Schedule</Text>
                  </View>
                </>
              ) : item.hasInventory ? (
                <View className="flex-row items-center gap-1 rounded-lg border border-emerald-600/20 bg-emerald-50 px-2 py-0.5">
                  <Box size={11} color="#047857" />
                  <Text className="text-[10px] font-bold text-emerald-800">Inventory</Text>
                </View>
              ) : item.hasTime ? (
                <View className="flex-row items-center gap-1 rounded-lg border border-cognac/20 bg-cognac/10 px-2 py-0.5">
                  <Clock size={11} color="#8C4522" />
                  <Text className="text-[10px] font-bold text-cognac">Schedule</Text>
                </View>
              ) : (
                <View className="rounded-lg bg-taupe/15 px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-taupe">Facility</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Card Footer Summary Stats */}
        <View className="mt-3.5 flex-row items-center justify-between border-t border-black/[0.05] pt-2.5">
          <View className="flex-row items-center gap-2">
            {item.hasInventory && (
              <Text className="text-xs font-bold text-espresso">
                {item.inventoryItemsCount}{' '}
                <Text className="font-normal text-taupe">
                  {item.inventoryItemsCount === 1 ? 'item' : 'items'}
                </Text>
              </Text>
            )}
            {item.hasInventory && item.hasTime && (
              <Text className="text-xs font-bold text-taupe/40">•</Text>
            )}
            {item.hasTime && (
              <Text className="text-xs font-bold text-espresso">
                {item.timeLogsCount}{' '}
                <Text className="font-normal text-taupe">
                  {item.timeLogsCount === 1 ? 'log' : 'logs'}
                </Text>
              </Text>
            )}
            {!item.hasInventory && !item.hasTime && (
              <Text className="text-xs font-medium text-taupe">Layout asset</Text>
            )}
          </View>

          <Text className="text-[11px] font-medium text-taupe">
            {formatTimestamp(item.updated_at)}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-champagne">
      {/* ─── Top Header ─── */}
      <View className="border-b border-taupe/15 bg-white/90 px-5 pb-3 pt-14 shadow-sm shadow-espresso/5">
        <View className="flex-row items-center justify-between">
          <BackButton />

          <View className="flex-1 items-center px-2">
            <Text className="text-lg font-black tracking-tight text-espresso" numberOfLines={1}>
              Facilities Manager
            </Text>
            <Text className="text-xs font-semibold text-taupe" numberOfLines={1}>
              {currentScopeTitle} · {facilities.length}{' '}
              {facilities.length === 1 ? 'Station' : 'Stations'}
            </Text>
          </View>

          <Pressable
            onPress={loadData}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-champagne active:scale-95">
            <RotateCcw className="text-espresso" size={17} />
          </Pressable>
        </View>

        {/* ─── Scope Selector Pills (All / Estate / Individual Farms) ─── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3.5"
          contentContainerStyle={{ gap: 6, paddingRight: 10 }}>
          {/* All */}
          <Pressable
            onPress={() => setSelectedScope('all')}
            className={`rounded-full px-3.5 py-1.5 active:scale-95 flex-row items-center gap-1.5 ${
              selectedScope === 'all'
                ? 'bg-espresso shadow-xs'
                : 'bg-black/5 border border-taupe/20'
            }`}>
            <Text
              className={`text-xs font-bold ${
                selectedScope === 'all' ? 'text-white' : 'text-espresso'
              }`}>
              All Facilities
            </Text>
          </Pressable>

          {/* Estate */}
          {estateRecord && (
            <Pressable
              onPress={() => setSelectedScope('estate')}
              className={`rounded-full px-3.5 py-1.5 active:scale-95 flex-row items-center gap-1.5 ${
                selectedScope === 'estate'
                  ? 'bg-cognac shadow-xs'
                  : 'bg-black/5 border border-taupe/20'
              }`}>
              <Building2 size={12} color={selectedScope === 'estate' ? '#FFFFFF' : '#8C4522'} />
              <Text
                className={`text-xs font-bold ${
                  selectedScope === 'estate' ? 'text-white' : 'text-espresso'
                }`}>
                {estateRecord.estate_name || 'Farm Estate'}
              </Text>
            </Pressable>
          )}

          {/* Individual User Farms */}
          {userFarms.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setSelectedScope(f.id)}
              className={`rounded-full px-3.5 py-1.5 active:scale-95 ${
                selectedScope === f.id
                  ? 'bg-emerald-800 shadow-xs'
                  : 'bg-black/5 border border-taupe/20'
              }`}>
              <Text
                className={`text-xs font-bold ${
                  selectedScope === f.id ? 'text-white' : 'text-espresso'
                }`}>
                {f.farm_name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ─── Search Bar ─── */}
        <View className="mt-4 flex-row items-center rounded-2xl border border-taupe/20 bg-champagne px-3.5 py-2.5">
          <Search size={16} color="#8C7C70" className="mr-2.5" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            maxLength={255}
            placeholder="Search facilities, inventory, or logs..."
            placeholderTextColor="#A8A29E"
            className="flex-1 text-sm font-medium text-espresso"
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
              <X size={16} color="#8C7C70" />
            </Pressable>
          ) : null}
        </View>

        {/* ─── Filter Pills & Sort Button ─── */}
        <View className="mt-3 flex-row items-center gap-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingRight: 6 }}
            className="flex-1">
            {/* All */}
            <Pressable
              onPress={() => setActiveFilter('all')}
              className={`flex-row items-center gap-1.5 rounded-xl px-2.5 py-1.5 active:scale-95 ${
                activeFilter === 'all'
                  ? 'bg-emerald-800 shadow-xs'
                  : 'border border-black/[0.06] bg-champagne/80'
              }`}>
              <Text
                className={`text-xs font-bold ${
                  activeFilter === 'all' ? 'text-white' : 'text-espresso'
                }`}>
                All
              </Text>
              <View
                className={`rounded-full px-1.5 py-0.2 ${
                  activeFilter === 'all' ? 'bg-white/20' : 'bg-black/5'
                }`}>
                <Text
                  className={`text-[9px] font-black ${
                    activeFilter === 'all' ? 'text-white' : 'text-taupe'
                  }`}>
                  {counts.all}
                </Text>
              </View>
            </Pressable>

            {/* Inventory */}
            <Pressable
              onPress={() => setActiveFilter('inventory')}
              className={`flex-row items-center gap-1.5 rounded-xl px-2.5 py-1.5 active:scale-95 ${
                activeFilter === 'inventory'
                  ? 'bg-emerald-800 shadow-xs'
                  : 'border border-black/[0.06] bg-champagne/80'
              }`}>
              <Text
                className={`text-xs font-bold ${
                  activeFilter === 'inventory' ? 'text-white' : 'text-espresso'
                }`}>
                Inventory
              </Text>
              <View
                className={`rounded-full px-1.5 py-0.2 ${
                  activeFilter === 'inventory' ? 'bg-white/20' : 'bg-black/5'
                }`}>
                <Text
                  className={`text-[9px] font-black ${
                    activeFilter === 'inventory' ? 'text-white' : 'text-taupe'
                  }`}>
                  {counts.inventory}
                </Text>
              </View>
            </Pressable>

            {/* Schedule */}
            <Pressable
              onPress={() => setActiveFilter('schedule')}
              className={`flex-row items-center gap-1.5 rounded-xl px-2.5 py-1.5 active:scale-95 ${
                activeFilter === 'schedule'
                  ? 'bg-emerald-800 shadow-xs'
                  : 'border border-black/[0.06] bg-champagne/80'
              }`}>
              <Text
                className={`text-xs font-bold ${
                  activeFilter === 'schedule' ? 'text-white' : 'text-espresso'
                }`}>
                Schedule
              </Text>
              <View
                className={`rounded-full px-1.5 py-0.2 ${
                  activeFilter === 'schedule' ? 'bg-white/20' : 'bg-black/5'
                }`}>
                <Text
                  className={`text-[9px] font-black ${
                    activeFilter === 'schedule' ? 'text-white' : 'text-taupe'
                  }`}>
                  {counts.schedule}
                </Text>
              </View>
            </Pressable>

            {/* Both */}
            <Pressable
              onPress={() => setActiveFilter('both')}
              className={`flex-row items-center gap-1.5 rounded-xl px-2.5 py-1.5 active:scale-95 ${
                activeFilter === 'both'
                  ? 'bg-emerald-800 shadow-xs'
                  : 'border border-black/[0.06] bg-champagne/80'
              }`}>
              <Text
                className={`text-xs font-bold ${
                  activeFilter === 'both' ? 'text-white' : 'text-espresso'
                }`}>
                Both
              </Text>
              <View
                className={`rounded-full px-1.5 py-0.2 ${
                  activeFilter === 'both' ? 'bg-white/20' : 'bg-black/5'
                }`}>
                <Text
                  className={`text-[9px] font-black ${
                    activeFilter === 'both' ? 'text-white' : 'text-taupe'
                  }`}>
                  {counts.both}
                </Text>
              </View>
            </Pressable>
          </ScrollView>

          {/* Sort Button */}
          <Pressable
            onPress={() => setIsSortModalVisible(true)}
            hitSlop={6}
            className="flex-row items-center gap-1 rounded-xl border border-taupe/20 bg-champagne px-2.5 py-2 active:scale-95">
            <Layers size={13} color="#8C7C70" />
            <Text className="text-xs font-bold text-espresso">Sort</Text>
          </Pressable>
        </View>
      </View>

      {/* ─── Content List ─── */}
      {loading ? (
        <View className="flex-1 items-center justify-center p-8">
          <ActivityIndicator size="large" color="#047857" />
          <Text className="mt-3 text-xs font-bold uppercase tracking-wider text-taupe">
            Loading farm facilities...
          </Text>
        </View>
      ) : filteredAndSortedFacilities.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <View className="h-16 w-16 items-center justify-center rounded-3xl border border-taupe/20 bg-champagne/50">
            <Building2 size={28} color="#8C7C70" />
          </View>
          <Text className="mt-4 text-base font-black text-espresso">
            {searchQuery ? 'No Matching Facilities' : 'No Facilities Configured'}
          </Text>
          <Text className="mt-1 px-6 text-center text-xs leading-5 text-taupe">
            {searchQuery
              ? `No facility matches "${searchQuery}". Try a different search term or reset filters.`
              : 'Add custom facilities with inventory or time tracking in the Farm Layout Designer to view them here.'}
          </Text>
          {searchQuery ? (
            <Pressable
              onPress={() => {
                setSearchQuery('');
                setActiveFilter('all');
              }}
              className="mt-4 rounded-xl bg-cognac px-4 py-2 active:scale-95">
              <Text className="text-xs font-bold text-white">Reset Search & Filters</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filteredAndSortedFacilities}
          keyExtractor={(item) => item.facility_id}
          renderItem={renderFacilityCard}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#047857"
              colors={['#047857']}
            />
          }
        />
      )}

      {/* ─── Sort Selector Modal ─── */}
      <Modal
        visible={isSortModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSortModalVisible(false)}>
        <View className="flex-1 justify-end bg-black/40 px-4 pb-8">
          <Pressable
            className="flex-1"
            onPress={() => setIsSortModalVisible(false)}
          />
          <View
            className="w-full max-w-sm self-center rounded-[32px] border border-black/5 bg-white p-5 shadow-2xl">
            <View className="mb-3 flex-row items-center justify-between border-b border-black/5 pb-2.5">
              <View className="flex-row items-center gap-2">
                <Layers size={16} color="#8C4522" />
                <Text className="text-base font-black text-espresso">Sort Facilities</Text>
              </View>
              <Pressable
                onPress={() => setIsSortModalVisible(false)}
                hitSlop={8}
                className="h-7 w-7 items-center justify-center rounded-full bg-champagne">
                <X size={14} color="#8C7C70" />
              </Pressable>
            </View>

            {(['name_asc', 'name_desc', 'updated_desc', 'items_desc'] as SortOption[]).map(
              (opt) => {
                const isSelected = sortOption === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      setSortOption(opt);
                      setIsSortModalVisible(false);
                    }}
                    className={`mb-2 flex-row items-center justify-between rounded-2xl p-3 active:scale-[0.99] ${
                      isSelected
                        ? 'border border-emerald-600/30 bg-emerald-50/60'
                        : 'border border-black/[0.04] bg-champagne/30'
                    }`}>
                    <Text
                      className={`text-sm font-bold ${
                        isSelected ? 'text-emerald-900' : 'text-espresso'
                      }`}>
                      {getSortLabel(opt)}
                    </Text>
                    {isSelected && <Check size={16} color="#047857" strokeWidth={3} />}
                  </Pressable>
                );
              }
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
