import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, ScrollView, Image, BackHandler, StyleSheet } from 'react-native';
import { Modal } from '../../components/common/AppModal';
import { Link, useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import {
  Eye,
  X,
  MapPin,
  ChevronRight,
  Leaf,
  Settings,
  FlaskConical,
  Sprout,
  RefreshCw,
  Home,
  Layers,
  Box,
  Building2,
  Compass,
  Pencil,
  Trash2,
  Sparkles,
} from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import {
  getFarmsByUser,
  getExistingFarmLayoutWithStructures,
  getFarmSuccessionPlan,
  deleteFarm,
  type CropRotationPlanData,
} from '../../lib/db-operations';
import { FarmLayout3DViewer } from '../../modules/farm-layout-viewer-3d';
import { FarmListSkeletonGroup } from '../../components/skeleton';
import { useDataSyncReady } from '../../lib/hooks/useDataSyncReady';
import { cropIcons } from '../../lib/cropIcons';
import CropAvatar from '../../components/CropAvatar';
import { parseLocation } from '../../lib/location-utils';
import { powersync } from '../../lib/powersync';
import {
  loadFarmLayout,
  type LoadedLayout,
} from '../../modules/farm-layout-designer';
import { useAccessibility } from '../../lib/accessibility';

export default function FarmsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openLayouts?: string; t?: string }>();
  const { user } = useAuth();
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();
  const [farms, setFarms] = useState<any[]>([]);
  const [allLayouts, setAllLayouts] = useState<any[]>([]);
  const [isAllFarmsModalVisible, setIsAllFarmsModalVisible] = useState(false);

  useEffect(() => {
    if (params.openLayouts === 'true') {
      setIsAllFarmsModalVisible(true);
    }
  }, [params.openLayouts, params.t]);

  const handleCloseLayoutsModal = () => {
    setIsAllFarmsModalVisible(false);
    router.setParams({ openLayouts: '' });
  };
  const [isLoadingLayouts, setIsLoadingLayouts] = useState(false);
  const [selectedFarmForModal, setSelectedFarmForModal] = useState<{
    farm: any;
    layout: any;
    activePlans: CropRotationPlanData[];
  } | null>(null);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [expandedLayoutGroups, setExpandedLayoutGroups] = useState<Record<number, boolean>>({});
  const [expandedUnassigned, setExpandedUnassigned] = useState(false);
  type FarmFilter = 'all' | 'mine' | 'shared';
  const [farmFilter, setFarmFilter] = useState<FarmFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const visibleFarms = farms.filter((farm) => {
    const isOwner =
      farm.user_id && user?.id && farm.user_id.toLowerCase() === user.id.toLowerCase();
    if (farmFilter === 'mine') return isOwner;
    if (farmFilter === 'shared') return !isOwner;
    return true;
  });

  const totalPages = Math.ceil(visibleFarms.length / ITEMS_PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedFarms = visibleFarms.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  );

  const visibleLayouts = allLayouts.filter((item) => {
    const isOwner =
      item.farm.user_id && user?.id && item.farm.user_id.toLowerCase() === user.id.toLowerCase();
    if (farmFilter === 'mine') return isOwner;
    if (farmFilter === 'shared') return !isOwner;
    return true;
  });

  const ownedFarmsCount = farms.filter(
    (farm) => farm.user_id && user?.id && farm.user_id.toLowerCase() === user.id.toLowerCase()
  ).length;
  const sharedFarmsCount = farms.length - ownedFarmsCount;

  const fetchFarmsAndLayouts = useCallback(async () => {
    if (!user) return;
    try {
      const fetchedFarms = await getFarmsByUser(user.id);
      setFarms(fetchedFarms);

      setIsLoadingLayouts(true);
      const layouts = await Promise.all(
        fetchedFarms.map(async (farm) => {
          const layout = await getExistingFarmLayoutWithStructures(farm.id);
          const planRecord = await getFarmSuccessionPlan(farm.id);
          let activePlans: CropRotationPlanData[] = [];
          if (planRecord && planRecord.planData) {
            activePlans = Array.isArray(planRecord.planData)
              ? planRecord.planData
              : [planRecord.planData];
          }

          return { farm, layout, activePlans };
        })
      );
      setAllLayouts(layouts.filter((l) => l.layout !== null));
    } catch (error) {
      console.error('Error loading farms and layouts:', error);
    } finally {
      setIsLoadingLayouts(false);
    }
  }, [user]);

  const { isDataReady } = useDataSyncReady({
    onSyncComplete: fetchFarmsAndLayouts,
  });

  const showSkeleton = !isDataReady && farms.length === 0;

  useFocusEffect(
    useCallback(() => {
      void fetchFarmsAndLayouts();
    }, [fetchFarmsAndLayouts])
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isDetailModalVisible) {
          setIsDetailModalVisible(false);
          return true;
        }
        if (isAllFarmsModalVisible) {
          handleCloseLayoutsModal();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [isDetailModalVisible, isAllFarmsModalVisible, handleCloseLayoutsModal])
  );

  // Watch for live PowerSync changes to farms
  useEffect(() => {
    if (!user) return;
    const currentUserId = user.id;
    void fetchFarmsAndLayouts();

    const abortController = new AbortController();
    async function watchFarms() {
      try {
        for await (const _update of powersync.watch(
          `SELECT id FROM farms WHERE user_id = ? 
           UNION ALL 
           SELECT tf.farm_id as id 
           FROM team_farms tf 
           JOIN team_members tm ON tm.team_id = tf.team_id 
           WHERE tm.user_id = ? AND tm.status = 'accepted'`,
          [currentUserId, currentUserId],
          { signal: abortController.signal }
        )) {
          void fetchFarmsAndLayouts();
        }
      } catch (err) {
        // abort handled silently
      }
    }

    watchFarms();

    return () => {
      abortController.abort();
    };
  }, [user, fetchFarmsAndLayouts]);

  return (
    <View className="flex-1 bg-champagne pb-20">
      <FlatList
        data={paginatedFarms}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-5 pb-8 pt-14"
        ListHeaderComponent={
          <>
            <View className="mb-5">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text
                    style={{ fontSize: Math.round(28 * fontScale) }}
                    className={`font-black tracking-tight ${
                      isHighContrast ? 'text-black' : 'text-espresso'
                    }`}>
                    Your Farm Areas
                  </Text>
                  <View className="mt-0.5 flex-row items-center gap-1.5">
                    <View className="h-1.5 w-1.5 rounded-full bg-cognac" />
                    <Text
                      style={{ fontSize: Math.round(11 * fontScale) }}
                      className={`font-extrabold uppercase tracking-[0.25em] ${
                        isHighContrast ? 'text-black font-black' : 'text-cognac'
                      }`}>
                      Farm Area Portfolio
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mt-4">
                {/* Segmented Pill Filter */}
                <View
                  className="flex-row rounded-full border border-cognac/20 bg-black/5 p-1"
                  style={isHighContrast ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      setFarmFilter('all');
                      setCurrentPage(1);
                    }}
                    className={`flex-1 items-center justify-center rounded-full active:scale-95 ${
                      isGloveMode ? 'py-3' : 'py-2'
                    } ${
                      farmFilter === 'all'
                        ? isHighContrast
                          ? 'bg-black'
                          : 'bg-cognac shadow-sm shadow-cognac/30'
                        : 'bg-transparent'
                    }`}>
                    <Text
                      style={{ fontSize: 12 * fontScale }}
                      className={`${
                        farmFilter === 'all'
                          ? 'font-black text-white'
                          : isHighContrast
                            ? 'font-extrabold text-black'
                            : 'font-bold text-taupe'
                      }`}>
                      All ({farms.length})
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      setFarmFilter('mine');
                      setCurrentPage(1);
                    }}
                    className={`flex-1 items-center justify-center rounded-full active:scale-95 ${
                      isGloveMode ? 'py-3' : 'py-2'
                    } ${
                      farmFilter === 'mine'
                        ? isHighContrast
                          ? 'bg-black'
                          : 'bg-cognac shadow-sm shadow-cognac/30'
                        : 'bg-transparent'
                    }`}>
                    <Text
                      style={{ fontSize: 12 * fontScale }}
                      className={`${
                        farmFilter === 'mine'
                          ? 'font-black text-white'
                          : isHighContrast
                            ? 'font-extrabold text-black'
                            : 'font-bold text-taupe'
                      }`}>
                      Owned ({ownedFarmsCount})
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      setFarmFilter('shared');
                      setCurrentPage(1);
                    }}
                    className={`flex-1 items-center justify-center rounded-full active:scale-95 ${
                      isGloveMode ? 'py-3' : 'py-2'
                    } ${
                      farmFilter === 'shared'
                        ? isHighContrast
                          ? 'bg-black'
                          : 'bg-cognac shadow-sm shadow-cognac/30'
                        : 'bg-transparent'
                    }`}>
                    <Text
                      style={{ fontSize: 12 * fontScale }}
                      className={`${
                        farmFilter === 'shared'
                          ? 'font-black text-white'
                          : isHighContrast
                            ? 'font-extrabold text-black'
                            : 'font-bold text-taupe'
                      }`}>
                      Shared ({sharedFarmsCount})
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Farm Map Card */}
              {allLayouts.length > 0 && (
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    router.push('/farm/layouts');
                  }}
                  className={`mt-4 flex-row items-center rounded-2xl bg-cognac active:scale-[0.97] ${
                    isGloveMode ? 'px-5 py-4 min-h-[64px]' : 'px-4 py-3.5'
                  }`}
                  style={[
                    {
                      shadowColor: '#8C4522',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 10,
                      elevation: 5,
                    },
                    isHighContrast && { borderWidth: 2, borderColor: '#000000' },
                  ]}>
                  {/* Icon */}
                  <View className="mr-3.5 h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                    <MapPin size={17} color="#FFFFFF" strokeWidth={2.2} />
                  </View>

                  {/* Text */}
                  <View className="flex-1">
                    <Text
                      style={{ fontSize: 15 * fontScale }}
                      className="font-black tracking-tight text-white">
                      Farm Map
                    </Text>
                    <Text
                      style={{ fontSize: 11 * fontScale }}
                      className="mt-0.5 font-medium text-white/75">
                      {allLayouts.length} layout{allLayouts.length !== 1 ? 's' : ''} · View in 3D
                    </Text>
                  </View>

                  {/* Arrow */}
                  <View className="h-7 w-7 items-center justify-center rounded-full bg-white/20">
                    <ChevronRight size={14} color="#FFFFFF" strokeWidth={2.5} />
                  </View>
                </Pressable>
              )}
            </View>
          </>
        }
        ListEmptyComponent={
          showSkeleton ? (
            <FarmListSkeletonGroup count={3} />
          ) : (
            <View
              style={isHighContrast ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}
              className="items-center rounded-[28px] border border-dashed border-cognac/30 bg-white/70 p-8">
              <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl border border-cognac/20 bg-cognac/10">
                <Leaf size={24} color="#8C4522" strokeWidth={2.2} />
              </View>
              <Text
                style={{ fontSize: Math.round(16 * fontScale) }}
                className={`text-center font-black ${
                  isHighContrast ? 'text-black' : 'text-espresso'
                }`}>
                No farms found
              </Text>
              <Text
                style={{ fontSize: Math.round(14 * fontScale) }}
                className={`mt-1 max-w-[260px] text-center leading-5 ${
                  isHighContrast ? 'text-black/80 font-medium' : 'text-taupe'
                }`}>
                Create a farm from the Add tab to start managing it here.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <View className="mt-4 flex-row items-center justify-between border-t border-cognac/15 pt-3.5">
              <Pressable
                onPress={() => {
                  triggerHaptic('light');
                  setCurrentPage((p) => Math.max(1, p - 1));
                }}
                disabled={safePage === 1}
                style={isHighContrast && safePage !== 1 ? { borderWidth: 2, borderColor: '#000000' } : undefined}
                className={`rounded-full active:scale-95 ${
                  isGloveMode ? 'min-h-[48px] px-5 py-3' : 'px-4 py-2'
                } ${safePage === 1 ? 'bg-black/5' : 'shadow-xs bg-cognac shadow-cognac/25'}`}>
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className={`font-bold ${safePage === 1 ? 'text-taupe' : 'text-white'}`}>
                  Previous
                </Text>
              </Pressable>

              <View
                style={isHighContrast ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}
                className={`rounded-full border border-cognac/20 bg-cognac/10 ${
                  isGloveMode ? 'px-3.5 py-1.5' : 'px-3 py-1'
                }`}>
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className={`font-black ${isHighContrast ? 'text-black' : 'text-cognac'}`}>
                  Page {safePage} of {totalPages}
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  triggerHaptic('light');
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                }}
                disabled={safePage === totalPages}
                style={isHighContrast && safePage !== totalPages ? { borderWidth: 2, borderColor: '#000000' } : undefined}
                className={`rounded-full active:scale-95 ${
                  isGloveMode ? 'min-h-[48px] px-5 py-3' : 'px-4 py-2'
                } ${safePage === totalPages ? 'bg-black/5' : 'shadow-xs bg-cognac shadow-cognac/25'}`}>
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className={`font-bold ${safePage === totalPages ? 'text-taupe' : 'text-white'}`}>
                  Next
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isOwner =
            item.user_id && user?.id && item.user_id.toLowerCase() === user.id.toLowerCase();
          return (
            <Link href={`/farm/${item.id}`} asChild>
              <Pressable
                onPress={() => triggerHaptic('selection')}
                className={`mb-3.5 rounded-[28px] border border-cognac/15 bg-white p-5 shadow-sm shadow-espresso/5 active:scale-[0.98] ${
                  isGloveMode ? 'min-h-[84px] p-6' : ''
                }`}
                style={
                  isHighContrast
                    ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                    : undefined
                }>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 flex-row items-center">
                    <View
                      className={`shadow-xs mr-3.5 items-center justify-center rounded-2xl border ${
                        isGloveMode ? 'h-13 w-13' : 'h-11 w-11'
                      } ${
                        isHighContrast
                          ? 'border-2 border-black bg-white'
                          : 'border-cognac/20 bg-cognac/10'
                      }`}>
                      <MapPin
                        size={isGloveMode ? 22 : 20}
                        color={isHighContrast ? '#000000' : '#8C4522'}
                        strokeWidth={2.4}
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        style={{
                          fontSize: 17 * fontScale,
                          color: isHighContrast ? '#000000' : '#2D231E',
                          fontWeight: isHighContrast ? '900' : '800',
                        }}
                        className="tracking-tight"
                        numberOfLines={1}>
                        {item.farm_name}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12 * fontScale,
                          color: isHighContrast ? '#111111' : '#8C7C70',
                          fontWeight: isHighContrast ? '700' : '500',
                        }}
                        className="mt-0.5"
                        numberOfLines={1}>
                        {parseLocation(item.location).address || 'No location set'}
                      </Text>
                    </View>
                  </View>

                  <View
                    className="h-8 w-8 items-center justify-center rounded-full border border-cognac/20 bg-cognac/10"
                    style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000' } : undefined}>
                    <ChevronRight
                      size={16}
                      color={isHighContrast ? '#000000' : '#8C4522'}
                      strokeWidth={2.5}
                    />
                  </View>
                </View>

                <View
                  className="mt-3.5 flex-row items-center justify-between rounded-[20px] border border-cognac/15 bg-cognac/[0.04] px-4 py-2.5"
                  style={
                    isHighContrast
                      ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }>
                  <View>
                    <Text
                      style={{ fontSize: 10 * fontScale }}
                      className="font-extrabold uppercase tracking-wider text-cognac">
                      Area
                    </Text>
                    <Text
                      style={{
                        fontSize: 14 * fontScale,
                        color: isHighContrast ? '#000000' : '#2D231E',
                        fontWeight: '900',
                      }}
                      className="mt-0.5">
                      {item.area_sqm ? `${item.area_sqm} m²` : 'Not set'}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text
                      style={{ fontSize: 10 * fontScale }}
                      className="font-extrabold uppercase tracking-wider text-taupe">
                      Ownership
                    </Text>
                    <View
                      className="mt-0.5 flex-row items-center rounded-full border border-cognac/25 bg-cognac/10 px-2.5 py-0.5"
                      style={
                        isHighContrast
                          ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                          : undefined
                      }>
                      <View
                        className="mr-1.5 h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: isHighContrast ? '#000000' : '#8C4522' }}
                      />
                      <Text
                        style={{
                          fontSize: 11 * fontScale,
                          color: isHighContrast ? '#000000' : '#8C4522',
                          fontWeight: '800',
                        }}>
                        {isOwner ? 'Owned' : 'Shared'}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            </Link>
          );
        }}
      />

      {/* My Farm Layouts Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isAllFarmsModalVisible}
        onRequestClose={handleCloseLayoutsModal}>
        <View className="flex-1 bg-champagne pt-12">
          <View className="z-10 flex-row items-center justify-between border-b border-cognac/15 bg-white px-5 py-4 shadow-sm">
            <Text
              style={{ fontSize: Math.round(20 * fontScale) }}
              className={`font-black tracking-tight ${
                isHighContrast ? 'text-black' : 'text-espresso'
              }`}>
              My Farm Layouts
            </Text>
            <Pressable
              onPress={() => {
                triggerHaptic('light');
                handleCloseLayoutsModal();
              }}
              hitSlop={isGloveMode ? 10 : 8}
              className={`items-center justify-center rounded-full bg-cognac/10 active:scale-95 ${
                isGloveMode ? 'h-11 w-11' : 'h-8 w-8'
              }`}>
              <X size={isGloveMode ? 18 : 16} color="#8C4522" strokeWidth={2.2} />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="p-5 pb-20">
            <View className="flex-row flex-wrap justify-between gap-y-4">
              {visibleLayouts.map(({ farm, layout, activePlans }) => (
                <Pressable
                  key={farm.id}
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedFarmForModal({ farm, layout, activePlans: activePlans || [] });
                    setIsDetailModalVisible(true);
                  }}
                  className="w-[48%] rounded-[24px] border border-cognac/20 bg-white p-3.5 shadow-sm shadow-cognac/5 active:scale-[0.98]">
                  <Text
                    style={{ fontSize: Math.round(14 * fontScale) }}
                    className="mb-1 font-black text-cognac"
                    numberOfLines={1}>
                    {farm.farm_name}
                  </Text>
                  <View pointerEvents="none" className="mt-2 items-center">
                    <FarmLayout3DViewer layout={layout} width={150} height={150} />
                  </View>
                </Pressable>
              ))}
              {visibleLayouts.length === 0 && !isLoadingLayouts && (
                <Text
                  style={{ fontSize: Math.round(14 * fontScale) }}
                  className="mt-10 w-full text-center font-medium text-taupe">
                  No farm layouts available.
                </Text>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Detail Modal (Same as Farm Details Blueprint View) */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isDetailModalVisible && !!selectedFarmForModal}
        onRequestClose={() => setIsDetailModalVisible(false)}>
        {selectedFarmForModal && (
          <View className="flex-1 items-center justify-center bg-black/60 px-4 py-10">
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setIsDetailModalVisible(false)}
            />
            <View
              className="w-full max-w-md flex-1 rounded-3xl border border-cognac/20 bg-champagne p-5 shadow-xl shadow-espresso/20">
              <View className="mb-4 flex-row items-center justify-between">
                <Text
                  style={{ fontSize: Math.round(18 * fontScale) }}
                  className={`font-bold ${
                    isHighContrast ? 'text-black' : 'text-espresso'
                  }`}>
                  {selectedFarmForModal.farm.farm_name}
                </Text>
                <Pressable
                  onPress={() => {
                    triggerHaptic('light');
                    setIsDetailModalVisible(false);
                  }}
                  hitSlop={isGloveMode ? 10 : 8}
                  className={`items-center justify-center rounded-full bg-cognac/10 active:scale-95 ${
                    isGloveMode ? 'h-11 w-11' : 'h-8 w-8'
                  }`}>
                  <X size={isGloveMode ? 18 : 16} color="#8C4522" strokeWidth={2.2} />
                </Pressable>
              </View>

              {(() => {
                try {
                  const data =
                    typeof selectedFarmForModal.layout?.blueprint_data_json === 'string'
                      ? JSON.parse(selectedFarmForModal.layout.blueprint_data_json)
                      : selectedFarmForModal.layout?.blueprint_data_json;

                  const plots = data?.items || [];
                  const activePlans = selectedFarmForModal.activePlans || [];

                  const plotColors: Record<number, string> = {};
                  const groupedPlots: {
                    plan: CropRotationPlanData | null;
                    plots: any[];
                    color: string;
                  }[] = [];
                  const planColors = [
                    '#FF6B6B',
                    '#4ECDC4',
                    '#FFE66D',
                    '#6A4C93',
                    '#1A535C',
                    '#FF9F1C',
                    '#2EC4B6',
                    '#E71D36',
                  ];
                  const unassignedPlots: any[] = [];

                  if (activePlans.length > 0) {
                    activePlans.forEach((plan, planIdx) => {
                      const color = planColors[planIdx % planColors.length];
                      groupedPlots.push({ plan, plots: [], color });
                    });
                  }

                  plots.forEach((plot: any, idx: number) => {
                    plot.originalIndex = idx;
                    plot.legendChar = String.fromCharCode(65 + (idx % 26));
                    const structureId = selectedFarmForModal.layout.structures?.[idx]?.id;

                    let assignedPlanIdx = -1;
                    if (structureId) {
                      assignedPlanIdx = activePlans.findIndex((p: any) =>
                        p.targetPlots?.includes(structureId)
                      );
                    }

                    if (assignedPlanIdx !== -1) {
                      const color = planColors[assignedPlanIdx % planColors.length];
                      plotColors[idx] = color;
                      groupedPlots[assignedPlanIdx].plots.push(plot);
                    } else {
                      unassignedPlots.push(plot);
                    }
                  });

                  return (
                    <>
                      <View className="w-full items-center justify-center overflow-hidden rounded-2xl border border-cognac/15 bg-cognac/5 py-2">
                        <FarmLayout3DViewer
                          layout={selectedFarmForModal.layout}
                          width={290}
                          height={165}
                          showLabels={true}
                          plotColors={plotColors}
                        />
                      </View>

                      <View className="mt-3 flex-1 rounded-2xl border border-cognac/15 bg-white p-3.5 shadow-sm shadow-cognac/5">
                        <ScrollView
                          nestedScrollEnabled={true}
                          showsVerticalScrollIndicator={true}
                          contentContainerStyle={{ paddingBottom: 24 }}>
                          <View className="flex-col gap-3 px-1">
                            {groupedPlots
                              .filter((g) => g.plots.length > 0)
                              .map((group, groupIdx) => {
                                const allCrops = group.plan?.selectedCrops || [];
                                const visibleCrops = allCrops.slice(0, 3);
                                const overflowCropCount = allCrops.length - visibleCrops.length;
                                const planTitle = allCrops.map((c: any) => c.crop).join(' / ') || 'Plan';

                                return (
                                  <View
                                    key={`group-${groupIdx}`}
                                    className="overflow-hidden rounded-xl border border-cognac/20 bg-champagne/40">
                                    <Pressable
                                      onPress={() =>
                                        setExpandedLayoutGroups((prev) => ({
                                          ...prev,
                                          [groupIdx]: !prev[groupIdx],
                                        }))
                                      }
                                      className="flex-row items-center justify-between border-b border-cognac/15 p-3 active:bg-champagne/60">
                                      <View className="mr-3 flex-1 min-w-0 flex-row items-center">
                                        <View className="mr-2.5 flex-row items-center shrink-0">
                                          {visibleCrops.map((c: any, i: number) => (
                                            <View
                                              key={`crop-icon-${i}`}
                                              style={{ marginLeft: i > 0 ? -10 : 0 }}
                                              className="shadow-xs rounded-full border-2 border-white">
                                              <CropAvatar
                                                crop={c}
                                                cropName={c.crop}
                                                size="sm"
                                                showPartnerBadge={false}
                                              />
                                            </View>
                                          ))}
                                          {overflowCropCount > 0 && (
                                            <View
                                              style={{ marginLeft: -10, width: 32, height: 32 }}
                                              className="shadow-xs rounded-full border-2 border-white bg-cognac/15 items-center justify-center">
                                              <Text
                                                style={{ fontSize: Math.round(10 * fontScale) }}
                                                className="font-bold text-cognac">
                                                +{overflowCropCount}
                                              </Text>
                                            </View>
                                          )}
                                        </View>
                                        <View className="flex-1 min-w-0 justify-center">
                                          <Text
                                            numberOfLines={1}
                                            ellipsizeMode="tail"
                                            style={{ fontSize: Math.round(12 * fontScale) }}
                                            className="font-bold uppercase text-espresso">
                                            {planTitle}
                                          </Text>
                                          <Text
                                            numberOfLines={1}
                                            style={{ fontSize: Math.round(10 * fontScale) }}
                                            className="mt-0.5 font-semibold text-taupe">
                                            {group.plots.length}{' '}
                                            {group.plots.length === 1 ? 'plot' : 'plots'} assigned
                                            {allCrops.length > 0 ? ` • ${allCrops.length} ${allCrops.length === 1 ? 'crop' : 'crops'}` : ''}
                                          </Text>
                                        </View>
                                      </View>
                                      <View className="flex-row items-center gap-2.5 shrink-0">
                                        <View
                                          className="h-3 w-3 rounded-full"
                                          style={{ backgroundColor: group.color }}
                                        />
                                        <Text
                                          style={{ fontSize: Math.round(10 * fontScale) }}
                                          className="font-bold text-taupe">
                                          {expandedLayoutGroups[groupIdx] ? '▲' : '▼'}
                                        </Text>
                                      </View>
                                    </Pressable>
                                    {expandedLayoutGroups[groupIdx] && (
                                      <View className="flex-col gap-2 p-2.5">
                                        {allCrops.length > 0 && (
                                          <View className="mb-2">
                                            <Text
                                              style={{ fontSize: Math.round(10 * fontScale) }}
                                              className="mb-1.5 px-1 font-bold uppercase tracking-wider text-taupe">
                                              Planned Crops ({allCrops.length})
                                            </Text>
                                            <ScrollView
                                              horizontal
                                              showsHorizontalScrollIndicator={false}
                                              nestedScrollEnabled={true}
                                              contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
                                              {allCrops.map((c: any, cIdx: number) => (
                                                <View
                                                  key={`crop-chip-${cIdx}`}
                                                  className="flex-row items-center rounded-lg border border-taupe/15 bg-white px-2.5 py-1.5 shadow-2xs">
                                                  <CropAvatar
                                                    crop={c}
                                                    cropName={c.crop}
                                                    size="xs"
                                                    showPartnerBadge={false}
                                                  />
                                                  <Text
                                                    style={{ fontSize: Math.round(11 * fontScale) }}
                                                    className="ml-1.5 font-medium text-espresso">
                                                    {c.crop}
                                                  </Text>
                                                </View>
                                              ))}
                                            </ScrollView>
                                          </View>
                                        )}

                                        <View>
                                          <Text
                                            style={{ fontSize: Math.round(10 * fontScale) }}
                                            className="mb-1.5 px-1 font-bold uppercase tracking-wider text-taupe">
                                            Assigned Plots ({group.plots.length})
                                          </Text>
                                          <View className="flex-col gap-1">
                                            {group.plots.map((plot: any, idx: number) => (
                                              <View
                                                key={plot.id || idx}
                                                className="flex-row items-center rounded-lg border border-taupe/10 bg-white px-3 py-2">
                                                <Text
                                                  className="w-6 font-bold"
                                                  style={{
                                                    color: group.color,
                                                    fontSize: Math.round(14 * fontScale),
                                                  }}>
                                                  {plot.legendChar}.
                                                </Text>
                                                <Text
                                                  style={{ fontSize: Math.round(14 * fontScale) }}
                                                  className="font-medium text-espresso">
                                                  {plot.label || `Plot ${plot.originalIndex + 1}`}
                                                </Text>
                                              </View>
                                            ))}
                                          </View>
                                        </View>
                                      </View>
                                    )}
                                  </View>
                                );
                              })}

                            {unassignedPlots.length > 0 && (
                              <View className="overflow-hidden rounded-xl border border-cognac/20 bg-champagne/40">
                                <Pressable
                                  onPress={() => setExpandedUnassigned((prev) => !prev)}
                                  className="flex-row items-center justify-between border-b border-cognac/15 p-3 active:bg-champagne/60">
                                  <View className="flex-col">
                                    <Text className="text-xs font-bold uppercase text-taupe">
                                      Unassigned Plots
                                    </Text>
                                    <Text className="mt-0.5 text-[10px] font-semibold text-taupe">
                                      {unassignedPlots.length}{' '}
                                      {unassignedPlots.length === 1 ? 'plot' : 'plots'}
                                    </Text>
                                  </View>
                                  <Text className="text-[10px] font-bold text-taupe">
                                    {expandedUnassigned ? '▲' : '▼'}
                                  </Text>
                                </Pressable>
                                {expandedUnassigned && (
                                  <View className="flex-col gap-1 p-2">
                                    {unassignedPlots.map((plot: any, idx: number) => (
                                      <View
                                        key={plot.id || idx}
                                        className="flex-row items-center rounded-lg border border-taupe/10 bg-white px-3 py-2">
                                        <Text className="w-6 text-sm font-bold text-taupe">
                                          {plot.legendChar}.
                                        </Text>
                                        <Text className="text-sm font-medium text-espresso">
                                          {plot.label || `Plot ${plot.originalIndex + 1}`}
                                        </Text>
                                      </View>
                                    ))}
                                  </View>
                                )}
                              </View>
                            )}

                            {plots.length === 0 && (
                              <Text className="text-center text-xs text-taupe">
                                No plots added yet.
                              </Text>
                            )}
                          </View>
                        </ScrollView>
                      </View>
                    </>
                  );
                } catch (e) {
                  return (
                    <View className="w-full items-center justify-center overflow-hidden rounded-2xl border border-cognac/15 bg-cognac/5 py-4">
                      <FarmLayout3DViewer
                        layout={selectedFarmForModal.layout}
                        width={300}
                        height={200}
                        showLabels={true}
                      />
                    </View>
                  );
                }
              })()}

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    setIsDetailModalVisible(false);
                    setIsAllFarmsModalVisible(false);
                    router.push(`/farm/layout-designer/${selectedFarmForModal.farm.id}`);
                  }}
                  style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                  className="flex-1 items-center justify-center rounded-2xl border border-cognac/30 bg-cognac/10 py-3.5 active:scale-[0.98]">
                  <Text
                    style={{ fontSize: Math.round(14 * fontScale) }}
                    className="font-bold text-cognac">
                    Edit Layout
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    setIsDetailModalVisible(false);
                    setIsAllFarmsModalVisible(false);
                    router.push(`/farm/planner/${selectedFarmForModal.farm.id}`);
                  }}
                  style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                  className="flex-1 items-center justify-center rounded-2xl bg-cognac py-3.5 shadow-sm shadow-cognac/30 active:scale-[0.98]">
                  <Text
                    style={{ fontSize: Math.round(14 * fontScale) }}
                    className="font-bold text-white">
                    Plan Crops
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

