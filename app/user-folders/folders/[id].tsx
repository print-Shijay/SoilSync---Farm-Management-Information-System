import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
  Animated,
  PanResponder,
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../../../components/common/AppModal';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../../lib/AuthContext';
import {
  getUserFolder,
  saveFolderColumns,
  saveFolderRecord,
  deleteFolderRecord,
  deleteUserFolder,
  updateUserFolder,
  UserFolderRecord,
  FolderColumn,
  FolderRecordItem,
  ColumnType,
  parseFolderContent,
} from '../../../lib/db-operations';
import {
  pickFolderImageFromCamera,
  pickFolderImageFromLibrary,
  saveLocalFolderImageCopy,
  uploadFolderImageToSupabase,
  parseFolderImageValue,
} from '../../../lib/user-folder-storage';
import { BackButton } from '../../../components/common/BackButton';
import { useAccessibility } from '../../../lib/accessibility';
import {
  Plus,
  Pencil,
  Trash2,
  Camera,
  Search,
  X,
  Layers,
  MapPin,
  FileText,
  ChevronRight,
  Clock,
  Eye,
  AlertTriangle,
  Calendar,
  Save,
  Check,
  History,
  Shield,
  User,
} from 'lucide-react-native';
import { exportFolderTable, ExportFormat } from '../../../lib/folder-export';
import { useEffectiveRole } from '../../../lib/hooks/useEffectiveRole';
import { getFolderAuditLogs, FolderAuditLogRecord } from '../../../lib/team-operations';

const MAX_PREVIEW_COLUMNS = 3;
const ACTION_BUTTON_WIDTH = 68;
const TOTAL_ACTION_WIDTH = ACTION_BUTTON_WIDTH * 2 + 12; // ~148px

// Helper to format date strings cleanly
function formatDateDisplay(val: any): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTimeDisplay(val: any, includeTime = true): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  if (includeTime) {
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ==========================================
// RESILIENT RECORD IMAGE COMPONENT
// Tries local file path first (zero latency offline),
// falls back to Supabase cloud URL if local is missing/failed
// ==========================================
function FolderRecordImage({
  value,
  className = 'h-full w-full',
  resizeMode = 'cover',
}: {
  value: any;
  className?: string;
  resizeMode?: 'cover' | 'contain';
}) {
  const parsed = parseFolderImageValue(value);
  const [activeUri, setActiveUri] = useState<string | null>(parsed.localUri || parsed.cloudUrl);

  useEffect(() => {
    const p = parseFolderImageValue(value);
    setActiveUri(p.localUri || p.cloudUrl);
  }, [value]);

  const handleImageError = () => {
    if (parsed.cloudUrl && activeUri !== parsed.cloudUrl) {
      console.log('[FolderRecordImage] Local file failed, falling back to cloud URL:', parsed.cloudUrl);
      setActiveUri(parsed.cloudUrl);
    }
  };

  if (!activeUri) {
    return (
      <View className="items-center justify-center bg-black/5 rounded-xl py-4">
        <Text className="text-xs italic text-taupe/60">No photo</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: activeUri }}
      className={className}
      resizeMode={resizeMode}
      onError={handleImageError}
    />
  );
}

// ==========================================
// SWIPEABLE RECORD CARD COMPONENT
// ==========================================
interface SwipeableRecordCardProps {
  record: FolderRecordItem;
  index: number;
  columns: FolderColumn[];
  onPressDetail: (record: FolderRecordItem, index: number) => void;
  onEdit?: (record: FolderRecordItem) => void;
  onDelete?: (record: FolderRecordItem, index: number) => void;
  onPreviewImage: (url: string) => void;
}

