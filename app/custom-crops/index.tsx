import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  RefreshControl,
  } from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Plus,
  Search,
  X,
  Pencil,
  Trash2,
  Copy,
  ChevronDown,
  Clock,
  User,
  Layers,
} from 'lucide-react-native';
import { useAuth } from '../../lib/AuthContext';
import {
  Crop,
  getCustomCrops,
  getSystemCrops,
  deleteCustomCrop,
  duplicateCropForCustomization,
} from '../../lib/crop-planner';
import { type PhaseLabel } from '../../lib/todo-list-engine';
import CropAvatar from '../../components/CropAvatar';
import CustomCropModal from '../../components/CustomCropModal';
import { SproutIcon } from '../../components/learning/LearningIcons';
import { useAccessibility } from '../../lib/accessibility';

const CROP_CATEGORIES = [
  'All',
  'Leafy Green',
  'Fruit Vegetable',
  'Herb',
  'Root Crop',
  'Legume',
  'Microgreens',
  'Other',
];

const PHASE_CONFIG: Record<PhaseLabel, { name: string; color: string; bg: string }> = {
  preparation: { name: 'Prep', color: '#1E40AF', bg: 'bg-blue-100 border-blue-300' },
  growth: { name: 'Growth', color: '#047857', bg: 'bg-emerald-100 border-emerald-300' },
  checkup: { name: 'Checkup', color: '#B45309', bg: 'bg-amber-100 border-amber-300' },
  mitigation: { name: 'Mitigation', color: '#DC2626', bg: 'bg-rose-100 border-rose-300' },
};

