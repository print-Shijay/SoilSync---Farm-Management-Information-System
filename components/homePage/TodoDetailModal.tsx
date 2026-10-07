import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  TextInput,
  ActivityIndicator,
  Image,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal, KeyboardAvoidingView } from '../common/AppModal';
import { useAccessibility } from '../../lib/accessibility';
import { useAuth } from '../../lib/AuthContext';
import { LOCAL_AVATAR_SOURCES } from '../../lib/profile-icons';
import {
  MessageSquare,
  Send,
  SlidersHorizontal,
  Trash2,
  Check,
} from '../Icons';
import {
  getTodoComments,
  addTodoComment,
  deleteTodoComment,
  TodoCommentItem,
} from '../../lib/db-operations';

export type TodoDetailData = {
  id: string;
  title: string;
  notes: string | null;
  start_date: string | null;
  due_date: string | null;
  is_completed: boolean;
  progress?: number;
  farm_id: string;
};

type TodoDetailModalProps = {
  todo: TodoDetailData | null;
  farmName?: string;
  plotNamesText?: string;
  status?: 'active' | 'completed' | 'late' | 'on_track' | string;
  visible: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onToggleComplete: () => void;
  onUpdateProgress?: (progress: number) => void;
  allGroupTodoIds?: string[];
};

function formatDateLabel(dateKey: string | null) {
  if (!dateKey) return 'N/A';
  const cleanKey = dateKey.split(' ')[0].split('T')[0];
  const parts = cleanKey.split('-').map(Number);
  if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    const [year, month, day] = parts;
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }
  return dateKey;
}

function formatRelativeTime(dateStr: string) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-cognac/15', text: 'text-cognac', label: 'Active' },
  on_track: { bg: 'bg-cognac/15', text: 'text-cognac', label: 'Active' },
  completed: { bg: 'bg-taupe/20', text: 'text-taupe', label: 'Completed' },
  late: { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' },
};

const QUICK_PRESETS = [0, 25, 50, 75, 100];

