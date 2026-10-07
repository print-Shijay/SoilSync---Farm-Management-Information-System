import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { Plus } from 'lucide-react-native';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useFocusEffect, router } from 'expo-router';
import {
  getFarmsByUser,
  getTodosByUser,
  batchUpdateTodosCompletion,
  batchUpdateTodosProgress,
  deleteTodo,
  getAllGardenStructures,
  FarmRecord,
  TodoRecord,
  TodoItem,
} from '../../lib/db-operations';
import { groupTodosForUI, FarmGroup, PlotGroup, TaskGroup, isCheckUpTask } from '../../lib/todo-grouping';
import { MonthCalendar } from '../../components/homePage/MonthCalendar';
import { TodoItemCard } from '../../components/homePage/TodoItemCard';
import { TodoDetailModal } from '../../components/homePage/TodoDetailModal';
import { TodoItemsSkeletonList } from '../../components/skeleton';
import { powersync } from '../../lib/powersync';
import { useDataSyncReady } from '../../lib/hooks/useDataSyncReady';

import { useAccessibility } from '../../lib/accessibility';
import {
  getEffectiveFarmRole,
  calculatePermissions,
  EffectivePermissions,
} from '../../lib/team-operations';

// ─── Helpers ───────────────────────────────────────────────────────────────

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

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
}

