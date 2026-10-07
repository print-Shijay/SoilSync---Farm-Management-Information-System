import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  BackHandler,
} from 'react-native';
import { Modal } from '../../components/common/AppModal';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Eye, Layers, X, Plus, Check, Sparkles, Trash2, Building2 } from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import {
  getFarmsByUser,
  getExistingFarmLayoutWithStructures,
  getFarmSuccessionPlan,
  deleteFarm,
  type CropRotationPlanData,
} from '../../lib/db-operations';
import { FarmLayout3DViewer } from '../../modules/farm-layout-viewer-3d';
import { cropIcons } from '../../lib/cropIcons';
import CropAvatar from '../../components/CropAvatar';
import { useAccessibility } from '../../lib/accessibility';
import { BackButton } from '../../components/common/BackButton';
import {
  getFarmEstateLayout,
  type FarmEstateRecord,
} from '../../lib/estate-operations';
import { FarmEstateMapPreview } from '../../components/FarmEstateMapPreview';
import { prefetchFarmLayout, setCachedFarmLayout, setCachedFarmInfo } from '../../modules/farm-layout-designer';
import { FarmLayoutsSkeleton } from '../../components/skeleton';

type FarmAreaCardProps = {
  farm: any;
  layout: any;
  activePlans: CropRotationPlanData[];
  cardWidth: number;
  onSelect: (item: { farm: any; layout: any; activePlans: CropRotationPlanData[] }) => void;
};

const FarmAreaCard = React.memo(function FarmAreaCard({
  farm,
  layout,
  activePlans,
  cardWidth,
  onSelect,
}: FarmAreaCardProps) {
  const plotCount = layout?.structures?.length || 0;
  const bp = useMemo(() => {
    try {
      return typeof layout?.blueprint_data_json === 'string'
        ? JSON.parse(layout.blueprint_data_json)
        : layout?.blueprint_data_json;
    } catch {
      return null;
    }
  }, [layout?.blueprint_data_json]);

  const facCount = bp?.facilities?.length || 0;
  const zoneCount = bp?.zones?.length || 0;

  return (
    <Pressable
      style={{ width: cardWidth }}
      onPress={() => onSelect({ farm, layout, activePlans })}
      className="overflow-hidden rounded-[26px] border border-cognac/15 bg-white p-3.5 shadow-sm shadow-espresso/5 active:scale-[0.98]">
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-1 pr-1">
          <Text className="text-[15px] font-bold text-espresso" numberOfLines={1}>
            {farm.farm_name}
          </Text>
        </View>
        <View className="h-6 w-6 items-center justify-center rounded-full bg-cognac/10">
          <Eye size={12} color="#8C4522" strokeWidth={2.4} />
        </View>
      </View>

      <View pointerEvents="none" className="items-center justify-center overflow-hidden rounded-2xl bg-champagne py-1">
        <FarmLayout3DViewer layout={layout} width={cardWidth - 28} height={140} />
      </View>

      <View className="mt-3 flex-row items-center justify-between border-t border-black/5 pt-2">
        <Text className="text-[10px] font-bold uppercase tracking-wider text-taupe flex-1 pr-1" numberOfLines={1}>
          {plotCount} Plots{facCount > 0 ? ` • ${facCount}F` : ''}{zoneCount > 0 ? ` • ${zoneCount}Z` : ''}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-[10px] font-bold text-cognac">Open →</Text>
        </View>
      </View>
    </Pressable>
  );
});

