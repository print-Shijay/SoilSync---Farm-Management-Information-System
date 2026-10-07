import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { useState, useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuth } from '../../../lib/AuthContext';
import { useFocusEffect } from 'expo-router';
import { getTodosByUser, getFarmsByUser, updateTodo, deleteTodo } from '../../../lib/db-operations';
import { Trash2 } from '../../../components/Icons';
import { BackButton } from '../../../components/common/BackButton';
import { useEffectiveRole } from '../../../lib/hooks/useEffectiveRole';
import { Info, Lock } from 'lucide-react-native';

type FarmRecord = {
  id: string;
  farm_name: string;
  location?: string | null;
  area_sqm?: number | null;
};

type DatePickerField = 'startDate' | 'dueDate';

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
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

type FieldErrors = {
  title?: string;
  startDate?: string;
  dueDate?: string;
  farmId?: string;
};

export default function EditTodoScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const todayKey = toDateKey(new Date());

  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState(todayKey);
  const [dueDate, setDueDate] = useState(todayKey);
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const { permissions, loading: roleLoading } = useEffectiveRole({ farmId: selectedFarmId });

  const [datePickerField, setDatePickerField] = useState<DatePickerField | null>(null);
  const [datePickerValue, setDatePickerValue] = useState(new Date());

  const [errors, setErrors] = useState<FieldErrors>({});

  useFocusEffect(
    useCallback(() => {
      if (!user || !id) return;
      setLoading(true);
      Promise.all([getFarmsByUser(user.id), getTodosByUser(user.id)])
        .then(([farmList, todoList]) => {
          setFarms(farmList as FarmRecord[]);
          const todo = todoList.find((t) => t.id === id);
          if (todo) {
            setTitle(todo.title);
            setNotes(todo.notes || '');
            setStartDate(todo.start_date || todayKey);
            setDueDate(todo.due_date || todo.start_date || todayKey);
            setSelectedFarmId(todo.farm_id);
          }
        })
        .catch((err) => Alert.alert('Error', err.message))
        .finally(() => setLoading(false));
    }, [user, id])
  );

  function validate(): boolean {
    const newErrors: FieldErrors = {};
    if (!title.trim()) newErrors.title = 'Title is required.';
    if (!startDate) newErrors.startDate = 'Start date is required.';
    if (!dueDate) newErrors.dueDate = 'Due date is required.';
    // Farm is read-only on edit; don't block saving based on farm selection.
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  const handleSave = async () => {
    if (!user || !id) return;
    if (!permissions.canEditTasks) {
      Alert.alert(
        'Permission Denied',
        'As a team member, you cannot edit tasks. Only Admins and Owners can edit tasks.'
      );
      return;
    }
    if (!validate()) return;
    try {
      setSaving(true);
      await updateTodo(id, {
        title: title.trim(),
        notes: notes.trim() || undefined,
        startDate: startDate || null,
        dueDate: dueDate || null,
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update todo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!permissions.canDeleteTasks) {
      Alert.alert(
        'Permission Denied',
        'As a team member, you cannot delete tasks. Only Admins and Owners can delete tasks.'
      );
      return;
    }
    Alert.alert(
      'Delete Todo',
      'Are you sure you want to delete this task? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            try {
              setDeleting(true);
              await deleteTodo(id);
              router.back();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete todo.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
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
    if (event.type === 'dismissed') { setDatePickerField(null); return; }
    if (!pickedDate) return;
    setDatePickerValue(pickedDate);
    if (Platform.OS === 'android') commitDate(pickedDate);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-champagne">
        <ActivityIndicator color="#8C4522" size="large" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-champagne">
      <View className="mb-10 px-5 pb-24 pt-14">
        {/* Header */}
        <View className="mb-6 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <BackButton />
            <View>
              <Text className="text-xs font-semibold uppercase tracking-[0.3em] text-cognac">
                Task Details
              </Text>
              <Text className="text-2xl font-black text-espresso">Edit Todo</Text>
            </View>
          </View>

          {/* Delete button */}
          {permissions.canDeleteTasks ? (
            <TouchableOpacity
              onPress={handleDelete}
              disabled={deleting}
              className="h-10 w-10 items-center justify-center rounded-full border border-red-100 bg-red-50 shadow-sm active:scale-95">
              {deleting ? (
                <ActivityIndicator color="#dc2626" size="small" />
              ) : (
                <Trash2 size={18} color="#dc2626" />
              )}
            </TouchableOpacity>
          ) : (
            <View className="h-10 w-10 items-center justify-center rounded-full border border-taupe/20 bg-taupe/10">
              <Lock size={16} color="#A9927D" />
            </View>
          )}
        </View>

        <View className="rounded-[28px] border border-taupe/20 bg-white/90 p-5 shadow-sm shadow-espresso/10">
          {/* Member View-Only Notice */}
          {!permissions.canEditTasks && !roleLoading && selectedFarmId ? (
            <View className="mb-4 flex-row items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <Info size={20} color="#d97706" />
              <View className="flex-1">
                <Text className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Collaborator Mode (View Only)
                </Text>
                <Text className="mt-0.5 text-xs text-amber-800">
                  Team members can complete tasks from the farm view, but editing or deleting tasks is restricted to Farm Admins and Owners.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Title */}
          <View className="mb-4">
            <Text className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-taupe">
              Title <Text className="text-red-500">*</Text>
            </Text>
            <TextInput
              value={title}
              editable={permissions.canEditTasks}
              onChangeText={(v) => { setTitle(v); if (v.trim()) setErrors((e) => ({ ...e, title: undefined })); }}
              maxLength={255}
              placeholder="E.g. Water the seedlings"
              placeholderTextColor="#A9927D"
              className={`rounded-2xl border px-4 py-3 text-base text-espresso ${
                !permissions.canEditTasks
                  ? 'border-taupe/20 bg-stone-50 text-espresso/70'
                  : errors.title
                  ? 'border-red-400 bg-red-50'
                  : 'border-taupe/30 bg-white'
              }`}
            />
            {errors.title ? (
              <Text className="mt-1 text-xs font-semibold text-red-500">{errors.title}</Text>
            ) : null}
          </View>

          {/* Notes */}
          <View className="mb-4">
            <Text className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-taupe">
              Notes
            </Text>
            <TextInput
              value={notes}
              editable={permissions.canEditTasks}
              onChangeText={setNotes}
              maxLength={3000}
              placeholder="Optional description..."
              placeholderTextColor="#A9927D"
              multiline
              className={`min-h-[96px] rounded-2xl border px-4 py-3 text-base text-espresso ${
                !permissions.canEditTasks
                  ? 'border-taupe/20 bg-stone-50 text-espresso/70'
                  : 'border-taupe/30 bg-white'
              }`}
            />
          </View>

          {/* Dates */}
          <View className="mb-4 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-taupe">
                Start Date <Text className="text-red-500">*</Text>
              </Text>
              <TouchableOpacity
                onPress={() => openDatePicker('startDate')}
                disabled={!permissions.canEditTasks}
                className={`rounded-2xl border px-4 py-3 ${
                  !permissions.canEditTasks
                    ? 'border-taupe/20 bg-stone-50'
                    : errors.startDate
                    ? 'border-red-400 bg-red-50'
                    : 'border-taupe/30 bg-white'
                }`}>
                <Text
                  className={`text-base font-semibold ${
                    !permissions.canEditTasks ? 'text-espresso/70' : 'text-espresso'
                  }`}>
                  {startDate ? formatDateLabel(startDate) : 'Select date'}
                </Text>
              </TouchableOpacity>
              {errors.startDate ? (
                <Text className="mt-1 text-xs font-semibold text-red-500">{errors.startDate}</Text>
              ) : null}
            </View>

            <View className="flex-1">
              <Text className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-taupe">
                Due Date <Text className="text-red-500">*</Text>
              </Text>
              <TouchableOpacity
                onPress={() => openDatePicker('dueDate')}
                disabled={!permissions.canEditTasks}
                className={`rounded-2xl border px-4 py-3 ${
                  !permissions.canEditTasks
                    ? 'border-taupe/20 bg-stone-50'
                    : errors.dueDate
                    ? 'border-red-400 bg-red-50'
                    : 'border-taupe/30 bg-white'
                }`}>
                <Text
                  className={`text-base font-semibold ${
                    !permissions.canEditTasks ? 'text-espresso/70' : 'text-espresso'
                  }`}>
                  {dueDate ? formatDateLabel(dueDate) : 'Select date'}
                </Text>
              </TouchableOpacity>
              {errors.dueDate ? (
                <Text className="mt-1 text-xs font-semibold text-red-500">{errors.dueDate}</Text>
              ) : null}
            </View>
          </View>

          {/* Date picker inline */}
          {datePickerField ? (
            <View className="mb-4 rounded-2xl border border-cognac/20 bg-cognac/10 p-3">
              <Text className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-cognac">
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
                    className="flex-1 items-center justify-center rounded-2xl border border-taupe/30 bg-white py-3">
                    <Text className="text-base font-bold text-taupe">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => commitDate(datePickerValue)}
                    className="flex-1 items-center justify-center rounded-2xl bg-cognac py-3">
                    <Text className="text-base font-bold text-white">Use Date</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Farm selection (read-only info — farm cannot be changed on edit) */}
          {farms.length > 0 && selectedFarmId ? (
            <View className="mb-5 rounded-2xl border border-cognac/20 bg-cognac/10 px-4 py-3">
              <Text className="text-xs font-semibold uppercase tracking-[0.2em] text-cognac">
                Farm
              </Text>
              <Text className="mt-1 text-base font-bold text-espresso">
                {farms.find((f) => f.id === selectedFarmId)?.farm_name || 'Unknown farm'}
              </Text>
            </View>
          ) : null}

          {/* Save button / View-Only notice */}
          {permissions.canEditTasks ? (
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className="items-center justify-center rounded-2xl bg-cognac py-4 active:scale-[0.99]">
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-base font-bold text-white">Update Todo</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View className="items-center justify-center rounded-2xl bg-taupe/15 py-4">
              <Text className="text-base font-bold text-taupe">View Only (Editing Restricted)</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