function formatDateLabel(dateKey: string) {
  const date = fromDateKey(dateKey);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(monthAnchor: Date) {
  const firstDay = startOfMonth(monthAnchor);
  const daysInMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate();
  const blanksBefore = firstDay.getDay();

  type CalendarCell = { dateKey: string; label: string; currentMonth: boolean; key: string };
  const cells: (CalendarCell | null)[] = [];

  for (let i = 0; i < blanksBefore; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), day);
    const dateKey = toDateKey(date);
    cells.push({ dateKey, label: String(day), currentMonth: true, key: dateKey });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isOnOrAfter(left: string, right: string) {
  return left >= right;
}
function isOnOrBefore(left: string, right: string) {
  return left <= right;
}

function getTodoScopeStatus(
  todo: TodoRecord | TodoItem,
  selectedDateKey: string,
  todayDateKey: string
) {
  const startDateKey = todo.start_date || todo.due_date || todo.created_at.slice(0, 10);
  const dueDateKey = todo.due_date || startDateKey;

  if (!isOnOrAfter(selectedDateKey, startDateKey)) return 'hidden';
  if (todo.is_completed) return isOnOrBefore(selectedDateKey, dueDateKey) ? 'completed' : 'hidden';
  if (selectedDateKey > dueDateKey) return selectedDateKey === todayDateKey ? 'late' : 'hidden';
  return 'active';
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { user } = useAuth();
  const { isGloveMode, isHighContrast, fontScale, triggerHaptic } = useAccessibility();
  const todayKey = toDateKey(new Date());

  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);

  const [activeFarmId, setActiveFarmId] = useState<string | null>(null); // null = all farms
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
  const [modalTodoGroup, setModalTodoGroup] = useState<{ todos: TodoItem[] } | null>(null);
  const modalGroupTodoIds = useMemo(
    () => (modalTodoGroup ? modalTodoGroup.todos.map((t) => t.id) : undefined),
    [modalTodoGroup]
  );
  const [gardenStructures, setGardenStructures] = useState<any[]>([]);
  const [hideOverdue, setHideOverdue] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [farmPermissions, setFarmPermissions] = useState<Record<string, EffectivePermissions>>({});
  const ITEMS_PER_PAGE = 5;

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [userFarms, userTodos, structures] = await Promise.all([
        getFarmsByUser(user.id),
        getTodosByUser(user.id),
        getAllGardenStructures(),
      ]);
      setFarms(userFarms as FarmRecord[]);
      setTodos(userTodos as TodoItem[]);
      setGardenStructures(structures);

      // Compute farm role permissions
      const permsMap: Record<string, EffectivePermissions> = {};
      await Promise.all(
        (userFarms as FarmRecord[]).map(async (f) => {
          const role = await getEffectiveFarmRole(f.id, user.id);
          permsMap[f.id] = calculatePermissions(role);
        })
      );
      setFarmPermissions(permsMap);
    } catch (error) {
      console.error('Error loading calendar data:', error);
    }
  }, [user]);

  const { isDataReady } = useDataSyncReady({
    onSyncComplete: loadData,
  });

  const showSkeleton = !isDataReady && todos.length === 0 && farms.length === 0;

  useFocusEffect(
    useCallback(() => {
      if (user) void loadData();
    }, [user, loadData])
  );

  // Watch for live PowerSync changes to todos & farms
  useEffect(() => {
    if (!user) return;
    const currentUserId = user.id;
    void loadData();

    const abortController = new AbortController();
    async function watchTodos() {
      try {
        for await (const _update of powersync.watch(
          'SELECT id FROM todos WHERE user_id = ? UNION ALL SELECT id FROM farms WHERE user_id = ?',
          [currentUserId, currentUserId],
          { signal: abortController.signal }
        )) {
          void loadData();
        }
      } catch (err) {
        // abort handled silently
      }
    }

    watchTodos();

    return () => {
      abortController.abort();
    };
  }, [user, loadData]);

  const farmsById = farms.reduce<Record<string, FarmRecord>>((acc, farm) => {
    acc[farm.id] = farm;
    return acc;
  }, {});

  const calendarDays = buildCalendarDays(calendarMonth);

  const visibleTodos = todos.filter((todo) => {
    if (activeFarmId && todo.farm_id !== activeFarmId) return false;
    const status = getTodoScopeStatus(todo, selectedDate, todayKey);
    if (status === 'hidden') return false;
    if (hideOverdue && status === 'late') return false;
    return true;
  });

  const totalPages = Math.ceil(visibleTodos.length / ITEMS_PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedTodos = visibleTodos.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  );

  const groupedTodosData = useMemo(() => {
    return groupTodosForUI(paginatedTodos as TodoItem[], gardenStructures, farmsById as any);
  }, [paginatedTodos, gardenStructures, farmsById]);

  const handleSelectDate = (dateKey: string) => {
    setSelectedDate(dateKey);
    const selectedMonth = startOfMonth(fromDateKey(dateKey));
    if (selectedMonth.getTime() !== calendarMonth.getTime()) {
      setCalendarMonth(selectedMonth);
    }
    setCurrentPage(1);
  };

  const toggleTodosComplete = async (todosToToggle: TodoItem[]) => {
    const allCompleted = todosToToggle.every((t) => t.is_completed);
    const newCompleted = !allCompleted;
    const todoIds = todosToToggle.map((t) => t.id);
    const todoIdSet = new Set(todoIds);

    setTodos((prev) =>
      prev.map((t) =>
        todoIdSet.has(t.id)
          ? { ...t, is_completed: newCompleted, progress: newCompleted ? 100 : 0 }
          : t
      )
    );
    setModalTodoGroup((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        todos: prev.todos.map((t) =>
          todoIdSet.has(t.id)
            ? { ...t, is_completed: newCompleted, progress: newCompleted ? 100 : 0 }
            : t
        ),
      };
    });

    try {
      await batchUpdateTodosCompletion({
        todoIds,
        isCompleted: newCompleted,
        userId: user?.id,
      });
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update tasks.');
      await loadData();
    }
  };

  const handleUpdateTodoGroupProgress = async (todosToUpdate: TodoItem[], newProgress: number) => {
    const isCompleted = newProgress >= 100;
    const todoIds = todosToUpdate.map((t) => t.id);
    const todoIdSet = new Set(todoIds);

    setTodos((prev) =>
      prev.map((t) =>
        todoIdSet.has(t.id) ? { ...t, progress: newProgress, is_completed: isCompleted } : t
      )
    );
    setModalTodoGroup((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        todos: prev.todos.map((t) =>
          todoIdSet.has(t.id) ? { ...t, progress: newProgress, is_completed: isCompleted } : t
        ),
      };
    });

    try {
      await batchUpdateTodosProgress({
        todoIds,
        progress: newProgress,
        userId: user?.id,
      });
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update task progress.');
      await loadData();
    }
  };

  const handleDeleteTodo = (todo: TodoRecord) => {
    if (
      todo.farm_id &&
      farmPermissions[todo.farm_id] &&
      !farmPermissions[todo.farm_id].canDeleteTasks
    ) {
      Alert.alert(
        'Permission Denied',
        'As a team member, you cannot delete tasks. Only Admins and Owners can delete tasks.'
      );
      return;
    }
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${todo.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTodo(todo.id);
              await loadData();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete todo.');
            }
          },
        },
      ]
    );
  };

  const handleEditTodo = (todo: TodoItem | TodoRecord) => {
    if (
      todo.farm_id &&
      farmPermissions[todo.farm_id] &&
      !farmPermissions[todo.farm_id].canEditTasks
    ) {
      Alert.alert(
        'Permission Denied',
        'As a team member, you cannot edit tasks. Only Admins and Owners can edit tasks.'
      );
      return;
    }
    router.push(`/todo/edit/${todo.id}`);
  };

  const handleAddTodo = () => {
    const params: Record<string, string> = { date: selectedDate };
    if (activeFarmId) params.farmId = activeFarmId;
    router.push({ pathname: '/todo/add', params });
  };

  return (
    <View className="flex-1 bg-champagne">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="mb-10 px-5 pb-28 pt-14">
          {/* Header */}
          <View className="mb-5">
            <View className="flex-row items-center justify-between">
              <View className="mr-4 flex-1">
                <Text
                  style={{ fontSize: 28 * fontScale }}
                  className={`tracking-tight ${
                    isHighContrast ? 'font-black text-black' : 'font-black text-espresso'
                  }`}>
                  Calendar
                </Text>
                <View className="mt-0.5 flex-row items-center gap-1.5">
                  <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#729E3B' }} />
                  <Text
                    style={{ fontSize: 11 * fontScale }}
                    className={`font-extrabold uppercase tracking-[0.25em] ${
                      isHighContrast ? 'text-black font-black' : 'text-taupe'
                    }`}>
                    Task Timeline
                  </Text>
                </View>
              </View>

              {/* Add Todo button */}
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic('light');
                  handleAddTodo();
                }}
                activeOpacity={0.85}
                style={isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : undefined}
                className={`flex-row items-center justify-center rounded-full bg-cognac shadow-sm shadow-cognac/30 active:scale-95 ${
                  isGloveMode ? 'min-h-[48px] px-5 py-3' : 'px-4 py-2.5'
                }`}>
                <Plus size={isGloveMode ? 18 : 15} color="#ffffff" strokeWidth={2.5} style={{ marginRight: 6 }} />
                <Text
                  numberOfLines={1}
                  style={{ fontSize: Math.round(13 * fontScale) }}
                  className="font-black text-white">
                  Add Task
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Farm Filter — horizontal scrollable pill list */}
          <View className="mb-3">
            <FlatList
              data={[{ id: null as string | null, farm_name: 'All Farms' }, ...farms]}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, index) => item.id ?? `all-${index}`}
              contentContainerStyle={{ paddingRight: 20, alignItems: 'center' }}
              renderItem={({ item }) => {
                const isActive = activeFarmId === item.id;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      triggerHaptic('selection');
                      setActiveFarmId(item.id);
                      setCurrentPage(1);
                    }}
                    activeOpacity={0.85}
                    style={
                      isHighContrast
                        ? {
                            borderWidth: 2,
                            borderColor: isActive ? '#000000' : '#444444',
                            backgroundColor: isActive ? '#000000' : '#FFFFFF',
                          }
                        : undefined
                    }
                    className={`mr-2 flex-row items-center justify-center rounded-full border active:scale-95 ${
                      isGloveMode ? 'min-h-[44px] px-4 py-2.5' : 'px-4 py-2'
                    } ${
                      isHighContrast
                        ? ''
                        : isActive
                        ? 'border-cognac/25 bg-white shadow-xs shadow-cognac/10'
                        : 'border-black/5 bg-white/70'
                    }`}>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 12 * fontScale }}
                      className={
                        isHighContrast
                          ? isActive ? 'font-black text-white' : 'font-bold text-black'
                          : isActive ? 'font-black text-cognac' : 'font-bold text-taupe'
                      }>
                      {item.farm_name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          {/* Calendar */}
          <MonthCalendar
            monthLabel={formatMonthLabel(calendarMonth)}
            cells={calendarDays}
            selectedDateKey={selectedDate}
            todayDateKey={todayKey}
            onPrevMonth={() => setCalendarMonth((m) => addMonths(m, -1))}
            onNextMonth={() => setCalendarMonth((m) => addMonths(m, 1))}
            onSelectDate={handleSelectDate}
          />

          {/* Selected date task list */}
          <View className="mt-5">
            <View className="mb-4">
              {/* Date Header Row */}
              <View>
                <Text
                  style={{ fontSize: 11 * fontScale }}
                  className={`font-bold uppercase tracking-[0.25em] ${
                    isHighContrast ? 'text-black font-black' : 'text-cognac'
                  }`}>
                  Tasks for
                </Text>
                <Text
                  style={{ fontSize: 20 * fontScale }}
                  className={`mt-0.5 tracking-tight ${
                    isHighContrast ? 'font-black text-black' : 'font-black text-espresso'
                  }`}>
                  {formatDateLabel(selectedDate)}
                </Text>
              </View>

              {/* Controls Row (Below the Date) */}
              <View className="mt-3 flex-row items-center justify-between">
                <View
                  style={isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : undefined}
                  className={`flex-row items-center rounded-full border border-cognac/15 bg-white shadow-sm shadow-cognac/5 ${
                    isGloveMode ? 'px-3.5 py-2' : 'px-3 py-1.5'
                  }`}>
                  <Text
                    style={{ fontSize: 12 * fontScale }}
                    className={`mr-2 font-bold ${isHighContrast ? 'text-black font-black' : 'text-espresso'}`}>
                    Hide Overdue
                  </Text>
                  <Switch
                    value={hideOverdue}
                    onValueChange={(val) => {
                      triggerHaptic('selection');
                      setHideOverdue(val);
                    }}
                    trackColor={{ false: '#e5e5e5', true: '#8C4522' }}
                    thumbColor={'#fff'}
                    style={{ transform: [{ scaleX: isGloveMode ? 0.95 : 0.8 }, { scaleY: isGloveMode ? 0.95 : 0.8 }] }}
                  />
                </View>
                <View
                  style={isHighContrast ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}
                  className={`rounded-full border border-cognac/25 bg-cognac/10 ${
                    isGloveMode ? 'px-3 py-1.5' : 'px-2.5 py-1'
                  }`}>
                  <Text
                    style={{ fontSize: 12 * fontScale }}
                    className={`font-black ${isHighContrast ? 'text-black' : 'text-cognac'}`}>
                    {showSkeleton ? '—' : visibleTodos.length}
                  </Text>
                </View>
              </View>
            </View>

            {showSkeleton ? (
              <TodoItemsSkeletonList count={3} />
            ) : visibleTodos.length > 0 ? (
              groupedTodosData.farmGroups.map((farmGroup: FarmGroup) => (
                <View key={farmGroup.farmId} className="mb-4">
                  {!activeFarmId && (
                    <Text
                      style={{ fontSize: 13 * fontScale }}
                      className={`mb-2 font-bold uppercase tracking-widest ${
                        isHighContrast ? 'text-black font-black' : 'text-cognac'
                      }`}>
                      {farmGroup.farmName}
                    </Text>
                  )}

                  {farmGroup.plotGroups.map((plotGroup: PlotGroup) => (
                    <View key={plotGroup.comboKey} className="mb-3">
                      <Text
                        style={{ fontSize: 12 * fontScale }}
                        className={`mb-2 ml-1 font-bold uppercase tracking-widest ${
                          isHighContrast ? 'text-black font-black' : 'text-taupe'
                        }`}>
                        Plot: {plotGroup.plotNamesText}
                      </Text>

                      {plotGroup.taskGroups.map((taskGroup: TaskGroup) => {
                        const todo = taskGroup.todos[0] as TodoItem;
                        const todoStatus = getTodoScopeStatus(todo, selectedDate, todayKey);
                        if (todoStatus === 'hidden') return null;

                        const isCheckUpFarm = isCheckUpTask(todo.title);
                        const handleCheckUpOpen = () => {
                          router.push({
                            pathname: '/farm/[id]',
                            params: {
                              id: todo.farm_id,
                              openCheckUp: taskGroup.todos.map((t: TodoItem) => t.id),
                            },
                          });
                        };

                        return (
                          <TodoItemCard
                            key={todo.id}
                            todo={todo}
                            status={todoStatus as 'active' | 'completed' | 'late'}
                            showFarmName={false}
                            onToggleComplete={
                              isCheckUpFarm
                                ? handleCheckUpOpen
                                : () => toggleTodosComplete(taskGroup.todos as TodoItem[])
                            }
                            onEdit={
                              farmPermissions[todo.farm_id]?.canEditTasks !== false
                                ? () => handleEditTodo(todo)
                                : undefined
                            }
                            onPress={
                              isCheckUpFarm
                                ? handleCheckUpOpen
                                : () => setModalTodoGroup({ todos: taskGroup.todos as TodoItem[] })
                            }
                          />
                        );
                      })}
                    </View>
                  ))}

                  {farmGroup.generalTodos.length > 0 && (
                    <View className="mb-3">
                      {farmGroup.generalTodos.map((todo: TodoItem) => {
                        const todoStatus = getTodoScopeStatus(todo, selectedDate, todayKey);
                        if (todoStatus === 'hidden') return null;

                        const isCheckUpFarm = isCheckUpTask(todo.title);
                        const handleCheckUpOpen = () => {
                          router.push({
                            pathname: '/farm/[id]',
                            params: { id: todo.farm_id, openCheckUp: [todo.id] },
                          });
                        };

                        return (
                          <TodoItemCard
                            key={todo.id}
                            todo={todo}
                            status={todoStatus as 'active' | 'completed' | 'late'}
                            showFarmName={false}
                            onToggleComplete={
                              isCheckUpFarm ? handleCheckUpOpen : () => toggleTodosComplete([todo])
                            }
                            onEdit={
                              farmPermissions[todo.farm_id]?.canEditTasks !== false
                                ? () => handleEditTodo(todo)
                                : undefined
                            }
                            onPress={
                              isCheckUpFarm
                                ? handleCheckUpOpen
                                : () => setModalTodoGroup({ todos: [todo] })
                            }
                          />
                        );
                      })}
                    </View>
                  )}
                </View>
              ))
            ) : (
              <View
                style={isHighContrast ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' } : undefined}
                className="rounded-[32px] border border-dashed border-cognac/25 bg-white/60 p-8">
                <Text
                  style={{ fontSize: 16 * fontScale }}
                  className={`text-center font-bold ${isHighContrast ? 'text-black font-black' : 'text-espresso'}`}>
                  No tasks for this day
                </Text>
                <Text
                  style={{ fontSize: 14 * fontScale }}
                  className={`mt-2 text-center leading-6 ${isHighContrast ? 'text-black/80 font-medium' : 'text-taupe'}`}>
                  Tap &quot;+ Add Task&quot; above to schedule a task for this date.
                </Text>
              </View>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <View className="mt-4 flex-row items-center justify-between border-t border-black/5 pt-4">
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic('light');
                    setCurrentPage((p) => Math.max(1, p - 1));
                  }}
                  disabled={safePage === 1}
                  style={isHighContrast && safePage !== 1 ? { borderWidth: 2, borderColor: '#000000' } : undefined}
                  className={`rounded-full active:scale-95 ${
                    isGloveMode ? 'min-h-[48px] px-5 py-3' : 'px-4 py-2'
                  } ${
                    safePage === 1 ? 'bg-black/5' : 'bg-cognac shadow-xs shadow-cognac/20'
                  }`}>
                  <Text
                    style={{ fontSize: 12 * fontScale }}
                    className={`font-bold ${safePage === 1 ? 'text-taupe' : 'text-white'}`}>
                    Previous
                  </Text>
                </TouchableOpacity>

                <Text
                  style={{ fontSize: 12 * fontScale }}
                  className={`font-bold ${isHighContrast ? 'text-black font-black' : 'text-cognac'}`}>
                  Page {safePage} of {totalPages}
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic('light');
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                  }}
                  disabled={safePage === totalPages}
                  style={isHighContrast && safePage !== totalPages ? { borderWidth: 2, borderColor: '#000000' } : undefined}
                  className={`rounded-full active:scale-95 ${
                    isGloveMode ? 'min-h-[48px] px-5 py-3' : 'px-4 py-2'
                  } ${
                    safePage === totalPages ? 'bg-black/5' : 'bg-cognac shadow-xs shadow-cognac/20'
                  }`}>
                  <Text
                    style={{ fontSize: 12 * fontScale }}
                    className={`font-bold ${
                      safePage === totalPages ? 'text-taupe' : 'text-white'
                    }`}>
                    Next
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Todo Detail Modal */}
      <TodoDetailModal
        todo={
          modalTodoGroup?.todos[0]
            ? {
                ...modalTodoGroup.todos[0],
                is_completed: modalTodoGroup.todos.every((t) => t.is_completed),
                progress: modalTodoGroup.todos[0].progress,
              }
            : null
        }
        allGroupTodoIds={modalGroupTodoIds}
        farmName={
          modalTodoGroup ? farmsById[modalTodoGroup.todos[0].farm_id]?.farm_name : undefined
        }
        status={
          modalTodoGroup?.todos[0]
            ? getTodoScopeStatus(
                {
                  ...modalTodoGroup.todos[0],
                  is_completed: modalTodoGroup.todos.every((t) => t.is_completed),
                },
                selectedDate,
                todayKey
              )
            : 'active'
        }
        visible={!!modalTodoGroup}
        onClose={() => setModalTodoGroup(null)}
        onEdit={
          modalTodoGroup?.todos[0] &&
          farmPermissions[modalTodoGroup.todos[0].farm_id]?.canEditTasks !== false
            ? () => {
                const todo = modalTodoGroup.todos[0];
                setModalTodoGroup(null);
                handleEditTodo(todo);
              }
            : undefined
        }
        onToggleComplete={() => {
          if (modalTodoGroup) toggleTodosComplete(modalTodoGroup.todos);
        }}
        onUpdateProgress={(newProgress) => {
          if (modalTodoGroup) handleUpdateTodoGroupProgress(modalTodoGroup.todos, newProgress);
        }}
      />
    </View>
  );
}
