import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { useState, useCallback, useMemo } from 'react';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuth } from '../../lib/AuthContext';
import { BackButton } from '../../components/common/BackButton';
import {
  Sparkles,
  Calendar as CalendarIcon,
  Layers,
  FileText,
  ChevronDown,
  Check,
  Building2,
  Sprout,
  ShieldAlert,
  AlertTriangle,
  Plus,
  ChevronRight,
  Activity,
} from '../../components/Icons';
import {
  createTodo,
  getFarmsByUser,
  fetchMitigationPlanFromDB,
  fetchDynamicProblemClassesFromDB,
  saveMitigationTodos,
  ProblemClassItem,
} from '../../lib/db-operations';
import { Mitigation } from '../../lib/todo-list-engine';
import { useAccessibility } from '../../lib/accessibility';

type FarmRecord = {
  id: string;
  farm_name: string;
  location?: string | null;
  area_sqm?: number | null;
};

type DatePickerField = 'startDate' | 'dueDate';
type ScreenMode = 'single' | 'mitigation';

const PHASES = [
  { id: 'preparation', label: 'Preparation', icon: Layers },
  { id: 'growth', label: 'Growth', icon: Sprout },
  { id: 'harvest', label: 'Harvest', icon: Sparkles },
  { id: 'fertilizer', label: 'Fertilizer', icon: Layers },
  { id: 'pest control', label: 'Pest Control', icon: Layers },
] as const;

type PhaseId = (typeof PHASES)[number]['id'];

interface TemplateItem {
  id: string;
  name: string;
  title: string;
  notes: string;
  phase?: PhaseId;
}

