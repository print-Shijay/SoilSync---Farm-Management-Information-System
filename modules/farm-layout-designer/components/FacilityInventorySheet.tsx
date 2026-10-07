import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../../../components/common/AppModal';
import {
  X,
  Plus,
  Trash2,
  Minus,
  Clock,
  User,
  Calendar,
} from 'lucide-react-native';
import {
  Settings,
  FlaskConical,
  Sprout,
  RefreshCw,
  Home,
  Layers,
  Box,
  Pencil,
  Check,
} from '../../../components/Icons';
import type { FarmFacility, FacilityInventoryItem, FacilityCategory, FacilityFunction, FacilityTimeLog } from '../types';
import {
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_STATUS_LABELS,
  FACILITY_FUNCTION_LABELS,
} from '../constants';
import { generateUUID } from '../../../lib/local-db';

type FacilityInventorySheetProps = {
  facility: FarmFacility | null;
  visible: boolean;
  onClose: () => void;
  onUpdateFacility: (updatedFacility: FarmFacility) => void;
  onDeleteFacility?: (facilityId: string) => void;
};

const COLOR_PRESETS = [
  { label: 'Slate', color: '#334155' },
  { label: 'Nursery Pink', color: '#BE185D' },
  { label: 'Concoction Red', color: '#B91C1C' },
  { label: 'Organic Green', color: '#15803D' },
  { label: 'Sky Blue', color: '#0369A1' },
  { label: 'Cobalt Blue', color: '#1D4ED8' },
  { label: 'Purple', color: '#9333EA' },
  { label: 'Cognac Brown', color: '#8C4522' },
];

const ICON_PRESETS = [
  { id: 'package', label: 'Storage', icon: 'package' },
  { id: 'wrench', label: 'Tools', icon: 'wrench' },
  { id: 'sprout', label: 'Nursery', icon: 'sprout' },
  { id: 'flask', label: 'Concoctions', icon: 'flask' },
  { id: 'recycle', label: 'Compost', icon: 'recycle' },
  { id: 'egg', label: 'Livestock', icon: 'egg' },
  { id: 'home', label: 'Housing', icon: 'home' },
];

const CATEGORY_PRESETS: { id: FacilityCategory; label: string }[] = [
  { id: 'storage', label: 'Storage & Warehouse' },
  { id: 'processing', label: 'Processing & Prep' },
  { id: 'livestock', label: 'Livestock & Poultry' },
  { id: 'housing', label: 'Housing & Facilities' },
  { id: 'amenity', label: 'Amenity & Training' },
];

