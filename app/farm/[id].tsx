import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  View,
  Text,
  TextInput,
  ScrollView,
  Animated,
  BackHandler,
  Keyboard,
  Platform,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../../components/common/AppModal';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { BackButton } from '../../components/common/BackButton';
import CropDetailModal from '../../components/CropDetailModal';
import { TodoItemCard } from '../../components/homePage/TodoItemCard';
import { TodoDetailModal } from '../../components/homePage/TodoDetailModal';
import { FarmHistorySheet } from '../../modules/farm-members/components/FarmHistorySheet';
import { FarmMembersSheet } from '../../modules/farm-members/components/FarmMembersSheet';
import { cropIcons } from '../../lib/cropIcons';
import CropAvatar from '../../components/CropAvatar';
import { Crop } from '../../lib/crop-planner';
import { isCheckUpTask } from '../../lib/todo-grouping';
import {
  deleteFarm,
  getExistingFarmLayoutWithStructures,
  getFarm,
  getTodosByFarm,
  isUserFarmMemberOrOwner,
  TodoItem,
  updateFarm,
  batchUpdateTodosCompletion,
  batchUpdateTodosProgress,
  saveMitigationTodos,
  saveFarmCheckUpResults,
  getLatestFarmCheckUpResult,
  getFarmSuccessionPlan,
  fetchMitigationPlanFromDB,
  fetchDynamicProblemClassesFromDB,
  type CropRotationPlanData,
  type ProblemClassItem,
} from '../../lib/db-operations';
import { useAuth } from '../../lib/AuthContext';
import { isPermissionAllowed } from '../../lib/permissions';
import { analyzeHealthImage } from '../../modules/health-detector';
import type { YoloImageAnalysisResult } from '../../modules/yolo-detector/types';

import { YOLO_CLASS_INDEX } from '../../modules/rfdetr-detector/config';
import {
  ArrowLeft,
  Pencil,
  Plus,
  Trash2,
  Check,
  Users,
  History,
  Activity,
  FileText,
  Leaf,
  CalendarDays,
  Building2,
  ShieldAlert,
} from '../../components/Icons';
import { ChevronRight, X, Layers, Search, Download, Eye } from 'lucide-react-native';
import { FarmRecordsSheet } from '../../components/FarmRecordsSheet';
import { useEffectiveRole } from '../../lib/hooks/useEffectiveRole';
import {
  useDailyReports,
  DailyReportFormModal,
  DailyReportsViewerSheet,
  type DailyReportQuestion,
} from '../../modules/daily-reports';
import { FarmLayout3DViewer } from '../../modules/farm-layout-viewer-3d';
import { type Mitigation } from '../../lib/todo-list-engine';
import {
  getHealthDetectionModel,
  setHealthDetectionModel,
  type HealthDetectionModel,
} from '../../lib/detection-preference';
import {
  isHealthModelDownloaded,
  downloadHealthModel,
  getAvailableEdgeModels,
  setActiveHealthModelId,
  getActiveHealthModelId,
  deleteHealthModel,
  clearYoloModelCache,
  formatModelName,
  getTierLabel,
  type EdgeModel,
} from '../../modules/yolo-detector/modelLoader';
import { parseLocation, stringifyLocation, LocationData } from '../../lib/location-utils';
import LocationPickerModal from '../../components/LocationPickerModal';
import { MapPin } from 'lucide-react-native';
import { useAccessibility } from '../../lib/accessibility';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';

function MoreDotsIcon({ size = 18, color = '#2D231E' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="5" cy="12" r="2" fill={color} />
      <Circle cx="12" cy="12" r="2" fill={color} />
      <Circle cx="19" cy="12" r="2" fill={color} />
    </Svg>
  );
}

// --- Date & Status Evaluation Utilities ---
function pad(number: number) {
  return String(number).padStart(2, '0');
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not available';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString();
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.slice(0, 10).split('-').map(Number);

  if (!year || !month || !day) {
    return formatDateTime(value);
  }

  return new Date(year, month - 1, day).toLocaleDateString();
}

function formatShortLocation(address?: string | null): string {
  if (!address || typeof address !== 'string') return 'Location not set';
  const trimmed = address.trim();
  if (!trimmed) return 'Location not set';

  const segments = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1) {
    return trimmed.length > 30 ? `${trimmed.slice(0, 28)}...` : trimmed;
  }

  // Filter out country name and postal codes
  const filtered = segments.filter((s) => {
    const lower = s.toLowerCase();
    return lower !== 'philippines' && !/^\d{4,6}$/.test(s);
  });

  if (filtered.length === 0) return segments[0];
  if (filtered.length === 1) return filtered[0];

  return filtered.slice(0, 2).join(', ');
}

function isOnOrAfter(leftDateKey: string, rightDateKey: string) {
  return leftDateKey >= rightDateKey;
}

function isOnOrBefore(leftDateKey: string, rightDateKey: string) {
  return leftDateKey <= rightDateKey;
}

function getTodoScopeStatus(todo: any, selectedDateKey: string, todayDateKey: string) {
  const startDateKey = todo.start_date || todo.due_date || todo.created_at.slice(0, 10);
  const dueDateKey = todo.due_date || startDateKey;

  if (!isOnOrAfter(selectedDateKey, startDateKey)) {
    return 'hidden';
  }

  if (todo.is_completed) {
    return isOnOrBefore(selectedDateKey, dueDateKey) ? 'completed' : 'hidden';
  }

  if (selectedDateKey > dueDateKey) {
    return selectedDateKey === todayDateKey ? 'late' : 'hidden';
  }

  return 'active';
}

function toImageUri(path: string) {
  return path.startsWith('file://') ? path : `file://${path}`;
}

// --- Modal related codes ---

const CONDITION_LABELS: Record<number, string> = {
  0: 'Aphid Cluster',
  1: 'Caterpillar',
  2: 'Leaf Discoloration',
  3: 'Leaf Hole',
  4: 'Mold / Fungus',
  5: 'Slug / Snail',
};

const PROBLEM_VISUAL_CUES: Record<string, { icon: string; shortCues: string[] }> = {
  aphid_cluster: {
    icon: '🪲',
    shortCues: ['Tiny clustered insects', 'Sticky honeydew residue'],
  },
  caterpillar: {
    icon: '🐛',
    shortCues: ['Visible worms / larvae', 'Chewed edges & leaf loss'],
  },
  leaf_discoloration: {
    icon: '🍂',
    shortCues: ['Yellow or brown patches', 'Spreading necrotic spots'],
  },
  leaf_hole: {
    icon: '🕳️',
    shortCues: ['Shot holes in leaf blade', 'Ragged irregular cuts'],
  },
  mold_fungus: {
    icon: '🍄',
    shortCues: ['White powdery coating', 'Fuzzy or damp mildew'],
  },
  slug_snail: {
    icon: '🐌',
    shortCues: ['Silvery slime trails', 'Smooth edge bite chunks'],
  },
};

// --- Main Farm Detail Screen ---