const TEMPLATES: TemplateItem[] = [
  {
    id: 'checkup',
    name: 'Crop Check-up',
    title: 'Check-up : Crop Inspection',
    notes: 'Take a picture of your crop\n\nPhase: checkup\n\n[Template Task]',
    phase: undefined,
  },
  {
    id: 'fertilizer',
    name: 'Fertilizer Application',
    title: 'Apply Organic Fertilizer',
    notes: 'Apply recommended dosage of organic fertilizer across all active plots.',
    phase: 'fertilizer',
  },
  {
    id: 'pest_control',
    name: 'Pest Inspection',
    title: 'Inspect & Treat Pests',
    notes: 'Check undersides of leaves for aphid, mite, or insect activity.',
    phase: 'pest control',
  },
  {
    id: 'harvest',
    name: 'Harvest Produce',
    title: 'Harvest Ready Crops',
    notes: 'Harvest mature produce and log actual harvest yield.',
    phase: 'harvest',
  },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDateLabel(dateKey: string) {
  const date = fromDateKey(dateKey);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

type FieldErrors = {
  title?: string;
  startDate?: string;
  dueDate?: string;
  farmId?: string;
};

export default function AddTodoScreen() {
  const { user } = useAuth();
  const { fontScale, isGloveMode, isHighContrast, triggerHaptic } = useAccessibility();
  const params = useLocalSearchParams<{ farmId?: string; date?: string; mode?: string }>();
  const todayKey = toDateKey(new Date());
  const initialDate = params.date || todayKey;
  const initialFarmId = params.farmId || '';

  const hitSlop = isGloveMode
    ? { top: 12, bottom: 12, left: 12, right: 12 }
    : { top: 6, bottom: 6, left: 6, right: 6 };
  const gloveMinHeight = isGloveMode ? 52 : undefined;

  // Mode Switcher: Single Task vs Mitigation Protocol
  const [activeMode, setActiveMode] = useState<ScreenMode>(
    params.mode === 'mitigation' ? 'mitigation' : 'single'
  );

  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingMitigation, setSavingMitigation] = useState(false);

  // Single Task Fields
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<PhaseId | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(initialDate);
  const [dueDate, setDueDate] = useState(initialDate);

  // Farm Selection State
  const [selectedFarmId, setSelectedFarmId] = useState(initialFarmId);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [farmSearchQuery, setFarmSearchQuery] = useState('');

  // Mitigation Protocol State
  const [problemClasses, setProblemClasses] = useState<ProblemClassItem[]>([]);
  const [selectedProblemClass, setSelectedProblemClass] = useState<ProblemClassItem | null>(null);
  const [mitigationSteps, setMitigationSteps] = useState<Mitigation[]>([]);
  const [loadingMitigations, setLoadingMitigations] = useState(false);

  // Date Picker State
  const [datePickerField, setDatePickerField] = useState<DatePickerField | null>(null);
  const [datePickerValue, setDatePickerValue] = useState(new Date());

  const [errors, setErrors] = useState<FieldErrors>({});

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);
      Promise.all([getFarmsByUser(user.id), fetchDynamicProblemClassesFromDB()])
        .then(([farmResult, problemsResult]) => {
          const farmList = farmResult as FarmRecord[];
          setFarms(farmList);
          setSelectedFarmId((current) => current || farmList[0]?.id || '');
          setProblemClasses(problemsResult);
        })
        .catch((err) => Alert.alert('Error', err.message))
        .finally(() => setLoading(false));
    }, [user])
  );

  // Filter farms based on search query
  const filteredFarms = useMemo(() => {
    return farms.filter((farm) =>
      farm.farm_name.toLowerCase().includes(farmSearchQuery.toLowerCase())
    );
  }, [farms, farmSearchQuery]);

  // Currently selected farm record
  const selectedFarm = useMemo(() => {
    return farms.find((farm) => farm.id === selectedFarmId);
  }, [farms, selectedFarmId]);

  const isCheckupTemplate = activeTemplateId === 'checkup';

  const handleApplyTemplate = (tmpl: TemplateItem) => {
    if (activeTemplateId === tmpl.id) {
      // Unselect template and clear fields gracefully
      setActiveTemplateId(null);
      setTitle('');
      setNotes('');
      setSelectedPhase(null);
    } else {
      // Select template
      setTitle(tmpl.title);
      setNotes(tmpl.notes);
      setSelectedPhase(tmpl.phase ?? null);
      setActiveTemplateId(tmpl.id);
      setErrors((e) => ({ ...e, title: undefined }));
    }
  };

  const handleTogglePhase = (phaseId: PhaseId) => {
    setSelectedPhase((prev) => (prev === phaseId ? null : phaseId));
  };

  const handleSelectProblemClass = async (problem: ProblemClassItem) => {
    if (selectedProblemClass?.id === problem.id) {
      setSelectedProblemClass(null);
      setMitigationSteps([]);
      return;
    }
    setSelectedProblemClass(problem);
    setLoadingMitigations(true);
    try {
      const steps = await fetchMitigationPlanFromDB(problem.id);
      setMitigationSteps(steps);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load mitigation steps.');
    } finally {
      setLoadingMitigations(false);
    }
  };

  const handleAddMitigationTasks = async () => {
    if (!user) return;
    if (!selectedFarmId) {
      Alert.alert('Select Farm', 'Please select a target farm before deploying mitigation tasks.');
      return;
    }
    if (!selectedProblemClass || mitigationSteps.length === 0) {
      Alert.alert('Notice', 'Please choose a problem class with active mitigation steps.');
      return;
    }

    try {
      setSavingMitigation(true);
      await saveMitigationTodos({
        userId: user.id,
        farmId: selectedFarmId,
        problemName: selectedProblemClass.name,
        mitigationSteps: mitigationSteps.map((s) => ({
          title: s.title,
          description: s.description,
        })),
      });

      Alert.alert(
        'Mitigation Plan Deployed',
        `Scheduled ${mitigationSteps.length} treatment tasks for "${selectedProblemClass.name}" to ${selectedFarm?.farm_name || 'your farm'}.`,
        [
          {
            text: 'View in Calendar',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save mitigation tasks.');
    } finally {
      setSavingMitigation(false);
    }
  };

  function validate(): boolean {
    const newErrors: FieldErrors = {};
    if (!title.trim()) newErrors.title = 'Task title is required.';
    if (!startDate) newErrors.startDate = 'Start date is required.';
    if (!dueDate) newErrors.dueDate = 'Due date is required.';
    if (!selectedFarmId) newErrors.farmId = 'Please select a farm.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  const handleSaveSingleTask = async () => {
    if (!user) return;
    if (!validate()) return;

    let finalNotes = notes.trim();

    // If user chose a phase and notes don't already specify it, append formatted phase
    if (selectedPhase) {
      const phaseSuffix = `Phase: ${selectedPhase.toLowerCase()}`;
      if (!finalNotes.toLowerCase().includes(phaseSuffix.toLowerCase())) {
        finalNotes = finalNotes ? `${finalNotes}\n\n${phaseSuffix}` : phaseSuffix;
      }
    }

    try {
      setSaving(true);
      await createTodo({
        userId: user.id,
        farmId: selectedFarmId,
        title: title.trim(),
        notes: finalNotes || undefined,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = (field: DatePickerField) => {
    const currentKey = field === 'startDate' ? startDate : dueDate;
    setDatePickerField(field);
    setDatePickerValue(currentKey ? fromDateKey(currentKey) : new Date());
  };

  const commitDate = (pickedDate: Date) => {
    const key = toDateKey(pickedDate);
    if (datePickerField === 'startDate') {
      setStartDate(key);
      if (dueDate && dueDate < key) setDueDate(key);
      setErrors((e) => ({ ...e, startDate: undefined }));
    } else if (datePickerField === 'dueDate') {
      setDueDate(key);
      if (startDate && startDate > key) setStartDate(key);
      setErrors((e) => ({ ...e, dueDate: undefined }));
    }
    setDatePickerField(null);
  };

  const handleNativeDateChange = (event: DateTimePickerEvent, pickedDate?: Date) => {
    if (event.type === 'dismissed') {
      setDatePickerField(null);
      return;
    }
    if (!pickedDate) return;
    setDatePickerValue(pickedDate);
    if (Platform.OS === 'android') commitDate(pickedDate);
  };

  return (
    <View className="flex-1 bg-champagne">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View className="mb-10 px-5 pb-32 pt-14">
          {/* Top Bar Navigation */}
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <BackButton />
              <View>
                <Text
                  className="font-black tracking-tight text-espresso"
                  style={{ fontSize: Math.round(24 * fontScale) }}
                >
                  {activeMode === 'single' ? 'New Task' : 'Mitigation Protocol'}
                </Text>
                <View className="mt-0.5 flex-row items-center gap-1.5">
                  <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#729E3B' }} />
                  <Text
                    className="font-extrabold uppercase tracking-[0.25em] text-taupe"
                    style={{ fontSize: Math.round(10 * fontScale) }}
                  >
                    {activeMode === 'single' ? 'Single Activity' : 'Structured Treatment Plan'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Apple-style Compact Segmented Control */}
          <View className="mb-4 rounded-full border border-cognac/15 bg-black/5 p-1">
            <View className="flex-row">
              {/* Option 1: Single Task */}
              <TouchableOpacity
                activeOpacity={0.9}
                hitSlop={hitSlop}
                onPress={() => {
                  triggerHaptic('selection');
                  setActiveMode('single');
                }}
                style={{ minHeight: isGloveMode ? 44 : undefined }}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-2 py-2 active:scale-[0.98] ${
                  activeMode === 'single'
                    ? 'border border-cognac/10 bg-white shadow-xs shadow-cognac/10'
                    : 'bg-transparent'
                }`}>
                <Check
                  size={Math.round(13 * fontScale)}
                  color={activeMode === 'single' ? '#8C4522' : '#8C7C70'}
                  strokeWidth={2.8}
                />
                <Text
                  numberOfLines={1}
                  style={{ flexShrink: 0, fontSize: Math.round(12 * fontScale) }}
                  className={`${
                    activeMode === 'single' ? 'font-black text-cognac' : 'font-bold text-taupe'
                  }`}>
                  Single Task
                </Text>
              </TouchableOpacity>

              {/* Option 2: Mitigation Plan */}
              <TouchableOpacity
                activeOpacity={0.9}
                hitSlop={hitSlop}
                onPress={() => {
                  triggerHaptic('selection');
                  setActiveMode('mitigation');
                }}
                style={{ minHeight: isGloveMode ? 44 : undefined }}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-2 py-2 active:scale-[0.98] ${
                  activeMode === 'mitigation'
                    ? 'border border-cognac/10 bg-white shadow-xs shadow-cognac/10'
                    : 'bg-transparent'
                }`}>
                <ShieldAlert
                  size={Math.round(13 * fontScale)}
                  color={activeMode === 'mitigation' ? '#8C4522' : '#8C7C70'}
                  strokeWidth={2.5}
                />
                <Text
                  numberOfLines={1}
                  style={{ flexShrink: 0, fontSize: Math.round(12 * fontScale) }}
                  className={`${
                    activeMode === 'mitigation' ? 'font-black text-cognac' : 'font-bold text-taupe'
                  }`}>
                  Mitigation Plan
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View className="items-center justify-center py-16">
              <ActivityIndicator color="#8C4522" size="large" />
              <Text
                className="mt-3 font-bold uppercase tracking-widest text-espresso/60"
                style={{ fontSize: Math.round(12 * fontScale) }}
              >
                Loading Workspace...
              </Text>
            </View>
          ) : activeMode === 'single' ? (
            /* ========================================================================= */
            /* WORKFLOW 1: SINGLE TASK CREATION                                          */
            /* ========================================================================= */
            <View className="space-y-4">
              {/* Quick Template Carousel */}
              <View className="mb-1">
                <View className="mb-2.5 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Sparkles size={Math.round(14 * fontScale)} color="#8C4522" strokeWidth={2.2} />
                    <Text
                      className="font-bold uppercase tracking-[0.2em] text-taupe"
                      style={{ fontSize: Math.round(11 * fontScale) }}
                    >
                      Quick Templates
                    </Text>
                  </View>
                  {activeTemplateId && (
                    <TouchableOpacity
                      hitSlop={hitSlop}
                      onPress={() => {
                        triggerHaptic('selection');
                        setActiveTemplateId(null);
                        setTitle('');
                        setNotes('');
                        setSelectedPhase(null);
                      }}
                      className="rounded-full bg-black/5 px-2.5 py-1">
                      <Text
                        className="font-bold uppercase tracking-wider text-taupe"
                        style={{ fontSize: Math.round(10 * fontScale) }}
                      >
                        Reset
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
                  <View className="flex-row items-center px-1">
                    {TEMPLATES.map((tmpl) => {
                      const isSelected = activeTemplateId === tmpl.id;
                      return (
                        <TouchableOpacity
                          key={tmpl.id}
                          activeOpacity={0.8}
                          hitSlop={hitSlop}
                          onPress={() => {
                            triggerHaptic('selection');
                            handleApplyTemplate(tmpl);
                          }}
                          style={{ minHeight: isGloveMode ? 44 : undefined }}
                          className={`mr-2 flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 active:scale-95 ${
                            isSelected
                              ? 'border-cognac bg-white shadow-xs shadow-cognac/15'
                              : 'border-black/5 bg-white/80'
                          }`}>
                          <Sparkles
                            size={Math.round(12 * fontScale)}
                            color={isSelected ? '#8C4522' : '#8C7C70'}
                            strokeWidth={2.5}
                          />
                          <Text
                            className={`${
                              isSelected ? 'font-black text-cognac' : 'font-bold text-taupe'
                            }`}
                            style={{ fontSize: Math.round(12 * fontScale) }}
                          >
                            {tmpl.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* Grouped Inset Card 1: Task Information */}
              <View className="rounded-[28px] border border-cognac/15 bg-white p-5 shadow-sm shadow-espresso/5">
                {/* Title */}
                <View className="mb-4">
                  <View className="mb-1.5 flex-row items-center justify-between">
                    <Text
                      className="font-extrabold uppercase tracking-[0.2em] text-cognac"
                      style={{ fontSize: Math.round(11 * fontScale) }}
                    >
                      Task Title <Text className="text-red-500">*</Text>
                    </Text>
                    {isCheckupTemplate && (
                      <View className="rounded-md bg-taupe/15 px-2 py-0.5">
                        <Text
                          className="font-bold uppercase tracking-wider text-taupe"
                          style={{ fontSize: Math.round(10 * fontScale) }}
                        >
                          Locked by Template
                        </Text>
                      </View>
                    )}
                  </View>
                  <TextInput
                    value={title}
                    editable={!isCheckupTemplate}
                    onChangeText={(v) => {
                      setTitle(v);
                      setActiveTemplateId(null);
                      if (v.trim()) setErrors((e) => ({ ...e, title: undefined }));
                    }}
                    maxLength={255}
                    placeholder="e.g. Inspect tomato seedlings"
                    placeholderTextColor="#8C7C70"
                    style={{
                      fontSize: Math.round(16 * fontScale),
                      minHeight: gloveMinHeight,
                    }}
                    className={`rounded-2xl border px-4 py-3.5 font-semibold ${
                      isCheckupTemplate
                        ? 'border-black/5 bg-champagne/40 text-taupe'
                        : errors.title
                          ? 'border-red-400 bg-red-50 text-espresso'
                          : 'border-cognac/15 bg-champagne text-espresso'
                    }`}
                  />
                  {errors.title ? (
                    <Text
                      className="mt-1.5 font-bold text-red-500"
                      style={{ fontSize: Math.round(12 * fontScale) }}
                    >
                      {errors.title}
                    </Text>
                  ) : null}
                </View>

                {/* Crop Phase Chips */}
                <View className="mb-4">
                  <Text
                    className="mb-2 font-extrabold uppercase tracking-[0.2em] text-cognac"
                    style={{ fontSize: Math.round(11 * fontScale) }}
                  >
                    Crop Phase
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {PHASES.map((phase) => {
                      const isSelected = selectedPhase === phase.id;
                      return (
                        <TouchableOpacity
                          key={phase.id}
                          activeOpacity={0.8}
                          hitSlop={hitSlop}
                          onPress={() => {
                            triggerHaptic('selection');
                            handleTogglePhase(phase.id);
                          }}
                          style={{ minHeight: isGloveMode ? 44 : undefined }}
                          className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 active:scale-95 ${
                            isSelected
                              ? 'border-cognac bg-cognac shadow-sm shadow-cognac/30'
                              : 'border-cognac/15 bg-champagne'
                          }`}>
                          {isSelected ? (
                            <Check size={Math.round(13 * fontScale)} color="#ffffff" strokeWidth={3} />
                          ) : (
                            <View className="h-1.5 w-1.5 rounded-full bg-taupe/60" />
                          )}
                          <Text
                            className={`${
                              isSelected ? 'font-black text-white' : 'font-bold text-espresso'
                            }`}
                            style={{ fontSize: Math.round(12 * fontScale) }}
                          >
                            {phase.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Notes Input */}
                <View>
                  <View className="mb-1.5 flex-row items-center justify-between">
                    <Text
                      className="font-extrabold uppercase tracking-[0.2em] text-cognac"
                      style={{ fontSize: Math.round(11 * fontScale) }}
                    >
                      Notes & Instructions
                    </Text>
                    {selectedPhase && (
                      <Text
                        className="font-extrabold uppercase tracking-wider text-cognac"
                        style={{ fontSize: Math.round(10 * fontScale) }}
                      >
                        Phase: {selectedPhase}
                      </Text>
                    )}
                  </View>
                  <TextInput
                    value={notes}
                    onChangeText={(v) => {
                      setNotes(v);
                      setActiveTemplateId(null);
                    }}
                    maxLength={3000}
                    placeholder="Add task notes, dosages, or plot numbers..."
                    placeholderTextColor="#8C7C70"
                    multiline
                    numberOfLines={3}
                    style={{ fontSize: Math.round(16 * fontScale) }}
                    className="min-h-[90px] rounded-2xl border border-cognac/15 bg-champagne px-4 py-3 font-normal text-espresso"
                    textAlignVertical="top"
                  />
                </View>
              </View>

              {/* Grouped Inset Card 2: Schedule & Farm Assignment */}
              <View className="mt-4 rounded-[28px] border border-cognac/15 bg-white p-5 shadow-sm shadow-espresso/5">
                {/* Schedule Range */}
                <View className="mb-4 flex-row gap-3">
                  <View className="flex-1">
                    <Text
                      className="mb-1.5 font-extrabold uppercase tracking-[0.2em] text-cognac"
                      style={{ fontSize: Math.round(11 * fontScale) }}
                    >
                      Start Date <Text className="text-red-500">*</Text>
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        triggerHaptic('selection');
                        openDatePicker('startDate');
                      }}
                      activeOpacity={0.85}
                      hitSlop={hitSlop}
                      style={{ minHeight: gloveMinHeight }}
                      className={`flex-row items-center justify-between rounded-2xl border px-3.5 py-3 ${
                        errors.startDate ? 'border-red-400 bg-red-50' : 'border-cognac/15 bg-champagne'
                      }`}>
                      <Text
                        className="font-bold text-espresso"
                        style={{ fontSize: Math.round(14 * fontScale) }}
                      >
                        {startDate ? formatDateLabel(startDate) : 'Select date'}
                      </Text>
                      <CalendarIcon size={Math.round(16 * fontScale)} color="#8C4522" strokeWidth={2.2} />
                    </TouchableOpacity>
                    {errors.startDate ? (
                      <Text
                        className="mt-1 font-semibold text-red-500"
                        style={{ fontSize: Math.round(12 * fontScale) }}
                      >
                        {errors.startDate}
                      </Text>
                    ) : null}
                  </View>

                  <View className="flex-1">
                    <Text
                      className="mb-1.5 font-extrabold uppercase tracking-[0.2em] text-cognac"
                      style={{ fontSize: Math.round(11 * fontScale) }}
                    >
                      Due Date <Text className="text-red-500">*</Text>
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        triggerHaptic('selection');
                        openDatePicker('dueDate');
                      }}
                      activeOpacity={0.85}
                      hitSlop={hitSlop}
                      style={{ minHeight: gloveMinHeight }}
                      className={`flex-row items-center justify-between rounded-2xl border px-3.5 py-3 ${
                        errors.dueDate ? 'border-red-400 bg-red-50' : 'border-cognac/15 bg-champagne'
                      }`}>
                      <Text
                        className="font-bold text-espresso"
                        style={{ fontSize: Math.round(14 * fontScale) }}
                      >
                        {dueDate ? formatDateLabel(dueDate) : 'Select date'}
                      </Text>
                      <CalendarIcon size={Math.round(16 * fontScale)} color="#8C4522" strokeWidth={2.2} />
                    </TouchableOpacity>
                    {errors.dueDate ? (
                      <Text
                        className="mt-1 font-semibold text-red-500"
                        style={{ fontSize: Math.round(12 * fontScale) }}
                      >
                        {errors.dueDate}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Inline Date Picker for iOS */}
                {datePickerField ? (
                  <View className="mb-4 rounded-2xl border border-cognac/20 bg-cognac/10 p-3">
                    <Text
                      className="mb-2 font-bold uppercase tracking-[0.15em] text-cognac"
                      style={{ fontSize: Math.round(11 * fontScale) }}
                    >
                      {datePickerField === 'startDate' ? 'Select Start Date' : 'Select Due Date'}
                    </Text>
                    <DateTimePicker
                      value={datePickerValue}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleNativeDateChange}
                    />
                    {Platform.OS === 'ios' ? (
                      <View className="mt-3 flex-row gap-3">
                        <TouchableOpacity
                          onPress={() => setDatePickerField(null)}
                          hitSlop={hitSlop}
                          style={{ minHeight: isGloveMode ? 48 : undefined }}
                          className="flex-1 items-center justify-center rounded-2xl border border-taupe/30 bg-white py-3">
                          <Text
                            className="font-bold text-taupe"
                            style={{ fontSize: Math.round(14 * fontScale) }}
                          >
                            Cancel
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            triggerHaptic('selection');
                            commitDate(datePickerValue);
                          }}
                          hitSlop={hitSlop}
                          style={{ minHeight: isGloveMode ? 48 : undefined }}
                          className="flex-1 items-center justify-center rounded-2xl bg-cognac py-3">
                          <Text
                            className="font-bold text-white"
                            style={{ fontSize: Math.round(14 * fontScale) }}
                          >
                            Apply
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Target Farm Selector */}
                <View className="relative">
                  <Text
                    className="mb-1.5 font-extrabold uppercase tracking-[0.2em] text-cognac"
                    style={{ fontSize: Math.round(11 * fontScale) }}
                  >
                    Target Farm <Text className="text-red-500">*</Text>
                  </Text>

                  {farms.length === 0 ? (
                    <View className="rounded-2xl border border-dashed border-cognac/25 bg-champagne/50 p-4">
                      <Text
                        className="text-center text-taupe"
                        style={{ fontSize: Math.round(14 * fontScale) }}
                      >
                        No farms found. Please create a farm first.
                      </Text>
                    </View>
                  ) : (
                    <View>
                      <TouchableOpacity
                        onPress={() => {
                          triggerHaptic('selection');
                          setIsDropdownOpen(!isDropdownOpen);
                        }}
                        activeOpacity={0.85}
                        hitSlop={hitSlop}
                        style={{ minHeight: gloveMinHeight }}
                        className={`flex-row items-center justify-between rounded-2xl border px-4 py-3.5 ${
                          errors.farmId ? 'border-red-400 bg-red-50' : 'border-cognac/15 bg-champagne'
                        }`}>
                        <View className="flex-row items-center gap-2.5">
                          <Building2 size={Math.round(18 * fontScale)} color="#8C4522" strokeWidth={2.2} />
                          <Text
                            className={`font-bold ${
                              selectedFarm ? 'text-espresso' : 'text-taupe'
                            }`}
                            style={{ fontSize: Math.round(16 * fontScale) }}
                          >
                            {selectedFarm ? selectedFarm.farm_name : 'Select a farm...'}
                          </Text>
                        </View>
                        <ChevronDown
                          size={Math.round(18 * fontScale)}
                          color="#8C7C70"
                          style={{
                            transform: [{ rotate: isDropdownOpen ? '180deg' : '0deg' }],
                          }}
                        />
                      </TouchableOpacity>

                      {/* Dropdown Menu */}
                      {isDropdownOpen && (
                        <View className="mt-2 overflow-hidden rounded-2xl border border-cognac/15 bg-white shadow-lg shadow-espresso/10">
                          <View className="border-b border-cognac/10 bg-champagne px-4 py-2">
                            <TextInput
                              value={farmSearchQuery}
                              onChangeText={setFarmSearchQuery}
                              maxLength={255}
                              placeholder="Search farms..."
                              placeholderTextColor="#8C7C70"
                              style={{ fontSize: Math.round(14 * fontScale) }}
                              className="py-1.5 font-semibold text-espresso"
                            />
                          </View>

                          <ScrollView nestedScrollEnabled className="max-h-48">
                            {filteredFarms.length > 0 ? (
                              filteredFarms.map((farm) => {
                                const active = selectedFarmId === farm.id;
                                return (
                                  <TouchableOpacity
                                    key={farm.id}
                                    activeOpacity={0.7}
                                    hitSlop={hitSlop}
                                    style={{ minHeight: isGloveMode ? 48 : undefined }}
                                    onPress={() => {
                                      triggerHaptic('selection');
                                      setSelectedFarmId(farm.id);
                                      setErrors((e) => ({ ...e, farmId: undefined }));
                                      setIsDropdownOpen(false);
                                      setFarmSearchQuery('');
                                    }}
                                    className={`flex-row items-center justify-between border-b border-black/5 px-4 py-3.5 ${
                                      active ? 'bg-cognac/10' : 'bg-white'
                                    }`}>
                                    <Text
                                      className={`${
                                        active
                                          ? 'font-bold text-cognac'
                                          : 'font-medium text-espresso'
                                      }`}
                                      style={{ fontSize: Math.round(14 * fontScale) }}
                                    >
                                      {farm.farm_name}
                                    </Text>
                                    {active && (
                                      <Check size={Math.round(16 * fontScale)} color="#8C4522" strokeWidth={2.5} />
                                    )}
                                  </TouchableOpacity>
                                );
                              })
                            ) : (
                              <View className="items-center py-4">
                                <Text
                                  className="text-taupe"
                                  style={{ fontSize: Math.round(14 * fontScale) }}
                                >
                                  No farms match &quot;{farmSearchQuery}&quot;
                                </Text>
                              </View>
                            )}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  )}

                  {errors.farmId && !isDropdownOpen ? (
                    <Text
                      className="mt-1 font-semibold text-red-500"
                      style={{ fontSize: Math.round(12 * fontScale) }}
                    >
                      {errors.farmId}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Single Task Save CTA */}
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic('medium');
                  handleSaveSingleTask();
                }}
                disabled={saving}
                activeOpacity={0.85}
                hitSlop={hitSlop}
                style={{ minHeight: isGloveMode ? 54 : undefined }}
                className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-cognac py-4 shadow-md shadow-cognac/30 active:scale-[0.98]">
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Check size={Math.round(18 * fontScale)} color="#ffffff" strokeWidth={2.5} />
                    <Text
                      className="font-extrabold tracking-wide text-white"
                      style={{ fontSize: Math.round(16 * fontScale) }}
                    >
                      Create Task
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* ========================================================================= */
            /* WORKFLOW 2: MITIGATION PLAN PROTOCOL                                      */
            /* ========================================================================= */
            <View className="space-y-3">
              {/* Explainer Callout Card */}
              <View className="mb-1 rounded-2xl border border-cognac/20 bg-white px-3.5 py-2.5 shadow-xs">
                <View className="flex-row items-center gap-2.5">
                  <View className="rounded-full bg-cognac/10 p-1.5">
                    <ShieldAlert size={Math.round(15 * fontScale)} color="#8C4522" strokeWidth={2.2} />
                  </View>
                  <View className="flex-1">
                    <Text
                      className="font-black text-espresso"
                      style={{ fontSize: Math.round(12 * fontScale) }}
                    >
                      Automated Treatment Protocol
                    </Text>
                    <Text
                      className="text-taupe"
                      style={{
                        fontSize: Math.round(11 * fontScale),
                        lineHeight: Math.round(16 * fontScale),
                      }}
                    >
                      Deploy a structured multi-day recovery protocol to your farm.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Card 1: Target Farm Selection */}
              <View className="rounded-[24px] border border-cognac/15 bg-white p-4 shadow-sm shadow-espresso/5">
                <Text
                  className="mb-1.5 font-extrabold uppercase tracking-[0.2em] text-cognac"
                  style={{ fontSize: Math.round(11 * fontScale) }}
                >
                  Target Farm For Treatment <Text className="text-red-500">*</Text>
                </Text>

                {farms.length === 0 ? (
                  <View className="rounded-2xl border border-dashed border-cognac/25 bg-champagne/50 p-3">
                    <Text
                      className="text-center text-taupe"
                      style={{ fontSize: Math.round(12 * fontScale) }}
                    >
                      No farms found. Please create a farm first.
                    </Text>
                  </View>
                ) : (
                  <View>
                    <TouchableOpacity
                      onPress={() => {
                        triggerHaptic('selection');
                        setIsDropdownOpen(!isDropdownOpen);
                      }}
                      activeOpacity={0.85}
                      hitSlop={hitSlop}
                      style={{ minHeight: gloveMinHeight }}
                      className="flex-row items-center justify-between rounded-xl border border-cognac/15 bg-champagne px-3.5 py-2.5">
                      <View className="flex-row items-center gap-2">
                        <Building2 size={Math.round(16 * fontScale)} color="#8C4522" strokeWidth={2.2} />
                        <Text
                          className="font-bold text-espresso"
                          style={{ fontSize: Math.round(14 * fontScale) }}
                        >
                          {selectedFarm ? selectedFarm.farm_name : 'Select a farm...'}
                        </Text>
                      </View>
                      <ChevronDown
                        size={Math.round(16 * fontScale)}
                        color="#8C7C70"
                        style={{
                          transform: [{ rotate: isDropdownOpen ? '180deg' : '0deg' }],
                        }}
                      />
                    </TouchableOpacity>

                    {isDropdownOpen && (
                      <View className="mt-2 overflow-hidden rounded-2xl border border-cognac/15 bg-white shadow-lg shadow-espresso/10">
                        <View className="border-b border-cognac/10 bg-champagne px-4 py-2">
                          <TextInput
                            value={farmSearchQuery}
                            onChangeText={setFarmSearchQuery}
                            maxLength={255}
                            placeholder="Search farms..."
                            placeholderTextColor="#8C7C70"
                            style={{ fontSize: Math.round(14 * fontScale) }}
                            className="py-1.5 font-semibold text-espresso"
                          />
                        </View>

                        <ScrollView nestedScrollEnabled className="max-h-48">
                          {filteredFarms.length > 0 ? (
                            filteredFarms.map((farm) => {
                              const active = selectedFarmId === farm.id;
                              return (
                                <TouchableOpacity
                                  key={farm.id}
                                  activeOpacity={0.7}
                                  hitSlop={hitSlop}
                                  style={{ minHeight: isGloveMode ? 48 : undefined }}
                                  onPress={() => {
                                    triggerHaptic('selection');
                                    setSelectedFarmId(farm.id);
                                    setIsDropdownOpen(false);
                                    setFarmSearchQuery('');
                                  }}
                                  className={`flex-row items-center justify-between border-b border-black/5 px-4 py-3 ${
                                    active ? 'bg-cognac/10' : 'bg-white'
                                  }`}>
                                  <Text
                                    className={`${
                                      active ? 'font-bold text-cognac' : 'font-medium text-espresso'
                                    }`}
                                    style={{ fontSize: Math.round(14 * fontScale) }}
                                  >
                                    {farm.farm_name}
                                  </Text>
                                  {active && <Check size={Math.round(16 * fontScale)} color="#8C4522" strokeWidth={2.5} />}
                                </TouchableOpacity>
                              );
                            })
                          ) : (
                            <View className="items-center py-4">
                              <Text
                                className="text-taupe"
                                style={{ fontSize: Math.round(14 * fontScale) }}
                              >
                                No farms match &quot;{farmSearchQuery}&quot;
                              </Text>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Card 2: Problem Class Selection */}
              <View className="rounded-[24px] border border-cognac/15 bg-white p-4 shadow-sm shadow-espresso/5">
                <View className="mb-2 flex-row items-center justify-between">
                  <Text
                    className="font-extrabold uppercase tracking-[0.2em] text-cognac"
                    style={{ fontSize: Math.round(11 * fontScale) }}
                  >
                    Select Identified Issue <Text className="text-red-500">*</Text>
                  </Text>
                  {selectedProblemClass && (
                    <TouchableOpacity
                      hitSlop={hitSlop}
                      onPress={() => {
                        triggerHaptic('selection');
                        setSelectedProblemClass(null);
                        setMitigationSteps([]);
                      }}
                      className="rounded-full bg-cognac/10 px-2 py-0.5">
                      <Text
                        className="font-bold uppercase tracking-wider text-cognac"
                        style={{ fontSize: Math.round(10 * fontScale) }}
                      >
                        Clear
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {problemClasses.length === 0 ? (
                  <View className="items-center py-3">
                    <Text
                      className="text-taupe"
                      style={{ fontSize: Math.round(12 * fontScale) }}
                    >
                      No problem classes registered.
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row flex-wrap gap-2">
                    {problemClasses.map((prob) => {
                      const isSelected = selectedProblemClass?.id === prob.id;
                      return (
                        <TouchableOpacity
                          key={prob.id}
                          activeOpacity={0.8}
                          hitSlop={hitSlop}
                          style={{ minHeight: isGloveMode ? 44 : undefined }}
                          onPress={() => {
                            triggerHaptic('selection');
                            handleSelectProblemClass(prob);
                          }}
                          className={`flex-row items-center gap-1.5 rounded-xl border px-3 py-2 active:scale-95 ${
                            isSelected
                              ? 'border-cognac bg-cognac/10 shadow-xs shadow-cognac/20'
                              : 'border-cognac/15 bg-champagne'
                          }`}>
                          <AlertTriangle
                            size={Math.round(13 * fontScale)}
                            color={isSelected ? '#8C4522' : '#8C7C70'}
                            strokeWidth={2.2}
                          />
                          <Text
                            className={`${
                              isSelected ? 'font-black text-cognac' : 'font-bold text-espresso'
                            }`}
                            style={{ fontSize: Math.round(12 * fontScale) }}
                          >
                            {prob.name}
                          </Text>
                          {isSelected && (
                            <View className="ml-1 h-3.5 w-3.5 items-center justify-center rounded-full bg-cognac">
                              <Check size={Math.round(9 * fontScale)} color="#ffffff" strokeWidth={3} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Card 3: Protocol Timeline & Steps Preview */}
              {selectedProblemClass && (
                <View className="rounded-[24px] border border-cognac/15 bg-white p-4 shadow-sm shadow-espresso/5">
                  <View className="flex-row items-center justify-between border-b border-cognac/10 pb-2.5">
                    <View className="flex-row items-center gap-2">
                      <View className="h-2 w-2 rounded-full bg-cognac" />
                      <Text
                        className="font-black text-espresso"
                        style={{ fontSize: Math.round(14 * fontScale) }}
                      >
                        {selectedProblemClass.name} Protocol
                      </Text>
                    </View>
                    <View className="rounded-full bg-cognac/10 px-2.5 py-0.5 border border-cognac/20">
                      <Text
                        className="font-extrabold uppercase tracking-wider text-cognac"
                        style={{ fontSize: Math.round(10 * fontScale) }}
                      >
                        {loadingMitigations
                          ? 'Loading...'
                          : `${mitigationSteps.length} Steps`}
                      </Text>
                    </View>
                  </View>

                  {loadingMitigations ? (
                    <View className="items-center justify-center py-6">
                      <ActivityIndicator color="#8C4522" size="small" />
                      <Text
                        className="mt-2 font-semibold text-taupe"
                        style={{ fontSize: Math.round(12 * fontScale) }}
                      >
                        Fetching treatment schedule...
                      </Text>
                    </View>
                  ) : mitigationSteps.length > 0 ? (
                    <View className="mt-3 gap-2">
                      {mitigationSteps.map((step, idx) => (
                        <View
                          key={`step-timeline-${idx}`}
                          className="flex-row items-start gap-2.5 rounded-xl border border-cognac/15 bg-champagne p-2.5">
                          {/* Day Timeline Badge */}
                          <View className="items-center justify-center rounded-lg bg-cognac px-2 py-1 shadow-xs shadow-cognac/30">
                            <Text
                              className="font-black uppercase tracking-wider text-white"
                              style={{ fontSize: Math.round(9 * fontScale) }}
                            >
                              Day {step.day}
                            </Text>
                          </View>

                          {/* Step Content */}
                          <View className="flex-1">
                            <Text
                              className="font-black text-espresso"
                              style={{ fontSize: Math.round(12 * fontScale) }}
                            >
                              {step.title}
                            </Text>
                            <Text
                              className="mt-0.5 text-taupe"
                              style={{
                                fontSize: Math.round(11 * fontScale),
                                lineHeight: Math.round(16 * fontScale),
                              }}
                            >
                              {step.description}
                            </Text>
                          </View>
                        </View>
                      ))}

                      {/* Deploy Action CTA */}
                      <TouchableOpacity
                        onPress={() => {
                          triggerHaptic('medium');
                          handleAddMitigationTasks();
                        }}
                        disabled={savingMitigation}
                        activeOpacity={0.85}
                        hitSlop={hitSlop}
                        style={{ minHeight: isGloveMode ? 54 : undefined }}
                        className="mt-1 flex-row items-center justify-center gap-2 rounded-xl bg-cognac py-3.5 shadow-md shadow-cognac/30 active:scale-[0.98]">
                        {savingMitigation ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <ShieldAlert size={Math.round(16 * fontScale)} color="#ffffff" strokeWidth={2.2} />
                            <Text
                              className="font-extrabold uppercase tracking-wide text-white"
                              style={{ fontSize: Math.round(12 * fontScale) }}
                            >
                              Deploy {mitigationSteps.length} Steps to{' '}
                              {selectedFarm ? selectedFarm.farm_name : 'Farm'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View className="py-4">
                      <Text
                        className="text-center font-semibold text-taupe"
                        style={{ fontSize: Math.round(12 * fontScale) }}
                      >
                        No mitigation steps registered for this problem.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