export default function MyFarmLayoutsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();

  const [farms, setFarms] = useState<any[]>([]);
  const [allLayouts, setAllLayouts] = useState<any[]>([]);
  const [estateRecord, setEstateRecord] = useState<FarmEstateRecord | null>(null);
  const [isLoadingLayouts, setIsLoadingLayouts] = useState(true);

  type FarmFilter = 'all' | 'mine' | 'shared';
  const [farmFilter, setFarmFilter] = useState<FarmFilter>('all');

  const [selectedFarmForModal, setSelectedFarmForModal] = useState<{
    farm: any;
    layout: any;
    activePlans: CropRotationPlanData[];
  } | null>(null);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [isModalContentReady, setIsModalContentReady] = useState(false);
  const [modalNavigating, setModalNavigating] = useState<'map' | 'designer' | null>(null);
  const [expandedLayoutGroups, setExpandedLayoutGroups] = useState<Record<number, boolean>>({});
  const [expandedUnassigned, setExpandedUnassigned] = useState(false);

  const fetchFarmsAndLayouts = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoadingLayouts(true);
      const [fetchedFarms, loadedEstate] = await Promise.all([
        getFarmsByUser(user.id),
        getFarmEstateLayout(user.id),
      ]);
      setFarms(fetchedFarms);
      setEstateRecord(loadedEstate);

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
      const validLayouts = layouts.filter((l) => l.layout !== null);
      setAllLayouts(validLayouts);

      // Seed in-memory cache directly from fetched layouts without extra SQLite queries
      validLayouts.forEach(({ farm, layout }) => {
        if (!layout || !farm) return;
        try {
          const bp = typeof layout.blueprint_data_json === 'string'
            ? JSON.parse(layout.blueprint_data_json || '{}')
            : layout.blueprint_data_json || {};
          const plots = (bp.items || bp.plots || []).map((it: any, idx: number) => ({
            id: it.id || String(idx),
            label: it.label || `Plot ${idx + 1}`,
            x: Number(it.x ?? 0),
            y: Number(it.z ?? it.y ?? 0),
            widthM: Number(it.widthM ?? 2),
            heightM: Number(it.depthM ?? it.heightM ?? 1),
            color: it.color || '#4A7C59',
            rotation: Number(it.rotationY ?? 0),
            zoneId: it.zoneId,
          }));
          setCachedFarmLayout(farm.id, {
            layoutId: layout.id,
            plots,
            zones: bp.zones || [],
            facilities: bp.facilities || [],
            structures: layout.structures || [],
            widthM: layout.blueprint_width_m || bp.widthM || 36,
            heightM: layout.blueprint_height_m || bp.heightM || 36,
          });
          setCachedFarmInfo(farm.id, {
            name: farm.farm_name,
            location: farm.location || '',
            areaSqm: Number(farm.area_sqm || 0),
          });
        } catch {}
      });
    } catch (e) {
      console.error('Failed to fetch farm layouts:', e);
    } finally {
      setIsLoadingLayouts(false);
    }
  }, [user]);

  const handleSelectFarm = useCallback(
    (item: { farm: any; layout: any; activePlans: CropRotationPlanData[] }) => {
      // 1. Immediately open modal at frame 0 with loading skeleton inside
      setSelectedFarmForModal(item);
      setIsModalContentReady(false);
      setModalNavigating(null);
      setIsDetailModalVisible(true);

      // 2. Prime cache in background
      if (item.layout && item.farm) {
        try {
          const bp = typeof item.layout.blueprint_data_json === 'string'
            ? JSON.parse(item.layout.blueprint_data_json || '{}')
            : item.layout.blueprint_data_json || {};
          const plots = (bp.items || bp.plots || []).map((it: any, idx: number) => ({
            id: it.id || String(idx),
            label: it.label || `Plot ${idx + 1}`,
            x: Number(it.x ?? 0),
            y: Number(it.z ?? it.y ?? 0),
            widthM: Number(it.widthM ?? 2),
            heightM: Number(it.depthM ?? it.heightM ?? 1),
            color: it.color || '#4A7C59',
            rotation: Number(it.rotationY ?? 0),
            zoneId: it.zoneId,
          }));
          setCachedFarmLayout(item.farm.id, {
            layoutId: item.layout.id,
            plots,
            zones: bp.zones || [],
            facilities: bp.facilities || [],
            structures: item.layout.structures || [],
            widthM: item.layout.blueprint_width_m || bp.widthM || 36,
            heightM: item.layout.blueprint_height_m || bp.heightM || 36,
          });
          setCachedFarmInfo(item.farm.id, {
            name: item.farm.farm_name,
            location: item.farm.location || '',
            areaSqm: Number(item.farm.area_sqm || 0),
          });
        } catch {}
      }

      // 3. Reveal full 3D layout & plot contents once modal has mounted
      requestAnimationFrame(() => {
        setTimeout(() => {
          setIsModalContentReady(true);
        }, 50);
      });
    },
    []
  );

  const handleNavigateToMasterMap = useCallback((farmId: string) => {
    setModalNavigating('map');
    setTimeout(() => {
      setIsDetailModalVisible(false);
      requestAnimationFrame(() => {
        router.push(`/farm/master-map/${farmId}`);
      });
    }, 150);
  }, [router]);

  const handleNavigateToDesigner = useCallback((farmId: string) => {
    setModalNavigating('designer');
    setTimeout(() => {
      setIsDetailModalVisible(false);
      requestAnimationFrame(() => {
        router.push(`/farm/layout-designer/${farmId}`);
      });
    }, 150);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      fetchFarmsAndLayouts();
    }, [fetchFarmsAndLayouts])
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isDetailModalVisible) {
          setIsDetailModalVisible(false);
          setModalNavigating(null);
          return true;
        }
        if (router.canGoBack()) {
          router.back();
          return true;
        } else {
          router.replace('/(tabs)');
          return true;
        }
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [isDetailModalVisible, router])
  );

  const visibleLayouts = useMemo(() => {
    return allLayouts.filter((item) => {
      const isOwner =
        item.farm.user_id && user?.id && item.farm.user_id.toLowerCase() === user.id.toLowerCase();
      if (farmFilter === 'mine') return isOwner;
      if (farmFilter === 'shared') return !isOwner;
      return true;
    });
  }, [allLayouts, farmFilter, user?.id]);

  const ownedCount = useMemo(() => {
    return allLayouts.filter(
      (item) => item.farm.user_id && user?.id && item.farm.user_id.toLowerCase() === user.id.toLowerCase()
    ).length;
  }, [allLayouts, user?.id]);

  const sharedCount = allLayouts.length - ownedCount;
  const cardWidth = Math.floor((width - 40 - 12) / 2);

  return (
    <View className="flex-1 bg-champagne">
      {/* ─── Apple Navigation Header ─── */}
      <View className="border-b border-black/5 bg-white/90 px-5 pb-3 pt-14 shadow-sm shadow-espresso/5">
        <View className="flex-row items-center justify-between">
          <BackButton fallbackRoute="/(tabs)" />

          <View className="flex-1 items-center px-2">
            <Text className="text-lg font-black tracking-tight text-espresso" numberOfLines={1}>
              My Farm Layouts
            </Text>
            <Text className="text-xs font-semibold text-taupe" numberOfLines={1}>
              {allLayouts.length} Layout{allLayouts.length === 1 ? '' : 's'} Configured
            </Text>
          </View>

          {/* Placeholder to keep title centered */}
          <View style={{ width: 36 }} />
        </View>

        {/* ─── Filter Pills (All / Mine / Shared) ─── */}
        {allLayouts.length > 0 && (
          <View className="mt-3.5 flex-row rounded-full border border-cognac/20 bg-black/5 p-1">
            <Pressable
              onPress={() => setFarmFilter('all')}
              className={`flex-1 items-center justify-center rounded-full py-2 active:scale-95 ${
                farmFilter === 'all' ? 'bg-cognac shadow-sm shadow-cognac/30' : 'bg-transparent'
              }`}>
              <Text
                className={`text-xs ${
                  farmFilter === 'all' ? 'font-black text-white' : 'font-bold text-taupe'
                }`}>
                All ({allLayouts.length})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFarmFilter('mine')}
              className={`flex-1 items-center justify-center rounded-full py-2 active:scale-95 ${
                farmFilter === 'mine' ? 'bg-cognac shadow-sm shadow-cognac/30' : 'bg-transparent'
              }`}>
              <Text
                className={`text-xs ${
                  farmFilter === 'mine' ? 'font-black text-white' : 'font-bold text-taupe'
                }`}>
                My Farms ({ownedCount})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFarmFilter('shared')}
              className={`flex-1 items-center justify-center rounded-full py-2 active:scale-95 ${
                farmFilter === 'shared' ? 'bg-cognac shadow-sm shadow-cognac/30' : 'bg-transparent'
              }`}>
              <Text
                className={`text-xs ${
                  farmFilter === 'shared' ? 'font-black text-white' : 'font-bold text-taupe'
                }`}>
                Shared ({sharedCount})
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ─── Main Content ─── */}
      {isLoadingLayouts && allLayouts.length === 0 ? (
        <FarmLayoutsSkeleton />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}>
          {/* ─── Farm Estate Section ─── */}
          <View className="mb-2.5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Building2 size={16} color="#8C4522" strokeWidth={2.4} />
              <Text className="text-base font-black tracking-tight text-espresso">
                Farm Estate
              </Text>
            </View>
            <Text className="text-xs font-semibold text-taupe">
              Master 3D Blueprint
            </Text>
          </View>

          {/* Farm Estate Full Map Clickable Card */}
          <Pressable
            onPress={() => router.push('/farm/estate')}
            className="overflow-hidden rounded-[26px] border border-cognac/15 bg-white p-3.5 shadow-sm shadow-espresso/5 active:scale-[0.99]">
            {/* Card Header */}
            <View className="mb-2 flex-row items-center justify-between">
              <View className="flex-1 pr-2 flex-row items-center gap-2">
                <Text className="text-[15px] font-bold text-espresso" numberOfLines={1}>
                  {estateRecord?.estate_name || 'Farm Estate'}
                </Text>
                <View className="rounded-full bg-emerald-100 px-2 py-0.5">
                  <Text className="text-[9px] font-black uppercase text-emerald-800">
                    3D Blueprint
                  </Text>
                </View>
              </View>
              <View className="h-6 w-6 items-center justify-center rounded-full bg-cognac/10">
                <Eye size={12} color="#8C4522" strokeWidth={2.4} />
              </View>
            </View>

            {/* Live SVG Map Preview */}
            <View pointerEvents="none" className="items-center justify-center overflow-hidden rounded-2xl bg-champagne py-1">
              <FarmEstateMapPreview
                estateRecord={estateRecord}
                farms={farms}
                allLayouts={allLayouts}
                previewWidth={Math.max(260, width - 68)}
                previewHeight={160}
              />
            </View>

            {/* Card Footer */}
            <View className="mt-3 flex-row items-center justify-between border-t border-black/5 pt-2">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-taupe flex-1 pr-1" numberOfLines={1}>
                {estateRecord?.layout_data?.placedFarms?.length || 0} Farm Area{estateRecord?.layout_data?.placedFarms?.length === 1 ? '' : 's'}
                {' • '}
                {estateRecord?.layout_data?.facilities?.length || 0} Facilit{estateRecord?.layout_data?.facilities?.length === 1 ? 'y' : 'ies'}
              </Text>
              <View className="flex-row items-center gap-1.5">
                <View className="rounded-full bg-cognac/10 px-2.5 py-0.5 border border-cognac/20">
                  <Text className="text-[10px] font-bold text-cognac">Open Estate →</Text>
                </View>
              </View>
            </View>
          </Pressable>

          {/* ─── Divider between Farm Estate and Farm Area ─── */}
          <View className="my-6 flex-row items-center gap-3">
            <View className="h-[1px] flex-1 bg-taupe/20" />
            <View className="h-1.5 w-1.5 rounded-full bg-taupe/30" />
            <View className="h-[1px] flex-1 bg-taupe/20" />
          </View>

          {/* ─── Farm Area Section Header ─── */}
          <View className="mb-3.5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Layers size={16} color="#8C4522" strokeWidth={2.4} />
              <Text className="text-base font-black tracking-tight text-espresso">
                Farm Area
              </Text>
              <View className="rounded-full bg-cognac/10 px-2.5 py-0.5 border border-cognac/20">
                <Text className="text-[11px] font-black text-cognac">
                  {visibleLayouts.length}
                </Text>
              </View>
            </View>
            <Text className="text-xs font-semibold text-taupe">
              3D Layouts & Zones
            </Text>
          </View>

          {visibleLayouts.length > 0 ? (
            <View className="flex-row flex-wrap justify-between gap-y-4">
              {visibleLayouts.map((item) => (
                <FarmAreaCard
                  key={item.farm.id}
                  farm={item.farm}
                  layout={item.layout}
                  activePlans={item.activePlans}
                  cardWidth={cardWidth}
                  onSelect={handleSelectFarm}
                />
              ))}
            </View>
          ) : (
            <View className="mt-12 items-center justify-center rounded-[32px] border border-dashed border-taupe/30 bg-white/60 p-8">
              <View className="mb-4 h-16 w-16 items-center justify-center rounded-3xl bg-cognac/10 border border-cognac/20">
                <Layers size={28} color="#8C4522" strokeWidth={2.2} />
              </View>
              <Text className="text-center text-lg font-black tracking-tight text-espresso">
                No Farm Layouts Found
              </Text>
              <Text className="mt-1.5 max-w-xs text-center text-xs font-medium leading-relaxed text-taupe">
                {farms.length > 0
                  ? 'None of your farms have 3D layouts designed yet. Tap on a farm to start designing plot arrangements.'
                  : 'You have not added any farms yet. Add your first farm to create 3D plot layouts.'}
              </Text>

              <Pressable
                onPress={() => {
                  if (farms.length > 0) {
                    router.push(`/farm/layout-designer/${farms[0].id}`);
                  } else {
                    router.push('/(tabs)/addFarm');
                  }
                }}
                className="mt-6 flex-row items-center gap-2 rounded-full bg-cognac px-6 py-3 shadow-sm shadow-cognac/25 active:scale-95">
                <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />
                <Text className="text-xs font-extrabold tracking-wide text-white">
                  {farms.length > 0 ? 'Design First Layout' : 'Create a Farm'}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}

      {/* ─── Detail 3D Blueprint Modal ─── */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isDetailModalVisible && !!selectedFarmForModal}
        onRequestClose={() => setIsDetailModalVisible(false)}>
        {selectedFarmForModal && (
          <View className="flex-1 items-center justify-center bg-black/60 px-4 py-10">
            <Pressable
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onPress={() => {
                setIsDetailModalVisible(false);
                setModalNavigating(null);
              }}
            />
            <View className="w-full max-w-md flex-1 rounded-3xl border border-taupe/30 bg-champagne p-5 shadow-xl">
              <View className="mb-4 flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-lg font-bold text-espresso" numberOfLines={1}>
                    {selectedFarmForModal.farm.farm_name}
                  </Text>
                  <Text className="text-xs font-medium text-taupe">
                    3D Plot Structure & Succession Plans
                  </Text>
                </View>

                <Pressable
                  onPress={() => {
                    setIsDetailModalVisible(false);
                    setModalNavigating(null);
                  }}
                  hitSlop={8}
                  className="h-8 w-8 items-center justify-center rounded-full bg-taupe/20 active:scale-95">
                  <X size={16} color="#1C120C" strokeWidth={2.2} />
                </Pressable>
              </View>

              {!isModalContentReady ? (
                <View className="flex-1 items-center justify-center py-2">
                  {/* 3D Blueprint Placeholder Skeleton */}
                  <View className="w-full h-[200px] rounded-2xl bg-white/70 items-center justify-center overflow-hidden border border-taupe/20 shadow-sm">
                    <ActivityIndicator size="small" color="#8C4522" />
                    <Text className="mt-2.5 text-[11px] font-bold text-taupe uppercase tracking-wider">
                      Loading Blueprint & Plots...
                    </Text>
                  </View>

                  {/* Plots & Facilities List Placeholder Skeleton */}
                  <View className="mt-4 w-full flex-1 rounded-2xl border border-taupe/20 bg-white/70 p-4 justify-center items-center gap-3 shadow-sm">
                    <View className="w-full h-12 rounded-xl bg-taupe/10 animate-pulse" />
                    <View className="w-full h-12 rounded-xl bg-taupe/10 animate-pulse" />
                    <View className="w-full h-12 rounded-xl bg-taupe/10 animate-pulse" />
                  </View>

                  {/* Buttons Skeleton */}
                  <View className="mt-3 w-full h-12 rounded-2xl bg-emerald-700/30 items-center justify-center" />
                  <View className="mt-2 w-full h-12 rounded-2xl bg-cognac/30 items-center justify-center" />
                </View>
              ) : (() => {
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
                    '#8C4522',
                    '#D99C2B',
                    '#4ECDC4',
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
                      <View className="w-full items-center justify-center overflow-hidden rounded-2xl bg-white py-2 shadow-sm">
                        <FarmLayout3DViewer
                          layout={selectedFarmForModal.layout}
                          width={290}
                          height={165}
                          showLabels={true}
                          plotColors={plotColors}
                        />
                      </View>

                      <View className="mt-3 flex-1 rounded-2xl border border-taupe/20 bg-white p-3.5 shadow-sm">
                        <ScrollView
                          nestedScrollEnabled={true}
                          showsVerticalScrollIndicator={true}
                          contentContainerStyle={{ paddingBottom: 24 }}>
                          <View className="flex-col gap-3 px-1">
                            {Array.isArray(data?.facilities) && data.facilities.length > 0 && (
                              <View className="overflow-hidden rounded-xl border border-sky-200 bg-sky-50/50 p-3 mb-1">
                                <Text className="text-[11px] font-black uppercase tracking-wider text-sky-900 mb-2">
                                  🏢 Master Plan Facilities ({data.facilities.length})
                                </Text>
                                <View className="flex-col gap-1.5">
                                  {data.facilities.map((fac: any) => (
                                    <View
                                      key={fac.id}
                                      className="flex-row items-center justify-between rounded-lg border border-sky-100 bg-white px-3 py-2">
                                      <Text className="text-xs font-bold text-espresso">{fac.name}</Text>
                                      <Text className="text-[10px] font-semibold text-taupe">
                                        {fac.inventories?.length || 0} items stored
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            )}

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
                                    className="overflow-hidden rounded-xl border border-taupe/30 bg-champagne/30">
                                    <Pressable
                                      onPress={() =>
                                        setExpandedLayoutGroups((prev) => ({
                                          ...prev,
                                          [groupIdx]: !prev[groupIdx],
                                        }))
                                      }
                                      className="flex-row items-center justify-between border-b border-cognac/15 p-3 active:bg-champagne/50">
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
                              <View className="overflow-hidden rounded-xl border border-taupe/30 bg-champagne/30">
                                <Pressable
                                  onPress={() => setExpandedUnassigned((prev) => !prev)}
                                  className="flex-row items-center justify-between border-b border-cognac/15 p-3 active:bg-champagne/50">
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
                          </View>
                        </ScrollView>
                      </View>

                      {/* View 2D Master Map Button */}
                      <Pressable
                        disabled={modalNavigating !== null}
                        onPress={() => handleNavigateToMasterMap(selectedFarmForModal.farm.id)}
                        className={`mt-3 w-full flex-row items-center justify-center gap-2 rounded-2xl py-3 shadow-sm active:scale-95 ${
                          modalNavigating === 'map'
                            ? 'bg-emerald-800 opacity-90'
                            : 'bg-emerald-700 shadow-emerald-700/25'
                        }`}>
                        {modalNavigating === 'map' ? (
                          <>
                            <ActivityIndicator size="small" color="#FFFFFF" />
                            <Text className="text-xs font-black uppercase tracking-wider text-white">
                              Opening Master Map...
                            </Text>
                          </>
                        ) : (
                          <>
                            <Layers size={15} color="#FFFFFF" strokeWidth={2.4} />
                            <Text className="text-xs font-black uppercase tracking-wider text-white">
                              View 2D Master Map
                            </Text>
                          </>
                        )}
                      </Pressable>

                      {/* Edit in Designer Button */}
                      <Pressable
                        disabled={modalNavigating !== null}
                        onPress={() => handleNavigateToDesigner(selectedFarmForModal.farm.id)}
                        className={`mt-2 w-full flex-row items-center justify-center gap-2 rounded-2xl py-3 shadow-sm active:scale-95 ${
                          modalNavigating === 'designer'
                            ? 'bg-cognac/80 opacity-90'
                            : 'bg-cognac shadow-cognac/25'
                        }`}>
                        {modalNavigating === 'designer' ? (
                          <>
                            <ActivityIndicator size="small" color="#FFFFFF" />
                            <Text className="text-xs font-extrabold uppercase tracking-wider text-white">
                              Opening Designer...
                            </Text>
                          </>
                        ) : (
                          <Text className="text-xs font-extrabold uppercase tracking-wider text-white">
                            Edit Layout in Designer
                          </Text>
                        )}
                      </Pressable>
                    </>
                  );
                } catch (e) {
                  return (
                    <Text className="text-center text-sm text-red-500">
                      Failed to parse farm blueprint data.
                    </Text>
                  );
                }
              })()}
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}
