/**
 * Farm Layout Designer — FacilitySizeModal (ElementSizeModal)
 *
 * Dedicated modal sheet to adjust dimensions (Width & Length) and presets
 * for Facilities, Planting Plots, and Environmental Zones.
 * For facilities, also supports operational function (Inventory, Schedule, or Both).
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { Modal, KeyboardAvoidingView } from '../../../components/common/AppModal';
import { Check, Plus, Settings, Box, RefreshCw, Sprout, Layers } from '../../../components/Icons';
import { X, Minus, Clock, Info } from 'lucide-react-native';
import type { FarmFacility, FacilityFunction, DesignerPlot, FarmZone } from '../types';

export type FacilitySizeModalProps = {
  facility?: FarmFacility | null;
  plot?: DesignerPlot | null;
  zone?: FarmZone | null;
  visible: boolean;
  onClose: () => void;
  onSaveSizeAndFunction?: (
    facilityId: string,
    widthM: number,
    heightM: number,
    facilityFunction: FacilityFunction
  ) => void;
  onSaveSize?: (
    elementId: string,
    widthM: number,
    heightM: number
  ) => void;
  minWidthM?: number;
  minHeightM?: number;
  maxWidthM?: number;
  maxHeightM?: number;
};

const FACILITY_SIZE_PRESETS = [
  { label: '2×2m', w: 2, h: 2 },
  { label: '3×3m', w: 3, h: 3 },
  { label: '4×3m', w: 4, h: 3 },
  { label: '4×4m', w: 4, h: 4 },
  { label: '5×4m', w: 5, h: 4 },
  { label: '6×5m', w: 6, h: 5 },
];

const PLOT_SIZE_PRESETS = [
  { label: '3×1m', w: 3, h: 1 },
  { label: '4×1.2m', w: 4, h: 1.2 },
  { label: '5×1.5m', w: 5, h: 1.5 },
  { label: '6×1m', w: 6, h: 1 },
  { label: '4×4m', w: 4, h: 4 },
  { label: '8×2m', w: 8, h: 2 },
];

const ZONE_SIZE_PRESETS = [
  { label: '6×6m', w: 6, h: 6 },
  { label: '8×6m', w: 8, h: 6 },
  { label: '10×8m', w: 10, h: 8 },
  { label: '12×10m', w: 12, h: 10 },
  { label: '15×12m', w: 15, h: 12 },
  { label: '20×15m', w: 20, h: 15 },
];

export function FacilitySizeModal({
  facility,
  plot,
  zone,
  visible,
  onClose,
  onSaveSizeAndFunction,
  onSaveSize,
  minWidthM,
  minHeightM,
  maxWidthM,
  maxHeightM,
}: FacilitySizeModalProps) {
  const isPlot = !!plot && !facility;
  const isZone = !!zone && !facility && !plot;
  const isFacility = !!facility;
  const activeElement = facility || plot || zone;

  const minW = isPlot ? 0.5 : isZone ? Math.max(2, minWidthM ?? 2) : 1.0;
  const minH = isPlot ? 0.5 : isZone ? Math.max(2, minHeightM ?? 2) : 1.0;
  const maxW = maxWidthM ?? (isZone ? 60 : 25);
  const maxH = maxHeightM ?? (isZone ? 60 : 25);

  const [widthM, setWidthM] = useState<number>(3);
  const [heightM, setHeightM] = useState<number>(3);
  const [func, setFunc] = useState<FacilityFunction>('none');

  useEffect(() => {
    if (activeElement) {
      const defaultW = isZone ? 8 : isPlot ? 3 : 3;
      const defaultH = isZone ? 6 : isPlot ? 1.2 : 3;
      setWidthM(Math.max(minW, activeElement.widthM || defaultW));
      setHeightM(Math.max(minH, activeElement.heightM || defaultH));
      if (facility) {
        setFunc(facility.facilityFunction || 'none');
      }
    }
  }, [activeElement?.widthM, activeElement?.heightM, facility?.facilityFunction, visible, minW, minH]);

  if (!activeElement) return null;

  const title = isPlot
    ? 'Plot Settings'
    : isZone
    ? 'Zone Settings'
    : 'Facility Settings';

  const subtitle = isPlot
    ? `${plot?.label || 'Plot'} • Bed Dimensions`
    : isZone
    ? `${zone?.name || 'Zone'} • Enclosure Dimensions`
    : `${facility?.name || 'Facility'} • Dimensions & Role`;

  const presets = isPlot
    ? PLOT_SIZE_PRESETS
    : isZone
    ? ZONE_SIZE_PRESETS
    : FACILITY_SIZE_PRESETS;

  const stepDelta = isPlot ? 0.5 : isZone ? 1.0 : 0.5;

  const handleApply = () => {
    const clampedW = Math.max(minW, Math.min(maxW, Math.round(widthM * 10) / 10));
    const clampedH = Math.max(minH, Math.min(maxH, Math.round(heightM * 10) / 10));

    if (isFacility && facility) {
      if (onSaveSizeAndFunction) {
        onSaveSizeAndFunction(facility.id, clampedW, clampedH, func);
      } else if (onSaveSize) {
        onSaveSize(facility.id, clampedW, clampedH);
      }
    } else if (isPlot && plot) {
      onSaveSize?.(plot.id, clampedW, clampedH);
    } else if (isZone && zone) {
      onSaveSize?.(zone.id, clampedW, clampedH);
    }
    onClose();
  };

  const adjustWidth = (delta: number) => {
    setWidthM((prev) => Math.max(minW, Math.min(maxW, Math.round((prev + delta) * 10) / 10)));
  };

  const adjustHeight = (delta: number) => {
    setHeightM((prev) => Math.max(minH, Math.min(maxH, Math.round((prev + delta) * 10) / 10)));
  };

  const renderHeaderIcon = () => {
    if (isPlot) {
      return (
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-emerald-700/10">
          <Sprout size={18} color="#2D6A4F" strokeWidth={2.4} />
        </View>
      );
    }
    if (isZone) {
      return (
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-blue-700/10">
          <Layers size={18} color="#1E40AF" strokeWidth={2.4} />
        </View>
      );
    }
    return (
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
        <Settings size={18} color="#8C4522" strokeWidth={2.4} />
      </View>
    );
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
        <View className="flex-1 justify-end bg-black/60">
          <Pressable className="flex-1" onPress={onClose} />

          <View className="max-h-[88%] rounded-t-[32px] border-t border-taupe/20 bg-champagne p-6 pb-8 shadow-2xl">
            {/* Grab Handle */}
            <View className="self-center h-1.5 w-12 rounded-full bg-taupe/30 mb-3" />

            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-taupe/15 pb-3 mb-4">
              <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                {renderHeaderIcon()}
                <View className="flex-1">
                  <Text className="text-lg font-black text-espresso tracking-tight" numberOfLines={1}>
                    {title}
                  </Text>
                  <Text className="text-xs font-semibold text-taupe" numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={onClose}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center rounded-full bg-taupe/15 active:scale-95">
                <X size={16} color="#1C120C" strokeWidth={2.4} />
              </Pressable>
            </View>

            {/* Auto-Scrolling Input Area */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Sizing Controls */}
            <View className="mb-4 rounded-2xl bg-white p-4 border border-taupe/15 shadow-xs">
              <Text className="text-xs font-black uppercase tracking-wider text-taupe mb-3">
                📐 Dimensions (Meters)
              </Text>

              <View className="flex-row items-center gap-4">
                {/* Width Stepper */}
                <View className="flex-1">
                  <Text className="text-[11px] font-bold text-espresso mb-1">Width (m)</Text>
                  <View className="flex-row items-center rounded-xl border border-taupe/20 bg-champagne/40 p-1">
                    <Pressable
                      onPress={() => adjustWidth(-stepDelta)}
                      className="h-8 w-8 items-center justify-center rounded-lg bg-white shadow-xs active:scale-95">
                      <Minus size={14} color="#8C4522" strokeWidth={2.5} />
                    </Pressable>
                    <TextInput
                      value={String(widthM)}
                      onChangeText={(val) => {
                        const n = parseFloat(val);
                        if (!isNaN(n)) setWidthM(n);
                      }}
                      keyboardType="numeric"
                      maxLength={8}
                      className="flex-1 text-center font-black text-espresso text-sm py-1"
                    />
                    <Pressable
                      onPress={() => adjustWidth(stepDelta)}
                      className="h-8 w-8 items-center justify-center rounded-lg bg-white shadow-xs active:scale-95">
                      <Plus size={14} color="#8C4522" strokeWidth={2.5} />
                    </Pressable>
                  </View>
                </View>

                {/* Length / Height Stepper */}
                <View className="flex-1">
                  <Text className="text-[11px] font-bold text-espresso mb-1">Length (m)</Text>
                  <View className="flex-row items-center rounded-xl border border-taupe/20 bg-champagne/40 p-1">
                    <Pressable
                      onPress={() => adjustHeight(-stepDelta)}
                      className="h-8 w-8 items-center justify-center rounded-lg bg-white shadow-xs active:scale-95">
                      <Minus size={14} color="#8C4522" strokeWidth={2.5} />
                    </Pressable>
                    <TextInput
                      value={String(heightM)}
                      onChangeText={(val) => {
                        const n = parseFloat(val);
                        if (!isNaN(n)) setHeightM(n);
                      }}
                      keyboardType="numeric"
                      maxLength={8}
                      className="flex-1 text-center font-black text-espresso text-sm py-1"
                    />
                    <Pressable
                      onPress={() => adjustHeight(stepDelta)}
                      className="h-8 w-8 items-center justify-center rounded-lg bg-white shadow-xs active:scale-95">
                      <Plus size={14} color="#8C4522" strokeWidth={2.5} />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Informational warning for enclosed zone items */}
              {isZone && (minW > 2 || minH > 2) && (
                <View className="mt-3 flex-row items-center gap-2 rounded-xl bg-amber-50 border border-amber-200/80 p-2.5">
                  <Info size={14} color="#B45309" strokeWidth={2.4} />
                  <Text className="text-[11px] font-semibold text-amber-900 flex-1">
                    Minimum size clamped to {minW}m × {minH}m to enclose contained elements.
                  </Text>
                </View>
              )}

              {/* Quick Presets */}
              <View className="flex-row items-center gap-1.5 mt-3 flex-wrap">
                {presets.map((p) => {
                  const isSelected = widthM === p.w && heightM === p.h;
                  const isPresetBelowMin = p.w < minW || p.h < minH;
                  return (
                    <Pressable
                      key={p.label}
                      onPress={() => {
                        setWidthM(Math.max(minW, p.w));
                        setHeightM(Math.max(minH, p.h));
                      }}
                      className={`rounded-lg px-2.5 py-1 border ${
                        isSelected
                          ? 'bg-cognac border-cognac'
                          : isPresetBelowMin
                          ? 'bg-stone-50 border-stone-200 opacity-50'
                          : 'bg-white border-taupe/20'
                      } active:scale-95`}>
                      <Text
                        className={`text-[10px] font-bold ${
                          isSelected ? 'text-white' : 'text-espresso'
                        }`}>
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Operational Role Selector (Facility Only) */}
            {isFacility && (
              <View className="mb-2 rounded-2xl bg-white p-4 border border-taupe/15 shadow-xs">
                <Text className="text-xs font-black uppercase tracking-wider text-taupe mb-2">
                  🏷️ Tracking Features / Role
                </Text>
                <View className="flex-row gap-1.5">
                  <Pressable
                    onPress={() => setFunc('none')}
                    className={`flex-1 items-center justify-center rounded-xl py-2.5 px-1 border ${
                      func === 'none'
                        ? 'bg-stone-100 border-stone-400'
                        : 'bg-champagne/30 border-taupe/20'
                    } active:scale-98`}>
                    <X size={15} color={func === 'none' ? '#44403C' : '#8C7C70'} strokeWidth={2.4} />
                    <Text
                      className={`text-[10px] font-black mt-1 ${
                        func === 'none' ? 'text-stone-800' : 'text-taupe'
                      }`}>
                      Off
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setFunc('inventory')}
                    className={`flex-1 items-center justify-center rounded-xl py-2.5 px-1 border ${
                      func === 'inventory'
                        ? 'bg-cognac/10 border-cognac'
                        : 'bg-champagne/30 border-taupe/20'
                    } active:scale-98`}>
                    <Box size={15} color={func === 'inventory' ? '#8C4522' : '#8C7C70'} strokeWidth={2.4} />
                    <Text
                      className={`text-[10px] font-black mt-1 ${
                        func === 'inventory' ? 'text-cognac' : 'text-taupe'
                      }`}>
                      Inventory
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setFunc('time_keeping')}
                    className={`flex-1 items-center justify-center rounded-xl py-2.5 px-1 border ${
                      func === 'time_keeping'
                        ? 'bg-indigo-50 border-indigo-500'
                        : 'bg-champagne/30 border-taupe/20'
                    } active:scale-98`}>
                    <Clock size={15} color={func === 'time_keeping' ? '#4F46E5' : '#8C7C70'} strokeWidth={2.4} />
                    <Text
                      className={`text-[10px] font-black mt-1 ${
                        func === 'time_keeping' ? 'text-indigo-700' : 'text-taupe'
                      }`}>
                      Schedule
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setFunc('both')}
                    className={`flex-1 items-center justify-center rounded-xl py-2.5 px-1 border ${
                      func === 'both'
                        ? 'bg-emerald-50 border-emerald-600'
                        : 'bg-champagne/30 border-taupe/20'
                    } active:scale-98`}>
                    <RefreshCw size={15} color={func === 'both' ? '#059669' : '#8C7C70'} strokeWidth={2.4} />
                    <Text
                      className={`text-[10px] font-black mt-1 ${
                        func === 'both' ? 'text-emerald-700' : 'text-taupe'
                      }`}>
                      Both
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            </ScrollView>

            {/* Action Buttons */}
            <View className="flex-row gap-2.5 pt-3 border-t border-taupe/15">
              <Pressable
                onPress={onClose}
                className="flex-1 items-center justify-center rounded-2xl bg-taupe/15 py-3.5 active:scale-98">
                <Text className="text-sm font-bold text-espresso">Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleApply}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-cognac py-3.5 shadow-md shadow-cognac/25 active:scale-98">
                <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text className="text-sm font-black text-white">Save Changes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
