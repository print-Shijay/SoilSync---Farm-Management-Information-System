import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  BackHandler,
  StyleSheet,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { Modal } from '../../../components/common/AppModal';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  Calendar,
  ChevronRight,
  Eye,
  Layers,
  Leaf,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import { BackButton } from '../../../components/common/BackButton';
import {
  getAllFarmCheckUpResults,
  getFarm,
  deleteFarmCheckUpResult,
  fetchMitigationPlanFromDB,
  fetchDynamicProblemClassesFromDB,
  saveMitigationTodos,
  type ProblemClassItem,
} from '../../../lib/db-operations';
import { useAuth } from '../../../lib/AuthContext';
import { CONDITION_LABELS, YOLO_CLASS_INDEX } from '../../../modules/rfdetr-detector/config';
import { type Mitigation } from '../../../lib/todo-list-engine';

type FilterTab = 'all' | 'issues' | 'healthy';

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (diffHours < 1) {
    const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${mins}m ago`;
  }
  if (diffHours < 24 && now.getDate() === date.getDate()) {
    return `Today at ${timeStr}`;
  }
  if (diffDays === 1) {
    return `Yesterday at ${timeStr}`;
  }

  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${timeStr}`;
}

function formatLabel(label: string): string {
  return label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DiagnosticScanImage({
  imageUri,
  cloudFallback,
  className,
  resizeMode = 'cover',
}: {
  imageUri: string | null;
  cloudFallback?: string | null;
  className?: string;
  resizeMode?: 'cover' | 'contain';
}) {
  const [currentUri, setCurrentUri] = useState<string | null>(imageUri || cloudFallback || null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setCurrentUri(imageUri || cloudFallback || null);
    setHasError(false);
  }, [imageUri, cloudFallback]);

  if (!currentUri || hasError) {
    return (
      <View className="h-full w-full items-center justify-center bg-champagne">
        <Leaf size={24} className="text-taupe" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: currentUri }}
      className={className || 'h-full w-full'}
      resizeMode={resizeMode}
      onError={() => {
        if (cloudFallback && currentUri !== cloudFallback) {
          setCurrentUri(cloudFallback);
        } else {
          setHasError(true);
        }
      }}
    />
  );
}

