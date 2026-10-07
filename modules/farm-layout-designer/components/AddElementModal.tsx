import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Modal, KeyboardAvoidingView } from '../../../components/common/AppModal';
import {
  X,
  Wrench,
  FlaskConical,
  Sprout,
  Recycle,
  Home,
  Egg,
  Building2,
  Sparkles,
  ShieldAlert,
  Leaf,
  Plus,
  Package,
  Layers,
} from 'lucide-react-native';
import {
  FACILITY_TEMPLATES,
  ZONE_TEMPLATES,
  PLOT_TEMPLATES,
  type FacilityTemplate,
  type ZoneTemplate,
  type PlotTemplate,
} from '../constants';
import { getAvailableFarmsForImport } from '../db';
import type { AvailableFarmForImport, FacilityFunction } from '../types';

type AddElementModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelectFacility: (template: FacilityTemplate, customName?: string, customFunction?: FacilityFunction) => void;
  onSelectZone: (template: ZoneTemplate, customName?: string) => void;
  onSelectPlot?: (widthM: number, heightM: number, label?: string) => void;
  onImportFarmLayout?: (importedFarm: AvailableFarmForImport) => void;
  currentFarmId?: string;
  isMasterLayout?: boolean;
};

export function AddElementModal({
  visible,
  onClose,
  onSelectFacility,
  onSelectZone,
  onSelectPlot,
  onImportFarmLayout,
  currentFarmId,
  isMasterLayout = true,
}: AddElementModalProps) {
  const [activeTab, setActiveTab] = useState<'facility' | 'zone' | 'plot' | 'import'>(
    isMasterLayout ? 'facility' : 'zone'
  );
  const [customFacilityName, setCustomFacilityName] = useState('');
  const [customFacilityFunction, setCustomFacilityFunction] = useState<FacilityFunction>('inventory');
  const [customZoneName, setCustomZoneName] = useState('');
  const [customPlotLabel, setCustomPlotLabel] = useState('');
  const [customPlotWidth, setCustomPlotWidth] = useState('2');
  const [customPlotLength, setCustomPlotLength] = useState('1');

  const [availableFarms, setAvailableFarms] = useState<AvailableFarmForImport[]>([]);
  const [isLoadingFarms, setIsLoadingFarms] = useState(false);

  useEffect(() => {
    if (visible) {
      if (!isMasterLayout) {
        if (activeTab === 'import') {
          setActiveTab('facility');
        }
      }
    }
  }, [visible, isMasterLayout, activeTab]);

  useEffect(() => {
    if (visible && currentFarmId && isMasterLayout) {
      setIsLoadingFarms(true);
      getAvailableFarmsForImport(currentFarmId)
        .then((farms) => setAvailableFarms(farms))
        .catch((err) => console.warn('[AddElementModal] Failed to load farms for import:', err))
        .finally(() => setIsLoadingFarms(false));
    }
  }, [visible, currentFarmId, isMasterLayout]);

  const getIcon = (iconName: string, color = '#FFFFFF') => {
    switch (iconName) {
      case 'wrench':
        return <Wrench size={20} color={color} strokeWidth={2.4} />;
      case 'flask':
        return <FlaskConical size={20} color={color} strokeWidth={2.4} />;
      case 'sprout':
        return <Sprout size={20} color={color} strokeWidth={2.4} />;
      case 'recycle':
        return <Recycle size={20} color={color} strokeWidth={2.4} />;
      case 'home':
        return <Home size={20} color={color} strokeWidth={2.4} />;
      case 'egg':
        return <Egg size={20} color={color} strokeWidth={2.4} />;
      case 'package':
        return <Package size={20} color={color} strokeWidth={2.4} />;
      default:
        return <Building2 size={20} color={color} strokeWidth={2.4} />;
    }
  };

  const handleAddCustomFacility = () => {
    const genericTemplate = FACILITY_TEMPLATES[0]; // Generic Facility
    // Security & Data Integrity: enforce 255 char limit
    const finalName = customFacilityName.trim().slice(0, 255) || undefined;
    onSelectFacility(genericTemplate, finalName, customFacilityFunction);
    setCustomFacilityName('');
    setCustomFacilityFunction('inventory');
    onClose();
  };

  const handleAddCustomZone = () => {
    const genericTemplate = ZONE_TEMPLATES[0]; // Generic Zone
    // Security & Data Integrity: enforce 255 char limit
    const finalName = customZoneName.trim().slice(0, 255) || undefined;
    onSelectZone(genericTemplate, finalName);
    setCustomZoneName('');
    onClose();
  };

  const handleAddCustomPlot = () => {
    const w = Math.max(0.5, parseFloat(customPlotWidth) || 2);
    const h = Math.max(0.5, parseFloat(customPlotLength) || 1);
    // Security & Data Integrity: enforce 255 char limit
    const finalLabel = customPlotLabel.trim().slice(0, 255) || undefined;
    if (onSelectPlot) {
      onSelectPlot(w, h, finalLabel);
    }
    setCustomPlotLabel('');
    setCustomPlotWidth('2');
    setCustomPlotLength('1');
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-1 justify-end bg-black/50">
          <Pressable className="flex-1" onPress={onClose} />

          <View className="max-h-[85%] rounded-t-[32px] border-t border-taupe/20 bg-champagne pb-8 pt-4 shadow-2xl">
            {/* Handle */}
            <View className="self-center h-1.5 w-12 rounded-full bg-taupe/30 mb-3" />

            {/* Header */}
            <View className="flex-row items-center justify-between px-6 pb-3 border-b border-taupe/15">
              <View>
                <Text className="text-xl font-black text-espresso tracking-tight">
                  {isMasterLayout ? 'Add Estate Element' : 'Add Farm Area Element'}
                </Text>
                <Text className="text-xs font-semibold text-taupe">
                  {isMasterLayout
                    ? 'Add facilities, environmental zones, planting beds, or import farm layouts'
                    : 'Add environmental zones, micro-climates, or planting bed plots'}
                </Text>
              </View>

              <Pressable
                onPress={onClose}
                hitSlop={12}
                className="h-9 w-9 items-center justify-center rounded-full bg-taupe/15 active:scale-95">
                <X size={18} color="#1C120C" strokeWidth={2.4} />
              </Pressable>
            </View>

            {/* Tabs */}
            <View className="flex-row mx-6 mt-4 p-1 rounded-2xl bg-taupe/15">
              <Pressable
                onPress={() => setActiveTab('facility')}
                className={`flex-1 py-2 rounded-xl items-center active:scale-98 ${
                  activeTab === 'facility' ? 'bg-white shadow-xs' : 'bg-transparent'
                }`}>
                <Text
                  className={`text-[11px] font-bold ${
                    activeTab === 'facility' ? 'text-espresso' : 'text-taupe'
                  }`}>
                  🏢 Facilities
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('zone')}
                className={`flex-1 py-2 rounded-xl items-center active:scale-98 ${
                  activeTab === 'zone' ? 'bg-white shadow-xs' : 'bg-transparent'
                }`}>
                <Text
                  className={`text-[11px] font-bold ${
                    activeTab === 'zone' ? 'text-espresso' : 'text-taupe'
                  }`}>
                  🌿 Zones
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('plot')}
                className={`flex-1 py-2 rounded-xl items-center active:scale-98 ${
                  activeTab === 'plot' ? 'bg-white shadow-xs' : 'bg-transparent'
                }`}>
                <Text
                  className={`text-[11px] font-bold ${
                    activeTab === 'plot' ? 'text-espresso' : 'text-taupe'
                  }`}>
                  🌱 Plots
                </Text>
              </Pressable>

              {isMasterLayout && (
                <Pressable
                  onPress={() => setActiveTab('import')}
                  className={`flex-1 py-2 rounded-xl items-center active:scale-98 ${
                    activeTab === 'import' ? 'bg-white shadow-xs' : 'bg-transparent'
                  }`}>
                  <Text
                    className={`text-[11px] font-bold ${
                      activeTab === 'import' ? 'text-espresso' : 'text-taupe'
                    }`}>
                    📥 Import
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Tab Content List */}
            <ScrollView
              className="px-6 pt-4"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 44 }}>
            {activeTab === 'facility' ? (
              <View className="gap-3">
                {/* Custom / Generic Facility Quick Creator */}
                <View className="rounded-2xl border border-dashed border-cognac/50 bg-white/70 p-3.5 shadow-xs">
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-xs font-black text-espresso uppercase tracking-wider">
                      ✨ Custom / Generic Facility
                    </Text>
                    <Text className="text-[10px] font-semibold text-taupe">
                      Type name or leave blank
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <TextInput
                      value={customFacilityName}
                      onChangeText={setCustomFacilityName}
                      maxLength={255}
                      placeholder="e.g. Mushroom Shed, Tool Station..."
                      placeholderTextColor="#A9927D"
                      onSubmitEditing={handleAddCustomFacility}
                      className="flex-1 rounded-xl border border-taupe/20 bg-champagne/40 px-3 py-2 text-xs font-semibold text-espresso"
                    />
                    <Pressable
                      onPress={handleAddCustomFacility}
                      className="items-center justify-center rounded-xl bg-cognac px-4 py-2 shadow-xs active:scale-95">
                      <Text className="text-xs font-bold text-white">+ Add</Text>
                    </Pressable>
                  </View>

                  {/* Function Selector for Custom Facility */}
                  <View className="mt-2.5">
                    <Text className="text-[10px] font-bold text-taupe uppercase mb-1">
                      Facility Function / Role:
                    </Text>
                    <View className="flex-row gap-1.5">
                      {(['inventory', 'time_keeping', 'both'] as FacilityFunction[]).map((fn) => {
                        const isSelected = customFacilityFunction === fn;
                        const label =
                          fn === 'inventory'
                            ? '📦 Inventory'
                            : fn === 'time_keeping'
                            ? '⏱️ Time Keeping'
                            : '🔄 Both';
                        return (
                          <Pressable
                            key={fn}
                            onPress={() => setCustomFacilityFunction(fn)}
                            className={`flex-1 py-1.5 px-2 rounded-xl items-center border ${
                              isSelected
                                ? 'bg-cognac border-cognac shadow-xs'
                                : 'bg-white border-taupe/20'
                            }`}>
                            <Text
                              className={`text-[10px] font-extrabold ${
                                isSelected ? 'text-white' : 'text-espresso'
                              }`}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {/* Preset Facility Cards */}
                {FACILITY_TEMPLATES.map((item, idx) => {
                  const isTimeKeeping = item.facilityFunction === 'time_keeping';
                  const isBoth = item.facilityFunction === 'both';

                  return (
                    <Pressable
                      key={`facility-${idx}`}
                      onPress={() => {
                        onSelectFacility(item);
                        onClose();
                      }}
                      className="flex-row items-center justify-between rounded-2xl border border-white/90 bg-white p-3.5 shadow-xs shadow-espresso/5 active:scale-[0.98]">
                      <View className="flex-row items-center gap-3.5 flex-1 pr-2">
                        <View
                          style={{ backgroundColor: item.color }}
                          className="h-12 w-12 items-center justify-center rounded-2xl shadow-xs">
                          {getIcon(item.icon)}
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5 flex-wrap">
                            <Text className="text-sm font-black text-espresso">
                              {item.name}
                            </Text>
                            <View
                              className={`rounded px-1.5 py-0.5 border ${
                                isTimeKeeping
                                  ? 'bg-indigo-50 border-indigo-200'
                                  : isBoth
                                  ? 'bg-emerald-50 border-emerald-200'
                                  : 'bg-amber-50 border-amber-200'
                              }`}>
                              <Text
                                className={`text-[9px] font-black uppercase ${
                                  isTimeKeeping
                                    ? 'text-indigo-800'
                                    : isBoth
                                    ? 'text-emerald-800'
                                    : 'text-amber-800'
                                }`}>
                                {isTimeKeeping
                                  ? '⏱️ Time Keeping'
                                  : isBoth
                                  ? '🔄 Both'
                                  : '📦 Inventory'}
                              </Text>
                            </View>
                          </View>
                          <Text className="text-xs font-semibold text-taupe mt-0.5">
                            {item.defaultWidthM}m × {item.defaultHeightM}m • {item.initialItems.length} default supplies
                          </Text>
                        </View>
                      </View>

                      <View className="h-8 w-8 items-center justify-center rounded-full bg-cognac/10">
                        <Plus size={16} color="#8C4522" strokeWidth={2.6} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : activeTab === 'zone' ? (
              <View className="gap-3">
                {/* Custom / Generic Zone Quick Creator */}
                <View className="rounded-2xl border border-dashed border-cognac/50 bg-white/70 p-3.5 shadow-xs">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-xs font-black text-espresso uppercase tracking-wider">
                      ✨ Custom / Generic Zone
                    </Text>
                    <Text className="text-[10px] font-semibold text-taupe">
                      Type name or leave blank
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <TextInput
                      value={customZoneName}
                      onChangeText={setCustomZoneName}
                      maxLength={255}
                      placeholder="e.g. North Field, Nursery Zone..."
                      placeholderTextColor="#A9927D"
                      onSubmitEditing={handleAddCustomZone}
                      className="flex-1 rounded-xl border border-taupe/20 bg-champagne/40 px-3 py-2 text-xs font-semibold text-espresso"
                    />
                    <Pressable
                      onPress={handleAddCustomZone}
                      className="items-center justify-center rounded-xl bg-cognac px-4 py-2 shadow-xs active:scale-95">
                      <Text className="text-xs font-bold text-white">+ Add</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Preset Zone Cards */}
                {ZONE_TEMPLATES.map((item, idx) => {
                  const isGreenhouse = item.zoneType === 'greenhouse';
                  const isInConversion = item.organicStatus === 'in_conversion';

                  return (
                    <Pressable
                      key={`zone-${idx}`}
                      onPress={() => {
                        onSelectZone(item);
                        onClose();
                      }}
                      className="flex-row items-center justify-between rounded-2xl border border-white/90 bg-white p-3.5 shadow-xs shadow-espresso/5 active:scale-[0.98]">
                      <View className="flex-row items-center gap-3.5 flex-1 pr-2">
                        <View
                          style={{
                            backgroundColor: isGreenhouse ? '#2D6A4F' : (isInConversion ? '#D97706' : item.color),
                          }}
                          className="h-12 w-12 items-center justify-center rounded-2xl shadow-xs">
                          {isGreenhouse ? (
                            <Sparkles size={20} color="#FFFFFF" strokeWidth={2.4} />
                          ) : isInConversion ? (
                            <ShieldAlert size={20} color="#FFFFFF" strokeWidth={2.4} />
                          ) : (
                            <Leaf size={20} color="#FFFFFF" strokeWidth={2.4} />
                          )}
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-sm font-black text-espresso">
                              {item.name}
                            </Text>
                            <View
                              style={{
                                backgroundColor: isGreenhouse ? '#DCFCE7' : (isInConversion ? '#FEF3C7' : '#E0E7FF'),
                              }}
                              className="rounded px-1.5 py-0.5">
                              <Text
                                style={{
                                  color: isGreenhouse ? '#15803D' : (isInConversion ? '#B45309' : '#3730A3'),
                                }}
                                className="text-[9px] font-black uppercase">
                                {item.code}
                              </Text>
                            </View>
                          </View>
                          <Text className="text-xs font-semibold text-taupe mt-0.5">
                            {item.defaultWidthM}m × {item.defaultHeightM}m • {isInConversion ? 'Non-organic transition' : isGreenhouse ? 'Controlled environment' : 'Open field'}
                          </Text>
                        </View>
                      </View>

                      <View className="h-8 w-8 items-center justify-center rounded-full bg-cognac/10">
                        <Plus size={16} color="#8C4522" strokeWidth={2.6} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : activeTab === 'plot' ? (
              <View className="gap-3">
                {/* Custom Plot / Bed Dimensions Creator */}
                <View className="rounded-2xl border border-dashed border-cognac/50 bg-white/70 p-3.5 shadow-xs">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-xs font-black text-espresso uppercase tracking-wider">
                      ✨ Custom Bed / Plot Dimensions
                    </Text>
                    <Text className="text-[10px] font-semibold text-taupe">
                      Specify meters
                    </Text>
                  </View>
                  <View className="mb-2">
                    <TextInput
                      value={customPlotLabel}
                      onChangeText={setCustomPlotLabel}
                      maxLength={255}
                      placeholder="Plot Label (optional, e.g. Bed 4, Herb Garden)"
                      placeholderTextColor="#A9927D"
                      className="rounded-xl border border-taupe/20 bg-champagne/40 px-3 py-2 text-xs font-semibold text-espresso"
                    />
                  </View>
                  <View className="flex-row gap-2 items-center">
                    <View className="flex-1 flex-row items-center gap-1 rounded-xl border border-taupe/20 bg-champagne/40 px-2.5 py-1.5">
                      <Text className="text-[10px] font-bold text-taupe uppercase">W (m):</Text>
                      <TextInput
                        value={customPlotWidth}
                        onChangeText={setCustomPlotWidth}
                        keyboardType="decimal-pad"
                        maxLength={10}
                        placeholder="2"
                        placeholderTextColor="#A9927D"
                        className="flex-1 text-xs font-black text-espresso p-0"
                      />
                    </View>
                    <View className="flex-1 flex-row items-center gap-1 rounded-xl border border-taupe/20 bg-champagne/40 px-2.5 py-1.5">
                      <Text className="text-[10px] font-bold text-taupe uppercase">L (m):</Text>
                      <TextInput
                        value={customPlotLength}
                        onChangeText={setCustomPlotLength}
                        keyboardType="decimal-pad"
                        maxLength={10}
                        placeholder="1"
                        placeholderTextColor="#A9927D"
                        className="flex-1 text-xs font-black text-espresso p-0"
                      />
                    </View>
                    <Pressable
                      onPress={handleAddCustomPlot}
                      className="items-center justify-center rounded-xl bg-cognac px-4 py-2 shadow-xs active:scale-95">
                      <Text className="text-xs font-bold text-white">+ Add Bed</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Preset Plot Templates */}
                {PLOT_TEMPLATES.map((item, idx) => (
                  <Pressable
                    key={`plot-tpl-${idx}`}
                    onPress={() => {
                      if (onSelectPlot) {
                        onSelectPlot(item.widthM, item.heightM, item.label || item.name);
                      }
                      onClose();
                    }}
                    className="flex-row items-center justify-between rounded-2xl border border-white/90 bg-white p-3.5 shadow-xs shadow-espresso/5 active:scale-[0.98]">
                    <View className="flex-row items-center gap-3.5 flex-1 pr-2">
                      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-forest/15 shadow-xs">
                        <Sprout size={22} color="#2D6A4F" strokeWidth={2.4} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="text-sm font-black text-espresso">
                            {item.name}
                          </Text>
                          <View className="rounded px-1.5 py-0.5 bg-forest/10 border border-forest/20">
                            <Text className="text-[9px] font-black text-forest uppercase">
                              {item.widthM}m × {item.heightM}m
                            </Text>
                          </View>
                        </View>
                        <Text className="text-xs font-semibold text-taupe mt-0.5">
                          {item.description}
                        </Text>
                      </View>
                    </View>

                    <View className="h-8 w-8 items-center justify-center rounded-full bg-cognac/10">
                      <Plus size={16} color="#8C4522" strokeWidth={2.6} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              /* Import Farm Layout Tab */
              <View className="gap-3">
                <View className="rounded-2xl bg-cognac/10 p-3.5 border border-cognac/20">
                  <Text className="text-xs font-bold text-cognac">
                    🗺️ Combine Layouts into One Master Map
                  </Text>
                  <Text className="text-[11px] font-medium text-taupe mt-0.5 leading-relaxed">
                    Import another farm's planting beds and facilities as a movable zone on this canvas. You can freely position each layout block relative to each other.
                  </Text>
                </View>

                {isLoadingFarms ? (
                  <View className="py-12 items-center justify-center">
                    <ActivityIndicator size="small" color="#8C4522" />
                    <Text className="text-xs font-semibold text-taupe mt-2">
                      Loading available farm layouts...
                    </Text>
                  </View>
                ) : availableFarms.length === 0 ? (
                  <View className="rounded-2xl border border-dashed border-taupe/30 bg-white/60 p-8 items-center justify-center">
                    <Layers size={32} color="#A9927D" strokeWidth={2} />
                    <Text className="text-sm font-bold text-espresso mt-3">
                      No Other Farm Layouts Found
                    </Text>
                    <Text className="text-xs text-taupe text-center mt-1 leading-relaxed">
                      Create or add beds to other farms in your portfolio to import and combine them here.
                    </Text>
                  </View>
                ) : (
                  availableFarms.map((farm) => (
                    <Pressable
                      key={farm.farmId}
                      onPress={() => {
                        if (onImportFarmLayout) {
                          onImportFarmLayout(farm);
                        }
                        onClose();
                      }}
                      className="rounded-2xl border border-white/90 bg-white p-4 shadow-xs shadow-espresso/5 active:scale-[0.98]">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 pr-2">
                          <Text className="text-sm font-black text-espresso">
                            {farm.farmName}
                          </Text>
                          <View className="flex-row items-center gap-2 mt-2">
                            <View className="rounded-md bg-emerald-50 px-2 py-0.5 border border-emerald-200">
                              <Text className="text-[10px] font-bold text-emerald-800">
                                {farm.plotCount} {farm.plotCount === 1 ? 'Plot' : 'Plots'}
                              </Text>
                            </View>
                            {farm.facilityCount > 0 && (
                              <View className="rounded-md bg-sky-50 px-2 py-0.5 border border-sky-200">
                                <Text className="text-[10px] font-bold text-sky-800">
                                  {farm.facilityCount} {farm.facilityCount === 1 ? 'Facility' : 'Facilities'}
                                </Text>
                              </View>
                            )}
                            <Text className="text-[10px] font-semibold text-taupe">
                              {farm.layout.widthM || 12}m × {farm.layout.heightM || 16}m
                            </Text>
                          </View>
                        </View>

                        <View className="rounded-xl bg-cognac px-3 py-2 items-center justify-center shadow-xs">
                          <Text className="text-xs font-bold text-white">+ Import</Text>
                        </View>
                      </View>
                    </Pressable>
                  ))
                )}
              </View>
            )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