export default function FarmDetailScreen() {
  const params = useLocalSearchParams();
  const farmId = Array.isArray(params.id) ? params.id[0] : params.id;
  const todayKey = toDateKey(new Date());
  const { user } = useAuth();
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();
  const { isOnline } = useNetworkStatus();

  const [farm, setFarm] = useState<any | null>(null);
  const [farmLayout, setFarmLayout] = useState<any | null>(null);
  const [farmName, setFarmName] = useState('');
  const [locationObj, setLocationObj] = useState<LocationData | null>(null);
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [areaSqm, setAreaSqm] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState(false);
  const [openingFarmLayout, setOpeningFarmLayout] = useState(false);

  const isOwner = useMemo(() => {
    return Boolean(
      farm?.user_id && user?.id && farm.user_id.toLowerCase() === user.id.toLowerCase()
    );
  }, [farm?.user_id, user?.id]);

  const {
    role: effectiveRole,
    permissions,
  } = useEffectiveRole({ farmId: typeof farmId === 'string' ? farmId : undefined });

  // Farm delete confirmation modal states
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingFarm, setIsDeletingFarm] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [selectedTaskCrop, setSelectedTaskCrop] = useState<Crop | null>(null);
  const [modalTodoGroup, setModalTodoGroup] = useState<{ todos: TodoItem[] } | null>(null);
  const modalGroupTodoIds = useMemo(
    () => (modalTodoGroup ? modalTodoGroup.todos.map((t) => t.id) : undefined),
    [modalTodoGroup]
  );
  const [isLoading, setIsLoading] = useState(true);

  // Guard editing mode: only farm owner or admin can be in edit mode
  useEffect(() => {
    if (editing && !permissions.canEditFarm && !isLoading) {
      setEditing(false);
    }
  }, [editing, permissions.canEditFarm, isLoading]);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;
  const [activePlans, setActivePlans] = useState<CropRotationPlanData[]>([]);

  // --- AI State Engine Workspaces ---
  const [selectedCheckUpTodos, setSelectedCheckUpTodos] = useState<any[] | null>(null);
  const [dynamicProblems, setDynamicProblems] = useState<ProblemClassItem[]>([]);

  const [checkUpImageUri, setCheckUpImageUri] = useState<string | null>(null);
  const [checkUpResult, setCheckUpResult] = useState<YoloImageAnalysisResult | null>(null);
  const [checkUpError, setCheckUpError] = useState<string | null>(null);
  const [analyzingCheckUp, setAnalyzingCheckUp] = useState(false);
  const [selectedDetectionModel, setSelectedDetectionModel] =
    useState<HealthDetectionModel>('yolo');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isDownloadingEdgeModel, setIsDownloadingEdgeModel] = useState(false);
  const [edgeModelDownloadProgress, setEdgeModelDownloadProgress] = useState(0);

  const [isEdgeModelModalVisible, setIsEdgeModelModalVisible] = useState(false);
  const [downloadedModels, setDownloadedModels] = useState<Record<string, boolean>>({});
  const [activeEdgeModel, setActiveEdgeModel] = useState<string | null>(null);
  const [availableEdgeModels, setAvailableEdgeModels] = useState<EdgeModel[]>([]);
  const [isBlueprintModalVisible, setIsBlueprintModalVisible] = useState(false);
  const [isHistorySheetVisible, setIsHistorySheetVisible] = useState(false);
  const [isMembersSheetVisible, setIsMembersSheetVisible] = useState(false);
  const [isRecordsSheetVisible, setIsRecordsSheetVisible] = useState(false);
  const [expandedLayoutGroups, setExpandedLayoutGroups] = useState<Record<number, boolean>>({});
  const [expandedUnassigned, setExpandedUnassigned] = useState(false);

  // --- Daily Field Observation Reports ---
  const [isDailyReportFormOpen, setIsDailyReportFormOpen] = useState(false);
  const [isDailyReportViewerOpen, setIsDailyReportViewerOpen] = useState(false);
  const [isDailyReminderDismissed, setIsDailyReminderDismissed] = useState(false);

  const {
    reports: dailyReports,
    plots: dailyReportPlots,
    questions: dailyReportQuestions,
    hasReportedToday,
    submitting: isDailyReportSubmitting,
    submitReport: handleDailyReportSubmit,
    removeReport: handleDailyReportRemove,
  } = useDailyReports(farmId, user?.id);

  useEffect(() => {
    if (isEdgeModelModalVisible) {
      const checkDownloads = async () => {
        const models = await getAvailableEdgeModels();
        setAvailableEdgeModels(models);

        const statuses: Record<string, boolean> = {};
        for (const model of models) {
          statuses[model.modelName] = await isHealthModelDownloaded(model.modelName);
        }
        setDownloadedModels(statuses);
        const currentActive = await getActiveHealthModelId();
        setActiveEdgeModel(currentActive);
      };
      checkDownloads();
    }
  }, [isEdgeModelModalVisible]);

  const handledCheckUpParamRef = useRef<string | null>(null);

  useEffect(() => {
    if (!params.openCheckUp) {
      handledCheckUpParamRef.current = null;
      return;
    }

    if (todos.length > 0 && !selectedCheckUpTodos) {
      const rawParam = Array.isArray(params.openCheckUp)
        ? params.openCheckUp.join(',')
        : String(params.openCheckUp);

      if (handledCheckUpParamRef.current === rawParam) {
        return;
      }

      const targetIds = rawParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const matchingTodos = todos.filter((t) => targetIds.includes(t.id));
      if (matchingTodos.length > 0) {
        handledCheckUpParamRef.current = rawParam;
        router.setParams({ openCheckUp: undefined });
        setTimeout(() => {
          openCheckUpModal(matchingTodos);
        }, 100);
      }
    }
  }, [params.openCheckUp, todos, selectedCheckUpTodos]);

  // --- Modal ---
  const [page, setPage] = useState(1);
  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no' | null>>({});
  const [expandedMitigation, setExpandedMitigation] = useState<Record<string | number, boolean>>(
    {}
  );
  const [dbMitigations, setDbMitigations] = useState<Record<string | number, Mitigation[]>>({});
  const [isViewingSavedResult, setIsViewingSavedResult] = useState(false);
  const [savedCheckUpRecord, setSavedCheckUpRecord] = useState<any>(null);
  const isSavingCheckUpRef = useRef(false);

  // Step 2 checklist states
  const [step2SearchQuery, setStep2SearchQuery] = useState('');
  const [step2CategoryFilter, setStep2CategoryFilter] = useState<
    'all' | 'pest' | 'disease' | 'other' | 'spotted'
  >('all');
  const [step2CurrentPage, setStep2CurrentPage] = useState(1);
  const [step2HasOtherIssue, setStep2HasOtherIssue] = useState(false);
  const [step2OtherIssueText, setStep2OtherIssueText] = useState('');

  // Step 4 multi-mitigation staging & finishing states
  const [selectedMitigationClasses, setSelectedMitigationClasses] = useState<
    Record<string, boolean>
  >({});
  const [addingMitigationId, setAddingMitigationId] = useState<string | null>(null);
  const [isFinishingCheckUp, setIsFinishingCheckUp] = useState(false);

  // Lazy layout shimmer transitions reference drivers
  const shimmerValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (analyzingCheckUp) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerValue, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(shimmerValue, { toValue: 0, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [analyzingCheckUp, shimmerValue]);

  const shimmerOpacity = shimmerValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.65],
  });

  const loadFarmData = useCallback(async () => {
    if (!farmId) {
      setIsLoading(false);
      return;
    }

    try {
      const [loadedFarm, loadedFarmLayout, loadedTodos, loadedPlan] = await Promise.all([
        getFarm(farmId),
        getExistingFarmLayoutWithStructures(farmId),
        getTodosByFarm(farmId),
        getFarmSuccessionPlan(farmId),
      ]);

      setFarm(loadedFarm);
      setFarmLayout(loadedFarmLayout);
      setTodos(loadedTodos);
      if (loadedPlan && loadedPlan.planData) {
        setActivePlans(
          Array.isArray(loadedPlan.planData) ? loadedPlan.planData : [loadedPlan.planData]
        );
      } else {
        setActivePlans([]);
      }

      if (loadedFarm && user?.id) {
        const authorized = await isUserFarmMemberOrOwner(farmId, user.id);
        setIsAuthorized(authorized);
      } else if (!loadedFarm) {
        setIsAuthorized(null);
      }

      if (loadedFarm) {
        setFarmName(loadedFarm.farm_name || '');
        setLocationObj(parseLocation(loadedFarm.location));
        setAreaSqm(
          loadedFarm.area_sqm !== null && loadedFarm.area_sqm !== undefined
            ? String(loadedFarm.area_sqm)
            : ''
        );
        setDescription(loadedFarm.description || '');
      }
    } finally {
      setIsLoading(false);
    }
  }, [farmId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadFarmData();
    }, [loadFarmData])
  );

  // Unity AppState listener removed — layout is now handled by the native designer.

  const hasActiveCropPlan = useMemo(() => {
    return Boolean(
      activePlans &&
      activePlans.length > 0 &&
      activePlans.some((p) => Array.isArray(p?.selectedCrops) && p.selectedCrops.length > 0)
    );
  }, [activePlans]);

  const visibleTodos = useMemo(() => {
    return todos.filter((todo) => {
      if (!hasActiveCropPlan && !todo.is_completed) {
        return true;
      }
      return getTodoScopeStatus(todo, todayKey, todayKey) !== 'hidden';
    });
  }, [todos, todayKey, hasActiveCropPlan]);

  // Group visible todos into visual cards (by signature for plot-assigned todos)
  // so pagination counts actual rendered cards, not raw individual todo items.
  const groupedTaskCards = useMemo(() => {
    const generalTodos: TodoItem[] = [];
    const taskSignatureMap = new Map<
      string,
      {
        signature: string;
        plotIds: Set<string>;
        plotNames: Set<string>;
        todos: TodoItem[];
      }
    >();

    visibleTodos.forEach((todo) => {
      if (todo.garden_structure_id) {
        const signature = `${todo.title}|${todo.notes}|${todo.start_date}|${todo.due_date}`;
        if (!taskSignatureMap.has(signature)) {
          taskSignatureMap.set(signature, {
            signature,
            plotIds: new Set(),
            plotNames: new Set(),
            todos: [],
          });
        }
        const taskGroup = taskSignatureMap.get(signature)!;
        taskGroup.todos.push(todo);
        taskGroup.plotIds.add(todo.garden_structure_id);

        const plot = farmLayout?.structures.find((s: any) => s.id === todo.garden_structure_id);
        const plotName = plot ? plot.label || plot.type_name || 'Plot' : 'Unknown Plot';
        taskGroup.plotNames.add(plotName);
      } else {
        generalTodos.push(todo);
      }
    });

    // Build a flat list of visual card items for pagination
    type CardItem =
      | { type: 'general'; todo: TodoItem }
      | {
          type: 'group';
          group: {
            signature: string;
            plotNames: Set<string>;
            plotIds: Set<string>;
            todos: TodoItem[];
          };
          comboKey: string;
          plotNamesText: string;
        };

    const cards: CardItem[] = [];

    // General todos each become one card
    generalTodos.forEach((todo) => {
      cards.push({ type: 'general', todo });
    });

    // Grouped plot todos: each signature group becomes one card
    const plotGroupMap = new Map<
      string,
      {
        plotNamesText: string;
        taskGroups: typeof taskSignatureMap extends Map<string, infer V> ? V[] : never;
      }
    >();

    taskSignatureMap.forEach((taskGroup) => {
      const plotIdsArray = Array.from(taskGroup.plotIds).sort();
      const comboKey = plotIdsArray.join(',');

      if (!plotGroupMap.has(comboKey)) {
        const plotNamesText = Array.from(taskGroup.plotNames).sort().join(', ');
        plotGroupMap.set(comboKey, { plotNamesText, taskGroups: [] });
      }
      plotGroupMap.get(comboKey)!.taskGroups.push(taskGroup);
    });

    plotGroupMap.forEach((groupData, comboKey) => {
      groupData.taskGroups.forEach((group) => {
        cards.push({ type: 'group', group, comboKey, plotNamesText: groupData.plotNamesText });
      });
    });

    return { cards, generalTodos, plotGroupMap };
  }, [visibleTodos, farmLayout]);

  const totalVisualCards = groupedTaskCards.cards.length;
  const totalPages = Math.ceil(totalVisualCards / ITEMS_PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCards = groupedTaskCards.cards.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  );

  // AI detected class set for Step 2 visual confirmation
  const aiDetectedProblemIds = useMemo(() => {
    const set = new Set<string>();
    checkUpResult?.health?.allDetections?.forEach((item: any) => {
      const slug =
        item.className ||
        Object.keys(YOLO_CLASS_INDEX).find((k) => YOLO_CLASS_INDEX[k] === item.classIndex) ||
        String(item.classIndex);
      if (slug) set.add(slug);
    });
    return set;
  }, [checkUpResult]);

  function getCheckUpQuestionCategory(q: DailyReportQuestion): 'pest' | 'disease' {
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

  const checkUpQuestions = useMemo<DailyReportQuestion[]>(() => {
    if (dailyReportQuestions && dailyReportQuestions.length > 0) {
      return dailyReportQuestions;
    }
    const extracted: DailyReportQuestion[] = [];
    if (dynamicProblems && dynamicProblems.length > 0) {
      dynamicProblems.forEach((pc) => {
        const categoryName =
          pc.name ||
          (CONDITION_LABELS as any)[pc.id] ||
          pc.id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const rawCat = (pc.category || '').toLowerCase();
        const isDisease =
          rawCat === 'disease' ||
          pc.id.includes('disease') ||
          pc.id.includes('discolor') ||
          pc.id.includes('fung') ||
          pc.id.includes('mold') ||
          pc.id.includes('rot') ||
          pc.id.includes('spot') ||
          pc.id.includes('mildew');
        const classCategory =
          rawCat === 'pest' || rawCat === 'disease' ? rawCat : isDisease ? 'disease' : 'pest';

        if (Array.isArray(pc.questions) && pc.questions.length > 0) {
          pc.questions.forEach((qText, idx) => {
            if (qText && typeof qText === 'string' && qText.trim()) {
              extracted.push({
                id: `pc_${pc.id}_${idx}`,
                category: pc.id,
                categoryName,
                question: qText.trim(),
                weight: 1,
                classCategory,
              });
            }
          });
        }
      });
    }
    return extracted;
  }, [dailyReportQuestions, dynamicProblems]);

  const isProblemValidated = useCallback(
    (problemId: string) => {
      if (answers[problemId] === 'yes' || answers[`dyn_${problemId}`] === 'yes') {
        return true;
      }
      const prob = dynamicProblems.find((p) => p.id === problemId);
      if (prob && prob.questions && prob.questions.length > 0) {
        if (
          prob.questions.some(
            (_q, idx) =>
              answers[`dyn_${problemId}_${idx}`] === 'yes' ||
              answers[`pc_${problemId}_${idx}`] === 'yes'
          )
        ) {
          return true;
        }
      }
      return checkUpQuestions.some((q) => q.category === problemId && answers[q.id] === 'yes');
    },
    [answers, dynamicProblems, checkUpQuestions]
  );

  const handleToggleCheckUpQuestion = useCallback(
    (qId: string) => {
      triggerHaptic('selection');
      setAnswers((prev) => {
        const next = { ...prev };
        if (next[qId] === 'yes') {
          delete next[qId];
        } else {
          next[qId] = 'yes';
        }
        return next;
      });
    },
    [triggerHaptic]
  );

  const handleClearAllStep2Spotted = useCallback(() => {
    triggerHaptic('selection');
    setAnswers((prev) => {
      const next = { ...prev };
      checkUpQuestions.forEach((q) => {
        delete next[q.id];
        delete next[q.category];
        delete next[`dyn_${q.category}`];
      });
      return next;
    });
    setStep2HasOtherIssue(false);
    setStep2OtherIssueText('');
  }, [checkUpQuestions, triggerHaptic]);

  const step2SpottedCount = useMemo(() => {
    const spotted = checkUpQuestions.filter((q) => answers[q.id] === 'yes').length;
    return spotted + (step2HasOtherIssue ? 1 : 0);
  }, [checkUpQuestions, answers, step2HasOtherIssue]);

  const step2PestCount = useMemo(
    () => checkUpQuestions.filter((q) => getCheckUpQuestionCategory(q) === 'pest').length,
    [checkUpQuestions]
  );

  const step2DiseaseCount = useMemo(
    () => checkUpQuestions.filter((q) => getCheckUpQuestionCategory(q) === 'disease').length,
    [checkUpQuestions]
  );

  const STEP2_ITEMS_PER_PAGE = 6;

  useEffect(() => {
    setStep2CurrentPage(1);
  }, [step2SearchQuery, step2CategoryFilter]);

  const filteredCheckUpQuestions = useMemo(() => {
    const query = step2SearchQuery.trim().toLowerCase();
    return checkUpQuestions.filter((q) => {
      if (step2CategoryFilter === 'spotted') {
        if (answers[q.id] !== 'yes') return false;
      } else if (step2CategoryFilter === 'pest') {
        if (getCheckUpQuestionCategory(q) !== 'pest') return false;
      } else if (step2CategoryFilter === 'disease') {
        if (getCheckUpQuestionCategory(q) !== 'disease') return false;
      } else if (step2CategoryFilter === 'other') {
        return false;
      }

      if (query) {
        const matchName = q.categoryName.toLowerCase().includes(query);
        const matchQuestion = q.question.toLowerCase().includes(query);
        const matchCategory = q.category.toLowerCase().includes(query);
        if (!matchName && !matchQuestion && !matchCategory) return false;
      }
      return true;
    });
  }, [checkUpQuestions, step2SearchQuery, step2CategoryFilter, answers]);

  const step2TotalPages = Math.max(
    1,
    Math.ceil(filteredCheckUpQuestions.length / STEP2_ITEMS_PER_PAGE)
  );
  const step2SafeCurrentPage = Math.min(step2CurrentPage, step2TotalPages);

  const paginatedCheckUpQuestions = useMemo(() => {
    const startIdx = (step2SafeCurrentPage - 1) * STEP2_ITEMS_PER_PAGE;
    return filteredCheckUpQuestions.slice(startIdx, startIdx + STEP2_ITEMS_PER_PAGE);
  }, [filteredCheckUpQuestions, step2SafeCurrentPage]);

  const shouldShowStep2OthersCard = useMemo(() => {
    if (step2CategoryFilter === 'other') return true;
    if (step2CategoryFilter === 'pest' || step2CategoryFilter === 'disease') return false;
    if (step2CategoryFilter === 'spotted') return step2HasOtherIssue;
    if (step2SearchQuery.trim()) {
      return 'other unlisted custom'.includes(step2SearchQuery.trim().toLowerCase());
    }
    return step2SafeCurrentPage === step2TotalPages;
  }, [step2CategoryFilter, step2HasOtherIssue, step2SearchQuery, step2SafeCurrentPage, step2TotalPages]);

  const validatedCount = useMemo(() => {
    return dynamicProblems.filter((p) => isProblemValidated(p.id)).length;
  }, [dynamicProblems, isProblemValidated]);

  // --- Questionnaire score helpers (must be above early returns for the useEffect below) ---
  const getQuestionnaireScores = (): Record<string, number> => {
    const scores: Record<string, number> = {};
    dynamicProblems.forEach((problem) => {
      let matched = 0;
      const probQuestions = checkUpQuestions.filter((q) => q.category === problem.id);
      if (probQuestions.length > 0) {
        probQuestions.forEach((q) => {
          if (answers[q.id] === 'yes') matched += 1;
        });
      } else if (problem.questions) {
        problem.questions.forEach((_q: string, idx: number) => {
          if (
            answers[`dyn_${problem.id}_${idx}`] === 'yes' ||
            answers[`pc_${problem.id}_${idx}`] === 'yes'
          ) {
            matched += 1;
          }
        });
      }
      if (answers[problem.id] === 'yes' || answers[`dyn_${problem.id}`] === 'yes') {
        matched = Math.max(matched, 1);
      }
      scores[problem.id] = matched;
    });
    return scores;
  };

  const getQuestionnaireMaxScores = (): Record<string, number> => {
    const max: Record<string, number> = {};
    dynamicProblems.forEach((problem) => {
      const probQuestions = checkUpQuestions.filter((q) => q.category === problem.id);
      max[problem.id] = Math.max(probQuestions.length || problem.questions?.length || 2, 1);
    });
    return max;
  };

  const getCombinedScores = (): Record<string, number> => {
    const combined = getQuestionnaireScores();
    checkUpResult?.health?.allDetections?.forEach((item: any) => {
      const slug =
        item.className ||
        Object.keys(YOLO_CLASS_INDEX).find((k) => YOLO_CLASS_INDEX[k] === item.classIndex) ||
        String(item.classIndex);
      combined[slug] = (combined[slug] ?? 0) + 1;
    });
    return combined;
  };

  const getSortedProblems = () => {
    const combined = getCombinedScores();
    return Object.entries(combined)
      .map(([classId, score]) => ({ classId, score }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score);
  };

  const questionnaireScores = getQuestionnaireScores();
  const questionnaireMax = getQuestionnaireMaxScores();
  const sortedProblems = getSortedProblems();

  const handleStageMitigation = (classId: string) => {
    triggerHaptic('selection');
    setAddingMitigationId(classId);
    setTimeout(() => {
      setSelectedMitigationClasses((prev) => ({ ...prev, [classId]: true }));
      setAddingMitigationId(null);
      triggerHaptic('success');
    }, 250);
  };

  const handleUnstageMitigation = (classId: string) => {
    triggerHaptic('selection');
    setSelectedMitigationClasses((prev) => {
      const next = { ...prev };
      delete next[classId];
      return next;
    });
  };

  const handleFinishCheckUp = async () => {
    if (!farmId || !user?.id) {
      Alert.alert('Missing session', 'Sign in again before saving.');
      return;
    }

    setIsFinishingCheckUp(true);
    try {
      const primaryTodo = selectedCheckUpTodos?.[0];
      const gardenStructureId = primaryTodo?.garden_structure_id || null;
      const planIdMatch = primaryTodo?.notes?.match(/\[PlanRef:([^\]]+)\]/);
      const planId = planIdMatch ? planIdMatch[1] : null;

      // 1. Save all staged mitigations
      const stagedProblems = sortedProblems.filter((p) => selectedMitigationClasses[p.classId]);

      for (const problem of stagedProblems) {
        const classId = problem.classId;
        const mitigationSteps: Mitigation[] | null = dbMitigations[classId] || null;
        if (mitigationSteps && mitigationSteps.length > 0) {
          const dyn = dynamicProblems.find((d) => d.id === classId);
          let label = '';
          if (dyn) {
            label = dyn.name;
          } else if (typeof (classId as unknown) === 'number') {
            label = formatLabel(
              (CONDITION_LABELS as any)[classId as unknown as number] || `Unknown (${classId})`
            );
          } else {
            label = formatLabel(String(classId));
          }

          await saveMitigationTodos({
            userId: user.id,
            farmId: farmId as string,
            problemName: label,
            mitigationSteps,
            gardenStructureId,
            planId,
          });
        }
      }

      // 2. Ensure checkup diagnosis results are saved in DB
      if (!savedCheckUpRecord && checkUpResult && !isViewingSavedResult) {
        const summaryData = {
          modelResults: checkUpResult,
          questionnaireScores: questionnaireScores,
          identifiedProblems: sortedProblems,
        };
        await saveFarmCheckUpResults({
          userId: user.id,
          farmId: farmId as string,
          imageUri: checkUpImageUri,
          summaryData,
        });
      }

      // 3. Mark the check-up todo item as completed
      if (selectedCheckUpTodos && selectedCheckUpTodos.length > 0) {
        await batchUpdateTodosCompletion({
          todoIds: selectedCheckUpTodos.map((t) => t.id),
          isCompleted: true,
          userId: user?.id,
        });
      }

      if (stagedProblems.length > 0) {
        Alert.alert(
          'Check-up Finished',
          `${stagedProblems.length} mitigation plan${
            stagedProblems.length !== 1 ? 's were' : ' was'
          } added to your farm tasks.`
        );
      } else {
        Alert.alert('Check-up Finished', 'Health check-up completed successfully.');
      }

      forceCloseCheckUpModal();
      void loadFarmData();
    } catch (error) {
      console.error('Failed to complete check-up:', error);
      Alert.alert('Save failed', 'Unable to complete check-up tasks.');
    } finally {
      setIsFinishingCheckUp(false);
    }
  };

  useEffect(() => {
    const fetchMitigationsForProblems = async () => {
      const mitigationsMap: Record<string | number, Mitigation[]> = {};

      for (const problem of sortedProblems) {
        const slug =
          typeof (problem.classId as unknown) === 'number'
            ? Object.keys(YOLO_CLASS_INDEX).find(
                (k) => YOLO_CLASS_INDEX[k] === (problem.classId as unknown as number)
              ) || ''
            : problem.classId;
        if (slug) {
          const mitigations = await fetchMitigationPlanFromDB(slug);
          mitigationsMap[problem.classId] = mitigations;
        }
      }
      setDbMitigations(mitigationsMap);
    };

    if (page === 4 && sortedProblems.length > 0) {
      void fetchMitigationsForProblems();
    }
  }, [page, sortedProblems.length]);

  const handleSave = async () => {
    if (!farmId) {
      return;
    }

    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the farm owner can edit farm details.');
      setEditing(false);
      return;
    }

    await updateFarm(farmId, {
      farmName: farmName.trim(),
      location: locationObj ? stringifyLocation(locationObj) : undefined,
      areaSqm: areaSqm ? Number(areaSqm) : undefined,
      description: description.trim(),
    });

    await loadFarmData();
    setEditing(false);
    Alert.alert('Saved', 'Farm details were updated locally.');
  };

  const handleDelete = () => {
    if (!farmId) {
      return;
    }

    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the farm owner can delete this farm.');
      return;
    }

    triggerHaptic('warning');
    setDeleteConfirmText('');
    setIsDeleteModalVisible(true);
  };

  const handleConfirmDeleteFarm = async () => {
    if (!farmId || !isOwner) {
      Alert.alert('Permission Denied', 'Only the farm owner can delete this farm.');
      setIsDeleteModalVisible(false);
      return;
    }

    if (deleteConfirmText !== 'CONFIRM') {
      triggerHaptic('error');
      Alert.alert(
        'Confirmation Mismatch',
        'You must type "CONFIRM" in exact uppercase to delete this farm.'
      );
      return;
    }

    try {
      setIsDeletingFarm(true);
      triggerHaptic('heavy');
      await deleteFarm(farmId, user?.id);
      setIsDeleteModalVisible(false);
      setDeleteConfirmText('');
      router.replace('/(tabs)/farms');
    } catch (err) {
      console.error('Failed to delete farm:', err);
      Alert.alert(
        'Deletion Failed',
        'An error occurred while attempting to delete the farm. Please try again.'
      );
    } finally {
      setIsDeletingFarm(false);
    }
  };

  const handleOpenFarmLayout = () => {
    if (!farmId) {
      return;
    }
    router.push(`/farm/layout-designer/${farmId}`);
  };

  const handleBack = () => {
    router.replace('/(tabs)/farms');
  };

  const resetCheckUpAiState = () => {
    setCheckUpImageUri(null);
    setCheckUpResult(null);
    setCheckUpError(null);
    setAnalyzingCheckUp(false);
  };

  const closeCheckUpModal = () => {
    setSelectedCheckUpTodos(null);
    resetCheckUpAiState();
  };

  const forceCloseCheckUpModal = () => {
    setPage(1);
    setAnswers({});
    setExpandedMitigation({});
    setSelectedMitigationClasses({});
    setAddingMitigationId(null);
    setIsFinishingCheckUp(false);
    setStep2SearchQuery('');
    setStep2CategoryFilter('all');
    setStep2CurrentPage(1);
    setStep2HasOtherIssue(false);
    setStep2OtherIssueText('');
    setIsViewingSavedResult(false);
    setSavedCheckUpRecord(null);
    closeCheckUpModal();
    void loadFarmData();
  };

  const handleCloseCheckUpModal = () => {
    // If user is in the middle of live check-up, ask for confirmation to prevent accidental loss
    if (!isViewingSavedResult && checkUpImageUri && page < 4) {
      Alert.alert(
        'Exit Check-up?',
        'Your photo analysis and current assessment progress will be lost. Are you sure you want to exit?',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Exit & Discard',
            style: 'destructive',
            onPress: forceCloseCheckUpModal,
          },
        ]
      );
      return;
    }
    forceCloseCheckUpModal();
  };

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isBlueprintModalVisible) {
          setIsBlueprintModalVisible(false);
          return true;
        }
        if (selectedCheckUpTodos) {
          handleCloseCheckUpModal();
          return true;
        }
        if (isEdgeModelModalVisible) {
          setIsEdgeModelModalVisible(false);
          return true;
        }
        if (isDeleteModalVisible) {
          Keyboard.dismiss();
          setIsDeleteModalVisible(false);
          setDeleteConfirmText('');
          return true;
        }
        if (isLocationModalVisible) {
          setIsLocationModalVisible(false);
          return true;
        }
        if (isDailyReportFormOpen) {
          setIsDailyReportFormOpen(false);
          return true;
        }
        if (isDailyReportViewerOpen) {
          setIsDailyReportViewerOpen(false);
          return true;
        }
        if (isMembersSheetVisible) {
          setIsMembersSheetVisible(false);
          return true;
        }
        if (isRecordsSheetVisible) {
          setIsRecordsSheetVisible(false);
          return true;
        }
        if (isHistorySheetVisible) {
          setIsHistorySheetVisible(false);
          return true;
        }
        handleBack();
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [
      isBlueprintModalVisible,
      selectedCheckUpTodos,
      isEdgeModelModalVisible,
      isDeleteModalVisible,
      isLocationModalVisible,
      isDailyReportFormOpen,
      isDailyReportViewerOpen,
      isMembersSheetVisible,
      isRecordsSheetVisible,
      isHistorySheetVisible,
      handleCloseCheckUpModal,
      handleBack,
    ])
  );

  const openCheckUpModal = async (todos: any[]) => {
    const savedModel = await getHealthDetectionModel();
    setSelectedDetectionModel(savedModel);
    setSelectedCheckUpTodos(todos);
    const problems = await fetchDynamicProblemClassesFromDB();
    setDynamicProblems(problems);

    const firstTodo = todos?.[0];
    // If the task is completed and a saved checkup result exists, load it directly
    if (firstTodo?.is_completed && farmId) {
      try {
        const latestResult = await getLatestFarmCheckUpResult(farmId as string);
        if (latestResult && latestResult.summary_data) {
          setIsViewingSavedResult(true);
          setSavedCheckUpRecord(latestResult);
          setCheckUpImageUri(latestResult.image_uri);
          setCheckUpResult(latestResult.summary_data.modelResults || null);
          setPage(3);
          return;
        }
      } catch (err) {
        console.warn('Could not load saved checkup record:', err);
      }
    }

    setIsViewingSavedResult(false);
    setSavedCheckUpRecord(null);
    resetCheckUpAiState();
    setAnswers({});
    setPage(1);
  };

  const handleModelSwitch = async (model: HealthDetectionModel) => {
    if (model === 'rfdetr' && !isOnline) return;
    if (model === 'yolo') {
      setIsEdgeModelModalVisible(true);
      return; // Open modal instead of just downloading
    }

    setSelectedDetectionModel(model);
    await setHealthDetectionModel(model);
  };

  const handleEdgeModelSelect = async (edgeModel: EdgeModel) => {
    const isDownloaded = await isHealthModelDownloaded(edgeModel.modelName);
    if (!isDownloaded) {
      if (!isOnline) return;
      Alert.alert(
        'Model Required',
        `The ${edgeModel.modelName} model is not yet downloaded. Would you like to download it now?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Download',
            onPress: async () => {
              if (!isOnline) return;
              setIsDownloadingEdgeModel(true);
              try {
                await downloadHealthModel(edgeModel.modelName, (progress) =>
                  setEdgeModelDownloadProgress(progress)
                );
                await setActiveHealthModelId(edgeModel.modelName);
                setActiveEdgeModel(edgeModel.modelName);
                setSelectedDetectionModel('yolo');
                await setHealthDetectionModel('yolo');
                setIsEdgeModelModalVisible(false);
                setDownloadedModels((prev) => ({ ...prev, [edgeModel.modelName]: true }));
                Alert.alert('Success', `${edgeModel.modelName} downloaded successfully!`);
              } catch (e) {
                Alert.alert('Error', 'Failed to download the model.');
              } finally {
                setIsDownloadingEdgeModel(false);
                setEdgeModelDownloadProgress(0);
              }
            },
          },
        ]
      );
    } else {
      await setActiveHealthModelId(edgeModel.modelName);
      setActiveEdgeModel(edgeModel.modelName);
      setSelectedDetectionModel('yolo');
      await setHealthDetectionModel('yolo');
      setIsEdgeModelModalVisible(false);
    }
  };

  const handleDeleteEdgeModel = async (modelName: string) => {
    Alert.alert(
      'Delete Model',
      `Are you sure you want to delete the ${modelName} model from your device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteHealthModel(modelName);
              setDownloadedModels((prev) => ({ ...prev, [modelName]: false }));
              const currentActive = await getActiveHealthModelId();
              if (modelName === currentActive) {
                clearYoloModelCache();
                setSelectedDetectionModel('rfdetr');
                await setHealthDetectionModel('rfdetr');
              }
              Alert.alert('Deleted', `${modelName} has been removed.`);
            } catch (e) {
              Alert.alert('Error', 'Failed to delete the model.');
            }
          },
        },
      ]
    );
  };

  const analyzeCheckUpImage = async (imageUri: string) => {
    if (selectedDetectionModel === 'rfdetr' && !isOnline) {
      Alert.alert('Internet Required', 'Select an installed EDGE model to analyze this photo offline.');
      return;
    }
    setCheckUpImageUri(imageUri);
    setCheckUpResult(null);
    setCheckUpError(null);
    setAnalyzingCheckUp(true);

    try {
      const result = await analyzeHealthImage(imageUri, selectedDetectionModel);
      setCheckUpResult(result);
    } catch (error: any) {
      setCheckUpError(error.message || 'AI analysis failed.');
    } finally {
      setAnalyzingCheckUp(false);
    }
  };

  const takeCheckUpPhoto = async () => {
    const allowed = await isPermissionAllowed('camera');
    if (!allowed) {
      Alert.alert(
        'Camera Permission Required',
        'Camera access is currently turned OFF in your SoilSync Privacy Settings. Please enable it in Settings > Privacy.'
      );
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (permission.status !== 'granted') {
      Alert.alert('Camera access needed', 'Please allow camera access to take a check-up photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      await analyzeCheckUpImage(result.assets[0].uri);
    }
  };

  const uploadCheckUpPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.status !== 'granted') {
      Alert.alert('Photo access needed', 'Please allow photo access to upload a check-up image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      await analyzeCheckUpImage(result.assets[0].uri);
    }
  };

  const toggleTodosComplete = async (todosToUpdate: TodoItem[]) => {
    const allCompleted = todosToUpdate.every((t) => t.is_completed);
    const newCompleted = !allCompleted;
    const todoIds = todosToUpdate.map((t) => t.id);
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
      await loadFarmData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update todo status.');
      await loadFarmData();
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
      await loadFarmData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update task progress.');
      await loadFarmData();
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-champagne">
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (!farm) {
    return (
      <View className="flex-1 items-center justify-center bg-champagne px-6">
        <Text
          style={{ fontSize: Math.round(18 * fontScale) }}
          className="font-semibold text-espresso">
          Farm not found
        </Text>
        <Pressable
          onPress={handleBack}
          hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
          style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
          className="shadow-xs mt-4 rounded-full bg-cognac px-5 py-3 active:scale-95">
          <Text
            style={{ fontSize: Math.round(14 * fontScale) }}
            className="font-semibold text-white">
            Back
          </Text>
        </Pressable>
      </View>
    );
  }

  if (isAuthorized === false) {
    return (
      <View className="flex-1 items-center justify-center bg-champagne px-6">
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10">
          <ShieldAlert size={32} color="#E11D48" />
        </View>
        <Text
          style={{ fontSize: Math.round(20 * fontScale) }}
          className="text-center font-bold text-espresso">
          Access Restricted
        </Text>
        <Text
          style={{ fontSize: Math.round(14 * fontScale) }}
          className="mt-2 max-w-xs text-center text-taupe">
          Only the farm owner and invited team members have access to this farm.
        </Text>
        <Pressable
          onPress={handleBack}
          hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
          style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
          className="mt-6 rounded-2xl bg-cognac px-6 py-3.5 shadow-sm active:scale-95">
          <Text
            style={{ fontSize: Math.round(14 * fontScale) }}
            className="font-bold text-white">
            Back to Farms
          </Text>
        </Pressable>
      </View>
    );
  }

  // --- Modal ---

  const handleRetakeAssessment = () => {
    setIsViewingSavedResult(false);
    setSavedCheckUpRecord(null);
    resetCheckUpAiState();
    setAnswers({});
    setSelectedMitigationClasses({});
    setAddingMitigationId(null);
    setIsFinishingCheckUp(false);
    setStep2SearchQuery('');
    setStep2CategoryFilter('all');
    setStep2CurrentPage(1);
    setStep2HasOtherIssue(false);
    setStep2OtherIssueText('');
    setPage(1);
  };

  const formatLabel = (label: string) =>
    label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const handleAnswerSelect = (questionId: string, value: 'yes' | 'no') => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMitigation = (classId: string | number) => {
    setExpandedMitigation((prev) => ({ ...prev, [classId]: !prev[classId] }));
  };

  const goNext = () => setPage((p) => Math.min(p + 1, 4));
  const goBack = () => setPage((p) => Math.max(p - 1, 1));

  const getPageTitle = () => {
    if (isViewingSavedResult) {
      return page === 4 ? 'Mitigation Plan' : 'Recorded Diagnosis Result';
    }
    switch (page) {
      case 1:
        return 'Step 1 of 4 · Photo Analysis';
      case 2:
        return 'Step 2 of 4 · Human Validation';
      case 3:
        return 'Step 3 of 4 · Summary';
      case 4:
        return 'Step 4 of 4 · Mitigation Plan';
      default:
        return 'AI Checkup Workspace';
    }
  };

  const handleSaveAndGoNext = async () => {
    if (page === 3 && user?.id && farmId && !isViewingSavedResult && !isSavingCheckUpRef.current) {
      isSavingCheckUpRef.current = true;
      try {
        const summaryData = {
          modelResults: checkUpResult,
          questionnaireScores: questionnaireScores,
          identifiedProblems: sortedProblems,
        };
        const savedId = await saveFarmCheckUpResults({
          userId: user.id,
          farmId: farmId as string,
          imageUri: checkUpImageUri,
          summaryData,
        });
        setSavedCheckUpRecord(savedId);

        if (selectedCheckUpTodos && selectedCheckUpTodos.length > 0) {
          await batchUpdateTodosCompletion({
            todoIds: selectedCheckUpTodos.map((t) => t.id),
            isCompleted: true,
            userId: user?.id,
          });
          await loadFarmData();
        }
      } catch (e) {
        console.error('Failed to save checkup results:', e);
      } finally {
        isSavingCheckUpRef.current = false;
      }
    }
    goNext();
  };

  return (
    <ScrollView className="flex-1 bg-champagne">
      <View className="flex-1 pt-12">
        {/* Header Row Container - Translucent Chrome Bar */}
        <View className="flex-row items-center justify-between gap-3 px-5 py-3">
          <BackButton onPress={handleBack} />

          <Text
            style={{ fontSize: Math.round(24 * fontScale) }}
            className="flex-1 text-center font-bold tracking-tight text-espresso"
            numberOfLines={1}>
            {editing ? 'Edit Farm' : farm.farm_name}
          </Text>

          <View className="flex-row items-center gap-2">
            {!editing ? (
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setIsRecordsSheetVisible(true);
                }}
                hitSlop={8}
                className={`items-center justify-center rounded-full border border-black/[0.06] bg-white/90 shadow-sm backdrop-blur-md active:scale-90 active:bg-champagne ${
                  isGloveMode ? 'h-11 w-11' : 'h-10 w-10'
                }`}
                style={
                  isHighContrast ? { borderWidth: 1.5, borderColor: '#000000' } : undefined
                }
                accessibilityLabel="Farm Options and Records"
                accessibilityRole="button">
                <MoreDotsIcon
                  size={isGloveMode ? 20 : 18}
                  color={isHighContrast ? '#000000' : '#2D231E'}
                />
              </Pressable>
            ) : (
              isOwner && (
                <Pressable
                  onPress={handleDelete}
                  hitSlop={8}
                  className="h-10 w-10 items-center justify-center rounded-full bg-rose-600 shadow-sm active:scale-90 active:bg-rose-700">
                  <Trash2 className="text-white" size={17} />
                </Pressable>
              )
            )}
          </View>
        </View>

        <View className="mt-4 min-h-screen rounded-t-[36px] border-x border-t border-black/[0.05] bg-white p-6 shadow-xl shadow-black/5">
          <Text
            style={{ fontSize: Math.round(11 * fontScale) }}
            className="font-bold uppercase tracking-[0.22em] text-cognac">
            Farm Area Overview
          </Text>

          {editing ? (
            <>
              <View className="mt-4">
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="mb-1.5 font-bold uppercase tracking-wider text-taupe">
                  Area Name
                </Text>
                <TextInput
                  value={farmName}
                  onChangeText={setFarmName}
                  maxLength={255}
                  style={{ fontSize: Math.round(16 * fontScale) }}
                  className="mb-4 rounded-2xl border border-black/10 bg-champagne px-4 py-3.5 text-espresso focus:border-cognac"
                />

                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="mb-1.5 font-bold uppercase tracking-wider text-taupe">
                  Location
                </Text>
                <Pressable
                  onPress={() => setIsLocationModalVisible(true)}
                  hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                  style={isGloveMode ? { minHeight: 52 } : undefined}
                  className="mb-4 flex-row items-center justify-between rounded-2xl border border-black/10 bg-champagne px-4 py-3.5 active:scale-[0.99]">
                  <Text
                    style={{ fontSize: Math.round(16 * fontScale) }}
                    className={`flex-1 ${locationObj?.address ? 'text-espresso' : 'text-taupe'}`}>
                    {locationObj?.address || 'Select map location...'}
                  </Text>
                  <MapPin size={18} className="text-cognac" />
                </Pressable>

                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="mb-1.5 font-bold uppercase tracking-wider text-taupe">
                  Area in sqm
                </Text>
                <TextInput
                  value={areaSqm}
                  onChangeText={setAreaSqm}
                  keyboardType="numeric"
                  maxLength={15}
                  style={{ fontSize: Math.round(16 * fontScale) }}
                  className="mb-4 rounded-2xl border border-black/10 bg-champagne px-4 py-3.5 text-espresso focus:border-cognac"
                />

                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="mb-1.5 font-bold uppercase tracking-wider text-taupe">
                  Description
                </Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  maxLength={3000}
                  textAlignVertical="top"
                  style={{ fontSize: Math.round(16 * fontScale) }}
                  className="min-h-[120px] rounded-2xl border border-black/10 bg-champagne px-4 py-3.5 text-espresso focus:border-cognac"
                />
              </View>
              <View className="mt-4 flex-row gap-3">
                <Pressable
                  onPress={() => setEditing(false)}
                  hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                  style={isGloveMode ? { minHeight: 50, justifyContent: 'center' } : undefined}
                  className="flex-1 rounded-2xl border border-black/10 bg-white py-3.5 active:scale-[0.97]">
                  <Text
                    style={{ fontSize: Math.round(14 * fontScale) }}
                    className="text-center font-bold text-espresso">
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleSave}
                  hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                  style={isGloveMode ? { minHeight: 50, justifyContent: 'center' } : undefined}
                  className="flex-1 rounded-2xl bg-cognac py-3.5 shadow-md shadow-cognac/30 active:scale-[0.97]">
                  <Text
                    style={{ fontSize: Math.round(14 * fontScale) }}
                    className="text-center font-bold text-white">
                    Save Changes
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {/* Minimalist Farm Meta: Area & Short Location */}
              <View className="mt-3 flex-row flex-wrap items-center gap-2">
                {/* Area Pill */}
                <View
                  style={
                    isHighContrast
                      ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }
                  className="flex-row items-center gap-1.5 rounded-full border border-black/[0.06] bg-champagne/60 px-3.5 py-1.5">
                  <Layers size={13} color={isHighContrast ? '#000000' : '#8C4522'} strokeWidth={2.2} />
                  <Text
                    style={{ fontSize: 12 * fontScale }}
                    className={`font-black ${isHighContrast ? 'text-black' : 'text-espresso'}`}>
                    {farm.area_sqm ? `${Number(farm.area_sqm).toLocaleString()} sqm` : 'Area not set'}
                  </Text>
                </View>

                {/* Location Pill (Shortened) */}
                <View
                  style={
                    isHighContrast
                      ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }
                  className="min-w-[140px] flex-1 flex-row items-center gap-1.5 rounded-full border border-black/[0.06] bg-champagne/60 px-3.5 py-1.5">
                  <MapPin size={13} color={isHighContrast ? '#000000' : '#8C4522'} strokeWidth={2.2} />
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 12 * fontScale }}
                    className={`flex-1 font-bold ${isHighContrast ? 'text-black' : 'text-espresso'}`}>
                    {formatShortLocation(locationObj?.address)}
                  </Text>
                </View>
              </View>

              {/* Description */}
              {farm.description ? (
                <View className="mb-1 mt-2.5 px-0.5">
                  <Text
                    style={{
                      fontSize: 13.5 * fontScale,
                      lineHeight: Math.round(22 * fontScale),
                      color: isHighContrast ? '#111111' : '#73655C',
                      fontWeight: isHighContrast ? '600' : '400',
                    }}>
                    {farm.description}
                  </Text>
                </View>
              ) : null}

              {/* Layout Content Containers */}
              <View className="w-full gap-4 px-1">
                <View className="flex-col">
                  <View className="pb-2 pt-3">
                    {farmLayout && (
                      <View
                        className="mb-4 rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-sm shadow-espresso/5"
                        style={
                          isHighContrast
                            ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                            : undefined
                        }>
                        {/* Minimalist Header */}
                        <View className="flex-row items-center justify-between">
                          <Text
                            style={{ fontSize: 12 * fontScale }}
                            numberOfLines={1}
                            className={`mr-2 flex-1 font-black uppercase tracking-[0.2em] ${
                              isHighContrast ? 'text-black' : 'text-cognac'
                            }`}>
                            Farm Area Layout
                          </Text>
                          <Pressable
                            onPress={() => {
                              triggerHaptic('selection');
                              handleOpenFarmLayout();
                            }}
                            hitSlop={
                              isGloveMode
                                ? { top: 12, bottom: 12, left: 12, right: 12 }
                                : { top: 8, bottom: 8, left: 8, right: 8 }
                            }
                            className={`items-center justify-center rounded-full active:scale-90 ${
                              isGloveMode ? 'h-9 w-9' : 'h-8 w-8'
                            } ${
                              isHighContrast
                                ? 'border-2 border-black bg-white'
                                : 'shadow-xs border border-cognac/20 bg-white'
                            }`}
                            style={
                              isHighContrast
                                ? { borderWidth: 1.5, borderColor: '#000000' }
                                : undefined
                            }>
                            {permissions.canEditFarmLayout ? (
                              <Pencil
                                size={isGloveMode ? 16 : 14}
                                color={isHighContrast ? '#000000' : '#8C4522'}
                                strokeWidth={2.2}
                              />
                            ) : (
                              <Eye
                                size={isGloveMode ? 16 : 14}
                                color={isHighContrast ? '#000000' : '#8C4522'}
                                strokeWidth={2.2}
                              />
                            )}
                          </Pressable>
                        </View>

                        {/* Minimalist 3D Blueprint Canvas */}
                        <Pressable
                          onPress={() => {
                            triggerHaptic('selection');
                            setIsBlueprintModalVisible(true);
                          }}
                          className="mt-3 w-full overflow-hidden rounded-2xl active:scale-[0.99] active:opacity-90"
                          style={
                            isHighContrast
                              ? {
                                  borderWidth: 1.5,
                                  borderColor: '#000000',
                                  backgroundColor: '#F9F9F9',
                                }
                              : {
                                  backgroundColor: '#FDFBF7',
                                  borderWidth: 1,
                                  borderColor: 'rgba(0,0,0,0.04)',
                                }
                          }>
                          <View pointerEvents="none" className="items-center justify-center py-2">
                            <FarmLayout3DViewer layout={farmLayout} width={280} height={190} />
                          </View>
                        </Pressable>
                      </View>
                    )}

                    {!farmLayout && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('medium');
                          handleOpenFarmLayout();
                        }}
                        className={`rounded-2xl bg-emerald-600 shadow-md shadow-emerald-600/25 active:scale-[0.98] ${
                          isGloveMode ? 'min-h-[58px] px-5 py-4' : 'px-4 py-3.5'
                        }`}
                        style={
                          isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : undefined
                        }>
                        <Text
                          style={{ fontSize: 16 * fontScale }}
                          className="text-center font-bold text-white">
                          Create Farm Layout
                        </Text>
                      </Pressable>
                    )}

                    {farmLayout && !hasActiveCropPlan && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('medium');
                          router.push(`/farm/planner/${farmId}`);
                        }}
                        className={`mt-2 rounded-2xl bg-cognac shadow-md shadow-cognac/30 active:scale-[0.98] ${
                          isGloveMode ? 'min-h-[58px] px-5 py-4' : 'px-4 py-3.5'
                        }`}
                        style={
                          isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : undefined
                        }>
                        <Text
                          style={{ fontSize: 16 * fontScale }}
                          className="text-center font-bold text-white">
                          Plan Crop Cycle
                        </Text>
                      </Pressable>
                    )}

                    {farmLayout && hasActiveCropPlan && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('medium');
                          router.push(`/farm/planner/${farmId}`);
                        }}
                        className={`shadow-xs mt-4 rounded-2xl border-2 border-cognac bg-white active:scale-[0.98] ${
                          isGloveMode ? 'min-h-[58px] px-5 py-4' : 'px-4 py-3'
                        }`}
                        style={
                          isHighContrast ? { borderWidth: 2.5, borderColor: '#000000' } : undefined
                        }>
                        <Text
                          style={{
                            fontSize: 16 * fontScale,
                            color: isHighContrast ? '#000000' : '#8C4522',
                            fontWeight: '900',
                          }}
                          className="text-center">
                          Crop Planner
                        </Text>
                      </Pressable>
                    )}

                    {/* ─── Dedicated Farm Facilities Card (Design A) ─── */}
                    {farmLayout && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          router.push(`/farm/facilities/${farmId}`);
                        }}
                        className={`shadow-2xs mt-3 flex-row items-center justify-between rounded-2xl border border-emerald-800/20 bg-emerald-50/70 active:scale-[0.98] ${
                          isGloveMode ? 'min-h-[72px] px-4 py-4' : 'px-3.5 py-3'
                        }`}
                        style={
                          isHighContrast
                            ? {
                                borderWidth: 2,
                                borderColor: '#000000',
                                backgroundColor: '#FFFFFF',
                              }
                            : undefined
                        }
                        accessibilityLabel="Farm Facilities"
                        accessibilityRole="button">
                        <View className="flex-1 flex-row items-center gap-3 pr-2">
                          <View
                            className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-100"
                            style={
                              isHighContrast
                                ? { borderWidth: 1, borderColor: '#000000' }
                                : undefined
                            }>
                            <Building2
                              size={20}
                              color={isHighContrast ? '#000000' : '#047857'}
                              strokeWidth={2.2}
                            />
                          </View>
                          <View className="flex-1">
                            <View className="flex-row items-center gap-1.5">
                              <Text
                                style={{
                                  fontSize: 14 * fontScale,
                                  color: isHighContrast ? '#000000' : '#1A3326',
                                  fontWeight: isHighContrast ? '900' : '800',
                                }}
                                numberOfLines={1}>
                                Farm Facilities
                              </Text>
                              <View className="rounded-full bg-emerald-700/10 px-1.5 py-0.5">
                                <Text
                                  style={{ fontSize: 9 * fontScale }}
                                  className="font-bold text-emerald-800">
                                  Infrastructure
                                </Text>
                              </View>
                            </View>
                            <Text
                              style={{
                                fontSize: 11.5 * fontScale,
                                color: isHighContrast ? '#222222' : '#556B60',
                              }}
                              className="mt-0.5"
                              numberOfLines={1}>
                              Manage stations, inventory & storage
                            </Text>
                          </View>
                        </View>
                        <View className="h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-2xs">
                          <ChevronRight
                            size={15}
                            color={isHighContrast ? '#000000' : '#047857'}
                            strokeWidth={2.5}
                          />
                        </View>
                      </Pressable>
                    )}

                    {/* ─── Daily Field Check-in Reminder Banner ─── */}
                    {farmLayout &&
                      hasActiveCropPlan &&
                      !hasReportedToday &&
                      !isDailyReminderDismissed && (
                        <View
                          className="shadow-xs mt-3 overflow-hidden rounded-3xl border border-cognac/30 bg-cognac/10 p-4"
                          style={
                            isHighContrast
                              ? {
                                  borderWidth: 2,
                                  borderColor: '#000000',
                                  backgroundColor: '#FFFFFF',
                                }
                              : undefined
                          }>
                          <View className="flex-row items-start justify-between">
                            <View className="flex-1 flex-row items-start gap-2.5 pr-2">
                              <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-xl bg-cognac/20">
                                <FileText
                                  size={16}
                                  color={isHighContrast ? '#000000' : '#8C4522'}
                                />
                              </View>
                              <View className="flex-1">
                                <Text
                                  style={{
                                    fontSize: 12.5 * fontScale,
                                    color: isHighContrast ? '#000000' : '#2D231E',
                                    fontWeight: isHighContrast ? '900' : '800',
                                  }}>
                                  Daily Field Check-in Reminder
                                </Text>
                              </View>
                            </View>
                            <Pressable
                              onPress={() => setIsDailyReminderDismissed(true)}
                              className="p-1 active:scale-90">
                              <X size={14} color={isHighContrast ? '#000000' : '#8C7C70'} />
                            </Pressable>
                          </View>

                          <Pressable
                            onPress={() => {
                              triggerHaptic('selection');
                              setIsDailyReportFormOpen(true);
                            }}
                            className={`mt-3 flex-row items-center justify-center gap-1.5 rounded-2xl bg-cognac active:scale-[0.98] ${
                              isGloveMode ? 'min-h-[52px] px-4 py-3.5' : 'px-3 py-2.5'
                            }`}
                            style={
                              isHighContrast
                                ? { borderWidth: 2, borderColor: '#000000' }
                                : undefined
                            }>
                            <Text
                              style={{ fontSize: 13 * fontScale }}
                              className="font-bold text-white">
                              Start 1-Min Check-in
                            </Text>
                            <ChevronRight size={14} color="#FFFFFF" />
                          </Pressable>
                        </View>
                      )}
                  </View>
                </View>

                {/* Todo Execution List View Block */}
                <ScrollView
                  className="flex-1"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 20 }}>
                  <View className="mb-4 mt-3">
                    {/* If layout exists but no active crop plan and no tasks, show friendly onboarding card */}
                    {farmLayout && !hasActiveCropPlan && todos.length === 0 && (
                      <View className="shadow-xs mb-6 items-center rounded-3xl border border-black/[0.06] bg-champagne p-6">
                        <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-cognac/10">
                          <Leaf size={24} className="text-cognac" />
                        </View>
                        <Text
                          style={{ fontSize: Math.round(16 * fontScale) }}
                          className="mb-1 font-bold text-espresso">
                          No Active Crop Plan
                        </Text>
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="mb-4 px-2 text-center leading-5 text-taupe">
                          Your layout is ready! Create a crop plan to schedule planting dates,
                          milestones, NPK sensor monitoring, and daily field tasks.
                        </Text>
                        <Pressable
                          onPress={() => {
                            triggerHaptic('medium');
                            router.push(`/farm/planner/${farmId}`);
                          }}
                          hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                          style={isGloveMode ? { minHeight: 44, justifyContent: 'center' } : undefined}
                          className="rounded-full bg-cognac px-5 py-2.5 shadow-sm shadow-cognac/30 active:scale-95">
                          <Text
                            style={{ fontSize: Math.round(12 * fontScale) }}
                            className="font-bold uppercase tracking-wider text-white">
                            Start Crop Planning
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Operational Farm Tasks section: shown when an active crop plan exists OR when there are tasks */}
                    {(hasActiveCropPlan || visibleTodos.length > 0 || todos.length > 0) && (
                      <>
                        <View className="mb-4 flex-row items-center justify-between">
                          <Text
                            style={{ fontSize: Math.round(20 * fontScale) }}
                            className="font-bold tracking-tight text-espresso">
                            Farm Tasks
                          </Text>
                          <Pressable
                            onPress={() => {
                              triggerHaptic('selection');
                              router.push({
                                pathname: '/todo/add',
                                params: { farmId },
                              });
                            }}
                            hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                            style={isGloveMode ? { minHeight: 40, justifyContent: 'center' } : undefined}
                            className={`flex-row items-center gap-1 rounded-full bg-cognac/10 active:scale-95 ${
                              isGloveMode ? 'px-4 py-2.5' : 'px-3 py-1.5'
                            }`}>
                            <Plus size={14} color="#8C4522" strokeWidth={2.5} />
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="font-bold text-cognac">
                              Add Task
                            </Text>
                          </Pressable>
                        </View>

                        {visibleTodos.length > 0 ? (
                          (() => {
                            // Separate paginated cards into general and plot-grouped for sectioned rendering
                            const paginatedGeneralTodos = paginatedCards
                              .filter(
                                (c): c is Extract<typeof c, { type: 'general' }> =>
                                  c.type === 'general'
                              )
                              .map((c) => c.todo);

                            // Collect plot groups from paginated cards, preserving plot combo grouping
                            const paginatedPlotGroups = new Map<
                              string,
                              {
                                plotNamesText: string;
                                taskGroups: {
                                  signature: string;
                                  plotNames: Set<string>;
                                  plotIds: Set<string>;
                                  todos: TodoItem[];
                                }[];
                              }
                            >();

                            paginatedCards.forEach((c) => {
                              if (c.type === 'group') {
                                if (!paginatedPlotGroups.has(c.comboKey)) {
                                  paginatedPlotGroups.set(c.comboKey, {
                                    plotNamesText: c.plotNamesText,
                                    taskGroups: [],
                                  });
                                }
                                paginatedPlotGroups.get(c.comboKey)!.taskGroups.push(c.group);
                              }
                            });

                            const renderTodoGroup = (group: {
                              signature: string;
                              plotNames: Set<string>;
                              todos: TodoItem[];
                            }) => {
                              const firstTodo = group.todos[0];
                              const rawTodoStatus = getTodoScopeStatus(
                                firstTodo,
                                todayKey,
                                todayKey
                              );
                              const todoStatus = (rawTodoStatus === 'hidden'
                                ? 'active'
                                : rawTodoStatus) as 'active' | 'completed' | 'late';
                              const isCheckUpFarm = isCheckUpTask(firstTodo.title);
                              return (
                                <TodoItemCard
                                  key={group.signature}
                                  todo={firstTodo}
                                  farmName={farm.farm_name}
                                  status={todoStatus}
                                  showFarmName={false}
                                  onToggleComplete={
                                    isCheckUpFarm
                                      ? () => openCheckUpModal(group.todos)
                                      : () => toggleTodosComplete(group.todos)
                                  }
                                  onEdit={
                                    permissions.canEditTasks
                                      ? () => router.push(`/todo/edit/${firstTodo.id}`)
                                      : undefined
                                  }
                                  onPress={
                                    isCheckUpFarm
                                      ? () => openCheckUpModal(group.todos)
                                      : () => setModalTodoGroup({ todos: group.todos })
                                  }
                                />
                              );
                            };

                            const renderGeneralTodo = (todo: TodoItem) => {
                              const rawTodoStatus = getTodoScopeStatus(todo, todayKey, todayKey);
                              const todoStatus = (rawTodoStatus === 'hidden'
                                ? 'active'
                                : rawTodoStatus) as 'active' | 'completed' | 'late';
                              const isCheckUpFarm = isCheckUpTask(todo.title);
                              return (
                                <TodoItemCard
                                  key={todo.id}
                                  todo={todo}
                                  farmName={farm.farm_name}
                                  status={todoStatus}
                                  showFarmName={false}
                                  onToggleComplete={
                                    isCheckUpFarm
                                      ? () => openCheckUpModal([todo])
                                      : () => toggleTodosComplete([todo])
                                  }
                                  onEdit={
                                    permissions.canEditTasks
                                      ? () => router.push(`/todo/edit/${todo.id}`)
                                      : undefined
                                  }
                                  onPress={
                                    isCheckUpFarm
                                      ? () => openCheckUpModal([todo])
                                      : () => setModalTodoGroup({ todos: [todo] })
                                  }
                                />
                              );
                            };

                            return (
                              <>
                                {paginatedGeneralTodos.length > 0 && (
                                  <View className="mb-4">
                                    <Text
                                      style={{ fontSize: Math.round(12 * fontScale) }}
                                      className="mb-3 ml-1 font-bold uppercase tracking-widest text-taupe">
                                      General Tasks
                                    </Text>
                                    {paginatedGeneralTodos.map(renderGeneralTodo)}
                                  </View>
                                )}

                                {Array.from(paginatedPlotGroups.entries()).map(
                                  ([comboKey, groupData]) => (
                                    <View key={comboKey} className="mb-4">
                                      <Text
                                        style={{ fontSize: Math.round(12 * fontScale) }}
                                        className="mb-3 ml-1 font-bold uppercase tracking-widest text-taupe">
                                        Plot: {groupData.plotNamesText}
                                      </Text>
                                      {groupData.taskGroups.map(renderTodoGroup)}
                                    </View>
                                  )
                                )}
                              </>
                            );
                          })()
                        ) : (
                          <View className="rounded-3xl border border-dashed border-taupe/30 bg-white/80 p-8">
                            <Text
                              style={{ fontSize: Math.round(16 * fontScale) }}
                              className="text-center font-semibold text-espresso">
                              No tasks for this day
                            </Text>
                            {todos.length > 0 && (
                              <Text
                                style={{ fontSize: Math.round(12 * fontScale) }}
                                className="mt-1.5 text-center text-taupe">
                                {todos.length} task{todos.length !== 1 ? 's' : ''} scheduled for other dates
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                          <View className="mt-4 flex-row items-center justify-between border-t border-black/[0.06] pt-4">
                            <Pressable
                              onPress={() => {
                                triggerHaptic('light');
                                setCurrentPage((p) => Math.max(1, p - 1));
                              }}
                              disabled={safePage === 1}
                              hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                              style={isGloveMode ? { minHeight: 40, justifyContent: 'center' } : undefined}
                              className={`rounded-full px-5 py-2.5 active:scale-95 ${
                                safePage === 1 ? 'bg-taupe/20' : 'bg-cognac'
                              }`}>
                              <Text
                                style={{ fontSize: Math.round(12 * fontScale) }}
                                className={`font-bold ${
                                  safePage === 1 ? 'text-taupe' : 'text-white'
                                }`}>
                                Previous
                              </Text>
                            </Pressable>

                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="font-semibold text-espresso">
                              Page {safePage} of {totalPages}
                            </Text>

                            <Pressable
                              onPress={() => {
                                triggerHaptic('light');
                                setCurrentPage((p) => Math.min(totalPages, p + 1));
                              }}
                              disabled={safePage === totalPages}
                              hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                              style={isGloveMode ? { minHeight: 40, justifyContent: 'center' } : undefined}
                              className={`rounded-full px-5 py-2.5 active:scale-95 ${
                                safePage === totalPages ? 'bg-taupe/20' : 'bg-cognac'
                              }`}>
                              <Text
                                style={{ fontSize: Math.round(12 * fontScale) }}
                                className={`font-bold ${
                                  safePage === totalPages ? 'text-taupe' : 'text-white'
                                }`}>
                                Next
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                </ScrollView>
              </View>
            </>
          )}
        </View>
      </View>

      {/* --- Native Modals Tree Layer --- */}
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
        farmName={farmName}
        status={
          modalTodoGroup?.todos[0]
            ? (() => {
                const s = getTodoScopeStatus(
                  {
                    ...modalTodoGroup.todos[0],
                    is_completed: modalTodoGroup.todos.every((t) => t.is_completed),
                  },
                  todayKey,
                  todayKey
                );
                return (s === 'hidden' ? 'active' : s) as 'active' | 'completed' | 'late';
              })()
            : 'active'
        }
        visible={!!modalTodoGroup}
        onClose={() => setModalTodoGroup(null)}
        onEdit={
          permissions.canEditTasks
            ? () => {
                if (modalTodoGroup?.todos[0]) {
                  const firstId = modalTodoGroup.todos[0].id;
                  setModalTodoGroup(null);
                  router.push(`/todo/edit/${firstId}`);
                }
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

      {selectedTaskCrop ? (
        <CropDetailModal
          crop={selectedTaskCrop}
          visible={Boolean(selectedTaskCrop)}
          onClose={() => setSelectedTaskCrop(null)}
        />
      ) : null}

      <FarmHistorySheet
        visible={isHistorySheetVisible}
        onClose={() => setIsHistorySheetVisible(false)}
        farmId={farmId as string}
        farmName={farm?.farm_name}
        isOwner={isOwner}
      />

      <FarmMembersSheet
        visible={isMembersSheetVisible}
        onClose={() => {
          setIsMembersSheetVisible(false);
          setIsRecordsSheetVisible(false);
        }}
        farmId={farmId as string}
        farmName={farm?.farm_name}
        isOwner={isOwner}
      />

      <FarmRecordsSheet
        visible={isRecordsSheetVisible}
        onClose={() => setIsRecordsSheetVisible(false)}
        farmName={farm?.farm_name}
        isOwner={permissions.canEditFarm}
        onEditFarm={permissions.canEditFarm ? () => setEditing(true) : undefined}
        onOpenTeam={permissions.canManageTeam ? () => setIsMembersSheetVisible(true) : undefined}
        dailyReportsCount={dailyReports.length}
        hasReportedToday={hasReportedToday}
        onOpenDailyLogs={() => setIsDailyReportViewerOpen(true)}
        onOpenDiagnostics={() => router.push(`/farm/diagnostics/${farmId}`)}
        onOpenHistory={() => setIsHistorySheetVisible(true)}
        onOpenNewDailyLog={() => setIsDailyReportFormOpen(true)}
      />

      {/* Blueprint View Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isBlueprintModalVisible}
        onRequestClose={() => setIsBlueprintModalVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/60 px-4 py-10">
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setIsBlueprintModalVisible(false)}
          />
          <View
            className="w-full max-w-md flex-1 rounded-3xl border border-taupe/30 bg-champagne p-5 shadow-xl">
            <View className="mb-4 flex-row items-center justify-between">
              <Text
                style={{ fontSize: Math.round(18 * fontScale) }}
                className="font-bold text-espresso">
                {farmName}
              </Text>
              <Pressable
                onPress={() => setIsBlueprintModalVisible(false)}
                hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                className="h-8 w-8 items-center justify-center rounded-full bg-taupe/20 p-2 active:scale-95">
                <Text className="font-bold leading-none text-espresso">✕</Text>
              </Pressable>
            </View>

            {(() => {
              try {
                const data =
                  typeof farmLayout?.blueprint_data_json === 'string'
                    ? JSON.parse(farmLayout.blueprint_data_json)
                    : farmLayout?.blueprint_data_json;

                const plots = data?.items || [];

                const plotColors: Record<number, string> = {};
                const groupedPlots: {
                  plan: CropRotationPlanData | null;
                  plots: any[];
                  color: string;
                }[] = [];
                const planColors = [
                  '#FF6B6B',
                  '#4ECDC4',
                  '#FFE66D',
                  '#6A4C93',
                  '#1A535C',
                  '#FF9F1C',
                  '#2EC4B6',
                  '#E71D36',
                ];
                const unassignedPlots: any[] = [];

                if (activePlans.length > 0) {
                  activePlans.forEach((plan, planIdx) => {
                    const color = planColors[planIdx % planColors.length];
                    groupedPlots.push({ plan, plots: [], color });
                  });
                }

                plots.forEach((plot: any, idx: number) => {
                  plot.originalIndex = idx;
                  plot.legendChar = String.fromCharCode(65 + (idx % 26));
                  const structureId = farmLayout.structures?.[idx]?.id;

                  let assignedPlanIdx = -1;
                  if (structureId) {
                    assignedPlanIdx = activePlans.findIndex((p) =>
                      p.targetPlots?.includes(structureId)
                    );
                  }

                  if (assignedPlanIdx !== -1) {
                    const color = planColors[assignedPlanIdx % planColors.length];
                    plotColors[idx] = color;
                    groupedPlots[assignedPlanIdx].plots.push(plot);
                  } else {
                    unassignedPlots.push(plot);
                  }
                });

                return (
                  <>
                    <View className="w-full items-center justify-center overflow-hidden rounded-2xl bg-cognac/5 py-2">
                      <FarmLayout3DViewer
                        layout={farmLayout}
                        width={290}
                        height={165}
                        showLabels={true}
                        plotColors={plotColors}
                      />
                    </View>

                    <View className="mt-3 flex-1 rounded-2xl border border-taupe/20 bg-white p-3.5 shadow-sm">
                      <ScrollView
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                        contentContainerStyle={{ paddingBottom: 24 }}>
                        <View className="flex-col gap-3 px-1">
                          {groupedPlots
                            .filter((g) => g.plots.length > 0)
                            .map((group, groupIdx) => {
                              const allCrops = group.plan?.selectedCrops || [];
                              const visibleCrops = allCrops.slice(0, 3);
                              const overflowCropCount = allCrops.length - visibleCrops.length;
                              const planTitle = allCrops.map((c: any) => c.crop).join(' / ') || 'Plan';

                              return (
                                <View
                                  key={`group-${groupIdx}`}
                                  className="overflow-hidden rounded-xl border border-taupe/30 bg-champagne/30">
                                  <Pressable
                                    onPress={() =>
                                      setExpandedLayoutGroups((prev) => ({
                                        ...prev,
                                        [groupIdx]: !prev[groupIdx],
                                      }))
                                    }
                                    className="flex-row items-center justify-between border-b border-cognac/15 p-3 active:bg-champagne/50">
                                    <View className="mr-3 flex-1 min-w-0 flex-row items-center">
                                      <View className="mr-2.5 flex-row items-center shrink-0">
                                        {visibleCrops.map((c: any, i: number) => (
                                          <View
                                            key={`crop-icon-${i}`}
                                            style={{ marginLeft: i > 0 ? -10 : 0 }}
                                            className="shadow-xs rounded-full border-2 border-white">
                                            <CropAvatar
                                              crop={c}
                                              cropName={c.crop}
                                              size="sm"
                                              showPartnerBadge={false}
                                            />
                                          </View>
                                        ))}
                                        {overflowCropCount > 0 && (
                                          <View
                                            style={{ marginLeft: -10, width: 32, height: 32 }}
                                            className="shadow-xs rounded-full border-2 border-white bg-cognac/15 items-center justify-center">
                                            <Text
                                              style={{ fontSize: Math.round(10 * fontScale) }}
                                              className="font-bold text-cognac">
                                              +{overflowCropCount}
                                            </Text>
                                          </View>
                                        )}
                                      </View>
                                      <View className="flex-1 min-w-0 justify-center">
                                        <Text
                                          numberOfLines={1}
                                          ellipsizeMode="tail"
                                          style={{ fontSize: Math.round(12 * fontScale) }}
                                          className="font-bold uppercase text-espresso">
                                          {planTitle}
                                        </Text>
                                        <Text
                                          numberOfLines={1}
                                          style={{ fontSize: Math.round(10 * fontScale) }}
                                          className="mt-0.5 font-semibold text-taupe">
                                          {group.plots.length}{' '}
                                          {group.plots.length === 1 ? 'plot' : 'plots'} assigned
                                          {allCrops.length > 0 ? ` • ${allCrops.length} ${allCrops.length === 1 ? 'crop' : 'crops'}` : ''}
                                        </Text>
                                      </View>
                                    </View>
                                    <View className="flex-row items-center gap-2.5 shrink-0">
                                      <View
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: group.color }}
                                      />
                                      <Text
                                        style={{ fontSize: Math.round(10 * fontScale) }}
                                        className="font-bold text-taupe">
                                        {expandedLayoutGroups[groupIdx] ? '▲' : '▼'}
                                      </Text>
                                    </View>
                                  </Pressable>
                                  {expandedLayoutGroups[groupIdx] && (
                                    <View className="flex-col gap-2 p-2.5">
                                      {allCrops.length > 0 && (
                                        <View className="mb-2">
                                          <Text
                                            style={{ fontSize: Math.round(10 * fontScale) }}
                                            className="mb-1.5 px-1 font-bold uppercase tracking-wider text-taupe">
                                            Planned Crops ({allCrops.length})
                                          </Text>
                                          <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            nestedScrollEnabled={true}
                                            contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
                                            {allCrops.map((c: any, cIdx: number) => (
                                              <View
                                                key={`crop-chip-${cIdx}`}
                                                className="flex-row items-center rounded-lg border border-taupe/15 bg-white px-2.5 py-1.5 shadow-2xs">
                                                <CropAvatar
                                                  crop={c}
                                                  cropName={c.crop}
                                                  size="xs"
                                                  showPartnerBadge={false}
                                                />
                                                <Text
                                                  style={{ fontSize: Math.round(11 * fontScale) }}
                                                  className="ml-1.5 font-medium text-espresso">
                                                  {c.crop}
                                                </Text>
                                              </View>
                                            ))}
                                          </ScrollView>
                                        </View>
                                      )}

                                      <View>
                                        <Text
                                          style={{ fontSize: Math.round(10 * fontScale) }}
                                          className="mb-1.5 px-1 font-bold uppercase tracking-wider text-taupe">
                                          Assigned Plots ({group.plots.length})
                                        </Text>
                                        <View className="flex-col gap-1">
                                          {group.plots.map((plot: any, idx: number) => (
                                            <View
                                              key={plot.id || idx}
                                              className="flex-row items-center rounded-lg border border-taupe/10 bg-white px-3 py-2">
                                              <Text
                                                className="w-6 font-bold"
                                                style={{
                                                  color: group.color,
                                                  fontSize: Math.round(14 * fontScale),
                                                }}>
                                                {plot.legendChar}.
                                              </Text>
                                              <Text
                                                style={{ fontSize: Math.round(14 * fontScale) }}
                                                className="font-medium text-espresso">
                                                {plot.label || `Plot ${plot.originalIndex + 1}`}
                                              </Text>
                                            </View>
                                          ))}
                                        </View>
                                      </View>
                                    </View>
                                  )}
                                </View>
                              );
                            })}

                          {unassignedPlots.length > 0 && (
                            <View className="overflow-hidden rounded-xl border border-taupe/30 bg-champagne/30">
                              <Pressable
                                onPress={() => setExpandedUnassigned((prev) => !prev)}
                                className="flex-row items-center justify-between border-b border-cognac/15 p-3 active:bg-champagne/50">
                                <View className="flex-col">
                                  <Text
                                    style={{ fontSize: Math.round(12 * fontScale) }}
                                    className="font-bold uppercase text-taupe">
                                    Unassigned Plots
                                  </Text>
                                  <Text
                                    style={{ fontSize: Math.round(10 * fontScale) }}
                                    className="mt-0.5 font-semibold text-taupe">
                                    {unassignedPlots.length}{' '}
                                    {unassignedPlots.length === 1 ? 'plot' : 'plots'}
                                  </Text>
                                </View>
                                <Text
                                  style={{ fontSize: Math.round(10 * fontScale) }}
                                  className="font-bold text-taupe">
                                  {expandedUnassigned ? '▲' : '▼'}
                                </Text>
                              </Pressable>
                              {expandedUnassigned && (
                                <View className="flex-col gap-1 p-2">
                                  {unassignedPlots.map((plot: any, idx: number) => (
                                    <View
                                      key={plot.id || idx}
                                      className="flex-row items-center rounded-lg border border-taupe/10 bg-white px-3 py-2">
                                      <Text
                                        style={{ fontSize: Math.round(14 * fontScale) }}
                                        className="w-6 font-bold text-taupe">
                                        {plot.legendChar}.
                                      </Text>
                                      <Text
                                        style={{ fontSize: Math.round(14 * fontScale) }}
                                        className="font-medium text-espresso">
                                        {plot.label || `Plot ${plot.originalIndex + 1}`}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>
                          )}

                          {plots.length === 0 && (
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="text-center text-taupe">
                              No plots added yet.
                            </Text>
                          )}
                        </View>
                      </ScrollView>
                    </View>
                  </>
                );
              } catch (e) {
                return (
                  <View className="w-full items-center justify-center overflow-hidden rounded-2xl bg-cognac/5 py-4">
                    <FarmLayout3DViewer
                      layout={farmLayout}
                      width={300}
                      height={200}
                      showLabels={true}
                    />
                  </View>
                );
              }
            })()}

            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setIsBlueprintModalVisible(false);
                  handleOpenFarmLayout();
                }}
                hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                className="flex-1 flex-row items-center justify-center rounded-2xl border border-cognac/30 bg-cognac/10 py-3.5 active:scale-[0.98]">
                {permissions.canEditFarmLayout ? (
                  <>
                    <Pencil size={15} color="#8C4522" strokeWidth={2.2} style={{ marginRight: 6 }} />
                    <Text
                      style={{ fontSize: Math.round(14 * fontScale) }}
                      className="font-bold text-cognac">
                      Edit Layout
                    </Text>
                  </>
                ) : (
                  <>
                    <Eye size={15} color="#8C4522" strokeWidth={2.2} style={{ marginRight: 6 }} />
                    <Text
                      style={{ fontSize: Math.round(14 * fontScale) }}
                      className="font-bold text-cognac">
                      View Full Layout
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  triggerHaptic('medium');
                  setIsBlueprintModalVisible(false);
                  router.push(`/farm/planner/${farmId}`);
                }}
                hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                className="flex-1 items-center justify-center rounded-2xl bg-cognac py-3.5 shadow-sm shadow-espresso/20 active:scale-[0.98]">
                <Text
                  style={{ fontSize: Math.round(14 * fontScale) }}
                  className="font-bold text-white">
                  Plan Crops
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Dynamic Alternative Verification Modal for Check-up Workflows */}
      <Modal
        visible={Boolean(selectedCheckUpTodos)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={handleCloseCheckUpModal}>
        <View className="flex-1 items-center justify-center bg-black/50 px-5 backdrop-blur-md">
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={handleCloseCheckUpModal}
          />
          <View
            className="max-h-[88%] w-full max-w-md rounded-[32px] border border-black/5 bg-white p-6 shadow-2xl">
            {/* Header */}
            <View className="flex-row items-center justify-between border-b border-black/[0.06] pb-3">
              <View className="flex-1 pr-2">
                <Text
                  style={{ fontSize: Math.round(10 * fontScale) }}
                  className="font-bold uppercase tracking-[0.2em] text-cognac">
                  {getPageTitle()}
                </Text>
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="mt-0.5 font-semibold text-taupe"
                  numberOfLines={1}>
                  {selectedCheckUpTodos?.[0]?.title}
                </Text>
              </View>
              <Pressable
                onPress={handleCloseCheckUpModal}
                hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                className="rounded-full bg-champagne px-3.5 py-1.5 active:scale-90">
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className="font-bold text-taupe">
                  Close
                </Text>
              </Pressable>
            </View>

            {/* Step indicator */}
            {isViewingSavedResult ? (
              <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-3.5 py-2.5">
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2 rounded-full bg-emerald-600" />
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className="font-bold text-emerald-800">
                    Recorded Diagnosis
                  </Text>
                </View>
                <Text
                  style={{ fontSize: Math.round(10 * fontScale) }}
                  className="font-semibold text-emerald-600">
                  {savedCheckUpRecord?.created_at
                    ? formatDateOnly(savedCheckUpRecord.created_at)
                    : 'Completed'}
                </Text>
              </View>
            ) : (
              <View className="mt-4 flex-row items-center gap-1.5">
                {[1, 2, 3, 4].map((step) => (
                  <View
                    key={`step-dot-${step}`}
                    className={`h-1.5 flex-1 rounded-full ${step <= page ? 'bg-cognac' : 'bg-champagne'}`}
                  />
                ))}
              </View>
            )}

            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              className="mt-4">
              {/* ============ PAGE 1 — PHOTO + AI ANALYSIS ============ */}
              {page === 1 ? (
                <View>
                  <Text
                    style={{ fontSize: Math.round(14 * fontScale) }}
                    className="font-semibold text-taupe">
                    Date context: {formatDateOnly(selectedCheckUpTodos?.[0]?.start_date) || 'Today'}
                  </Text>

                  {/* ─── Model Selector Dropdown ─── */}
                  <View className="relative z-10 mt-3 flex-row items-center justify-between rounded-2xl border border-taupe/30 bg-white p-3">
                    <Text
                      style={{ fontSize: Math.round(14 * fontScale) }}
                      className="ml-1 font-bold text-espresso">
                      SoilSync
                    </Text>

                    <View className="relative">
                      <Pressable
                        onPress={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                        hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                        className="flex-row items-center gap-2 rounded-xl bg-champagne px-3 py-1.5 active:bg-taupe/30">
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="font-bold text-espresso">
                          {selectedDetectionModel === 'yolo' ? 'EDGE' : 'PRO'}
                        </Text>
                        <Text
                          style={{ fontSize: Math.round(10 * fontScale) }}
                          className="font-bold text-taupe">
                          {isModelDropdownOpen ? '▲' : '▼'}
                        </Text>
                      </Pressable>

                      {isModelDropdownOpen && (
                        <View className="absolute right-0 top-full mt-2 w-36 overflow-hidden rounded-xl border border-taupe/30 bg-white shadow-xl shadow-slate-200/50">
                          <Pressable
                            onPress={() => {
                              handleModelSwitch('yolo');
                              setIsModelDropdownOpen(false);
                            }}
                            className={`flex-row items-center px-3 py-3 ${
                              selectedDetectionModel === 'yolo' ? 'bg-champagne' : 'bg-white'
                            }`}>
                            <View className="mr-2 w-4 items-center justify-center">
                              {selectedDetectionModel === 'yolo' && (
                                <Check size={14} className="text-cognac" strokeWidth={3} />
                              )}
                            </View>
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="font-bold text-espresso">
                              EDGE
                            </Text>
                          </Pressable>

                          <View className="h-[1px] w-full bg-champagne" />

                          <Pressable
                            onPress={() => {
                              handleModelSwitch('rfdetr');
                              setIsModelDropdownOpen(false);
                            }}
                            disabled={!isOnline}
                            className={`flex-row items-center px-3 py-3 ${
                              selectedDetectionModel === 'rfdetr' ? 'bg-champagne' : 'bg-white'
                            } ${!isOnline ? 'opacity-50' : ''}`}>
                            <View className="mr-2 w-4 items-center justify-center">
                              {selectedDetectionModel === 'rfdetr' && (
                                <Check size={14} className="text-cognac" strokeWidth={3} />
                              )}
                            </View>
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="font-bold text-espresso">
                              PRO
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>

                  {!isOnline && selectedDetectionModel === 'rfdetr' && (
                    <Text className="mt-2 text-sm text-amber-800">
                      PRO analysis needs internet. Select an installed EDGE model to analyze offline.
                    </Text>
                  )}

                  {isDownloadingEdgeModel && (
                    <View className="mt-3 overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className="font-bold text-emerald-800">
                        Downloading EDGE Model...
                      </Text>
                      <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-emerald-200">
                        <View
                          className="h-full bg-emerald-600"
                          style={{ width: `${Math.round(edgeModelDownloadProgress * 100)}%` }}
                        />
                      </View>
                      <Text
                        style={{ fontSize: Math.round(10 * fontScale) }}
                        className="mt-1 text-right font-semibold text-emerald-600">
                        {Math.round(edgeModelDownloadProgress * 100)}%
                      </Text>
                    </View>
                  )}

                  {checkUpImageUri ? (
                    <View
                      key={checkUpImageUri}
                      className="relative mt-4 aspect-square w-full overflow-hidden rounded-2xl bg-slate-950">
                      <Image
                        key={`img-${checkUpImageUri}`}
                        source={{ uri: checkUpImageUri }}
                        className="absolute inset-0 h-full w-full"
                        resizeMode="cover"
                        onError={(e: any) => console.log('Image load error:', e?.nativeEvent)}
                      />

                      {checkUpResult?.health?.allDetections?.map((box: any, index: number) => {
                        const left = `${(box.bbox.x - box.bbox.width / 2) * 100}%`;
                        const top = `${(box.bbox.y - box.bbox.height / 2) * 100}%`;
                        const width = `${box.bbox.width * 100}%`;
                        const height = `${box.bbox.height * 100}%`;

                        return (
                          <View
                            key={`bbox-overlay-${index}`}
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
                                {box.className.replace('_', ' ')} {Math.round(box.confidence * 100)}
                                %
                              </Text>
                            </View>
                          </View>
                        );
                      })}

                      {analyzingCheckUp && (
                        <Animated.View
                          style={{ opacity: shimmerOpacity }}
                          className="absolute inset-0 flex items-center justify-center bg-espresso/50">
                          <ActivityIndicator size="large" color="#ffffff" />
                          <Text
                            style={{ fontSize: Math.round(12 * fontScale) }}
                            className="mt-3 font-bold uppercase tracking-widest text-white">
                            Running Inference Pipeline...
                          </Text>
                        </Animated.View>
                      )}
                    </View>
                  ) : (
                    <View className="mt-4 aspect-square w-full items-center justify-center rounded-2xl border-2 border-dashed border-taupe/30 bg-champagne">
                      <Text
                        style={{ fontSize: Math.round(14 * fontScale) }}
                        className="font-semibold text-taupe">
                        No photo yet
                      </Text>
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className="mt-1 px-8 text-center text-taupe">
                        Take or upload a clear photo of the affected leaf/plant
                      </Text>
                    </View>
                  )}

                  <View className="mt-4 flex-row gap-3">
                    <Pressable
                      disabled={analyzingCheckUp || (!isOnline && selectedDetectionModel === 'rfdetr')}
                      onPress={takeCheckUpPhoto}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className={`flex-1 items-center justify-center rounded-2xl py-3.5 active:scale-[0.98] ${
                        analyzingCheckUp || (!isOnline && selectedDetectionModel === 'rfdetr') ? 'bg-cognac/50' : 'bg-cognac'
                      }`}>
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="font-bold text-white">
                        Camera
                      </Text>
                    </Pressable>

                    <Pressable
                      disabled={analyzingCheckUp || (!isOnline && selectedDetectionModel === 'rfdetr')}
                      onPress={uploadCheckUpPhoto}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className={`flex-1 items-center justify-center rounded-2xl border border-taupe/40 bg-cognac/10 py-3.5 active:scale-[0.98] ${!isOnline && selectedDetectionModel === 'rfdetr' ? 'opacity-50' : ''}`}>
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="font-bold text-cognac">
                        Upload
                      </Text>
                    </Pressable>
                  </View>

                  {checkUpError ? (
                    <View className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                      <Text
                        style={{ fontSize: Math.round(14 * fontScale) }}
                        className="font-bold text-rose-700">
                        AI analysis error
                      </Text>
                      <Text
                        style={{ fontSize: Math.round(14 * fontScale) }}
                        className="mt-2 leading-5 text-rose-700">
                        {checkUpError}
                      </Text>
                    </View>
                  ) : null}

                  {checkUpResult ? (
                    <View className="mt-4 gap-3">
                      <View className="rounded-2xl border border-taupe/30 bg-cognac/10 p-4">
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="font-semibold uppercase tracking-[0.18em] text-cognac">
                          Plant Model Verification
                        </Text>
                        <Text
                          style={{ fontSize: Math.round(16 * fontScale) }}
                          className="mt-2 font-bold text-espresso">
                          {checkUpResult.plant.summary}
                        </Text>
                      </View>

                      <View className="rounded-2xl border border-taupe/30 bg-white p-4">
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="mb-2 font-semibold uppercase tracking-[0.18em] text-taupe">
                          Crop Health Analysis
                        </Text>

                        <View className="mb-2 flex-row items-center justify-between border-b border-taupe/20 pb-2">
                          <Text
                            style={{ fontSize: Math.round(14 * fontScale) }}
                            className="font-medium text-taupe">
                            Primary Status:
                          </Text>
                          <Text
                            style={{ fontSize: Math.round(14 * fontScale) }}
                            className="font-black uppercase text-slate-950">
                            {checkUpResult.health.conditionLabel}
                          </Text>
                        </View>

                        {checkUpResult.health.allDetections.length > 0 ? (
                          <View className="my-2">
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="mb-1.5 font-bold text-orange-600">
                              Detected Markers ({checkUpResult.health.allDetections.length}):
                            </Text>
                            {checkUpResult.health.allDetections.map((item: any, index: number) => (
                              <View
                                key={`list-detection-${index}`}
                                className="mb-1 flex-row items-center justify-between rounded-xl border border-orange-100/40 bg-orange-50 px-3 py-1.5">
                                <Text
                                  style={{ fontSize: Math.round(12 * fontScale) }}
                                  className="font-bold capitalize text-espresso">
                                  {item.className.replace('_', ' ')}
                                </Text>
                                <Text
                                  style={{ fontSize: Math.round(12 * fontScale) }}
                                  className="font-mono font-black text-orange-700">
                                  {Math.round(item.confidence * 100)}% Match
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text
                            style={{ fontSize: Math.round(14 * fontScale) }}
                            className="mt-1 rounded-xl border border-taupe/20 bg-champagne p-3 text-center font-medium leading-5 text-taupe">
                            {checkUpResult.health.summary}
                          </Text>
                        )}

                        <View className="mt-2 border-t border-taupe/20 pt-3">
                          <Text
                            style={{ fontSize: Math.round(12 * fontScale) }}
                            className="mb-1 font-bold uppercase text-taupe">
                            Treatment Protocol:
                          </Text>
                          <Text
                            style={{ fontSize: Math.round(14 * fontScale) }}
                            className="leading-5 text-espresso">
                            {checkUpResult.health.recommendation}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {checkUpImageUri ? (
                    <Pressable
                      disabled={!checkUpImageUri || analyzingCheckUp || (!isOnline && selectedDetectionModel === 'rfdetr')}
                      onPress={() => {
                        triggerHaptic('medium');
                        if (checkUpImageUri) void analyzeCheckUpImage(checkUpImageUri);
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className={`mt-4 items-center justify-center rounded-2xl py-3.5 active:scale-[0.98] ${
                        checkUpImageUri && !analyzingCheckUp && (isOnline || selectedDetectionModel !== 'rfdetr') ? 'bg-cognac' : 'bg-taupe/50'
                      }`}>
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="font-bold text-white">
                        Re-Analyze
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {/* ============ PAGE 2 — HUMAN VALIDATION (PEST & ISSUE CHECKLIST) ============ */}
              {page === 2 ? (
                <View className="mb-2">
                  {/* Top Header Banner with Spotted status and clear action */}
                  <View className="shadow-xs mb-3 rounded-2xl border border-taupe/20 bg-white p-3.5">
                    <View className="mb-1.5 flex-row items-center justify-between">
                      <View className="flex-row items-center gap-1.5">
                        <Leaf size={16} color="#15803d" />
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="font-black uppercase tracking-[0.18em] text-cognac">
                          Pest & Issue Checklist
                        </Text>
                      </View>

                      <View className="flex-row items-center gap-2">
                        {step2SpottedCount === 0 ? (
                          <View className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5">
                            <Text
                              style={{ fontSize: Math.round(10 * fontScale) }}
                              className="font-bold text-emerald-800">
                              All Normal
                            </Text>
                          </View>
                        ) : (
                          <View className="flex-row items-center gap-1.5">
                            <View className="rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5">
                              <Text
                                style={{ fontSize: Math.round(10 * fontScale) }}
                                className="font-bold text-rose-800">
                                {step2SpottedCount} Spotted
                              </Text>
                            </View>
                            <Pressable
                              onPress={() => {
                                triggerHaptic('selection');
                                handleClearAllStep2Spotted();
                              }}
                              hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                              className="rounded-full bg-taupe/10 px-2 py-0.5 active:scale-95">
                              <Text
                                style={{ fontSize: Math.round(10 * fontScale) }}
                                className="font-semibold text-taupe">
                                Reset
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>

                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className="leading-4 text-taupe">
                      Select observed symptoms (showing 6 per page). Check &quot;Others&quot; if an unlisted issue occurs:
                    </Text>
                  </View>

                  {/* Search Bar */}
                  <View
                    style={isGloveMode ? { minHeight: 48 } : undefined}
                    className="mb-3 flex-row items-center rounded-xl border border-taupe/25 bg-champagne px-3 py-2">
                    <Search size={16} color="#8C4522" />
                    <TextInput
                      value={step2SearchQuery}
                      onChangeText={setStep2SearchQuery}
                      maxLength={255}
                      placeholder="Search pests, diseases, symptoms..."
                      placeholderTextColor="#8C7C70"
                      returnKeyType="search"
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className="ml-2 flex-1 py-0 text-espresso"
                    />
                    {step2SearchQuery.length > 0 && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          setStep2SearchQuery('');
                        }}
                        hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
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
                      onPress={() => {
                        triggerHaptic('selection');
                        setStep2CategoryFilter('all');
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 44, justifyContent: 'center' } : undefined}
                      className={`mr-1.5 flex-row items-center gap-1 rounded-lg border px-3 py-1.5 active:scale-95 ${
                        step2CategoryFilter === 'all'
                          ? 'border-cognac bg-cognac'
                          : 'border-taupe/20 bg-champagne'
                      }`}>
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`font-bold ${
                          step2CategoryFilter === 'all' ? 'text-white' : 'text-taupe'
                        }`}>
                        All ({checkUpQuestions.length})
                      </Text>
                    </Pressable>

                    {/* Pests */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        setStep2CategoryFilter('pest');
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 44, justifyContent: 'center' } : undefined}
                      className={`mr-1.5 flex-row items-center gap-1.5 rounded-lg border px-3 py-1.5 active:scale-95 ${
                        step2CategoryFilter === 'pest'
                          ? 'border-cognac bg-cognac'
                          : 'border-taupe/20 bg-champagne'
                      }`}>
                      <ShieldAlert
                        size={13}
                        color={step2CategoryFilter === 'pest' ? '#FFFFFF' : '#8C7C70'}
                      />
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`font-bold ${
                          step2CategoryFilter === 'pest' ? 'text-white' : 'text-taupe'
                        }`}>
                        Pests ({step2PestCount})
                      </Text>
                    </Pressable>

                    {/* Diseases */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        setStep2CategoryFilter('disease');
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 44, justifyContent: 'center' } : undefined}
                      className={`mr-1.5 flex-row items-center gap-1.5 rounded-lg border px-3 py-1.5 active:scale-95 ${
                        step2CategoryFilter === 'disease'
                          ? 'border-cognac bg-cognac'
                          : 'border-taupe/20 bg-champagne'
                      }`}>
                      <Leaf
                        size={13}
                        color={step2CategoryFilter === 'disease' ? '#FFFFFF' : '#8C7C70'}
                      />
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`font-bold ${
                          step2CategoryFilter === 'disease' ? 'text-white' : 'text-taupe'
                        }`}>
                        Diseases ({step2DiseaseCount})
                      </Text>
                    </Pressable>

                    {/* Others */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        setStep2CategoryFilter('other');
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 44, justifyContent: 'center' } : undefined}
                      className={`mr-1.5 flex-row items-center gap-1.5 rounded-lg border px-3 py-1.5 active:scale-95 ${
                        step2CategoryFilter === 'other'
                          ? 'border-cognac bg-cognac'
                          : step2HasOtherIssue
                          ? 'border-rose-300 bg-rose-50'
                          : 'border-taupe/20 bg-champagne'
                      }`}>
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`font-bold ${
                          step2CategoryFilter === 'other'
                            ? 'text-white'
                            : step2HasOtherIssue
                            ? 'text-rose-700'
                            : 'text-taupe'
                        }`}>
                        Others {step2HasOtherIssue ? '✓' : ''}
                      </Text>
                    </Pressable>

                    {/* Spotted Items */}
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        setStep2CategoryFilter('spotted');
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 44, justifyContent: 'center' } : undefined}
                      className={`mr-1.5 flex-row items-center gap-1.5 rounded-lg border px-3 py-1.5 active:scale-95 ${
                        step2CategoryFilter === 'spotted'
                          ? 'border-rose-600 bg-rose-600'
                          : step2SpottedCount > 0
                          ? 'border-rose-300 bg-rose-50'
                          : 'border-taupe/20 bg-champagne'
                      }`}>
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`font-bold ${
                          step2CategoryFilter === 'spotted'
                            ? 'text-white'
                            : step2SpottedCount > 0
                            ? 'text-rose-700'
                            : 'text-taupe'
                        }`}>
                        Spotted ({step2SpottedCount})
                      </Text>
                    </Pressable>
                  </ScrollView>

                  {/* Items List (Paginated max 6) */}
                  {filteredCheckUpQuestions.length === 0 && !shouldShowStep2OthersCard ? (
                    <View className="items-center justify-center rounded-xl border border-dashed border-taupe/30 bg-champagne/60 p-6">
                      <Search size={24} color="#8C7C70" />
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className="mt-2 font-bold text-espresso">
                        No matching pests or issues found
                      </Text>
                      <Text
                        style={{ fontSize: Math.round(11 * fontScale) }}
                        className="mt-1 text-center leading-4 text-taupe">
                        {step2SearchQuery
                          ? `No results for "${step2SearchQuery}". Try a different keyword.`
                          : 'No items in this category.'}
                      </Text>
                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          setStep2SearchQuery('');
                          setStep2CategoryFilter('all');
                        }}
                        hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                        style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                        className="mt-3 rounded-lg bg-cognac/10 px-3 py-1.5 active:scale-95">
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className="font-bold text-cognac">
                          Clear Filter & Search
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View className="flex-col gap-2">
                      {paginatedCheckUpQuestions.map((q) => {
                        const isChecked = Boolean(answers[q.id] === 'yes');
                        const itemCategory = getCheckUpQuestionCategory(q);
                        const isAiDetected = aiDetectedProblemIds.has(q.category);

                        return (
                          <Pressable
                            key={q.id}
                            onPress={() => {
                              triggerHaptic('selection');
                              handleToggleCheckUpQuestion(q.id);
                            }}
                            hitSlop={isGloveMode ? { top: 4, bottom: 4, left: 4, right: 4 } : undefined}
                            style={isGloveMode ? { minHeight: 52 } : undefined}
                            className={`flex-row items-start gap-3 rounded-xl border p-3 active:scale-[0.99] ${
                              isChecked
                                ? 'border-rose-300 bg-rose-50/70 shadow-sm'
                                : 'border-taupe/15 bg-white'
                            }`}>
                            {/* Checkbox indicator */}
                            <View
                              className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${
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
                              <View className="mb-1 flex-row flex-wrap items-center gap-1.5">
                                <View
                                  className={`rounded px-1.5 py-0.5 ${
                                    itemCategory === 'pest' ? 'bg-amber-100' : 'bg-indigo-100'
                                  }`}>
                                  <Text
                                    style={{ fontSize: Math.round(9 * fontScale) }}
                                    className={`font-black uppercase tracking-wider ${
                                      itemCategory === 'pest'
                                        ? 'text-amber-800'
                                        : 'text-indigo-800'
                                    }`}>
                                    {itemCategory === 'pest' ? 'Pest' : 'Disease'}
                                  </Text>
                                </View>

                                {isAiDetected && (
                                  <View className="rounded border border-orange-200 bg-orange-100 px-1.5 py-0.5">
                                    <Text
                                      style={{ fontSize: Math.round(9 * fontScale) }}
                                      className="font-bold text-orange-800">
                                      🤖 AI Flagged
                                    </Text>
                                  </View>
                                )}

                                <Text
                                  style={{ fontSize: Math.round(12 * fontScale) }}
                                  className={`${
                                    isChecked
                                      ? 'font-black text-rose-900'
                                      : 'font-bold text-espresso'
                                  }`}>
                                  {q.categoryName}
                                </Text>
                              </View>

                              <Text
                                style={{ fontSize: Math.round(11 * fontScale) }}
                                className="leading-4 text-taupe">
                                {q.question}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}

                      {/* "Others" Option Card */}
                      {shouldShowStep2OthersCard && (
                        <Pressable
                          onPress={() => {
                            triggerHaptic('selection');
                            setStep2HasOtherIssue((prev) => !prev);
                          }}
                          hitSlop={isGloveMode ? { top: 4, bottom: 4, left: 4, right: 4 } : undefined}
                          style={isGloveMode ? { minHeight: 52 } : undefined}
                          className={`rounded-xl border p-3 active:scale-[0.99] ${
                            step2HasOtherIssue
                              ? 'border-rose-300 bg-rose-50/80 shadow-sm'
                              : 'border-dashed border-taupe/30 bg-champagne/70'
                          }`}>
                          <View className="flex-row items-start gap-3">
                            {/* Checkbox */}
                            <View
                              className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${
                                step2HasOtherIssue
                                  ? 'border-rose-600 bg-rose-600'
                                  : 'border-taupe/40 bg-white'
                              }`}>
                              {step2HasOtherIssue && (
                                <Check size={12} color="#FFFFFF" strokeWidth={3} />
                              )}
                            </View>

                            <View className="flex-1">
                              <View className="mb-1 flex-row items-center gap-1.5">
                                <View className="rounded bg-taupe/15 px-1.5 py-0.5">
                                  <Text
                                    style={{ fontSize: Math.round(9 * fontScale) }}
                                    className="font-black uppercase tracking-wider text-taupe">
                                    Custom
                                  </Text>
                                </View>
                                <Text
                                  style={{ fontSize: Math.round(12 * fontScale) }}
                                  className={`${
                                    step2HasOtherIssue
                                      ? 'font-black text-rose-900'
                                      : 'font-bold text-espresso'
                                  }`}>
                                  Other Observed Issue
                                </Text>
                              </View>

                              <Text
                                style={{ fontSize: Math.round(11 * fontScale) }}
                                className="leading-4 text-taupe">
                                Check this if you notice an unlisted problem, unusual leaf coloring, or unfamiliar pest.
                              </Text>

                              {step2HasOtherIssue && (
                                <View className="mt-2.5">
                                  <TextInput
                                    value={step2OtherIssueText}
                                    onChangeText={setStep2OtherIssueText}
                                    maxLength={255}
                                    placeholder="Describe the symptom or unlisted observation..."
                                    placeholderTextColor="#8C7C70"
                                    multiline
                                    numberOfLines={2}
                                    style={{ fontSize: Math.round(12 * fontScale) }}
                                    className="rounded-lg border border-rose-300 bg-white p-2 text-espresso"
                                  />
                                </View>
                              )}
                            </View>
                          </View>
                        </Pressable>
                      )}
                    </View>
                  )}

                  {/* Pagination Controls */}
                  {step2TotalPages > 1 && (
                    <View className="mt-3 flex-row items-center justify-between border-t border-taupe/15 pt-3">
                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          setStep2CurrentPage((p) => Math.max(1, p - 1));
                        }}
                        disabled={step2SafeCurrentPage === 1}
                        hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                        style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                        className={`rounded-lg px-3 py-1.5 active:scale-95 ${
                          step2SafeCurrentPage === 1 ? 'bg-taupe/20' : 'bg-cognac'
                        }`}>
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className={`font-bold ${
                            step2SafeCurrentPage === 1 ? 'text-taupe' : 'text-white'
                          }`}>
                          Previous
                        </Text>
                      </Pressable>

                      <Text
                        style={{ fontSize: Math.round(11 * fontScale) }}
                        className="font-semibold text-espresso">
                        Page {step2SafeCurrentPage} of {step2TotalPages} ({filteredCheckUpQuestions.length} items)
                      </Text>

                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          setStep2CurrentPage((p) => Math.min(step2TotalPages, p + 1));
                        }}
                        disabled={step2SafeCurrentPage === step2TotalPages}
                        hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                        style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                        className={`rounded-lg px-3 py-1.5 active:scale-95 ${
                          step2SafeCurrentPage === step2TotalPages ? 'bg-taupe/20' : 'bg-cognac'
                        }`}>
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className={`font-bold ${
                            step2SafeCurrentPage === step2TotalPages ? 'text-taupe' : 'text-white'
                          }`}>
                          Next
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : null}

              {/* ============ PAGE 3 — SUMMARY + GRAPH ============ */}
              {page === 3 ? (
                <View>
                  {/* Scanned Image with Bounding Box Overlays */}
                  {checkUpImageUri ? (
                    <View className="relative mb-4 aspect-square w-full overflow-hidden rounded-2xl bg-slate-950">
                      <Image
                        key={`summary-img-${checkUpImageUri}`}
                        source={{ uri: checkUpImageUri }}
                        className="absolute inset-0 h-full w-full"
                        resizeMode="cover"
                      />

                      {checkUpResult?.health?.allDetections?.map((box: any, index: number) => {
                        const left = `${(box.bbox.x - box.bbox.width / 2) * 100}%`;
                        const top = `${(box.bbox.y - box.bbox.height / 2) * 100}%`;
                        const width = `${box.bbox.width * 100}%`;
                        const height = `${box.bbox.height * 100}%`;

                        return (
                          <View
                            key={`bbox-overlay-summary-${index}`}
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
                              <Text
                                style={{ fontSize: Math.round(9 * fontScale) }}
                                className="font-mono font-bold uppercase tracking-wider text-white">
                                {box.className.replace('_', ' ')} {Math.round(box.confidence * 100)}%
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  <View className="rounded-2xl border border-taupe/30 bg-cognac/10 p-4">
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className="font-semibold uppercase tracking-[0.18em] text-cognac">
                      Overall Summary
                    </Text>
                    <Text
                      style={{ fontSize: Math.round(14 * fontScale) }}
                      className="mt-2 leading-5 text-espresso">
                      {checkUpResult?.health?.summary || 'Assessment completed.'}
                    </Text>
                  </View>

                  <View className="mt-5 rounded-2xl border border-taupe/30 bg-white p-4">
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className="mb-3 font-semibold uppercase tracking-[0.18em] text-taupe">
                      Assessment Breakdown
                    </Text>

                    {dynamicProblems.map((problem) => {
                      const score = questionnaireScores[problem.id] ?? 0;
                      const max = questionnaireMax[problem.id] || 1;
                      const pct = Math.min((score / max) * 100, 100);

                      return (
                        <View key={`chart-${problem.id}`} className="mb-3.5">
                          <View className="mb-1 flex-row items-center justify-between">
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="font-bold text-espresso">
                              {problem.name}
                            </Text>
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="font-bold text-taupe">
                              {score}/{max}
                            </Text>
                          </View>
                          <View className="h-3 w-full overflow-hidden rounded-full bg-champagne">
                            <View
                              style={{ width: `${pct}%` as any }}
                              className={`h-full rounded-full ${pct > 0 ? 'bg-orange-500' : 'bg-champagne'}`}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* ============ PAGE 4 — MITIGATION PLAN ============ */}
              {page === 4 ? (
                <View>
                  {sortedProblems.length === 0 ? (
                    <View className="mt-2 rounded-2xl border border-taupe/20 bg-champagne p-6">
                      <Text
                        style={{ fontSize: Math.round(14 * fontScale) }}
                        className="text-center font-medium text-taupe">
                        No significant issues detected. Your plant looks healthy!
                      </Text>
                    </View>
                  ) : (
                    sortedProblems.map((problem, index) => {
                      const classId = problem.classId;
                      let label = '';
                      const dyn = dynamicProblems.find((d) => d.id === classId);
                      if (dyn) {
                        label = dyn.name;
                      } else if (typeof (classId as unknown) === 'number') {
                        label = formatLabel(
                          CONDITION_LABELS[classId as unknown as number] || `Unknown (${classId})`
                        );
                      } else {
                        label = formatLabel(String(classId));
                      }

                      const mitigationSteps: Mitigation[] | null = dbMitigations[classId] || null;
                      const isExpanded = !!expandedMitigation[classId];

                      return (
                        <View
                          key={`problem-card-${classId}`}
                          className="mt-3 rounded-2xl border border-taupe/30 bg-white p-4">
                          <View className="flex-row items-start gap-3">
                            <View className="h-8 w-8 items-center justify-center rounded-full bg-cognac">
                              <Text
                                style={{ fontSize: Math.round(14 * fontScale) }}
                                className="font-black text-white">
                                {index + 1}
                              </Text>
                            </View>
                            <View className="flex-1">
                              <Text
                                style={{ fontSize: Math.round(16 * fontScale) }}
                                className="font-black text-espresso">
                                {label}
                              </Text>
                              <Text
                                style={{ fontSize: Math.round(12 * fontScale) }}
                                className="mt-0.5 font-semibold text-taupe">
                                Severity Score: {problem.score}
                              </Text>
                            </View>
                          </View>

                          <Pressable
                            onPress={() => {
                              triggerHaptic('selection');
                              toggleMitigation(classId);
                            }}
                            hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                            style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                            className="mt-3 flex-row items-center justify-between rounded-xl bg-champagne px-3 py-2.5 active:scale-[0.98]">
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="font-bold uppercase tracking-wider text-taupe">
                              {isExpanded ? 'Hide Mitigation Steps' : 'Show Mitigation Steps'}
                            </Text>
                            <Text
                              style={{ fontSize: Math.round(12 * fontScale) }}
                              className="font-bold text-taupe">
                              {isExpanded ? '▲' : '▼'}
                            </Text>
                          </Pressable>

                          {isExpanded ? (
                            <View className="mt-2 gap-2">
                              {mitigationSteps?.map((step, stepIndex) => (
                                <View
                                  key={`mitigation-${classId}-${stepIndex}`}
                                  className="rounded-xl border border-taupe/30 bg-cognac/10 p-3">
                                  <Text
                                    style={{ fontSize: Math.round(10 * fontScale) }}
                                    className="font-bold uppercase tracking-widest text-cognac">
                                    Day {step.day}
                                  </Text>
                                  <Text
                                    style={{ fontSize: Math.round(14 * fontScale) }}
                                    className="mt-1 font-bold text-espresso">
                                    {step.title}
                                  </Text>
                                  <Text
                                    style={{ fontSize: Math.round(12 * fontScale) }}
                                    className="mt-1 leading-5 text-taupe">
                                    {step.description}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}

                          {!isViewingSavedResult && (
                            <View className="mt-3">
                              {selectedMitigationClasses[classId] ? (
                                <View className="flex-row items-center gap-2">
                                  <View
                                    style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5">
                                    <Check size={14} color="#FFFFFF" strokeWidth={3} />
                                    <Text
                                      style={{ fontSize: Math.round(12 * fontScale) }}
                                      className="font-bold text-white">
                                      Added
                                    </Text>
                                  </View>
                                  <Pressable
                                    onPress={() => {
                                      triggerHaptic('light');
                                      handleUnstageMitigation(classId);
                                    }}
                                    hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                                    style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                                    className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 active:scale-95">
                                    <Text
                                      style={{ fontSize: Math.round(12 * fontScale) }}
                                      className="font-bold text-rose-700">
                                      Remove
                                    </Text>
                                  </Pressable>
                                </View>
                              ) : (
                                <Pressable
                                  onPress={() => {
                                    triggerHaptic('medium');
                                    handleStageMitigation(classId);
                                  }}
                                  disabled={addingMitigationId === classId}
                                  hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                                  style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                                  className="flex-row items-center justify-center gap-1.5 rounded-xl bg-cognac py-2.5 active:scale-[0.98]">
                                  {addingMitigationId === classId ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                  ) : (
                                    <>
                                      <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
                                      <Text
                                        style={{ fontSize: Math.round(12 * fontScale) }}
                                        className="font-bold text-white">
                                        Add
                                      </Text>
                                    </>
                                  )}
                                </Pressable>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}
            </ScrollView>

            {/* ============ BOTTOM NAV ============ */}
            <View className="mt-5 flex-row gap-3">
              {page === 1 ? (
                <>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      handleCloseCheckUpModal();
                    }}
                    hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                    style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                    className="flex-1 items-center justify-center rounded-2xl border border-taupe/30 bg-white py-3.5 active:scale-[0.98]">
                    <Text
                      style={{ fontSize: Math.round(16 * fontScale) }}
                      className="font-bold text-espresso">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={!checkUpResult}
                    onPress={() => {
                      triggerHaptic('medium');
                      goNext();
                    }}
                    hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                    style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                    className={`flex-1 items-center justify-center rounded-2xl py-3.5 active:scale-[0.98] ${
                      checkUpResult ? 'bg-cognac' : 'bg-taupe/40'
                    }`}>
                    <Text
                      style={{ fontSize: Math.round(16 * fontScale) }}
                      className="font-bold text-white">
                      Next
                    </Text>
                  </Pressable>
                </>
              ) : null}

              {page === 2 ? (
                <>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('selection');
                      goBack();
                    }}
                    hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                    style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                    className="flex-1 items-center justify-center rounded-2xl border border-taupe/30 bg-white py-3.5 active:scale-[0.98]">
                    <Text
                      style={{ fontSize: Math.round(16 * fontScale) }}
                      className="font-bold text-espresso">
                      Back
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('medium');
                      goNext();
                    }}
                    hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                    style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                    className="flex-1 items-center justify-center rounded-2xl bg-cognac py-3.5 active:scale-[0.98]">
                    <Text
                      style={{ fontSize: Math.round(16 * fontScale) }}
                      className="font-bold text-white">
                      Next
                    </Text>
                  </Pressable>
                </>
              ) : null}

              {page === 3 ? (
                isViewingSavedResult ? (
                  <>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('light');
                        handleRetakeAssessment();
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className="flex-1 items-center justify-center rounded-2xl border border-cognac/30 bg-cognac/10 py-3.5 active:scale-[0.98]">
                      <Text
                        style={{ fontSize: Math.round(14 * fontScale) }}
                        className="font-bold text-cognac">
                        Retake Scan
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('medium');
                        goNext();
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className="flex-1 items-center justify-center rounded-2xl bg-cognac py-3.5 active:scale-[0.98]">
                      <Text
                        style={{ fontSize: Math.round(14 * fontScale) }}
                        className="font-bold text-white">
                        Mitigation Plan
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        goBack();
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className="flex-1 items-center justify-center rounded-2xl border border-taupe/30 bg-white py-3.5 active:scale-[0.98]">
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="font-bold text-espresso">
                        Back
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('medium');
                        handleSaveAndGoNext();
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className="flex-1 items-center justify-center rounded-2xl bg-cognac py-3.5 active:scale-[0.98]">
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="font-bold text-white">
                        Done
                      </Text>
                    </Pressable>
                  </>
                )
              ) : null}

              {page === 4 ? (
                isViewingSavedResult ? (
                  <>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        goBack();
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className="flex-1 items-center justify-center rounded-2xl border border-taupe/30 bg-white py-3.5 active:scale-[0.98]">
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="font-bold text-espresso">
                        Back to Diagnosis
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        handleCloseCheckUpModal();
                      }}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className="flex-1 items-center justify-center rounded-2xl bg-cognac py-3.5 active:scale-[0.98]">
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="font-bold text-white">
                        Close
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        goBack();
                      }}
                      disabled={isFinishingCheckUp}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className="flex-1 items-center justify-center rounded-2xl border border-taupe/30 bg-white py-3.5 active:scale-[0.98]">
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="font-bold text-espresso">
                        Back
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        triggerHaptic('heavy');
                        handleFinishCheckUp();
                      }}
                      disabled={isFinishingCheckUp}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 52, justifyContent: 'center' } : undefined}
                      className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-cognac py-3.5 active:scale-[0.98]">
                      {isFinishingCheckUp ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text
                          style={{ fontSize: Math.round(16 * fontScale) }}
                          className="font-bold text-white">
                          Finish
                        </Text>
                      )}
                    </Pressable>
                  </>
                )
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* EDGE Model Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEdgeModelModalVisible}
        onRequestClose={() => setIsEdgeModelModalVisible(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <Pressable
            className="flex-1"
            onPress={() => setIsEdgeModelModalVisible(false)}
          />
          <View className="max-h-[80%] rounded-t-3xl bg-champagne p-6 shadow-xl">
            <View className="mb-4 flex-row items-center justify-between">
              <Text
                style={{ fontSize: Math.round(20 * fontScale) }}
                className="font-bold text-espresso">
                Select EDGE Model
              </Text>
              <Pressable
                onPress={() => {
                  triggerHaptic('selection');
                  setIsEdgeModelModalVisible(false);
                }}
                hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                style={isGloveMode ? { minWidth: 44, minHeight: 44 } : undefined}
                className="h-8 w-8 items-center justify-center rounded-full bg-taupe/10 p-2">
                <Text
                  style={{ fontSize: Math.round(14 * fontScale) }}
                  className="font-bold leading-none text-taupe">
                  ✕
                </Text>
              </Pressable>
            </View>
            <Text
              style={{ fontSize: Math.round(14 * fontScale) }}
              className="mb-4 text-taupe">
              Choose an on-device model for plant health detection.
            </Text>

            {!isOnline && (
              <Text className="mb-3 text-sm text-amber-800">
                Connect to the internet to download a new EDGE model. Installed models remain available.
              </Text>
            )}

            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
              className="mb-4">
              {availableEdgeModels.map((model) => {
                const isDownloaded = downloadedModels[model.modelName];
                const isActive = model.modelName === activeEdgeModel;
                const displayName = formatModelName(model.modelName) || model.modelName;
                const tier = getTierLabel(model.modelName, model.url);
                return (
                  <View
                    key={model.modelName}
                    className="mb-3 flex-row items-center rounded-2xl border border-cognac/15 bg-white p-4 active:bg-cognac/5">
                    <Pressable
                      onPress={() => {
                        triggerHaptic('selection');
                        handleEdgeModelSelect(model);
                      }}
                      disabled={!isDownloaded && !isOnline}
                      className={`flex-1 ${!isDownloaded && !isOnline ? 'opacity-50' : ''}`}>
                      <Text
                        style={{ fontSize: Math.round(16 * fontScale) }}
                        className="font-bold text-espresso">
                        {displayName}
                      </Text>
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className="mt-0.5 font-semibold text-taupe">
                        {tier} • {model.size || 'Size N/A'}{model.version ? ` • v${model.version}` : ''}
                      </Text>
                      {model.description ? (
                        <Text
                          style={{ fontSize: Math.round(11 * fontScale) }}
                          className="mt-1 leading-4 text-taupe/80">
                          {model.description}
                        </Text>
                      ) : null}
                      {isDownloaded && (
                        <Text
                          style={{ fontSize: Math.round(11 * fontScale) }}
                          className="mt-1.5 font-bold text-emerald-700">
                          {isActive ? '✓ Active on device' : '✓ Downloaded'}
                        </Text>
                      )}
                    </Pressable>
                    {isDownloaded ? (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('medium');
                          handleDeleteEdgeModel(model.modelName);
                        }}
                        hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : { top: 6, bottom: 6, left: 6, right: 6 }}
                        className="ml-3 h-10 w-10 items-center justify-center rounded-xl bg-red-50 active:bg-red-100">
                        <Trash2 width={18} height={18} color="#ef4444" />
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('selection');
                          handleEdgeModelSelect(model);
                        }}
                        disabled={!isOnline}
                        hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : { top: 6, bottom: 6, left: 6, right: 6 }}
                        className={`ml-3 flex-row items-center gap-1 rounded-xl bg-cognac/10 px-3 py-2 active:scale-95 active:bg-cognac/20 ${!isOnline ? 'opacity-50' : ''}`}>
                        <Download size={13} color="#8C4522" strokeWidth={2.5} />
                        <Text
                          style={{ fontSize: Math.round(11 * fontScale) }}
                          className="font-bold text-cognac">
                          Get
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setIsEdgeModelModalVisible(false);
                router.push('/settings/edge-models');
              }}
              hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
              style={isGloveMode ? { minHeight: 50, justifyContent: 'center' } : undefined}
              className="mt-1 flex-row items-center justify-center rounded-2xl border border-cognac/30 bg-cognac/10 py-3 active:scale-[0.98]">
              <Text
                style={{ fontSize: Math.round(14 * fontScale) }}
                className="font-bold text-cognac">
                Manage Models & Storage in Settings →
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <LocationPickerModal
        visible={isLocationModalVisible}
        onClose={() => setIsLocationModalVisible(false)}
        initialLocation={locationObj}
        onSelect={(loc) => setLocationObj(loc)}
      />

      <DailyReportFormModal
        visible={isDailyReportFormOpen}
        onClose={() => setIsDailyReportFormOpen(false)}
        onSubmit={async (data) => {
          await handleDailyReportSubmit(data);
        }}
        plots={dailyReportPlots}
        questions={dailyReportQuestions}
        isSubmitting={isDailyReportSubmitting}
      />

      <DailyReportsViewerSheet
        visible={isDailyReportViewerOpen}
        onClose={() => setIsDailyReportViewerOpen(false)}
        reports={dailyReports}
        plots={dailyReportPlots}
        onDeleteReport={handleDailyReportRemove}
        isOwner={farm?.user_id === user?.id}
        currentUserId={user?.id}
      />

      {/* Delete Farm Confirmation Modal (Requires typing "CONFIRM") */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isDeleteModalVisible}
        onRequestClose={() => {
          if (!isDeletingFarm) {
            Keyboard.dismiss();
            setIsDeleteModalVisible(false);
            setDeleteConfirmText('');
          }
        }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="flex-1 items-center justify-center bg-black/60 px-5">
            <Pressable
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onPress={() => {
                if (!isDeletingFarm) {
                  Keyboard.dismiss();
                  setIsDeleteModalVisible(false);
                  setDeleteConfirmText('');
                }
              }}
            />
            <View
              className="w-full max-w-sm rounded-[28px] border border-rose-200 bg-white p-6 shadow-2xl"
              style={
                isHighContrast
                  ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                  : undefined
              }>
              {/* Warning Icon Badge */}
              <View className="mb-3.5 h-14 w-14 items-center justify-center self-center rounded-2xl border border-rose-200/60 bg-rose-100">
                <Trash2 size={26} color="#E11D48" />
              </View>

              {/* Modal Title & Destructive Notice */}
              <Text
                className="text-center text-xl font-black tracking-tight text-espresso"
                style={{ fontSize: 20 * fontScale }}>
                Delete Farm
              </Text>
              <Text
                className="mt-2 text-center text-xs leading-5 text-taupe"
                style={{ fontSize: 12 * fontScale }}>
                This action <Text className="font-bold text-rose-600">cannot be undone</Text>. Deleting{' '}
                <Text className="font-bold text-espresso">&quot;{farm?.farm_name}&quot;</Text> will permanently remove all associated farm layouts, plots, crop cycles, tasks, sensor history, and member records.
              </Text>

              {/* Instruction Card */}
              <View className="mt-4 rounded-2xl border border-rose-200/80 bg-rose-50/60 p-3.5">
                <Text
                  className="text-center text-xs font-semibold text-rose-900"
                  style={{ fontSize: 12 * fontScale }}>
                  To proceed, please type{' '}
                  <Text className="font-mono font-black tracking-wider text-rose-700">CONFIRM</Text>{' '}
                  below:
                </Text>
              </View>

              {/* Text Input */}
              <View className="mt-3">
                <TextInput
                  value={deleteConfirmText}
                  onChangeText={setDeleteConfirmText}
                  placeholder='Type "CONFIRM"'
                  placeholderTextColor={isHighContrast ? '#555555' : '#A89F91'}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={20}
                  editable={!isDeletingFarm}
                  className={`rounded-2xl border px-4 py-3.5 text-center font-mono text-base font-bold text-espresso ${
                    deleteConfirmText === 'CONFIRM'
                      ? 'border-emerald-500 bg-emerald-50/50 text-emerald-800'
                      : deleteConfirmText.length > 0
                      ? 'border-rose-400 bg-rose-50/20'
                      : 'border-black/15 bg-champagne/30'
                  }`}
                  accessibilityLabel="Type CONFIRM to confirm deletion"
                />

                {/* Validation helper feedback */}
                {deleteConfirmText.length > 0 && deleteConfirmText !== 'CONFIRM' ? (
                  <Text className="mt-1.5 text-center text-[11px] font-semibold text-rose-600">
                    Must exactly match uppercase &quot;CONFIRM&quot;
                  </Text>
                ) : deleteConfirmText === 'CONFIRM' ? (
                  <Text className="mt-1.5 text-center text-[11px] font-bold text-emerald-600">
                    Confirmation matched. Ready to delete.
                  </Text>
                ) : null}
              </View>

              {/* Action Buttons */}
              <View className="mt-6 flex-row gap-3">
                <Pressable
                  onPress={() => {
                    triggerHaptic('selection');
                    setIsDeleteModalVisible(false);
                    setDeleteConfirmText('');
                  }}
                  disabled={isDeletingFarm}
                  className={`flex-1 items-center justify-center rounded-2xl border border-black/10 bg-champagne/50 py-3.5 active:scale-[0.98] ${
                    isGloveMode ? 'min-h-[50px]' : ''
                  }`}>
                  <Text className="font-bold text-espresso">Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleConfirmDeleteFarm}
                  disabled={deleteConfirmText !== 'CONFIRM' || isDeletingFarm}
                  className={`flex-1 items-center justify-center rounded-2xl py-3.5 shadow-sm active:scale-[0.98] ${
                    deleteConfirmText === 'CONFIRM' && !isDeletingFarm
                      ? 'bg-rose-600 shadow-rose-600/30'
                      : 'bg-rose-300 opacity-60'
                  } ${isGloveMode ? 'min-h-[50px]' : ''}`}>
                  {isDeletingFarm ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="font-bold text-white">Delete Farm</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