export default function FarmDiagnosticHistoryScreen() {
  const params = useLocalSearchParams();
  const farmId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();

  const [farm, setFarm] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [dynamicProblems, setDynamicProblems] = useState<ProblemClassItem[]>([]);

  // Inspection Modal State
  const [selectedScan, setSelectedScan] = useState<any>(null);
  const [modalMitigations, setModalMitigations] = useState<Record<string | number, Mitigation[]>>({});
  const [expandedMitigations, setExpandedMitigations] = useState<Record<string | number, boolean>>({});
  const [isSavingMitigation, setIsSavingMitigation] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (selectedScan) {
          setSelectedScan(null);
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [selectedScan])
  );

  const loadData = useCallback(async () => {
    if (!farmId) return;
    setIsLoading(true);
    try {
      const [farmData, historyRows, problems] = await Promise.all([
        getFarm(farmId),
        getAllFarmCheckUpResults(farmId),
        fetchDynamicProblemClassesFromDB(),
      ]);
      setFarm(farmData);
      setResults(historyRows);
      setDynamicProblems(problems);
    } catch (err) {
      console.error('Failed to load diagnostic history:', err);
      Alert.alert('Error', 'Unable to load diagnostic history.');
    } finally {
      setIsLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Load mitigations when inspection modal opens
  useEffect(() => {
    if (!selectedScan?.summary_data?.identifiedProblems) {
      setModalMitigations({});
      return;
    }

    const fetchMitigations = async () => {
      const mitigationsMap: Record<string | number, Mitigation[]> = {};
      const problems = selectedScan.summary_data.identifiedProblems || [];

      for (const p of problems) {
        const classId = p.classId;
        const slug =
          typeof classId === 'number'
            ? Object.keys(YOLO_CLASS_INDEX).find((k) => YOLO_CLASS_INDEX[k] === classId) || ''
            : classId;
        if (slug) {
          const m = await fetchMitigationPlanFromDB(slug);
          mitigationsMap[classId] = m;
        }
      }
      setModalMitigations(mitigationsMap);
    };

    void fetchMitigations();
  }, [selectedScan]);

  const handleDeleteScan = (id: string) => {
    Alert.alert(
      'Delete Scan Record',
      'Are you sure you want to delete this photo analysis? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFarmCheckUpResult(id);
              if (selectedScan?.id === id) {
                setSelectedScan(null);
              }
              setResults((prev) => prev.filter((r) => r.id !== id));
            } catch (err) {
              Alert.alert('Error', 'Failed to delete diagnostic record.');
            }
          },
        },
      ]
    );
  };

  const handleAddMitigationToFarm = async (problemName: string, steps: Mitigation[]) => {
    if (!user?.id || !farmId) {
      Alert.alert('Sign in required', 'Please sign in to add mitigation tasks.');
      return;
    }
    if (!steps || steps.length === 0) {
      Alert.alert('Notice', 'No mitigation steps to add.');
      return;
    }

    setIsSavingMitigation(true);
    try {
      await saveMitigationTodos({
        userId: user.id,
        farmId,
        problemName,
        mitigationSteps: steps,
      });
      Alert.alert('Tasks Added', `Mitigation tasks for ${problemName} have been added to your farm tasks.`);
    } catch (err) {
      console.error('Failed to save mitigation:', err);
      Alert.alert('Error', 'Unable to add mitigation tasks.');
    } finally {
      setIsSavingMitigation(false);
    }
  };

  // Filtered Results
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      const summary = item.summary_data || {};
      const modelResults = summary.modelResults;
      const detections = modelResults?.health?.allDetections || [];
      const hasIssues = detections.length > 0 || (summary.identifiedProblems?.length || 0) > 0;

      // Tab filter
      if (activeTab === 'issues' && !hasIssues) return false;
      if (activeTab === 'healthy' && hasIssues) return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const conditionLabel = (modelResults?.health?.conditionLabel || '').toLowerCase();
        const summaryText = (modelResults?.health?.summary || '').toLowerCase();
        const problemNames = (summary.identifiedProblems || [])
          .map((p: any) => String(p.classId).toLowerCase())
          .join(' ');

        return (
          conditionLabel.includes(query) ||
          summaryText.includes(query) ||
          problemNames.includes(query)
        );
      }

      return true;
    });
  }, [results, activeTab, searchQuery]);

  const counts = useMemo(() => {
    let issues = 0;
    let healthy = 0;
    results.forEach((item) => {
      const summary = item.summary_data || {};
      const detections = summary.modelResults?.health?.allDetections || [];
      if (detections.length > 0 || (summary.identifiedProblems?.length || 0) > 0) {
        issues++;
      } else {
        healthy++;
      }
    });
    return { all: results.length, issues, healthy };
  }, [results]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-champagne">
        <ActivityIndicator size="large" color="#8C4522" />
        <Text className="mt-3 text-xs font-bold uppercase tracking-widest text-taupe">
          Loading Diagnostic History...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-champagne">
      {/* ─── Top Header ─── */}
      <View className="border-b border-taupe/15 bg-white/90 pt-14 pb-3 px-5 shadow-sm shadow-espresso/5">
        <View className="flex-row items-center justify-between">
          <BackButton />

          <View className="flex-1 items-center px-2">
            <Text className="text-lg font-black tracking-tight text-espresso" numberOfLines={1}>
              Diagnostic History
            </Text>
            <Text className="text-xs font-semibold text-taupe" numberOfLines={1}>
              {farm?.farm_name || 'Farm'} · {results.length} Total Scan{results.length === 1 ? '' : 's'}
            </Text>
          </View>

          <Pressable
            onPress={loadData}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-champagne active:scale-95">
            <RotateCcw className="text-espresso" size={17} />
          </Pressable>
        </View>

        {/* ─── Search Input ─── */}
        <View className="mt-4 flex-row items-center rounded-2xl border border-taupe/20 bg-champagne px-3.5 py-2.5">
          <Search size={16} className="text-taupe mr-2.5" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            maxLength={255}
            placeholder="Search symptoms, pests, or conditions..."
            placeholderTextColor="#A8A29E"
            className="flex-1 text-sm font-medium text-espresso"
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
              <X size={16} className="text-taupe" />
            </Pressable>
          ) : null}
        </View>

        {/* ─── Filter Pills ─── */}
        <View className="mt-3 flex-row gap-2">
          <Pressable
            onPress={() => setActiveTab('all')}
            className={`flex-row items-center gap-1.5 rounded-xl px-3.5 py-2 active:scale-95 ${
              activeTab === 'all' ? 'bg-cognac shadow-sm shadow-cognac/30' : 'bg-champagne/80'
            }`}>
            <Text
              className={`text-xs font-bold ${
                activeTab === 'all' ? 'text-white' : 'text-espresso'
              }`}>
              All Scans
            </Text>
            <View
              className={`rounded-full px-1.5 py-0.2 ${
                activeTab === 'all' ? 'bg-white/20' : 'bg-black/5'
              }`}>
              <Text
                className={`text-[10px] font-black ${
                  activeTab === 'all' ? 'text-white' : 'text-taupe'
                }`}>
                {counts.all}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('issues')}
            className={`flex-row items-center gap-1.5 rounded-xl px-3.5 py-2 active:scale-95 ${
              activeTab === 'issues' ? 'bg-cognac shadow-sm shadow-cognac/30' : 'bg-champagne/80'
            }`}>
            <ShieldAlert size={13} className={activeTab === 'issues' ? 'text-white' : 'text-rose-600'} />
            <Text
              className={`text-xs font-bold ${
                activeTab === 'issues' ? 'text-white' : 'text-espresso'
              }`}>
              Issues
            </Text>
            <View
              className={`rounded-full px-1.5 py-0.2 ${
                activeTab === 'issues' ? 'bg-white/20' : 'bg-black/5'
              }`}>
              <Text
                className={`text-[10px] font-black ${
                  activeTab === 'issues' ? 'text-white' : 'text-taupe'
                }`}>
                {counts.issues}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('healthy')}
            className={`flex-row items-center gap-1.5 rounded-xl px-3.5 py-2 active:scale-95 ${
              activeTab === 'healthy' ? 'bg-cognac shadow-sm shadow-cognac/30' : 'bg-champagne/80'
            }`}>
            <ShieldCheck size={13} className={activeTab === 'healthy' ? 'text-white' : 'text-emerald-600'} />
            <Text
              className={`text-xs font-bold ${
                activeTab === 'healthy' ? 'text-white' : 'text-espresso'
              }`}>
              Healthy
            </Text>
            <View
              className={`rounded-full px-1.5 py-0.2 ${
                activeTab === 'healthy' ? 'bg-white/20' : 'bg-black/5'
              }`}>
              <Text
                className={`text-[10px] font-black ${
                  activeTab === 'healthy' ? 'text-white' : 'text-taupe'
                }`}>
                {counts.healthy}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* ─── Timeline Feed ─── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {filteredResults.length === 0 ? (
          <View className="items-center justify-center rounded-3xl border border-taupe/20 bg-white p-8 mt-6">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-cognac/10">
              <Leaf size={32} className="text-cognac" />
            </View>
            <Text className="mt-4 text-base font-black text-espresso">No Diagnostic Records</Text>
            <Text className="mt-1.5 px-6 text-center text-xs leading-5 text-taupe">
              {searchQuery
                ? 'No past photo analyses matched your search term.'
                : 'No photo analysis checkups have been performed yet for this farm.'}
            </Text>
          </View>
        ) : (
          filteredResults.map((item) => {
            const summary = item.summary_data || {};
            const modelResults = summary.modelResults;
            const detections = modelResults?.health?.allDetections || [];
            const hasIssues = detections.length > 0 || (summary.identifiedProblems?.length || 0) > 0;
            const primaryCondition = modelResults?.health?.conditionLabel || (hasIssues ? 'Issue Detected' : 'Healthy Crop');
            const confidence = modelResults?.health?.confidence
              ? Math.round(modelResults.health.confidence * 100)
              : null;

            return (
              <Pressable
                key={item.id}
                onPress={() => setSelectedScan(item)}
                className="mb-3.5 overflow-hidden rounded-3xl border border-taupe/25 bg-white p-4 shadow-sm active:scale-[0.98]">
                <View className="flex-row items-center gap-3.5">
                  {/* Leaf Thumbnail with smart local/cloud resolution */}
                  <View className="relative h-20 w-20 overflow-hidden rounded-2xl bg-slate-900 shadow-inner">
                    <DiagnosticScanImage
                      imageUri={item.image_uri}
                      cloudFallback={item.summary_data?.cloud_image_uri}
                      className="h-full w-full"
                      resizeMode="cover"
                    />

                    {detections.length > 0 && (
                      <View className="absolute bottom-1 right-1 rounded-md bg-orange-600/90 px-1 py-0.5">
                        <Text className="text-[8px] font-black uppercase tracking-wider text-white">
                          {detections.length} Box{detections.length === 1 ? '' : 'es'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Meta Details */}
                  <View className="flex-1">
                    <View className="flex-row items-center justify-between">
                      <View
                        className={`rounded-full px-2.5 py-0.5 border ${
                          hasIssues
                            ? 'bg-rose-50 border-rose-200'
                            : 'bg-emerald-50 border-emerald-200'
                        }`}>
                        <Text
                          className={`text-[10px] font-black uppercase tracking-widest ${
                            hasIssues ? 'text-rose-700' : 'text-emerald-700'
                          }`}>
                          {hasIssues ? 'Issue Detected' : 'Healthy'}
                        </Text>
                      </View>

                      <Text className="text-[11px] font-semibold text-taupe">
                        {formatTimestamp(item.created_at)}
                      </Text>
                    </View>

                    <Text className="mt-1.5 text-base font-black text-espresso" numberOfLines={1}>
                      {primaryCondition}
                    </Text>

                    <View className="mt-1 flex-row items-center gap-2">
                      {confidence !== null && (
                        <Text className="text-xs font-bold text-cognac">
                          {confidence}% Confidence
                        </Text>
                      )}
                      <Text className="text-xs text-taupe">•</Text>
                      <Text className="text-xs font-semibold text-taupe">
                        {summary.identifiedProblems?.length || (hasIssues ? 1 : 0)} Symptoms
                      </Text>
                    </View>
                  </View>

                  <ChevronRight size={18} className="text-taupe/60" />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* ─── Detailed Inspection Modal ─── */}
      <Modal
        visible={Boolean(selectedScan)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedScan(null)}>
        <View className="flex-1 items-center justify-center bg-black/60 px-5">
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setSelectedScan(null)}
          />
          <View
            className="max-h-[90%] w-full max-w-md rounded-3xl border border-taupe/30 bg-white p-6 shadow-2xl">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between border-b border-taupe/20 pb-3">
              <View>
                <Text className="text-[9px] font-semibold uppercase tracking-[0.25em] text-cognac">
                  Diagnostic Inspection
                </Text>
                <Text className="mt-0.5 text-xs font-bold text-taupe">
                  {selectedScan?.created_at ? formatTimestamp(selectedScan.created_at) : 'Scan Detail'}
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => selectedScan && handleDeleteScan(selectedScan.id)}
                  hitSlop={8}
                  accessibilityLabel="Delete diagnostic scan"
                  accessibilityRole="button"
                  className="h-8 w-8 items-center justify-center rounded-xl bg-rose-50 border border-rose-200 active:scale-95">
                  <Trash2 size={14} className="text-rose-600" />
                </Pressable>
                <Pressable
                  onPress={() => setSelectedScan(null)}
                  className="rounded-xl bg-champagne px-3 py-1 active:scale-95">
                  <Text className="text-xs font-bold text-taupe">Close</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              className="mt-4">
              {/* High-Res Photo with Overlaid Bounding Boxes */}
              {selectedScan?.image_uri || selectedScan?.summary_data?.cloud_image_uri ? (
                <View className="relative mb-4 aspect-square w-full overflow-hidden rounded-2xl bg-slate-950">
                  <DiagnosticScanImage
                    imageUri={selectedScan.image_uri}
                    cloudFallback={selectedScan.summary_data?.cloud_image_uri}
                    className="absolute inset-0 h-full w-full"
                    resizeMode="cover"
                  />

                  {selectedScan.summary_data?.modelResults?.health?.allDetections?.map(
                    (box: any, index: number) => {
                      const left = `${(box.bbox.x - box.bbox.width / 2) * 100}%`;
                      const top = `${(box.bbox.y - box.bbox.height / 2) * 100}%`;
                      const width = `${box.bbox.width * 100}%`;
                      const height = `${box.bbox.height * 100}%`;

                      return (
                        <View
                          key={`inspect-bbox-${index}`}
                          style={{
                            position: 'absolute',
                            left: left as any,
                            top: top as any,
                            width: width as any,
                            height: height as any,
                            borderColor: '#f97316',
                            borderWidth: 2,
                            borderRadius: 4,
                          }}>
                          <View className="absolute -top-5 left-[-2px] rounded-t-sm bg-orange-500 px-1.5 py-0.5">
                            <Text className="font-mono text-[9px] font-bold uppercase tracking-wider text-white">
                              {box.className.replace('_', ' ')} {Math.round(box.confidence * 100)}%
                            </Text>
                          </View>
                        </View>
                      );
                    }
                  )}
                </View>
              ) : null}

              {/* Diagnosis Summary Card */}
              <View className="rounded-2xl border border-taupe/30 bg-cognac/10 p-4">
                <Text className="text-xs font-semibold uppercase tracking-[0.18em] text-cognac">
                  Diagnosis Overview
                </Text>
                <Text className="mt-1.5 text-base font-black text-espresso">
                  {selectedScan?.summary_data?.modelResults?.health?.conditionLabel || 'Plant Analysis'}
                </Text>
                <Text className="mt-1 text-sm leading-5 text-espresso">
                  {selectedScan?.summary_data?.modelResults?.health?.summary || 'Scan verified and recorded.'}
                </Text>
              </View>

              {/* Questionnaire Breakdown */}
              {selectedScan?.summary_data?.questionnaireScores && (
                <View className="mt-4 rounded-2xl border border-taupe/30 bg-white p-4">
                  <Text className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-taupe">
                    Assessment Breakdown
                  </Text>
                  {dynamicProblems.map((problem) => {
                    const score = selectedScan.summary_data.questionnaireScores[problem.id] ?? 0;
                    const max = Math.max(problem.questions?.length || 1, 1);
                    const pct = Math.min((score / max) * 100, 100);

                    return (
                      <View key={`inspect-chart-${problem.id}`} className="mb-3">
                        <View className="mb-1 flex-row items-center justify-between">
                          <Text className="text-xs font-bold text-espresso">{problem.name}</Text>
                          <Text className="text-xs font-bold text-taupe">
                            {score}/{max}
                          </Text>
                        </View>
                        <View className="h-2.5 w-full overflow-hidden rounded-full bg-champagne">
                          <View
                            style={{ width: `${pct}%` as any }}
                            className={`h-full rounded-full ${pct > 0 ? 'bg-orange-500' : 'bg-champagne'}`}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Mitigation Steps Preview */}
              <View className="mt-4">
                <Text className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-taupe">
                  Mitigation Guidance
                </Text>
                {(selectedScan?.summary_data?.identifiedProblems || []).length === 0 ? (
                  <View className="rounded-2xl border border-taupe/20 bg-champagne p-4">
                    <Text className="text-center text-xs font-semibold text-taupe">
                      No active pest or disease mitigation needed.
                    </Text>
                  </View>
                ) : (
                  (selectedScan?.summary_data?.identifiedProblems || []).map((p: any, idx: number) => {
                    const classId = p.classId;
                    const dyn = dynamicProblems.find((d) => d.id === classId);
                    const label = dyn ? dyn.name : formatLabel(String(classId));
                    const steps = modalMitigations[classId] || [];
                    const isExpanded = !!expandedMitigations[classId];

                    return (
                      <View
                        key={`inspect-problem-${classId}`}
                        className="mb-3 rounded-2xl border border-taupe/30 bg-white p-4">
                        <View className="flex-row items-center justify-between">
                          <View className="flex-row items-center gap-2">
                            <View className="h-6 w-6 items-center justify-center rounded-full bg-cognac">
                              <Text className="text-xs font-black text-white">{idx + 1}</Text>
                            </View>
                            <Text className="text-sm font-black text-espresso">{label}</Text>
                          </View>

                          <Pressable
                            onPress={() =>
                              setExpandedMitigations((prev) => ({
                                ...prev,
                                [classId]: !prev[classId],
                              }))
                            }
                            className="rounded-lg bg-champagne px-2.5 py-1">
                            <Text className="text-[10px] font-bold uppercase text-taupe">
                              {isExpanded ? 'Hide' : 'View Steps'}
                            </Text>
                          </Pressable>
                        </View>

                        {isExpanded && steps.length > 0 && (
                          <View className="mt-3 gap-2">
                            {steps.map((step, sIdx) => (
                              <View
                                key={`inspect-step-${sIdx}`}
                                className="rounded-xl border border-taupe/20 bg-cognac/10 p-2.5">
                                <Text className="text-[9px] font-bold uppercase tracking-widest text-cognac">
                                  Day {step.day}
                                </Text>
                                <Text className="mt-0.5 text-xs font-bold text-espresso">
                                  {step.title}
                                </Text>
                                <Text className="mt-0.5 text-[11px] leading-4 text-taupe">
                                  {step.description}
                                </Text>
                              </View>
                            ))}

                            <Pressable
                              disabled={isSavingMitigation}
                              onPress={() => handleAddMitigationToFarm(label, steps)}
                              className="mt-2 self-end rounded-xl bg-cognac px-4 py-2 active:scale-95">
                              <Text className="text-xs font-bold uppercase tracking-wider text-white">
                                Add to Farm Tasks
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>

            {/* Bottom Modal Button */}
            <View className="mt-4">
              <Pressable
                onPress={() => setSelectedScan(null)}
                className="items-center justify-center rounded-2xl bg-cognac py-3.5 shadow-md shadow-cognac/30 active:scale-[0.98]">
                <Text className="text-sm font-bold text-white">Done Inspecting</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
