import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Keyboard,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../../../components/common/AppModal';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  Check,
  ChevronRight,
  FileText,
  Layers,
  Leaf,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import type { DailyReportQuestion, PlotOption } from '../types';

type CategoryFilter = 'all' | 'pest' | 'disease' | 'other' | 'spotted';

const ITEMS_PER_PAGE = 6;

type DailyReportFormModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: {
    gardenStructureId?: string | null;
    plotName?: string;
    answers: Record<string, 'yes' | 'no'>;
    symptomsSummary: Array<{ category: string; question: string }>;
    notes?: string | null;
    imageUri?: string | null;
  }) => Promise<void>;
  plots: PlotOption[];
  questions: DailyReportQuestion[];
  isSubmitting: boolean;
};

// Helper to determine whether a question represents a pest or a disease/condition
function getQuestionCategory(q: DailyReportQuestion): 'pest' | 'disease' {
  if (q.classCategory === 'pest' || q.classCategory === 'disease') {
    return q.classCategory;
  }
  const text = `${q.category} ${q.categoryName} ${q.question}`.toLowerCase();
  if (
    text.includes('aphid') ||
    text.includes('caterpillar') ||
    text.includes('snail') ||
    text.includes('slug') ||
    text.includes('worm') ||
    text.includes('borer') ||
    text.includes('beetle') ||
    text.includes('mite') ||
    text.includes('thrip') ||
    text.includes('insect') ||
    text.includes('pest')
  ) {
    return 'pest';
  }
  return 'disease';
}

