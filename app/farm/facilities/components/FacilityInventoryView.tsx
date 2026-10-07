import React, { useCallback, useMemo, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert as Alert } from '../../../../components/common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../../../../components/common/AppModal';
import { Box, Pencil, Plus, Trash2 } from '../../../../components/Icons';
import {
  AlertCircle,
  AlertTriangle,
  Minus,
  Search,
  Tag,
  X,
} from 'lucide-react-native';
import { FacilityInventoryItem } from '../../../../lib/facility-operations';
import { generateUUID } from '../../../../lib/local-db';

const PRESET_CATEGORIES = [
  'Tools',
  'Seedlings',
  'Concoctions',
  'Fertilizers',
  'Equipment',
  'Feed',
  'Supplies',
  'Others',
];

const PRESET_UNITS = [
  'units',
  'kg',
  'liters',
  'trays',
  'sacks',
  'bottles',
  'pcs',
  'grams',
  'boxes',
  'Others',
];

interface FacilityInventoryViewProps {
  items: FacilityInventoryItem[];
  facilityName: string;
  facilityCategory?: string;
  onSaveItems: (updatedItems: FacilityInventoryItem[]) => Promise<void>;
}

export function FacilityInventoryView({
  items,
  facilityName,
  onSaveItems,
}: FacilityInventoryViewProps) {
  const insets = useSafeAreaInsets();

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<FacilityInventoryItem | null>(null);

  const handleCloseModal = useCallback(() => {
    Keyboard.dismiss();
    setModalVisible(false);
  }, []);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Tools');
  const [customCategory, setCustomCategory] = useState('');
  const [formQuantity, setFormQuantity] = useState('10');
  const [formUnit, setFormUnit] = useState('units');
  const [customUnit, setCustomUnit] = useState('');
  const [formThreshold, setFormThreshold] = useState('5');
  const [formNotes, setFormNotes] = useState('');

  // ─── Dynamic Category Filters ────────────────────────────────
  const filterCategories = useMemo(() => {
    const list = ['All', 'Tools', 'Seedlings', 'Concoctions', 'Fertilizers', 'Equipment', 'Feed', 'Supplies'];
    items.forEach((item) => {
      if (item.category) {
        const formatted = item.category.charAt(0).toUpperCase() + item.category.slice(1);
        if (!list.some((c) => c.toLowerCase() === formatted.toLowerCase())) {
          list.push(formatted);
        }
      }
    });
    return list;
  }, [items]);

  // ─── KPI Metrics ─────────────────────────────────────────────
  const metrics = useMemo(() => {
    let totalStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const categorySet = new Set<string>();

    items.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const threshold = Number(item.lowStockThreshold) || 5;

      totalStockCount += qty;
      if (item.category) categorySet.add(item.category.toLowerCase());

      if (qty === 0) {
        outOfStockCount++;
      } else if (qty <= threshold) {
        lowStockCount++;
      }
    });

    return {
      totalItems: items.length,
      totalUnits: totalStockCount,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
      categoriesCount: categorySet.size || 1,
    };
  }, [items]);

  // ─── Filtered Items ──────────────────────────────────────────
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.notes && item.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory =
        activeCategory === 'All' ||
        (item.category && item.category.toLowerCase() === activeCategory.toLowerCase());

      return matchesSearch && matchesCategory;
    });
  }, [items, searchQuery, activeCategory]);

  // ─── Form Handlers ───────────────────────────────────────────
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormName('');
    setFormCategory('Tools');
    setCustomCategory('');
    setFormQuantity('10');
    setFormUnit('units');
    setCustomUnit('');
    setFormThreshold('5');
    setFormNotes('');
    setModalVisible(true);
  };

  const handleOpenEditModal = (item: FacilityInventoryItem) => {
    setEditingItem(item);
    setFormName(item.name);

    // Check if category matches presets
    const foundCat = PRESET_CATEGORIES.find(
      (c) => c.toLowerCase() === (item.category || '').toLowerCase() && c !== 'Others'
    );
    if (foundCat) {
      setFormCategory(foundCat);
      setCustomCategory('');
    } else {
      setFormCategory('Others');
      setCustomCategory(item.category || '');
    }

    // Check if unit matches presets
    const foundUnit = PRESET_UNITS.find(
      (u) => u.toLowerCase() === (item.unit || '').toLowerCase() && u !== 'Others'
    );
    if (foundUnit) {
      setFormUnit(foundUnit);
      setCustomUnit('');
    } else {
      setFormUnit('Others');
      setCustomUnit(item.unit || '');
    }

    setFormQuantity(String(item.quantity ?? 0));
    setFormThreshold(String(item.lowStockThreshold ?? 5));
    setFormNotes(item.notes || '');
    setModalVisible(true);
  };

  const handleSaveItem = async () => {
    if (!formName.trim()) {
      Alert.alert('Missing Field', 'Please enter a supply/item name.');
      return;
    }

    const resolvedCategory =
      formCategory === 'Others'
        ? customCategory.trim() || 'Supplies'
        : formCategory;

    const resolvedUnit =
      formUnit === 'Others'
        ? customUnit.trim() || 'units'
        : formUnit;

    const qty = Math.max(0, parseInt(formQuantity, 10) || 0);
    const threshold = Math.max(0, parseInt(formThreshold, 10) || 5);
    const nowIso = new Date().toISOString();

    let status = 'good';
    if (qty === 0) status = 'out_of_stock';
    else if (qty <= threshold) status = 'low_stock';

    // Security & Data Integrity: enforce length bounds
    const safeName = formName.trim().slice(0, 255);
    const safeCategory = (resolvedCategory.trim() || 'Supplies').slice(0, 255).toLowerCase();
    const safeUnit = (resolvedUnit.trim() || 'units').slice(0, 255);
    const safeNotes = formNotes.trim().slice(0, 3000) || undefined;

    let updatedList: FacilityInventoryItem[];

    if (editingItem) {
      updatedList = items.map((i) =>
        i.id === editingItem.id
          ? {
              ...i,
              name: safeName,
              category: safeCategory,
              quantity: qty,
              unit: safeUnit,
              lowStockThreshold: threshold,
              status,
              notes: safeNotes,
              updatedAt: nowIso,
            }
          : i
      );
    } else {
      const newItem: FacilityInventoryItem = {
        id: generateUUID(),
        name: safeName,
        category: safeCategory,
        quantity: qty,
        unit: safeUnit,
        lowStockThreshold: threshold,
        status,
        notes: safeNotes,
        updatedAt: nowIso,
      };
      updatedList = [newItem, ...items];
    }

    handleCloseModal();
    await onSaveItems(updatedList);
  };

  const handleDeleteItem = (itemId?: string) => {
    if (!itemId) return;
    Alert.alert(
      'Delete Supply Item',
      'Are you sure you want to delete this supply item from inventory?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = items.filter((i) => i.id !== itemId);
            handleCloseModal();
            await onSaveItems(updated);
          },
        },
      ]
    );
  };

  // Quick Stepper (+ / -) directly on the card
  const handleQuickAdjustQuantity = async (itemId?: string, delta: number = 0) => {
    if (!itemId) return;
    const nowIso = new Date().toISOString();
    const updated = items.map((item) => {
      if (item.id === itemId) {
        const currentQty = Number(item.quantity) || 0;
        const newQty = Math.max(0, currentQty + delta);
        const threshold = Number(item.lowStockThreshold) || 5;

        let status = 'good';
        if (newQty === 0) status = 'out_of_stock';
        else if (newQty <= threshold) status = 'low_stock';

        return {
          ...item,
          quantity: newQty,
          status,
          updatedAt: nowIso,
        };
      }
      return item;
    });

    await onSaveItems(updated);
  };

  return (
    <View className="mb-8">
      {/* ─── Top Header ─── */}
      <View className="mb-3">
        <View className="flex-row items-center gap-1.5">
          <View className="h-2 w-2 rounded-full bg-emerald-600" />
          <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-800">
            Supplies & Inventory
          </Text>
        </View>
        <Text className="text-lg font-black tracking-tight text-espresso">
          {facilityName} Stocks
        </Text>
      </View>

      {/* ─── Prominent Add Item Button (Moved to next row, bigger) ─── */}
      <Pressable
        onPress={handleOpenAddModal}
        className="mb-4 flex-row items-center justify-center gap-2 rounded-2xl bg-emerald-800 px-4 py-3.5 shadow-sm shadow-emerald-950/20 active:scale-[0.98]">
        <Plus size={18} color="#FFFFFF" />
        <Text className="text-sm font-black text-white">Add New Supply Item</Text>
      </Pressable>

      {/* ─── Overview KPI Metric Cards ─── */}
      <View className="mb-4 flex-row gap-2.5">
        {/* Total Stock */}
        <View className="flex-1 rounded-2xl border border-black/[0.06] bg-white p-3 shadow-xs">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-taupe">Total Items</Text>
          <Text className="mt-1 text-xl font-black text-espresso">{metrics.totalItems}</Text>
          <Text className="text-[10px] font-medium text-taupe">{metrics.totalUnits} total units</Text>
        </View>

        {/* Low Stock Alert */}
        <View
          className={`flex-1 rounded-2xl border p-3 shadow-xs ${
            metrics.lowStock > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-black/[0.06] bg-white'
          }`}>
          <Text
            className={`text-[10px] font-bold uppercase tracking-wider ${
              metrics.lowStock > 0 ? 'text-amber-800' : 'text-taupe'
            }`}>
            Low Stock
          </Text>
          <Text
            className={`mt-1 text-xl font-black ${
              metrics.lowStock > 0 ? 'text-amber-700' : 'text-espresso'
            }`}>
            {metrics.lowStock}
          </Text>
          <Text className="text-[10px] font-medium text-taupe">Need restock</Text>
        </View>

        {/* Out of Stock Alert */}
        <View
          className={`flex-1 rounded-2xl border p-3 shadow-xs ${
            metrics.outOfStock > 0 ? 'border-rose-300 bg-rose-50/60' : 'border-black/[0.06] bg-white'
          }`}>
          <Text
            className={`text-[10px] font-bold uppercase tracking-wider ${
              metrics.outOfStock > 0 ? 'text-rose-800' : 'text-taupe'
            }`}>
            Depleted
          </Text>
          <Text
            className={`mt-1 text-xl font-black ${
              metrics.outOfStock > 0 ? 'text-rose-700' : 'text-espresso'
            }`}>
            {metrics.outOfStock}
          </Text>
          <Text className="text-[10px] font-medium text-taupe">0 items</Text>
        </View>
      </View>

      {/* ─── Search & Category Filter ─── */}
      <View className="mb-4 rounded-2xl border border-black/[0.06] bg-white p-3 shadow-xs">
        <View className="flex-row items-center rounded-xl bg-champagne/40 px-3 py-2">
          <Search size={15} color="#8C7C70" />
          <TextInput
            placeholder="Search supply items, tools, notes..."
            placeholderTextColor="#8C7C70"
            value={searchQuery}
            onChangeText={setSearchQuery}
            maxLength={255}
            className="ml-2 flex-1 text-xs font-semibold text-espresso"
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
              <X size={14} color="#8C7C70" />
            </Pressable>
          ) : null}
        </View>

        {/* Category Scroll Strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2.5">
          <View className="flex-row items-center gap-1.5">
            {filterCategories.map((cat) => {
              const active = activeCategory.toLowerCase() === cat.toLowerCase();
              return (
                <Pressable
                  key={cat}
                  onPress={() => setActiveCategory(cat)}
                  className={`rounded-xl px-3 py-1.5 active:scale-95 ${
                    active ? 'bg-emerald-800' : 'bg-champagne/60 border border-black/[0.04]'
                  }`}>
                  <Text
                    className={`text-[11px] font-bold ${
                      active ? 'text-white' : 'text-taupe'
                    }`}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* ─── Inventory List Cards ─── */}
      {filteredItems.length === 0 ? (
        <View className="items-center justify-center rounded-[28px] border border-black/[0.06] bg-white p-8 shadow-xs">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
            <Box size={22} color="#047857" />
          </View>
          <Text className="mt-3 text-sm font-bold text-espresso">
            {searchQuery || activeCategory !== 'All'
              ? 'No matching supplies found'
              : 'No supplies in inventory yet'}
          </Text>
          <Text className="mt-1 text-center text-xs text-taupe">
            {searchQuery || activeCategory !== 'All'
              ? 'Try changing your search query or category filter.'
              : 'Tap "Add New Supply Item" above to add your first supply item.'}
          </Text>
          <Pressable
            onPress={handleOpenAddModal}
            className="mt-3.5 flex-row items-center gap-1.5 rounded-xl bg-emerald-800 px-3.5 py-2 active:scale-95">
            <Plus size={14} color="#FFFFFF" />
            <Text className="text-xs font-bold text-white">Add First Item</Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3">
          {filteredItems.map((item, idx) => {
            const qty = Number(item.quantity) || 0;
            const threshold = Number(item.lowStockThreshold) || 5;
            const isOut = qty === 0;
            const isLow = !isOut && qty <= threshold;

            return (
              <View
                key={item.id || `inv-item-${idx}`}
                className="overflow-hidden rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-sm shadow-espresso/5">
                <View className="flex-row items-start justify-between">
                  {/* Title & Metadata */}
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-black text-espresso">{item.name}</Text>
                    <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
                      {item.category ? (
                        <View className="flex-row items-center gap-1 rounded-md bg-taupe/10 px-1.5 py-0.5">
                          <Tag size={9} color="#8C7C70" />
                          <Text className="text-[9px] font-bold uppercase text-taupe">
                            {item.category}
                          </Text>
                        </View>
                      ) : null}

                      {/* Status Tag */}
                      {isOut ? (
                        <View className="flex-row items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5">
                          <AlertCircle size={9} color="#E11D48" />
                          <Text className="text-[9px] font-black uppercase text-rose-700">
                            Out of Stock
                          </Text>
                        </View>
                      ) : isLow ? (
                        <View className="flex-row items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5">
                          <AlertTriangle size={9} color="#D97706" />
                          <Text className="text-[9px] font-black uppercase text-amber-700">
                            Low Stock (≤{threshold})
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5">
                          <View className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                          <Text className="text-[9px] font-bold uppercase text-emerald-800">
                            In Stock
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Quick Edit Button */}
                  <Pressable
                    onPress={() => handleOpenEditModal(item)}
                    hitSlop={8}
                    className="h-8 w-8 items-center justify-center rounded-xl border border-black/5 bg-champagne/50 active:scale-95">
                    <Pencil size={13} color="#8C7C70" />
                  </Pressable>
                </View>

                {item.notes ? (
                  <Text className="mt-2 text-xs font-medium text-taupe" numberOfLines={2}>
                    {item.notes}
                  </Text>
                ) : null}

                {/* ─── Bottom Stepper & Quantity Row ─── */}
                <View className="mt-3.5 flex-row items-center justify-between border-t border-black/[0.04] pt-2.5">
                  <Text className="text-[11px] font-semibold text-taupe">
                    Stock Level:
                  </Text>

                  {/* Stepper controls */}
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => handleQuickAdjustQuantity(item.id, -1)}
                      disabled={qty <= 0}
                      className={`h-8 w-8 items-center justify-center rounded-xl border border-black/5 active:scale-95 ${
                        qty <= 0 ? 'bg-black/5 opacity-40' : 'bg-champagne/70'
                      }`}>
                      <Minus size={13} color="#1C120C" />
                    </Pressable>

                    <View className="min-w-[70px] items-center rounded-xl border border-emerald-600/20 bg-emerald-50 px-2 py-1">
                      <Text className="text-xs font-black text-emerald-800">
                        {qty} {item.unit || 'units'}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => handleQuickAdjustQuantity(item.id, +1)}
                      className="h-8 w-8 items-center justify-center rounded-xl border border-black/5 bg-emerald-800 active:scale-95">
                      <Plus size={13} color="#FFFFFF" />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ─── Add / Edit Item Modal (Apple-styled Bottom Sheet) ─── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseModal}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <Pressable style={{ flex: 1 }} onPress={handleCloseModal} />

            {/* Modal Container Sheet */}
            <View
              style={{
                maxHeight: '88%',
                backgroundColor: '#ffffff',
                borderTopLeftRadius: 32,
                borderTopRightRadius: 32,
                paddingHorizontal: 20,
                paddingTop: 14,
                paddingBottom: Math.max(insets.bottom, 24),
              }}>
              {/* Grab Handle Pill */}
              <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-black/20" />

              {/* 1. Fixed Header */}
              <View className="flex-row items-center justify-between border-b border-black/5 pb-3">
                <View>
                  <Text className="text-base font-black text-espresso">
                    {editingItem ? 'Edit Supply Item' : 'Add New Supply Item'}
                  </Text>
                  <Text className="text-xs font-medium text-taupe">{facilityName}</Text>
                </View>

                <Pressable
                  onPress={handleCloseModal}
                  hitSlop={8}
                  className="h-8 w-8 items-center justify-center rounded-full bg-champagne active:scale-95">
                  <X size={15} color="#8C7C70" />
                </Pressable>
              </View>

              {/* 2. Auto-Scrolling Input Area with ScrollView */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 12, paddingBottom: 24 }}>
              {/* Supply Name */}
              <View className="mb-3.5">
                <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                  Supply / Tool Name *
                </Text>
                <TextInput
                  value={formName}
                  onChangeText={setFormName}
                  maxLength={255}
                  placeholder="e.g. Knapsack Sprayer (16L)"
                  placeholderTextColor="#8C7C70"
                  className="rounded-xl border border-black/10 bg-champagne/30 px-3 py-2.5 text-sm font-bold text-espresso"
                />
              </View>

              {/* Category Selection Chips with "Others" */}
              <View className="mb-3.5">
                <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                  Category
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row items-center gap-1.5">
                    {PRESET_CATEGORIES.map((cat) => {
                      const sel = formCategory.toLowerCase() === cat.toLowerCase();
                      return (
                        <Pressable
                          key={cat}
                          onPress={() => setFormCategory(cat)}
                          className={`rounded-xl px-3 py-1.5 active:scale-95 ${
                            sel ? 'bg-emerald-800' : 'border border-black/10 bg-champagne/40'
                          }`}>
                          <Text
                            className={`text-xs font-bold ${
                              sel ? 'text-white' : 'text-espresso'
                            }`}>
                            {cat}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* Others custom category input */}
                {formCategory === 'Others' && (
                  <View className="mt-2">
                    <TextInput
                      value={customCategory}
                      onChangeText={setCustomCategory}
                      maxLength={255}
                      placeholder="Type custom category (e.g. Pesticides, Packaging)..."
                      placeholderTextColor="#8C7C70"
                      className="rounded-xl border border-emerald-600/30 bg-emerald-50/50 px-3 py-2 text-xs font-bold text-espresso"
                    />
                  </View>
                )}
              </View>

              {/* Quantity & Low Stock Alert Threshold in Same Row */}
              <View className="mb-3.5 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                    Quantity *
                  </Text>
                  <TextInput
                    value={formQuantity}
                    onChangeText={setFormQuantity}
                    keyboardType="numeric"
                    maxLength={15}
                    placeholder="0"
                    placeholderTextColor="#8C7C70"
                    className="rounded-xl border border-black/10 bg-champagne/30 px-3 py-2.5 text-sm font-bold text-espresso"
                  />
                </View>

                <View className="flex-1">
                  <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                    Low Stock Alert
                  </Text>
                  <TextInput
                    value={formThreshold}
                    onChangeText={setFormThreshold}
                    keyboardType="numeric"
                    maxLength={15}
                    placeholder="5"
                    placeholderTextColor="#8C7C70"
                    className="rounded-xl border border-black/10 bg-champagne/30 px-3 py-2.5 text-sm font-bold text-espresso"
                  />
                </View>
              </View>

              {/* Unit Selection with "Others" (Selection Only, No Input Box) */}
              <View className="mb-3.5">
                <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                  Unit Selection
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row items-center gap-1.5">
                    {PRESET_UNITS.map((u) => {
                      const sel = formUnit.toLowerCase() === u.toLowerCase();
                      return (
                        <Pressable
                          key={u}
                          onPress={() => setFormUnit(u)}
                          className={`rounded-xl px-3 py-1.5 active:scale-95 ${
                            sel ? 'bg-cognac' : 'border border-black/10 bg-champagne/40'
                          }`}>
                          <Text
                            className={`text-xs font-bold ${
                              sel ? 'text-white' : 'text-espresso'
                            }`}>
                            {u}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* Others custom unit input */}
                {formUnit === 'Others' && (
                  <View className="mt-2">
                    <TextInput
                      value={customUnit}
                      onChangeText={setCustomUnit}
                      maxLength={255}
                      placeholder="Type custom unit (e.g. bundles, rolls, packs)..."
                      placeholderTextColor="#8C7C70"
                      className="rounded-xl border border-cognac/30 bg-cognac/5 px-3 py-2 text-xs font-bold text-espresso"
                    />
                  </View>
                )}
              </View>

              {/* Notes */}
              <View className="mb-2">
                <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                  Notes / Location (Optional)
                </Text>
                <TextInput
                  value={formNotes}
                  onChangeText={setFormNotes}
                  multiline
                  numberOfLines={3}
                  maxLength={3000}
                  placeholder="e.g. Shelf B2, calibrated on Sept 2"
                  placeholderTextColor="#8C7C70"
                  style={{ minHeight: 70 }}
                  className="rounded-xl border border-black/10 bg-champagne/30 p-3 text-xs font-medium text-espresso"
                />
              </View>
              </ScrollView>

              {/* 3. Fixed Footer / Actions */}
              <View className="flex-row items-center gap-3 border-t border-black/5 pt-3">
                {editingItem ? (
                  <Pressable
                    onPress={() => handleDeleteItem(editingItem.id)}
                    className="h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 active:scale-95">
                    <Trash2 size={16} color="#E11D48" />
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={handleCloseModal}
                  className="flex-1 rounded-2xl border border-black/10 bg-champagne/50 py-3 active:scale-95">
                  <Text className="text-center text-xs font-bold text-taupe">Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleSaveItem}
                  className="flex-1 rounded-2xl bg-emerald-800 py-3 active:scale-95">
                  <Text className="text-center text-xs font-bold text-white">
                    {editingItem ? 'Save Changes' : 'Add Item'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
