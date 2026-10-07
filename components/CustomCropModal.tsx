import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { AppAlert as Alert } from './common/AppAlert';
import { Modal, KeyboardAvoidingView } from './common/AppModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  X,
  Check,
  Trash2,
  Plus,
  Pencil,
  RotateCcw,
  Clock,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  Leaf,
  Layers,
} from 'lucide-react-native';
import {
  Crop,
  Milestone,
  parseMaturityDays,
  generateDefaultMilestones,
  saveCustomCrop,
  deleteCustomCrop,
} from '../lib/crop-planner';
import { type PhaseLabel } from '../lib/todo-list-engine';
import CropAvatar from './CropAvatar';
import { SproutIcon } from './learning/LearningIcons';

interface CustomCropModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (savedCrop: Crop) => void;
  onDeleted?: (cropName: string) => void;
  editCrop?: Crop | null;
  userId?: string;
}

const CROP_TYPES = [
  'Leafy Green',
  'Fruit Vegetable',
  'Herb',
  'Root Crop',
  'Legume',
  'Microgreens',
  'Other',
];

const SEASONS = ['Year-round', 'Dry Season', 'Wet Season'];
const NITROGEN_LEVELS = ['Low', 'Medium', 'High'];
const QUICK_MATURITY_PRESETS = [15, 25, 30, 45, 60, 90];

const PHASE_LABELS: { label: PhaseLabel; name: string; color: string; bg: string }[] = [
  { label: 'preparation', name: 'Preparation', color: '#1E40AF', bg: 'bg-blue-100 border-blue-300' },
  { label: 'growth', name: 'Growth / Care', color: '#047857', bg: 'bg-emerald-100 border-emerald-300' },
  { label: 'checkup', name: 'Checkup', color: '#B45309', bg: 'bg-amber-100 border-amber-300' },
];

