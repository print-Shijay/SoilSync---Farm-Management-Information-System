import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  useWindowDimensions,
  Image,
  TextInput,
  Animated,
  Keyboard,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import {
  getFarmsByUser,
  getTodosByUser,
  FarmRecord,
  TodoRecord,
  batchUpdateTodosCompletion,
  batchUpdateTodosProgress,
  getAllGardenStructures,
  getAllPublishedModules,
  getActiveAnnouncements,
  getUserFolders,
  AnnouncementRecord,
  TodoItem,
} from '../../lib/db-operations';
import {
  groupTodosForUI,
  FarmGroup,
  PlotGroup,
  TaskGroup,
  isCheckUpTask,
} from '../../lib/todo-grouping';
import { syncLocalAndCloud, getLastSyncAt } from '../../lib/sync';
import { FarmCard } from '../../components/homePage/FarmCard';
import { TodoItemCard } from '../../components/homePage/TodoItemCard';
import { TodoDetailModal } from '../../components/homePage/TodoDetailModal';
import { AnnouncementModal } from '../../components/homePage/AnnouncementModal';
import { FarmCardsSkeletonList, TodoItemsSkeletonList } from '../../components/skeleton';
import { Crop, getCustomCrops } from '../../lib/crop-planner';
import {
  Bell,
  CloudSun,
  Droplets,
  Wind,
  ChevronRight,
  BookOpen,
  Sparkles,
  Layers,
  Search,
  X,
  Cpu,
  Calendar,
  Zap,
  User,
  Users,
  Eye,
  RefreshCw,
  MapPin,
  CheckCircle2,
  Clock,
  Shield,
  HelpCircle,
  Plus,
  Leaf,
  WifiOff,
} from 'lucide-react-native';
import { useNotificationHub } from '../../lib/hooks/useNotificationHub';
import { useLocalNotificationListener } from '../../lib/hooks/useLocalNotificationListener';
import { NotificationCenterModal } from '../../components/homePage/NotificationCenterModal';
import { AppModal } from '../../components/common/AppModal';
import {
  isPermissionAllowed,
  requestAppPermission,
  openPhoneSettings,
} from '../../lib/permissions';
import {
  scheduleDailyReminders,
  checkAndDispatchDailyReminders,
} from '../../lib/notifications/notification-service';
import { getWeatherData, CachedWeather } from '../../lib/weather-service';

import { powersync } from '../../lib/powersync';
import { useDataSyncReady } from '../../lib/hooks/useDataSyncReady';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';
import * as Network from 'expo-network';
import { useAccessibility } from '../../lib/accessibility';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
  return 'on_track';
}

function parseLocation(locStr?: string | null) {
  if (!locStr) return 'No location recorded';
  try {
    const parsed = JSON.parse(locStr);
    return parsed.address || locStr;
  } catch {
    return locStr;
  }
}

type TaskCardItem =
  | {
      type: 'group';
      id: string;
      farmId: string;
      farmName: string;
      comboKey: string;
      plotNamesText: string;
      taskGroup: TaskGroup;
    }
  | {
      type: 'general';
      id: string;
      farmId: string;
      farmName: string;
      todo: TodoItem;
    };

type PagePlotGroup = {
  comboKey: string;
  plotNamesText: string;
  taskGroups: TaskGroup[];
};

type PageFarmGroup = {
  farmId: string;
  farmName: string;
  plotGroups: PagePlotGroup[];
  generalTodos: TodoItem[];
};