export function FacilityInventorySheet({
  facility,
  visible,
  onClose,
  onUpdateFacility,
  onDeleteFacility,
}: FacilityInventorySheetProps) {
  // Modal view tabs: 'inventory' | 'time_keeping' | 'settings'
  const [activeTab, setActiveTab] = useState<'inventory' | 'time_keeping' | 'settings'>('inventory');

  // Inventory Add form state
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState<FacilityInventoryItem['category']>('tool');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemUnit, setItemUnit] = useState('units');
  const [itemStatus, setItemStatus] = useState<FacilityInventoryItem['status']>('good');
  const [itemNotes, setItemNotes] = useState('');

  // Inventory Edit form state
  const [editingItem, setEditingItem] = useState<FacilityInventoryItem | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemCategory, setEditItemCategory] = useState<FacilityInventoryItem['category']>('tool');
  const [editItemQuantity, setEditItemQuantity] = useState('1');
  const [editItemUnit, setEditItemUnit] = useState('units');
  const [editItemStatus, setEditItemStatus] = useState<FacilityInventoryItem['status']>('good');
  const [editItemNotes, setEditItemNotes] = useState('');

  // Time Keeping state
  const [isAddingTimeLog, setIsAddingTimeLog] = useState(false);
  const [workerName, setWorkerName] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [hoursWorked, setHoursWorked] = useState('2');
  const [targetArea, setTargetArea] = useState('');
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Facility Structure Settings state
  const [facilityName, setFacilityName] = useState('');
  const [facilityCategory, setFacilityCategory] = useState<FacilityCategory>('storage');
  const [facilityFunction, setFacilityFunction] = useState<FacilityFunction>('inventory');
  const [facilityIcon, setFacilityIcon] = useState('package');
  const [facilityColor, setFacilityColor] = useState('#334155');
  const [facilityWidthM, setFacilityWidthM] = useState('3.5');
  const [facilityHeightM, setFacilityHeightM] = useState('3.5');

  useEffect(() => {
    if (facility) {
      const fn = facility.facilityFunction || 'inventory';
      setFacilityName(facility.name || 'Facility');
      setFacilityCategory(facility.category || 'storage');
      setFacilityFunction(fn);
      setFacilityIcon(facility.icon || 'package');
      setFacilityColor(facility.color || '#334155');
      setFacilityWidthM(String(facility.widthM || 3.5));
      setFacilityHeightM(String(facility.heightM || 3.5));
      setIsAddingItem(false);
      setEditingItem(null);
      setIsAddingTimeLog(false);
      if (fn === 'time_keeping') {
        setActiveTab('time_keeping');
      } else {
        setActiveTab('inventory');
      }
    }
  }, [facility?.id, visible]);

  if (!facility) return null;

  const inventories = Array.isArray(facility.inventories) ? facility.inventories : [];
  const timeLogs = Array.isArray(facility.timeLogs) ? facility.timeLogs : [];

  const getFacilityIcon = (iconName: string, size = 20, color = '#FFFFFF') => {
    switch (iconName) {
      case 'wrench':
        return <Settings size={size} color={color} strokeWidth={2.2} />;
      case 'flask':
        return <FlaskConical size={size} color={color} strokeWidth={2.2} />;
      case 'sprout':
        return <Sprout size={size} color={color} strokeWidth={2.2} />;
      case 'recycle':
        return <RefreshCw size={size} color={color} strokeWidth={2.2} />;
      case 'home':
        return <Home size={size} color={color} strokeWidth={2.2} />;
      case 'egg':
        return <Layers size={size} color={color} strokeWidth={2.2} />;
      default:
        return <Box size={size} color={color} strokeWidth={2.2} />;
    }
  };

  // ─── Inventory CRUD Handlers ──────────────────────────────

  const handleAddItem = () => {
    if (!itemName.trim()) {
      Alert.alert('Item Name Required', 'Please enter a name for the inventory item.');
      return;
    }

    const qty = parseFloat(itemQuantity) || 1;
    // Security & Data Integrity: enforce 255 char limit for text, 3000 for notes
    const newItem: FacilityInventoryItem = {
      id: generateUUID(),
      name: itemName.trim().slice(0, 255),
      category: itemCategory,
      quantity: qty,
      unit: (itemUnit.trim() || 'units').slice(0, 255),
      status: itemStatus,
      notes: itemNotes.trim().slice(0, 3000) || undefined,
      updatedAt: new Date().toISOString(),
    };

    const updated = {
      ...facility,
      inventories: [...inventories, newItem],
    };

    onUpdateFacility(updated);
    setItemName('');
    setItemQuantity('1');
    setItemUnit('units');
    setItemStatus('good');
    setItemNotes('');
    setIsAddingItem(false);
  };

  const startEditItem = (item: FacilityInventoryItem) => {
    setEditingItem(item);
    setEditItemName(item.name);
    setEditItemCategory(item.category);
    setEditItemQuantity(String(item.quantity));
    setEditItemUnit(item.unit);
    setEditItemStatus(item.status);
    setEditItemNotes(item.notes || '');
    setIsAddingItem(false);
  };

  const handleSaveEditItem = () => {
    if (!editingItem) return;
    if (!editItemName.trim()) {
      Alert.alert('Item Name Required', 'Please enter a name for the inventory item.');
      return;
    }

    const qty = parseFloat(editItemQuantity) || 0;
    // Security & Data Integrity: enforce 255 char limit for text, 3000 for notes
    const updatedItem: FacilityInventoryItem = {
      ...editingItem,
      name: editItemName.trim().slice(0, 255),
      category: editItemCategory,
      quantity: qty,
      unit: (editItemUnit.trim() || 'units').slice(0, 255),
      status: editItemStatus,
      notes: editItemNotes.trim().slice(0, 3000) || undefined,
      updatedAt: new Date().toISOString(),
    };

    const updated = {
      ...facility,
      inventories: inventories.map((i) => (i.id === editingItem.id ? updatedItem : i)),
    };

    onUpdateFacility(updated);
    setEditingItem(null);
  };

  const handleAdjustQuantity = (itemId: string, delta: number) => {
    const updated = {
      ...facility,
      inventories: inventories.map((item) => {
        if (item.id === itemId) {
          const newQty = Math.max(0, item.quantity + delta);
          return {
            ...item,
            quantity: newQty,
            status: newQty === 0 ? 'low_stock' : item.status,
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      }),
    };
    onUpdateFacility(updated);
  };

  const handleDeleteItem = (itemId: string) => {
    const updated = {
      ...facility,
      inventories: inventories.filter((item) => item.id !== itemId),
    };
    onUpdateFacility(updated);
  };

  // ─── Time Keeping Handlers ─────────────────────────────────

  const handleAddTimeLog = () => {
    if (!workerName.trim()) {
      Alert.alert('Worker Name Required', 'Please enter the worker or staff member name.');
      return;
    }
    const hrs = Math.max(0.25, parseFloat(hoursWorked) || 1);
    // Security & Data Integrity: enforce 255 char limit
    const newLog: FacilityTimeLog = {
      id: generateUUID(),
      workerName: workerName.trim().slice(0, 255),
      taskDescription: (taskDescription.trim() || 'General farm operations').slice(0, 255),
      hours: hrs,
      date: logDate || new Date().toISOString().slice(0, 10),
      areaTarget: targetArea.trim().slice(0, 255) || undefined,
      createdAt: new Date().toISOString(),
    };
    const updated = {
      ...facility,
      timeLogs: [newLog, ...(facility.timeLogs || [])],
    };
    onUpdateFacility(updated);
    setWorkerName('');
    setTaskDescription('');
    setHoursWorked('2');
    setTargetArea('');
    setIsAddingTimeLog(false);
  };

  const handleDeleteTimeLog = (logId: string) => {
    const updated = {
      ...facility,
      timeLogs: (facility.timeLogs || []).filter((l) => l.id !== logId),
    };
    onUpdateFacility(updated);
  };

  // ─── Facility Structure Settings Handlers ─────────────────

  const handleSaveFacilitySettings = () => {
    // Security & Data Integrity: enforce 255 char limit
    const trimmed = facilityName.trim().slice(0, 255);
    if (!trimmed) {
      Alert.alert('Name Required', 'Please enter a name for the facility.');
      return;
    }

    const w = parseFloat(facilityWidthM) || facility.widthM;
    const h = parseFloat(facilityHeightM) || facility.heightM;

    const updated: FarmFacility = {
      ...facility,
      name: trimmed,
      category: facilityCategory,
      facilityFunction,
      icon: facilityIcon,
      color: facilityColor,
      widthM: Math.max(1, w),
      heightM: Math.max(1, h),
    };

    onUpdateFacility(updated);
    Alert.alert('Facility Updated', `${trimmed} details have been successfully saved.`);
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

        <View className="max-h-[90%] rounded-t-[32px] border-t border-taupe/20 bg-champagne pb-8 pt-4 shadow-2xl">
          {/* Sheet Handle */}
          <View className="self-center h-1.5 w-12 rounded-full bg-taupe/30 mb-3" />

          {/* Header */}
          <View className="flex-row items-center justify-between px-6 pb-3 border-b border-taupe/15">
            <View className="flex-row items-center gap-3 flex-1 pr-2">
              <View
                className="h-12 w-12 items-center justify-center rounded-2xl shadow-sm"
                style={{ backgroundColor: facility.color || '#334155' }}>
                {getFacilityIcon(facility.icon, 24, '#FFFFFF')}
              </View>
              <View className="flex-1">
                <Text className="text-xl font-black text-espresso tracking-tight" numberOfLines={1}>
                  {facility.name}
                </Text>
                <View className="flex-row items-center gap-1.5 mt-0.5 flex-wrap">
                  <View
                    className={`rounded px-1.5 py-0.5 border ${
                      facility.facilityFunction === 'time_keeping'
                        ? 'bg-indigo-50 border-indigo-200'
                        : facility.facilityFunction === 'both'
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}>
                    <Text
                      className={`text-[9px] font-black uppercase ${
                        facility.facilityFunction === 'time_keeping'
                          ? 'text-indigo-800'
                          : facility.facilityFunction === 'both'
                          ? 'text-emerald-800'
                          : 'text-amber-800'
                      }`}>
                      {facility.facilityFunction === 'time_keeping'
                        ? '⏱️ Time Keeping'
                        : facility.facilityFunction === 'both'
                        ? '🔄 Inventory & Time'
                        : '📦 Inventory'}
                    </Text>
                  </View>
                  <Text className="text-xs font-semibold text-taupe uppercase tracking-wider">
                    {facility.widthM}m × {facility.heightM}m • {facility.category || 'Storage'}
                  </Text>
                </View>
              </View>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={12}
              className="h-9 w-9 items-center justify-center rounded-full bg-taupe/15 active:scale-95">
              <X size={18} color="#1C120C" strokeWidth={2.4} />
            </Pressable>
          </View>

          {/* Segmented Tabs: Inventory vs Time Keeping vs Facility Settings */}
          <View className="flex-row px-6 pt-3 pb-1 gap-1.5">
            {facility.facilityFunction !== 'time_keeping' && (
              <Pressable
                onPress={() => setActiveTab('inventory')}
                className={`flex-1 py-2 rounded-xl items-center border ${
                  activeTab === 'inventory'
                    ? 'bg-espresso border-espresso'
                    : 'bg-white/60 border-taupe/20'
                }`}>
                <Text
                  className={`text-xs font-black ${
                    activeTab === 'inventory' ? 'text-white' : 'text-taupe'
                  }`}>
                  📦 Stock ({inventories.length})
                </Text>
              </Pressable>
            )}

            {facility.facilityFunction !== 'inventory' && (
              <Pressable
                onPress={() => setActiveTab('time_keeping')}
                className={`flex-1 py-2 rounded-xl items-center border ${
                  activeTab === 'time_keeping'
                    ? 'bg-indigo-900 border-indigo-900'
                    : 'bg-white/60 border-taupe/20'
                }`}>
                <Text
                  className={`text-xs font-black ${
                    activeTab === 'time_keeping' ? 'text-white' : 'text-taupe'
                  }`}>
                  ⏱️ Time Logs ({timeLogs.length})
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => setActiveTab('settings')}
              className={`flex-1 py-2 rounded-xl items-center border ${
                activeTab === 'settings'
                  ? 'bg-espresso border-espresso'
                  : 'bg-white/60 border-taupe/20'
              }`}>
              <Text
                className={`text-xs font-black ${
                  activeTab === 'settings' ? 'text-white' : 'text-taupe'
                }`}>
                ⚙️ Settings
              </Text>
            </Pressable>
          </View>

          {/* ─── TAB 1: INVENTORY CRUD ───────────────────────── */}
          {activeTab === 'inventory' && (
            <ScrollView
              className="flex-1 px-6 pt-3"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}>
              {/* Quick Add Toggle Button */}
              {!isAddingItem && !editingItem && (
                <Pressable
                  onPress={() => setIsAddingItem(true)}
                  className="mb-4 flex-row items-center justify-center gap-2 rounded-2xl bg-cognac py-3.5 shadow-sm shadow-cognac/25 active:scale-[0.98]">
                  <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
                  <Text className="text-sm font-bold text-white tracking-wide">
                    Add Item to {facility.name}
                  </Text>
                </Pressable>
              )}

              {/* ─── ADD ITEM FORM ─── */}
              {isAddingItem && (
                <View className="mb-5 rounded-2xl border border-taupe/20 bg-white p-4 shadow-sm">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-sm font-extrabold uppercase tracking-wider text-espresso">
                      New Inventory Item
                    </Text>
                    <Pressable onPress={() => setIsAddingItem(false)}>
                      <Text className="text-xs font-bold text-taupe">Cancel</Text>
                    </Pressable>
                  </View>

                  <Text className="text-xs font-bold text-taupe mb-1">Item Name</Text>
                  <TextInput
                    value={itemName}
                    onChangeText={setItemName}
                    maxLength={255}
                    placeholder="e.g. Pruning Shears, FPJ Batch, Romaine Seedlings"
                    placeholderTextColor="#A69C90"
                    className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2.5 text-sm font-semibold text-espresso mb-3"
                  />

                  {/* Category Chips */}
                  <Text className="text-xs font-bold text-taupe mb-1.5">Category</Text>
                  <View className="flex-row flex-wrap gap-1.5 mb-3">
                    {(['tool', 'seedling', 'concoction', 'fertilizer', 'harvest', 'equipment', 'feed', 'supplies'] as const).map((cat) => (
                      <Pressable
                        key={cat}
                        onPress={() => setItemCategory(cat)}
                        className={`rounded-full px-2.5 py-1 border ${
                          itemCategory === cat ? 'bg-cognac border-cognac' : 'bg-champagne/60 border-taupe/25'
                        }`}>
                        <Text className={`text-[10px] font-bold ${itemCategory === cat ? 'text-white' : 'text-espresso'}`}>
                          {cat}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Quantity & Unit in Row */}
                  <View className="flex-row gap-3 mb-3">
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-taupe mb-1">Quantity</Text>
                      <TextInput
                        value={itemQuantity}
                        onChangeText={setItemQuantity}
                        keyboardType="numeric"
                        maxLength={15}
                        placeholder="1"
                        placeholderTextColor="#A69C90"
                        className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2.5 text-sm font-semibold text-espresso"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-taupe mb-1">Unit</Text>
                      <TextInput
                        value={itemUnit}
                        onChangeText={setItemUnit}
                        maxLength={255}
                        placeholder="units, L, kg, sacks, trays"
                        placeholderTextColor="#A69C90"
                        className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2.5 text-sm font-semibold text-espresso"
                      />
                    </View>
                  </View>

                  {/* Status Chips */}
                  <Text className="text-xs font-bold text-taupe mb-1.5">Status</Text>
                  <View className="flex-row flex-wrap gap-1.5 mb-3">
                    {(['good', 'ready', 'low_stock', 'fermenting', 'in_use', 'maintenance'] as const).map((st) => {
                      const info = INVENTORY_STATUS_LABELS[st] || { label: st, bg: '#F3F4F6', text: '#374151' };
                      const isSelected = itemStatus === st;
                      return (
                        <Pressable
                          key={st}
                          onPress={() => setItemStatus(st)}
                          style={{
                            backgroundColor: isSelected ? info.text : info.bg,
                            borderColor: isSelected ? info.text : 'transparent',
                          }}
                          className="rounded-full px-3 py-1 border active:scale-95">
                          <Text style={{ color: isSelected ? '#FFFFFF' : info.text }} className="text-[10px] font-bold">
                            {info.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Optional Notes */}
                  <Text className="text-xs font-bold text-taupe mb-1">Batch Notes (Optional)</Text>
                  <TextInput
                    value={itemNotes}
                    onChangeText={setItemNotes}
                    maxLength={3000}
                    placeholder="e.g. Brewed on Sep 07, Tray #4"
                    placeholderTextColor="#A69C90"
                    className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2 text-xs font-semibold text-espresso mb-4"
                  />

                  <Pressable
                    onPress={handleAddItem}
                    className="rounded-xl bg-cognac py-3 items-center active:scale-98">
                    <Text className="text-xs font-bold uppercase tracking-wider text-white">
                      Save to Facility
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* ─── EDIT ITEM FORM ─── */}
              {editingItem && (
                <View className="mb-5 rounded-2xl border-2 border-cognac/50 bg-white p-4 shadow-sm">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-sm font-extrabold uppercase tracking-wider text-cognac">
                      ✏️ Edit Inventory Item
                    </Text>
                    <Pressable onPress={() => setEditingItem(null)}>
                      <Text className="text-xs font-bold text-taupe">Cancel</Text>
                    </Pressable>
                  </View>

                  <Text className="text-xs font-bold text-taupe mb-1">Item Name</Text>
                  <TextInput
                    value={editItemName}
                    onChangeText={setEditItemName}
                    maxLength={255}
                    placeholderTextColor="#A69C90"
                    className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2.5 text-sm font-semibold text-espresso mb-3"
                  />

                  {/* Category Chips */}
                  <Text className="text-xs font-bold text-taupe mb-1.5">Category</Text>
                  <View className="flex-row flex-wrap gap-1.5 mb-3">
                    {(['tool', 'seedling', 'concoction', 'fertilizer', 'harvest', 'equipment', 'feed', 'supplies'] as const).map((cat) => (
                      <Pressable
                        key={cat}
                        onPress={() => setEditItemCategory(cat)}
                        className={`rounded-full px-2.5 py-1 border ${
                          editItemCategory === cat ? 'bg-cognac border-cognac' : 'bg-champagne/60 border-taupe/25'
                        }`}>
                        <Text className={`text-[10px] font-bold ${editItemCategory === cat ? 'text-white' : 'text-espresso'}`}>
                          {cat}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <View className="flex-row gap-3 mb-3">
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-taupe mb-1">Quantity</Text>
                      <TextInput
                        value={editItemQuantity}
                        onChangeText={setEditItemQuantity}
                        keyboardType="numeric"
                        maxLength={15}
                        placeholderTextColor="#A69C90"
                        className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2.5 text-sm font-semibold text-espresso"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-taupe mb-1">Unit</Text>
                      <TextInput
                        value={editItemUnit}
                        onChangeText={setEditItemUnit}
                        maxLength={255}
                        placeholderTextColor="#A69C90"
                        className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2.5 text-sm font-semibold text-espresso"
                      />
                    </View>
                  </View>

                  {/* Status Chips */}
                  <Text className="text-xs font-bold text-taupe mb-1.5">Status</Text>
                  <View className="flex-row flex-wrap gap-1.5 mb-3">
                    {(['good', 'ready', 'low_stock', 'fermenting', 'in_use', 'maintenance'] as const).map((st) => {
                      const info = INVENTORY_STATUS_LABELS[st] || { label: st, bg: '#F3F4F6', text: '#374151' };
                      const isSelected = editItemStatus === st;
                      return (
                        <Pressable
                          key={st}
                          onPress={() => setEditItemStatus(st)}
                          style={{
                            backgroundColor: isSelected ? info.text : info.bg,
                            borderColor: isSelected ? info.text : 'transparent',
                          }}
                          className="rounded-full px-3 py-1 border active:scale-95">
                          <Text style={{ color: isSelected ? '#FFFFFF' : info.text }} className="text-[10px] font-bold">
                            {info.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Notes */}
                  <Text className="text-xs font-bold text-taupe mb-1">Notes</Text>
                  <TextInput
                    value={editItemNotes}
                    onChangeText={setEditItemNotes}
                    maxLength={3000}
                    placeholder="Batch notes or instructions"
                    placeholderTextColor="#A69C90"
                    className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2 text-xs font-semibold text-espresso mb-4"
                  />

                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => setEditingItem(null)}
                      className="flex-1 rounded-xl bg-champagne py-3 items-center border border-taupe/30">
                      <Text className="text-xs font-bold text-espresso">Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSaveEditItem}
                      className="flex-1 rounded-xl bg-cognac py-3 items-center active:scale-98">
                      <Text className="text-xs font-bold uppercase tracking-wider text-white">Save Changes</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* ─── INVENTORY LIST ─── */}
              {inventories.length > 0 ? (
                <View className="gap-2.5">
                  {inventories.map((item) => {
                    const statusInfo =
                      INVENTORY_STATUS_LABELS[item.status] || {
                        label: item.status,
                        bg: '#F3F4F6',
                        text: '#374151',
                      };

                    return (
                      <View
                        key={item.id}
                        className="flex-row items-center justify-between rounded-2xl border border-white/90 bg-white p-3.5 shadow-xs shadow-espresso/5">
                        <Pressable
                          onPress={() => startEditItem(item)}
                          className="flex-1 pr-2">
                          <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                            <Text className="text-[15px] font-bold text-espresso" numberOfLines={1}>
                              {item.name}
                            </Text>
                            <View
                              style={{ backgroundColor: statusInfo.bg }}
                              className="rounded-md px-2 py-0.5">
                              <Text
                                style={{ color: statusInfo.text }}
                                className="text-[10px] font-extrabold uppercase">
                                {statusInfo.label}
                              </Text>
                            </View>
                          </View>

                          <Text className="text-xs font-semibold text-taupe">
                            {INVENTORY_CATEGORY_LABELS[item.category] || item.category}
                            {item.notes ? ` • ${item.notes}` : ''}
                          </Text>
                        </Pressable>

                        {/* Controls: Stepper, Edit, Delete */}
                        <View className="flex-row items-center gap-1.5">
                          {/* Stepper */}
                          <View className="flex-row items-center rounded-xl bg-champagne border border-taupe/20 px-1 py-0.5">
                            <Pressable
                              onPress={() => handleAdjustQuantity(item.id, -1)}
                              hitSlop={8}
                              className="h-7 w-7 items-center justify-center rounded-lg bg-white/80 active:scale-90 shadow-xs">
                              <Minus size={14} color="#8C4522" strokeWidth={2.6} />
                            </Pressable>

                            <View className="px-2 items-center min-w-[44px]">
                              <Text className="text-sm font-black text-espresso">
                                {item.quantity}
                              </Text>
                              <Text className="text-[9px] font-bold text-taupe -mt-0.5" numberOfLines={1}>
                                {item.unit}
                              </Text>
                            </View>

                            <Pressable
                              onPress={() => handleAdjustQuantity(item.id, 1)}
                              hitSlop={8}
                              className="h-7 w-7 items-center justify-center rounded-lg bg-white/80 active:scale-90 shadow-xs">
                              <Plus size={14} color="#8C4522" strokeWidth={2.6} />
                            </Pressable>
                          </View>

                          {/* Edit Item button */}
                          <Pressable
                            onPress={() => startEditItem(item)}
                            hitSlop={8}
                            className="h-8 w-8 items-center justify-center rounded-xl bg-champagne/80 active:scale-90">
                            <Pencil size={13} color="#8C4522" strokeWidth={2.2} />
                          </Pressable>

                          {/* Delete Item button */}
                          <Pressable
                            onPress={() => handleDeleteItem(item.id)}
                            hitSlop={8}
                            className="h-8 w-8 items-center justify-center rounded-xl bg-red-50 active:scale-90">
                            <Trash2 size={13} color="#DC2626" strokeWidth={2.2} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                /* Safe Empty State (Zero non-canonical icons) */
                <View className="items-center justify-center rounded-2xl border border-dashed border-taupe/30 bg-white/40 p-8 my-2">
                  <Box size={36} color="#8C7C70" strokeWidth={1.8} />
                  <Text className="mt-2 text-sm font-bold text-espresso">
                    No Inventory Items
                  </Text>
                  <Text className="mt-1 text-center text-xs text-taupe leading-relaxed">
                    Store tools, seeds, concoctions, or fertilizer batches in this facility.
                  </Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* ─── TAB: TIME KEEPING & LABOR STATION ─────────── */}
          {activeTab === 'time_keeping' && (
            <ScrollView
              className="flex-1 px-6 pt-3"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}>
              {/* Quick Add Toggle Button */}
              {!isAddingTimeLog && (
                <View className="flex-row gap-2 mb-3">
                  <Pressable
                    onPress={() => setIsAddingTimeLog(true)}
                    className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-indigo-900 py-3 shadow-xs active:scale-[0.98]">
                    <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />
                    <Text className="text-xs font-black text-white uppercase tracking-wider">
                      + Log Labor / Attendance
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Add Time Log Form */}
              {isAddingTimeLog && (
                <View className="mb-4 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
                  <View className="flex-row items-center justify-between mb-3 border-b border-indigo-100 pb-2">
                    <View className="flex-row items-center gap-2">
                      <Clock size={16} color="#3730A3" strokeWidth={2.4} />
                      <Text className="text-sm font-black text-espresso">
                        Record Labor / Task Hours
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setIsAddingTimeLog(false)}
                      hitSlop={8}
                      className="h-7 w-7 items-center justify-center rounded-full bg-taupe/15">
                      <X size={14} color="#1C120C" strokeWidth={2.4} />
                    </Pressable>
                  </View>

                  {/* Worker Name */}
                  <Text className="text-xs font-bold text-taupe mb-1">Worker / Staff Member</Text>
                  <TextInput
                    value={workerName}
                    onChangeText={setWorkerName}
                    maxLength={255}
                    placeholder="e.g. Juan dela Cruz, Maria Santos"
                    placeholderTextColor="#A69C90"
                    className="rounded-xl border border-taupe/25 bg-champagne/40 px-3 py-2 text-xs font-semibold text-espresso mb-2.5"
                  />

                  {/* Task Description & Area */}
                  <Text className="text-xs font-bold text-taupe mb-1">Task & Target Farm Area</Text>
                  <TextInput
                    value={taskDescription}
                    onChangeText={setTaskDescription}
                    maxLength={255}
                    placeholder="e.g. Bed Weeding in Area 1, Turning Vermi Beds"
                    placeholderTextColor="#A69C90"
                    className="rounded-xl border border-taupe/25 bg-champagne/40 px-3 py-2 text-xs font-semibold text-espresso mb-2.5"
                  />

                  {/* Hours & Date */}
                  <View className="flex-row gap-2 mb-3">
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-taupe mb-1">Hours Logged</Text>
                      <TextInput
                        value={hoursWorked}
                        onChangeText={setHoursWorked}
                        keyboardType="decimal-pad"
                        maxLength={10}
                        placeholder="2.0"
                        placeholderTextColor="#A69C90"
                        className="rounded-xl border border-taupe/25 bg-champagne/40 px-3 py-2 text-xs font-semibold text-espresso"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-taupe mb-1">Date</Text>
                      <TextInput
                        value={logDate}
                        onChangeText={setLogDate}
                        maxLength={20}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#A69C90"
                        className="rounded-xl border border-taupe/25 bg-champagne/40 px-3 py-2 text-xs font-semibold text-espresso"
                      />
                    </View>
                  </View>

                  <Pressable
                    onPress={handleAddTimeLog}
                    className="items-center justify-center rounded-xl bg-indigo-900 py-2.5 shadow-xs active:scale-[0.98]">
                    <Text className="text-xs font-bold text-white">+ Save Labor Log</Text>
                  </Pressable>
                </View>
              )}

              {/* Time Logs Summary & List */}
              {timeLogs.length > 0 ? (
                <View className="gap-2.5">
                  <View className="flex-row items-center justify-between rounded-xl bg-indigo-50 border border-indigo-200 px-3.5 py-2.5 mb-1">
                    <Text className="text-xs font-bold text-indigo-950">
                      Total Station Labor Logged:
                    </Text>
                    <Text className="text-sm font-black text-indigo-900">
                      {timeLogs.reduce((sum, l) => sum + (Number(l.hours) || 0), 0).toFixed(1)} hrs
                    </Text>
                  </View>

                  {timeLogs.map((log) => (
                    <View
                      key={log.id}
                      className="flex-row items-center justify-between rounded-2xl border border-white/90 bg-white p-3.5 shadow-xs">
                      <View className="flex-1 pr-2">
                        <View className="flex-row items-center gap-2 mb-0.5">
                          <Text className="text-sm font-black text-espresso">
                            {log.workerName}
                          </Text>
                          <View className="rounded px-2 py-0.5 bg-indigo-100 border border-indigo-200">
                            <Text className="text-[10px] font-black text-indigo-900">
                              {log.hours} hrs
                            </Text>
                          </View>
                        </View>
                        <Text className="text-xs font-semibold text-taupe">
                          {log.taskDescription}
                        </Text>
                        <Text className="text-[10px] font-medium text-taupe/70 mt-0.5">
                          📅 {log.date}
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => handleDeleteTimeLog(log.id)}
                        hitSlop={8}
                        className="h-8 w-8 items-center justify-center rounded-xl bg-red-50 active:scale-90">
                        <Trash2 size={13} color="#DC2626" strokeWidth={2.2} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="items-center justify-center rounded-2xl border border-dashed border-indigo-200 bg-white/40 p-8 my-2">
                  <Clock size={36} color="#6366F1" strokeWidth={1.8} />
                  <Text className="mt-2 text-sm font-bold text-espresso">
                    No Time Logs Yet
                  </Text>
                  <Text className="mt-1 text-center text-xs text-taupe leading-relaxed">
                    Clock in staff attendance and track hours spent in specific farm areas from this facility.
                  </Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* ─── TAB 2: FACILITY STRUCTURE SETTINGS (CRUD) ──── */}
          {activeTab === 'settings' && (
            <ScrollView
              className="flex-1 px-6 pt-3"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 48 }}>
              <View className="rounded-2xl border border-taupe/20 bg-white p-4 shadow-sm mb-4">
                {/* Facility Name */}
                <Text className="text-xs font-bold text-taupe mb-1">Facility Name</Text>
                <TextInput
                  value={facilityName}
                  onChangeText={setFacilityName}
                  maxLength={255}
                  placeholder="e.g. Tools Storage, Main Nursery"
                  placeholderTextColor="#A69C90"
                  className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2.5 text-sm font-semibold text-espresso mb-3"
                />

                {/* Facility Category */}
                <Text className="text-xs font-bold text-taupe mb-1.5">Facility Classification</Text>
                <View className="flex-row flex-wrap gap-1.5 mb-3">
                  {CATEGORY_PRESETS.map((cat) => {
                    const isSelected = facilityCategory === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => setFacilityCategory(cat.id)}
                        className={`rounded-xl px-3 py-1.5 border ${
                          isSelected ? 'bg-espresso border-espresso' : 'bg-champagne/60 border-taupe/25'
                        }`}>
                        <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-espresso'}`}>
                          {cat.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Facility Function / Role */}
                <Text className="text-xs font-bold text-taupe mb-1.5">Facility Function / Role</Text>
                <View className="flex-row gap-2 mb-3">
                  {(['inventory', 'time_keeping', 'both'] as FacilityFunction[]).map((fn) => {
                    const isSelected = facilityFunction === fn;
                    const meta = FACILITY_FUNCTION_LABELS[fn];
                    return (
                      <Pressable
                        key={fn}
                        onPress={() => setFacilityFunction(fn)}
                        className={`flex-1 rounded-xl p-2.5 border items-center ${
                          isSelected
                            ? 'bg-cognac border-cognac shadow-xs'
                            : 'bg-champagne/60 border-taupe/25'
                        }`}>
                        <Text className="text-base mb-0.5">{meta.icon}</Text>
                        <Text
                          className={`text-[11px] font-extrabold ${
                            isSelected ? 'text-white' : 'text-espresso'
                          }`}>
                          {meta.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Icon Selector */}
                <Text className="text-xs font-bold text-taupe mb-1.5">Map Icon</Text>
                <View className="flex-row flex-wrap gap-2 mb-3">
                  {ICON_PRESETS.map((ic) => {
                    const isSelected = facilityIcon === ic.icon;
                    return (
                      <Pressable
                        key={ic.id}
                        onPress={() => setFacilityIcon(ic.icon)}
                        className={`flex-row items-center gap-1.5 rounded-xl px-3 py-2 border ${
                          isSelected ? 'bg-cognac border-cognac' : 'bg-champagne/50 border-taupe/25'
                        }`}>
                        {getFacilityIcon(ic.icon, 16, isSelected ? '#FFFFFF' : '#8C4522')}
                        <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-espresso'}`}>
                          {ic.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Color Palette */}
                <Text className="text-xs font-bold text-taupe mb-1.5">Theme Color</Text>
                <View className="flex-row flex-wrap gap-2 mb-3">
                  {COLOR_PRESETS.map((cp) => {
                    const isSelected = facilityColor.toLowerCase() === cp.color.toLowerCase();
                    return (
                      <Pressable
                        key={cp.color}
                        onPress={() => setFacilityColor(cp.color)}
                        style={{ backgroundColor: cp.color }}
                        className={`h-8 w-8 rounded-full items-center justify-center border-2 ${
                          isSelected ? 'border-espresso scale-110' : 'border-white'
                        }`}>
                        {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Dimensions */}
                <View className="flex-row gap-3 mb-4">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-taupe mb-1">Width (meters)</Text>
                    <TextInput
                      value={facilityWidthM}
                      onChangeText={setFacilityWidthM}
                      keyboardType="numeric"
                      maxLength={10}
                      placeholder="3.5"
                      placeholderTextColor="#A69C90"
                      className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2.5 text-sm font-semibold text-espresso"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-taupe mb-1">Length / Height (meters)</Text>
                    <TextInput
                      value={facilityHeightM}
                      onChangeText={setFacilityHeightM}
                      keyboardType="numeric"
                      maxLength={10}
                      placeholder="3.5"
                      placeholderTextColor="#A69C90"
                      className="rounded-xl border border-taupe/25 bg-champagne/40 px-3.5 py-2.5 text-sm font-semibold text-espresso"
                    />
                  </View>
                </View>

                {/* Save Facility Button */}
                <Pressable
                  onPress={handleSaveFacilitySettings}
                  className="rounded-xl bg-espresso py-3 items-center active:scale-98">
                  <Text className="text-xs font-bold uppercase tracking-wider text-white">
                    Save Facility Settings
                  </Text>
                </Pressable>
              </View>

              {/* Delete Facility Button */}
              {onDeleteFacility && (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      'Delete Facility',
                      `Are you sure you want to delete "${facility.name}" and all its inventory items from the farm plan?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete Facility',
                          style: 'destructive',
                          onPress: () => {
                            onDeleteFacility(facility.id);
                            onClose();
                          },
                        },
                      ]
                    );
                  }}
                  className="flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-red-300 bg-red-50 active:scale-98">
                  <Trash2 size={16} color="#DC2626" strokeWidth={2.2} />
                  <Text className="text-xs font-black text-red-600 uppercase tracking-wider">
                    Delete Facility from Map
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
  );
}
