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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarDays, Pencil, Plus, Trash2 } from '../../../../components/Icons';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  LayoutGrid,
  List,
  Tag,
  User,
  X,
} from 'lucide-react-native';
import { FacilityTimeLog } from '../../../../lib/facility-operations';
import { generateUUID } from '../../../../lib/local-db';

// ─── Helpers ─────────────────────────────────────────────────────────

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

function normalizeDateKey(dateStr?: string, fallback: string = ''): string {
  if (!dateStr) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  if (dateStr.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) {
    return toDateKey(d);
  }
  return fallback;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
}

function formatShortDayLabel(dateKey: string) {
  const date = fromDateKey(dateKey);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
}

function formatDateDisplay(dateKey: string) {
  if (!dateKey) return 'Select Date';
  const d = fromDateKey(dateKey);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function formatTime12h(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strMinutes = minutes < 10 ? '0' + minutes : minutes;
  const strHours = hours < 10 ? '0' + hours : hours;
  return `${strHours}:${strMinutes} ${ampm}`;
}

function parseTimeToDecimalHour(timeStr?: string): number {
  if (!timeStr) return 8;
  const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
  if (!match) return 8;
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toUpperCase();

  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  return hour + minute / 60;
}

function parseTimeToDate(timeStr?: string, baseDateStr?: string): Date {
  const d = baseDateStr ? fromDateKey(baseDateStr) : new Date();
  if (!timeStr) {
    d.setHours(8, 0, 0, 0);
    return d;
  }
  const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
  if (!match) {
    d.setHours(8, 0, 0, 0);
    return d;
  }
  let hour = parseInt(match[1], 10);
  const min = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  d.setHours(hour, min, 0, 0);
  return d;
}

const HOURS = [
  { hour: 6, label: '06:00 AM' },
  { hour: 7, label: '07:00 AM' },
  { hour: 8, label: '08:00 AM' },
  { hour: 9, label: '09:00 AM' },
  { hour: 10, label: '10:00 AM' },
  { hour: 11, label: '11:00 AM' },
  { hour: 12, label: '12:00 PM' },
  { hour: 13, label: '01:00 PM' },
  { hour: 14, label: '02:00 PM' },
  { hour: 15, label: '03:00 PM' },
  { hour: 16, label: '04:00 PM' },
  { hour: 17, label: '05:00 PM' },
  { hour: 18, label: '06:00 PM' },
  { hour: 19, label: '07:00 PM' },
  { hour: 20, label: '08:00 PM' },
  { hour: 21, label: '09:00 PM' },
];

const START_HOUR = 6;
const SLOT_HEIGHT = 64;
const MIN_CARD_WIDTH = 190;
const MIN_CARD_HEIGHT = 110;

const PRESET_SHIFT_TYPES = [
  'Meeting',
  'Visitation',
  'Shift Duty',
  'Maintenance',
  'Harvest Packaging',
  'Inspection',
  'Training',
  'Others',
];

const STATUS_OPTIONS = [
  { key: 'scheduled', label: 'Scheduled', color: '#8C4522', bg: 'bg-cognac/10' },
  { key: 'in_progress', label: 'In Progress', color: '#D97706', bg: 'bg-amber-100' },
  { key: 'completed', label: 'Completed', color: '#047857', bg: 'bg-emerald-100' },
  { key: 'cancelled', label: 'Cancelled', color: '#8C7C70', bg: 'bg-taupe/15' },
];

interface FacilityScheduleViewProps {
  logs: FacilityTimeLog[];
  facilityName: string;
  onSaveLogs: (updatedLogs: FacilityTimeLog[]) => Promise<void>;
}

export function FacilityScheduleView({
  logs,
  facilityName,
  onSaveLogs,
}: FacilityScheduleViewProps) {
  const insets = useSafeAreaInsets();
  const todayKey = toDateKey(new Date());

  // Date selection state
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'timeline' | 'agenda'>('timeline');
  const [canvasWidth, setCanvasWidth] = useState(0);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLog, setEditingLog] = useState<FacilityTimeLog | null>(null);

  const handleCloseModal = useCallback(() => {
    Keyboard.dismiss();
    setModalVisible(false);
  }, []);

  // Form Fields
  const [formActivity, setFormActivity] = useState('');
  const [formType, setFormType] = useState('Meeting');
  const [customType, setCustomType] = useState('');
  const [formDate, setFormDate] = useState(todayKey);
  const [formStartTime, setFormStartTime] = useState('08:00 AM');
  const [formEndTime, setFormEndTime] = useState('01:00 PM');
  const [formStaffName, setFormStaffName] = useState('');
  const [formStatus, setFormStatus] = useState('scheduled');
  const [formNotes, setFormNotes] = useState('');

  // Native Date & Time Picker Pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [timePickerField, setTimePickerField] = useState<'start' | 'end' | null>(null);

  // ─── Week Days Calculation ───────────────────────────────────
  const weekDays = useMemo(() => {
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const baseDate = new Date(today);
    baseDate.setDate(today.getDate() - currentDayOfWeek + weekOffset * 7);

    const days: { dateKey: string; dayNum: number; dayLabel: string; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i);
      const k = toDateKey(d);
      days.push({
        dateKey: k,
        dayNum: d.getDate(),
        dayLabel: formatShortDayLabel(k),
        isToday: k === todayKey,
      });
    }
    return days;
  }, [weekOffset, todayKey]);

  const currentMonthLabel = useMemo(() => {
    const selDate = fromDateKey(selectedDate);
    return formatMonthLabel(selDate);
  }, [selectedDate]);

  // Events lookup by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, FacilityTimeLog[]>();
    logs.forEach((log) => {
      const k = normalizeDateKey(log.date || log.createdAt, todayKey);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(log);
    });
    return map;
  }, [logs, todayKey]);

  const selectedDateEvents = useMemo(() => {
    return eventsByDate.get(selectedDate) || [];
  }, [eventsByDate, selectedDate]);

  // ─── Continuous Proportional Shift Blocks (Option 1 - Google/Apple Calendar Style) ───
  const positionedShifts = useMemo(() => {
    if (!selectedDateEvents.length) return [];

    // 1. Calculate decimal times, top offset, and proportional height with guaranteed min height
    const items = selectedDateEvents.map((ev) => {
      const rawStart = parseTimeToDecimalHour(ev.startTime);
      const rawEnd = parseTimeToDecimalHour(ev.endTime || ev.startTime);
      const end = Math.max(rawStart + 0.5, rawEnd);
      const effectiveStart = Math.max(START_HOUR, rawStart);
      const effectiveEnd = Math.min(START_HOUR + HOURS.length, end);
      const rawDurationHours = effectiveEnd - effectiveStart;
      const rawHeight = rawDurationHours * SLOT_HEIGHT - 4;
      const height = Math.max(MIN_CARD_HEIGHT, rawHeight);
      // Visual duration to prevent shorter consecutive cards from overlapping vertically
      const visualDurationHours = Math.max(rawDurationHours, MIN_CARD_HEIGHT / SLOT_HEIGHT);
      const visualEnd = effectiveStart + visualDurationHours;

      return {
        log: ev,
        start: rawStart,
        end,
        effectiveStart,
        effectiveEnd,
        visualEnd,
        top: Math.max(0, (effectiveStart - START_HOUR) * SLOT_HEIGHT),
        height,
        column: 0,
        totalColumns: 1,
      };
    });

    // 2. Sort by start time, then duration
    items.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    // 3. Assign columns for overlapping concurrent shifts using visualEnd
    const columns: { end: number }[] = [];
    items.forEach((item) => {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        if (columns[c].end <= item.start) {
          item.column = c;
          columns[c].end = item.visualEnd;
          placed = true;
          break;
        }
      }
      if (!placed) {
        item.column = columns.length;
        columns.push({ end: item.visualEnd });
      }
    });

    // 4. Calculate column count for each cluster
    items.forEach((item) => {
      const overlaps = items.filter(
        (other) => Math.max(item.start, other.start) < Math.min(item.visualEnd, other.visualEnd)
      );
      const maxCol = Math.max(...overlaps.map((o) => o.column), 0);
      item.totalColumns = Math.max(maxCol + 1, overlaps.length);
    });

    return items;
  }, [selectedDateEvents]);

  const maxConcurrent = useMemo(() => {
    if (!positionedShifts.length) return 1;
    return Math.max(...positionedShifts.map((s) => s.totalColumns));
  }, [positionedShifts]);

  const totalBoardWidth = useMemo(() => {
    if (maxConcurrent <= 1) {
      return Math.max(canvasWidth, MIN_CARD_WIDTH);
    }
    const colW = Math.max(
      MIN_CARD_WIDTH,
      canvasWidth > 0 ? canvasWidth / maxConcurrent : MIN_CARD_WIDTH
    );
    return Math.max(canvasWidth, maxConcurrent * colW);
  }, [canvasWidth, maxConcurrent]);

  const nowTime = new Date();
  const nowDecimal = nowTime.getHours() + nowTime.getMinutes() / 60;
  const isTodaySelected = selectedDate === todayKey;
  const showCurrentTimeLine =
    isTodaySelected && nowDecimal >= START_HOUR && nowDecimal <= START_HOUR + HOURS.length;
  const currentTimeTop = (nowDecimal - START_HOUR) * SLOT_HEIGHT;

  // ─── Modal Openers ───────────────────────────────────────────
  const handleOpenAddModal = (presetHour?: number) => {
    setEditingLog(null);
    setFormActivity('');
    setFormType('Meeting');
    setCustomType('');
    setFormDate(selectedDate);

    if (presetHour !== undefined) {
      const startD = new Date();
      startD.setHours(presetHour, 0, 0, 0);
      setFormStartTime(formatTime12h(startD));

      const endD = new Date();
      endD.setHours(presetHour + 2, 0, 0, 0);
      setFormEndTime(formatTime12h(endD));
    } else {
      setFormStartTime('08:00 AM');
      setFormEndTime('01:00 PM');
    }

    setFormStaffName('');
    setFormStatus('scheduled');
    setFormNotes('');
    setModalVisible(true);
  };

  const handleOpenEditModal = (log: FacilityTimeLog) => {
    setEditingLog(log);
    setFormActivity(log.activity || '');

    // Check if type matches presets
    const rawType = (log.type as string) || '';
    const foundType = PRESET_SHIFT_TYPES.find(
      (t) => t.toLowerCase() === rawType.toLowerCase() && t !== 'Others'
    );

    if (foundType) {
      setFormType(foundType);
      setCustomType('');
    } else if (rawType) {
      setFormType('Others');
      setCustomType(rawType);
    } else {
      // Default to Meeting or first word
      setFormType('Meeting');
      setCustomType('');
    }

    setFormDate(log.date || selectedDate);
    setFormStartTime(log.startTime || '08:00 AM');
    setFormEndTime(log.endTime || '01:00 PM');
    setFormStaffName(log.staffName || '');
    setFormStatus(log.status || 'scheduled');
    setFormNotes(log.notes || '');
    setModalVisible(true);
  };

  const handleSaveLog = async () => {
    const resolvedType =
      formType === 'Others'
        ? customType.trim() || 'Custom Shift'
        : formType;

    const resolvedActivity =
      formActivity.trim() || resolvedType;

    const startDecimal = parseTimeToDecimalHour(formStartTime);
    const endDecimal = parseTimeToDecimalHour(formEndTime);

    if (endDecimal <= startDecimal) {
      Alert.alert(
        'Invalid Time Selection',
        `End time (${formEndTime}) must be after start time (${formStartTime}). Please select an end time that occurs after ${formStartTime}.`
      );
      return;
    }

    const durationHours = Math.max(0.5, Math.round((endDecimal - startDecimal) * 10) / 10);
    const nowIso = new Date().toISOString();

    // Security & Data Integrity: enforce length bounds
    const safeType = resolvedType.trim().slice(0, 255);
    const safeActivity = resolvedActivity.trim().slice(0, 255);
    const safeStaff = formStaffName.trim().slice(0, 255) || undefined;
    const safeNotes = formNotes.trim().slice(0, 3000) || undefined;

    let updatedList: FacilityTimeLog[];

    if (editingLog) {
      updatedList = logs.map((l) =>
        l.id === editingLog.id
          ? {
              ...l,
              activity: safeActivity,
              type: safeType,
              date: formDate,
              startTime: formStartTime,
              endTime: formEndTime,
              hours: durationHours,
              staffName: safeStaff,
              status: formStatus,
              notes: safeNotes,
              updatedAt: nowIso,
            }
          : l
      );
    } else {
      const newLog: FacilityTimeLog = {
        id: generateUUID(),
        activity: safeActivity,
        type: safeType,
        date: formDate,
        startTime: formStartTime,
        endTime: formEndTime,
        hours: durationHours,
        staffName: safeStaff,
        status: formStatus,
        notes: safeNotes,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      updatedList = [newLog, ...logs];
    }

    handleCloseModal();
    await onSaveLogs(updatedList);
  };

  const handleDeleteLog = (logId?: string) => {
    if (!logId) return;
    Alert.alert(
      'Delete Schedule Entry',
      'Are you sure you want to remove this scheduled shift/task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = logs.filter((l) => l.id !== logId);
            handleCloseModal();
            await onSaveLogs(updated);
          },
        },
      ]
    );
  };

  // ─── Native Date & Time Picker Handlers ───────────────────────
  const handleDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(false);
    if (event.type === 'set' && selected) {
      setFormDate(toDateKey(selected));
    }
  };

  const handleTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    const field = timePickerField;
    setTimePickerField(null);
    if (event.type === 'set' && selected) {
      const timeString = formatTime12h(selected);
      if (field === 'start') {
        const newStartDec = parseTimeToDecimalHour(timeString);
        const currentEndDec = parseTimeToDecimalHour(formEndTime);
        setFormStartTime(timeString);

        // If current end time is before or equal to the new start time, automatically advance end time
        if (currentEndDec <= newStartDec) {
          const autoEndHour = Math.min(23.75, newStartDec + 1);
          const endD = new Date(selected);
          const wholeHours = Math.floor(autoEndHour);
          const minutes = Math.round((autoEndHour - wholeHours) * 60);
          endD.setHours(wholeHours, minutes, 0, 0);
          setFormEndTime(formatTime12h(endD));
        }
      } else if (field === 'end') {
        const currentStartDec = parseTimeToDecimalHour(formStartTime);
        const newEndDec = parseTimeToDecimalHour(timeString);

        if (newEndDec <= currentStartDec) {
          Alert.alert(
            'Invalid End Time',
            `The end time must be after the start time (${formStartTime}). Please select a time after ${formStartTime}.`
          );
          return;
        }

        setFormEndTime(timeString);
      }
    }
  };

  return (
    <View className="mb-8">
      {/* ─── Top Header ─── */}
      <View className="mb-3">
        <View className="flex-row items-center gap-1.5">
          <View className="h-2 w-2 rounded-full bg-cognac" />
          <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-cognac">
            Time & Scheduling
          </Text>
        </View>
        <Text className="text-lg font-black tracking-tight text-espresso">
          {facilityName} Schedules
        </Text>
      </View>

      {/* ─── Prominent Add Schedule Button (Moved to next row, bigger, strictly 1 row) ─── */}
      <Pressable
        onPress={() => handleOpenAddModal()}
        className="mb-4 flex-row items-center justify-center gap-2 rounded-2xl bg-cognac px-4 py-3.5 shadow-sm shadow-cognac/20 active:scale-[0.98]">
        <Plus size={18} color="#FFFFFF" />
        <Text
          numberOfLines={1}
          style={{ flexShrink: 0 }}
          className="text-sm font-black text-white">
          Add New Schedule Shift
        </Text>
      </Pressable>

      {/* ─── Date Navigator & Week Strip Card ─── */}
      <View className="mb-4 overflow-hidden rounded-[28px] border border-black/[0.06] bg-white p-4 shadow-sm shadow-espresso/5">
        {/* Month Header & Controls */}
        <View className="flex-row items-center justify-between border-b border-black/[0.05] pb-3">
          <View>
            <Text className="text-sm font-black text-espresso">{currentMonthLabel}</Text>
            <Text className="text-[10px] font-medium text-taupe">
              {selectedDateEvents.length} shifts scheduled today
            </Text>
          </View>

          <View className="flex-row items-center gap-1.5">
            {/* Prev Week */}
            <Pressable
              onPress={() => setWeekOffset((prev) => prev - 1)}
              hitSlop={6}
              className="h-8 w-8 items-center justify-center rounded-xl border border-black/5 bg-champagne/40 active:scale-95">
              <ChevronLeft size={16} color="#8C7C70" />
            </Pressable>

            {/* Jump to Today Button */}
            <Pressable
              onPress={() => {
                setWeekOffset(0);
                setSelectedDate(todayKey);
              }}
              className="rounded-xl border border-cognac/20 bg-cognac/5 px-2.5 py-1.5 active:scale-95">
              <Text className="text-[10px] font-bold text-cognac">Today</Text>
            </Pressable>

            {/* Next Week */}
            <Pressable
              onPress={() => setWeekOffset((prev) => prev + 1)}
              hitSlop={6}
              className="h-8 w-8 items-center justify-center rounded-xl border border-black/5 bg-champagne/40 active:scale-95">
              <ChevronRight size={16} color="#8C7C70" />
            </Pressable>

            {/* View Mode Toggle Button (Proper Vector Icons) */}
            <Pressable
              onPress={() => setViewMode((prev) => (prev === 'timeline' ? 'agenda' : 'timeline'))}
              className="ml-1.5 flex-row items-center gap-1.5 rounded-xl border border-black/5 bg-champagne/60 px-2.5 py-1.5 active:scale-95">
              {viewMode === 'timeline' ? (
                <>
                  <List size={12} color="#1C120C" />
                  <Text className="text-[10px] font-bold text-espresso">Agenda</Text>
                </>
              ) : (
                <>
                  <LayoutGrid size={12} color="#1C120C" />
                  <Text className="text-[10px] font-bold text-espresso">Day Grid</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* Horizontal Weekday Date Strip */}
        <View className="mt-3 flex-row items-center justify-between">
          {weekDays.map((day) => {
            const isSelected = selectedDate === day.dateKey;
            const hasEvents = (eventsByDate.get(day.dateKey)?.length ?? 0) > 0;

            return (
              <Pressable
                key={day.dateKey}
                onPress={() => setSelectedDate(day.dateKey)}
                className={`flex-1 items-center py-2 rounded-2xl active:scale-95 ${
                  isSelected
                    ? 'bg-cognac shadow-sm shadow-cognac/30'
                    : day.isToday
                      ? 'border border-cognac/30 bg-cognac/5'
                      : 'bg-transparent'
                }`}>
                <Text
                  className={`text-[10px] font-bold uppercase ${
                    isSelected ? 'text-white/80' : day.isToday ? 'text-cognac' : 'text-taupe'
                  }`}>
                  {day.dayLabel}
                </Text>

                <Text
                  className={`mt-0.5 text-base font-black ${
                    isSelected ? 'text-white' : day.isToday ? 'text-cognac' : 'text-espresso'
                  }`}>
                  {day.dayNum}
                </Text>

                {/* Event Dot */}
                <View className="mt-1 h-1.5 w-1.5 items-center justify-center">
                  {hasEvents ? (
                    <View
                      className={`h-1.5 w-1.5 rounded-full ${
                        isSelected ? 'bg-white' : 'bg-cognac'
                      }`}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ─── View 1: Day Timeline Grid (Option 1: Google/Apple Calendar Continuous Time Blocks) ─── */}
      {viewMode === 'timeline' ? (
        <View className="overflow-hidden rounded-[28px] border border-black/[0.06] bg-white p-4 shadow-sm shadow-espresso/5">
          {/* Header */}
          <View className="mb-3 flex-row items-center justify-between border-b border-black/[0.05] pb-2.5">
            <View className="flex-row items-center gap-1.5">
              <Clock size={14} color="#8C4522" />
              <Text className="text-xs font-black uppercase tracking-wider text-espresso">
                Hourly Schedule · {selectedDate}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              {maxConcurrent > 1 && (
                <View className="flex-row items-center gap-1 rounded-md bg-cognac/10 px-2 py-0.5">
                  <LayoutGrid size={10} color="#8C4522" />
                  <Text className="text-[9px] font-bold text-cognac">
                    {maxConcurrent} Columns
                  </Text>
                </View>
              )}
              <Text className="text-[10px] font-semibold text-taupe">
                {positionedShifts.length === 0
                  ? 'Tap any slot to schedule'
                  : `${positionedShifts.length} ${positionedShifts.length === 1 ? 'shift' : 'shifts'} today`}
              </Text>
            </View>
          </View>

          {/* Continuous Canvas with Fixed Left Axis and Scrollable X Board */}
          <View className="flex-row" style={{ height: HOURS.length * SLOT_HEIGHT }}>
            {/* Left Column: Fixed Time Axis (Does NOT move when board scrolls horizontally) */}
            <View style={{ width: 54, flexShrink: 0 }}>
              {HOURS.map((hSlot) => (
                <View
                  key={`axis-${hSlot.hour}`}
                  style={{ height: SLOT_HEIGHT }}
                  className="justify-start pt-0.5">
                  <Text className="font-mono text-[10px] font-bold text-taupe">
                    {hSlot.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Right Column: Horizontally Scrollable Board */}
            <View
              className="flex-1 overflow-hidden"
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w > 0 && Math.abs(w - canvasWidth) > 1) {
                  setCanvasWidth(w);
                }
              }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={totalBoardWidth > canvasWidth + 4}
                nestedScrollEnabled={true}
                contentContainerStyle={{
                  width: totalBoardWidth,
                  height: HOURS.length * SLOT_HEIGHT,
                }}>
                <View
                  style={{
                    width: totalBoardWidth,
                    height: HOURS.length * SLOT_HEIGHT,
                  }}
                  className="relative border-l border-black/[0.06]">
                  {/* Background Grid Rows (Tap to Add) */}
                  {HOURS.map((hSlot) => (
                    <Pressable
                      key={`slot-bg-${hSlot.hour}`}
                      onPress={() => handleOpenAddModal(hSlot.hour)}
                      style={{ height: SLOT_HEIGHT, width: totalBoardWidth }}
                      className="border-b border-black/[0.05] justify-center px-3 active:bg-cognac/[0.04]">
                      {/* Subtle half-hour indicator line */}
                      <View
                        style={{ width: totalBoardWidth }}
                        className="border-b border-dashed border-black/[0.03] absolute left-0 right-0 top-[32px]"
                      />
                      <View className="flex-row items-center justify-end opacity-20 pr-1">
                        <Plus size={12} color="#8C7C70" />
                      </View>
                    </Pressable>
                  ))}

                  {/* Real-time Indicator Line (Today only) */}
                  {showCurrentTimeLine && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: currentTimeTop,
                        left: -5,
                        width: totalBoardWidth + 5,
                        zIndex: 30,
                      }}
                      className="flex-row items-center">
                      <View className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                      <View className="flex-1 h-[1.5px] bg-rose-500" />
                    </View>
                  )}

                  {/* Floating Continuous Shift Blocks with Minimum Dimensions */}
                  {positionedShifts.map((shift, idx) => {
                    const statusConf =
                      STATUS_OPTIONS.find((s) => s.key === shift.log.status) || STATUS_OPTIONS[0];

                    const colWidth = totalBoardWidth / shift.totalColumns;
                    const leftPos = shift.column * colWidth;

                    return (
                      <Pressable
                        key={shift.log.id || `shift-block-${idx}`}
                        onPress={() => handleOpenEditModal(shift.log)}
                        style={{
                          position: 'absolute',
                          top: shift.top,
                          height: shift.height,
                          left: leftPos,
                          width: colWidth,
                          zIndex: 10 + shift.column,
                        }}
                        className="px-1 py-0.5">
                        <View
                          className={`h-full w-full overflow-hidden rounded-2xl border p-2.5 shadow-sm active:scale-[0.99] flex-col justify-between ${
                            shift.log.status === 'completed'
                              ? 'border-emerald-700/25 bg-emerald-50/95 shadow-emerald-950/5'
                              : shift.log.status === 'in_progress'
                              ? 'border-amber-600/30 bg-amber-50/95 shadow-amber-950/5'
                              : 'border-cognac/30 bg-[#FBF7F4] shadow-cognac/10'
                          }`}>
                          {/* Status color vertical accent strip */}
                          <View
                            style={{ backgroundColor: statusConf.color }}
                            className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl"
                          />

                          {/* Top / Main Event Content */}
                          <View className="pl-1.5 flex-1 justify-start">
                            {/* Row 1: Event Type (left) & Status Badge (right) in the SAME row */}
                            <View className="flex-row items-center justify-between gap-1">
                              {shift.log.type ? (
                                <View className="rounded-md bg-black/5 px-1.5 py-0.5 max-w-[65%]">
                                  <Text
                                    numberOfLines={1}
                                    className="text-[9px] font-black text-espresso">
                                    {shift.log.type}
                                  </Text>
                                </View>
                              ) : (
                                <View />
                              )}

                              {/* Status badge */}
                              <View className={`rounded-md px-1.5 py-0.5 ${statusConf.bg}`}>
                                <Text
                                  numberOfLines={1}
                                  className="text-[8px] font-black uppercase tracking-wider"
                                  style={{ color: statusConf.color }}>
                                  {statusConf.label}
                                </Text>
                              </View>
                            </View>

                            {/* Row 2: Time Range Fully Shown on Dedicated Row */}
                            <View className="mt-1 flex-row items-center gap-1">
                              <Clock size={10} color="#8C4522" />
                              <Text
                                numberOfLines={1}
                                className="text-[10px] font-black text-cognac">
                                {shift.log.startTime}{shift.log.endTime ? ` – ${shift.log.endTime}` : ''}
                              </Text>
                            </View>

                            {/* Row 3: Activity Title */}
                            <Text
                              numberOfLines={shift.height >= 130 ? 2 : 1}
                              className="mt-1 text-xs font-black text-espresso">
                              {shift.log.activity || shift.log.type || 'Scheduled Shift'}
                            </Text>
                          </View>

                          {/* Bottom Metadata: Staff & Duration */}
                          <View className="pl-1.5 mt-1 border-t border-black/[0.04] pt-1.5">
                            <View className="flex-row items-center justify-between">
                              <View className="flex-row items-center gap-1 flex-1 pr-1">
                                <User size={10} color="#8C7C70" />
                                <Text
                                  numberOfLines={1}
                                  className="text-[10px] font-semibold text-espresso">
                                  {shift.log.staffName || 'Assigned Staff'}
                                </Text>
                              </View>

                              {shift.log.hours ? (
                                <View className="rounded-md bg-cognac/10 px-1.5 py-0.5">
                                  <Text className="text-[9px] font-black text-cognac">
                                    {shift.log.hours} hrs
                                  </Text>
                                </View>
                              ) : null}
                            </View>

                            {shift.height >= 135 && shift.log.notes ? (
                              <View className="mt-1 flex-row items-center gap-1">
                                <FileText size={9} color="#8C7C70" />
                                <Text
                                  numberOfLines={2}
                                  className="flex-1 text-[9px] font-medium text-taupe leading-tight">
                                  {shift.log.notes}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      ) : (
        /* ─── View 2: Agenda View ─── */
        <View className="overflow-hidden rounded-[28px] border border-black/[0.06] bg-white p-4 shadow-sm shadow-espresso/5">
          <View className="mb-3 flex-row items-center justify-between border-b border-black/[0.05] pb-2.5">
            <View className="flex-row items-center gap-1.5">
              <CalendarDays size={14} color="#8C4522" />
              <Text className="text-xs font-black uppercase tracking-wider text-espresso">
                All Scheduled Facility Shifts ({logs.length})
              </Text>
            </View>
          </View>

          {logs.length === 0 ? (
            <View className="items-center justify-center py-8">
              <Text className="text-xs font-bold text-taupe">No scheduled shifts or tasks recorded.</Text>
              <Pressable
                onPress={() => handleOpenAddModal()}
                className="mt-3 rounded-xl bg-cognac px-3.5 py-1.5 active:scale-95">
                <Text className="text-xs font-bold text-white">Add First Schedule</Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-2.5">
              {logs.map((log, idx) => {
                const statusConf =
                  STATUS_OPTIONS.find((s) => s.key === log.status) || STATUS_OPTIONS[0];

                return (
                  <Pressable
                    key={log.id || `agenda-${idx}`}
                    onPress={() => handleOpenEditModal(log)}
                    className="rounded-2xl border border-black/[0.04] bg-champagne/30 p-3.5 active:scale-[0.99]">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-2">
                        <View className="flex-row items-center gap-1.5">
                          {log.type ? (
                            <View className="rounded-md bg-cognac/15 px-1.5 py-0.5">
                              <Text className="text-[9px] font-bold text-cognac">{log.type}</Text>
                            </View>
                          ) : null}
                          <Text className="text-sm font-bold text-espresso">{log.activity}</Text>
                        </View>

                        <View className="mt-1 flex-row items-center gap-3">
                          <View className="flex-row items-center gap-1">
                            <Calendar size={11} color="#8C4522" />
                            <Text className="text-[11px] font-semibold text-cognac">
                              {log.date || 'Active'}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Clock size={11} color="#8C7C70" />
                            <Text className="text-[11px] text-taupe">
                              {log.startTime || '08:00 AM'}
                              {log.endTime ? ` – ${log.endTime}` : ''}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View className={`rounded-lg px-2 py-0.5 ${statusConf.bg}`}>
                        <Text
                          className="text-[9px] font-extrabold uppercase"
                          style={{ color: statusConf.color }}>
                          {statusConf.label}
                        </Text>
                      </View>
                    </View>

                    <View className="mt-2.5 flex-row items-center justify-between border-t border-black/[0.04] pt-2">
                      <View className="flex-row items-center gap-1.5">
                        <User size={12} color="#8C7C70" />
                        <Text className="text-xs font-medium text-taupe">
                          {log.staffName || 'Unassigned'}
                        </Text>
                      </View>

                      {log.hours !== undefined ? (
                        <Text className="text-xs font-black text-espresso">{log.hours} hrs</Text>
                      ) : null}
                    </View>

                    {log.notes ? (
                      <Text className="mt-1 text-[11px] text-taupe">Note: {log.notes}</Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* ─── Add / Edit Schedule Modal (Apple-styled Bottom Sheet) ─── */}
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

              {/* Header */}
              <View className="flex-row items-center justify-between border-b border-black/5 pb-3">
                <View>
                  <Text className="text-base font-black text-espresso">
                    {editingLog ? 'Edit Facility Schedule' : 'New Schedule Shift'}
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

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 12, paddingBottom: 24 }}>
              {/* Shift / Event Type with Choices + Others */}
              <View className="mb-3.5">
                <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                  Event / Shift Type *
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row items-center gap-1.5">
                    {PRESET_SHIFT_TYPES.map((t) => {
                      const sel = formType.toLowerCase() === t.toLowerCase();
                      return (
                        <Pressable
                          key={t}
                          onPress={() => setFormType(t)}
                          style={{ flexShrink: 0 }}
                          className={`rounded-xl px-3 py-1.5 active:scale-95 ${
                            sel ? 'bg-cognac' : 'border border-black/10 bg-champagne/40'
                          }`}>
                          <Text
                            numberOfLines={1}
                            style={{ flexShrink: 0 }}
                            className={`text-xs font-bold ${
                              sel ? 'text-white' : 'text-espresso'
                            }`}>
                            {t}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                {/* Others custom type input */}
                {formType === 'Others' && (
                  <View className="mt-2">
                    <TextInput
                      value={customType}
                      onChangeText={setCustomType}
                      maxLength={255}
                      placeholder="Type custom event type (e.g. Soil Testing, School Tour)..."
                      placeholderTextColor="#8C7C70"
                      className="rounded-xl border border-cognac/30 bg-cognac/5 px-3 py-2 text-xs font-bold text-espresso"
                    />
                  </View>
                )}
              </View>

              {/* Activity / Title Description */}
              <View className="mb-3.5">
                <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                  Task / Activity Title (Optional)
                </Text>
                <TextInput
                  value={formActivity}
                  onChangeText={setFormActivity}
                  maxLength={255}
                  placeholder={`e.g. ${formType !== 'Others' ? formType : 'Shift'} Details / Subject`}
                  placeholderTextColor="#8C7C70"
                  className="rounded-xl border border-black/10 bg-champagne/30 px-3 py-2.5 text-sm font-bold text-espresso"
                />
              </View>

              {/* Schedule Date Selection */}
              <View className="mb-3.5">
                <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                  Schedule Date
                </Text>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowDatePicker(true);
                  }}
                  className="flex-row items-center justify-between rounded-xl border border-black/10 bg-champagne/40 px-3.5 py-3 active:bg-champagne/70">
                  <View className="flex-row items-center gap-2">
                    <Calendar size={16} color="#8C4522" />
                    <Text className="text-sm font-bold text-espresso">
                      {formatDateDisplay(formDate)}
                    </Text>
                  </View>
                  <Text className="text-xs font-bold text-cognac">Pick Date</Text>
                </Pressable>
              </View>

              {/* Clock Time Selection: Start Time & End Time */}
              <View className="mb-3.5">
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                      Start Time
                    </Text>
                    <Pressable
                      onPress={() => {
                        Keyboard.dismiss();
                        setTimePickerField('start');
                      }}
                      className="flex-row items-center justify-between rounded-xl border border-black/10 bg-champagne/40 px-3 py-2.5 active:bg-champagne/70">
                      <View className="flex-row items-center gap-1.5">
                        <Clock size={15} color="#8C4522" />
                        <Text className="text-xs font-black text-espresso">
                          {formStartTime}
                        </Text>
                      </View>
                      <Text className="text-[10px] font-bold text-cognac">Clock</Text>
                    </Pressable>
                  </View>

                  <View className="flex-1">
                    <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                      End Time
                    </Text>
                    <Pressable
                      onPress={() => {
                        Keyboard.dismiss();
                        setTimePickerField('end');
                      }}
                      className="flex-row items-center justify-between rounded-xl border border-black/10 bg-champagne/40 px-3 py-2.5 active:bg-champagne/70">
                      <View className="flex-row items-center gap-1.5">
                        <Clock size={15} color="#8C4522" />
                        <Text className="text-xs font-black text-espresso">
                          {formEndTime}
                        </Text>
                      </View>
                      <Text className="text-[10px] font-bold text-cognac">Clock</Text>
                    </Pressable>
                  </View>
                </View>

                {parseTimeToDecimalHour(formEndTime) <= parseTimeToDecimalHour(formStartTime) && (
                  <View className="mt-1.5 flex-row items-center gap-1">
                    <Text className="text-[10px] font-bold text-rose-600">
                      ⚠️ End time must be after start time ({formStartTime})
                    </Text>
                  </View>
                )}
              </View>

              {/* Staff / Worker Name */}
              <View className="mb-3.5">
                <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                  Assigned Worker / Staff
                </Text>
                <TextInput
                  value={formStaffName}
                  onChangeText={setFormStaffName}
                  maxLength={255}
                  placeholder="e.g. Juan Cruz"
                  placeholderTextColor="#8C7C70"
                  className="rounded-xl border border-black/10 bg-champagne/30 px-3 py-2.5 text-sm font-bold text-espresso"
                />
              </View>

              {/* Status */}
              <View className="mb-3.5">
                <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                  Status
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {STATUS_OPTIONS.map((st) => {
                    const sel = formStatus === st.key;
                    return (
                      <Pressable
                        key={st.key}
                        onPress={() => setFormStatus(st.key)}
                        className={`rounded-xl px-3 py-1.5 active:scale-95 ${
                          sel ? 'bg-cognac' : 'border border-black/10 bg-champagne/40'
                        }`}>
                        <Text
                          className={`text-xs font-bold ${
                            sel ? 'text-white' : 'text-espresso'
                          }`}>
                          {st.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Notes */}
              <View className="mb-2">
                <Text className="mb-1.5 text-xs font-black uppercase tracking-wider text-taupe">
                  Instructions / Shift Notes
                </Text>
                <TextInput
                  value={formNotes}
                  onChangeText={setFormNotes}
                  multiline
                  numberOfLines={3}
                  maxLength={3000}
                  placeholder="e.g. Agenda items, safety precautions, shift handover"
                  placeholderTextColor="#8C7C70"
                  style={{ minHeight: 70 }}
                  className="rounded-xl border border-black/10 bg-champagne/30 p-3 text-xs font-medium text-espresso"
                />
              </View>
            </ScrollView>

            {/* Actions */}
            <View className="flex-row items-center gap-3 border-t border-black/5 pt-3">
              {editingLog ? (
                <Pressable
                  onPress={() => handleDeleteLog(editingLog.id)}
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
                onPress={handleSaveLog}
                className="flex-1 rounded-2xl bg-cognac py-3 active:scale-95">
                <Text className="text-center text-xs font-bold text-white">
                  {editingLog ? 'Save Changes' : 'Schedule Shift'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      </Modal>

      {/* ─── Date Picker Native Dialog ─── */}
      {showDatePicker && (
        <DateTimePicker
          value={fromDateKey(formDate)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
        />
      )}

      {/* ─── Time / Clock Picker Native Dialog ─── */}
      {timePickerField && (
        <DateTimePicker
          value={parseTimeToDate(
            timePickerField === 'start' ? formStartTime : formEndTime,
            formDate
          )}
          minimumDate={
            timePickerField === 'end'
              ? parseTimeToDate(formStartTime, formDate)
              : undefined
          }
          mode="time"
          is24Hour={false}
          display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
          onChange={handleTimeChange}
        />
      )}
    </View>
  );
}