export function TodoDetailModal({
  todo,
  farmName,
  plotNamesText,
  status = 'active',
  visible,
  onClose,
  onEdit,
  onToggleComplete,
  onUpdateProgress,
  allGroupTodoIds,
}: TodoDetailModalProps) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { fontScale, isGloveMode, triggerHaptic } = useAccessibility();

  // Progress state
  const initialProgress = todo
    ? typeof todo.progress === 'number'
      ? todo.progress
      : todo.is_completed
        ? 100
        : 0
    : 0;

  const [localProgress, setLocalProgress] = useState(initialProgress);
  const localProgressRef = useRef(initialProgress);
  const lastHapticStepRef = useRef(Math.floor(initialProgress / 10));
  const activeTodoIdRef = useRef<string | null>(null);

  // Comments state
  const [comments, setComments] = useState<TodoCommentItem[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const todoId = todo?.id;
  const todoProgress = todo?.progress;
  const todoIsCompleted = todo?.is_completed;

  // Sync progress only when switching to a different task
  useEffect(() => {
    if (visible && todoId) {
      if (activeTodoIdRef.current !== todoId) {
        activeTodoIdRef.current = todoId;
        const p =
          typeof todoProgress === 'number'
            ? todoProgress
            : todoIsCompleted
              ? 100
              : 0;
        setLocalProgress(p);
        localProgressRef.current = p;
        lastHapticStepRef.current = Math.floor(p / 10);
      }
    } else if (!visible) {
      activeTodoIdRef.current = null;
    }
  }, [visible, todoId, todoProgress, todoIsCompleted]);

  // Memoize stable string key of target todo IDs to avoid endless refetching loops
  const groupIdsKey = useMemo(() => {
    if (allGroupTodoIds && allGroupTodoIds.length > 0) {
      return [...allGroupTodoIds].sort().join(',');
    }
    return todo?.id || '';
  }, [allGroupTodoIds, todo?.id]);

  // Load comments
  const loadComments = useCallback(async () => {
    if (!groupIdsKey) return;
    const targetIds = groupIdsKey.split(',').filter(Boolean);
    if (targetIds.length === 0) return;

    setIsLoadingComments(true);
    try {
      const items = await getTodoComments(targetIds);
      setComments(items);
    } catch (e) {
      console.warn('Failed to load todo comments:', e);
    } finally {
      setIsLoadingComments(false);
    }
  }, [groupIdsKey]);

  useEffect(() => {
    if (visible && groupIdsKey) {
      void loadComments();
    } else if (!visible) {
      setComments([]);
      setCommentInput('');
    }
  }, [visible, groupIdsKey, loadComments]);

  // Quick preset click
  const handlePresetPress = (preset: number) => {
    triggerHaptic(preset === 100 ? 'success' : 'selection');
    setLocalProgress(preset);
    localProgressRef.current = preset;
    lastHapticStepRef.current = Math.floor(preset / 10);
  };

  // Save progress: commits current slider progress and only marks done if 100%
  const handleSaveProgress = () => {
    triggerHaptic(localProgress >= 100 ? 'success' : 'selection');
    onUpdateProgress?.(localProgress);
    Keyboard.dismiss();
    onClose();
  };

  // Add Comment
  const handleAddComment = async () => {
    if (!todo || !commentInput.trim() || !user?.id || isSubmittingComment) return;
    const text = commentInput.trim();
    setIsSubmittingComment(true);
    triggerHaptic('selection');

    try {
      const newComment = await addTodoComment({
        todoId: todo.id,
        farmId: todo.farm_id,
        userId: user.id,
        comment: text,
      });

      setComments((prev) => [...prev, newComment]);
      setCommentInput('');
      triggerHaptic('success');
    } catch (err) {
      console.warn('Failed to add comment:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Delete Comment
  const handleDeleteComment = async (commentId: string) => {
    triggerHaptic('selection');
    try {
      await deleteTodoComment(commentId, user?.id);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      console.warn('Failed to delete comment:', err);
    }
  };

  if (!todo) return null;

  const hitSlop = isGloveMode
    ? { top: 14, bottom: 14, left: 14, right: 14 }
    : { top: 8, bottom: 8, left: 8, right: 8 };
  const gloveMinHeight = isGloveMode ? 54 : undefined;

  const isMarkedCompleted = localProgress >= 100 || todo.is_completed;

  const statusKey =
    status && status in STATUS_COLORS
      ? status
      : isMarkedCompleted
        ? 'completed'
        : 'active';

  const statusStyle = STATUS_COLORS[statusKey] || STATUS_COLORS.active;
  const sheetHeight = Math.min(Math.round(screenHeight * 0.90), 840);

  // Progress Bar color theme
  const getProgressColor = () => {
    if (localProgress >= 100) return '#059669'; // Emerald
    if (localProgress >= 70) return '#0D9488'; // Teal
    if (localProgress >= 35) return '#8C4522'; // Cognac
    return '#A8A29E'; // Taupe / Sand
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        Keyboard.dismiss();
        onClose();
      }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          {/* Backdrop Scrim */}
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => {
              Keyboard.dismiss();
              onClose();
            }}
            accessibilityLabel="Close task details"
          />

          {/* Modal Container Sheet (Facility Add Supply Item Pattern) */}
          <View
            style={{
              maxHeight: sheetHeight,
              backgroundColor: '#FDFBF7',
              borderTopLeftRadius: 36,
              borderTopRightRadius: 36,
              paddingTop: 10,
            }}
            className="border-t border-white/90 shadow-2xl overflow-hidden">
            {/* Grab Handle Pill */}
            <View className="mb-2 h-1.5 w-10 self-center rounded-full bg-taupe/40" />

            {/* Auto-Scrolling Input Area with ScrollView */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 4,
                paddingBottom: Math.max(insets.bottom, 16),
              }}>
              {/* Status badges */}
              <View className="mb-3 flex-row items-center gap-2 flex-wrap">
                <View className={`rounded-full border border-black/5 px-3 py-1 ${statusStyle.bg}`}>
                  <Text
                    className={`font-bold uppercase tracking-[0.15em] ${statusStyle.text}`}
                    style={{ fontSize: Math.round(11 * fontScale) }}>
                    {localProgress >= 100 ? 'Completed' : statusStyle.label}
                  </Text>
                </View>
                {farmName ? (
                  <View className="rounded-full border border-cognac/20 bg-cognac/10 px-3 py-1">
                    <Text
                      className="font-bold uppercase tracking-[0.15em] text-cognac"
                      style={{ fontSize: Math.round(11 * fontScale) }}>
                      {farmName}
                    </Text>
                  </View>
                ) : null}
                {plotNamesText ? (
                  <View className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1">
                    <Text
                      className="font-bold uppercase tracking-[0.15em] text-emerald-800"
                      style={{ fontSize: Math.round(11 * fontScale) }}>
                      {plotNamesText}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Title */}
              <Text
                className={`font-black tracking-tight ${
                  localProgress >= 100
                    ? 'text-taupe line-through'
                    : statusKey === 'late' || statusKey === 'overdue'
                      ? 'text-red-700'
                      : 'text-espresso'
                }`}
                style={{ fontSize: Math.round(23 * fontScale) }}>
                {todo.title}
              </Text>

              {/* Dates */}
              <View className="mt-3.5 flex-row gap-3">
                <View className="flex-1 rounded-2xl border border-cognac/20 bg-white/80 p-3 shadow-xs">
                  <Text
                    className="font-bold uppercase tracking-[0.2em] text-cognac"
                    style={{ fontSize: Math.round(10 * fontScale) }}>
                    Start Date
                  </Text>
                  <Text
                    className="mt-1 font-bold text-espresso"
                    style={{ fontSize: Math.round(14 * fontScale) }}>
                    {formatDateLabel(todo.start_date)}
                  </Text>
                </View>
                <View className="flex-1 rounded-2xl border border-black/5 bg-white/80 p-3 shadow-xs">
                  <Text
                    className="font-bold uppercase tracking-[0.2em] text-taupe"
                    style={{ fontSize: Math.round(10 * fontScale) }}>
                    Due Date
                  </Text>
                  <Text
                    className="mt-1 font-bold text-espresso"
                    style={{ fontSize: Math.round(14 * fontScale) }}>
                    {formatDateLabel(todo.due_date)}
                  </Text>
                </View>
              </View>

              {/* Notes */}
              {todo.notes ? (
                <View className="mt-3 rounded-2xl border border-black/5 bg-white/80 p-3.5 shadow-xs">
                  <Text
                    className="mb-1 font-bold uppercase tracking-[0.2em] text-taupe"
                    style={{ fontSize: Math.round(10 * fontScale) }}>
                    Notes
                  </Text>
                  <Text
                    className="text-espresso"
                    style={{
                      fontSize: Math.round(14 * fontScale),
                      lineHeight: Math.round(22 * fontScale),
                    }}>
                    {todo.notes}
                  </Text>
                </View>
              ) : null}

              {/* ------------------------------------------------------------- */}
              {/* SECTION: INTERACTIVE SLIDER PROGRESS                          */}
              {/* ------------------------------------------------------------- */}
              <View className="mt-5 rounded-3xl border border-black/5 bg-white/95 p-6 shadow-sm shadow-espresso/5">
                <View className="mb-3 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <SlidersHorizontal size={15} color="#8C4522" strokeWidth={2.5} />
                    <Text
                      className="font-black uppercase tracking-[0.18em] text-espresso"
                      style={{ fontSize: Math.round(11 * fontScale) }}>
                      Adjust Progress
                    </Text>
                  </View>
                  <View
                    className="rounded-full px-3 py-1"
                    style={{
                      backgroundColor: localProgress >= 100 ? '#ECFDF5' : '#FDF4EC',
                    }}>
                    <Text
                      className="font-black"
                      style={{
                        fontSize: Math.round(12 * fontScale),
                        color: getProgressColor(),
                      }}>
                      {localProgress}% {localProgress >= 100 ? '• Done' : 'In Progress'}
                    </Text>
                  </View>
                </View>

                {/* Slider Component */}
                <View className="my-2 px-1">
                  <Slider
                    style={{ width: '100%', height: 44 }}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    value={localProgress}
                    onValueChange={(val) => {
                      const rounded = Math.round(val);
                      const step = Math.floor(rounded / 10);
                      if (step !== lastHapticStepRef.current) {
                        lastHapticStepRef.current = step;
                        triggerHaptic(rounded === 100 ? 'success' : 'selection');
                      }
                      setLocalProgress(rounded);
                      localProgressRef.current = rounded;
                    }}
                    minimumTrackTintColor={getProgressColor()}
                    maximumTrackTintColor="#E2DDD5"
                    thumbTintColor={localProgress >= 100 ? '#2D6A4F' : '#8C4522'}
                  />

                  {/* Scale percentage markings */}
                  <View className="flex-row items-center justify-between px-2 mt-0.5">
                    <Text
                      className="font-bold text-taupe text-[11px]"
                      style={{ fontSize: Math.round(11 * fontScale) }}>
                      0%
                    </Text>
                    <Text
                      className="font-bold text-taupe text-[11px]"
                      style={{ fontSize: Math.round(11 * fontScale) }}>
                      50%
                    </Text>
                    <Text
                      className="font-bold text-taupe text-[11px]"
                      style={{ fontSize: Math.round(11 * fontScale) }}>
                      100%
                    </Text>
                  </View>
                </View>

                {/* Quick Step Buttons for Glove Accessibility */}
                <View className="mt-4 flex-row items-center justify-between gap-1.5">
                  {QUICK_PRESETS.map((preset) => {
                    const isSelected = localProgress === preset;
                    return (
                      <TouchableOpacity
                        key={preset}
                        onPress={() => handlePresetPress(preset)}
                        hitSlop={hitSlop}
                        style={{ minHeight: isGloveMode ? 44 : 36 }}
                        activeOpacity={0.7}
                        className={`flex-1 items-center justify-center rounded-xl py-2 border ${
                          isSelected
                            ? preset === 100
                              ? 'border-emerald-600 bg-emerald-600'
                              : 'border-cognac bg-cognac'
                            : 'border-black/5 bg-[#F5F1E9]'
                        }`}>
                        <Text
                          className={`font-bold ${
                            isSelected ? 'text-white' : 'text-espresso/75'
                          }`}
                          style={{ fontSize: Math.round(11.5 * fontScale) }}>
                          {preset === 100 ? '100% ✓' : `${preset}%`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ------------------------------------------------------------- */}
              {/* SECTION: TASK COMMENTS & FIELD COLLABORATION                  */}
              {/* ------------------------------------------------------------- */}
              <View className="mt-6 rounded-3xl border border-black/5 bg-white/95 p-6 shadow-sm shadow-espresso/5">
                <View className="mb-3.5 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <MessageSquare size={15} color="#8C4522" strokeWidth={2.5} />
                    <Text
                      className="font-black uppercase tracking-[0.18em] text-espresso"
                      style={{ fontSize: Math.round(11 * fontScale) }}>
                      Field Comments
                    </Text>
                  </View>
                  <View className="rounded-full bg-cognac/10 px-2.5 py-0.5">
                    <Text
                      className="font-bold text-cognac"
                      style={{ fontSize: Math.round(11 * fontScale) }}>
                      {comments.length}
                    </Text>
                  </View>
                </View>

                {/* Comment Feed */}
                {isLoadingComments ? (
                  <View className="py-4 items-center justify-center">
                    <ActivityIndicator size="small" color="#8C4522" />
                  </View>
                ) : comments.length === 0 ? (
                  <View className="rounded-2xl border border-dashed border-taupe/30 py-4 px-3 items-center">
                    <Text
                      className="text-center font-medium text-taupe"
                      style={{ fontSize: Math.round(12.5 * fontScale) }}>
                      No comments yet. Share task notes, measurements, or field observations below.
                    </Text>
                  </View>
                ) : (
                  <View className="gap-2.5 mb-2">
                    {comments.map((c) => {
                      const isOwn = c.user_id === user?.id;
                      const avatarSrc = c.user_profile_icon
                        ? LOCAL_AVATAR_SOURCES[c.user_profile_icon]
                        : null;

                      return (
                        <View
                          key={c.id}
                          className="rounded-2xl border border-black/5 bg-[#F9F7F2] p-3">
                          <View className="flex-row items-center justify-between mb-1">
                            <View className="flex-row items-center gap-2">
                              {/* Avatar */}
                              {avatarSrc ? (
                                <Image
                                  source={avatarSrc}
                                  className="h-6 w-6 rounded-full"
                                  resizeMode="contain"
                                />
                              ) : c.user_avatar ? (
                                <Image
                                  source={{ uri: c.user_avatar }}
                                  className="h-6 w-6 rounded-full"
                                />
                              ) : (
                                <View className="h-6 w-6 items-center justify-center rounded-full bg-cognac/20">
                                  <Text
                                    className="font-bold text-cognac text-[11px]"
                                    style={{ fontSize: Math.round(10 * fontScale) }}>
                                    {c.user_name ? c.user_name[0].toUpperCase() : 'U'}
                                  </Text>
                                </View>
                              )}

                              <Text
                                className="font-bold text-espresso"
                                style={{ fontSize: Math.round(12.5 * fontScale) }}>
                                {isOwn ? 'You' : c.user_name || 'Team Member'}
                              </Text>

                              <Text
                                className="text-taupe text-[10.5px]"
                                style={{ fontSize: Math.round(10.5 * fontScale) }}>
                                • {formatRelativeTime(c.created_at)}
                              </Text>
                            </View>

                            {/* Delete button (Author only) */}
                            {isOwn ? (
                              <TouchableOpacity
                                onPress={() => handleDeleteComment(c.id)}
                                hitSlop={hitSlop}
                                className="p-1">
                                <Trash2 size={13} color="#A8A29E" />
                              </TouchableOpacity>
                            ) : null}
                          </View>

                          <Text
                            className="text-espresso mt-0.5"
                            style={{
                              fontSize: Math.round(13.5 * fontScale),
                              lineHeight: Math.round(19 * fontScale),
                            }}>
                            {c.comment}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Comment Input Box */}
                <View className="mt-2.5 flex-row items-center gap-2 rounded-2xl border border-black/10 bg-white p-2">
                  <TextInput
                    value={commentInput}
                    onChangeText={setCommentInput}
                    placeholder="Add a field note or observation..."
                    placeholderTextColor="#A8A29E"
                    multiline={false}
                    returnKeyType="send"
                    onSubmitEditing={handleAddComment}
                    style={{
                      flex: 1,
                      fontSize: Math.round(13 * fontScale),
                      color: '#261A15',
                      paddingHorizontal: 8,
                      paddingVertical: Platform.OS === 'ios' ? 8 : 4,
                    }}
                  />
                  <TouchableOpacity
                    onPress={handleAddComment}
                    disabled={!commentInput.trim() || isSubmittingComment}
                    hitSlop={hitSlop}
                    style={{ minHeight: isGloveMode ? 44 : 36, minWidth: isGloveMode ? 44 : 36 }}
                    className={`items-center justify-center rounded-xl px-3 py-2 ${
                      commentInput.trim() && !isSubmittingComment
                        ? 'bg-cognac'
                        : 'bg-black/10'
                    }`}>
                    {isSubmittingComment ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Send
                        size={15}
                        color={commentInput.trim() ? '#FFFFFF' : '#A8A29E'}
                      />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* ------------------------------------------------------------- */}
              {/* ACTION BUTTONS                                                */}
              {/* ------------------------------------------------------------- */}
              <View className="mt-6 gap-3">
                {/* Save Progress Button */}
                <TouchableOpacity
                  onPress={handleSaveProgress}
                  activeOpacity={0.85}
                  hitSlop={hitSlop}
                  style={{ minHeight: isGloveMode ? 54 : 48 }}
                  className={`items-center justify-center rounded-2xl py-4 shadow-sm flex-row gap-2 ${
                    localProgress >= 100
                      ? 'bg-emerald-600 shadow-emerald-600/30'
                      : 'bg-cognac shadow-cognac/30'
                  }`}>
                  {localProgress >= 100 ? (
                    <Check size={18} color="#FFFFFF" strokeWidth={3} />
                  ) : (
                    <SlidersHorizontal size={16} color="#FFFFFF" strokeWidth={2.5} />
                  )}
                  <Text
                    className="font-bold text-white"
                    style={{ fontSize: Math.round(16 * fontScale) }}>
                    {localProgress >= 100 ? 'Save Progress (Completed)' : 'Save Progress'}
                  </Text>
                </TouchableOpacity>

                <View className="flex-row gap-3">
                  {/* Edit (Admin/Owner only) */}
                  {onEdit ? (
                    <TouchableOpacity
                      onPress={() => {
                        triggerHaptic('selection');
                        onClose();
                        onEdit();
                      }}
                      activeOpacity={0.85}
                      hitSlop={hitSlop}
                      style={{ minHeight: gloveMinHeight }}
                      className="flex-1 items-center justify-center rounded-2xl border border-cognac/20 bg-cognac/10 py-3.5">
                      <Text
                        className="font-bold text-cognac"
                        style={{ fontSize: Math.round(15 * fontScale) }}>
                        Edit Task
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {/* Dismiss */}
                  <TouchableOpacity
                    onPress={() => {
                      triggerHaptic('selection');
                      onClose();
                    }}
                    activeOpacity={0.85}
                    hitSlop={hitSlop}
                    style={{ minHeight: gloveMinHeight }}
                    className="flex-1 items-center justify-center rounded-2xl border border-black/10 bg-white py-3.5">
                    <Text
                      className="font-bold text-taupe"
                      style={{ fontSize: Math.round(15 * fontScale) }}>
                      Dismiss
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