export default function CustomCropsScreen() {
  const { user } = useAuth();
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();
  const params = useLocalSearchParams<{ search?: string; tab?: 'custom' | 'system' }>();
  const [activeTab, setActiveTab] = useState<'custom' | 'system'>('custom');
  const [customCrops, setCustomCrops] = useState<Crop[]>([]);
  const [systemCrops, setSystemCrops] = useState<Crop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedCropNames, setExpandedCropNames] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (params.search) {
      setSearchQuery(params.search);
      setExpandedCropNames((prev) => ({ ...prev, [params.search as string]: true }));
    }
    if (params.tab && (params.tab === 'custom' || params.tab === 'system')) {
      setActiveTab(params.tab);
    }
  }, [params.search, params.tab]);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCrop, setEditingCrop] = useState<Crop | null>(null);

  const loadCrops = useCallback(async () => {
    try {
      setIsLoading(true);
      const [customList, systemList] = await Promise.all([
        getCustomCrops(user?.id),
        getSystemCrops(),
      ]);
      setCustomCrops(customList || []);
      setSystemCrops(systemList || []);
    } catch (e) {
      console.warn('Failed to load custom/system crops:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCrops();
  }, [loadCrops]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCrops();
  }, [loadCrops]);

  const handleOpenCreate = () => {
    setEditingCrop(null);
    setModalVisible(true);
  };

  const handleOpenEdit = (crop: Crop) => {
    setEditingCrop(crop);
    setModalVisible(true);
  };

  const handleDuplicate = (crop: Crop) => {
    const duplicated = duplicateCropForCustomization(crop);
    setEditingCrop(duplicated);
    setModalVisible(true);
  };

  const handleCopyAndCustomize = (crop: Crop) => {
    const duplicated = duplicateCropForCustomization(crop);
    setEditingCrop(duplicated);
    setModalVisible(true);
  };

  const handleDelete = (crop: Crop) => {
    Alert.alert(
      'Delete Custom Crop',
      `Are you sure you want to delete "${crop.crop}"? This will remove it from your personal crop catalog.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCustomCrop(crop.crop, user?.id);
              setCustomCrops((prev: Crop[]) => prev.filter((c: Crop) => c.crop !== crop.crop));
              Alert.alert('Deleted', `"${crop.crop}" was removed from your custom catalog.`);
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not delete crop.');
            }
          },
        },
      ]
    );
  };

  const toggleExpand = (cropName: string) => {
    setExpandedCropNames((prev: Record<string, boolean>) => ({
      ...prev,
      [cropName]: !prev[cropName],
    }));
  };

  // Filter & Search Logic
  const activeCropList = activeTab === 'custom' ? customCrops : systemCrops;

  const filteredCrops = activeCropList.filter((c: Crop) => {
    const matchesCategory =
      selectedCategory === 'All' ||
      (c.type || '').toLowerCase() === selectedCategory.toLowerCase();

    const q = searchQuery.trim().toLowerCase();
    if (!q) return matchesCategory;

    const matchesName = (c.crop || '').toLowerCase().includes(q);
    const matchesLocal = (c.local_name || '').toLowerCase().includes(q);
    const matchesNotes = (c.notes || '').toLowerCase().includes(q);
    const matchesBenefit = (c.soil_benefit || '').toLowerCase().includes(q);

    return matchesCategory && (matchesName || matchesLocal || matchesNotes || matchesBenefit);
  });

  return (
    <View className="flex-1 bg-champagne">
      {/* Header */}
      <View className="border-b border-cognac/15 bg-champagne px-5 pt-14 pb-4 shadow-xs">
        {/* Top Header Row */}
        <View className="flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center gap-3 mr-2">
            <Pressable
              onPress={() => {
                triggerHaptic('light');
                router.back();
              }}
              hitSlop={isGloveMode ? 10 : 8}
              className={`shrink-0 items-center justify-center rounded-2xl border border-cognac/20 bg-cognac/10 active:scale-95 ${
                isGloveMode ? 'h-12 w-12' : 'h-10 w-10'
              }`}>
              <ArrowLeft size={isGloveMode ? 22 : 20} color="#8C4522" strokeWidth={2.2} />
            </Pressable>
            <View className="flex-1 flex-row items-center gap-2">
              <Text
                style={{ fontSize: Math.round(20 * fontScale) }}
                className={`font-black shrink ${
                  isHighContrast ? 'text-black' : 'text-espresso'
                }`}
                numberOfLines={1}>
                {activeTab === 'custom' ? 'Custom Crops' : 'System Catalog'}
              </Text>
              <View
                style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}
                className="rounded-full border border-cognac/25 bg-cognac/10 px-2 py-0.5 shrink-0">
                <Text
                  style={{ fontSize: Math.round(11 * fontScale) }}
                  className={`font-black ${isHighContrast ? 'text-black' : 'text-cognac'}`}>
                  {activeCropList.length}
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              handleOpenCreate();
            }}
            style={[{ flexShrink: 0 }, isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined]}
            className={`flex-row items-center gap-1.5 rounded-2xl bg-cognac shadow-sm shadow-cognac/30 active:scale-95 ${
              isGloveMode ? 'px-4 py-3' : 'px-3.5 py-2.5'
            }`}>
            <Plus size={isGloveMode ? 18 : 16} color="#FFFFFF" strokeWidth={2.8} />
            <Text
              style={{ fontSize: Math.round(12 * fontScale), flexShrink: 0 }}
              className="font-black text-white"
              numberOfLines={1}>
              Add Crop
            </Text>
          </Pressable>
        </View>

        {/* Subtitle description */}
        <Text
          style={{ fontSize: Math.round(12 * fontScale) }}
          className={`mt-2 font-medium ${isHighContrast ? 'text-black/80' : 'text-taupe'}`}
          numberOfLines={1}>
          {activeTab === 'custom'
            ? 'Personal catalog & custom milestone protocols'
            : 'Standard agronomic library & care templates'}
        </Text>

        {/* Search Bar */}
        <View
          style={isHighContrast ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}
          className={`mt-4 flex-row items-center rounded-2xl border border-cognac/25 bg-white px-3.5 shadow-xs shadow-cognac/5 ${
            isGloveMode ? 'py-3.5 min-h-[50px]' : 'py-2.5'
          }`}>
          <Search size={isGloveMode ? 18 : 16} color="#8C4522" strokeWidth={2.2} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            maxLength={255}
            placeholder={
              activeTab === 'custom'
                ? 'Search custom crops by name or variety...'
                : 'Search system crops to copy & customize...'
            }
            placeholderTextColor="#8C7C70"
            style={{ fontSize: Math.round(14 * fontScale) }}
            className="ml-2.5 flex-1 font-semibold text-espresso"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => {
                triggerHaptic('light');
                setSearchQuery('');
              }}
              hitSlop={isGloveMode ? 8 : 4}
              className="rounded-full bg-cognac/10 p-1">
              <X size={14} color="#8C4522" strokeWidth={2.5} />
            </Pressable>
          )}
        </View>

        {/* Catalog Mode Segmented Toggle */}
        <View
          style={isHighContrast ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}
          className="mt-3.5 flex-row items-center rounded-full border border-cognac/20 bg-black/5 p-1">
          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              setActiveTab('custom');
            }}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-full active:scale-[0.98] ${
              isGloveMode ? 'py-3' : 'py-2'
            } ${
              activeTab === 'custom'
                ? isHighContrast
                  ? 'bg-black'
                  : 'bg-cognac shadow-sm shadow-cognac/30'
                : ''
            }`}>
            <User size={13} color={activeTab === 'custom' ? '#FFFFFF' : isHighContrast ? '#000000' : '#8C7C70'} />
            <Text
              style={{ fontSize: Math.round(12 * fontScale) }}
              className={`${
                activeTab === 'custom'
                  ? 'font-black text-white'
                  : isHighContrast
                  ? 'font-extrabold text-black'
                  : 'font-bold text-taupe'
              }`}>
              My Custom Crops ({customCrops.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('selection');
              setActiveTab('system');
            }}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-full active:scale-[0.98] ${
              isGloveMode ? 'py-3' : 'py-2'
            } ${
              activeTab === 'system'
                ? isHighContrast
                  ? 'bg-black'
                  : 'bg-cognac shadow-sm shadow-cognac/30'
                : ''
            }`}>
            <Layers size={13} color={activeTab === 'system' ? '#FFFFFF' : isHighContrast ? '#000000' : '#8C7C70'} />
            <Text
              style={{ fontSize: Math.round(12 * fontScale) }}
              className={`${
                activeTab === 'system'
                  ? 'font-black text-white'
                  : isHighContrast
                  ? 'font-extrabold text-black'
                  : 'font-bold text-taupe'
              }`}>
              System Catalog ({systemCrops.length})
            </Text>
          </Pressable>
        </View>

        {/* Category Filter Pills */}
        <View className="mt-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-1.5">
              {CROP_CATEGORIES.map((category) => {
                const isSelected = selectedCategory === category;
                return (
                  <Pressable
                    key={category}
                    onPress={() => {
                      triggerHaptic('selection');
                      setSelectedCategory(category);
                    }}
                    style={
                      isHighContrast
                        ? {
                            borderWidth: 2,
                            borderColor: isSelected ? '#000000' : '#444444',
                            backgroundColor: isSelected ? '#000000' : '#FFFFFF',
                          }
                        : undefined
                    }
                    className={`rounded-full border active:scale-95 ${
                      isGloveMode ? 'min-h-[44px] px-4 py-2.5 justify-center' : 'px-3.5 py-1.5'
                    } ${
                      isHighContrast
                        ? ''
                        : isSelected
                        ? 'border-cognac bg-cognac shadow-sm shadow-cognac/30'
                        : 'border-cognac/20 bg-white/90'
                    }`}>
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className={`${
                        isSelected
                          ? 'font-black text-white'
                          : isHighContrast
                          ? 'font-extrabold text-black'
                          : 'font-bold text-espresso'
                      }`}>
                      {category}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Main List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#8C4522"
            colors={['#8C4522']}
          />
        }>
        {/* Empty State */}
        {filteredCrops.length === 0 && !isLoading && (
          <View className="items-center justify-center rounded-[28px] border-2 border-dashed border-cognac/30 bg-white/80 py-14 px-6 text-center shadow-sm shadow-cognac/5">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-3xl border border-cognac/25 bg-cognac/10 shadow-inner">
              <SproutIcon size={32} color="#8C4522" />
            </View>
            <Text className="text-lg font-black text-espresso">
              {searchQuery || selectedCategory !== 'All'
                ? `No matching ${activeTab === 'custom' ? 'custom' : 'system'} crops`
                : activeTab === 'custom'
                ? 'No custom crops yet'
                : 'No system crops found'}
            </Text>
            <Text className="mt-1.5 text-center text-sm leading-5 text-taupe max-w-xs">
              {searchQuery || selectedCategory !== 'All'
                ? 'Try adjusting your search terms or selecting a different category filter.'
                : activeTab === 'custom'
                ? 'Create custom crops from scratch, or browse the System Catalog to copy & customize existing varieties.'
                : 'Standard system crops could not be loaded.'}
            </Text>

            {searchQuery || selectedCategory !== 'All' ? (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                }}
                className="mt-5 rounded-full border border-cognac/25 bg-cognac/10 px-4 py-2.5 active:scale-95">
                <Text className="text-xs font-bold text-cognac">Reset Filters</Text>
              </Pressable>
            ) : activeTab === 'custom' ? (
              <View className="mt-6 flex-row flex-wrap items-center justify-center gap-3">
                <Pressable
                  onPress={handleOpenCreate}
                  className="flex-row items-center gap-2 rounded-full bg-cognac px-5 py-3 shadow-md shadow-cognac/30 active:scale-95">
                  <Plus size={16} color="#FFFFFF" strokeWidth={2.8} />
                  <Text className="text-xs font-black text-white">Create Blank Crop</Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab('system')}
                  className="flex-row items-center gap-2 rounded-full border border-cognac/30 bg-cognac/5 px-5 py-3 active:scale-95">
                  <Layers size={15} color="#8C4522" />
                  <Text className="text-xs font-bold text-cognac">Browse System Catalog</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        {/* Crops Cards */}
        {filteredCrops.map((crop: Crop) => {
          const isExpanded = !!expandedCropNames[crop.crop];
          const milestones = crop.milestones || [];
          const isCustom = crop.is_custom ?? activeTab === 'custom';

          return (
            <View
              key={`${activeTab}-${crop.crop}`}
              style={isHighContrast ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}
              className="mb-4 overflow-hidden rounded-[28px] border border-cognac/15 bg-white p-5 shadow-sm shadow-espresso/5">
              {/* Level 1: Header (Avatar + Title & Subtitle + Category Tag) */}
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1 flex-row items-center gap-3.5">
                  <CropAvatar crop={crop} size="lg" />
                  <View className="flex-1">
                    <Text
                      style={{ fontSize: Math.round(17 * fontScale) }}
                      className={`font-black tracking-tight ${
                        isHighContrast ? 'text-black' : 'text-espresso'
                      }`}
                      numberOfLines={1}>
                      {crop.crop}
                    </Text>
                    <View className="mt-0.5 flex-row items-center flex-wrap">
                      {crop.local_name ? (
                        <>
                          <Text
                            style={{ fontSize: Math.round(12 * fontScale) }}
                            className="font-bold text-cognac"
                            numberOfLines={1}>
                            {crop.local_name}
                          </Text>
                          <Text className="mx-1.5 text-xs text-taupe/60">•</Text>
                        </>
                      ) : null}
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`font-semibold ${isHighContrast ? 'text-black/80' : 'text-taupe'}`}
                        numberOfLines={1}>
                        {crop.type}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Custom / System Pill Tag */}
                {isCustom ? (
                  <View
                    style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}
                    className="flex-row items-center gap-1 rounded-full border border-cognac/25 bg-cognac/10 px-2.5 py-1">
                    <User size={10} color={isHighContrast ? '#000000' : '#8C4522'} strokeWidth={2.4} />
                    <Text
                      style={{ fontSize: Math.round(10 * fontScale) }}
                      className={`font-black uppercase tracking-wider ${
                        isHighContrast ? 'text-black' : 'text-cognac'
                      }`}>
                      Custom
                    </Text>
                  </View>
                ) : (
                  <View
                    style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}
                    className="flex-row items-center gap-1 rounded-full border border-cognac/15 bg-champagne px-2.5 py-1">
                    <Layers size={10} color={isHighContrast ? '#000000' : '#8C7C70'} strokeWidth={2.2} />
                    <Text
                      style={{ fontSize: Math.round(10 * fontScale) }}
                      className={`font-extrabold uppercase tracking-wider ${
                        isHighContrast ? 'text-black' : 'text-taupe'
                      }`}>
                      System
                    </Text>
                  </View>
                )}
              </View>

              {/* Level 2: Agronomic Inset Tray (Maturity, Season, Nitrogen) */}
              <View className="mt-4 flex-row items-center justify-between rounded-[20px] border border-cognac/15 bg-cognac/[0.04] px-4 py-3">
                {/* Maturity */}
                <View className="flex-1 items-start">
                  <Text className="text-[9px] font-extrabold uppercase tracking-wider text-cognac">
                    Maturity
                  </Text>
                  <Text className="mt-0.5 text-sm font-black text-espresso">
                    {crop.maturity_days} Days
                  </Text>
                </View>

                <View className="h-7 w-px bg-cognac/15 mx-2" />

                {/* Season */}
                <View className="flex-1 items-center">
                  <Text className="text-[9px] font-extrabold uppercase tracking-wider text-taupe">
                    Season
                  </Text>
                  <Text className="mt-0.5 text-xs font-bold text-espresso" numberOfLines={1}>
                    {crop.season || 'All Year'}
                  </Text>
                </View>

                <View className="h-7 w-px bg-cognac/15 mx-2" />

                {/* Nitrogen */}
                <View className="flex-1 items-end">
                  <Text className="text-[9px] font-extrabold uppercase tracking-wider text-taupe">
                    Nitrogen
                  </Text>
                  <Text className="mt-0.5 text-xs font-bold text-espresso" numberOfLines={1}>
                    {crop.nitrogen_demand || 'Normal'} N
                  </Text>
                </View>
              </View>

              {/* Level 3: Benefits / Notes Callout */}
              {(crop.soil_benefit || crop.notes) && (
                <View className="mt-3 flex-row items-start gap-2.5 rounded-2xl border border-cognac/10 bg-champagne/80 p-3">
                  <View className="h-6 w-6 items-center justify-center rounded-lg bg-cognac/10 shrink-0 mt-0.5">
                    <SproutIcon size={13} color="#8C4522" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[9px] font-black uppercase tracking-wider text-cognac">
                      {crop.soil_benefit ? 'Soil Benefit' : 'Agronomic Note'}
                    </Text>
                    <Text className="mt-0.5 text-xs font-medium leading-relaxed text-espresso/85" numberOfLines={2}>
                      {crop.soil_benefit || crop.notes}
                    </Text>
                  </View>
                </View>
              )}

              {/* Level 4: Milestones Protocol Accordion */}
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  toggleExpand(crop.crop);
                }}
                style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                className={`mt-3 flex-row items-center justify-between rounded-xl border border-cognac/15 bg-cognac/5 active:bg-cognac/10 ${
                  isGloveMode ? 'px-4 py-3' : 'px-3.5 py-2.5'
                }`}>
                <View className="flex-row items-center gap-2">
                  <Clock size={14} color="#8C4522" strokeWidth={2.2} />
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className="font-bold text-espresso">
                    {milestones.length} Milestone Protocols
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text
                    style={{ fontSize: Math.round(11 * fontScale) }}
                    className="font-extrabold text-cognac">
                    {isExpanded ? 'Hide Schedule' : 'View Schedule'}
                  </Text>
                  <ChevronDown
                    size={14}
                    color="#8C4522"
                    strokeWidth={2.4}
                    style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                  />
                </View>
              </Pressable>

              {/* Expanded Milestones Timeline */}
              {isExpanded && (
                <View className="mt-2.5 rounded-2xl border border-cognac/15 bg-cognac/[0.02] p-4">
                  <Text
                    style={{ fontSize: Math.round(10 * fontScale) }}
                    className="mb-3 font-black uppercase tracking-wider text-cognac">
                    Growth Schedule ({crop.maturity_days} Days)
                  </Text>
                  <View className="border-l-2 border-cognac/25 pl-3.5 ml-1.5">
                    {milestones.map((m, idx) => {
                      const phaseObj =
                        PHASE_CONFIG[m.label as PhaseLabel] || PHASE_CONFIG.growth;

                      return (
                        <View key={`m-${idx}-${m.offset_days}`} className="relative mb-3.5 last:mb-1">
                          <View className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-cognac" />
                          <View className="flex-row items-center gap-2">
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="font-black text-cognac">
                              Day {m.offset_days}
                            </Text>
                            <View className={`rounded-md px-1.5 py-0.5 border ${phaseObj.bg}`}>
                              <Text
                                style={{ color: phaseObj.color, fontSize: Math.round(9 * fontScale) }}
                                className="font-bold uppercase">
                                {phaseObj.name}
                              </Text>
                            </View>
                          </View>
                          <Text
                            style={{ fontSize: Math.round(12 * fontScale) }}
                            className="font-bold text-espresso mt-1">
                            {m.title}
                          </Text>
                          {m.description ? (
                            <Text
                              style={{ fontSize: Math.round(11 * fontScale) }}
                              className="text-taupe mt-0.5 leading-snug">
                              {m.description}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Level 5: Action Toolbar */}
              <View className="mt-4 flex-row items-center justify-between border-t border-cognac/10 pt-3.5">
                {isCustom || activeTab === 'custom' ? (
                  <>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('warning');
                        handleDelete(crop);
                      }}
                      hitSlop={isGloveMode ? 6 : 4}
                      style={isGloveMode ? { minHeight: 46, justifyContent: 'center' } : undefined}
                      className="flex-row items-center gap-1.5 rounded-xl px-2.5 py-2 active:bg-rose-50">
                      <Trash2 size={13} color="#DC2626" />
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className="font-bold text-rose-600">
                        Delete
                      </Text>
                    </Pressable>

                    <View className="flex-row items-center gap-2">
                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          handleDuplicate(crop);
                        }}
                        style={isGloveMode ? { minHeight: 46, justifyContent: 'center' } : undefined}
                        className="flex-row items-center gap-1.5 rounded-xl border border-cognac/20 bg-cognac/5 px-3.5 py-2 active:bg-cognac/10">
                        <Copy size={13} color="#8C4522" />
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="font-bold text-cognac">
                          Duplicate
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          handleOpenEdit(crop);
                        }}
                        style={isGloveMode ? { minHeight: 46, justifyContent: 'center' } : undefined}
                        className="flex-row items-center gap-1.5 rounded-xl bg-cognac px-4 py-2 shadow-xs shadow-cognac/30 active:scale-95">
                        <Pencil size={13} color="#FFFFFF" strokeWidth={2.2} />
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="font-bold text-white">
                          Edit
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View className="w-full flex-row items-center justify-end">
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        handleCopyAndCustomize(crop);
                      }}
                      style={isGloveMode ? { minHeight: 50, justifyContent: 'center' } : undefined}
                      className="flex-row items-center gap-2 rounded-xl bg-cognac px-4 py-2.5 shadow-sm shadow-cognac/30 active:scale-95">
                      <Copy size={14} color="#FFFFFF" strokeWidth={2.2} />
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className="font-black text-white">
                        Copy & Customize
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Reusable 2-Step Custom Crop Modal */}
      <CustomCropModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingCrop(null);
        }}
        editCrop={editingCrop}
        userId={user?.id}
        onSaved={() => {
          loadCrops();
          setActiveTab('custom');
        }}
        onDeleted={(cropName: string) => {
          setCustomCrops((prev: Crop[]) => prev.filter((c: Crop) => c.crop !== cropName));
        }}
      />
    </View>
  );
}
