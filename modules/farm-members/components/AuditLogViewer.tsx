import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  ActivityIndicator,
  Pressable,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import {
  History,
  UserPlus,
  UserMinus,
  FileEdit,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  CircleAlert,
  Leaf,
  Activity,
  Search,
  X,
  Layers,
  Sparkles,
  UserCheck,
  UserX,
  FileText,
} from 'lucide-react-native';
import { AuditLog, useAuditLogs } from '../hooks/useAuditLogs';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface AuditLogViewerProps {
  farmId: string;
  isOwner: boolean;
  showHeader?: boolean;
}

type TimeRangeFilter = 'all' | '7days' | '30days';
type CategoryFilter = 'all' | 'tasks' | 'plans' | 'health' | 'team';

const CATEGORIES: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'plans', label: 'Plans' },
  { id: 'health', label: 'Health' },
  { id: 'team', label: 'Team' },
];

const TIME_RANGES: { id: TimeRangeFilter; label: string }[] = [
  { id: 'all', label: 'All Time' },
  { id: '7days', label: '7 Days' },
  { id: '30days', label: '30 Days' },
];

// Helper: robust date parsing for Hermes / Android SQLite strings
function parseSafeDate(dateString?: string | null): Date {
  if (!dateString) return new Date();
  let normalized = String(dateString).trim();
  if (normalized.includes(' ') && !normalized.includes('T')) {
    normalized = normalized.replace(' ', 'T') + (normalized.endsWith('Z') ? '' : 'Z');
  } else if (normalized.includes('T') && !normalized.endsWith('Z') && !normalized.includes('+') && !normalized.includes('-')) {
    normalized = normalized + 'Z';
  }
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d;
  const fallback = new Date(dateString);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

// Helper: timestamp matching the exact format in the screenshot: "8/16/2026 at 4:17 PM"
function formatTimelineDate(dateString: string): string {
  const date = parseSafeDate(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${month}/${day}/${year} at ${hours}:${minutes} ${ampm}`;
}

// Helper: group date section key
function getDateSectionTitle(dateString: string): string {
  const date = parseSafeDate(dateString);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (date >= startOfToday) return 'Today';
  if (date >= startOfYesterday) return 'Yesterday';
  if (date >= startOfWeek) return 'This Week';
  if (date >= startOfMonth) return 'Earlier This Month';

  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Helper: user display name
function getDisplayName(firstName?: string, lastName?: string, email?: string) {
  if (firstName || lastName) {
    return `${firstName || ''} ${lastName || ''}`.trim();
  }
  if (email) {
    const namePart = email.split('@')[0];
    return namePart
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return 'SoilSync User';
}

// Action icon & color metadata
function getActionMeta(action: string) {
  if (action === 'MEMBER_INVITED') {
    return {
      icon: UserPlus,
      color: '#8C4522',
      bg: 'bg-cognac/10',
      border: 'border-cognac/30',
      category: 'team',
    };
  }
  if (action === 'MEMBER_JOINED') {
    return {
      icon: UserCheck,
      color: '#059669',
      bg: 'bg-emerald-50',
      border: 'border-emerald-300',
      category: 'team',
    };
  }
  if (action === 'MEMBER_DECLINED' || action.includes('REMOVED')) {
    return {
      icon: UserMinus,
      color: '#E11D48',
      bg: 'bg-rose-50',
      border: 'border-rose-300',
      category: 'team',
    };
  }
  if (action === 'COMPLETED_TODO') {
    return {
      icon: Check,
      color: '#059669',
      bg: 'bg-emerald-50',
      border: 'border-emerald-300',
      category: 'tasks',
    };
  }
  if (action === 'UNCOMPLETED_TODO') {
    return {
      icon: CircleAlert,
      color: '#D97706',
      bg: 'bg-amber-50',
      border: 'border-amber-300',
      category: 'tasks',
    };
  }
  if (action === 'CREATED_TODO') {
    return {
      icon: Plus,
      color: '#D97706',
      bg: 'bg-amber-50',
      border: 'border-amber-300',
      category: 'tasks',
    };
  }
  if (action === 'UPDATED_TODO') {
    return {
      icon: FileEdit,
      color: '#8C7C70',
      bg: 'bg-taupe/15',
      border: 'border-taupe/30',
      category: 'tasks',
    };
  }
  if (action === 'DELETED_TODO') {
    return {
      icon: Trash2,
      color: '#E11D48',
      bg: 'bg-rose-50',
      border: 'border-rose-300',
      category: 'tasks',
    };
  }
  if (action === 'STOPPED_CROP_PLAN') {
    return {
      icon: CircleAlert,
      color: '#E11D48',
      bg: 'bg-rose-50',
      border: 'border-rose-300',
      category: 'plans',
    };
  }
  if (action === 'COMPLETED_CROP_CYCLE') {
    return {
      icon: CheckCircle2,
      color: '#059669',
      bg: 'bg-emerald-50',
      border: 'border-emerald-300',
      category: 'plans',
    };
  }
  if (action.includes('CROP_PLAN')) {
    if (action.includes('REMOVED') || action.includes('CLEARED')) {
      return {
        icon: UserMinus,
        color: '#E11D48',
        bg: 'bg-rose-50',
        border: 'border-rose-300',
        category: 'plans',
      };
    }
    return {
      icon: Leaf,
      color: '#059669',
      bg: 'bg-emerald-50',
      border: 'border-emerald-300',
      category: 'plans',
    };
  }
  if (action === 'UPDATED_LAYOUT' || action === 'CREATED_LAYOUT') {
    return {
      icon: Layers,
      color: '#6366F1',
      bg: 'bg-indigo-50',
      border: 'border-indigo-300',
      category: 'plans',
    };
  }
  if (action === 'RECORDED_CHECKUP' || action === 'GENERATED_MITIGATION_TASKS') {
    return {
      icon: Activity,
      color: '#2563EB',
      bg: 'bg-blue-50',
      border: 'border-blue-300',
      category: 'health',
    };
  }
  if (action === 'SUBMITTED_DAILY_REPORT') {
    return {
      icon: FileText,
      color: '#059669',
      bg: 'bg-emerald-50',
      border: 'border-emerald-300',
      category: 'health',
    };
  }
  if (action.includes('DELETED_FARM')) {
    return {
      icon: Trash2,
      color: '#E11D48',
      bg: 'bg-rose-50',
      border: 'border-rose-300',
      category: 'plans',
    };
  }
  if (action.includes('FARM')) {
    return {
      icon: Sparkles,
      color: '#8C4522',
      bg: 'bg-cognac/10',
      border: 'border-cognac/30',
      category: 'plans',
    };
  }

  return {
    icon: History,
    color: '#8C7C70',
    bg: 'bg-taupe/15',
    border: 'border-taupe/30',
    category: 'all',
  };
}

export function AuditLogViewer({ farmId, isOwner, showHeader = true }: AuditLogViewerProps) {
  const { logs, loading, error } = useAuditLogs(farmId, isOwner);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  // Filter logs
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Time range filter
    if (timeRange !== 'all') {
      const now = new Date().getTime();
      const cutoff = timeRange === '7days' ? 7 * 86400000 : 30 * 86400000;
      result = result.filter((log) => now - parseSafeDate(log.created_at).getTime() <= cutoff);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((log) => {
        const meta = getActionMeta(log.action);
        return meta.category === categoryFilter;
      });
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((log) => {
        const userName = getDisplayName(
          log.user_first_name,
          log.user_last_name,
          log.user_email
        ).toLowerCase();
        const action = log.action.toLowerCase().replace(/_/g, ' ');
        const detailsStr =
          typeof log.details === 'object' ? JSON.stringify(log.details).toLowerCase() : '';
        return userName.includes(q) || action.includes(q) || detailsStr.includes(q);
      });
    }

    // Consolidate legacy consecutive identical task logs (e.g. multi-plot completions)
    const consolidated: AuditLog[] = [];
    for (const log of result) {
      const prev = consolidated[consolidated.length - 1];
      const isTaskAction = log.action === 'COMPLETED_TODO' || log.action === 'UNCOMPLETED_TODO';
      const prevDetails =
        typeof prev?.details === 'object' && prev?.details !== null ? (prev.details as any) : {};
      const curDetails =
        typeof log.details === 'object' && log.details !== null ? (log.details as any) : {};

      if (
        prev &&
        isTaskAction &&
        prev.action === log.action &&
        prev.user_id === log.user_id &&
        prevDetails?.title === curDetails?.title &&
        Math.abs(parseSafeDate(prev.created_at).getTime() - parseSafeDate(log.created_at).getTime()) <= 15000
      ) {
        const combinedCount = (prevDetails.plotsCount || 1) + (curDetails.plotsCount || 1);
        const combinedPlotNames = Array.from(
          new Set([...(prevDetails.plotNames || []), ...(curDetails.plotNames || [])])
        );
        prev.details = {
          ...prevDetails,
          plotsCount: combinedCount,
          plotNames: combinedPlotNames,
        };
      } else {
        consolidated.push({ ...log });
      }
    }

    return consolidated;
  }, [logs, categoryFilter, timeRange, searchQuery]);

  // Group into sections by date
  const sections = useMemo(() => {
    const sectionMap = new Map<string, AuditLog[]>();

    filteredLogs.forEach((log) => {
      const sectionTitle = getDateSectionTitle(log.created_at);
      if (!sectionMap.has(sectionTitle)) {
        sectionMap.set(sectionTitle, []);
      }
      sectionMap.get(sectionTitle)!.push(log);
    });

    return Array.from(sectionMap.entries()).map(([title, data]) => ({
      title,
      data,
    }));
  }, [filteredLogs]);

  const toggleExpand = (logId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedLogIds((prev) => ({ ...prev, [logId]: !prev[logId] }));
  };

  const renderTimelineItem = ({
    item,
    index,
    section,
  }: {
    item: AuditLog;
    index: number;
    section: { data: AuditLog[] };
  }) => {
    const meta = getActionMeta(item.action);
    const IconComponent = meta.icon;
    const userName = getDisplayName(item.user_first_name, item.user_last_name, item.user_email);
    const isExpanded = Boolean(expandedLogIds[item.id]);

    const details = (typeof item.details === 'object' && item.details !== null ? item.details : {}) as any;
    const isFirst = index === 0;
    const isLast = index === section.data.length - 1;

    const hasRichDetails =
      (details?.targetPlots && details.targetPlots.length > 0) ||
      (details?.plotNames && details.plotNames.length > 0) ||
      (details?.plotsCount && details.plotsCount > 1) ||
      details?.bedCount !== undefined ||
      details?.problemName;

    return (
      <Pressable
        onPress={hasRichDetails ? () => toggleExpand(item.id) : undefined}
        className="flex-row items-stretch active:opacity-75">
        {/* Left Timeline Column (Connected vertical line + circular badge) */}
        <View className="mr-3.5 items-center" style={{ width: 34 }}>
          {/* Top connecting segment */}
          <View
            className={`w-[1.5px] ${
              isFirst ? 'bg-transparent' : 'bg-taupe/25'
            }`}
            style={{ height: 10 }}
          />

          {/* Node Icon Circle */}
          <View
            className={`h-[30px] w-[30px] items-center justify-center rounded-full border ${meta.border} ${meta.bg} shadow-2xs`}>
            <IconComponent size={15} color={meta.color} />
          </View>

          {/* Bottom connecting segment */}
          <View
            className={`w-[1.5px] flex-1 ${
              isLast ? 'bg-transparent' : 'bg-taupe/25'
            }`}
          />
        </View>

        {/* Right Content Column */}
        <View className="flex-1 pb-4 pt-1">
          {/* Action text with bold author name */}
          <Text className="text-[13.5px] leading-[19px] text-espresso">
            <Text className="font-bold text-espresso">{userName}</Text>{' '}
            {(() => {
              if (item.action === 'GENERATED_CROP_PLAN') {
                const plotsText =
                  details?.targetPlots && details.targetPlots.length > 0
                    ? ` on plots: ${details.targetPlots.join(', ')}.`
                    : '.';
                return `generated a crop plan for ${details?.cropsCount || 0} crops${plotsText}`;
              }

              if (item.action === 'STOPPED_CROP_PLAN') {
                const crops = Array.isArray(details?.crops)
                  ? details.crops.join(', ')
                  : 'crop plan';
                const plots =
                  Array.isArray(details?.plotNames) && details.plotNames.length > 0
                    ? ` on ${details.plotNames.join(', ')}`
                    : '';
                const reason = details?.reason ? ` (Reason: "${details.reason}")` : '';
                return `stopped planting ${crops}${plots}${reason}.`;
              }

              if (item.action === 'COMPLETED_CROP_CYCLE') {
                const crops = Array.isArray(details?.crops)
                  ? details.crops.join(', ')
                  : 'crops';
                const plots =
                  Array.isArray(details?.plotNames) && details.plotNames.length > 0
                    ? ` on ${details.plotNames.join(', ')}`
                    : '';
                return `completed harvest cycle for ${crops}${plots}.`;
              }

              if (item.action === 'REMOVED_CROP_PLAN') {
                return 'removed a crop plan.';
              }

              if (item.action === 'CLEARED_CROP_PLANS') {
                return 'cleared all crop plans.';
              }

              if (item.action === 'CREATED_LAYOUT' || item.action === 'UPDATED_LAYOUT') {
                const isCreated = item.action === 'CREATED_LAYOUT';
                const parts: string[] = [];
                if (details?.bedCount !== undefined) {
                  parts.push(`${details.bedCount} plot${details.bedCount === 1 ? '' : 's'}`);
                }
                if (details?.facilityCount !== undefined && details.facilityCount > 0) {
                  parts.push(`${details.facilityCount} facilit${details.facilityCount === 1 ? 'y' : 'ies'}`);
                }
                if (details?.zoneCount !== undefined && details.zoneCount > 0) {
                  parts.push(`${details.zoneCount} zone${details.zoneCount === 1 ? '' : 's'}`);
                }
                const metaInfo = parts.length > 0 ? ` (${parts.join(', ')})` : '';
                return `${isCreated ? 'created' : 'updated'} the farm layout${metaInfo}.`;
              }

              if (item.action === 'COMPLETED_TODO') {
                const plotsInfo =
                  details?.plotsCount && details.plotsCount > 1
                    ? ` across ${details.plotsCount} plots`
                    : details?.plotNames?.[0]
                    ? ` on ${details.plotNames[0]}`
                    : '';
                return `completed task: ${details?.title || 'Farm task'}${plotsInfo}`;
              }

              if (item.action === 'UNCOMPLETED_TODO') {
                const plotsInfo =
                  details?.plotsCount && details.plotsCount > 1
                    ? ` across ${details.plotsCount} plots`
                    : details?.plotNames?.[0]
                    ? ` on ${details.plotNames[0]}`
                    : '';
                return `marked task as incomplete: ${details?.title || 'Farm task'}${plotsInfo}`;
              }

              if (item.action === 'CREATED_TODO') {
                return `created task: ${details?.title || 'Farm task'}`;
              }

              if (item.action === 'UPDATED_TODO') {
                return `updated task: ${details?.title || 'Farm task'}`;
              }

              if (item.action === 'DELETED_TODO') {
                return `deleted task: ${details?.title || 'Farm task'}`;
              }

              if (item.action === 'RECORDED_CHECKUP') {
                return 'recorded a farm checkup.';
              }

              if (item.action === 'SUBMITTED_DAILY_REPORT') {
                const plotText = details?.plotName ? ` for ${details.plotName}` : '';
                const symptomsText =
                  details?.symptomsCount > 0
                    ? ` (${details.symptomsCount} issue${details.symptomsCount === 1 ? '' : 's'} spotted)`
                    : ' (all healthy)';
                return `submitted a daily field report${plotText}${symptomsText}.`;
              }

              if (item.action === 'GENERATED_MITIGATION_TASKS') {
                return `generated ${details?.taskCount || 0} mitigation tasks for: ${details?.problemName || 'plant issue'}`;
              }

              if (item.action === 'MEMBER_INVITED') {
                const emailInfo = details?.invited_email ? ` (${details.invited_email})` : '';
                return `member invited${emailInfo}`;
              }

              if (item.action === 'MEMBER_JOINED') {
                return 'accepted the invitation and joined the farm.';
              }

              if (item.action === 'MEMBER_DECLINED') {
                return 'declined the invitation to the farm.';
              }

              if (item.action === 'MEMBER_REMOVED') {
                return 'removed a member from the farm.';
              }

              if (item.action === 'CREATED_FARM') {
                return `created the farm: ${details?.farmName || ''}`;
              }

              if (item.action === 'UPDATED_FARM') {
                return 'updated the farm details.';
              }

              return item.action.replace(/_/g, ' ').toLowerCase();
            })()}
          </Text>

          {/* Timestamp */}
          <Text className="mt-0.5 text-[11.5px] font-medium text-taupe">
            {formatTimelineDate(item.created_at)}
          </Text>

          {/* Expandable info chips if toggled */}
          {isExpanded && hasRichDetails && (
            <View className="mt-2 rounded-xl border border-black/5 bg-white p-2.5 shadow-2xs">
              {((details?.targetPlots && details.targetPlots.length > 0) ||
                (details?.plotNames && details.plotNames.length > 0)) && (
                <View className="flex-row flex-wrap gap-1">
                  {(details.targetPlots || details.plotNames).map((plot: string, i: number) => (
                    <View key={i} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5">
                      <Text className="text-[10.5px] font-bold text-emerald-800">{plot}</Text>
                    </View>
                  ))}
                </View>
              )}
              {details?.problemName && (
                <Text className="text-[11.5px] text-blue-800 font-medium">
                  Issue: {details.problemName} ({details.taskCount || 0} tasks created)
                </Text>
              )}
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-champagne">
      {/* Search and Time Filters */}
      <View className="px-5 pt-3 pb-2">
        {/* iOS-style Search Bar */}
        <View className="mb-2.5 flex-row items-center rounded-2xl border border-black/5 bg-white px-3.5 py-2 shadow-sm shadow-espresso/5">
          <Search size={15} color="#8C7C70" className="mr-2" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search activity..."
            placeholderTextColor="#8C7C70"
            maxLength={255}
            className="flex-1 text-sm font-medium text-espresso"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} className="p-1">
              <X size={14} color="#8C7C70" />
            </Pressable>
          )}
        </View>

        {/* Category Filter Pills (Apple Segmented Control) */}
        <View className="mb-2 flex-row gap-1.5">
          {CATEGORIES.map((cat) => {
            const isSelected = categoryFilter === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setCategoryFilter(cat.id)}
                className={`flex-1 items-center justify-center rounded-xl py-1.5 active:scale-95 ${
                  isSelected
                    ? 'border border-cognac/20 bg-cognac shadow-sm shadow-cognac/20'
                    : 'border border-black/5 bg-white/90'
                }`}>
                <Text
                  className={`text-[11.5px] font-bold ${
                    isSelected ? 'text-white' : 'text-espresso'
                  }`}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Time Range Filter Bar */}
        <View className="flex-row items-center justify-between border-t border-black/5 pt-1.5">
          <Text className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-taupe">
            Timeframe
          </Text>
          <View className="flex-row gap-1">
            {TIME_RANGES.map((range) => {
              const isSelected = timeRange === range.id;
              return (
                <Pressable
                  key={range.id}
                  onPress={() => setTimeRange(range.id)}
                  className={`rounded-lg px-2.5 py-0.5 active:scale-95 ${
                    isSelected ? 'bg-cognac/10 border border-cognac/30' : 'bg-transparent'
                  }`}>
                  <Text
                    className={`text-[11px] font-bold ${
                      isSelected ? 'text-cognac' : 'text-taupe'
                    }`}>
                    {range.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Error Banner */}
      {error && (
        <View className="mx-5 mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <Text className="text-xs font-semibold text-rose-700">{error}</Text>
        </View>
      )}

      {/* Main Timeline Section List */}
      {loading && logs.length === 0 ? (
        <View className="flex-1 items-center justify-center p-12">
          <ActivityIndicator size="large" color="#8C4522" />
          <Text className="mt-3 text-xs font-bold uppercase tracking-wider text-taupe">
            Loading farm history...
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderTimelineItem}
          renderSectionHeader={({ section: { title } }) => (
            <View className="bg-champagne/95 py-1.5 backdrop-blur-md">
              <Text className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-taupe">
                {title}
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled={true}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          ListEmptyComponent={
            <View className="mt-8 items-center justify-center rounded-3xl border border-dashed border-taupe/30 bg-white/70 p-8 shadow-sm">
              <View className="mb-3 h-11 w-11 items-center justify-center rounded-2xl bg-cognac/10">
                <History size={22} color="#8C4522" />
              </View>
              <Text className="text-base font-bold text-espresso">No Activity Recorded</Text>
              <Text className="mt-1 text-center text-xs leading-5 text-taupe">
                {searchQuery
                  ? 'No activity matches your search query.'
                  : 'Recent farm actions and collaborator updates will appear here in chronological order.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