export default function CustomCropModal({
  visible,
  onClose,
  onSaved,
  onDeleted,
  editCrop,
  userId,
}: CustomCropModalProps) {
  // Step Wizard State (1: Crop Info, 2: Milestones Schedule)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [isResumedDraft, setIsResumedDraft] = useState(false);

  // Step 1: Crop Profile State
  const [cropName, setCropName] = useState('');
  const [localName, setLocalName] = useState('');
  const [cropType, setCropType] = useState('Leafy Green');
  const [maturityDays, setMaturityDays] = useState('30');
  const [season, setSeason] = useState('Year-round');
  const [nitrogenDemand, setNitrogenDemand] = useState('Medium');
  const [soilBenefit, setSoilBenefit] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 2: Milestones State
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [hasManuallyEditedMilestones, setHasManuallyEditedMilestones] = useState(false);

  // Milestone Sub-Modal State
  const [milestoneEditorVisible, setMilestoneEditorVisible] = useState(false);
  const [editingMilestoneIndex, setEditingMilestoneIndex] = useState<number | null>(null);
  const [mOffsetDays, setMOffsetDays] = useState('0');
  const [mLabel, setMLabel] = useState<PhaseLabel>('growth');
  const [mTitle, setMTitle] = useState('');
  const [mDescription, setMDescription] = useState('');

  const getDraftKey = (uid?: string) => `soilsync:custom_crop_draft:${uid || 'guest'}`;

  // Save current form state as an in-progress draft
  const persistDraft = async (stepToSave?: 1 | 2) => {
    if (editCrop) return;
    const trimmedName = (cropName || '').trim();
    if (!trimmedName && (!notes || !notes.trim())) return;

    try {
      const draftData = {
        cropName,
        localName,
        cropType,
        maturityDays,
        season,
        nitrogenDemand,
        soilBenefit,
        notes,
        milestones,
        hasManuallyEditedMilestones,
        currentStep: stepToSave || currentStep,
        savedAt: Date.now(),
      };
      await AsyncStorage.setItem(getDraftKey(userId), JSON.stringify(draftData));
    } catch (e) {
      console.warn('[CustomCropModal] Error saving draft:', e);
    }
  };

  // Discard draft and reset form to default
  const discardDraft = async () => {
    try {
      await AsyncStorage.removeItem(getDraftKey(userId));
    } catch {}
    setIsResumedDraft(false);
    setCurrentStep(1);
    setCropName('');
    setLocalName('');
    setCropType('Leafy Green');
    setMaturityDays('30');
    setSeason('Year-round');
    setNitrogenDemand('Medium');
    setSoilBenefit('');
    setNotes('');
    setMilestones(generateDefaultMilestones('Custom Crop', 30));
    setHasManuallyEditedMilestones(false);
  };

  // Handle close attempt with unsaved changes prompt
  const handleAttemptClose = () => {
    if (editCrop) {
      onClose();
      return;
    }

    const hasContent = cropName.trim().length > 0 || (notes && notes.trim().length > 0);
    if (hasContent) {
      Alert.alert(
        'Save In-Progress Draft?',
        'You have an in-progress custom crop. Would you like to save it so you can resume anytime you open Add Crop?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard Draft',
            style: 'destructive',
            onPress: async () => {
              await discardDraft();
              onClose();
            },
          },
          {
            text: 'Save as Draft',
            onPress: async () => {
              await persistDraft();
              onClose();
            },
          },
        ]
      );
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (!visible) return;

    if (editCrop) {
      setIsResumedDraft(false);
      setCurrentStep(1);
      const name = editCrop.crop || '';
      const daysStr = editCrop.maturity_days || '30';
      const daysNum = parseMaturityDays(daysStr) || 30;

      setCropName(name);
      setLocalName(editCrop.local_name || '');
      setCropType(editCrop.type || 'Leafy Green');
      setMaturityDays(daysStr);
      setSeason(editCrop.season || 'Year-round');
      setNitrogenDemand(editCrop.nitrogen_demand || 'Medium');
      setSoilBenefit(editCrop.soil_benefit || '');
      setNotes(editCrop.notes || '');

      if (editCrop.milestones && editCrop.milestones.length > 0) {
        setMilestones(editCrop.milestones);
        setHasManuallyEditedMilestones(true);
      } else {
        setMilestones(generateDefaultMilestones(name || 'Custom Crop', daysNum));
        setHasManuallyEditedMilestones(false);
      }
    } else {
      // Creation mode: check if an existing draft is available to resume
      (async () => {
        try {
          const rawDraft = await AsyncStorage.getItem(getDraftKey(userId));
          if (rawDraft) {
            const draft = JSON.parse(rawDraft);
            if (draft && draft.cropName) {
              setCropName(draft.cropName || '');
              setLocalName(draft.localName || '');
              setCropType(draft.cropType || 'Leafy Green');
              setMaturityDays(draft.maturityDays || '30');
              setSeason(draft.season || 'Year-round');
              setNitrogenDemand(draft.nitrogenDemand || 'Medium');
              setSoilBenefit(draft.soilBenefit || '');
              setNotes(draft.notes || '');
              setMilestones(
                draft.milestones && draft.milestones.length > 0
                  ? draft.milestones
                  : generateDefaultMilestones(draft.cropName || 'Custom Crop', 30)
              );
              setHasManuallyEditedMilestones(!!draft.hasManuallyEditedMilestones);
              setCurrentStep(draft.currentStep || 1);
              setIsResumedDraft(true);
              return;
            }
          }
        } catch (err) {
          console.warn('[CustomCropModal] Draft recovery error:', err);
        }

        // Clean initial state if no draft exists
        setIsResumedDraft(false);
        setCurrentStep(1);
        setCropName('');
        setLocalName('');
        setCropType('Leafy Green');
        setMaturityDays('30');
        setSeason('Year-round');
        setNitrogenDemand('Medium');
        setSoilBenefit('');
        setNotes('');
        setMilestones(generateDefaultMilestones('Custom Crop', 30));
        setHasManuallyEditedMilestones(false);
      })();
    }
  }, [editCrop, visible, userId]);

  // Sync default milestones if user hasn't manually customized them yet
  const handleMaturityDaysChange = (text: string) => {
    setMaturityDays(text);
    if (!hasManuallyEditedMilestones) {
      const daysNum = parseMaturityDays(text) || 30;
      setMilestones(generateDefaultMilestones(cropName || 'Custom Crop', daysNum));
    }
  };

  const handleResetMilestones = () => {
    const daysNum = parseMaturityDays(maturityDays) || 30;
    setMilestones(generateDefaultMilestones(cropName || 'Custom Crop', daysNum));
    setHasManuallyEditedMilestones(false);
  };

  const handleOpenAddMilestone = () => {
    setEditingMilestoneIndex(null);
    setMOffsetDays('0');
    setMLabel('growth');
    setMTitle('');
    setMDescription('');
    setMilestoneEditorVisible(true);
  };

  const handleOpenEditMilestone = (index: number) => {
    const m = milestones[index];
    if (!m) return;
    setEditingMilestoneIndex(index);
    setMOffsetDays(String(m.offset_days));
    setMLabel(m.label);
    setMTitle(m.title);
    setMDescription(m.description);
    setMilestoneEditorVisible(true);
  };

  const handleDeleteMilestone = (index: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
    setHasManuallyEditedMilestones(true);
  };

  const handleSaveMilestoneForm = () => {
    const trimmedTitle = mTitle.trim();
    if (!trimmedTitle) {
      Alert.alert('Title Required', 'Please enter a title for this milestone task.');
      return;
    }

    const parsedDay = parseInt(mOffsetDays.replace(/[^0-9]/g, ''), 10);
    const dayOffset = Number.isNaN(parsedDay) ? 0 : parsedDay;

    const newM: Milestone = {
      offset_days: dayOffset,
      label: mLabel,
      title: trimmedTitle,
      description: mDescription.trim() || `Task scheduled for Day ${dayOffset}.`,
    };

    setMilestones((prev) => {
      let updated: Milestone[];
      if (editingMilestoneIndex !== null && editingMilestoneIndex >= 0) {
        updated = prev.map((item, idx) => (idx === editingMilestoneIndex ? newM : item));
      } else {
        updated = [...prev, newM];
      }
      return updated.sort((a, b) => a.offset_days - b.offset_days);
    });

    setHasManuallyEditedMilestones(true);
    setMilestoneEditorVisible(false);
  };

  // Step 1 Validation & Proceed to Step 2
  const handleProceedToStep2 = () => {
    const trimmedName = (cropName || '').trim();
    if (!trimmedName) {
      Alert.alert('Crop Name Required', 'Please enter a name for your custom crop before proceeding.');
      return;
    }

    const trimmedDays = (maturityDays || '').trim();
    if (!trimmedDays || Number.isNaN(Number.parseInt(trimmedDays.split('-')[0], 10))) {
      Alert.alert('Maturity Days Required', 'Please specify the days to harvest (e.g. 25 or 25-30).');
      return;
    }

    // If user hasn't customized milestones, sync with updated crop name & days
    if (!hasManuallyEditedMilestones) {
      const daysNum = parseMaturityDays(trimmedDays) || 30;
      setMilestones(generateDefaultMilestones(trimmedName, daysNum));
    }

    // Persist draft for Step 2
    persistDraft(2);
    setCurrentStep(2);
  };

  // Step 2 Save
  const handleSave = async () => {
    const trimmedName = (cropName || '').trim();
    if (!trimmedName) {
      Alert.alert('Crop Name Required', 'Please enter a name for your custom crop.');
      setCurrentStep(1);
      return;
    }

    const trimmedDays = (maturityDays || '').trim();
    if (!trimmedDays || Number.isNaN(Number.parseInt(trimmedDays.split('-')[0], 10))) {
      Alert.alert('Maturity Days Required', 'Please specify the days to harvest.');
      setCurrentStep(1);
      return;
    }

    if (milestones.length === 0) {
      Alert.alert(
        'Milestones Required',
        'Please include at least one milestone task for this crop before saving.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const sortedMilestones = [...milestones].sort((a, b) => a.offset_days - b.offset_days);

      const newCrop: Crop = {
        id: editCrop?.id,
        crop: trimmedName,
        local_name: (localName || '').trim() || undefined,
        type: cropType || 'Leafy Green',
        maturity_days: trimmedDays,
        season: season || 'Year-round',
        nitrogen_demand: nitrogenDemand || 'Medium',
        soil_benefit: (soilBenefit || '').trim() || undefined,
        notes: (notes || '').trim() || undefined,
        milestones: sortedMilestones,
        is_custom: true,
      };

      // If editing an existing crop and its name changed, clean up the old record
      if (editCrop && editCrop.crop && editCrop.crop !== trimmedName) {
        try {
          await deleteCustomCrop(editCrop.crop, userId);
        } catch (delOldErr) {
          console.warn('[CustomCropModal] Failed to clean up renamed crop:', delOldErr);
        }
      }

      const saved = await saveCustomCrop(newCrop, userId);

      // Clear draft upon successful save
      try {
        await AsyncStorage.removeItem(getDraftKey(userId));
      } catch {}
      setIsResumedDraft(false);

      onSaved(saved);
      onClose();
    } catch (e: any) {
      Alert.alert('Error Saving Crop', e?.message || 'Could not save custom crop.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editCrop) return;
    Alert.alert(
      'Delete Custom Crop',
      `Are you sure you want to remove "${editCrop.crop}" from your crop catalog?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCustomCrop(editCrop.crop, userId);
              if (onDeleted) onDeleted(editCrop.crop);
              onClose();
            } catch (e: any) {
              Alert.alert('Error Deleting', e?.message || 'Failed to remove crop.');
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
      transparent={true}
      statusBarTranslucent
      onRequestClose={handleAttemptClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-1 justify-end bg-black/60">
          <View className="max-h-[92%] w-full rounded-t-[36px] border-t border-cognac/20 bg-champagne overflow-hidden shadow-2xl">
          {/* Header */}
          <View className="border-b border-cognac/15 bg-champagne px-6 pt-5 pb-3.5">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-cognac/10 border border-cognac/25 shadow-xs">
                  <SproutIcon size={22} color="#8C4522" />
                </View>
                <View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-lg font-black text-espresso">
                      {editCrop ? 'Edit Custom Crop' : 'New Custom Crop'}
                    </Text>
                    <View className="rounded-full border border-cognac/25 bg-cognac/10 px-2 py-0.5">
                      <Text className="text-[10px] font-black text-cognac uppercase">Custom</Text>
                    </View>
                  </View>
                  <Text className="text-xs font-semibold text-taupe mt-0.5">
                    {currentStep === 1
                      ? 'Step 1 of 2: Crop Profile & Agronomics'
                      : 'Step 2 of 2: Milestone Schedule & Protocols'}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={handleAttemptClose}
                className="h-9 w-9 items-center justify-center rounded-full border border-cognac/20 bg-cognac/10 active:scale-95">
                <X size={18} color="#8C4522" strokeWidth={2.2} />
              </Pressable>
            </View>

            {/* Step Progress Pill Indicator */}
            <View className="mt-3.5 flex-row items-center gap-2">
              <Pressable
                key="tab-step-1"
                onPress={() => setCurrentStep(1)}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 border ${
                  currentStep === 1
                    ? 'bg-cognac border-cognac'
                    : 'bg-cognac/5 border-cognac/20'
                }`}>
                <Text
                  className={`text-[11px] uppercase ${
                    currentStep === 1 ? 'font-black text-white' : 'font-bold text-cognac'
                  }`}>
                  1. Crop Profile
                </Text>
              </Pressable>

              <Pressable
                key="tab-step-2"
                onPress={() => {
                  if (cropName.trim()) {
                    handleProceedToStep2();
                  }
                }}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 border ${
                  currentStep === 2
                    ? 'bg-cognac border-cognac'
                    : 'bg-black/5 border-cognac/15'
                }`}>
                <Text
                  className={`text-[11px] uppercase ${
                    currentStep === 2 ? 'font-black text-white' : 'font-bold text-taupe'
                  }`}>
                  2. Milestone Protocols
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Form Body */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36 }}>
            {/* Resumed In-Progress Draft Banner */}
            {isResumedDraft && !editCrop && (
              <View className="mb-4 flex-row items-center justify-between rounded-2xl border border-cognac/25 bg-cognac/[0.06] p-3.5 shadow-xs">
                <View className="flex-1 flex-row items-center gap-2.5 pr-2">
                  <View className="h-7 w-7 items-center justify-center rounded-xl bg-cognac/15">
                    <Sparkles size={14} color="#8C4522" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-black text-espresso">
                      Resumed Unsaved Draft (Step {currentStep} of 2)
                    </Text>
                    <Text className="text-[11px] text-taupe">
                      Pick up right where you left off.
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      'Discard Draft',
                      'Are you sure you want to discard this draft and start a new custom crop from scratch?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Discard & Reset',
                          style: 'destructive',
                          onPress: discardDraft,
                        },
                      ]
                    );
                  }}
                  className="rounded-xl border border-cognac/25 bg-white px-2.5 py-1.5 active:scale-95 shadow-2xs">
                  <Text className="text-[11px] font-bold text-cognac">Discard</Text>
                </Pressable>
              </View>
            )}

            {/* ======================================================== */}
            {/* STEP 1: CROP PROFILE & AGRONOMICS                        */}
            {/* ======================================================== */}
            {currentStep === 1 && (
              <View>
                {/* Live Avatar Preview Card */}
                <View className="mb-5 flex-row items-center gap-4 rounded-[24px] border border-cognac/20 bg-cognac/[0.04] p-4 shadow-xs">
                  <CropAvatar
                    cropName={cropName || 'Preview'}
                    cropType={cropType}
                    isCustom={true}
                    size="lg"
                  />
                  <View className="flex-1">
                    <Text className="text-base font-black text-espresso" numberOfLines={1}>
                      {cropName.trim() || 'New Crop Variety'}
                    </Text>
                    <View className="mt-1 flex-row items-center flex-wrap gap-1.5">
                      <View className="rounded-md border border-cognac/20 bg-cognac/10 px-2 py-0.5">
                        <Text className="text-[10px] font-bold text-cognac uppercase">
                          {cropType}
                        </Text>
                      </View>
                      <View className="rounded-md border border-cognac/15 bg-white px-2 py-0.5">
                        <Text className="text-[10px] font-bold text-espresso">
                          {maturityDays} Days
                        </Text>
                      </View>
                      <View className="rounded-md border border-cognac/15 bg-white px-2 py-0.5">
                        <Text className="text-[10px] font-medium text-taupe">
                          {season}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-[11px] text-taupe mt-1.5">
                      {milestones.length} milestone protocols configured.
                    </Text>
                  </View>
                </View>

                {/* Group 1: Crop Identity & Classification */}
                <View className="mb-2 flex-row items-center gap-2">
                  <View className="h-5 w-5 items-center justify-center rounded-md bg-cognac/10">
                    <Leaf size={12} color="#8C4522" />
                  </View>
                  <Text className="text-xs font-black uppercase tracking-wider text-cognac">
                    Basic Identity
                  </Text>
                </View>

                <View className="mb-5 rounded-[26px] border border-cognac/15 bg-white p-5 shadow-xs">
                  {/* Crop Name */}
                  <View>
                    <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                      Crop Name <Text className="text-rose-600">*</Text>
                    </Text>
                    <TextInput
                      value={cropName}
                      onChangeText={setCropName}
                      maxLength={255}
                      placeholder="e.g. Red Rubin Basil, Heirloom Kale"
                      placeholderTextColor="#8C7C70"
                      className="rounded-2xl border border-cognac/20 bg-champagne/40 px-4 py-3.5 text-base font-semibold text-espresso"
                    />
                  </View>

                  {/* Local Variety */}
                  <View className="mt-4">
                    <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                      Local Variety / Native Name (Optional)
                    </Text>
                    <TextInput
                      value={localName}
                      onChangeText={setLocalName}
                      maxLength={255}
                      placeholder="e.g. Lila Albahaca, Native Pechay"
                      placeholderTextColor="#8C7C70"
                      className="rounded-2xl border border-cognac/20 bg-champagne/40 px-4 py-3 text-sm font-semibold text-espresso"
                    />
                  </View>

                  {/* Category Pills */}
                  <View className="mt-4">
                    <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-espresso">
                      Crop Category
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View className="flex-row gap-2">
                        {CROP_TYPES.map((type) => {
                          const isSelected = cropType === type;
                          return (
                            <Pressable
                              key={type}
                              onPress={() => setCropType(type)}
                              className={`rounded-2xl border px-3.5 py-2 active:scale-95 ${
                                isSelected
                                  ? 'border-cognac bg-cognac'
                                  : 'border-cognac/20 bg-champagne/40'
                              }`}>
                              <Text
                                className={`text-xs font-bold ${
                                  isSelected ? 'text-white' : 'text-espresso'
                                }`}>
                                {type}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                </View>

                {/* Group 2: Growth Cycle & Timing */}
                <View className="mb-2 flex-row items-center gap-2">
                  <View className="h-5 w-5 items-center justify-center rounded-md bg-cognac/10">
                    <Clock size={12} color="#8C4522" />
                  </View>
                  <Text className="text-xs font-black uppercase tracking-wider text-cognac">
                    Harvest & Growth Conditions
                  </Text>
                </View>

                <View className="mb-5 rounded-[26px] border border-cognac/15 bg-white p-5 shadow-xs">
                  {/* Maturity Days */}
                  <View>
                    <View className="mb-1.5 flex-row items-center justify-between">
                      <Text className="text-xs font-bold uppercase tracking-wider text-espresso">
                        Days to Harvest <Text className="text-rose-600">*</Text>
                      </Text>
                      <Text className="text-xs font-bold text-cognac">e.g. 15, 25-30, 45</Text>
                    </View>

                    <TextInput
                      value={maturityDays}
                      onChangeText={handleMaturityDaysChange}
                      maxLength={10}
                      placeholder="Days from seed to harvest (e.g. 25-30)"
                      placeholderTextColor="#8C7C70"
                      keyboardType="numeric"
                      className="mb-3 rounded-2xl border border-cognac/20 bg-champagne/40 px-4 py-3.5 text-base font-semibold text-espresso"
                    />

                    {/* Quick Presets */}
                    <View className="flex-row flex-wrap gap-2">
                      {QUICK_MATURITY_PRESETS.map((daysPreset) => {
                        const isMatch = maturityDays === String(daysPreset);
                        return (
                          <Pressable
                            key={daysPreset}
                            onPress={() => handleMaturityDaysChange(String(daysPreset))}
                            className={`rounded-xl border px-3 py-1.5 active:scale-95 ${
                              isMatch
                                ? 'border-cognac bg-cognac'
                                : 'border-cognac/15 bg-champagne/60'
                            }`}>
                            <Text
                              className={`text-xs font-bold ${
                                isMatch ? 'text-white' : 'text-espresso'
                              }`}>
                              {daysPreset} Days
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className="my-4 h-px bg-cognac/10" />

                  {/* Target Season */}
                  <View>
                    <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-espresso">
                      Target Season
                    </Text>
                    <View className="flex-row gap-2">
                      {SEASONS.map((s) => {
                        const isSelected = season === s;
                        return (
                          <Pressable
                            key={s}
                            onPress={() => setSeason(s)}
                            className={`flex-1 items-center justify-center rounded-2xl border py-2.5 active:scale-95 ${
                              isSelected
                                ? 'border-cognac bg-cognac'
                                : 'border-cognac/20 bg-champagne/40'
                            }`}>
                            <Text
                              className={`text-xs font-bold ${
                                isSelected ? 'text-white' : 'text-espresso'
                              }`}>
                              {s}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className="my-4 h-px bg-cognac/10" />

                  {/* Nitrogen Demand */}
                  <View>
                    <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-espresso">
                      Nitrogen Demand
                    </Text>
                    <View className="flex-row gap-2">
                      {NITROGEN_LEVELS.map((level) => {
                        const isSelected = nitrogenDemand === level;
                        return (
                          <Pressable
                            key={level}
                            onPress={() => setNitrogenDemand(level)}
                            className={`flex-1 items-center justify-center rounded-2xl border py-2.5 active:scale-95 ${
                              isSelected
                                ? 'border-cognac bg-cognac'
                                : 'border-cognac/20 bg-champagne/40'
                            }`}>
                            <Text
                              className={`text-xs font-bold ${
                                isSelected ? 'text-white' : 'text-espresso'
                              }`}>
                              {level}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {/* Group 3: Soil Impact & Care Notes */}
                <View className="mb-2 flex-row items-center gap-2">
                  <View className="h-5 w-5 items-center justify-center rounded-md bg-cognac/10">
                    <SproutIcon size={12} color="#8C4522" />
                  </View>
                  <Text className="text-xs font-black uppercase tracking-wider text-cognac">
                    Soil & Companion Insights
                  </Text>
                </View>

                <View className="mb-6 rounded-[26px] border border-cognac/15 bg-white p-5 shadow-xs">
                  {/* Soil Benefit */}
                  <View>
                    <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                      Soil Benefit / Companion Perks (Optional)
                    </Text>
                    <TextInput
                      value={soilBenefit}
                      onChangeText={setSoilBenefit}
                      maxLength={3000}
                      placeholder="e.g. Deep taproot breaks heavy soil, fixes atmospheric nitrogen, natural pest deterrent"
                      placeholderTextColor="#8C7C70"
                      multiline
                      numberOfLines={2}
                      className="rounded-2xl border border-cognac/20 bg-champagne/40 p-3.5 text-sm font-semibold text-espresso min-h-[72px]"
                    />
                  </View>

                  <View className="my-4 h-px bg-cognac/10" />

                  {/* Care & Growing Notes */}
                  <View>
                    <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                      Care & Protocol Notes (Optional)
                    </Text>
                    <TextInput
                      value={notes}
                      onChangeText={setNotes}
                      maxLength={3000}
                      placeholder="e.g. Prefers moist well-drained loam with morning sun. Space 15cm apart."
                      placeholderTextColor="#8C7C70"
                      multiline
                      numberOfLines={2}
                      className="rounded-2xl border border-cognac/20 bg-champagne/40 p-3.5 text-sm font-semibold text-espresso min-h-[72px]"
                    />
                  </View>
                </View>

                {/* Step 1 Footer Action */}
                <View className="flex-row items-center gap-3 pt-1">
                  {editCrop && (
                    <Pressable
                      onPress={handleDelete}
                      className="h-14 w-14 items-center justify-center rounded-2xl border border-rose-300 bg-rose-50 active:scale-95">
                      <Trash2 size={20} color="#DC2626" />
                    </Pressable>
                  )}

                  <Pressable
                    onPress={handleProceedToStep2}
                    className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-cognac active:scale-[0.99] shadow-md shadow-cognac/30 py-3.5">
                    <Text className="text-base font-black text-white">Next: Milestone Protocols</Text>
                    <ChevronRight size={18} color="#FFFFFF" strokeWidth={2.5} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* ======================================================== */}
            {/* STEP 2: MILESTONES & CARE PROTOCOLS                      */}
            {/* ======================================================== */}
            {currentStep === 2 && (
              <View>
                {/* Crop Summary Card */}
                <View className="mb-5 flex-row items-center justify-between rounded-[24px] border border-cognac/20 bg-cognac/[0.04] p-4">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-black text-espresso" numberOfLines={1}>{cropName}</Text>
                    <Text className="text-xs font-bold text-cognac mt-0.5">
                      {cropType} • {maturityDays} Days • {season}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setCurrentStep(1)}
                    className="rounded-xl border border-cognac/25 bg-white px-3.5 py-1.5 active:scale-95 shadow-2xs">
                    <Text className="text-xs font-bold text-cognac">Edit Profile</Text>
                  </Pressable>
                </View>

                {/* Milestone Schedule List Container */}
                <View className="mb-5 rounded-[28px] border border-cognac/15 bg-white p-5 shadow-sm">
                  <View className="mb-4 flex-row items-center justify-between gap-2">
                    <View className="flex-1 pr-1">
                      <Text className="text-base font-black text-espresso">Milestone Schedule</Text>
                      <Text className="text-xs font-semibold text-taupe mt-0.5" numberOfLines={1}>
                        {milestones.length} tasks • Planting to harvest
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2 shrink-0">
                      <Pressable
                        onPress={handleResetMilestones}
                        className="flex-row items-center gap-1 rounded-xl border border-cognac/20 bg-cognac/5 px-2.5 py-1.5 active:scale-95">
                        <RotateCcw size={12} color="#8C4522" />
                        <Text className="text-[11px] font-bold text-cognac">Reset</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleOpenAddMilestone}
                        className="flex-row items-center gap-1.5 rounded-xl bg-cognac px-3 py-1.5 active:scale-95 shadow-xs shadow-cognac/30">
                        <Plus size={13} color="#FFFFFF" strokeWidth={2.5} />
                        <Text className="text-xs font-bold text-white">Add Task</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Milestones Timeline */}
                  <View className="border-l-2 border-cognac/25 pl-3.5 ml-1.5 my-2">
                    {milestones.map((m, index) => {
                      const phaseObj =
                        PHASE_LABELS.find((p) => p.label === m.label) || PHASE_LABELS[1];

                      return (
                        <View
                          key={`milestone-${index}-${m.offset_days}`}
                          className="relative mb-3.5 rounded-2xl border border-cognac/15 bg-champagne/50 p-3.5 shadow-2xs">
                          {/* Timeline dot */}
                          <View className="absolute -left-[21px] top-4 h-3 w-3 rounded-full border-2 border-white bg-cognac" />

                          <View className="flex-row items-start justify-between">
                            <View className="flex-1 mr-2">
                              <View className="flex-row items-center gap-1.5 mb-1">
                                <View className="rounded-md bg-cognac px-2 py-0.5">
                                  <Text className="text-[10px] font-black text-white uppercase">
                                    Day {m.offset_days}
                                  </Text>
                                </View>
                                <View
                                  className={`rounded-md px-1.5 py-0.5 border ${phaseObj.bg}`}>
                                  <Text
                                    style={{ color: phaseObj.color }}
                                    className="text-[10px] font-bold uppercase">
                                    {phaseObj.name}
                                  </Text>
                                </View>
                              </View>
                              <Text className="text-sm font-bold text-espresso">{m.title}</Text>
                              <Text className="text-xs text-taupe mt-0.5 leading-snug" numberOfLines={2}>
                                {m.description}
                              </Text>
                            </View>

                            {/* Actions */}
                            <View className="flex-row items-center gap-1.5">
                              <Pressable
                                onPress={() => handleOpenEditMilestone(index)}
                                hitSlop={8}
                                accessibilityLabel="Edit milestone protocol"
                                accessibilityRole="button"
                                className="h-8 w-8 items-center justify-center rounded-lg border border-cognac/20 bg-cognac/10 active:scale-95">
                                <Pencil size={13} color="#8C4522" strokeWidth={2.2} />
                              </Pressable>
                              <Pressable
                                onPress={() => handleDeleteMilestone(index)}
                                hitSlop={8}
                                accessibilityLabel="Delete milestone protocol"
                                accessibilityRole="button"
                                className="h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 active:scale-95">
                                <Trash2 size={13} color="#DC2626" />
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {/* Add Task Button at bottom of timeline */}
                  <Pressable
                    onPress={handleOpenAddMilestone}
                    className="mt-3 flex-row items-center justify-center gap-1.5 rounded-2xl border border-dashed border-cognac/40 bg-cognac/5 py-3 active:scale-[0.99]">
                    <Plus size={14} color="#8C4522" strokeWidth={2.5} />
                    <Text className="text-xs font-black text-cognac">Add Milestone Protocol</Text>
                  </Pressable>
                </View>

                {/* Step 2 Footer Actions */}
                <View className="flex-row gap-3 pt-1">
                  <Pressable
                    onPress={() => setCurrentStep(1)}
                    className="h-14 flex-row items-center justify-center gap-1.5 rounded-2xl border border-cognac/25 bg-white px-5 active:scale-95 shadow-2xs">
                    <ArrowLeft size={18} color="#8C4522" strokeWidth={2.2} />
                    <Text className="text-sm font-black text-espresso">Back</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleSave}
                    disabled={isSubmitting}
                    className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-cognac active:scale-[0.99] disabled:opacity-50 shadow-md shadow-cognac/30 py-3.5">
                    <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text className="text-base font-black text-white">
                      {editCrop ? 'Update Custom Crop' : 'Save Custom Crop'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>

      {/* --- Milestone Add/Edit Sub-Modal --- */}
      <Modal
        visible={milestoneEditorVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMilestoneEditorVisible(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="flex-1 items-center justify-center bg-black/60 px-5">
          <View className="w-full max-w-md rounded-[28px] border border-cognac/20 bg-champagne p-6 shadow-2xl">
            <View className="mb-4 flex-row items-center justify-between border-b border-cognac/15 pb-3">
              <Text className="text-lg font-black text-espresso">
                {editingMilestoneIndex !== null ? 'Edit Milestone Task' : 'Add Milestone Task'}
              </Text>
              <Pressable
                onPress={() => setMilestoneEditorVisible(false)}
                className="h-8 w-8 items-center justify-center rounded-full border border-cognac/20 bg-cognac/10 active:scale-95">
                <X size={16} color="#8C4522" strokeWidth={2.2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Day Offset */}
              <View className="mb-4">
                <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                  Day Offset (Days from planting) <Text className="text-rose-600">*</Text>
                </Text>
                <TextInput
                  value={mOffsetDays}
                  onChangeText={setMOffsetDays}
                  keyboardType="numeric"
                  maxLength={5}
                  placeholder="e.g. 0 for sowing, 14 for feeding"
                  placeholderTextColor="#8C7C70"
                  className="rounded-2xl border border-cognac/20 bg-white px-4 py-3 text-base font-semibold text-espresso"
                />
              </View>

              {/* Phase Category */}
              <View className="mb-4">
                <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                  Phase Type
                </Text>
                <View className="flex-row gap-2">
                  {PHASE_LABELS.map((p) => {
                    const isSelected = mLabel === p.label;
                    return (
                      <Pressable
                        key={p.label}
                        onPress={() => setMLabel(p.label)}
                        className={`flex-1 items-center justify-center rounded-2xl border py-2.5 active:scale-95 ${
                          isSelected ? p.bg : 'border-cognac/20 bg-white'
                        }`}>
                        <Text
                          style={{ color: isSelected ? p.color : '#8C7C70' }}
                          className="text-xs font-bold">
                          {p.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Task Title */}
              <View className="mb-4">
                <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                  Task Title <Text className="text-rose-600">*</Text>
                </Text>
                <TextInput
                  value={mTitle}
                  onChangeText={setMTitle}
                  maxLength={255}
                  placeholder="e.g. Apply Foliar Nutrient Spray"
                  placeholderTextColor="#8C7C70"
                  className="rounded-2xl border border-cognac/20 bg-white px-4 py-3 text-sm font-semibold text-espresso"
                />
              </View>

              {/* Description */}
              <View className="mb-5">
                <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-espresso">
                  Instructions / Description
                </Text>
                <TextInput
                  value={mDescription}
                  onChangeText={setMDescription}
                  multiline
                  numberOfLines={3}
                  maxLength={3000}
                  placeholder="e.g. Dilute 2 tbsp FPJ into 1L water and spray evenly during late afternoon."
                  placeholderTextColor="#8C7C70"
                  className="rounded-2xl border border-cognac/20 bg-white p-3.5 text-sm font-semibold text-espresso min-h-[76px]"
                />
              </View>

              {/* Actions */}
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => setMilestoneEditorVisible(false)}
                  className="flex-1 rounded-2xl border border-cognac/25 bg-white py-3.5 active:scale-95 shadow-2xs">
                  <Text className="text-center text-sm font-bold text-taupe">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveMilestoneForm}
                  className="flex-1 rounded-2xl bg-cognac py-3.5 active:scale-95 shadow-md shadow-cognac/30">
                  <Text className="text-center text-sm font-black text-white">Save Task</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>
  );
}