function SwipeableRecordCard({
  record,
  index,
  columns,
  onPressDetail,
  onEdit,
  onDelete,
  onPreviewImage,
}: SwipeableRecordCardProps) {
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpenRef = useRef(false);
  const currentXRef = useRef(0);

  useEffect(() => {
    const listenerId = translateX.addListener(({ value }) => {
      currentXRef.current = value;
    });
    return () => translateX.removeListener(listenerId);
  }, [translateX]);

  const snapOpen = useCallback(() => {
    Animated.spring(translateX, {
      toValue: -TOTAL_ACTION_WIDTH,
      damping: 22,
      stiffness: 250,
      mass: 0.9,
      useNativeDriver: true,
    }).start(() => {
      isOpenRef.current = true;
    });
  }, [translateX]);

  const snapClose = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      damping: 22,
      stiffness: 250,
      mass: 0.9,
      useNativeDriver: true,
    }).start(() => {
      isOpenRef.current = false;
    });
  }, [translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (!onEdit && !onDelete) return false;
          const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
          return isHorizontal && Math.abs(gestureState.dx) > 8;
        },
        onPanResponderGrant: () => {
          translateX.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          const base = isOpenRef.current ? -TOTAL_ACTION_WIDTH : 0;
          let newX = base + gestureState.dx;

          if (newX > 0) {
            newX = newX * 0.15;
          } else if (newX < -TOTAL_ACTION_WIDTH) {
            const excess = newX - (-TOTAL_ACTION_WIDTH);
            newX = -TOTAL_ACTION_WIDTH + excess * 0.25;
          }

          translateX.setValue(newX);
        },
        onPanResponderRelease: (_, gestureState) => {
          const currentPos = currentXRef.current;
          const isFlickLeft = gestureState.vx < -0.35;
          const isFlickRight = gestureState.vx > 0.35;
          const isPastHalfway = currentPos < -TOTAL_ACTION_WIDTH * 0.45;

          if (isFlickRight) {
            snapClose();
          } else if (isFlickLeft || isPastHalfway) {
            snapOpen();
          } else {
            snapClose();
          }
        },
        onPanResponderTerminate: () => {
          snapClose();
        },
      }),
    [snapClose, snapOpen, translateX]
  );

  const handleCardPress = () => {
    if (isOpenRef.current || Math.abs(currentXRef.current) > 5) {
      snapClose();
    } else {
      triggerHaptic('selection');
      onPressDetail(record, index);
    }
  };

  const handleEditPress = () => {
    triggerHaptic('selection');
    snapClose();
    onEdit?.(record);
  };

  const handleDeletePress = () => {
    triggerHaptic('warning');
    snapClose();
    onDelete?.(record, index);
  };

  // Preview Columns (capped by MAX_PREVIEW_COLUMNS)
  const previewCols = columns.slice(0, MAX_PREVIEW_COLUMNS);
  const remainingCount = columns.length - previewCols.length;

  const actionOpacity = translateX.interpolate({
    inputRange: [-TOTAL_ACTION_WIDTH, -25, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const actionScale = translateX.interpolate({
    inputRange: [-TOTAL_ACTION_WIDTH, 0],
    outputRange: [1, 0.85],
    extrapolate: 'clamp',
  });

  return (
    <View className="relative mb-4 overflow-hidden rounded-[26px]">
      {/* ── Background Actions Revealed on Left Swipe ── */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 10,
          gap: 8,
          opacity: actionOpacity,
          transform: [{ scale: actionScale }],
        }}>
        {/* Edit Button */}
        {onEdit ? (
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={handleEditPress}
            className="h-[80%] w-[64px] items-center justify-center rounded-2xl bg-cognac shadow-sm shadow-cognac/30">
            <Pencil size={18} color="#fff" strokeWidth={2.4} />
            <Text className="mt-1 text-[11px] font-black tracking-tight text-white">Edit</Text>
          </TouchableOpacity>
        ) : null}

        {/* Delete Button */}
        {onDelete ? (
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={handleDeletePress}
            className="h-[80%] w-[64px] items-center justify-center rounded-2xl bg-red-500 shadow-sm shadow-red-500/30">
            <Trash2 size={18} color="#fff" strokeWidth={2.4} />
            <Text className="mt-1 text-[11px] font-black tracking-tight text-white">Delete</Text>
          </TouchableOpacity>
        ) : null}
      </Animated.View>

      {/* ── Front Interactive Card Layer ── */}
      <Animated.View
        style={{
          transform: [{ translateX }],
        }}
        {...panResponder.panHandlers}>
        <TouchableOpacity
          activeOpacity={0.94}
          onPress={handleCardPress}
          style={
            isHighContrast
              ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
              : undefined
          }
          className={`rounded-[26px] border border-white/95 bg-white/95 ${
            isGloveMode ? 'p-6' : 'p-5'
          } shadow-sm shadow-espresso/10`}>
          {/* Card Header: Index Pill, Date, and Details Indicator */}
          <View className="flex-row items-center justify-between border-b border-black/5 pb-3">
            <View className="flex-row items-center">
              <View
                style={isHighContrast ? { borderWidth: 1, borderColor: '#000000' } : undefined}
                className="rounded-full bg-cognac/10 px-3 py-1">
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className={`font-black ${isHighContrast ? 'text-black' : 'text-cognac'}`}>
                  #{index + 1}
                </Text>
              </View>
              <Text
                style={{ fontSize: Math.round(12 * fontScale) }}
                className={`ml-2.5 font-semibold ${isHighContrast ? 'text-black/80' : 'text-taupe'}`}>
                {formatDateTimeDisplay(record.created_at, true)}
              </Text>
            </View>

            <View
              style={isHighContrast ? { borderWidth: 1, borderColor: '#000000' } : undefined}
              className="flex-row items-center rounded-full bg-champagne px-3 py-1.5 border border-black/5">
              <Text
                style={{ fontSize: Math.round(10 * fontScale) }}
                className={`mr-1 font-black uppercase tracking-wider ${
                  isHighContrast ? 'text-black' : 'text-taupe'
                }`}>
                Details
              </Text>
              <ChevronRight
                size={12}
                color={isHighContrast ? '#000000' : '#8C7C70'}
                strokeWidth={2.5}
              />
            </View>
          </View>

          {/* Card Body - Limited Column Previews */}
          <View className="mt-3.5 gap-2.5">
            {previewCols.map((col) => {
              const val = record[col.id];
              const hasVal = val !== undefined && val !== null && val !== '';

              if (col.type === 'image') {
                return (
                  <View key={col.id} className="mt-1">
                    <View className="flex-row items-center justify-between">
                      <Text
                        style={{ fontSize: Math.round(10 * fontScale) }}
                        className={`font-black uppercase tracking-wider ${
                          isHighContrast ? 'text-black' : 'text-taupe'
                        }`}>
                        {col.name}
                      </Text>
                      <View
                        style={isHighContrast ? { borderWidth: 1, borderColor: '#000000' } : undefined}
                        className="flex-row items-center rounded-md bg-emerald-50 px-2 py-0.5">
                        <Camera size={10} color={isHighContrast ? '#000000' : '#059669'} />
                        <Text
                          style={{ fontSize: Math.round(9 * fontScale) }}
                          className={`ml-1 font-bold ${
                            isHighContrast ? 'text-black' : 'text-emerald-700'
                          }`}>
                          Photo
                        </Text>
                      </View>
                    </View>

                    {hasVal ? (
                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={() => onPreviewImage(String(parseFolderImageValue(val).bestUri || ''))}
                        style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000' } : undefined}
                        className="mt-2 h-32 w-full overflow-hidden rounded-2xl border border-black/10 bg-black/5">
                        <FolderRecordImage value={val} className="h-full w-full" />
                        <View className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 p-1.5">
                          <Eye size={13} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`mt-1 italic ${isHighContrast ? 'text-black/60' : 'text-taupe/60'}`}>
                        No photo attached
                      </Text>
                    )}
                  </View>
                );
              }

              if (col.type === 'date') {
                return (
                  <View key={col.id} className="flex-row items-center justify-between py-1">
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className={`font-bold ${isHighContrast ? 'text-black/80' : 'text-taupe'}`}
                      numberOfLines={1}>
                      {col.name}
                    </Text>
                    <View
                      style={isHighContrast ? { borderWidth: 1, borderColor: '#000000' } : undefined}
                      className="flex-row items-center rounded-full bg-purple-50 px-2.5 py-0.5">
                      <Calendar size={11} color={isHighContrast ? '#000000' : '#7C3AED'} />
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`ml-1 font-bold ${
                          isHighContrast ? 'text-black' : 'text-purple-800'
                        }`}
                        numberOfLines={1}>
                        {hasVal ? formatDateDisplay(val) : '—'}
                      </Text>
                    </View>
                  </View>
                );
              }

              return (
                <View key={col.id} className="flex-row items-center justify-between py-1">
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className={`font-bold ${isHighContrast ? 'text-black/80' : 'text-taupe'}`}
                    numberOfLines={1}>
                    {col.name}
                  </Text>
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className={`font-bold max-w-[65%] text-right ${
                      isHighContrast
                        ? 'text-black'
                        : col.type === 'number'
                        ? 'text-amber-800'
                        : 'text-espresso'
                    }`}
                    numberOfLines={1}>
                    {hasVal
                      ? col.type === 'number'
                        ? Number(val).toLocaleString()
                        : String(val)
                      : '—'}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Footer: More Columns Badge & Swipe Hint */}
          <View className="mt-3.5 flex-row items-center justify-between border-t border-black/5 pt-2.5">
            {remainingCount > 0 ? (
              <View
                style={isHighContrast ? { borderWidth: 1, borderColor: '#000000' } : undefined}
                className="flex-row items-center rounded-full bg-cognac/10 px-3 py-1">
                <Text
                  style={{ fontSize: Math.round(10 * fontScale) }}
                  className={`font-black ${isHighContrast ? 'text-black' : 'text-cognac'}`}>
                  +{remainingCount} more field{remainingCount > 1 ? 's' : ''}
                </Text>
              </View>
            ) : (
              <View />
            )}

            <Text
              style={{ fontSize: Math.round(10 * fontScale) }}
              className={`font-semibold ${isHighContrast ? 'text-black/70' : 'text-taupe/70'}`}>
              Swipe left for actions ←
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ==========================================
// RECORD FULL DETAILS MODAL COMPONENT
// ==========================================
interface RecordDetailModalProps {
  visible: boolean;
  record: FolderRecordItem | null;
  index: number;
  columns: FolderColumn[];
  onClose: () => void;
  onEdit?: (record: FolderRecordItem) => void;
  onDelete?: (record: FolderRecordItem, index: number) => void;
  onPreviewImage: (url: string) => void;
}

function RecordDetailModal({
  visible,
  record,
  index,
  columns,
  onClose,
  onEdit,
  onDelete,
  onPreviewImage,
}: RecordDetailModalProps) {
  if (!record) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="max-h-[88%] rounded-t-[34px] border-t border-white/80 bg-white p-6 pb-8 shadow-2xl">
          {/* Grab Handle Pill */}
          <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-black/15" />

          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-black/5 pb-3">
            <View>
              <View className="flex-row items-center gap-2">
                <View className="rounded-full bg-cognac/10 px-2.5 py-0.5">
                  <Text className="text-xs font-black text-cognac">Record #{index + 1}</Text>
                </View>
                <Text className="text-xs font-semibold text-taupe">Full Details</Text>
              </View>
              <View className="mt-1 flex-row items-center">
                <Clock size={12} color="#8C7C70" />
                <Text className="ml-1 text-[11px] font-semibold text-taupe">
                  Logged on {formatDateTimeDisplay(record.created_at, true)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              className="rounded-full bg-black/5 p-2">
              <X size={18} color="#1C120C" />
            </TouchableOpacity>
          </View>

          {/* Scrollable Column Values */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            className="mt-4 max-h-[420px]">
            <View className="gap-3.5 pb-4">
              {columns.map((col) => {
                const val = record[col.id];
                const hasVal = val !== undefined && val !== null && val !== '';

                if (col.type === 'image') {
                  return (
                    <View
                      key={col.id}
                      className="overflow-hidden rounded-2xl border border-black/10 bg-champagne p-3.5">
                      <View className="flex-row items-center justify-between pb-2">
                        <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                          {col.name}
                        </Text>
                        <View className="flex-row items-center rounded-md bg-emerald-100 px-2 py-0.5">
                          <Camera size={12} color="#059669" />
                          <Text className="ml-1 text-[10px] font-bold text-emerald-800">Photo</Text>
                        </View>
                      </View>

                      {hasVal ? (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => onPreviewImage(String(parseFolderImageValue(val).bestUri || ''))}
                          className="relative h-52 w-full overflow-hidden rounded-xl border border-black/10 bg-black/5 shadow-xs">
                          <FolderRecordImage value={val} className="h-full w-full" />
                          <View className="absolute bottom-2.5 right-2.5 flex-row items-center rounded-full bg-black/70 px-3 py-1.5">
                            <Eye size={13} color="#fff" />
                            <Text className="ml-1.5 text-[11px] font-bold text-white">Tap to expand</Text>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View className="rounded-xl border border-dashed border-taupe/30 py-6 items-center">
                          <Text className="text-xs italic text-taupe">No photo recorded</Text>
                        </View>
                      )}
                    </View>
                  );
                }

                if (col.type === 'date') {
                  return (
                    <View
                      key={col.id}
                      className="rounded-2xl border border-black/10 bg-champagne p-3.5">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                          {col.name}
                        </Text>
                        <View className="flex-row items-center rounded-md bg-purple-100 px-2 py-0.5">
                          <Calendar size={11} color="#7C3AED" />
                          <Text className="ml-1 text-[10px] font-bold text-purple-800">Date</Text>
                        </View>
                      </View>
                      <Text className="mt-1 text-base font-bold text-purple-950">
                        {hasVal ? formatDateDisplay(val) : '—'}
                      </Text>
                    </View>
                  );
                }

                if (col.type === 'number') {
                  return (
                    <View
                      key={col.id}
                      className="rounded-2xl border border-black/10 bg-champagne p-3.5">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                          {col.name}
                        </Text>
                        <View className="rounded-md bg-amber-100 px-2 py-0.5">
                          <Text className="text-[10px] font-black text-amber-800"># Number</Text>
                        </View>
                      </View>
                      <Text className="mt-1 text-lg font-black text-amber-800">
                        {hasVal ? Number(val).toLocaleString() : '—'}
                      </Text>
                    </View>
                  );
                }

                return (
                  <View
                    key={col.id}
                    className="rounded-2xl border border-black/10 bg-champagne p-3.5">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                        {col.name}
                      </Text>
                      <View className="rounded-md bg-blue-100 px-2 py-0.5">
                        <Text className="text-[10px] font-bold text-blue-800">Text</Text>
                      </View>
                    </View>
                    <Text className="mt-1 text-sm font-semibold text-espresso leading-relaxed">
                      {hasVal ? String(val) : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Action Bar: Delete & Edit */}
          {(onDelete || onEdit) && (
            <View className="mt-4 flex-row gap-3 border-t border-black/5 pt-3">
              {onDelete && (
                <TouchableOpacity
                  onPress={() => onDelete(record, index)}
                  activeOpacity={0.8}
                  className="flex-1 flex-row items-center justify-center rounded-full border border-red-200 bg-red-50 py-3.5">
                  <Trash2 size={16} color="#DC2626" />
                  <Text className="ml-2 text-sm font-bold text-red-600">Delete</Text>
                </TouchableOpacity>
              )}

              {onEdit && (
                <TouchableOpacity
                  onPress={() => onEdit(record)}
                  activeOpacity={0.85}
                  className="flex-1 flex-row items-center justify-center rounded-full bg-cognac py-3.5 shadow-sm shadow-cognac/30">
                  <Pencil size={16} color="#fff" />
                  <Text className="ml-2 text-sm font-extrabold text-white">Edit Record</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// FOLDER AUDIT LOGS MODAL COMPONENT
// ==========================================
interface AuditLogsModalProps {
  visible: boolean;
  onClose: () => void;
  logs: FolderAuditLogRecord[];
  loading: boolean;
  folderName?: string;
}

function AuditLogsModal({
  visible,
  onClose,
  logs,
  loading,
  folderName,
}: AuditLogsModalProps) {
  const { isHighContrast } = useAccessibility();

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'create_record':
        return { label: 'Created Record', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' };
      case 'update_record':
        return { label: 'Edited Record', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' };
      case 'delete_record':
        return { label: 'Deleted Record', bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' };
      case 'update_columns':
        return { label: 'Updated Columns', bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' };
      default:
        return { label: action.replace(/_/g, ' '), bg: 'bg-taupe/15', text: 'text-taupe', border: 'border-taupe/20' };
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="max-h-[85%] rounded-t-[34px] border-t border-white/80 bg-white p-6 pb-8 shadow-2xl">
          <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-black/15" />

          <View className="flex-row items-center justify-between border-b border-black/5 pb-3">
            <View className="flex-row items-center gap-3">
              <View className="rounded-full bg-cognac/10 p-2.5">
                <History size={20} color="#8C4522" />
              </View>
              <View>
                <Text className="text-lg font-black tracking-tight text-espresso">
                  Table Activity Logs
                </Text>
                <Text className="text-xs text-taupe">
                  {folderName ? `${folderName} · ` : ''}{logs.length} events recorded
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              className="rounded-full bg-black/5 p-2">
              <X size={18} color="#2D231E" />
            </TouchableOpacity>
          </View>

          <ScrollView className="mt-4 max-h-[460px]" showsVerticalScrollIndicator={false}>
            {loading ? (
              <View className="py-12 items-center justify-center">
                <ActivityIndicator size="small" color="#8C4522" />
                <Text className="mt-2 text-xs font-semibold text-taupe">Loading activity logs...</Text>
              </View>
            ) : logs.length === 0 ? (
              <View className="py-12 items-center justify-center">
                <Clock size={32} color="#8C7C70" />
                <Text className="mt-3 text-sm font-bold text-espresso">No Activity Recorded</Text>
                <Text className="mt-1 text-center text-xs text-taupe">
                  All updates, additions, and column changes made to this folder will be logged here.
                </Text>
              </View>
            ) : (
              <View className="gap-3 pb-6">
                {logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const dateDisplay = formatDateTimeDisplay(log.created_at, true);
                  const userName = log.first_name || log.last_name
                    ? `${log.first_name || ''} ${log.last_name || ''}`.trim()
                    : log.email || (log.user_id ? 'Team Member' : 'Local User');

                  let detailsText = '';
                  try {
                    const parsed = JSON.parse(log.details || '{}');
                    if (parsed.recordId) detailsText = `Record ID: ${parsed.recordId.substring(0, 8)}...`;
                    if (parsed.columnCount !== undefined) detailsText = `${parsed.columnCount} columns configured`;
                  } catch {
                    detailsText = log.details;
                  }

                  return (
                    <View
                      key={log.id}
                      className="rounded-2xl border border-black/5 bg-champagne/30 p-3.5">
                      <View className="flex-row items-center justify-between mb-1.5">
                        <View className="flex-row items-center gap-1.5">
                          <View className="h-6 w-6 items-center justify-center rounded-full bg-black/5">
                            <Text className="text-[10px] font-black text-espresso">
                              {userName.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text className="text-xs font-bold text-espresso">{userName}</Text>
                        </View>
                        <View className={`rounded-md border px-2 py-0.5 ${badge.bg} ${badge.border}`}>
                          <Text className={`text-[10px] font-black uppercase tracking-wider ${badge.text}`}>
                            {badge.label}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row items-center justify-between mt-1">
                        <Text className="text-[11px] text-taupe">{detailsText || 'Action executed'}</Text>
                        <Text className="text-[10px] font-medium text-taupe">{dateDisplay}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// TYPE CONFIRMATION DELETE MODAL COMPONENT
// ==========================================
interface DeleteConfirmModalProps {
  visible: boolean;
  recordData: { record: FolderRecordItem; index: number } | null;
  columns: FolderColumn[];
  onClose: () => void;
  onConfirmDelete: () => void;
  deleting: boolean;
}

function DeleteConfirmModal({
  visible,
  recordData,
  columns,
  onClose,
  onConfirmDelete,
  deleting,
}: DeleteConfirmModalProps) {
  const [typedInput, setTypedInput] = useState('');

  useEffect(() => {
    if (visible) {
      setTypedInput('');
    }
  }, [visible]);

  if (!recordData) return null;

  const { record, index } = recordData;
  const isConfirmed = typedInput.trim().toLowerCase() === 'confirm';

  const dateFormatted = formatDateTimeDisplay(record.created_at, true);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-1 justify-end bg-black/65">
          <Pressable className="flex-1" onPress={onClose} />
          <View className="max-h-[85%] rounded-t-[34px] border-t border-white/80 bg-white p-6 pb-8 shadow-2xl">
          {/* Grab Handle Pill */}
          <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-black/15" />

          {/* 1. Fixed Header */}
          <View className="flex-row items-start justify-between border-b border-black/5 pb-3">
            <View className="flex-row items-center gap-3 flex-1 pr-2">
              <View className="rounded-full bg-red-100 p-2.5">
                <AlertTriangle size={22} color="#DC2626" />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-black tracking-tight text-espresso">
                  Delete Record #{index + 1}?
                </Text>
                <View className="mt-0.5 flex-row items-center">
                  <Clock size={11} color="#8C7C70" />
                  <Text className="ml-1 text-xs font-semibold text-taupe">
                    {dateFormatted}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              className="rounded-full bg-black/5 p-2">
              <X size={18} color="#1C120C" />
            </TouchableOpacity>
          </View>

          {/* 2. Auto-Scrolling Body */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            className="mt-3">
            <View className="pb-4">
              {/* Record Summary Preview */}
              <View className="rounded-2xl border border-red-100 bg-red-50/50 p-4">
                <Text className="text-[11px] font-extrabold uppercase tracking-wider text-red-700">
                  Record Summary
                </Text>
                <View className="mt-2 gap-1.5">
                  <Text className="text-xs font-semibold text-espresso">
                    <Text className="font-bold text-taupe">Logged At: </Text>
                    {dateFormatted}
                  </Text>
                  {columns.slice(0, 2).map((col) => {
                    const val = record[col.id];
                    const hasVal = val !== undefined && val !== null && val !== '';
                    return (
                      <Text key={col.id} className="text-xs font-semibold text-espresso" numberOfLines={1}>
                        <Text className="font-bold text-taupe">{col.name}: </Text>
                        {hasVal
                          ? col.type === 'image'
                            ? '[Photo]'
                            : col.type === 'date'
                              ? formatDateDisplay(val)
                              : String(val)
                          : '—'}
                      </Text>
                    );
                  })}
                </View>
              </View>

              {/* Type Confirm Input Step */}
              <View className="mt-4">
                <Text className="text-xs font-bold text-espresso">
                  To permanently delete this record, please type{' '}
                  <Text className="font-black text-red-600">&quot;confirm&quot;</Text> below:
                </Text>
                <TextInput
                  value={typedInput}
                  onChangeText={setTypedInput}
                  maxLength={20}
                  placeholder='type "confirm" to unlock delete'
                  placeholderTextColor="#8C7C70"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="mt-2 rounded-2xl border border-black/15 bg-champagne px-4 py-3.5 text-sm font-bold text-espresso"
                />
              </View>
            </View>
          </ScrollView>

          {/* 3. Fixed Action Buttons Footer */}
          <View className="mt-2 flex-row gap-3 border-t border-black/5 pt-3">
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.8}
              className="flex-1 rounded-full border border-black/10 bg-champagne py-3.5">
              <Text className="text-center text-sm font-bold text-espresso">Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onConfirmDelete}
              disabled={!isConfirmed || deleting}
              activeOpacity={0.85}
              className={`flex-1 flex-row items-center justify-center rounded-full py-3.5 shadow-sm ${
                isConfirmed
                  ? 'bg-red-600 shadow-red-600/30'
                  : 'bg-red-300 opacity-50'
              }`}>
              {deleting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Trash2 size={16} color="#fff" strokeWidth={2.4} />
                  <Text className="ml-1.5 text-sm font-extrabold text-white">
                    Delete Record
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
  );
}

// ==========================================
// MAIN SCREEN COMPONENT
// ==========================================
export default function FolderDetailScreen() {
  const router = useRouter();
  const rawParams = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = rawParams?.id;
  const folderId = Array.isArray(rawId) ? rawId[0] : rawId;
  const { user } = useAuth();
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();

  const [folder, setFolder] = useState<UserFolderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState('');

  // Column Modal State
  const [isColumnModalVisible, setIsColumnModalVisible] = useState(false);
  const [editingColumn, setEditingColumn] = useState<FolderColumn | null>(null);
  const [columnNameInput, setColumnNameInput] = useState('');
  const [columnTypeInput, setColumnTypeInput] = useState<ColumnType>('text');
  const [savingColumn, setSavingColumn] = useState(false);

  // Record Modal State
  const [isRecordModalVisible, setIsRecordModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FolderRecordItem | null>(null);
  const [recordFormData, setRecordFormData] = useState<Record<string, any>>({});
  const [savingRecord, setSavingRecord] = useState(false);
  const [imageUploading, setImageUploading] = useState<Record<string, boolean>>({});

  // Date Picker State inside Record Modal
  const [activeDatePickerColId, setActiveDatePickerColId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Full Details Modal State
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<{ record: FolderRecordItem; index: number } | null>(null);

  // Delete Confirmation Modal State
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletingRecordData, setDeletingRecordData] = useState<{ record: FolderRecordItem; index: number } | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);

  // Fullscreen Image Preview Modal
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Rename Folder Modal
  const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  // Export Table Modal
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [selectedExportFormat, setSelectedExportFormat] = useState<ExportFormat>('excel');
  const [isExporting, setIsExporting] = useState(false);

  // Action Menu
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  // RBAC Role & Permissions
  const { permissions, role: effectiveRole } = useEffectiveRole({ folderId });

  // Audit Logs State
  const [isAuditLogsVisible, setIsAuditLogsVisible] = useState(false);
  const [auditLogs, setAuditLogs] = useState<FolderAuditLogRecord[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  const loadAuditLogs = useCallback(async () => {
    if (!folderId) return;
    try {
      setLoadingAuditLogs(true);
      const logs = await getFolderAuditLogs(folderId);
      setAuditLogs(logs);
    } catch (err) {
      console.warn('[FolderDetailScreen] Failed to load audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  }, [folderId]);

  const hasOpenModal =
    isColumnModalVisible ||
    isRecordModalVisible ||
    detailModalVisible ||
    deleteModalVisible ||
    Boolean(previewImageUrl) ||
    isRenameModalVisible ||
    isExportModalVisible ||
    isHeaderMenuOpen;

  const handleCloseAnyModal = useCallback(() => {
    Keyboard.dismiss();
    if (isHeaderMenuOpen) setIsHeaderMenuOpen(false);
    if (isColumnModalVisible) setIsColumnModalVisible(false);
    if (isRecordModalVisible) setIsRecordModalVisible(false);
    if (detailModalVisible) setDetailModalVisible(false);
    if (deleteModalVisible) setDeleteModalVisible(false);
    if (previewImageUrl) setPreviewImageUrl(null);
    if (isRenameModalVisible) setIsRenameModalVisible(false);
    if (isExportModalVisible) setIsExportModalVisible(false);
  }, [
    isHeaderMenuOpen,
    isColumnModalVisible,
    isRecordModalVisible,
    detailModalVisible,
    deleteModalVisible,
    previewImageUrl,
    isRenameModalVisible,
    isExportModalVisible,
  ]);

  const handleBack = useCallback(() => {
    triggerHaptic('selection');
    if (hasOpenModal) {
      handleCloseAnyModal();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/user-folders');
    }
  }, [hasOpenModal, handleCloseAnyModal, router, triggerHaptic]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (hasOpenModal) {
          handleCloseAnyModal();
          return true;
        }
        if (router.canGoBack()) {
          router.back();
          return true;
        } else {
          router.replace('/user-folders');
          return true;
        }
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [hasOpenModal, handleCloseAnyModal, router])
  );

  const loadData = useCallback(async () => {
    if (!folderId) {
      setLoading(false);
      return;
    }
    try {
      const data = await getUserFolder(folderId);
      if (data) {
        setFolder(data);
        setRenameInput(data.folder_name);
      }
    } catch (err) {
      console.error('[FolderDetail] Error loading folder:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [folderId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  const parsedContent = useMemo(() => {
    return parseFolderContent(folder?.content_json);
  }, [folder?.content_json]);

  const columns = parsedContent.columns;
  const records = parsedContent.records;

  // Filter records by search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase();
    return records.filter((rec) => {
      for (const col of columns) {
        const val = rec[col.id];
        if (val !== undefined && val !== null) {
          if (String(val).toLowerCase().includes(q)) {
            return true;
          }
        }
      }
      return false;
    });
  }, [records, columns, searchQuery]);

  // ==========================================
  // COLUMN MANAGEMENT ACTIONS
  // ==========================================

  const handleOpenAddColumn = () => {
    if (!permissions.canManageFolderColumns) {
      Alert.alert('Permission Denied', 'Only Admins and Owners can add table columns.');
      return;
    }
    setEditingColumn(null);
    setColumnNameInput('');
    setColumnTypeInput('text');
    setIsColumnModalVisible(true);
  };

  const handleOpenEditColumn = (col: FolderColumn) => {
    if (!permissions.canManageFolderColumns) {
      Alert.alert('Permission Denied', 'Only Admins and Owners can edit table columns.');
      return;
    }
    setEditingColumn(col);
    setColumnNameInput(col.name);
    setColumnTypeInput(col.type);
    setIsColumnModalVisible(true);
  };

  const handleSaveColumn = async () => {
    if (!permissions.canManageFolderColumns) {
      Alert.alert('Permission Denied', 'Only Admins and Owners can save table columns.');
      return;
    }
    if (!folder || !columnNameInput.trim()) {
      Alert.alert('Validation Error', 'Please enter a column name.');
      return;
    }

    try {
      setSavingColumn(true);
      const currentCols = [...columns];

      if (editingColumn) {
        // Update column name or type
        const updated = currentCols.map((c) =>
          c.id === editingColumn.id
            ? { ...c, name: columnNameInput.trim(), type: columnTypeInput }
            : c
        );
        await saveFolderColumns(folder.id, updated, user?.id);
      } else {
        // Add new column
        const newCol: FolderColumn = {
          id: `col_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: columnNameInput.trim(),
          type: columnTypeInput,
          order: currentCols.length,
        };
        currentCols.push(newCol);
        await saveFolderColumns(folder.id, currentCols, user?.id);
      }

      setIsColumnModalVisible(false);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save column.');
    } finally {
      setSavingColumn(false);
    }
  };

  const handleDeleteColumn = (col: FolderColumn) => {
    if (!permissions.canManageFolderColumns) {
      Alert.alert('Permission Denied', 'Only Admins and Owners can delete table columns.');
      return;
    }

    Alert.alert(
      'Delete Column',
      `Are you sure you want to delete the column "${col.name}"? Data in this column across all records will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Column',
          style: 'destructive',
          onPress: async () => {
            if (!folder) return;
            try {
              setLoading(true);
              const updatedCols = columns.filter((c) => c.id !== col.id);
              await saveFolderColumns(folder.id, updatedCols, user?.id);
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete column.');
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // ==========================================
  // RECORD MANAGEMENT ACTIONS
  // ==========================================

  const handleOpenAddRecord = () => {
    if (columns.length === 0) {
      triggerHaptic('warning');
      Alert.alert(
        'Create Columns First',
        'Please add at least one column (such as Text, Number, Photo, or Date) before logging records.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add Column Now',
            onPress: () => {
              triggerHaptic('medium');
              handleOpenAddColumn();
            },
          },
        ]
      );
      return;
    }
    triggerHaptic('medium');
    setEditingRecord(null);
    setRecordFormData({});
    setActiveDatePickerColId(null);
    setShowDatePicker(false);
    setIsRecordModalVisible(true);
  };

  const handleOpenEditRecord = (rec: FolderRecordItem) => {
    if (!permissions.canEditFolderRecord) {
      Alert.alert('Permission Denied', 'Only Admins and Owners can edit existing records.');
      return;
    }
    setDetailModalVisible(false);
    setEditingRecord(rec);
    const data: Record<string, any> = {};
    columns.forEach((col) => {
      data[col.id] = rec[col.id] ?? '';
    });
    setRecordFormData(data);
    setActiveDatePickerColId(null);
    setShowDatePicker(false);
    setIsRecordModalVisible(true);
  };

  const handleOpenRecordDetail = (record: FolderRecordItem, index: number) => {
    setSelectedRecord({ record, index });
    setDetailModalVisible(true);
  };

  const handlePromptDeleteRecord = (record: FolderRecordItem, index?: number) => {
    if (!permissions.canDeleteFolderRecord) {
      Alert.alert('Permission Denied', 'Only Admins and Owners can delete records.');
      return;
    }
    setDetailModalVisible(false);
    const idx = index !== undefined ? index : records.findIndex((r) => r.id === record.id);
    setDeletingRecordData({ record, index: idx >= 0 ? idx : 0 });
    setDeleteModalVisible(true);
  };

  const handleExecuteDeleteRecord = async () => {
    if (!folder || !deletingRecordData) return;

    try {
      setIsDeletingRecord(true);
      await deleteFolderRecord(folder.id, deletingRecordData.record.id, user?.id);
      setDeleteModalVisible(false);
      setDeletingRecordData(null);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete record.');
    } finally {
      setIsDeletingRecord(false);
    }
  };

  const handlePickImage = async (colId: string, fromCamera = false) => {
    try {
      setImageUploading((prev) => ({ ...prev, [colId]: true }));

      const localUri = fromCamera
        ? await pickFolderImageFromCamera()
        : await pickFolderImageFromLibrary();

      if (!localUri) {
        setImageUploading((prev) => ({ ...prev, [colId]: false }));
        return;
      }

      // Save persistent local copy
      const permanentLocal = await saveLocalFolderImageCopy(localUri);
      const uriToUse = permanentLocal || localUri;

      // Optimistically store local URI in form immediately, preserving existing cloudUrl if any
      setRecordFormData((prev) => {
        const existing = parseFolderImageValue(prev[colId]);
        return {
          ...prev,
          [colId]: {
            localUri: uriToUse,
            cloudUrl: existing.cloudUrl || null,
          },
        };
      });

      // Upload to Supabase bucket 'user-folder-media' in background (non-blocking)
      void (async () => {
        try {
          const cloudUrl = await uploadFolderImageToSupabase(uriToUse, user?.id);
          if (cloudUrl) {
            setRecordFormData((prev) => {
              const existing = parseFolderImageValue(prev[colId]);
              return {
                ...prev,
                [colId]: {
                  localUri: existing.localUri || uriToUse,
                  cloudUrl: cloudUrl,
                },
              };
            });
          }
        } catch (uploadErr) {
          console.warn('[UserFolder] Background image upload note:', uploadErr);
        }
      })();
    } catch (err: any) {
      Alert.alert('Image Error', err.message || 'Failed to process image.');
    } finally {
      setImageUploading((prev) => ({ ...prev, [colId]: false }));
    }
  };

  const handleRemoveImageFromForm = (colId: string) => {
    setRecordFormData((prev) => ({ ...prev, [colId]: null }));
  };

  const handleSaveRecord = async () => {
    if (!folder) return;

    try {
      setSavingRecord(true);
      const newRecordId = editingRecord ? editingRecord.id : `rec_${Date.now()}`;
      const recordItem: FolderRecordItem = {
        id: newRecordId,
        created_at: editingRecord?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Populate formatted column values
      for (const col of columns) {
        const rawVal = recordFormData[col.id];
        if (col.type === 'number') {
          recordItem[col.id] =
            rawVal !== undefined && rawVal !== '' && !isNaN(Number(rawVal))
              ? Number(rawVal)
              : null;
        } else if (col.type === 'image') {
          if (!rawVal) {
            recordItem[col.id] = null;
          } else {
            const parsed = parseFolderImageValue(rawVal);
            if (!parsed.bestUri) {
              recordItem[col.id] = null;
            } else {
              recordItem[col.id] = {
                localUri: parsed.localUri,
                cloudUrl: parsed.cloudUrl,
              };
            }
          }
        } else if (col.type === 'date') {
          recordItem[col.id] = rawVal ? String(rawVal) : null;
        } else {
          recordItem[col.id] = rawVal !== undefined ? String(rawVal) : '';
        }
      }

      await saveFolderRecord(folder.id, recordItem, user?.id);
      setIsRecordModalVisible(false);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save record.');
    } finally {
      setSavingRecord(false);
    }
  };

  // Rename Folder
  const handleSaveRename = async () => {
    if (!folder || !renameInput.trim()) return;
    try {
      setSavingRename(true);
      await updateUserFolder(folder.id, { folderName: renameInput.trim() });
      setIsRenameModalVisible(false);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to rename folder.');
    } finally {
      setSavingRename(false);
    }
  };

  const handleDeleteEntireFolder = () => {
    if (!folder) return;
    setIsHeaderMenuOpen(false);
    Alert.alert(
      'Delete Entire Folder',
      `Are you sure you want to delete "${folder.folder_name}"? All customizable columns, ${records.length} records, and associated photos will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteUserFolder(folder.id, user?.id);
              router.back();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete folder.');
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleExecuteExport = async (deliveryMethod: 'save' | 'share' = 'save') => {
    if (!folder) return;
    if (records.length === 0) {
      Alert.alert('No Records', 'There are no records in this folder to export yet. Add some records first.');
      return;
    }
    if (columns.length === 0) {
      Alert.alert('No Columns', 'There are no columns defined in this table.');
      return;
    }

    try {
      setIsExporting(true);
      await exportFolderTable({
        folder,
        columns,
        records,
        format: selectedExportFormat,
        deliveryMethod,
      });
      setIsExportModalVisible(false);
    } catch (err: any) {
      console.error('[ExportTable] Export failed:', err);
      Alert.alert('Export Failed', err?.message || 'Could not export the table.');
    } finally {
      setIsExporting(false);
    }
  };

  // Render cell content based on type (for Table view)
  const renderCellContent = (col: FolderColumn, value: any) => {
    if (value === undefined || value === null || value === '') {
      return <Text className="text-xs italic text-taupe/60">—</Text>;
    }

    if (col.type === 'image') {
      const parsed = parseFolderImageValue(value);
      if (!parsed.bestUri) {
        return <Text className="text-xs italic text-taupe/60">—</Text>;
      }
      return (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setPreviewImageUrl(parsed.bestUri)}
          className="h-12 w-12 overflow-hidden rounded-xl border border-black/10 bg-black/5 shadow-xs">
          <FolderRecordImage value={value} className="h-full w-full" />
        </TouchableOpacity>
      );
    }

    if (col.type === 'number') {
      return (
        <Text className="text-xs font-bold text-amber-800">
          {Number(value).toLocaleString()}
        </Text>
      );
    }

    if (col.type === 'date') {
      return (
        <View className="flex-row items-center">
          <Calendar size={11} color="#7C3AED" />
          <Text className="ml-1 text-xs font-semibold text-purple-900" numberOfLines={1}>
            {formatDateDisplay(value)}
          </Text>
        </View>
      );
    }

    return (
      <Text className="text-xs font-medium text-espresso" numberOfLines={2}>
        {String(value)}
      </Text>
    );
  };

  return (
    <View className="flex-1 bg-champagne">
      <View className="flex-1 pt-14">
        {/* Header Bar */}
        <View className="flex-row items-center justify-between px-5 pb-2">
          <BackButton
            onPress={handleBack}
            style={isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : undefined}
            className={isGloveMode ? 'h-12 w-12' : 'h-10 w-10'}
            size={isGloveMode ? 22 : 20}
            color={isHighContrast ? '#000000' : '#1C120C'}
          />

          <View className="flex-1 px-3 items-center">
            <Text
              style={{ fontSize: Math.round(20 * fontScale) }}
              className={`font-black tracking-tight ${
                isHighContrast ? 'text-black' : 'text-espresso'
              }`}
              numberOfLines={1}>
              {folder?.folder_name || 'Folder Records'}
            </Text>
            {folder?.farm_name ? (
              <View
                style={isHighContrast ? { borderWidth: 1, borderColor: '#000000' } : undefined}
                className="mt-0.5 flex-row items-center rounded-full bg-cognac/10 px-2.5 py-0.5">
                <MapPin size={10} color={isHighContrast ? '#000000' : '#8C4522'} />
                <Text
                  style={{ fontSize: Math.round(11 * fontScale) }}
                  className={`ml-1 font-bold ${
                    isHighContrast ? 'text-black' : 'text-cognac'
                  }`}
                  numberOfLines={1}>
                  {folder.farm_name}
                </Text>
              </View>
            ) : (
              <Text
                style={{ fontSize: Math.round(10 * fontScale) }}
                className={`font-bold uppercase tracking-[0.2em] ${
                  isHighContrast ? 'text-black' : 'text-taupe'
                }`}>
                Custom Table
              </Text>
            )}
          </View>

          {/* Menu Trigger */}
          <View className="relative">
            <TouchableOpacity
              onPress={() => {
                triggerHaptic('light');
                setIsHeaderMenuOpen(!isHeaderMenuOpen);
              }}
              activeOpacity={0.75}
              hitSlop={
                isGloveMode
                  ? { top: 12, bottom: 12, left: 12, right: 12 }
                  : { top: 10, bottom: 10, left: 10, right: 10 }
              }
              style={
                isHighContrast
                  ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                  : undefined
              }
              className={`${
                isGloveMode ? 'h-12 w-12' : 'h-10 w-10'
              } items-center justify-center rounded-full border border-black/5 bg-white shadow-xs active:scale-95 active:bg-champagne`}>
              <Text
                style={{ fontSize: Math.round((isGloveMode ? 20 : 18) * fontScale) }}
                className={`font-black leading-none ${
                  isHighContrast ? 'text-black' : 'text-espresso'
                }`}>
                ⋮
              </Text>
            </TouchableOpacity>

            {isHeaderMenuOpen && (
              <View
                style={{
                  position: 'absolute',
                  top: isGloveMode ? 52 : 44,
                  right: 0,
                  zIndex: 100,
                  elevation: 10,
                  ...(isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : {}),
                }}
                className="w-48 rounded-2xl border border-black/10 bg-white p-1.5 shadow-xl">
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    triggerHaptic('selection');
                    setIsHeaderMenuOpen(false);
                    setIsExportModalVisible(true);
                  }}
                  className={`flex-row items-center rounded-xl px-3 ${
                    isGloveMode ? 'py-3' : 'py-2.5'
                  }`}>
                  <Save size={15} color={isHighContrast ? '#000000' : '#8C4522'} />
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className={`ml-2 font-bold ${
                      isHighContrast ? 'text-black' : 'text-espresso'
                    }`}>
                    Export Table
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    triggerHaptic('selection');
                    setIsHeaderMenuOpen(false);
                    loadAuditLogs();
                    setIsAuditLogsVisible(true);
                  }}
                  className={`flex-row items-center rounded-xl px-3 ${
                    isGloveMode ? 'py-3' : 'py-2.5'
                  }`}>
                  <History size={15} color={isHighContrast ? '#000000' : '#8C4522'} />
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className={`ml-2 font-bold ${
                      isHighContrast ? 'text-black' : 'text-espresso'
                    }`}>
                    Activity Logs
                  </Text>
                </TouchableOpacity>

                {permissions.canManageFolderColumns && (
                  <>
                    <View className="my-1 h-[1px] bg-black/5" />

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        triggerHaptic('selection');
                        setIsHeaderMenuOpen(false);
                        setIsRenameModalVisible(true);
                      }}
                      className={`flex-row items-center rounded-xl px-3 ${
                        isGloveMode ? 'py-3' : 'py-2.5'
                      }`}>
                      <Pencil size={15} color={isHighContrast ? '#000000' : '#8C4522'} />
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`ml-2 font-bold ${
                          isHighContrast ? 'text-black' : 'text-espresso'
                        }`}>
                        Rename Folder
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        triggerHaptic('warning');
                        handleDeleteEntireFolder();
                      }}
                      className={`flex-row items-center rounded-xl px-3 ${
                        isGloveMode ? 'py-3' : 'py-2.5'
                      }`}>
                      <Trash2 size={15} color="#DC2626" />
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className="ml-2 font-bold text-red-600">
                        Delete Folder
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#8C4522" />
            <Text className="mt-3 text-xs font-semibold text-espresso">Loading table data...</Text>
          </View>
        ) : !folder ? (
          <View className="flex-1 items-center justify-center px-8">
            <View className="rounded-3xl border border-cognac/20 bg-cognac/10 p-5 shadow-inner">
              <Layers size={36} color={isHighContrast ? '#000000' : '#8C4522'} />
            </View>
            <Text className="mt-4 text-center text-lg font-black text-espresso">
              Folder Not Found
            </Text>
            <Text className="mt-1 text-center text-xs font-medium text-taupe leading-relaxed">
              This folder could not be loaded or may have been removed.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.replace('/user-folders')}
              className="mt-5 rounded-full bg-cognac px-6 py-3 shadow-sm shadow-cognac/30">
              <Text className="text-sm font-black text-white">Back to Folders</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            {/* ═════════════════════════════════════════════════ */}
            {/* 1. COLUMN MANAGEMENT SECTION                    */}
            {/* ═════════════════════════════════════════════════ */}
            <View className="mt-3 px-6">
              <View
                style={
                  isHighContrast
                    ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                    : undefined
                }
                className="rounded-[26px] border border-white/90 bg-white/85 p-4 shadow-sm shadow-espresso/5">
                <View className="flex-row items-center justify-between pb-2.5">
                  <View className="flex-row items-center">
                    <Layers
                      size={16}
                      color={isHighContrast ? '#000000' : '#8C4522'}
                      strokeWidth={2.5}
                    />
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className={`ml-2 font-black uppercase tracking-wider ${
                        isHighContrast ? 'text-black' : 'text-espresso'
                      }`}>
                      Columns ({columns.length})
                    </Text>
                  </View>

                  {permissions.canManageFolderColumns && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        triggerHaptic('medium');
                        handleOpenAddColumn();
                      }}
                      hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                      style={
                        isHighContrast
                          ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                          : undefined
                      }
                      className={`flex-row items-center rounded-full bg-cognac/15 ${
                        isGloveMode ? 'min-h-[44px] px-4 py-2' : 'px-3 py-1.5'
                      }`}>
                      <Plus
                        size={14}
                        color={isHighContrast ? '#FFFFFF' : '#8C4522'}
                        strokeWidth={3}
                      />
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`ml-1 font-black ${
                          isHighContrast ? 'text-white' : 'text-cognac'
                        }`}>
                        Add Column
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {columns.length === 0 ? (
                  <View
                    style={
                      isHighContrast
                        ? { borderWidth: 1.5, borderColor: '#000000' }
                        : undefined
                    }
                    className="items-center justify-center rounded-2xl border border-dashed border-taupe/30 bg-champagne/60 p-4">
                    <Text
                      style={{ fontSize: Math.round(13 * fontScale) }}
                      className={`font-black ${isHighContrast ? 'text-black' : 'text-espresso'}`}>
                      No columns created yet
                    </Text>
                    <Text
                      style={{ fontSize: Math.round(11 * fontScale) }}
                      className={`mt-1 text-center font-medium ${
                        isHighContrast ? 'text-black/80' : 'text-taupe'
                      }`}>
                      Add columns like Text, Number, Photo, or Date to define your table
                    </Text>
                    {permissions.canManageFolderColumns && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          triggerHaptic('medium');
                          handleOpenAddColumn();
                        }}
                        style={
                          isHighContrast
                            ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                            : undefined
                        }
                        className={`mt-3 flex-row items-center rounded-full bg-cognac ${
                          isGloveMode ? 'min-h-[46px] px-5 py-2.5' : 'px-4 py-2'
                        } shadow-xs`}>
                        <Plus size={14} color="#fff" strokeWidth={3} />
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="ml-1.5 font-black text-white">
                          Add Column
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pt-1">
                    {columns.map((col) => {
                      let typeIcon = <FileText size={12} color="#2563EB" />;
                      let badgeBg = 'bg-blue-50';
                      let badgeText = 'text-blue-700';

                      if (col.type === 'number') {
                        typeIcon = (
                          <Text className="text-[12px] font-black text-amber-700 leading-none">#</Text>
                        );
                        badgeBg = 'bg-amber-50';
                        badgeText = 'text-amber-700';
                      } else if (col.type === 'image') {
                        typeIcon = <Camera size={12} color="#059669" />;
                        badgeBg = 'bg-emerald-50';
                        badgeText = 'text-emerald-700';
                      } else if (col.type === 'date') {
                        typeIcon = <Calendar size={12} color="#7C3AED" />;
                        badgeBg = 'bg-purple-50';
                        badgeText = 'text-purple-700';
                      }

                      return (
                        <View
                          key={col.id}
                          style={
                            isHighContrast
                              ? { borderWidth: 1.5, borderColor: '#000000' }
                              : undefined
                          }
                          className="mr-2 flex-row items-center rounded-2xl border border-black/10 bg-white px-3 py-2 shadow-xs">
                          <View className={`rounded-md p-1 ${badgeBg}`}>{typeIcon}</View>
                          <View className="mx-2">
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className={`font-bold ${
                                isHighContrast ? 'text-black' : 'text-espresso'
                              }`}>
                              {col.name}
                            </Text>
                            <Text
                              style={{ fontSize: Math.round(10 * fontScale) }}
                              className={`font-semibold uppercase ${badgeText}`}>
                              {col.type}
                            </Text>
                          </View>
                          {permissions.canManageFolderColumns && (
                            <>
                              <TouchableOpacity
                                onPress={() => {
                                  triggerHaptic('selection');
                                  handleOpenEditColumn(col);
                                }}
                                hitSlop={isGloveMode ? { top: 12, bottom: 12, left: 12, right: 12 } : { top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityLabel="Edit column"
                                accessibilityRole="button"
                                className="rounded-full p-1">
                                <Pencil size={13} color={isHighContrast ? '#000000' : '#8C7C70'} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  triggerHaptic('warning');
                                  handleDeleteColumn(col);
                                }}
                                hitSlop={isGloveMode ? { top: 12, bottom: 12, left: 12, right: 12 } : { top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityLabel="Delete column"
                                accessibilityRole="button"
                                className="ml-0.5 rounded-full p-1">
                                <Trash2 size={13} color="#EF4444" />
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </View>

            {/* ═════════════════════════════════════════════════ */}
            {/* 2. CONTROLS BAR: SEARCH, SEGMENTED CONTROL, ADD   */}
            {/* ═════════════════════════════════════════════════ */}
            <View className="mt-4 px-6">
              <View className="flex-row items-center gap-2">
                {/* Search */}
                <View
                  style={
                    isHighContrast
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }
                  className={`flex-1 flex-row items-center rounded-2xl border border-white/80 bg-white/90 px-3.5 ${
                    isGloveMode ? 'py-3' : 'py-2.5'
                  } shadow-sm shadow-espresso/5`}>
                  <Search
                    size={16}
                    color={isHighContrast ? '#000000' : '#8C7C70'}
                  />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    maxLength={255}
                    placeholder="Search records..."
                    placeholderTextColor={isHighContrast ? '#555555' : '#8C7C70'}
                    style={{
                      fontSize: Math.round(13 * fontScale),
                      color: isHighContrast ? '#000000' : '#2D231E',
                    }}
                    className="ml-2 flex-1 font-semibold"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        triggerHaptic('light');
                        setSearchQuery('');
                      }}
                      hitSlop={isGloveMode ? { top: 10, bottom: 10, left: 10, right: 10 } : undefined}
                      activeOpacity={0.7}>
                      <X size={14} color={isHighContrast ? '#000000' : '#8C7C70'} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Apple-style Segmented Control: Cards vs Table */}
                <View
                  style={
                    isHighContrast
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }
                  className="flex-row items-center rounded-2xl bg-white/80 p-1 border border-white/90 shadow-sm">
                  <TouchableOpacity
                    key="segment-cards"
                    activeOpacity={0.8}
                    onPress={() => {
                      triggerHaptic('selection');
                      setViewMode('cards');
                    }}
                    style={{
                      backgroundColor:
                        viewMode === 'cards'
                          ? isHighContrast
                            ? '#000000'
                            : '#8C4522'
                          : 'transparent',
                    }}
                    className={`flex-row items-center rounded-xl ${
                      isGloveMode ? 'px-3 py-2' : 'px-2.5 py-1.5'
                    }`}>
                    <Layers
                      size={14}
                      color={
                        viewMode === 'cards'
                          ? '#fff'
                          : isHighContrast
                          ? '#000000'
                          : '#8C7C70'
                      }
                    />
                    <Text
                      style={{
                        fontSize: Math.round(11 * fontScale),
                        color:
                          viewMode === 'cards'
                            ? '#fff'
                            : isHighContrast
                            ? '#000000'
                            : '#8C7C70',
                      }}
                      className="ml-1 font-bold">
                      Cards
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    key="segment-table"
                    activeOpacity={0.8}
                    onPress={() => {
                      triggerHaptic('selection');
                      setViewMode('table');
                    }}
                    style={{
                      backgroundColor:
                        viewMode === 'table'
                          ? isHighContrast
                            ? '#000000'
                            : '#8C4522'
                          : 'transparent',
                    }}
                    className={`flex-row items-center rounded-xl ${
                      isGloveMode ? 'px-3 py-2' : 'px-2.5 py-1.5'
                    }`}>
                    <FileText
                      size={14}
                      color={
                        viewMode === 'table'
                          ? '#fff'
                          : isHighContrast
                          ? '#000000'
                          : '#8C7C70'
                      }
                    />
                    <Text
                      style={{
                        fontSize: Math.round(11 * fontScale),
                        color:
                          viewMode === 'table'
                            ? '#fff'
                            : isHighContrast
                            ? '#000000'
                            : '#8C7C70',
                      }}
                      className="ml-1 font-bold">
                      Table
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Add Record Button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleOpenAddRecord}
                  hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                  style={
                    isHighContrast
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                      : undefined
                  }
                  className={`flex-row items-center rounded-2xl bg-cognac ${
                    isGloveMode ? 'min-h-[48px] px-4 py-2.5' : 'px-3.5 py-2.5'
                  } shadow-sm shadow-cognac/30`}>
                  <Plus size={16} color="#fff" strokeWidth={3} />
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className="ml-1 font-black text-white">
                    Record
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ═════════════════════════════════════════════════ */}
            {/* 3. VIEWING RECORDS: CARDS OR TABLE               */}
            {/* ═════════════════════════════════════════════════ */}
            <View className="mt-4 px-6 pb-28">
              {filteredRecords.length === 0 ? (
                <View
                  key="records-empty-view"
                  style={
                    isHighContrast
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }
                  className="mt-4 items-center justify-center rounded-[28px] border border-dashed border-taupe/30 bg-white/60 p-8 shadow-sm">
                  {columns.length === 0 ? (
                    <>
                      <View
                        style={
                          isHighContrast
                            ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#F0F0F0' }
                            : undefined
                        }
                        className="rounded-3xl border border-cognac/20 bg-cognac/10 p-4 shadow-inner">
                        <Layers
                          size={32}
                          color={isHighContrast ? '#000000' : '#8C4522'}
                          strokeWidth={2}
                        />
                      </View>
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className={`mt-3 text-center font-black ${
                          isHighContrast ? 'text-black' : 'text-espresso'
                        }`}>
                        Set Up Columns First
                      </Text>
                      <Text
                        style={{
                          fontSize: Math.round(12 * fontScale),
                          lineHeight: Math.round(18 * fontScale),
                        }}
                        className={`mt-1 text-center ${
                          isHighContrast ? 'text-black/80 font-medium' : 'text-taupe'
                        }`}>
                        Add at least one column above (such as Text, Number, Photo, or Date) to begin logging records in this folder.
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          triggerHaptic('medium');
                          handleOpenAddColumn();
                        }}
                        style={
                          isHighContrast
                            ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                            : undefined
                        }
                        className={`mt-4 flex-row items-center rounded-full bg-cognac px-5 ${
                          isGloveMode ? 'min-h-[50px] py-3.5' : 'py-2.5'
                        } shadow-sm shadow-cognac/30`}>
                        <Plus size={16} color="#fff" strokeWidth={2.8} />
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="ml-1.5 font-extrabold text-white">
                          Add First Column
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className={`text-center font-black ${
                          isHighContrast ? 'text-black' : 'text-espresso'
                        }`}>
                        {searchQuery ? 'No matching records found' : 'No records recorded yet'}
                      </Text>
                      <Text
                        style={{
                          fontSize: Math.round(12 * fontScale),
                          lineHeight: Math.round(18 * fontScale),
                        }}
                        className={`mt-1 text-center ${
                          isHighContrast ? 'text-black/80 font-medium' : 'text-taupe'
                        }`}>
                        {searchQuery
                          ? 'Try different search keywords.'
                          : 'Tap "+ Record" above to log your first entry into this table.'}
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={handleOpenAddRecord}
                        style={
                          isHighContrast
                            ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                            : undefined
                        }
                        className={`mt-4 flex-row items-center rounded-full bg-cognac px-5 ${
                          isGloveMode ? 'min-h-[50px] py-3.5' : 'py-2.5'
                        } shadow-sm shadow-cognac/30`}>
                        <Plus size={16} color="#fff" strokeWidth={2.8} />
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="ml-1.5 font-extrabold text-white">
                          Add First Record
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ) : viewMode === 'table' ? (
                /* TABLE GRID VIEW */
                <View
                  key="records-table-container"
                  className="overflow-hidden rounded-[26px] border border-white/90 bg-white/90 shadow-sm shadow-espresso/5">
                  <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View>
                      {/* Table Header */}
                      <View className="flex-row border-b border-black/10 bg-champagne px-4 py-3">
                        <View style={{ width: 45 }} className="justify-center">
                          <Text className="text-[11px] font-black uppercase text-taupe">#</Text>
                        </View>
                        {columns.map((col) => (
                          <View
                            key={col.id}
                            style={{ width: col.type === 'image' ? 90 : 130 }}
                            className="justify-center px-2">
                            <Text
                              className="text-[11px] font-black uppercase tracking-wider text-espresso"
                              numberOfLines={1}>
                              {col.name}
                            </Text>
                          </View>
                        ))}
                        <View style={{ width: 100 }} className="justify-center px-2">
                          <Text className="text-[11px] font-black uppercase tracking-wider text-taupe">
                            Date
                          </Text>
                        </View>
                        <View style={{ width: 80 }} className="justify-center text-right">
                          <Text className="text-[11px] font-black uppercase tracking-wider text-taupe text-right pr-2">
                            Actions
                          </Text>
                        </View>
                      </View>

                      {/* Table Rows */}
                      {filteredRecords.map((rec, index) => (
                        <TouchableOpacity
                          key={rec.id}
                          activeOpacity={0.85}
                          onPress={() => handleOpenRecordDetail(rec, index)}
                          className={`flex-row items-center border-b border-black/5 px-4 py-3 ${
                            index % 2 === 1 ? 'bg-champagne/40' : 'bg-white'
                          }`}>
                          <View style={{ width: 45 }} className="justify-center">
                            <Text className="text-xs font-bold text-taupe">{index + 1}</Text>
                          </View>

                          {columns.map((col) => (
                            <View
                              key={col.id}
                              style={{ width: col.type === 'image' ? 90 : 130 }}
                              className="justify-center px-2">
                              {renderCellContent(col, rec[col.id])}
                            </View>
                          ))}

                          <View style={{ width: 100 }} className="justify-center px-2">
                            <Text className="text-[11px] font-semibold text-taupe">
                              {formatDateTimeDisplay(rec.created_at, false)}
                            </Text>
                          </View>

                          {/* Action Buttons */}
                          {(permissions.canEditFolderRecord || permissions.canDeleteFolderRecord) ? (
                            <View style={{ width: 80 }} className="flex-row items-center justify-end gap-1.5">
                              {permissions.canEditFolderRecord && (
                                <TouchableOpacity
                                  onPress={() => handleOpenEditRecord(rec)}
                                  hitSlop={8}
                                  accessibilityLabel="Edit record"
                                  accessibilityRole="button"
                                  className="h-7 w-7 items-center justify-center rounded-full bg-black/5">
                                  <Pencil size={13} color="#8C4522" />
                                </TouchableOpacity>
                              )}
                              {permissions.canDeleteFolderRecord && (
                                <TouchableOpacity
                                  onPress={() => handlePromptDeleteRecord(rec, index)}
                                  hitSlop={8}
                                  accessibilityLabel="Delete record"
                                  accessibilityRole="button"
                                  className="h-7 w-7 items-center justify-center rounded-full bg-red-50">
                                  <Trash2 size={13} color="#DC2626" />
                                </TouchableOpacity>
                              )}
                            </View>
                          ) : (
                            <View style={{ width: 44 }} className="flex-row items-center justify-end">
                              <TouchableOpacity
                                onPress={() => handleOpenRecordDetail(rec, index)}
                                hitSlop={8}
                                accessibilityLabel="View record"
                                accessibilityRole="button"
                                className="h-7 w-7 items-center justify-center rounded-full bg-black/5">
                                <Eye size={13} color="#8C4522" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ) : (
                /* CARD VIEW (SWIPEABLE CARDS WITH COLUMN PREVIEWS & DETAILS MODAL) */
                <View key="records-cards-container">
                  {filteredRecords.map((rec, idx) => (
                    <SwipeableRecordCard
                      key={rec.id}
                      record={rec}
                      index={idx}
                      columns={columns}
                      onPressDetail={handleOpenRecordDetail}
                      onEdit={permissions.canEditFolderRecord ? handleOpenEditRecord : undefined}
                      onDelete={permissions.canDeleteFolderRecord ? handlePromptDeleteRecord : undefined}
                      onPreviewImage={setPreviewImageUrl}
                    />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* ═════════════════════════════════════════════════ */}
      {/* MODAL: FULL RECORD DETAILS (Apple Bottom Sheet)   */}
      {/* ═════════════════════════════════════════════════ */}
      <RecordDetailModal
        visible={detailModalVisible}
        record={selectedRecord?.record || null}
        index={selectedRecord?.index || 0}
        columns={columns}
        onClose={() => setDetailModalVisible(false)}
        onEdit={permissions.canEditFolderRecord ? handleOpenEditRecord : undefined}
        onDelete={permissions.canDeleteFolderRecord ? handlePromptDeleteRecord : undefined}
        onPreviewImage={setPreviewImageUrl}
      />

      {/* ═════════════════════════════════════════════════ */}
      {/* MODAL: FOLDER AUDIT LOGS (Activity Trail)         */}
      {/* ═════════════════════════════════════════════════ */}
      <AuditLogsModal
        visible={isAuditLogsVisible}
        onClose={() => setIsAuditLogsVisible(false)}
        logs={auditLogs}
        loading={loadingAuditLogs}
        folderName={folder?.folder_name}
      />

      {/* ═════════════════════════════════════════════════ */}
      {/* MODAL: TYPE CONFIRM DELETE RECORD (Apple Sheet)   */}
      {/* ═════════════════════════════════════════════════ */}
      <DeleteConfirmModal
        visible={deleteModalVisible}
        recordData={deletingRecordData}
        columns={columns}
        onClose={() => setDeleteModalVisible(false)}
        onConfirmDelete={handleExecuteDeleteRecord}
        deleting={isDeletingRecord}
      />

      {/* ═════════════════════════════════════════════════ */}
      {/* MODAL: ADD / EDIT COLUMN (Apple Bottom Sheet)     */}
      {/* ═════════════════════════════════════════════════ */}
      <Modal
        visible={isColumnModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setIsColumnModalVisible(false);
        }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="flex-1 justify-end bg-black/60">
            <Pressable
              className="flex-1"
              onPress={() => {
                Keyboard.dismiss();
                setIsColumnModalVisible(false);
              }}
            />
            <View className="max-h-[85%] rounded-t-[34px] border-t border-white/80 bg-white p-6 pb-8 shadow-2xl">
            {/* Grab Handle Pill */}
            <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-black/15" />

            <View className="flex-row items-center justify-between pb-3 border-b border-black/5">
              <View>
                <Text className="text-xl font-black tracking-tight text-espresso">
                  {editingColumn ? 'Edit Column' : 'Add New Column'}
                </Text>
                <Text className="text-xs font-medium text-taupe">
                  {editingColumn ? 'Update column properties' : 'Define a custom column for your table'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsColumnModalVisible(false)}
                activeOpacity={0.7}
                className="rounded-full bg-black/5 p-2">
                <X size={18} color="#1C120C" />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              className="mt-4">
              {/* Column Name */}
              <View>
                <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                  Column Name *
                </Text>
                <TextInput
                  value={columnNameInput}
                  onChangeText={setColumnNameInput}
                  maxLength={255}
                  placeholder="e.g. Planting Date, Moisture Level, Sample Photo"
                  placeholderTextColor="#8C7C70"
                  className="mt-1.5 rounded-2xl border border-black/10 bg-champagne/80 px-4 py-3.5 text-sm font-semibold text-espresso"
                />
              </View>

              {/* Column Type Selector (4 Options: Text, Number, Photo, Date) */}
              <View className="mt-4">
                <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                  Data Type *
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-2.5">
                  {/* Text */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setColumnTypeInput('text')}
                    className={`w-[48%] items-center rounded-2xl border p-3.5 ${
                      columnTypeInput === 'text'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-black/10 bg-champagne/70'
                    }`}>
                    <FileText size={20} color={columnTypeInput === 'text' ? '#2563EB' : '#8C7C70'} />
                    <Text
                      className={`mt-1.5 text-xs font-bold ${
                        columnTypeInput === 'text' ? 'text-blue-700' : 'text-espresso'
                      }`}>
                      Text
                    </Text>
                    <Text className="text-[10px] text-taupe">Notes, labels</Text>
                  </TouchableOpacity>

                  {/* Number */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setColumnTypeInput('number')}
                    className={`w-[48%] items-center rounded-2xl border p-3.5 ${
                      columnTypeInput === 'number'
                        ? 'border-amber-600 bg-amber-50'
                        : 'border-black/10 bg-champagne/70'
                    }`}>
                    <Text className="text-xl font-black text-amber-700 leading-none">#</Text>
                    <Text
                      className={`mt-1.5 text-xs font-bold ${
                        columnTypeInput === 'number' ? 'text-amber-700' : 'text-espresso'
                      }`}>
                      Number
                    </Text>
                    <Text className="text-[10px] text-taupe">pH, temp, qty</Text>
                  </TouchableOpacity>

                  {/* Photo */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setColumnTypeInput('image')}
                    className={`w-[48%] items-center rounded-2xl border p-3.5 ${
                      columnTypeInput === 'image'
                        ? 'border-emerald-600 bg-emerald-50'
                        : 'border-black/10 bg-champagne/70'
                    }`}>
                    <Camera
                      size={20}
                      color={columnTypeInput === 'image' ? '#059669' : '#8C7C70'}
                    />
                    <Text
                      className={`mt-1.5 text-xs font-bold ${
                        columnTypeInput === 'image' ? 'text-emerald-700' : 'text-espresso'
                      }`}>
                      Photo
                    </Text>
                    <Text className="text-[10px] text-taupe">Camera/Gallery</Text>
                  </TouchableOpacity>

                  {/* Date */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setColumnTypeInput('date')}
                    className={`w-[48%] items-center rounded-2xl border p-3.5 ${
                      columnTypeInput === 'date'
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-black/10 bg-champagne/70'
                    }`}>
                    <Calendar
                      size={20}
                      color={columnTypeInput === 'date' ? '#7C3AED' : '#8C7C70'}
                    />
                    <Text
                      className={`mt-1.5 text-xs font-bold ${
                        columnTypeInput === 'date' ? 'text-purple-700' : 'text-espresso'
                      }`}>
                      Date
                    </Text>
                    <Text className="text-[10px] text-taupe">Calendar picker</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            {/* Save & Cancel */}
            <View className="mt-4 flex-row gap-3 pt-2 border-t border-black/5">
              <TouchableOpacity
                onPress={() => setIsColumnModalVisible(false)}
                activeOpacity={0.7}
                className="flex-1 rounded-full border border-black/10 bg-champagne py-3.5">
                <Text className="text-center text-sm font-bold text-espresso">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveColumn}
                disabled={savingColumn}
                activeOpacity={0.85}
                className="flex-1 rounded-full bg-cognac py-3.5 shadow-sm shadow-cognac/30">
                {savingColumn ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-center text-sm font-extrabold text-white">
                    {editingColumn ? 'Save Column' : 'Add Column'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

      {/* ═════════════════════════════════════════════════ */}
      {/* MODAL: ADD / EDIT RECORD FORM (Apple Bottom Sheet)*/}
      {/* ═════════════════════════════════════════════════ */}
      <Modal
        visible={isRecordModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setIsRecordModalVisible(false);
        }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="flex-1 justify-end bg-black/60">
            <Pressable
              className="flex-1"
              onPress={() => {
                Keyboard.dismiss();
                setIsRecordModalVisible(false);
              }}
            />
            <View className="max-h-[88%] rounded-t-[34px] border-t border-white/80 bg-white p-6 pb-8 shadow-2xl">
            {/* Grab Handle Pill */}
            <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-black/15" />

            {/* Header */}
            <View className="flex-row items-center justify-between pb-3 border-b border-black/5">
              <View>
                <Text className="text-xl font-black tracking-tight text-espresso">
                  {editingRecord ? 'Edit Record' : 'Add Record'}
                </Text>
                <Text className="text-xs font-medium text-taupe">
                  Fill in the form fields according to your table columns
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsRecordModalVisible(false)}
                activeOpacity={0.7}
                className="rounded-full bg-black/5 p-2">
                <X size={18} color="#1C120C" />
              </TouchableOpacity>
            </View>

            {/* Form Fields Scroll */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              className="mt-4">
              <View className="gap-4 pb-6">
                {columns.map((col) => {
                  const currentValue = recordFormData[col.id];
                  const isUploading = imageUploading[col.id];

                  if (col.type === 'number') {
                    return (
                      <View key={col.id}>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                            {col.name} (Number)
                          </Text>
                          <Text className="text-xs font-black text-amber-700 leading-none">#</Text>
                        </View>
                        <TextInput
                          value={
                            currentValue !== undefined && currentValue !== null
                              ? String(currentValue)
                              : ''
                          }
                          onChangeText={(val) =>
                            setRecordFormData((prev) => ({ ...prev, [col.id]: val }))
                          }
                          maxLength={20}
                          placeholder="0.00"
                          placeholderTextColor="#8C7C70"
                          keyboardType="numeric"
                          className="mt-1.5 rounded-2xl border border-black/10 bg-champagne px-4 py-3 text-sm font-semibold text-espresso"
                        />
                      </View>
                    );
                  }

                  if (col.type === 'date') {
                    const formattedDisplay = currentValue ? formatDateDisplay(currentValue) : '';

                    return (
                      <View key={col.id}>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                            {col.name} (Date)
                          </Text>
                          <Calendar size={13} color="#7C3AED" />
                        </View>

                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            setActiveDatePickerColId(col.id);
                            setShowDatePicker(true);
                          }}
                          className="mt-1.5 flex-row items-center justify-between rounded-2xl border border-black/10 bg-champagne px-4 py-3.5">
                          <View className="flex-row items-center">
                            <Calendar
                              size={16}
                              color={currentValue ? '#7C3AED' : '#8C7C70'}
                            />
                            <Text
                              className={`ml-2.5 text-sm font-semibold ${
                                currentValue ? 'text-espresso' : 'text-taupe'
                              }`}>
                              {formattedDisplay || 'Select date...'}
                            </Text>
                          </View>

                          {currentValue ? (
                            <TouchableOpacity
                              onPress={() =>
                                setRecordFormData((prev) => ({ ...prev, [col.id]: null }))
                              }
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              className="rounded-full bg-black/5 p-1">
                              <X size={12} color="#8C7C70" />
                            </TouchableOpacity>
                          ) : null}
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  if (col.type === 'image') {
                    return (
                      <View key={col.id}>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                            {col.name} (Photo)
                          </Text>
                          <Camera size={13} color="#059669" />
                        </View>

                        {/* If image is selected/uploaded, show preview with remove/replace */}
                        {parseFolderImageValue(currentValue).bestUri ? (
                          <View className="mt-2 overflow-hidden rounded-2xl border border-black/10 bg-champagne p-2.5">
                            <View className="relative h-44 w-full overflow-hidden rounded-xl bg-black/5">
                              <FolderRecordImage value={currentValue} className="h-full w-full" />
                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => handleRemoveImageFromForm(col.id)}
                                hitSlop={8}
                                accessibilityLabel="Remove photo"
                                accessibilityRole="button"
                                className="absolute right-2 top-2 rounded-full bg-red-600 p-1.5 shadow-md">
                                <Trash2 size={14} color="#fff" />
                              </TouchableOpacity>

                              {/* Cloud sync status indicator badge */}
                              <View className="absolute bottom-2 left-2 flex-row items-center rounded-full bg-black/70 px-2.5 py-1">
                                {isUploading ? (
                                  <>
                                    <ActivityIndicator size={10} color="#FBBF24" />
                                    <Text className="ml-1 text-[10px] font-semibold text-amber-300">
                                      Syncing to Supabase...
                                    </Text>
                                  </>
                                ) : parseFolderImageValue(currentValue).cloudUrl ? (
                                  <>
                                    <Check size={10} color="#34D399" />
                                    <Text className="ml-1 text-[10px] font-semibold text-emerald-300">
                                      Saved locally & cloud synced
                                    </Text>
                                  </>
                                ) : (
                                  <Text className="text-[10px] font-semibold text-white/80">
                                    Saved to device
                                  </Text>
                                )}
                              </View>
                            </View>

                            <View className="mt-2 flex-row gap-2">
                              <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => handlePickImage(col.id, true)}
                                className="flex-1 flex-row items-center justify-center rounded-xl bg-cognac/10 py-2">
                                <Camera size={14} color="#8C4522" />
                                <Text className="ml-1.5 text-xs font-bold text-cognac">Retake</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => handlePickImage(col.id, false)}
                                className="flex-1 flex-row items-center justify-center rounded-xl bg-cognac/10 py-2">
                                <Camera size={14} color="#8C4522" />
                                <Text className="ml-1.5 text-xs font-bold text-cognac">Replace</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View className="mt-2 rounded-2xl border border-dashed border-black/20 bg-champagne p-4">
                            {isUploading ? (
                              <View className="items-center py-4">
                                <ActivityIndicator color="#8C4522" size="small" />
                                <Text className="mt-2 text-xs font-bold text-cognac">
                                  Compressing & preparing image...
                                </Text>
                              </View>
                            ) : (
                              <View className="flex-row gap-2">
                                <TouchableOpacity
                                  activeOpacity={0.85}
                                  onPress={() => handlePickImage(col.id, true)}
                                  className="flex-1 items-center rounded-xl border border-black/10 bg-white py-3 shadow-xs">
                                  <Camera size={20} color="#8C4522" />
                                  <Text className="mt-1 text-xs font-bold text-espresso">
                                    Take Photo
                                  </Text>
                                  <Text className="text-[10px] text-taupe">Camera (compressed)</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  activeOpacity={0.85}
                                  onPress={() => handlePickImage(col.id, false)}
                                  className="flex-1 items-center rounded-xl border border-black/10 bg-white py-3 shadow-xs">
                                  <Camera size={20} color="#8C4522" />
                                  <Text className="mt-1 text-xs font-bold text-espresso">
                                    Gallery
                                  </Text>
                                  <Text className="text-[10px] text-taupe">Upload photo</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  }

                  // Default: Text input
                  return (
                    <View key={col.id}>
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                          {col.name} (Text)
                        </Text>
                        <FileText size={13} color="#2563EB" />
                      </View>
                      <TextInput
                        value={
                          currentValue !== undefined && currentValue !== null
                            ? String(currentValue)
                            : ''
                        }
                        onChangeText={(val) =>
                          setRecordFormData((prev) => ({ ...prev, [col.id]: val }))
                        }
                        maxLength={3000}
                        placeholder={`Enter ${col.name.toLowerCase()}...`}
                        placeholderTextColor="#8C7C70"
                        multiline
                        className="mt-1.5 min-h-[50px] rounded-2xl border border-black/10 bg-champagne px-4 py-3 text-sm font-semibold text-espresso"
                      />
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            {/* Date Picker Instance */}
            {showDatePicker && activeDatePickerColId && (
              <DateTimePicker
                value={
                  recordFormData[activeDatePickerColId]
                    ? new Date(recordFormData[activeDatePickerColId])
                    : new Date()
                }
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate && event.type !== 'dismissed') {
                    const isoDate = selectedDate.toISOString().split('T')[0];
                    setRecordFormData((prev) => ({
                      ...prev,
                      [activeDatePickerColId]: isoDate,
                    }));
                  }
                  if (Platform.OS !== 'ios') {
                    setActiveDatePickerColId(null);
                  }
                }}
              />
            )}

            {/* Save & Cancel */}
            <View className="mt-4 flex-row gap-3 pt-2 border-t border-black/5">
              <TouchableOpacity
                onPress={() => setIsRecordModalVisible(false)}
                activeOpacity={0.8}
                className="flex-1 rounded-full border border-black/10 bg-champagne py-3.5">
                <Text className="text-center text-sm font-bold text-espresso">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveRecord}
                disabled={savingRecord}
                activeOpacity={0.85}
                className="flex-1 rounded-full bg-cognac py-3.5 shadow-sm shadow-cognac/30">
                {savingRecord ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-center text-sm font-extrabold text-white">
                    {editingRecord ? 'Save Changes' : 'Add Record'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

      {/* ═════════════════════════════════════════════════ */}
      {/* MODAL: FULLSCREEN IMAGE VIEWER                   */}
      {/* ═════════════════════════════════════════════════ */}
      <Modal
        visible={!!previewImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}>
        <View className="flex-1 bg-black/95 justify-center items-center px-4">
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setPreviewImageUrl(null)}
          />
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setPreviewImageUrl(null)}
            className="absolute top-14 right-5 z-50 rounded-full bg-white/20 p-3">
            <X size={24} color="#fff" />
          </TouchableOpacity>

          {previewImageUrl && (
            <Image
              source={{ uri: previewImageUrl }}
              className="w-full h-4/5 rounded-2xl"
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* ═════════════════════════════════════════════════ */}
      {/* MODAL: RENAME FOLDER (Apple Bottom Sheet)         */}
      {/* ═════════════════════════════════════════════════ */}
      <Modal
        visible={isRenameModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setIsRenameModalVisible(false);
        }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="flex-1 justify-end bg-black/60">
            <Pressable
              className="flex-1"
              onPress={() => {
                Keyboard.dismiss();
                setIsRenameModalVisible(false);
              }}
            />
            <View className="max-h-[85%] rounded-t-[34px] border-t border-white/80 bg-white p-6 pb-8 shadow-2xl">
            {/* Grab Handle Pill */}
            <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-black/15" />

            <View className="flex-row items-center justify-between pb-3 border-b border-black/5">
              <View>
                <Text className="text-xl font-black tracking-tight text-espresso">
                  Rename Folder
                </Text>
                <Text className="text-xs font-medium text-taupe">
                  Update the title of this custom table
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsRenameModalVisible(false)}
                activeOpacity={0.7}
                className="rounded-full bg-black/5 p-2">
                <X size={18} color="#1C120C" />
              </TouchableOpacity>
            </View>

            <View className="mt-4">
              <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                Folder Name *
              </Text>
              <TextInput
                value={renameInput}
                onChangeText={setRenameInput}
                maxLength={255}
                placeholder="Folder name"
                placeholderTextColor="#8C7C70"
                className="mt-1.5 rounded-2xl border border-black/10 bg-champagne/80 px-4 py-3.5 text-sm font-semibold text-espresso"
              />
            </View>

            <View className="mt-6 flex-row gap-3 pt-2 border-t border-black/5">
              <TouchableOpacity
                onPress={() => setIsRenameModalVisible(false)}
                activeOpacity={0.7}
                className="flex-1 rounded-full border border-black/10 bg-champagne py-3.5">
                <Text className="text-center text-sm font-bold text-espresso">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveRename}
                disabled={savingRename}
                activeOpacity={0.85}
                className="flex-1 rounded-full bg-cognac py-3.5 shadow-sm shadow-cognac/30">
                {savingRename ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-center text-sm font-extrabold text-white">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

      {/* ═════════════════════════════════════════════════ */}
      {/* MODAL: EXPORT TABLE (Apple Bottom Sheet)          */}
      {/* ═════════════════════════════════════════════════ */}
      <Modal
        visible={isExportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isExporting) setIsExportModalVisible(false);
        }}>
        <View className="flex-1 justify-end bg-black/60">
          <Pressable
            className="flex-1"
            onPress={() => {
              if (!isExporting) setIsExportModalVisible(false);
            }}
          />
          <View className="max-h-[90%] rounded-t-[34px] border-t border-white/80 bg-white p-6 pb-8 shadow-2xl">
            {/* Grab Handle Pill */}
            <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-black/15" />

            {/* Header */}
            <View className="flex-row items-center justify-between pb-3 border-b border-black/5">
              <View className="flex-1 pr-3">
                <Text className="text-xl font-black tracking-tight text-espresso">
                  Export Table
                </Text>
                <Text className="text-xs font-medium text-taupe mt-0.5">
                  Download records directly to your phone storage
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsExportModalVisible(false)}
                disabled={isExporting}
                activeOpacity={0.7}
                className="rounded-full bg-black/5 p-2">
                <X size={18} color="#1C120C" />
              </TouchableOpacity>
            </View>

            {/* Folder & Record Summary Badge */}
            <View className="mt-3.5 rounded-2xl border border-black/5 bg-champagne p-3.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-black text-espresso" numberOfLines={1}>
                  📁 {folder?.folder_name || 'Folder Records'}
                </Text>
                {folder?.farm_name ? (
                  <View className="flex-row items-center rounded-full bg-cognac/10 px-2.5 py-0.5">
                    <MapPin size={10} color="#8C4522" />
                    <Text className="ml-1 text-[10px] font-bold text-cognac" numberOfLines={1}>
                      {folder.farm_name}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View className="mt-2 flex-row items-center gap-2">
                <View className="rounded-full bg-cognac/10 px-2.5 py-1">
                  <Text className="text-[11px] font-black text-cognac">
                    {records.length} {records.length === 1 ? 'Record' : 'Records'}
                  </Text>
                </View>
                <View className="rounded-full bg-black/5 px-2.5 py-1">
                  <Text className="text-[11px] font-bold text-espresso">
                    {columns.length} {columns.length === 1 ? 'Column' : 'Columns'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Format Selection List */}
            <Text className="mt-4 text-[11px] font-black uppercase tracking-wider text-taupe">
              Select Export Format
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} className="mt-2 max-h-[290px]">
              <View className="gap-2.5 pb-2">
                {/* 1. Excel */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedExportFormat('excel')}
                  className={`flex-row items-center justify-between rounded-2xl border p-3.5 transition-colors ${
                    selectedExportFormat === 'excel'
                      ? 'border-cognac bg-cognac/5'
                      : 'border-black/10 bg-white'
                  }`}>
                  <View className="flex-row items-center flex-1 pr-2">
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                      <FileText size={20} color="#059669" />
                    </View>
                    <View className="ml-3 flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-sm font-black text-espresso">Excel Spreadsheet</Text>
                        <View className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 border border-emerald-200">
                          <Text className="text-[9px] font-extrabold text-emerald-800">.XLSX</Text>
                        </View>
                      </View>
                      <Text className="text-[11px] font-medium text-taupe mt-0.5">
                        Formatted workbook for Microsoft Excel & Google Sheets
                      </Text>
                    </View>
                  </View>
                  <View
                    className={`h-5 w-5 rounded-full items-center justify-center border ${
                      selectedExportFormat === 'excel'
                        ? 'border-cognac bg-cognac'
                        : 'border-black/20 bg-white'
                    }`}>
                    {selectedExportFormat === 'excel' && <Check size={12} color="#fff" strokeWidth={3} />}
                  </View>
                </TouchableOpacity>

                {/* 2. PDF */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedExportFormat('pdf')}
                  className={`flex-row items-center justify-between rounded-2xl border p-3.5 transition-colors ${
                    selectedExportFormat === 'pdf'
                      ? 'border-cognac bg-cognac/5'
                      : 'border-black/10 bg-white'
                  }`}>
                  <View className="flex-row items-center flex-1 pr-2">
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
                      <FileText size={20} color="#E11D48" />
                    </View>
                    <View className="ml-3 flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-sm font-black text-espresso">PDF Document</Text>
                        <View className="ml-2 rounded-md bg-rose-50 px-1.5 py-0.5 border border-rose-200">
                          <Text className="text-[9px] font-extrabold text-rose-800">.PDF</Text>
                        </View>
                      </View>
                      <Text className="text-[11px] font-medium text-taupe mt-0.5">
                        SoilSync printable report with formatted table & badges
                      </Text>
                    </View>
                  </View>
                  <View
                    className={`h-5 w-5 rounded-full items-center justify-center border ${
                      selectedExportFormat === 'pdf'
                        ? 'border-cognac bg-cognac'
                        : 'border-black/20 bg-white'
                    }`}>
                    {selectedExportFormat === 'pdf' && <Check size={12} color="#fff" strokeWidth={3} />}
                  </View>
                </TouchableOpacity>

                {/* 3. Word */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedExportFormat('word')}
                  className={`flex-row items-center justify-between rounded-2xl border p-3.5 transition-colors ${
                    selectedExportFormat === 'word'
                      ? 'border-cognac bg-cognac/5'
                      : 'border-black/10 bg-white'
                  }`}>
                  <View className="flex-row items-center flex-1 pr-2">
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                      <FileText size={20} color="#2563EB" />
                    </View>
                    <View className="ml-3 flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-sm font-black text-espresso">Word Document</Text>
                        <View className="ml-2 rounded-md bg-blue-50 px-1.5 py-0.5 border border-blue-200">
                          <Text className="text-[9px] font-extrabold text-blue-800">.DOC</Text>
                        </View>
                      </View>
                      <Text className="text-[11px] font-medium text-taupe mt-0.5">
                        Editable table document for MS Word and Google Docs
                      </Text>
                    </View>
                  </View>
                  <View
                    className={`h-5 w-5 rounded-full items-center justify-center border ${
                      selectedExportFormat === 'word'
                        ? 'border-cognac bg-cognac'
                        : 'border-black/20 bg-white'
                    }`}>
                    {selectedExportFormat === 'word' && <Check size={12} color="#fff" strokeWidth={3} />}
                  </View>
                </TouchableOpacity>

                {/* 4. CSV */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedExportFormat('csv')}
                  className={`flex-row items-center justify-between rounded-2xl border p-3.5 transition-colors ${
                    selectedExportFormat === 'csv'
                      ? 'border-cognac bg-cognac/5'
                      : 'border-black/10 bg-white'
                  }`}>
                  <View className="flex-row items-center flex-1 pr-2">
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                      <Layers size={20} color="#D97706" />
                    </View>
                    <View className="ml-3 flex-1">
                      <View className="flex-row items-center">
                        <Text className="text-sm font-black text-espresso">CSV Spreadsheet</Text>
                        <View className="ml-2 rounded-md bg-amber-50 px-1.5 py-0.5 border border-amber-200">
                          <Text className="text-[9px] font-extrabold text-amber-800">.CSV</Text>
                        </View>
                      </View>
                      <Text className="text-[11px] font-medium text-taupe mt-0.5">
                        Raw comma-separated data for database imports & tools
                      </Text>
                    </View>
                  </View>
                  <View
                    className={`h-5 w-5 rounded-full items-center justify-center border ${
                      selectedExportFormat === 'csv'
                        ? 'border-cognac bg-cognac'
                        : 'border-black/20 bg-white'
                    }`}>
                    {selectedExportFormat === 'csv' && <Check size={12} color="#fff" strokeWidth={3} />}
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View className="mt-4 gap-2.5 pt-3 border-t border-black/5">
              <View className="flex-row gap-2.5">
                {/* Secondary: Share to other apps */}
                <TouchableOpacity
                  onPress={() => handleExecuteExport('share')}
                  disabled={isExporting}
                  activeOpacity={0.8}
                  className="flex-1 flex-row items-center justify-center rounded-2xl border border-black/15 bg-white py-3.5 shadow-xs">
                  <FileText size={15} color="#554D47" strokeWidth={2.2} />
                  <Text className="ml-1.5 text-xs font-bold text-espresso">Share to Apps</Text>
                </TouchableOpacity>

                {/* Primary: Save directly to phone storage */}
                <TouchableOpacity
                  onPress={() => handleExecuteExport('save')}
                  disabled={isExporting}
                  activeOpacity={0.85}
                  className="flex-1 flex-row items-center justify-center rounded-2xl bg-cognac py-3.5 shadow-sm shadow-cognac/30">
                  {isExporting ? (
                    <>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text className="ml-2 text-xs font-black text-white">Saving...</Text>
                    </>
                  ) : (
                    <>
                      <Save size={15} color="#fff" strokeWidth={2.4} />
                      <Text className="ml-1.5 text-xs font-black text-white">Save to Phone</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => setIsExportModalVisible(false)}
                disabled={isExporting}
                activeOpacity={0.7}
                className="items-center py-2">
                <Text className="text-xs font-bold text-taupe">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
