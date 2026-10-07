import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { Modal } from '../../../components/common/AppModal';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Layers,
  Leaf,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import type { FarmDailyReportRecord } from '../../../lib/db-operations';
import type { PlotOption } from '../types';
import { useAccessibility } from '../../../lib/accessibility';

type DailyReportsViewerSheetProps = {
  visible: boolean;
  onClose: () => void;
  reports: FarmDailyReportRecord[];
  plots: PlotOption[];
  onDeleteReport?: (reportId: string) => Promise<void>;
  isOwner?: boolean;
  currentUserId?: string;
};

function formatReportTime(isoString: string): string {
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

  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${timeStr}`;
}

export function DailyReportsViewerSheet({
  visible,
  onClose,
  reports,
  plots,
  onDeleteReport,
  isOwner = false,
  currentUserId,
}: DailyReportsViewerSheetProps) {
  const { isGloveMode, triggerHaptic } = useAccessibility();
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'today' | 'issues'>('all');
  const [selectedPlotFilter, setSelectedPlotFilter] = useState<string>('all');
  const [selectedReportForDetail, setSelectedReportForDetail] = useState<FarmDailyReportRecord | null>(
    null
  );
  const [expandedReportIds, setExpandedReportIds] = useState<Record<string, boolean>>({});
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  // Filtered reports
  const filteredReports = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    return reports.filter((r) => {
      // Plot filter
      if (selectedPlotFilter !== 'all') {
        const matchesStructure = r.garden_structure_id === selectedPlotFilter;
        const matchesGeneral = selectedPlotFilter === 'general' && !r.garden_structure_id;
        if (!matchesStructure && !matchesGeneral) return false;
      }

      // Status filter
      if (selectedFilter === 'today') {
        const reportDate = r.report_date || r.created_at?.split('T')[0];
        return reportDate === todayStr;
      }

      if (selectedFilter === 'issues') {
        return (r.symptoms_summary_json?.length || 0) > 0;
      }

      return true;
    });
  }, [reports, selectedFilter, selectedPlotFilter]);

  const counts = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCount = reports.filter((r) => (r.report_date || r.created_at?.split('T')[0]) === todayStr)
      .length;
    const issuesCount = reports.filter((r) => (r.symptoms_summary_json?.length || 0) > 0).length;

    return {
      all: reports.length,
      today: todayCount,
      issues: issuesCount,
    };
  }, [reports]);

  const handleDelete = (report: FarmDailyReportRecord) => {
    Alert.alert(
      'Delete Field Report',
      'Are you sure you want to delete this observation report? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (onDeleteReport) {
              await onDeleteReport(report.id);
              if (selectedReportForDetail?.id === report.id) {
                setSelectedReportForDetail(null);
              }
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="h-[92%] w-full rounded-t-3xl bg-champagne overflow-hidden shadow-2xl pb-5">
          {/* Header */}
          <View className="border-b border-taupe/20 bg-white px-5 py-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <View className="h-10 w-10 items-center justify-center rounded-2xl bg-cognac/10">
                  <FileText size={22} className="text-cognac" />
                </View>
                <View>
                  <Text className="text-lg font-black text-espresso">Daily Field Logs</Text>
                  <Text className="text-xs text-taupe font-medium">
                    {reports.length} Total Field Check-in{reports.length === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onClose}
                className="h-9 w-9 items-center justify-center rounded-full bg-champagne active:scale-95">
                <X size={18} className="text-espresso" />
              </Pressable>
            </View>

            {/* Filter Pills */}
            <View className="mt-3.5 flex-row gap-2">
              <Pressable
                onPress={() => setSelectedFilter('all')}
                className={`flex-row items-center gap-1.5 rounded-xl px-3 py-1.5 active:scale-95 ${
                  selectedFilter === 'all' ? 'bg-cognac' : 'bg-champagne/80'
                }`}>
                <Text
                  className={`text-xs font-bold ${
                    selectedFilter === 'all' ? 'text-white' : 'text-espresso'
                  }`}>
                  All ({counts.all})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setSelectedFilter('today')}
                className={`flex-row items-center gap-1.5 rounded-xl px-3 py-1.5 active:scale-95 ${
                  selectedFilter === 'today' ? 'bg-cognac' : 'bg-champagne/80'
                }`}>
                <Text
                  className={`text-xs font-bold ${
                    selectedFilter === 'today' ? 'text-white' : 'text-espresso'
                  }`}>
                  Today ({counts.today})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setSelectedFilter('issues')}
                className={`flex-row items-center gap-1.5 rounded-xl px-3 py-1.5 active:scale-95 ${
                  selectedFilter === 'issues' ? 'bg-cognac' : 'bg-champagne/80'
                }`}>
                <ShieldAlert
                  size={13}
                  className={selectedFilter === 'issues' ? 'text-white' : 'text-rose-600'}
                />
                <Text
                  className={`text-xs font-bold ${
                    selectedFilter === 'issues' ? 'text-white' : 'text-espresso'
                  }`}>
                  Symptoms Spotted ({counts.issues})
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Feed List */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {filteredReports.length === 0 ? (
              <View className="items-center justify-center rounded-3xl border border-taupe/20 bg-white p-8 mt-4">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-cognac/10">
                  <FileText size={30} className="text-cognac" />
                </View>
                <Text className="mt-4 text-base font-black text-espresso">No Field Reports</Text>
                <Text className="mt-1.5 px-6 text-center text-xs leading-5 text-taupe">
                  {selectedFilter === 'today'
                    ? 'No observation reports have been submitted today yet.'
                    : selectedFilter === 'issues'
                    ? 'No reports with disease or pest symptoms found.'
                    : 'No daily field reports submitted for this farm yet.'}
                </Text>
              </View>
            ) : (
              filteredReports.map((report) => {
                const symptoms = report.symptoms_summary_json || [];
                const hasSymptoms = symptoms.length > 0;
                const canDelete = isOwner || currentUserId === report.user_id;

                return (
                  <View
                    key={report.id}
                    className="mb-3.5 overflow-hidden rounded-3xl border border-taupe/20 bg-white p-4 shadow-sm">
                    {/* Top Row: Plot & Status */}
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-1.5">
                        <View className="rounded-lg bg-champagne/80 px-2.5 py-1">
                          <Text className="text-xs font-black text-espresso">
                            {report.plot_name || 'General Field'}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row items-center gap-2">
                        <View
                          className={`flex-row items-center gap-1 rounded-full px-2.5 py-0.5 border ${
                            hasSymptoms
                              ? 'bg-rose-50 border-rose-200'
                              : 'bg-emerald-50 border-emerald-200'
                          }`}>
                          {hasSymptoms ? (
                            <ShieldAlert size={12} className="text-rose-600" />
                          ) : (
                            <ShieldCheck size={12} className="text-emerald-600" />
                          )}
                          <Text
                            className={`text-[10px] font-black uppercase tracking-wider ${
                              hasSymptoms ? 'text-rose-700' : 'text-emerald-700'
                            }`}>
                            {hasSymptoms
                              ? `${symptoms.length} Issue${symptoms.length === 1 ? '' : 's'}`
                              : 'Normal & Healthy'}
                          </Text>
                        </View>

                        {canDelete && (
                          <Pressable
                            onPress={() => {
                              triggerHaptic('impactMedium');
                              handleDelete(report);
                            }}
                            hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : { top: 12, bottom: 12, left: 12, right: 12 }}
                            style={isGloveMode ? { minWidth: 44, minHeight: 44 } : undefined}
                            className="h-8 w-8 items-center justify-center rounded-xl bg-rose-50 border border-rose-200/80 active:scale-95 active:bg-rose-100">
                            <Trash2 size={15} className="text-rose-600" />
                          </Pressable>
                        )}
                      </View>
                    </View>

                    {/* Symptoms Spotted List */}
                    {hasSymptoms && (
                      <View className="mt-3 rounded-2xl bg-rose-50/60 p-2.5 border border-rose-100">
                        <Text className="text-[10px] font-black uppercase tracking-wider text-rose-800 mb-1">
                          Symptoms Identified:
                        </Text>
                        {symptoms.map((s, sIdx) => (
                          <View key={sIdx} className="flex-row items-start gap-1.5 mb-1 last:mb-0">
                            <View className="mt-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
                            <Text className="text-xs text-rose-900 leading-4 flex-1">
                              <Text className="font-bold">{s.category}: </Text>
                              {s.question}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Farmer Notes */}
                    {report.notes ? (
                      <View className="mt-3 rounded-2xl bg-champagne p-3 border border-taupe/15">
                        <View className="flex-row items-center gap-1.5 mb-1">
                          <FileText size={13} className="text-cognac" />
                          <Text className="text-[10px] font-black uppercase tracking-wider text-cognac">
                            Farmer Notes:
                          </Text>
                        </View>
                        <Text className="text-xs leading-5 text-espresso font-medium italic">
                          "{report.notes}"
                        </Text>
                      </View>
                    ) : null}

                    {/* Attached Photo */}
                    {report.image_uri && (
                      <Pressable
                        onPress={() => setPreviewImageUri(report.image_uri)}
                        className="mt-3 relative h-36 w-full overflow-hidden rounded-2xl border border-taupe/20 bg-slate-900 active:scale-[0.99]">
                        <Image
                          source={{ uri: report.image_uri }}
                          className="h-full w-full"
                          resizeMode="cover"
                        />
                        <View className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-2 py-0.5">
                          <Text className="text-[10px] font-bold text-white">Tap to Enlarge</Text>
                        </View>
                      </Pressable>
                    )}

                    {/* Expandable Full Checklist Responses */}
                    {report.answers_json && Object.keys(report.answers_json).length > 0 && (
                      <View className="mt-3">
                        <Pressable
                          onPress={() =>
                            setExpandedReportIds((prev) => ({
                              ...prev,
                              [report.id]: !prev[report.id],
                            }))
                          }
                          className="flex-row items-center justify-between rounded-xl bg-champagne/60 px-3 py-2 active:scale-95">
                          <Text className="text-[11px] font-bold text-espresso">
                            {expandedReportIds[report.id]
                              ? 'Hide Full Checklist'
                              : 'View Full Question Responses'}
                          </Text>
                          <ChevronDown
                            size={14}
                            className={`text-taupe ${expandedReportIds[report.id] ? 'rotate-180' : ''}`}
                          />
                        </Pressable>

                        {expandedReportIds[report.id] && (
                          <View className="mt-2 rounded-2xl border border-taupe/20 bg-champagne p-3 gap-2">
                            {Object.entries(report.answers_json).map(([qKey, ans]) => (
                              <View
                                key={qKey}
                                className="flex-row items-center justify-between py-1 border-b border-taupe/10 last:border-0">
                                <Text className="text-[11px] text-espresso flex-1 pr-2 font-medium">
                                  {qKey.replace(/^pc_/, '').replace(/_\d+$/, '').replace(/_/g, ' ')}
                                </Text>
                                <View
                                  className={`rounded-md px-2 py-0.5 ${
                                    ans === 'yes'
                                      ? 'bg-rose-100 border border-rose-200'
                                      : 'bg-emerald-100 border border-emerald-200'
                                  }`}>
                                  <Text
                                    className={`text-[10px] font-bold uppercase ${
                                      ans === 'yes' ? 'text-rose-800' : 'text-emerald-800'
                                    }`}>
                                    {ans === 'yes' ? 'Yes, Spotted' : 'No Symptoms'}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    {/* Timestamp */}
                    <View className="mt-3 pt-2.5 border-t border-taupe/15 flex-row items-center justify-between">
                      <View className="flex-row items-center gap-1">
                        <Calendar size={12} className="text-taupe" />
                        <Text className="text-[11px] font-medium text-taupe">
                          {formatReportTime(report.created_at)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Full Image Preview Modal */}
          {previewImageUri && (
            <Modal
              visible={true}
              animationType="fade"
              transparent={true}
              onRequestClose={() => setPreviewImageUri(null)}>
              <View className="flex-1 items-center justify-center bg-black/90 p-4">
                <Pressable
                  style={StyleSheet.absoluteFillObject}
                  onPress={() => setPreviewImageUri(null)}
                />
                <Pressable
                  onPress={() => setPreviewImageUri(null)}
                  className="absolute top-12 right-6 z-10 rounded-full bg-white/20 p-2 active:scale-90">
                  <X size={24} className="text-white" />
                </Pressable>
                <Image
                  source={{ uri: previewImageUri }}
                  className="h-[80%] w-full rounded-2xl"
                  resizeMode="contain"
                />
              </View>
            </Modal>
          )}
        </View>
      </View>
    </Modal>
  );
}