const STATIC_SHORTCUTS = [
  {
    id: 'add-task',
    title: 'Add Task',
    description: 'Schedule a new agricultural activity',
    category: 'Activities',
    icon: Plus,
    iconBg: '#8C4522',
    keywords: ['add task', 'task', 'todo', 'schedule', 'new task', 'create task'],
    route: '/todo/add',
  },
  {
    id: 'farm-list',
    title: 'Farm List',
    description: 'View and inspect all registered farms',
    category: 'Farms',
    icon: Layers,
    iconBg: '#729E3B',
    keywords: ['farm list', 'all farms', 'my farms', 'farms', 'properties', 'plots'],
    route: '/(tabs)/farms',
  },
  {
    id: 'farm-layout',
    title: 'Farm Layout',
    description: 'Design bed arrangements and blueprints',
    category: 'Farms',
    icon: Eye,
    iconBg: '#1E40AF',
    keywords: [
      'farm layout',
      'layouts',
      'garden layout',
      'blueprint',
      'structures',
      'designer',
      'beds',
    ],
    route: '/farm/layouts',
  },
  {
    id: 'add-farm',
    title: 'Add Farm',
    description: 'Register a new farm plot or property',
    category: 'Farms',
    icon: Plus,
    iconBg: '#059669',
    keywords: ['add farm', 'create farm', 'new farm', 'register farm', 'new plot'],
    route: '/(tabs)/addFarm',
  },
  {
    id: 'teams',
    title: 'Teams',
    description: 'Collaborate with team members and manage team access',
    category: 'Teams',
    icon: Users,
    iconBg: '#8C4522',
    keywords: ['team', 'teams', 'collaborate', 'members', 'invite'],
    route: '/teams',
  },
  {
    id: 'profile',
    title: 'Profile Information',
    description: 'Personal details, name, and contact',
    category: 'Account',
    icon: User,
    iconBg: '#8C4522',
    keywords: ['profile', 'user profile', 'account', 'personal info', 'name', 'phone', 'email'],
    route: '/settings/profile-information',
  },
  {
    id: 'privacy-security',
    title: 'Privacy & Security',
    description: 'App lock, PIN, 2FA, and credentials',
    category: 'Settings',
    icon: Shield,
    iconBg: '#0F766E',
    keywords: [
      'privacy',
      'security',
      'privacy amd security',
      'privacy and security',
      'password',
      'pin',
      'lock',
      '2fa',
      'mfa',
    ],
    route: '/settings/privacy-and-security',
  },
  {
    id: 'sms-notifications',
    title: 'SMS Notifications',
    description: 'Automated SMS text alerts & subscriptions',
    category: 'Alerts',
    icon: Bell,
    iconBg: '#D97706',
    keywords: [
      'sms',
      'sms notification',
      'text message',
      'notifications',
      'alerts',
      'phone alerts',
    ],
    route: '/settings/notifications',
  },
  {
    id: 'support-page',
    title: 'Support & Help Center',
    description: 'FAQs, submit tickets, and contact support',
    category: 'Support',
    icon: HelpCircle,
    iconBg: '#6366F1',
    keywords: ['support', 'support page', 'help', 'faq', 'contact', 'ticket', 'problem'],
    route: '/settings/support',
  },
  {
    id: 'custom-crops-shortcut',
    title: 'Crop List',
    description: 'Personalized crop varieties & catalog',
    category: 'Agronomy',
    icon: Leaf,
    iconBg: '#729E3B',
    keywords: ['crop list', 'custom crops', 'crop', 'crops', 'plants', 'vegetables', 'catalog'],
    route: '/custom-crops',
  },
  {
    id: 'weather-shortcut',
    title: 'Weather & Forecast',
    description: 'Microclimate radar & telemetry',
    category: 'Environment',
    icon: CloudSun,
    iconBg: '#0284C7',
    keywords: ['weather', 'forecast', 'radar', 'microclimate', 'temperature', 'rain'],
    route: '/weather',
  },
  {
    id: 'edge-models-shortcut',
    title: 'Edge AI Models',
    description: 'Offline AI models for plant diagnostics',
    category: 'AI & IoT',
    icon: Cpu,
    iconBg: '#7C3AED',
    keywords: ['edge models', 'ai', 'offline model', 'diagnostics'],
    route: '/settings/edge-models',
  },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const { isOffline } = useNetworkStatus();
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();
  const todayKey = toDateKey(new Date());

  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [activeFarmId, setActiveFarmId] = useState<string | null>(null);
  const [modalTodo, setModalTodo] = useState<TodoRecord | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;
  const [modalTodoGroup, setModalTodoGroup] = useState<{
    todos: TodoItem[];
    plotNamesText?: string;
  } | null>(null);
  const modalGroupTodoIds = useMemo(
    () => (modalTodoGroup ? modalTodoGroup.todos.map((t) => t.id) : undefined),
    [modalTodoGroup]
  );
  const [gardenStructures, setGardenStructures] = useState<any[]>([]);
  const [moduleCount, setModuleCount] = useState(0);
  const [folderCount, setFolderCount] = useState(0);
  const { width } = useWindowDimensions();
  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef<ScrollView>(null);
  const [weather, setWeather] = useState<CachedWeather | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const cleanQuery = searchQuery.trim().toLowerCase();
  const [searchCategory, setSearchCategory] = useState<
    'All' | 'Farms' | 'Crops' | 'Features' | 'Tasks'
  >('All');
  const [customCrops, setCustomCrops] = useState<Crop[]>([]);
  const scrollY = useRef(new Animated.Value(0)).current;

  type SlideItem =
    | { type: 'overview'; id: string }
    | { type: 'weather'; id: string }
    | { type: 'announcement'; id: string; data: AnnouncementRecord }
    | { type: 'fallback'; id: string };

  const baseSlides: SlideItem[] = useMemo(() => {
    const items: SlideItem[] = [
      { type: 'overview', id: 'overview' },
      { type: 'weather', id: 'weather' },
    ];
    if (announcements.length > 0) {
      announcements.forEach((ann, idx) => {
        items.push({
          type: 'announcement',
          id: ann.id || `ann-${idx}`,
          data: ann,
        });
      });
    } else {
      items.push({ type: 'fallback', id: 'fallback' });
    }
    return items;
  }, [announcements]);

  const totalSlides = baseSlides.length;

  const carouselSlides = useMemo(() => {
    if (totalSlides <= 1) {
      return baseSlides.map((s) => ({ ...s, itemKey: s.id }));
    }
    const lastItem = baseSlides[totalSlides - 1];
    const firstItem = baseSlides[0];
    return [
      { ...lastItem, itemKey: `clone-head-${lastItem.id}` },
      ...baseSlides.map((s) => ({ ...s, itemKey: s.id })),
      { ...firstItem, itemKey: `clone-tail-${firstItem.id}` },
    ];
  }, [baseSlides, totalSlides]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentDisplayIndexRef = useRef(1);

  const startAutoAdvanceTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
    if (cleanQuery || !user || totalSlides <= 1) return;

    timerRef.current = setInterval(() => {
      if (width <= 0) return;
      const nextDisplayIndex = currentDisplayIndexRef.current + 1;
      carouselRef.current?.scrollTo({
        x: nextDisplayIndex * width,
        animated: true,
      });
      currentDisplayIndexRef.current = nextDisplayIndex;

      if (nextDisplayIndex >= totalSlides + 1) {
        autoAdvanceTimeoutRef.current = setTimeout(() => {
          carouselRef.current?.scrollTo({
            x: 1 * width,
            animated: false,
          });
          currentDisplayIndexRef.current = 1;
        }, 450);
      }
    }, 8000);
  }, [cleanQuery, user, totalSlides, width]);

  useFocusEffect(
    useCallback(() => {
      startAutoAdvanceTimer();
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
      };
    }, [startAutoAdvanceTimer])
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      if (width <= 0) return;
      const rawIndex = Math.round(offsetX / width);
      currentDisplayIndexRef.current = rawIndex;

      if (totalSlides > 1) {
        let realIndex = rawIndex - 1;
        if (realIndex < 0) {
          realIndex = totalSlides - 1;
        } else if (realIndex >= totalSlides) {
          realIndex = 0;
        }
        setActiveSlide(realIndex);
      } else {
        setActiveSlide(rawIndex);
      }
    },
    [totalSlides, width]
  );

  const checkAndResetBoundary = useCallback(() => {
    if (totalSlides <= 1 || width <= 0) return;
    const currentIndex = currentDisplayIndexRef.current;

    if (currentIndex <= 0) {
      currentDisplayIndexRef.current = totalSlides;
      requestAnimationFrame(() => {
        carouselRef.current?.scrollTo({
          x: totalSlides * width,
          animated: false,
        });
      });
    } else if (currentIndex >= totalSlides + 1) {
      currentDisplayIndexRef.current = 1;
      requestAnimationFrame(() => {
        carouselRef.current?.scrollTo({
          x: 1 * width,
          animated: false,
        });
      });
    }
  }, [totalSlides, width]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      if (width > 0) {
        currentDisplayIndexRef.current = Math.round(offsetX / width);
      }
      checkAndResetBoundary();
      startAutoAdvanceTimer();
    },
    [checkAndResetBoundary, startAutoAdvanceTimer, width]
  );

  const handleCarouselLayout = useCallback(() => {
    if (totalSlides > 1 && width > 0) {
      carouselRef.current?.scrollTo({
        x: (activeSlide + 1) * width,
        animated: false,
      });
      currentDisplayIndexRef.current = activeSlide + 1;
    }
  }, [activeSlide, totalSlides, width]);

  useEffect(() => {
    if (totalSlides > 1 && width > 0) {
      carouselRef.current?.scrollTo({
        x: (activeSlide + 1) * width,
        animated: false,
      });
      currentDisplayIndexRef.current = activeSlide + 1;
    }
  }, [width]);

  useEffect(() => {
    if (!cleanQuery && user && totalSlides > 1 && width > 0) {
      const t = setTimeout(() => {
        carouselRef.current?.scrollTo({
          x: (activeSlide + 1) * width,
          animated: false,
        });
        currentDisplayIndexRef.current = activeSlide + 1;
      }, 50);
      return () => clearTimeout(t);
    }
  }, [cleanQuery, user]);

  const prevTotalSlidesRef = useRef(totalSlides);
  useEffect(() => {
    if (prevTotalSlidesRef.current !== totalSlides && totalSlides > 1 && width > 0) {
      prevTotalSlidesRef.current = totalSlides;
      carouselRef.current?.scrollTo({
        x: (activeSlide + 1) * width,
        animated: false,
      });
      currentDisplayIndexRef.current = activeSlide + 1;
    }
  }, [totalSlides, activeSlide, width]);

  const [isNotificationModalVisible, setIsNotificationModalVisible] = useState(false);
  const [isNotificationPromptVisible, setIsNotificationPromptVisible] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const { unreadCount, refresh: refreshNotifications } = useNotificationHub();
  useLocalNotificationListener();

  const handleNotificationPress = useCallback(async () => {
    try {
      const allowed = await isPermissionAllowed('notifications');
      if (allowed) {
        setIsNotificationModalVisible(true);
      } else {
        setIsNotificationPromptVisible(true);
      }
    } catch {
      setIsNotificationModalVisible(true);
    }
  }, []);

  const handleEnableNotifications = useCallback(async () => {
    setIsRequestingPermission(true);
    try {
      const res = await requestAppPermission('notifications');
      if (res.granted) {
        if (user?.id) {
          void scheduleDailyReminders(user.id);
          void checkAndDispatchDailyReminders(user.id);
        }
        setIsNotificationPromptVisible(false);
        setIsNotificationModalVisible(true);
      } else {
        setIsNotificationPromptVisible(false);
        if (!res.canAskAgain) {
          Alert.alert(
            'Notifications Blocked',
            'Notification permissions are currently disabled in your phone settings. Would you like to open settings to enable them?',
            [
              {
                text: 'Not Now',
                style: 'cancel',
                onPress: () => setIsNotificationModalVisible(true),
              },
              {
                text: 'Open Settings',
                onPress: () => {
                  void openPhoneSettings();
                },
              },
            ]
          );
        } else {
          setIsNotificationModalVisible(true);
        }
      }
    } catch (error) {
      console.warn('Error enabling notifications:', error);
      setIsNotificationPromptVisible(false);
      setIsNotificationModalVisible(true);
    } finally {
      setIsRequestingPermission(false);
    }
  }, [user?.id]);

  const loadWeather = useCallback(async () => {
    try {
      const weatherData = await getWeatherData();
      if (weatherData) {
        setWeather(weatherData);
      }
    } catch {}
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [
        userFarms,
        userTodos,
        structures,
        lastSync,
        publishedModules,
        activeAnnouncements,
        userFolders,
        userCustomCrops,
      ] = await Promise.all([
        getFarmsByUser(user.id),
        getTodosByUser(user.id),
        getAllGardenStructures(),
        getLastSyncAt(),
        getAllPublishedModules(),
        getActiveAnnouncements(),
        getUserFolders(user.id),
        getCustomCrops(user.id),
      ]);
      setFarms(userFarms as FarmRecord[]);
      setTodos(userTodos as TodoItem[]);
      setGardenStructures(structures);
      setLastSyncAt(lastSync);
      setModuleCount(publishedModules.length);
      setAnnouncements(activeAnnouncements);
      setFolderCount(userFolders.length);
      setCustomCrops(userCustomCrops || []);
    } catch (error) {
      console.error('Error loading home data:', error);
    }
  }, [user]);

  // Dedicated sync readiness coordinator
  const { isDataReady } = useDataSyncReady({
    onSyncComplete: loadData,
  });

  const showSkeleton = !isDataReady && farms.length === 0;

  // Fetch announcements & weather on mount
  useEffect(() => {
    void loadWeather();
  }, [loadWeather]);

  useFocusEffect(
    useCallback(() => {
      void loadWeather();
      if (user) void loadData();
    }, [user, loadData, loadWeather])
  );

  // Watch for live PowerSync local table changes
  useEffect(() => {
    if (!user) return;
    const currentUserId = user.id;
    void loadData();

    const abortController = new AbortController();
    async function watchTables() {
      try {
        for await (const _update of powersync.watch(
          'SELECT id FROM farms WHERE user_id = ? UNION ALL SELECT id FROM todos WHERE user_id = ?',
          [currentUserId, currentUserId],
          { signal: abortController.signal }
        )) {
          void loadData();
        }
      } catch (err) {
        // aborted or error handled silently
      }
    }

    watchTables();

    return () => {
      abortController.abort();
    };
  }, [user, loadData]);

  const farmsById = useMemo(() => {
    return farms.reduce<Record<string, FarmRecord>>((acc, farm) => {
      acc[farm.id] = farm;
      return acc;
    }, {});
  }, [farms]);

  const activeFarm = activeFarmId ? (farmsById[activeFarmId] ?? null) : null;

  const todayTodos = useMemo(() => {
    return todos.filter((todo) => {
      if (activeFarmId && todo.farm_id !== activeFarmId) return false;
      return getTodoScopeStatus(todo, todayKey, todayKey) !== 'hidden';
    });
  }, [todos, activeFarmId, todayKey]);

  // Group all today's todos first so multi-plot tasks are treated as a single logical task
  const groupedTodosData = useMemo(() => {
    if (cleanQuery) return { farmGroups: [], allGeneralTodos: [] };
    return groupTodosForUI(todayTodos as TodoItem[], gardenStructures, farmsById as any);
  }, [todayTodos, gardenStructures, farmsById, cleanQuery]);

  // Build a flat list of visual task card units
  const allTaskCards = useMemo<TaskCardItem[]>(() => {
    const cards: TaskCardItem[] = [];
    groupedTodosData.farmGroups.forEach((farmGroup) => {
      farmGroup.plotGroups.forEach((plotGroup) => {
        plotGroup.taskGroups.forEach((taskGroup) => {
          cards.push({
            type: 'group',
            id: `${farmGroup.farmId}_${taskGroup.signature}`,
            farmId: farmGroup.farmId,
            farmName: farmGroup.farmName,
            comboKey: plotGroup.comboKey,
            plotNamesText: plotGroup.plotNamesText,
            taskGroup,
          });
        });
      });

      farmGroup.generalTodos.forEach((todo) => {
        cards.push({
          type: 'general',
          id: todo.id,
          farmId: farmGroup.farmId,
          farmName: farmGroup.farmName,
          todo,
        });
      });
    });
    return cards;
  }, [groupedTodosData]);

  // Number of pending tasks (where group task has at least one unfinished plot task)
  const pendingTasksCount = useMemo(() => {
    return allTaskCards.filter((card) => {
      if (card.type === 'group') {
        return card.taskGroup.todos.some((t) => !t.is_completed);
      }
      return !card.todo.is_completed;
    }).length;
  }, [allTaskCards]);

  const filteredFarms = farms;

  const totalPages = Math.ceil(allTaskCards.length / ITEMS_PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCards = useMemo(() => {
    return allTaskCards.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  }, [allTaskCards, safePage]);

  // Reconstruct farm & plot groups for the current page so multi-plot tasks are never fractured
  const paginatedFarmGroups = useMemo<PageFarmGroup[]>(() => {
    const farmMap = new Map<
      string,
      {
        farmId: string;
        farmName: string;
        plotGroupMap: Map<string, PagePlotGroup>;
        generalTodos: TodoItem[];
      }
    >();

    paginatedCards.forEach((card) => {
      if (!farmMap.has(card.farmId)) {
        farmMap.set(card.farmId, {
          farmId: card.farmId,
          farmName: card.farmName,
          plotGroupMap: new Map(),
          generalTodos: [],
        });
      }
      const fg = farmMap.get(card.farmId)!;

      if (card.type === 'group') {
        if (!fg.plotGroupMap.has(card.comboKey)) {
          fg.plotGroupMap.set(card.comboKey, {
            comboKey: card.comboKey,
            plotNamesText: card.plotNamesText,
            taskGroups: [],
          });
        }
        fg.plotGroupMap.get(card.comboKey)!.taskGroups.push(card.taskGroup);
      } else {
        fg.generalTodos.push(card.todo);
      }
    });

    return Array.from(farmMap.values()).map((fg) => ({
      farmId: fg.farmId,
      farmName: fg.farmName,
      plotGroups: Array.from(fg.plotGroupMap.values()),
      generalTodos: fg.generalTodos,
    }));
  }, [paginatedCards]);

  const targetFarmId = activeFarmId || (farms.length > 0 ? farms[0].id : null);

  const matchingFarms = useMemo(() => {
    if (!cleanQuery) return [];
    return farms.filter((f) => f.farm_name?.toLowerCase().includes(cleanQuery)).slice(0, 5);
  }, [farms, cleanQuery]);

  const matchingCrops = useMemo(() => {
    if (!cleanQuery) return [];
    return customCrops
      .filter((c) => {
        const name = c.crop?.toLowerCase() || '';
        const local = c.local_name?.toLowerCase() || '';
        return name.includes(cleanQuery) || local.includes(cleanQuery);
      })
      .slice(0, 5);
  }, [customCrops, cleanQuery]);

  const matchingShortcuts = useMemo(() => {
    if (!cleanQuery) return [];
    return STATIC_SHORTCUTS.filter((s) => {
      const titleMatch = s.title.toLowerCase().includes(cleanQuery);
      const keyMatch = s.keywords.some((k) => k.includes(cleanQuery));
      return titleMatch || keyMatch;
    }).slice(0, 5);
  }, [cleanQuery]);

  const matchingTodoGroups = useMemo(() => {
    if (!cleanQuery) return [];
    const groupMap = new Map<string, TodoItem[]>();
    todos.forEach((t) => {
      if (!t.title?.toLowerCase().includes(cleanQuery)) return;
      const key = t.garden_structure_id
        ? `${t.farm_id}|${t.title}|${t.notes}|${t.start_date}|${t.due_date}`
        : t.id;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(t);
    });
    return Array.from(groupMap.values()).slice(0, 5);
  }, [todos, cleanQuery]);

  const searchCounts = {
    All:
      matchingFarms.length +
      matchingCrops.length +
      matchingShortcuts.length +
      matchingTodoGroups.length,
    Farms: matchingFarms.length,
    Crops: matchingCrops.length,
    Features: matchingShortcuts.length,
    Tasks: matchingTodoGroups.length,
  };
  const hasSearchResults = searchCounts.All > 0;

  const quickActions = [
    {
      id: 'modules',
      label: 'Modules',
      icon: BookOpen,
      onPress: () => router.push('/farming-module/modules'),
    },
    {
      id: 'folders',
      label: 'Folders',
      icon: Layers,
      onPress: () => router.push('/user-folders'),
    },
    {
      id: 'custom-crops',
      label: 'Crop List',
      icon: Leaf,
      onPress: () => router.push('/custom-crops'),
    },
    {
      id: 'edge-models',
      label: 'Edge Models',
      icon: Cpu,
      onPress: () => router.push('/settings/edge-models'),
    },
    {
      id: 'npk-sensor',
      label: 'NPK Sensor',
      icon: Zap,
      onPress: () => {
        if (targetFarmId) {
          router.push(`/farm/npk-sensor/${targetFarmId}`);
        } else {
          Alert.alert('No Farm Found', 'Please add a farm first to use NPK sensors.', [
            { text: 'Add Farm', onPress: () => router.push('/(tabs)/addFarm') },
            { text: 'Cancel', style: 'cancel' },
          ]);
        }
      },
    },
    {
      id: 'farm-layout',
      label: 'Farm Layout',
      icon: Eye,
      onPress: () => router.push('/farm/layouts'),
    },
    {
      id: 'teams',
      label: 'Teams',
      icon: Users,
      onPress: () => router.push('/teams'),
    },
    {
      id: 'sms-notifications',
      label: 'SMS Notification',
      icon: Bell,
      onPress: () => router.push('/settings/notifications'),
    },
  ];

  const handleSync = async () => {
    if (isOffline || syncing) return;
    setSyncing(true);
    try {
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected || networkState.isInternetReachable === false) {
        Alert.alert('No Connection', 'Connect to the internet to sync your data.');
        return;
      }
      await syncLocalAndCloud();
      setLastSyncAt(await getLastSyncAt());
      await loadData();
      Alert.alert('Sync requested', 'PowerSync has checked local and cloud changes.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleFarmPress = (farmId: string) => {
    setActiveFarmId((cur) => (cur === farmId ? null : farmId));
    setCurrentPage(1);
  };

  const toggleTodosComplete = async (todosToToggle: TodoItem[]) => {
    const allCompleted = todosToToggle.every((t: TodoItem) => t.is_completed);
    const newCompleted = !allCompleted;
    const todoIds = todosToToggle.map((t: TodoItem) => t.id);
    const todoIdSet = new Set(todoIds);

    // Optimistic UI update: instantly update local react state (0ms)
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
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update tasks.');
      void loadData();
    }
  };

  const handleUpdateTodoGroupProgress = async (todosToUpdate: TodoItem[], newProgress: number) => {
    const isCompleted = newProgress >= 100;
    const todoIds = todosToUpdate.map((t) => t.id);
    const todoIdSet = new Set(todoIds);

    // Optimistic UI update
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
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update task progress.');
      void loadData();
    }
  };

  const handleEditTodo = (todo: TodoItem | TodoRecord) => {
    router.push(`/todo/edit/${todo.id}`);
  };

  const renderOverviewSlide = (key: string) => (
    <View key={key} style={{ width }} className="items-center px-5">
      <View
        style={{ width: width - 40 }}
        className="min-h-[178px] justify-between rounded-[28px] border border-white/10 bg-cognac p-5 shadow-lg shadow-cognac/30">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center rounded-full border border-white/30 bg-white/20 px-3 py-1">
            <Sparkles size={12} color="#FFFFFF" />
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className="ml-1.5 font-extrabold uppercase tracking-widest text-white">
              Daily Overview
            </Text>
          </View>
          <Text
            style={{ fontSize: Math.round(11 * fontScale) }}
            className="font-bold text-champagne/85">
            {user?.user_metadata?.first_name
              ? `Hi, ${user.user_metadata.first_name}`
              : 'Welcome back'}
          </Text>
        </View>

        <View className="my-1.5 flex-row items-center justify-between">
          <View>
            <Text
              style={{ fontSize: Math.round(48 * fontScale) }}
              className="font-black tracking-tight text-white">
              {pendingTasksCount}
            </Text>
            <Text
              style={{ fontSize: Math.round(12 * fontScale) }}
              className="mt-0.5 font-semibold text-champagne/85">
              Tasks pending for today
            </Text>
          </View>
          <View className="h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/15">
            <Calendar size={28} color="#D99C2B" strokeWidth={2.2} />
          </View>
        </View>

        <View className="flex-row items-center justify-between border-t border-white/15 pt-2.5">
          <Text
            style={{ fontSize: Math.round(10 * fontScale) }}
            className="font-medium text-champagne/75">
            {isOffline
              ? 'Offline Mode • Local DB'
              : lastSyncAt
              ? `Synced ${new Date(lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Ready to sync'}
          </Text>
          <TouchableOpacity
            onPress={() => {
              triggerHaptic('light');
              router.push('/todo/add');
            }}
            activeOpacity={0.8}
            hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
            style={isGloveMode ? { minHeight: 40, justifyContent: 'center' } : undefined}
            className="flex-row items-center rounded-full border border-white/30 bg-white/20 px-3 py-1 active:scale-95">
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className="font-extrabold text-white">
              Add Task +
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderWeatherSlide = (key: string) => (
    <TouchableOpacity
      key={key}
      activeOpacity={0.88}
      onPress={() => {
        triggerHaptic('light');
        router.push('/weather');
      }}
      style={{ width }}
      className="items-center px-5">
      <View
        style={{ width: width - 40 }}
        className="min-h-[178px] justify-between rounded-[28px] border border-white/10 bg-cognac p-5 shadow-lg shadow-cognac/30">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center rounded-full border border-white/30 bg-white/20 px-3 py-1">
            <CloudSun size={12} color="#FFFFFF" />
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className="ml-1.5 font-extrabold uppercase tracking-widest text-white">
              {weather?.locationName || 'Local Microclimate'}
            </Text>
          </View>
          <View className="h-2 w-2 rounded-full bg-emerald-300" />
        </View>

        {weather ? (
          <View className="my-1 flex-row items-center justify-between">
            <View>
              <Text
                style={{ fontSize: Math.round(48 * fontScale) }}
                className="font-black tracking-tight text-white">
                {Math.round(weather.data.current.temp)}°C
              </Text>
              <Text
                style={{ fontSize: Math.round(12 * fontScale) }}
                className="mt-0.5 font-semibold capitalize text-champagne/85">
                {weather.data.current.weather[0]?.description || 'Normal conditions'}
              </Text>
            </View>
            <View className="h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/15">
              <CloudSun size={32} color="#D99C2B" strokeWidth={2.2} />
            </View>
          </View>
        ) : (
          <View className="my-3 items-center justify-center">
            <ActivityIndicator color="#FFFFFF" size="small" />
          </View>
        )}

        <View className="flex-row items-center justify-between border-t border-white/15 pt-2.5">
          <View className="flex-row items-center gap-2">
            <View className="flex-row items-center rounded-full bg-black/20 px-2.5 py-0.5">
              <Droplets size={11} color="#FFFFFF" />
              <Text
                style={{ fontSize: Math.round(10 * fontScale) }}
                className="ml-1 font-bold text-white">
                {weather ? `${weather.data.current.humidity}%` : '--'}
              </Text>
            </View>
            <View className="flex-row items-center rounded-full bg-black/20 px-2.5 py-0.5">
              <Wind size={11} color="#FFFFFF" />
              <Text
                style={{ fontSize: Math.round(10 * fontScale) }}
                className="ml-1 font-bold text-white">
                {weather ? `${Math.round(weather.data.current.wind_speed)} m/s` : '--'}
              </Text>
            </View>
          </View>
          <Text
            style={{ fontSize: Math.round(11 * fontScale) }}
            className="font-extrabold text-gold">
            Radar & Forecast →
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderAnnouncementSlide = (ann: AnnouncementRecord, key: string) => (
    <TouchableOpacity
      key={key}
      activeOpacity={0.88}
      onPress={() => {
        triggerHaptic('light');
        setSelectedAnnouncement(ann);
      }}
      style={{ width }}
      className="items-center px-5">
      <View
        style={{ width: width - 40 }}
        className="min-h-[178px] justify-between rounded-[28px] border border-white/10 bg-cognac p-5 shadow-lg shadow-cognac/30">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center rounded-full border border-white/30 bg-white/20 px-3 py-1">
            <Bell size={12} color="#FFFFFF" />
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className="ml-1.5 font-extrabold uppercase tracking-widest text-white">
              {ann.category || 'Agronomy Insights'}
            </Text>
          </View>
          <View className="h-2 w-2 rounded-full bg-amber-300" />
        </View>

        <View className="my-1">
          <Text
            style={{ fontSize: Math.round(20 * fontScale) }}
            className="line-clamp-1 font-black tracking-tight text-white">
            {ann.title}
          </Text>
          <Text
            style={{ fontSize: Math.round(12 * fontScale) }}
            className="mt-1 line-clamp-2 font-medium leading-relaxed text-champagne/85">
            {ann.summary}
          </Text>
        </View>

        <View className="flex-row items-center justify-between border-t border-white/15 pt-2.5">
          <Text
            style={{ fontSize: Math.round(10 * fontScale) }}
            className="font-bold uppercase tracking-wider text-champagne/75">
            SoilSync Advisory
          </Text>
          <Text
            style={{ fontSize: Math.round(11 * fontScale) }}
            className="font-extrabold text-gold">
            Tap to read more →
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderFallbackSlide = (key: string) => (
    <TouchableOpacity
      key={key}
      activeOpacity={0.88}
      onPress={() => {
        triggerHaptic('light');
        router.push('/announcements');
      }}
      style={{ width }}
      className="items-center px-5">
      <View
        style={{ width: width - 40 }}
        className="min-h-[178px] justify-between rounded-[28px] border border-white/10 bg-cognac p-5 shadow-lg shadow-cognac/30">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center rounded-full border border-white/30 bg-white/20 px-3 py-1">
            <Sparkles size={12} color="#FFFFFF" />
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className="ml-1.5 font-extrabold uppercase tracking-widest text-white">
              Agronomy Insights
            </Text>
          </View>
          <View className="h-2 w-2 rounded-full bg-emerald-300" />
        </View>

        <View className="my-1">
          <Text
            style={{ fontSize: Math.round(20 * fontScale) }}
            className="font-black tracking-tight text-white">
            Precision Soil Nutrition
          </Text>
          <Text
            style={{ fontSize: Math.round(12 * fontScale) }}
            className="mt-1 font-medium leading-relaxed text-champagne/85">
            Learn modern NPK balancing, smart irrigation scheduling, and soil sensor telemetry.
          </Text>
        </View>

        <View className="flex-row items-center justify-between border-t border-white/15 pt-2.5">
          <Text
            style={{ fontSize: Math.round(10 * fontScale) }}
            className="font-bold uppercase tracking-wider text-champagne/75">
            Knowledge Base
          </Text>
          <Text
            style={{ fontSize: Math.round(11 * fontScale) }}
            className="font-extrabold text-gold">
            Explore all →
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderSlideItem = (slide: (typeof carouselSlides)[0]) => {
    switch (slide.type) {
      case 'overview':
        return renderOverviewSlide(slide.itemKey);
      case 'weather':
        return renderWeatherSlide(slide.itemKey);
      case 'announcement':
        return renderAnnouncementSlide(slide.data, slide.itemKey);
      case 'fallback':
        return renderFallbackSlide(slide.itemKey);
    }
  };

  return (
    <View className="flex-1 bg-champagne">
      {/* ── Main Scroll View ── */}
      <Animated.ScrollView
        className="flex-1"
        bounces={true}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}>
        {/* ── Layer 1: Header + Search Bar + Slide Carousel (z-index 1) ── */}
        <Animated.View
          style={{
            zIndex: 1,
            transform: [
              {
                translateY: scrollY.interpolate({
                  inputRange: [-200, 0, 2000],
                  outputRange: [0, 0, 2000],
                  extrapolateLeft: 'clamp',
                }),
              },
            ],
          }}
          className="pb-3 pt-14">
          {/* Header Row */}
          <View className="flex-row items-center justify-between px-5">
            <View>
              <Text
                style={{ fontSize: Math.round(30 * fontScale) }}
                className="font-black tracking-tight">
                <Text className="text-cognac">Soil</Text>
                <Text style={{ color: '#729E3B' }}>Sync</Text>
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1.5">
                <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#729E3B' }} />
                <Text
                  style={{ fontSize: Math.round(11 * fontScale) }}
                  className="font-extrabold uppercase tracking-[0.25em] text-taupe">
                  Farm Management
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => {
                triggerHaptic('light');
                handleNotificationPress();
              }}
              activeOpacity={0.85}
              hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
              style={isGloveMode ? { minHeight: 48, minWidth: 48 } : undefined}
              className="shadow-xs relative h-11 w-11 items-center justify-center rounded-2xl border border-cognac/30 bg-white active:scale-95">
              <Bell size={20} color="#8C4522" strokeWidth={2.2} />
              {unreadCount > 0 && (
                <View className="absolute -right-1 -top-1 h-4 min-w-[16px] items-center justify-center rounded-full border-[1.5px] border-white bg-red-500 px-1 shadow-2xs">
                  <Text
                    style={{ fontSize: Math.round(8.5 * fontScale) }}
                    className="font-black text-white leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Offline Status Indicator - Compact Slim Pill */}
          {isOffline && (
            <View className="mx-5 mt-2 flex-row items-center justify-center rounded-full border border-amber-600/20 bg-amber-500/15 py-1 px-3">
              <WifiOff size={12} color="#B45309" strokeWidth={2.5} />
              <Text
                style={{ fontSize: Math.round(11 * fontScale) }}
                className="ml-1.5 font-bold text-amber-950">
                You are currently offline
              </Text>
              <View className="mx-1.5 h-1 w-1 rounded-full bg-amber-600/40" />
              <Text
                style={{ fontSize: Math.round(10.5 * fontScale) }}
                className="font-medium text-amber-900/80">
                Working locally
              </Text>
            </View>
          )}

          {/* Search Bar - Capsule Pill Design Matching Right Radius */}
          <View
            style={{ height: isGloveMode ? 54 : 50 }}
            className="mx-5 mt-3.5 flex-row items-center overflow-hidden rounded-full border border-cognac/15 bg-white shadow-sm shadow-espresso/5">
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              maxLength={255}
              placeholder="Search farms, crops, features..."
              placeholderTextColor="#8C7C70"
              style={{ fontSize: Math.round(14 * fontScale) }}
              className="h-full flex-1 py-0 pl-7 pr-2 font-semibold text-espresso"
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className="mr-2 h-6 w-6 items-center justify-center rounded-full bg-black/5 active:scale-90">
                <X size={12} color="#8C7C70" strokeWidth={2.5} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              activeOpacity={0.85}
              hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
              style={{ height: '100%', aspectRatio: 1 }}
              className="items-center justify-center rounded-full bg-cognac active:scale-95">
              <Search size={19} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          {/* Slide Carousel (visible when not searching) */}
          {!cleanQuery && user && (
            <View className="pt-3">
              <ScrollView
                ref={carouselRef}
                horizontal
                pagingEnabled
                bounces={false}
                overScrollMode="never"
                showsHorizontalScrollIndicator={false}
                contentOffset={{ x: totalSlides > 1 ? width : 0, y: 0 }}
                onLayout={handleCarouselLayout}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                onScrollBeginDrag={() => {
                  if (timerRef.current) clearInterval(timerRef.current);
                  if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
                }}
                onScrollEndDrag={(e) => {
                  if (e.nativeEvent.velocity?.x === 0) {
                    checkAndResetBoundary();
                    startAutoAdvanceTimer();
                  }
                }}
                onMomentumScrollEnd={handleMomentumScrollEnd}>
                {carouselSlides.map((slide) => renderSlideItem(slide))}
              </ScrollView>

              {/* Carousel Pagination Dots */}
              <View className="mt-3 flex-row items-center justify-center">
                {baseSlides.map((_, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => {
                      if (timerRef.current) clearInterval(timerRef.current);
                      const targetDisplayIndex = totalSlides > 1 ? index + 1 : index;
                      currentDisplayIndexRef.current = targetDisplayIndex;
                      carouselRef.current?.scrollTo({
                        x: targetDisplayIndex * width,
                        animated: true,
                      });
                      setActiveSlide(index);
                      startAutoAdvanceTimer();
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    activeOpacity={0.7}
                    className={`mx-1 rounded-full ${
                      activeSlide === index ? 'h-2 w-6 bg-cognac' : 'h-2 w-2 bg-taupe/40'
                    }`}
                  />
                ))}
              </View>
            </View>
          )}
        </Animated.View>

        {/* ── Layer 2: Foreground Sliding Sheet (z-index 2) ── */}
        <View
          style={{ zIndex: 2, elevation: 8 }}
          className="rounded-t-[36px] border-t border-black/5 bg-champagne px-5 pb-28 pt-4 shadow-2xl shadow-espresso/15">
          {cleanQuery ? (
            /* ── In-line Live Search Results (Instant Per-Character) ── */
            <View className="pt-2">
              {/* Category Filter Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-4 flex-row"
                contentContainerStyle={{ gap: 8 }}>
                {(['All', 'Farms', 'Crops', 'Features', 'Tasks'] as const).map((cat) => {
                  const count = searchCounts[cat];
                  const isActive = searchCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => {
                        triggerHaptic('selection');
                        setSearchCategory(cat);
                      }}
                      activeOpacity={0.8}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 4, right: 4 } : undefined}
                      className={`flex-row items-center rounded-full px-3.5 py-1.5 ${
                        isActive
                          ? 'bg-cognac shadow-sm shadow-cognac/30'
                          : 'border border-cognac/15 bg-white/80'
                      }`}>
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`font-bold ${
                          isActive ? 'text-white' : 'text-taupe'
                        }`}>
                        {cat}
                      </Text>
                      {count > 0 && (
                        <View
                          className={`ml-1.5 rounded-full px-1.5 py-0.5 ${
                            isActive ? 'bg-white/25' : 'bg-black/5'
                          }`}>
                          <Text
                            style={{ fontSize: Math.round(10 * fontScale) }}
                            className={`font-extrabold ${
                              isActive ? 'text-white' : 'text-espresso'
                            }`}>
                            {count}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {!hasSearchResults ? (
                <View className="shadow-xs mt-4 items-center justify-center rounded-[28px] border border-dashed border-taupe/30 bg-white/60 p-8">
                  <View className="h-14 w-14 items-center justify-center rounded-2xl bg-cognac/10">
                    <Search size={28} color="#8C4522" strokeWidth={2.2} />
                  </View>
                  <Text
                    style={{ fontSize: Math.round(16 * fontScale) }}
                    className="mt-3 text-center font-bold text-espresso">
                    No matches found for &quot;{searchQuery}&quot;
                  </Text>
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className="mt-1 text-center leading-5 text-taupe">
                    Try searching for a farm name, crop variety, feature, or task title.
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      triggerHaptic('light');
                      setSearchQuery('');
                    }}
                    activeOpacity={0.8}
                    hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                    style={isGloveMode ? { minHeight: 44, justifyContent: 'center' } : undefined}
                    className="shadow-xs mt-4 rounded-full bg-cognac px-5 py-2 active:scale-95">
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className="font-bold text-white">
                      Clear Search
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {/* Farms */}
                  {(searchCategory === 'All' || searchCategory === 'Farms') &&
                    matchingFarms.length > 0 && (
                      <View className="mb-4">
                        <View className="mb-2 flex-row items-center justify-between px-1">
                          <View className="flex-row items-center gap-1.5">
                            <MapPin size={14} color="#8C4522" />
                            <Text
                              style={{ fontSize: Math.round(11 * fontScale) }}
                              className="font-extrabold uppercase tracking-[0.2em] text-cognac">
                              Farms ({matchingFarms.length})
                            </Text>
                          </View>
                        </View>
                        <View className="overflow-hidden rounded-[26px] border border-black/5 bg-white/95 shadow-sm shadow-espresso/5">
                          {matchingFarms.map((farm, index) => (
                            <TouchableOpacity
                              key={farm.id}
                              onPress={() => {
                                triggerHaptic('light');
                                router.push(`/farm/${farm.id}`);
                              }}
                              activeOpacity={0.7}
                              hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                              className={`flex-row items-center p-3.5 active:bg-black/5 ${
                                index !== matchingFarms.length - 1 ? 'border-b border-black/5' : ''
                              }`}>
                              <View className="h-10 w-10 items-center justify-center rounded-xl border border-cognac/20 bg-cognac/10">
                                <MapPin size={18} color="#8C4522" strokeWidth={2.2} />
                              </View>
                              <View className="ml-3 flex-1 pr-2">
                                <Text
                                  style={{ fontSize: Math.round(14 * fontScale) }}
                                  className="font-bold tracking-tight text-espresso">
                                  {farm.farm_name}
                                </Text>
                                <Text
                                  numberOfLines={1}
                                  style={{ fontSize: Math.round(11 * fontScale) }}
                                  className="mt-0.5 font-medium text-taupe">
                                  {parseLocation(farm.location)}
                                </Text>
                              </View>
                              {farm.area_sqm ? (
                                <Text
                                  style={{ fontSize: Math.round(11 * fontScale) }}
                                  className="mr-2 font-bold text-cognac">
                                  {farm.area_sqm} m²
                                </Text>
                              ) : null}
                              <ChevronRight size={16} color="#8C7C70" strokeWidth={2.2} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                  {/* Crops */}
                  {(searchCategory === 'All' || searchCategory === 'Crops') &&
                    matchingCrops.length > 0 && (
                      <View className="mb-4">
                        <View className="mb-2 flex-row items-center justify-between px-1">
                          <View className="flex-row items-center gap-1.5">
                            <Leaf size={14} color="#047857" />
                            <Text
                              style={{ fontSize: Math.round(11 * fontScale) }}
                              className="font-extrabold uppercase tracking-[0.2em] text-emerald-800">
                              Custom Crops ({matchingCrops.length})
                            </Text>
                          </View>
                        </View>
                        <View className="overflow-hidden rounded-[26px] border border-black/5 bg-white/95 shadow-sm shadow-espresso/5">
                          {matchingCrops.map((crop, index) => (
                            <TouchableOpacity
                              key={crop.crop + index}
                              onPress={() => {
                                triggerHaptic('light');
                                router.push({
                                  pathname: '/custom-crops',
                                  params: {
                                    search: crop.crop,
                                    tab: 'custom',
                                  },
                                });
                              }}
                              activeOpacity={0.7}
                              hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                              className={`flex-row items-center p-3.5 active:bg-black/5 ${
                                index !== matchingCrops.length - 1 ? 'border-b border-black/5' : ''
                              }`}>
                              <View className="h-10 w-10 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-100">
                                <Leaf size={18} color="#047857" strokeWidth={2.2} />
                              </View>
                              <View className="ml-3 flex-1 pr-2">
                                <Text
                                  style={{ fontSize: Math.round(14 * fontScale) }}
                                  className="font-bold tracking-tight text-espresso">
                                  {crop.crop}
                                </Text>
                                <Text
                                  numberOfLines={1}
                                  style={{ fontSize: Math.round(11 * fontScale) }}
                                  className="mt-0.5 font-medium text-taupe">
                                  {crop.local_name ? `${crop.local_name} • ` : ''}
                                  {crop.type} • {crop.maturity_days || '30'} days
                                </Text>
                              </View>
                              <View className="mr-2 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5">
                                <Text
                                  style={{ fontSize: Math.round(10 * fontScale) }}
                                  className="font-bold text-emerald-800">
                                  Custom
                                </Text>
                              </View>
                              <ChevronRight size={16} color="#8C7C70" strokeWidth={2.2} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                  {/* Features & Shortcuts */}
                  {(searchCategory === 'All' || searchCategory === 'Features') &&
                    matchingShortcuts.length > 0 && (
                      <View className="mb-4">
                        <View className="mb-2 flex-row items-center justify-between px-1">
                          <View className="flex-row items-center gap-1.5">
                            <Sparkles size={14} color="#8C4522" />
                            <Text
                              style={{ fontSize: Math.round(11 * fontScale) }}
                              className="font-extrabold uppercase tracking-[0.2em] text-cognac">
                              Features & Shortcuts ({matchingShortcuts.length})
                            </Text>
                          </View>
                        </View>
                        <View className="overflow-hidden rounded-[26px] border border-black/5 bg-white/95 shadow-sm shadow-espresso/5">
                          {matchingShortcuts.map((shortcut, index) => {
                            const IconComp = shortcut.icon;
                            return (
                              <TouchableOpacity
                                key={shortcut.id}
                                onPress={() => {
                                  triggerHaptic('light');
                                  router.push(shortcut.route as any);
                                }}
                                activeOpacity={0.7}
                                hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                                className={`flex-row items-center p-3.5 active:bg-black/5 ${
                                  index !== matchingShortcuts.length - 1
                                    ? 'border-b border-black/5'
                                    : ''
                                }`}>
                                <View
                                  style={{ backgroundColor: shortcut.iconBg }}
                                  className="shadow-xs h-10 w-10 items-center justify-center rounded-xl">
                                  <IconComp size={20} color="#FFFFFF" strokeWidth={2.2} />
                                </View>
                                <View className="ml-3 flex-1 pr-2">
                                  <Text
                                    style={{ fontSize: Math.round(14 * fontScale) }}
                                    className="font-bold tracking-tight text-espresso">
                                    {shortcut.title}
                                  </Text>
                                  <Text
                                    numberOfLines={1}
                                    style={{ fontSize: Math.round(11 * fontScale) }}
                                    className="mt-0.5 font-medium text-taupe">
                                    {shortcut.description}
                                  </Text>
                                </View>
                                <View className="mr-2 rounded-full border border-cognac/20 bg-cognac/10 px-2 py-0.5">
                                  <Text
                                    style={{ fontSize: Math.round(10 * fontScale) }}
                                    className="font-bold text-cognac">
                                    {shortcut.category}
                                  </Text>
                                </View>
                                <ChevronRight size={16} color="#8C7C70" strokeWidth={2.2} />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                  {/* Tasks */}
                  {(searchCategory === 'All' || searchCategory === 'Tasks') &&
                    matchingTodoGroups.length > 0 && (
                      <View className="mb-4">
                        <View className="mb-2 flex-row items-center justify-between px-1">
                          <View className="flex-row items-center gap-1.5">
                            <Calendar size={14} color="#8C4522" />
                            <Text
                              style={{ fontSize: Math.round(11 * fontScale) }}
                              className="font-extrabold uppercase tracking-[0.2em] text-cognac">
                              Tasks ({matchingTodoGroups.length})
                            </Text>
                          </View>
                        </View>
                        <View className="overflow-hidden rounded-[26px] border border-black/5 bg-white/95 shadow-sm shadow-espresso/5">
                          {matchingTodoGroups.map((todoGroup, index) => {
                            const todo = todoGroup[0];
                            const allCompleted = todoGroup.every((t) => t.is_completed);
                            return (
                              <TouchableOpacity
                                key={todo.id}
                                onPress={() => {
                                  triggerHaptic('light');
                                  const isCheckUpFarm = isCheckUpTask(todo.title);
                                  if (isCheckUpFarm) {
                                    router.push({
                                      pathname: '/farm/[id]',
                                      params: {
                                        id: todo.farm_id,
                                        openCheckUp: todoGroup.map((t) => t.id),
                                      },
                                    });
                                  } else {
                                    setModalTodoGroup({ todos: todoGroup });
                                  }
                                }}
                                activeOpacity={0.7}
                                hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                                className={`flex-row items-center p-3.5 active:bg-black/5 ${
                                  index !== matchingTodoGroups.length - 1
                                    ? 'border-b border-black/5'
                                    : ''
                                }`}>
                                <View
                                  className={`h-10 w-10 items-center justify-center rounded-xl border ${
                                    allCompleted
                                      ? 'border-emerald-300 bg-emerald-100'
                                      : 'border-blue-300 bg-blue-100'
                                  }`}>
                                  {allCompleted ? (
                                    <CheckCircle2 size={18} color="#047857" strokeWidth={2.2} />
                                  ) : (
                                    <Clock size={18} color="#1E40AF" strokeWidth={2.2} />
                                  )}
                                </View>
                                <View className="ml-3 flex-1 pr-2">
                                  <Text
                                    numberOfLines={1}
                                    style={{ fontSize: Math.round(14 * fontScale) }}
                                    className={`font-bold tracking-tight ${
                                      allCompleted ? 'text-taupe line-through' : 'text-espresso'
                                    }`}>
                                    {todo.title}
                                  </Text>
                                  <Text
                                    numberOfLines={1}
                                    style={{ fontSize: Math.round(11 * fontScale) }}
                                    className="mt-0.5 font-medium text-taupe">
                                    {todo.notes ||
                                      (todo.due_date ? `Due: ${todo.due_date}` : 'No extra notes')}
                                  </Text>
                                </View>
                                <View
                                  className={`mr-2 rounded-full border px-2 py-0.5 ${
                                    allCompleted
                                      ? 'border-emerald-300 bg-emerald-100'
                                      : 'border-blue-300 bg-blue-100'
                                  }`}>
                                  <Text
                                    style={{ fontSize: Math.round(10 * fontScale) }}
                                    className={`font-bold ${
                                      allCompleted ? 'text-emerald-800' : 'text-blue-800'
                                    }`}>
                                    {allCompleted ? 'Done' : 'Pending'}
                                  </Text>
                                </View>
                                <ChevronRight size={16} color="#8C7C70" strokeWidth={2.2} />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                </>
              )}
            </View>
          ) : (
            user && (
              <>
                {/* ── 4x2 Quick Actions Springboard ── */}
                <View
                  className="mt-2 overflow-hidden rounded-[28px] border border-black/5 bg-white/90 p-4 shadow-sm shadow-espresso/5"
                  style={
                    isHighContrast
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }>
                  <View className="mb-3 flex-row items-center justify-between px-1">
                    <Text
                      style={{ fontSize: 11 * fontScale }}
                      className="font-bold uppercase tracking-[0.25em] text-cognac">
                      Quick Services
                    </Text>
                    <Text
                      style={{ fontSize: 10 * fontScale }}
                      className="font-bold uppercase tracking-wider text-taupe">
                      8 Shortcuts
                    </Text>
                  </View>

                  {/* 4x2 Grid Container */}
                  <View className="flex-row flex-wrap justify-between gap-y-3">
                    {quickActions.map((action) => {
                      const IconComp = action.icon;
                      return (
                        <TouchableOpacity
                          key={action.id}
                          onPress={() => {
                            triggerHaptic('selection');
                            action.onPress();
                          }}
                          activeOpacity={0.75}
                          hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                          className={`w-[23%] items-center active:scale-95 ${isGloveMode ? 'py-1.5' : ''}`}>
                          <View
                            className={`shadow-xs mb-1.5 items-center justify-center rounded-2xl border ${
                              isGloveMode ? 'h-14 w-14' : 'h-12 w-12'
                            } ${
                              isHighContrast
                                ? 'border-2 border-black bg-white'
                                : 'border-cognac/15 bg-cognac/10'
                            }`}>
                            <IconComp
                              size={isGloveMode ? 24 : 22}
                              color={isHighContrast ? '#000000' : '#8C4522'}
                              strokeWidth={2.4}
                            />
                          </View>
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 11 * fontScale,
                              color: isHighContrast ? '#000000' : '#2D231E',
                              fontWeight: isHighContrast ? '900' : '700',
                            }}
                            className="text-center tracking-tight">
                            {action.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* ── Sync Data Button ── */}
                <TouchableOpacity
                  className={`mt-3.5 flex-row items-center justify-center rounded-full shadow-sm shadow-cognac/30 active:scale-[0.98] ${isOffline ? 'bg-taupe/50' : 'bg-cognac'} ${
                    isGloveMode ? 'min-h-[58px] py-4' : 'py-3.5'
                  }`}
                  style={isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : undefined}
                  onPress={() => {
                    triggerHaptic('medium');
                    handleSync();
                  }}
                  activeOpacity={0.85}
                  disabled={syncing || isOffline}>
                  {syncing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <View className="flex-row items-center gap-2">
                      <RefreshCw size={16} color="#FFFFFF" strokeWidth={2.4} />
                      <Text
                        style={{ fontSize: 15 * fontScale }}
                        className="text-center font-extrabold text-white">
                        {isOffline ? 'Sync Unavailable Offline' : 'Sync Data'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* My Farms Area */}
                <View className="mt-6">
                  <View className="mb-3 flex-row items-center justify-between">
                    <Text
                      style={{
                        fontSize: 20 * fontScale,
                        color: isHighContrast ? '#000000' : '#2D231E',
                        fontWeight: isHighContrast ? '900' : '800',
                      }}
                      className="tracking-tight">
                      My Farm Area
                    </Text>
                    <View
                      className="rounded-full border border-black/5 bg-white/80 px-2.5 py-0.5"
                      style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000' } : undefined}>
                      <Text
                        style={{ fontSize: 12 * fontScale }}
                        className="font-bold text-cognac">
                        {showSkeleton ? '—' : filteredFarms.length}
                      </Text>
                    </View>
                  </View>
                  {showSkeleton ? (
                    <FarmCardsSkeletonList />
                  ) : filteredFarms.length > 0 ? (
                    <FlatList
                      data={filteredFarms}
                      renderItem={({ item: farm }) => (
                        <FarmCard
                          farm={farm}
                          active={activeFarmId === farm.id}
                          onPress={() => handleFarmPress(farm.id)}
                        />
                      )}
                      keyExtractor={(item) => item.id}
                      extraData={activeFarmId}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      className="overflow-visible"
                      contentContainerStyle={{ paddingRight: 20, paddingTop: 4, paddingBottom: 10 }}
                    />
                  ) : (
                    <View className="mt-2 rounded-[28px] border border-dashed border-taupe/30 bg-white/50 p-7">
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="text-center font-bold text-espresso">
                        {searchQuery ? `No farms matching "${searchQuery}"` : 'No farms added yet'}
                      </Text>
                      <Text
                        style={{ fontSize: Math.round(14 * fontScale) }}
                        className="mt-1 text-center leading-5 text-taupe">
                        {searchQuery
                          ? 'Try clearing your search query.'
                          : 'Add your first farm from the Add tab below'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Today's Todo List */}
                <View
                  className="mt-6 rounded-[28px] border border-white/90 bg-white/85 p-5 shadow-sm shadow-espresso/5"
                  style={
                    isHighContrast
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }>
                  <View className="mb-4 flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text
                        style={{ fontSize: 11 * fontScale }}
                        className="font-bold uppercase tracking-[0.25em] text-cognac">
                        Today&apos;s Schedule
                      </Text>
                      <Text
                        style={{
                          fontSize: 20 * fontScale,
                          color: isHighContrast ? '#000000' : '#2D231E',
                          fontWeight: isHighContrast ? '900' : '800',
                        }}
                        className="mt-0.5 tracking-tight">
                        {activeFarm ? activeFarm.farm_name : 'All Farm Areas'}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12 * fontScale,
                          color: isHighContrast ? '#111111' : '#8C7C70',
                          fontWeight: isHighContrast ? '700' : '500',
                        }}>
                        {showSkeleton
                          ? 'Loading tasks...'
                          : `${allTaskCards.length} task${allTaskCards.length !== 1 ? 's' : ''} for today`}
                      </Text>
                    </View>
                  </View>

                  {showSkeleton ? (
                    <TodoItemsSkeletonList count={3} />
                  ) : allTaskCards.length > 0 ? (
                    paginatedFarmGroups.map((farmGroup: PageFarmGroup) => (
                      <View key={farmGroup.farmId} className="mb-4">
                        {!activeFarm && (
                          <Text
                            style={{ fontSize: Math.round(12 * fontScale) }}
                            className="mb-2 font-bold uppercase tracking-wider text-cognac">
                            {farmGroup.farmName}
                          </Text>
                        )}

                        {farmGroup.plotGroups.map((plotGroup: PagePlotGroup) => (
                          <View key={plotGroup.comboKey} className="mb-3">
                            <Text
                              style={{ fontSize: Math.round(11 * fontScale) }}
                              className="mb-2 ml-1 font-bold uppercase tracking-wider text-taupe">
                              Plot: {plotGroup.plotNamesText}
                            </Text>

                            {plotGroup.taskGroups.map((taskGroup: TaskGroup) => {
                              const todo = taskGroup.todos[0] as TodoItem;
                              const allCompleted = taskGroup.todos.every((t) => t.is_completed);
                              const cardTodo = { ...todo, is_completed: allCompleted };
                              const todoStatus = getTodoScopeStatus(cardTodo, todayKey, todayKey);
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
                                  key={taskGroup.signature}
                                  todo={cardTodo}
                                  status={todoStatus as 'active' | 'completed' | 'late'}
                                  showFarmName={false}
                                  onToggleComplete={
                                    isCheckUpFarm
                                      ? handleCheckUpOpen
                                      : () => toggleTodosComplete(taskGroup.todos as TodoItem[])
                                  }
                                  onEdit={() => handleEditTodo(todo)}
                                  onPress={
                                    isCheckUpFarm
                                      ? handleCheckUpOpen
                                      : () =>
                                          setModalTodoGroup({
                                            todos: taskGroup.todos as TodoItem[],
                                            plotNamesText: plotGroup.plotNamesText,
                                          })
                                  }
                                />
                              );
                            })}
                          </View>
                        ))}

                        {farmGroup.generalTodos.length > 0 && (
                          <View className="mb-3">
                            {farmGroup.generalTodos.map((todo: TodoItem) => {
                              const todoStatus = getTodoScopeStatus(todo, todayKey, todayKey);
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
                                    isCheckUpFarm
                                      ? handleCheckUpOpen
                                      : () => toggleTodosComplete([todo])
                                  }
                                  onEdit={() => handleEditTodo(todo)}
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
                    <View className="rounded-[24px] border border-dashed border-taupe/30 bg-white/40 p-7">
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="text-center font-bold text-espresso">
                        {searchQuery ? `No tasks matching "${searchQuery}"` : 'No tasks for today'}
                      </Text>
                      <Text
                        style={{ fontSize: Math.round(14 * fontScale) }}
                        className="mt-1 text-center leading-5 text-taupe">
                        {searchQuery
                          ? 'Try clearing your search query.'
                          : activeFarm
                            ? `No tasks scheduled for ${activeFarm.farm_name} today.`
                            : 'Select a farm or add tasks from the Calendar tab.'}
                      </Text>
                    </View>
                  )}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <View className="mt-4 flex-row items-center justify-between border-t border-black/5 pt-3.5">
                      <TouchableOpacity
                        onPress={() => {
                          triggerHaptic('light');
                          setCurrentPage((p) => Math.max(1, p - 1));
                        }}
                        disabled={safePage === 1}
                        activeOpacity={0.85}
                        hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                        style={isGloveMode ? { minHeight: 40, justifyContent: 'center' } : undefined}
                        className={`rounded-full px-4 py-2 ${
                          safePage === 1 ? 'bg-black/5' : 'bg-cognac'
                        }`}>
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className={`font-bold ${
                            safePage === 1 ? 'text-taupe' : 'text-white'
                          }`}>
                          Previous
                        </Text>
                      </TouchableOpacity>

                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className="font-semibold text-espresso">
                        Page {safePage} of {totalPages}
                      </Text>

                      <TouchableOpacity
                        onPress={() => {
                          triggerHaptic('light');
                          setCurrentPage((p) => Math.min(totalPages, p + 1));
                        }}
                        disabled={safePage === totalPages}
                        activeOpacity={0.85}
                        hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                        style={isGloveMode ? { minHeight: 40, justifyContent: 'center' } : undefined}
                        className={`rounded-full px-4 py-2 ${
                          safePage === totalPages ? 'bg-black/5' : 'bg-cognac'
                        }`}>
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className={`font-bold ${
                            safePage === totalPages ? 'text-taupe' : 'text-white'
                          }`}>
                          Next
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </>
            )
          )}
        </View>
      </Animated.ScrollView>

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
        plotNamesText={modalTodoGroup?.plotNamesText}
        status={
          modalTodoGroup?.todos[0]
            ? getTodoScopeStatus(
                {
                  ...modalTodoGroup.todos[0],
                  is_completed: modalTodoGroup.todos.every((t) => t.is_completed),
                },
                todayKey,
                todayKey
              )
            : 'active'
        }
        visible={!!modalTodoGroup}
        onClose={() => setModalTodoGroup(null)}
        onEdit={() => {
          if (modalTodoGroup?.todos[0]) {
            const id = modalTodoGroup.todos[0].id;
            setModalTodoGroup(null);
            router.push(`/todo/edit/${id}`);
          }
        }}
        onToggleComplete={() => {
          if (modalTodoGroup) toggleTodosComplete(modalTodoGroup.todos);
        }}
        onUpdateProgress={(newProgress) => {
          if (modalTodoGroup) handleUpdateTodoGroupProgress(modalTodoGroup.todos, newProgress);
        }}
      />

      {/* Turn On Notification Permission Prompt Modal */}
      <AppModal
        visible={isNotificationPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNotificationPromptVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/60 px-5">
          <View className="w-full max-w-sm overflow-hidden rounded-[28px] border border-cognac/20 bg-champagne p-6 shadow-2xl">
            {/* Header Icon */}
            <View className="mb-4 flex-row items-center justify-between">
              <View className="h-12 w-12 items-center justify-center rounded-2xl border border-cognac/30 bg-white shadow-xs">
                <Bell size={24} color="#8C4522" strokeWidth={2.2} />
              </View>
              <TouchableOpacity
                onPress={() => setIsNotificationPromptVisible(false)}
                hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                className="h-8 w-8 items-center justify-center rounded-full bg-black/5 active:bg-black/10"
                activeOpacity={0.7}>
                <X size={18} color="#78716C" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Title & Body */}
            <Text
              style={{ fontSize: Math.round(18 * fontScale) }}
              className="font-black tracking-tight text-espresso">
              Would you like to turn on notifications?
            </Text>
            <Text
              style={{ fontSize: Math.round(12 * fontScale) }}
              className="mt-2 leading-relaxed text-taupe font-medium">
              Stay updated with your daily 5:00 AM Morning Briefing, 5:00 PM Evening Tasks Wrap-up, and real-time team collaboration alerts directly on your device.
            </Text>

            {/* Action Buttons */}
            <View className="mt-6 flex-col gap-2.5">
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic('medium');
                  handleEnableNotifications();
                }}
                disabled={isRequestingPermission}
                activeOpacity={0.85}
                hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                className="flex-row h-12 items-center justify-center rounded-2xl bg-cognac px-4 active:scale-98 shadow-sm">
                {isRequestingPermission ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text
                    style={{ fontSize: Math.round(14 * fontScale) }}
                    className="font-bold text-white tracking-wide">
                    Turn On Notifications
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  triggerHaptic('light');
                  setIsNotificationPromptVisible(false);
                  setIsNotificationModalVisible(true);
                }}
                disabled={isRequestingPermission}
                activeOpacity={0.7}
                hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                className="h-11 items-center justify-center rounded-2xl border border-cognac/20 bg-white/70 px-4 active:bg-white">
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="font-semibold text-espresso">
                  Continue Without Notifications
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </AppModal>

      <NotificationCenterModal
        visible={isNotificationModalVisible}
        onClose={() => {
          setIsNotificationModalVisible(false);
          void loadData();
          void refreshNotifications();
        }}
      />

      {/* Announcement Details Reader Modal */}
      <AnnouncementModal
        announcement={selectedAnnouncement}
        visible={!!selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </View>
  );
}