export function DailyReportFormModal({
  visible,
  onClose,
  onSubmit,
  plots,
  questions,
  isSubmitting,
}: DailyReportFormModalProps) {
  const [selectedPlotId, setSelectedPlotId] = useState<string>('general');
  const [selectedPestIds, setSelectedPestIds] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<string>('');
  const [imageUri, setImageUri] = useState<string | null>(null);

  // Search, Filter & Pagination state for Step 2
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // "Others" option state
  const [hasOtherIssue, setHasOtherIssue] = useState<boolean>(false);
  const [otherIssueText, setOtherIssueText] = useState<string>('');

  // Reset page to 1 whenever search query or category filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter]);

  // Toggle pest check
  const handleTogglePest = (questionId: string) => {
    setSelectedPestIds((prev) => {
      const next = { ...prev };
      if (next[questionId]) {
        delete next[questionId];
      } else {
        next[questionId] = true;
      }
      return next;
    });
  };

  // Deselect all spotted items including others
  const handleClearAllSpotted = () => {
    setSelectedPestIds({});
    setHasOtherIssue(false);
    setOtherIssueText('');
  };

  // Image Picker from Gallery
  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Camera roll access is needed to attach photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn('[DailyReport] Image picker error:', err);
      Alert.alert('Error', err?.message || 'Could not pick image.');
    }
  };

  // Take Photo via Camera
  const handleTakePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Camera permission is needed to capture photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn('[DailyReport] Camera capture error:', err);
      Alert.alert('Error', err?.message || 'Could not capture photo.');
    }
  };

  // Reset form states
  const handleResetForm = () => {
    setSelectedPestIds({});
    setNotes('');
    setImageUri(null);
    setSelectedPlotId('general');
    setSearchQuery('');
    setCategoryFilter('all');
    setCurrentPage(1);
    setHasOtherIssue(false);
    setOtherIssueText('');
  };

  // Close handler with cleanup
  const handleClose = () => {
    Keyboard.dismiss();
    setSearchQuery('');
    setCategoryFilter('all');
    setCurrentPage(1);
    onClose();
  };

  // Submit handler
  const handleSubmit = async () => {
    const selectedCount = Object.keys(selectedPestIds).length + (hasOtherIssue ? 1 : 0);
    if (selectedCount === 0 && !notes.trim() && !imageUri) {
      Alert.alert(
        'Empty Report',
        'Please check any pests/symptoms observed, or provide observation notes before submitting.'
      );
      return;
    }

    const selectedPlot = plots.find((p) => p.id === selectedPlotId);
    const plotName = selectedPlot ? selectedPlot.name : 'General Farm Field';
    const gardenStructureId = selectedPlotId === 'general' ? null : selectedPlotId;

    // Collect answers and symptoms summary
    const answers: Record<string, 'yes' | 'no'> = {};
    const symptomsSummary: Array<{ category: string; question: string }> = [];

    questions.forEach((q) => {
      const isSpotted = Boolean(selectedPestIds[q.id]);
      answers[q.id] = isSpotted ? 'yes' : 'no';
      if (isSpotted) {
        symptomsSummary.push({
          category: q.categoryName,
          question: q.question,
        });
      }
    });

    // Handle "Others" option
    if (hasOtherIssue) {
      answers.other_issue = 'yes';
      symptomsSummary.push({
        category: 'Other Issue',
        question: otherIssueText.trim()
          ? otherIssueText.trim()
          : 'Other unlisted field observation or symptom',
      });
    }

    try {
      await onSubmit({
        gardenStructureId,
        plotName,
        answers,
        symptomsSummary,
        notes: notes.trim() || null,
        imageUri,
      });

      handleResetForm();
      onClose();

      setTimeout(() => {
        Alert.alert(
          'Report Submitted',
          'Your daily field observation report has been recorded and shared with the farm owner.'
        );
      }, 350);
    } catch (err: any) {
      Alert.alert('Submission Error', err?.message || 'Failed to save daily report.');
    }
  };

  // Category counts
  const spottedCount = Object.keys(selectedPestIds).length + (hasOtherIssue ? 1 : 0);
  const pestCount = useMemo(
    () => questions.filter((q) => getQuestionCategory(q) === 'pest').length,
    [questions]
  );
  const diseaseCount = useMemo(
    () => questions.filter((q) => getQuestionCategory(q) === 'disease').length,
    [questions]
  );

  // Filtered questions based on search query and category filter
  const filteredQuestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return questions.filter((q) => {
      // Category filter check
      if (categoryFilter === 'spotted') {
        if (!selectedPestIds[q.id]) return false;
      } else if (categoryFilter === 'pest') {
        if (getQuestionCategory(q) !== 'pest') return false;
      } else if (categoryFilter === 'disease') {
        if (getQuestionCategory(q) !== 'disease') return false;
      } else if (categoryFilter === 'other') {
        return false; // 'other' focuses exclusively on the custom Others card
      }

      // Search query check
      if (query) {
        const matchName = q.categoryName.toLowerCase().includes(query);
        const matchQuestion = q.question.toLowerCase().includes(query);
        const matchCategory = q.category.toLowerCase().includes(query);
        if (!matchName && !matchQuestion && !matchCategory) return false;
      }

      return true;
    });
  }, [questions, searchQuery, categoryFilter, selectedPestIds]);

  // Pagination calculation (max 6 items per page)
  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedQuestions = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredQuestions.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredQuestions, safeCurrentPage]);

  // Determine whether to display the "Others" card
  const shouldShowOthersCard = useMemo(() => {
    if (categoryFilter === 'other') return true;
    if (categoryFilter === 'pest' || categoryFilter === 'disease') return false;
    if (categoryFilter === 'spotted') return hasOtherIssue;
    // For 'all' filter: show when on the last page or if query matches 'other'
    if (searchQuery.trim()) {
      return 'other unlisted custom'.includes(searchQuery.trim().toLowerCase());
    }
    return safeCurrentPage === totalPages;
  }, [categoryFilter, hasOtherIssue, searchQuery, safeCurrentPage, totalPages]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <Pressable style={{ flex: 1 }} onPress={handleClose} />
          <View className="h-[92%] w-full rounded-t-3xl bg-champagne overflow-hidden shadow-2xl pb-5">
            {/* Header */}
            <View className="border-b border-taupe/20 bg-white px-5 py-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2.5">
                  <View className="h-10 w-10 items-center justify-center rounded-2xl bg-cognac/10">
                    <FileText size={20} color="#8C4522" />
                  </View>
                  <View>
                    <Text className="text-lg font-black text-espresso">Daily Field Report</Text>
                    <Text className="text-xs text-taupe font-medium">Daily Field Check-in</Text>
                  </View>
                </View>
                <Pressable
                  onPress={handleClose}
                  hitSlop={8}
                  className="h-8 w-8 items-center justify-center rounded-full bg-taupe/10">
                  <X size={18} color="#1C120C" />
                </Pressable>
              </View>
            </View>

            {/* Scrollable Content */}
            <ScrollView
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 18, paddingBottom: 50 }}>
            {/* Section 1: Plot Selection */}
            <View className="mb-5 rounded-2xl border border-taupe/20 bg-white p-4 shadow-sm">
              <View className="flex-row items-center gap-2 mb-2">
                <Layers size={18} color="#8C4522" />
                <Text className="text-sm font-bold text-espresso uppercase tracking-wider">
                  1. Select Plot / Area
                </Text>
              </View>
              <Text className="text-xs text-taupe mb-3">
                Choose the planted plot you are observing today (empty plots without crops are hidden):
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                className="gap-2">
                {plots.map((plot) => {
                  const isSelected = selectedPlotId === plot.id;
                  return (
                    <Pressable
                      key={plot.id}
                      onPress={() => setSelectedPlotId(plot.id)}
                      className={`mr-2 flex-row items-center gap-1.5 rounded-xl px-3.5 py-2.5 border active:scale-95 ${
                        isSelected
                          ? 'border-cognac bg-cognac/10'
                          : 'border-taupe/20 bg-champagne'
                      }`}>
                      <View
                        className={`h-4 w-4 rounded-full border items-center justify-center ${
                          isSelected ? 'border-cognac bg-cognac' : 'border-taupe/40'
                        }`}>
                        {isSelected && <Check size={10} color="#FFFFFF" strokeWidth={3} />}
                      </View>
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-cognac' : 'text-espresso'
                        }`}>
                        {plot.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Section 2: Pest & Disease Checklist (Filterable + Searchable + Paginated + Others) */}
            <View className="mb-5 rounded-2xl border border-taupe/20 bg-white p-4 shadow-sm">
              {/* Header with Spotted status and clear action */}
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center gap-2">
                  <Leaf size={18} color="#15803d" />
                  <Text className="text-sm font-bold text-espresso uppercase tracking-wider">
                    2. Pest & Issue Checklist
                  </Text>
                </View>

                <View className="flex-row items-center gap-2">
                  {spottedCount === 0 ? (
                    <View className="rounded-full bg-emerald-50 px-2.5 py-0.5 border border-emerald-200">
                      <Text className="text-[10px] font-bold text-emerald-800">
                        All Normal
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-1.5">
                      <View className="rounded-full bg-rose-100 px-2.5 py-0.5 border border-rose-200">
                        <Text className="text-[10px] font-bold text-rose-800">
                          {spottedCount} Spotted
                        </Text>
                      </View>
                      <Pressable
                        onPress={handleClearAllSpotted}
                        className="rounded-full bg-taupe/10 px-2 py-0.5 active:scale-95">
                        <Text className="text-[10px] font-semibold text-taupe">Reset</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>

              <Text className="text-xs text-taupe mb-3">
                Select observed symptoms (showing 6 per page). Check "Others" if an unlisted issue occurs:
              </Text>

              {/* Search Bar */}
              <View className="mb-3 flex-row items-center rounded-xl border border-taupe/25 bg-champagne px-3 py-2">
                <Search size={16} color="#8C4522" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  maxLength={255}
                  placeholder="Search pests, diseases, symptoms..."
                  placeholderTextColor="#8C7C70"
                  returnKeyType="search"
                  className="ml-2 flex-1 text-xs text-espresso py-0"
                />
                {searchQuery.length > 0 && (
                  <Pressable
                    onPress={() => setSearchQuery('')}
                    className="h-5 w-5 items-center justify-center rounded-full bg-taupe/20 active:scale-90">
                    <X size={12} color="#1C120C" />
                  </Pressable>
                )}
              </View>

              {/* Category Filter Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                className="mb-3 flex-row gap-1.5">
                {/* All */}
                <Pressable
                  onPress={() => setCategoryFilter('all')}
                  className={`mr-1.5 flex-row items-center gap-1 rounded-lg px-3 py-1.5 border active:scale-95 ${
                    categoryFilter === 'all'
                      ? 'border-cognac bg-cognac'
                      : 'border-taupe/20 bg-champagne'
                  }`}>
                  <Text
                    className={`text-xs font-bold ${
                      categoryFilter === 'all' ? 'text-white' : 'text-taupe'
                    }`}>
                    All ({questions.length})
                  </Text>
                </Pressable>

                {/* Pests */}
                <Pressable
                  onPress={() => setCategoryFilter('pest')}
                  className={`mr-1.5 flex-row items-center gap-1.5 rounded-lg px-3 py-1.5 border active:scale-95 ${
                    categoryFilter === 'pest'
                      ? 'border-cognac bg-cognac'
                      : 'border-taupe/20 bg-champagne'
                  }`}>
                  <ShieldAlert
                    size={13}
                    color={categoryFilter === 'pest' ? '#FFFFFF' : '#8C7C70'}
                  />
                  <Text
                    className={`text-xs font-bold ${
                      categoryFilter === 'pest' ? 'text-white' : 'text-taupe'
                    }`}>
                    Pests ({pestCount})
                  </Text>
                </Pressable>

                {/* Diseases */}
                <Pressable
                  onPress={() => setCategoryFilter('disease')}
                  className={`mr-1.5 flex-row items-center gap-1.5 rounded-lg px-3 py-1.5 border active:scale-95 ${
                    categoryFilter === 'disease'
                      ? 'border-cognac bg-cognac'
                      : 'border-taupe/20 bg-champagne'
                  }`}>
                  <Leaf
                    size={13}
                    color={categoryFilter === 'disease' ? '#FFFFFF' : '#8C7C70'}
                  />
                  <Text
                    className={`text-xs font-bold ${
                      categoryFilter === 'disease' ? 'text-white' : 'text-taupe'
                    }`}>
                    Diseases ({diseaseCount})
                  </Text>
                </Pressable>

                {/* Others */}
                <Pressable
                  onPress={() => setCategoryFilter('other')}
                  className={`mr-1.5 flex-row items-center gap-1.5 rounded-lg px-3 py-1.5 border active:scale-95 ${
                    categoryFilter === 'other'
                      ? 'border-cognac bg-cognac'
                      : hasOtherIssue
                      ? 'border-rose-300 bg-rose-50'
                      : 'border-taupe/20 bg-champagne'
                  }`}>
                  <Text
                    className={`text-xs font-bold ${
                      categoryFilter === 'other'
                        ? 'text-white'
                        : hasOtherIssue
                        ? 'text-rose-700'
                        : 'text-taupe'
                    }`}>
                    Others {hasOtherIssue ? '✓' : ''}
                  </Text>
                </Pressable>

                {/* Spotted Items */}
                <Pressable
                  onPress={() => setCategoryFilter('spotted')}
                  className={`mr-1.5 flex-row items-center gap-1.5 rounded-lg px-3 py-1.5 border active:scale-95 ${
                    categoryFilter === 'spotted'
                      ? 'border-rose-600 bg-rose-600'
                      : spottedCount > 0
                      ? 'border-rose-300 bg-rose-50'
                      : 'border-taupe/20 bg-champagne'
                  }`}>
                  <Text
                    className={`text-xs font-bold ${
                      categoryFilter === 'spotted'
                        ? 'text-white'
                        : spottedCount > 0
                        ? 'text-rose-700'
                        : 'text-taupe'
                    }`}>
                    Spotted ({spottedCount})
                  </Text>
                </Pressable>
              </ScrollView>

              {/* Items List (Paginated max 6) */}
              {filteredQuestions.length === 0 && !shouldShowOthersCard ? (
                <View className="items-center justify-center rounded-xl border border-dashed border-taupe/30 bg-champagne/60 p-6">
                  <Search size={24} color="#8C7C70" />
                  <Text className="mt-2 text-xs font-bold text-espresso">
                    No matching pests or issues found
                  </Text>
                  <Text className="mt-1 text-center text-[11px] text-taupe">
                    {searchQuery
                      ? `No results for "${searchQuery}". Try a different keyword.`
                      : 'No items in this category.'}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setSearchQuery('');
                      setCategoryFilter('all');
                    }}
                    className="mt-3 rounded-lg bg-cognac/10 px-3 py-1.5 active:scale-95">
                    <Text className="text-xs font-bold text-cognac">Clear Filter & Search</Text>
                  </Pressable>
                </View>
              ) : (
                <View className="flex-col gap-2">
                  {paginatedQuestions.map((q) => {
                    const isChecked = Boolean(selectedPestIds[q.id]);
                    const itemCategory = getQuestionCategory(q);

                    return (
                      <Pressable
                        key={q.id}
                        onPress={() => handleTogglePest(q.id)}
                        className={`flex-row items-start gap-3 rounded-xl border p-3 active:scale-[0.99] ${
                          isChecked
                            ? 'border-rose-300 bg-rose-50/70 shadow-sm'
                            : 'border-taupe/15 bg-champagne'
                        }`}>
                        {/* Checkbox indicator */}
                        <View
                          className={`mt-0.5 h-5 w-5 rounded-md border items-center justify-center ${
                            isChecked
                              ? 'border-rose-600 bg-rose-600'
                              : 'border-taupe/40 bg-white'
                          }`}>
                          {isChecked && (
                            <Check size={12} color="#FFFFFF" strokeWidth={3} />
                          )}
                        </View>

                        {/* Text and symptom details */}
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5 mb-1 flex-wrap">
                            <View
                              className={`rounded px-1.5 py-0.5 ${
                                itemCategory === 'pest'
                                  ? 'bg-amber-100'
                                  : 'bg-indigo-100'
                              }`}>
                              <Text
                                className={`text-[9px] font-black uppercase tracking-wider ${
                                  itemCategory === 'pest'
                                    ? 'text-amber-800'
                                    : 'text-indigo-800'
                                }`}>
                                {itemCategory === 'pest' ? 'Pest' : 'Disease'}
                              </Text>
                            </View>

                            <Text
                              className={`text-xs ${
                                isChecked
                                  ? 'font-black text-rose-900'
                                  : 'font-bold text-espresso'
                              }`}>
                              {q.categoryName}
                            </Text>
                          </View>

                          <Text className="text-[11px] leading-4 text-taupe">
                            {q.question}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}

                  {/* "Others" Option Card */}
                  {shouldShowOthersCard && (
                    <Pressable
                      onPress={() => setHasOtherIssue((prev) => !prev)}
                      className={`rounded-xl border p-3 active:scale-[0.99] ${
                        hasOtherIssue
                          ? 'border-rose-300 bg-rose-50/80 shadow-sm'
                          : 'border-dashed border-taupe/30 bg-champagne/70'
                      }`}>
                      <View className="flex-row items-start gap-3">
                        {/* Checkbox */}
                        <View
                          className={`mt-0.5 h-5 w-5 rounded-md border items-center justify-center ${
                            hasOtherIssue
                              ? 'border-rose-600 bg-rose-600'
                              : 'border-taupe/40 bg-white'
                          }`}>
                          {hasOtherIssue && (
                            <Check size={12} color="#FFFFFF" strokeWidth={3} />
                          )}
                        </View>

                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5 mb-1">
                            <View className="rounded bg-taupe/15 px-1.5 py-0.5">
                              <Text className="text-[9px] font-black uppercase tracking-wider text-taupe">
                                Custom
                              </Text>
                            </View>
                            <Text
                              className={`text-xs ${
                                hasOtherIssue
                                  ? 'font-black text-rose-900'
                                  : 'font-bold text-espresso'
                              }`}>
                              Others (Unlisted Pest or Condition)
                            </Text>
                          </View>
                          <Text className="text-[11px] leading-4 text-taupe">
                            Spotted another issue not covered in the standard list above? Check this box and specify details.
                          </Text>

                          {/* Expanded input for specific custom issue */}
                          {hasOtherIssue && (
                            <View className="mt-2.5">
                              <TextInput
                                value={otherIssueText}
                                onChangeText={setOtherIssueText}
                                maxLength={255}
                                placeholder="Specify custom symptom or pest (e.g. rodent chewed stems, severe windburn)..."
                                placeholderTextColor="#8C7C70"
                                className="rounded-lg border border-taupe/25 bg-white px-3 py-2 text-xs text-espresso"
                              />
                            </View>
                          )}
                        </View>
                      </View>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Pagination Controls (Max 6 Items Per Page) */}
              {totalPages > 1 && categoryFilter !== 'other' && (
                <View className="mt-3.5 flex-row items-center justify-between border-t border-taupe/15 pt-3">
                  {/* Prev Button */}
                  <Pressable
                    onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    className={`flex-row items-center gap-1 rounded-lg px-2.5 py-1.5 active:scale-95 ${
                      safeCurrentPage <= 1
                        ? 'opacity-30 bg-transparent'
                        : 'bg-champagne border border-taupe/20'
                    }`}>
                    <ChevronRight
                      size={14}
                      color="#1C120C"
                      style={{ transform: [{ rotate: '180deg' }] }}
                    />
                    <Text className="text-xs font-bold text-espresso">Prev</Text>
                  </Pressable>

                  {/* Page Indicator */}
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs font-bold text-cognac">
                      Page {safeCurrentPage}
                    </Text>
                    <Text className="text-xs text-taupe">
                      of {totalPages} ({filteredQuestions.length} items)
                    </Text>
                  </View>

                  {/* Next Button */}
                  <Pressable
                    onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    className={`flex-row items-center gap-1 rounded-lg px-2.5 py-1.5 active:scale-95 ${
                      safeCurrentPage >= totalPages
                        ? 'opacity-30 bg-transparent'
                        : 'bg-champagne border border-taupe/20'
                    }`}>
                    <Text className="text-xs font-bold text-espresso">Next</Text>
                    <ChevronRight size={14} color="#1C120C" />
                  </Pressable>
                </View>
              )}
            </View>

            {/* Section 3: Notes & Photo Attachment (Keyboard Aware) */}
            <View className="mb-5 rounded-2xl border border-taupe/20 bg-white p-4 shadow-sm">
              <View className="flex-row items-center gap-2 mb-1">
                <Sparkles size={18} color="#8C4522" />
                <Text className="text-sm font-bold text-espresso uppercase tracking-wider">
                  3. Notes & Observations
                </Text>
              </View>
              <Text className="text-xs text-taupe mb-3">
                Add extra context, e.g. "Crops look healthy and vigorous" or specific field details:
              </Text>

              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                maxLength={3000}
                textAlignVertical="top"
                placeholder="e.g. Soil moisture is optimal. Observed beneficial ladybugs near corner bed. No weeds detected."
                placeholderTextColor="#8C7C70"
                className="min-h-[100px] rounded-xl border border-taupe/20 bg-champagne p-3 text-xs leading-5 text-espresso"
              />

              {/* Photo Preview & Capture */}
              <View className="mt-3">
                {imageUri ? (
                  <View className="relative h-44 w-full overflow-hidden rounded-2xl border border-taupe/20 bg-slate-900">
                    <Image
                      source={{ uri: imageUri }}
                      className="h-full w-full"
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => setImageUri(null)}
                      className="absolute top-2 right-2 rounded-full bg-black/70 p-2 active:scale-95">
                      <Trash2 size={16} color="#fb7185" />
                    </Pressable>
                  </View>
                ) : (
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={handleTakePhoto}
                      className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-taupe/30 bg-champagne py-3 active:scale-95">
                      <Camera size={16} color="#8C4522" />
                      <Text className="text-xs font-bold text-espresso">Take Photo</Text>
                    </Pressable>

                    <Pressable
                      onPress={handlePickImage}
                      className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-taupe/30 bg-champagne py-3 active:scale-95">
                      <FileText size={16} color="#8C4522" />
                      <Text className="text-xs font-bold text-espresso">Pick from Gallery</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            {/* Submit Action Button */}
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-cognac py-3.5 shadow-md shadow-cognac/30 active:scale-[0.98]">
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <FileText size={18} color="#FFFFFF" />
                  <Text className="text-sm font-bold text-white">Submit Field Report</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
  );
}
