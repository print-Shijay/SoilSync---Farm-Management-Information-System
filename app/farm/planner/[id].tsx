import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, BackHandler, Keyboard, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppAlert as Alert } from '../../../components/common/AppAlert';

import { Modal, KeyboardAvoidingView } from '../../../components/common/AppModal';
import {
  Sprout,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Layers,
  CheckCircle2,
  Clock,
  History,
  CircleAlert,
  Sparkles,
  Leaf,
  AlertTriangle,
  RotateCcw,
  X,
  Info,
  ChevronDown,
  CloudSun,
  Bell,
} from 'lucide-react-native';

import { cropIcons } from '../../../lib/cropIcons';
import { BackButton } from '../../../components/common/BackButton';
import CropAvatar from '../../../components/CropAvatar';
import CustomCropModal from '../../../components/CustomCropModal';

import {
  Crop,
  Milestone,
  findCropByName,
  filterCropsBySeason,
  getAvailableCrops,
  loadCropDetails,
  parseMaturityDays,
  getCrops,
  getSuccessionRelationship,
  generateDefaultMilestones,
  inferCropBotanicalProfile,
} from '../../../lib/crop-planner';
import {
  CropRotationPlanData,
  CropRotationSeason,
  getFarmSuccessionPlan,
  saveFarmRotationPlan,
  getAvailableFarmPlots,
  getExistingFarmLayoutWithStructures,
  deleteAllFarmRotationPlans,
  deleteFarmRotationPlan,
  stopFarmCropPlan,
  getFarmCropHistory,
  generateUUID,
} from '../../../lib/db-operations';
import { useAuth } from '../../../lib/AuthContext';
import { useEffectiveRole } from '../../../lib/hooks/useEffectiveRole';
import { useNetworkStatus } from '../../../lib/hooks/useNetworkStatus';
import { checkIsOrganicFarmPartner } from '../../../lib/partner';
import { generateCropSuccessionPlan } from '../../../lib/gemini';
import {
  startAiCropPlanJob,
  getActiveAiJob,
  getCompletedAiJob,
  cancelAiJob,
  clearAiJob,
  subscribeToAiJob,
  AiCropPlanJob,
} from '../../../lib/ai-crop-plan-job';
import {
  getMonthlyAiUsage,
  getDailyAiUsage,
  recordAiGenerationUsage,
  MAX_MONTHLY_AI_GENERATIONS,
  MAX_DAILY_AI_GENERATIONS,
  AiUsageStatus,
} from '../../../lib/ai-usage-limit';
import { getWeatherData, CachedWeather } from '../../../lib/weather-service';

const SEASONS: CropRotationSeason[] = ['Both', 'Dry Season', 'Wet Season'];
const DURATION_DAY_PRESETS = [30, 60, 90, 180, 365];

const MILESTONE_PHASE_LABELS: {
  label: 'preparation' | 'growth' | 'checkup';
  name: string;
  shortName: string;
  color: string;
  bg: string;
  borderColor: string;
}[] = [
  {
    label: 'preparation',
    name: 'Preparation',
    shortName: 'Prep',
    color: '#1E40AF',
    bg: 'bg-blue-100',
    borderColor: 'border-blue-300',
  },
  {
    label: 'growth',
    name: 'Growth / Care',
    shortName: 'Care',
    color: '#8C4522',
    bg: 'bg-cognac/10',
    borderColor: 'border-cognac/30',
  },
  {
    label: 'checkup',
    name: 'Checkup',
    shortName: 'Checkup',
    color: '#B45309',
    bg: 'bg-amber-100',
    borderColor: 'border-amber-300',
  },
];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function dateKeyToDate(value?: string | null) {
  if (!value) {
    return new Date();
  }

  const [year, month, day] = value.slice(0, 10).split('-').map(Number);

  if (!year || !month || !day) {
    return new Date(value);
  }

  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function getCropDurationDays(crop?: Crop | null) {
  if (!crop) return 30;
  return parseMaturityDays(crop.maturity_days) || 30;
}

function formatMonthRange(startDate: Date, startDay: number, endDay: number) {
  const cropStartDate = addDays(startDate, startDay);
  const cropEndDate = addDays(startDate, endDay);
  const startMonthName = cropStartDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });
  const endMonthName = cropEndDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  return startMonthName === endMonthName ? startMonthName : `${startMonthName} - ${endMonthName}`;
}

function getCropStartDay(selectedCrops: Crop[], cropIndex: number) {
  if (!Array.isArray(selectedCrops)) return 0;
  return selectedCrops
    .slice(0, cropIndex)
    .reduce((totalDays, crop) => totalDays + getCropDurationDays(crop), 0);
}

type PlanStatus = 'upcoming' | 'ongoing' | 'finished';

function getPlanStatus(plan: CropRotationPlanData): PlanStatus {
  if (!plan || !plan.startDate) return 'ongoing';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const planStartDate = dateKeyToDate(plan.startDate);
  planStartDate.setHours(0, 0, 0, 0);

  const totalDays =
    plan.totalAvailableDays ||
    plan.durationDays ||
    (Array.isArray(plan.selectedCrops)
      ? plan.selectedCrops.reduce((acc, c) => acc + getCropDurationDays(c), 0)
      : 30);

  const planEndDate = addDays(planStartDate, totalDays);
  planEndDate.setHours(23, 59, 59, 999);

  if (today < planStartDate) {
    return 'upcoming';
  }
  if (today > planEndDate) {
    return 'finished';
  }
  return 'ongoing';
}

type CropStatus = 'upcoming' | 'ongoing' | 'completed';

function getCropStatus(plan: CropRotationPlanData, cropIndex: number): CropStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (
    !plan ||
    !plan.startDate ||
    !Array.isArray(plan.selectedCrops) ||
    !plan.selectedCrops[cropIndex]
  ) {
    return 'upcoming';
  }

  const planStartDate = dateKeyToDate(plan.startDate);
  planStartDate.setHours(0, 0, 0, 0);

  const startDay = getCropStartDay(plan.selectedCrops, cropIndex);
  const duration = getCropDurationDays(plan.selectedCrops[cropIndex]);
  const endDay = startDay + duration;

  const cropStart = addDays(planStartDate, startDay);
  cropStart.setHours(0, 0, 0, 0);

  const cropEnd = addDays(planStartDate, endDay);
  cropEnd.setHours(23, 59, 59, 999);

  if (today < cropStart) {
    return 'upcoming';
  }
  if (today > cropEnd) {
    return 'completed';
  }
  return 'ongoing';
}

export default function CropPlannerScreen() {
  const { isOnline } = useNetworkStatus();
  const params = useLocalSearchParams();
  const farmId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user, isFarmPartner: authIsPartner } = useAuth();
  const [isFarmPartner, setIsFarmPartner] = useState(authIsPartner);
  const { permissions, role: effectiveRole } = useEffectiveRole({ farmId });

  useEffect(() => {
    let isMounted = true;
    if (authIsPartner) {
      setIsFarmPartner(true);
    } else if (user?.email) {
      checkIsOrganicFarmPartner(user.email).then((status) => {
        if (isMounted && status) {
          setIsFarmPartner(true);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [authIsPartner, user?.email]);

  const [allCrops, setAllCrops] = useState<Crop[]>([]);
  const [customCropModalVisible, setCustomCropModalVisible] = useState(false);
  const [editingCrop, setEditingCrop] = useState<Crop | null>(null);

  const refreshCrops = useCallback(async () => {
    const crops = await getCrops(true, user?.id);
    setAllCrops(crops);
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;
    getCrops(false, user?.id).then((crops) => {
      if (isMounted) {
        setAllCrops(crops);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const [weatherData, setWeatherData] = useState<CachedWeather | null>(null);
  const [aiClimateSummary, setAiClimateSummary] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getWeatherData().then((data) => {
      if (isMounted && data) {
        setWeatherData(data);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const [aiUsage, setAiUsage] = useState<AiUsageStatus>({
    count: 0,
    remaining: MAX_MONTHLY_AI_GENERATIONS,
    max: MAX_MONTHLY_AI_GENERATIONS,
    isLimitReached: false,
    verifiedOnline: false,
  });

  const refreshAiUsage = useCallback(async () => {
    const status = await getMonthlyAiUsage(user?.id);
    setAiUsage(status);
  }, [user?.id]);

  const [step, setStep] = useState(1);
  const [planningMode, setPlanningMode] = useState<'single' | 'rotation'>('single');
  const [durationDaysInput, setDurationDaysInput] = useState('60');
  const [season, setSeason] = useState<CropRotationSeason>('Both');
  const [startDate, setStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [showAiProgressModal, setShowAiProgressModal] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiProgressStage, setAiProgressStage] = useState('');
  const [aiProgressSubtitle, setAiProgressSubtitle] = useState('');
  const [activeJob, setActiveJob] = useState<AiCropPlanJob | null>(null);
  const [completedJob, setCompletedJob] = useState<AiCropPlanJob | null>(null);
  const [totalAvailableDays, setTotalAvailableDays] = useState(0);
  const [remainingDays, setRemainingDays] = useState(0);
  const [selectedCrops, setSelectedCrops] = useState<Crop[]>([]);
  const [expandedCropId, setExpandedCropId] = useState<string | null>(null);

  const restoreJobIntoPlanner = useCallback(
    async (job: AiCropPlanJob) => {
      if (!job.result) return;

      setAiClimateSummary(job.result.aiClimateSummary);
      setMilestoneMode('system');
      setOpenMilestoneCropIndices([]);
      setTotalAvailableDays(job.result.totalDays);
      setRemainingDays(Math.max(job.result.totalDays - job.result.usedDays, 0));
      setSelectedCrops(job.result.matchedCrops);
      setExpandedCropId(null);
      if (job.result.targetPlots && job.result.targetPlots.length > 0) {
        setSelectedPlots(job.result.targetPlots);
      }
      setStep(3);

      await clearAiJob(farmId);
      setCompletedJob(null);
      setActiveJob(null);
      setShowAiProgressModal(false);
      setIsAiGenerating(false);

      void refreshAiUsage();
    },
    [farmId, refreshAiUsage]
  );

  // Check for ongoing or completed background AI jobs
  useEffect(() => {
    if (!farmId) return;

    getActiveAiJob(farmId).then((job) => {
      if (job) {
        setActiveJob(job);
        setIsAiGenerating(true);
        setAiProgress(job.progress);
        setAiProgressStage(job.stage);
        setAiProgressSubtitle(job.subtitle);
      }
    });

    getCompletedAiJob(farmId).then((job) => {
      if (job) {
        setCompletedJob(job);
        if (params.fromNotif || params.jobId === job.id) {
          void restoreJobIntoPlanner(job);
        }
      }
    });

    const unsubscribe = subscribeToAiJob((job) => {
      if (job.farmId !== farmId) return;

      if (job.status === 'generating') {
        setActiveJob(job);
        setIsAiGenerating(true);
        setAiProgress(job.progress);
        setAiProgressStage(job.stage);
        setAiProgressSubtitle(job.subtitle);
      } else if (job.status === 'completed') {
        setActiveJob(null);
        setIsAiGenerating(false);
        setCompletedJob(job);
        setShowAiProgressModal(false);
        void restoreJobIntoPlanner(job);
      } else if (job.status === 'cancelled' || job.status === 'failed') {
        setActiveJob(null);
        setIsAiGenerating(false);
        setShowAiProgressModal(false);
        if (job.status === 'failed') {
          Alert.alert(
            'AI Crop Planner',
            job.error?.includes('10 minutes')
              ? 'The AI cloud request timed out after 10 minutes. Switching to manual succession selection.'
              : 'Could not generate a succession plan with the cloud model. Switching to manual succession selection.',
            [{ text: 'OK', onPress: () => handleGenerateRecommendations() }]
          );
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [farmId, params.fromNotif, params.jobId, restoreJobIntoPlanner]);
  const [availablePlots, setAvailablePlots] = useState<
    { id: string; label: string | null; type_name: string }[]
  >([]);
  const [totalPlotsCount, setTotalPlotsCount] = useState<number | null>(null);
  const [isLoadingPlots, setIsLoadingPlots] = useState<boolean>(true);
  const [allPlotsMap, setAllPlotsMap] = useState<Record<string, string>>({});
  const [selectedPlots, setSelectedPlots] = useState<string[]>([]);
  const [allActivePlans, setAllActivePlans] = useState<CropRotationPlanData[]>([]);
  const [activeStep5Tab, setActiveStep5Tab] = useState<'plans' | 'history'>('plans');
  const [historicalPlans, setHistoricalPlans] = useState<any[]>([]);
  const [previousCropContext, setPreviousCropContext] = useState<Crop | null>(null);
  const [hasUserDismissedContext, setHasUserDismissedContext] = useState<boolean>(false);
  const [contextPlotName, setContextPlotName] = useState<string | null>(null);
  const [contextPlanStatus, setContextPlanStatus] = useState<'completed' | 'terminated' | null>(
    null
  );
  const [contextTerminationReason, setContextTerminationReason] = useState<string | null>(null);
  const [planToStop, setPlanToStop] = useState<CropRotationPlanData | null>(null);
  const [stopReasonTag, setStopReasonTag] = useState<string>('Typhoon / Flood');
  const [stopReasonNotes, setStopReasonNotes] = useState<string>('');
  const [isStoppingPlan, setIsStoppingPlan] = useState<boolean>(false);

  // Milestone Editor Sub-Modal State (Step 3)
  const [milestoneModalVisible, setMilestoneModalVisible] = useState<boolean>(false);
  const [targetCropIndex, setTargetCropIndex] = useState<number | null>(null);
  const [editingMilestoneIndex, setEditingMilestoneIndex] = useState<number | null>(null);
  const [mOffsetDays, setMOffsetDays] = useState<string>('0');
  const [mLabel, setMLabel] = useState<'preparation' | 'growth' | 'checkup'>('growth');
  const [mTitle, setMTitle] = useState<string>('');
  const [mDescription, setMDescription] = useState<string>('');

  // Milestone Setup & Custom Mode State (Step 3)
  const [milestoneMode, setMilestoneMode] = useState<'system' | 'custom' | null>(null);
  const [openMilestoneCropIndices, setOpenMilestoneCropIndices] = useState<number[]>([]);
  const [isClimateStrategyExpanded, setIsClimateStrategyExpanded] = useState<boolean>(false);
  const [isAiGuidanceExpanded, setIsAiGuidanceExpanded] = useState<boolean>(false);
  const [explanationModal, setExplanationModal] = useState<{
    title: string;
    subtitle?: string;
    explanation: string;
    type: 'rationale' | 'climate';
  } | null>(null);
  const [formPerCrop, setFormPerCrop] = useState<
    Record<
      number,
      {
        offsetDays: string;
        label: 'preparation' | 'growth' | 'checkup';
        title: string;
        description: string;
      }
    >
  >({});

  const getCropFormState = useCallback(
    (cropIndex: number) => {
      return (
        formPerCrop[cropIndex] || {
          offsetDays: '0',
          label: 'growth',
          title: '',
          description: '',
        }
      );
    },
    [formPerCrop]
  );

  const updateCropFormField = useCallback(
    (cropIndex: number, field: 'offsetDays' | 'label' | 'title' | 'description', value: any) => {
      setFormPerCrop((prev) => ({
        ...prev,
        [cropIndex]: {
          ...(prev[cropIndex] || {
            offsetDays: '0',
            label: 'growth',
            title: '',
            description: '',
          }),
          [field]: value,
        },
      }));
    },
    []
  );

  const refreshPlots = useCallback(async () => {
    if (!farmId) {
      setIsLoadingPlots(false);
      return;
    }
    setIsLoadingPlots(true);
    try {
      const [plots, layout] = await Promise.all([
        getAvailableFarmPlots(farmId),
        getExistingFarmLayoutWithStructures(farmId),
      ]);
      setAvailablePlots(plots || []);
      const structures = layout?.structures || [];
      setTotalPlotsCount(structures.length);
      const map: Record<string, string> = {};
      structures.forEach((s: any) => {
        map[s.id] = s.label || s.type_name;
      });
      setAllPlotsMap(map);
    } catch (error) {
      console.error('Failed to load farm plots:', error);
    } finally {
      setIsLoadingPlots(false);
    }
  }, [farmId]);

  useEffect(() => {
    refreshPlots();
  }, [refreshPlots]);

  useFocusEffect(
    useCallback(() => {
      refreshAiUsage();
      refreshCrops();
      refreshPlots();
    }, [refreshAiUsage, refreshCrops, refreshPlots])
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showAiProgressModal) {
          setShowAiProgressModal(false);
          return true;
        }
        if (milestoneModalVisible) {
          Keyboard.dismiss();
          setMilestoneModalVisible(false);
          return true;
        }
        if (explanationModal) {
          setExplanationModal(null);
          return true;
        }
        if (planToStop) {
          setPlanToStop(null);
          return true;
        }
        if (router.canGoBack()) {
          router.back();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [showAiProgressModal, milestoneModalVisible, explanationModal, planToStop])
  );

  const resetPlanDraft = useCallback(() => {
    setDurationDaysInput('60');
    setSeason('Both');
    setStartDate(new Date());
    setTotalAvailableDays(0);
    setRemainingDays(0);
    setSelectedCrops([]);
    setExpandedCropId(null);
    setSelectedPlots([]);
    setMilestoneMode(null);
    setFormPerCrop({});
    setPreviousCropContext(null);
    setContextPlotName(null);
    setContextPlanStatus(null);
    setContextTerminationReason(null);
    setHasUserDismissedContext(false);
    setAiClimateSummary(null);
  }, []);

  const applyPlanData = useCallback((planData: CropRotationPlanData) => {
    const selectedCropDays = planData.selectedCrops.reduce(
      (totalDays, crop) => totalDays + getCropDurationDays(crop),
      0
    );

    const resolvedDays =
      planData.durationDays ||
      Number.parseInt(planData.durationMonths, 10) * 30 ||
      planData.totalAvailableDays ||
      60;

    setDurationDaysInput(String(resolvedDays));
    setSeason(planData.season);
    setStartDate(dateKeyToDate(planData.startDate));
    setTotalAvailableDays(planData.totalAvailableDays);
    setRemainingDays(Math.max(planData.totalAvailableDays - selectedCropDays, 0));
    setSelectedCrops(planData.selectedCrops);
    setSelectedPlots(planData.targetPlots || []);
    setExpandedCropId(null);

    const isCustom =
      (planData as any).milestoneMode === 'custom' ||
      planData.selectedCrops.some((c: any) => c.milestone_mode === 'custom');
    setMilestoneMode(isCustom ? 'custom' : 'system');
  }, []);

  // Automatically resolve plot history for selected plots
  useEffect(() => {
    if (selectedPlots.length === 0) {
      setPreviousCropContext(null);
      setContextPlotName(null);
      setContextPlanStatus(null);
      setContextTerminationReason(null);
      setHasUserDismissedContext(false);
      return;
    }

    if (hasUserDismissedContext) {
      return;
    }

    // Find the most recent historical plan that targeted any of the selected plots
    let matchingPlan: any = null;
    let matchedPlotId: string | null = null;

    for (const plan of historicalPlans) {
      if (Array.isArray(plan.targetPlots) && plan.targetPlots.length > 0) {
        const found = plan.targetPlots.find((pId: string) => selectedPlots.includes(pId));
        if (found) {
          matchingPlan = plan;
          matchedPlotId = found;
          break;
        }
      }
    }

    // Fallback: If no plot-specific plan matched, check for a whole-farm plan
    if (!matchingPlan) {
      matchingPlan = historicalPlans.find(
        (plan) => !plan.targetPlots || plan.targetPlots.length === 0
      );
    }

    if (
      matchingPlan &&
      Array.isArray(matchingPlan.selectedCrops) &&
      matchingPlan.selectedCrops.length > 0
    ) {
      const rawCrop = matchingPlan.selectedCrops[matchingPlan.selectedCrops.length - 1];
      if (rawCrop && rawCrop.crop) {
        const inferred = inferCropBotanicalProfile(rawCrop.crop);
        const resolvedCrop: Crop = {
          ...rawCrop,
          family: rawCrop.family || inferred?.family,
          nitrogen_demand: rawCrop.nitrogen_demand || inferred?.nitrogenDemand || 'Medium',
          succession_before: rawCrop.succession_before || inferred?.successionBefore,
          succession_after: rawCrop.succession_after || inferred?.successionAfter,
        };
        setPreviousCropContext(resolvedCrop);
        setContextPlanStatus(matchingPlan.status === 'terminated' ? 'terminated' : 'completed');
        setContextTerminationReason(matchingPlan.terminationReason || null);

        if (matchedPlotId && allPlotsMap[matchedPlotId]) {
          setContextPlotName(allPlotsMap[matchedPlotId]);
        } else if (selectedPlots.length === 1 && allPlotsMap[selectedPlots[0]]) {
          setContextPlotName(allPlotsMap[selectedPlots[0]]);
        } else if (selectedPlots.length > 1) {
          const names = selectedPlots
            .map((id) => allPlotsMap[id])
            .filter(Boolean)
            .join(', ');
          setContextPlotName(names || 'selected plots');
        } else {
          setContextPlotName(null);
        }
        return;
      }
    }

    // If no past history found for these plots, clear context
    setPreviousCropContext(null);
    setContextPlotName(null);
    setContextPlanStatus(null);
    setContextTerminationReason(null);
  }, [selectedPlots, historicalPlans, allPlotsMap, hasUserDismissedContext]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadPlan = async () => {
        if (!farmId) {
          return;
        }

        try {
          const savedPlan = await getFarmSuccessionPlan(farmId);

          if (!isActive) {
            return;
          }

          if (savedPlan?.planData) {
            const planDataArray = Array.isArray(savedPlan.planData)
              ? savedPlan.planData
              : [savedPlan.planData];

            const normalizedPlans = planDataArray.map((p, idx) => ({
              ...p,
              id: p.id || `plan-${idx}-${Date.now()}`,
            }));

            setAllActivePlans(normalizedPlans);
            if (Array.isArray(savedPlan.historicalPlans)) {
              setHistoricalPlans(savedPlan.historicalPlans);
            }
            if (normalizedPlans.length > 0) {
              setStep(5); // Active plans step
            }
          } else {
            const history = await getFarmCropHistory(farmId);
            setHistoricalPlans(history || []);
          }
        } catch (error) {
          console.error('Failed to load crop rotation plan:', error);
        }
      };

      loadPlan();

      return () => {
        isActive = false;
      };
    }, [farmId])
  );

  const availableCropsForSelection = useMemo(() => {
    const activeCrops = Array.isArray(allCrops) ? allCrops : [];
    let pool: Crop[] = [];

    const predecessor =
      planningMode === 'single'
        ? previousCropContext
        : selectedCrops.length > 0
          ? selectedCrops[selectedCrops.length - 1]
          : previousCropContext;

    if (planningMode === 'single') {
      pool = filterCropsBySeason(activeCrops, season);
    } else {
      pool = getAvailableCrops(activeCrops, predecessor || undefined, remainingDays, season);
    }

    if (predecessor) {
      return [...pool].sort((a, b) => {
        const relA = getSuccessionRelationship(a, predecessor);
        const relB = getSuccessionRelationship(b, predecessor);
        return relB.score - relA.score;
      });
    }

    return pool;
  }, [allCrops, remainingDays, season, selectedCrops, planningMode, previousCropContext]);

  const groupedCrops = useMemo(() => {
    return (availableCropsForSelection || []).reduce<Record<string, Crop[]>>((acc, crop) => {
      if (!crop || !crop.crop) return acc;
      const type = crop.type || 'Other';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(crop);
      return acc;
    }, {});
  }, [availableCropsForSelection]);

  const handleSelectCrop = (crop: Crop) => {
    const durationDays = getCropDurationDays(crop);
    const detail = loadCropDetails(crop);
    const cropWithMilestones: Crop = {
      ...crop,
      milestones:
        crop.milestones && crop.milestones.length > 0
          ? crop.milestones
          : JSON.parse(
              JSON.stringify(
                detail?.milestones || generateDefaultMilestones(crop.crop, durationDays)
              )
            ),
    };

    if (planningMode === 'single') {
      setSelectedCrops([cropWithMilestones]);
      setTotalAvailableDays(durationDays);
      setRemainingDays(0);
      setMilestoneMode(null);
      setStep(3);
      return;
    }

    if (durationDays > remainingDays) {
      const excess = durationDays - remainingDays;
      Alert.alert(
        'Duration Exceeded',
        `Selecting ${crop.crop} (${durationDays} days) exceeds your remaining planning window of ${remainingDays} days.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Continue',
            style: 'default',
            onPress: () => {
              setTotalAvailableDays((prev) => prev + excess);
              setDurationDaysInput((prev) => {
                const current = parseInt(prev || '0', 10);
                return String(current > 0 ? current + excess : totalAvailableDays + excess);
              });
              setSelectedCrops((prev) => [...prev, cropWithMilestones]);
              setRemainingDays(0);
              setStep(3);
            },
          },
        ]
      );
      return;
    }

    const nextRemainingDays = remainingDays - durationDays;
    setSelectedCrops((prev) => [...prev, cropWithMilestones]);
    setRemainingDays(Math.max(0, nextRemainingDays));
    if (nextRemainingDays <= 0) {
      setStep(3);
    }
  };

  const handleRemoveCrop = (cropIndex: number) => {
    const cropToRemove = selectedCrops[cropIndex];
    if (!cropToRemove) {
      return;
    }

    const durationDays = getCropDurationDays(cropToRemove);
    setSelectedCrops((prev) => prev.filter((_, index) => index !== cropIndex));
    setRemainingDays((prev) => Math.min(totalAvailableDays, prev + durationDays));
  };

  const handleConfirmRemoveCrop = (cropIndex: number) => {
    const cropToRemove = selectedCrops[cropIndex];
    if (!cropToRemove) return;

    Alert.alert(
      `Remove ${cropToRemove.crop}?`,
      `Are you sure you want to remove ${cropToRemove.crop} from this plan? Its scheduled milestone tasks will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            handleRemoveCrop(cropIndex);
            setFormPerCrop({});
          },
        },
      ]
    );
  };

  const handleDurationChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (!cleaned) {
      setDurationDaysInput('');
      return;
    }
    const val = parseInt(cleaned, 10);
    if (val > 365) {
      setDurationDaysInput('365');
      return;
    }
    setDurationDaysInput(val.toString());
  };

  const handleNativeDateChange = (_event: DateTimePickerEvent, pickedDate?: Date) => {
    setShowDatePicker(false);

    if (pickedDate) {
      setStartDate(pickedDate);
    }
  };

  const handleOpenStopPlanModal = (plan: CropRotationPlanData) => {
    setPlanToStop(plan);
    setStopReasonTag('Typhoon / Flood');
    setStopReasonNotes('');
  };

  const handleConfirmStopPlan = async () => {
    if (!planToStop || !farmId) return;

    if (!permissions.canEditCropPlan) {
      Alert.alert('Permission Denied', 'Only farm owners and administrators can stop planting cycles.');
      return;
    }

    const fullReason = stopReasonNotes.trim()
      ? `${stopReasonTag}: ${stopReasonNotes.trim()}`
      : stopReasonTag;

    setIsStoppingPlan(true);
    try {
      await stopFarmCropPlan(
        farmId,
        planToStop.id || '',
        fullReason,
        user?.id,
        planToStop.targetPlots
      );

      const refreshed = await getFarmSuccessionPlan(farmId);
      const refreshedActive = Array.isArray(refreshed?.planData)
        ? refreshed.planData
        : refreshed?.planData
          ? [refreshed.planData]
          : [];
      setAllActivePlans(refreshedActive);

      const refreshedHistory = await getFarmCropHistory(farmId);
      setHistoricalPlans(refreshedHistory || []);

      await refreshPlots();
      await refreshAiUsage();

      setPlanToStop(null);
      setActiveStep5Tab('history');
      Alert.alert(
        'Planting Cycle Stopped',
        'The planting cycle has been ended, remaining tasks removed, and the incident recorded in your farm crop history and activity log.'
      );
    } catch (error) {
      console.error('Failed to stop crop plan:', error);
      Alert.alert('Error', 'Failed to stop the planting cycle. Please try again.');
    } finally {
      setIsStoppingPlan(false);
    }
  };

  const handleContinuePlanting = (plan: CropRotationPlanData | any) => {
    const lastCrop =
      Array.isArray(plan.selectedCrops) && plan.selectedCrops.length > 0
        ? plan.selectedCrops[plan.selectedCrops.length - 1]
        : null;

    resetPlanDraft();
    setHasUserDismissedContext(false);
    if (lastCrop) {
      const inferred = inferCropBotanicalProfile(lastCrop.crop);
      setPreviousCropContext({
        ...lastCrop,
        family: lastCrop.family || inferred?.family,
        nitrogen_demand: lastCrop.nitrogen_demand || inferred?.nitrogenDemand || 'Medium',
        succession_before: lastCrop.succession_before || inferred?.successionBefore,
        succession_after: lastCrop.succession_after || inferred?.successionAfter,
      });
      setContextPlanStatus(plan.status === 'terminated' ? 'terminated' : 'completed');
      setContextTerminationReason(plan.terminationReason || null);
      if (Array.isArray(plan.targetPlots) && plan.targetPlots.length > 0) {
        const names = plan.targetPlots
          .map((id: string) => allPlotsMap[id])
          .filter(Boolean)
          .join(', ');
        setContextPlotName(names || null);
      }
    }
    setSelectedPlots(plan.targetPlots || []);
    setStep(1);
  };

  const handleOpenAddMilestone = (cropIndex: number) => {
    setTargetCropIndex(cropIndex);
    setEditingMilestoneIndex(null);
    setMOffsetDays('0');
    setMLabel('growth');
    setMTitle('');
    setMDescription('');
    setMilestoneModalVisible(true);
  };

  const handleOpenEditMilestone = (cropIndex: number, milestoneIndex: number) => {
    const crop = selectedCrops[cropIndex];
    if (!crop || !crop.milestones || !crop.milestones[milestoneIndex]) return;
    const m = crop.milestones[milestoneIndex];
    setTargetCropIndex(cropIndex);
    setEditingMilestoneIndex(milestoneIndex);
    setMOffsetDays(String(m.offset_days));
    setMLabel((m.label as any) || 'growth');
    setMTitle(m.title);
    setMDescription(m.description || '');
    setMilestoneModalVisible(true);
  };

  const handleSaveMilestone = () => {
    if (targetCropIndex === null) return;
    if (!mTitle.trim()) {
      Alert.alert('Task Title Required', 'Please enter a title for this milestone task.');
      return;
    }

    const parsedOffset = Number.parseInt(mOffsetDays, 10);
    const offsetDays = Number.isNaN(parsedOffset) ? 0 : Math.max(0, parsedOffset);

    const newMilestone: Milestone = {
      offset_days: offsetDays,
      label: mLabel,
      title: mTitle.trim(),
      description: mDescription.trim(),
    };

    setSelectedCrops((prev) => {
      const updated = [...prev];
      const targetCrop = { ...updated[targetCropIndex] };
      const currentMilestones = Array.isArray(targetCrop.milestones)
        ? [...targetCrop.milestones]
        : milestoneMode === 'custom' || targetCrop.milestone_mode === 'custom'
          ? []
          : [...(loadCropDetails(targetCrop)?.milestones || [])];

      if (editingMilestoneIndex !== null) {
        currentMilestones[editingMilestoneIndex] = newMilestone;
      } else {
        currentMilestones.push(newMilestone);
      }

      currentMilestones.sort((a, b) => a.offset_days - b.offset_days);
      targetCrop.milestones = currentMilestones;
      updated[targetCropIndex] = targetCrop;
      return updated;
    });

    setMilestoneModalVisible(false);
  };

  const handleDeleteMilestone = (cropIndex: number, milestoneIndex: number) => {
    Alert.alert(
      'Delete Milestone Task',
      'Are you sure you want to remove this task from this crop cycle?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setSelectedCrops((prev) => {
              const updated = [...prev];
              const targetCrop = { ...updated[cropIndex] };
              const currentMilestones = Array.isArray(targetCrop.milestones)
                ? [...targetCrop.milestones]
                : milestoneMode === 'custom' || targetCrop.milestone_mode === 'custom'
                  ? []
                  : [...(loadCropDetails(targetCrop)?.milestones || [])];
              currentMilestones.splice(milestoneIndex, 1);
              targetCrop.milestones = currentMilestones;
              updated[cropIndex] = targetCrop;
              return updated;
            });
          },
        },
      ]
    );
  };

  const handleResetCropMilestones = (cropIndex: number) => {
    const isCustom = Boolean(
      selectedCrops[cropIndex]?.is_custom || (selectedCrops[cropIndex] as any)?.isCustom
    );
    Alert.alert(
      isCustom ? 'Reset Custom Milestones' : 'Reset Milestone Tasks',
      isCustom
        ? 'Restore the defined milestones and schedule for this custom crop?'
        : 'Restore the default agronomic milestone tasks for this crop?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: () => {
            setSelectedCrops((prev) => {
              const updated = [...prev];
              const targetCrop = { ...updated[cropIndex] };
              const original = allCrops.find(
                (ac) =>
                  (ac.id && targetCrop.id && ac.id === targetCrop.id) ||
                  ac.crop.toLowerCase() === targetCrop.crop.toLowerCase()
              );
              const originalMilestones =
                original?.milestones && original.milestones.length > 0 ? original.milestones : null;
              const defaults =
                originalMilestones ||
                loadCropDetails(targetCrop)?.milestones ||
                generateDefaultMilestones(targetCrop.crop, getCropDurationDays(targetCrop));
              targetCrop.milestones = JSON.parse(JSON.stringify(defaults));
              updated[cropIndex] = targetCrop;
              return updated;
            });
          },
        },
      ]
    );
  };

  const handleSetCropMilestoneMode = (cropIndex: number, mode: 'system' | 'custom') => {
    setSelectedCrops((prev) => {
      const updated = [...prev];
      if (!updated[cropIndex]) return prev;
      updated[cropIndex] = {
        ...updated[cropIndex],
        milestone_mode: mode,
      };
      return updated;
    });
  };

  const handleSetAllCropsMilestoneMode = (mode: 'system' | 'custom') => {
    setSelectedCrops((prev) =>
      prev.map((c) => ({
        ...c,
        milestone_mode: mode,
      }))
    );
  };

  const toggleCropMilestonesOpen = (cropIndex: number) => {
    setOpenMilestoneCropIndices((prev) =>
      prev.includes(cropIndex) ? prev.filter((i) => i !== cropIndex) : [...prev, cropIndex]
    );
  };

  const handleToggleAllMilestonesOpen = () => {
    if (openMilestoneCropIndices.length === selectedCrops.length) {
      setOpenMilestoneCropIndices([]);
    } else {
      setOpenMilestoneCropIndices(selectedCrops.map((_, i) => i));
    }
  };

  const handleConfirmPerCropModes = () => {
    setSelectedCrops((prev) =>
      prev.map((c) => {
        const mode = c.milestone_mode || 'system';
        if (mode === 'custom') {
          return {
            ...c,
            milestone_mode: 'custom' as const,
            milestones: Array.isArray(c.milestones) ? c.milestones : [],
          };
        }
        if (c.milestones && c.milestones.length > 0) {
          return {
            ...c,
            milestone_mode: 'system' as const,
          };
        }
        const original = allCrops.find(
          (ac) =>
            (ac.id && c.id && ac.id === c.id) || ac.crop.toLowerCase() === c.crop.toLowerCase()
        );
        const originalMilestones =
          original?.milestones && original.milestones.length > 0 ? original.milestones : null;
        const details = originalMilestones
          ? { crop: c.crop, milestones: originalMilestones }
          : loadCropDetails(c);
        const duration = getCropDurationDays(c);
        const defaults = details?.milestones || generateDefaultMilestones(c.crop, duration);
        return {
          ...c,
          milestone_mode: 'system' as const,
          milestones: JSON.parse(JSON.stringify(defaults)),
        };
      })
    );
    setOpenMilestoneCropIndices([]);
    setMilestoneMode(
      selectedCrops.some((c) => c.milestone_mode === 'custom') ? 'custom' : 'system'
    );
  };

  const handleToggleCropMilestoneMode = (cropIndex: number, newMode: 'system' | 'custom') => {
    const currentCrop = selectedCrops[cropIndex];
    if (!currentCrop) return;
    const currentMode = currentCrop.milestone_mode || 'system';
    if (newMode === currentMode) return;

    if (newMode === 'custom') {
      Alert.alert(
        `Switch ${currentCrop.crop} to Custom Schedule`,
        `This will clear the default tasks for ${currentCrop.crop} so you can define your own tasks from scratch. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Switch to Custom',
            style: 'destructive',
            onPress: () => {
              setSelectedCrops((prev) => {
                const updated = [...prev];
                if (!updated[cropIndex]) return prev;
                updated[cropIndex] = {
                  ...updated[cropIndex],
                  milestone_mode: 'custom',
                  milestones: [],
                };
                return updated;
              });
              setFormPerCrop((prev) => ({
                ...prev,
                [cropIndex]: { offsetDays: '0', label: 'growth', title: '', description: '' },
              }));
              setOpenMilestoneCropIndices((prev) =>
                prev.includes(cropIndex) ? prev : [...prev, cropIndex]
              );
            },
          },
        ]
      );
    } else {
      const isCustomCrop = Boolean(currentCrop.is_custom || (currentCrop as any).isCustom);
      Alert.alert(
        'Restore Default Schedule',
        isCustomCrop
          ? `This will restore your user-created tasks for ${currentCrop.crop}. Continue?`
          : `This will restore the system-generated agronomic care tasks for ${currentCrop.crop}. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore Default',
            onPress: () => {
              setSelectedCrops((prev) => {
                const updated = [...prev];
                if (!updated[cropIndex]) return prev;
                const targetCrop = { ...updated[cropIndex] };
                const original = allCrops.find(
                  (ac) =>
                    (ac.id && targetCrop.id && ac.id === targetCrop.id) ||
                    ac.crop.toLowerCase() === targetCrop.crop.toLowerCase()
                );
                const originalMilestones =
                  original?.milestones && original.milestones.length > 0
                    ? original.milestones
                    : null;
                const defaults =
                  originalMilestones ||
                  loadCropDetails(targetCrop)?.milestones ||
                  generateDefaultMilestones(targetCrop.crop, getCropDurationDays(targetCrop));
                targetCrop.milestone_mode = 'system';
                targetCrop.milestones = JSON.parse(JSON.stringify(defaults));
                updated[cropIndex] = targetCrop;
                return updated;
              });
            },
          },
        ]
      );
    }
  };

  const handleChooseMilestoneMode = (mode: 'system' | 'custom') => {
    if (mode === 'system') {
      setMilestoneMode('system');
      setSelectedCrops((prev) =>
        prev.map((c) => {
          if (c.milestones && c.milestones.length > 0) {
            return { ...c, milestone_mode: 'system' };
          }
          const original = allCrops.find(
            (ac) =>
              (ac.id && c.id && ac.id === c.id) || ac.crop.toLowerCase() === c.crop.toLowerCase()
          );
          const originalMilestones =
            original?.milestones && original.milestones.length > 0 ? original.milestones : null;
          const details = originalMilestones
            ? { crop: c.crop, milestones: originalMilestones }
            : loadCropDetails(c);
          const duration = getCropDurationDays(c);
          return {
            ...c,
            milestone_mode: 'system',
            milestones: JSON.parse(
              JSON.stringify(details?.milestones || generateDefaultMilestones(c.crop, duration))
            ),
          };
        })
      );
    } else {
      setMilestoneMode('custom');
      setSelectedCrops((prev) =>
        prev.map((c) => ({
          ...c,
          milestone_mode: 'custom',
          milestones: [],
        }))
      );
      setFormPerCrop({});
    }
  };

  const handleToggleMilestoneMode = (newMode: 'system' | 'custom') => {
    if (newMode === milestoneMode) return;
    handleSetAllCropsMilestoneMode(newMode);
    setMilestoneMode(newMode);
  };

  const handleAddCustomMilestone = (cropIndex: number) => {
    const formState = getCropFormState(cropIndex);
    if (!formState.title.trim()) {
      Alert.alert('Task Title Required', 'Please enter a title for this custom milestone task.');
      return;
    }

    const parsedOffset = Number.parseInt(formState.offsetDays, 10);
    const offsetDays = Number.isNaN(parsedOffset) ? 0 : Math.max(0, parsedOffset);

    const newMilestone: Milestone = {
      offset_days: offsetDays,
      label: formState.label,
      title: formState.title.trim(),
      description: formState.description.trim(),
    };

    setSelectedCrops((prev) => {
      const updated = [...prev];
      if (!updated[cropIndex]) return prev;
      const targetCrop = { ...updated[cropIndex], milestone_mode: 'custom' as const };
      const currentMilestones = Array.isArray(targetCrop.milestones)
        ? [...targetCrop.milestones]
        : [];

      currentMilestones.push(newMilestone);
      currentMilestones.sort((a, b) => a.offset_days - b.offset_days);
      targetCrop.milestones = currentMilestones;
      updated[cropIndex] = targetCrop;
      return updated;
    });

    // Reset title & description and advance offset by 7 days for quick successive entry
    setFormPerCrop((prev) => ({
      ...prev,
      [cropIndex]: {
        ...formState,
        title: '',
        description: '',
        offsetDays: String(offsetDays + 7),
      },
    }));
  };

  const handleClearCropMilestones = (cropIndex: number) => {
    Alert.alert('Clear All Tasks', 'Remove all milestone tasks for this crop?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: () => {
          setSelectedCrops((prev) => {
            const updated = [...prev];
            if (!updated[cropIndex]) return prev;
            const targetCrop = {
              ...updated[cropIndex],
              milestone_mode: 'custom' as const,
              milestones: [],
            };
            updated[cropIndex] = targetCrop;
            return updated;
          });
        },
      },
    ]);
  };

  const handleProceedToCropSelection = () => {
    if (isAiGenerating) {
      setShowAiProgressModal(true);
      return;
    }

    if (totalPlotsCount === 0) {
      Alert.alert(
        'No Garden Plots Found',
        'Before planning crop rotations, you need to create garden plots (beds, trellises, or planters) for this farm in the Farm Layout Designer.'
      );
      return;
    }

    if (availablePlots.length === 0) {
      Alert.alert(
        'All Plots Occupied',
        'All garden plots on this farm are currently occupied by active crop cycles or succession plans. Free up a plot or remove an existing plan to proceed.'
      );
      return;
    }

    if (selectedPlots.length === 0) {
      Alert.alert('Target Plot Required', 'Please select at least 1 target plot to proceed.');
      return;
    }

    setSelectedCrops([]);
    setExpandedCropId(null);
    setStep(2);
  };

  const handleGenerateRecommendations = () => {
    const days = Number.parseInt(durationDaysInput, 10);

    if (Number.isNaN(days) || days < 10 || days > 365) {
      Alert.alert('Invalid duration', 'Please enter a planting duration between 10 and 365 days.');
      return;
    }

    if (totalPlotsCount === 0) {
      Alert.alert(
        'No Garden Plots Found',
        'Before planning crop rotations, you need to create garden plots (beds, trellises, or planters) for this farm in the Farm Layout Designer.'
      );
      return;
    }

    if (availablePlots.length === 0) {
      Alert.alert(
        'All Plots Occupied',
        'All garden plots on this farm are currently occupied by active crop cycles or succession plans. Free up a plot or remove an existing plan to proceed.'
      );
      return;
    }

    if (selectedPlots.length === 0) {
      Alert.alert('Target Plot Required', 'Please select at least 1 target plot to proceed.');
      return;
    }

    setTotalAvailableDays(days);
    setRemainingDays(days);
    setSelectedCrops([]);
    setExpandedCropId(null);
    setStep(2);
  };

  const handleGenerateAiPlan = async () => {
    if (!isOnline) {
      Alert.alert(
        'Offline — Internet Connection Required',
        'AI Crop Planning uses OpenRouter cloud intelligence and requires an active internet connection. Please connect to the internet to generate an AI plan, or use "Plan Manually" for full offline capability.'
      );
      return;
    }

    if (isAiGenerating) {
      setShowAiProgressModal(true);
      return;
    }

    // Strictly verify AI usage quota with Supabase online database (SQLite is untrusted)
    const currentUsage = await getMonthlyAiUsage(user?.id, { requireOnline: true });

    if (currentUsage.verifiedOnline === false && currentUsage.isLimitReached) {
      Alert.alert(
        'Online Connection Required',
        currentUsage.errorMessage ||
          'SoilSync must verify your monthly AI quota with the online database before generating an AI plan. Please check your internet connection.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    if (currentUsage.isLimitReached) {
      Alert.alert(
        'Monthly AI Limit Reached',
        `You have used your ${currentUsage.max} AI crop succession generations for this month.\n\nThe limit will reset on the 1st of next month. Deleting active plans does not refund monthly AI generations.\n\nYou can still plan your crop rotation manually with unlimited access.`,
        [
          { text: 'Plan Manually', onPress: () => handleGenerateRecommendations() },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }

    const days = Number.parseInt(durationDaysInput, 10);

    if (Number.isNaN(days) || days < 10 || days > 365) {
      Alert.alert('Invalid duration', 'Please enter a planting duration between 10 and 365 days.');
      return;
    }

    if (totalPlotsCount === 0) {
      Alert.alert(
        'No Garden Plots Found',
        'Before planning crop rotations, you need to create garden plots (beds, trellises, or planters) for this farm in the Farm Layout Designer.'
      );
      return;
    }

    if (availablePlots.length === 0) {
      Alert.alert(
        'All Plots Occupied',
        'All garden plots on this farm are currently occupied by active crop cycles or succession plans. Free up a plot or remove an existing plan to proceed.'
      );
      return;
    }

    if (selectedPlots.length === 0) {
      Alert.alert('Target Plot Required', 'Please select at least 1 target plot to proceed.');
      return;
    }

    const targetPlotNames = availablePlots
      .filter((p) => selectedPlots.includes(p.id))
      .map((p) => p.label || p.type_name || 'Plot');

    setIsAiGenerating(true);
    setShowAiProgressModal(true);

    try {
      const job = await startAiCropPlanJob({
        farmId,
        userId: user?.id,
        durationDays: days,
        season,
        startDate,
        allCrops,
        previousCropContext,
        targetPlots: selectedPlots,
        targetPlotNames,
      });
      setActiveJob(job);
    } catch (err: any) {
      setIsAiGenerating(false);
      setShowAiProgressModal(false);
      Alert.alert('Error', err?.message || 'Failed to start AI generation.');
    }
  };

  const handleToggleSelectAllPlots = () => {
    setHasUserDismissedContext(false);
    if (selectedPlots.length === availablePlots.length) {
      setSelectedPlots([]);
    } else {
      setSelectedPlots(availablePlots.map((p) => p.id));
    }
  };

  const handleSaveToFarm = async () => {
    if (!farmId || !user?.id) {
      Alert.alert('Error', 'Missing farm or user profile information.');
      return;
    }

    if (!permissions.canEditCropPlan) {
      Alert.alert('Permission Denied', 'Only farm owners and administrators can save crop plans.');
      return;
    }

    if (selectedPlots.length === 0) {
      Alert.alert('No Plots Selected', 'A succession plan must be assigned to at least one plot.');
      return;
    }

    if (selectedCrops.length === 0) {
      Alert.alert('No Crops Selected', 'Please select at least one crop to save.');
      return;
    }

    try {
      const activePlanId =
        allActivePlans.find((p) => p.targetPlots?.some((id) => selectedPlots.includes(id)))?.id ||
        null;

      const performSave = async () => {
        try {
          const cropsWithMilestones = selectedCrops.map((crop) => {
            const isCustomMode = crop.milestone_mode === 'custom';
            if (isCustomMode) {
              return {
                ...crop,
                milestone_mode: 'custom' as const,
                milestones: Array.isArray(crop.milestones) ? crop.milestones : [],
              };
            }
            if (crop.milestones && crop.milestones.length > 0) {
              return {
                ...crop,
                milestone_mode: 'system' as const,
              };
            }
            const details = loadCropDetails(crop);
            return {
              ...crop,
              milestone_mode: 'system' as const,
              milestones:
                details?.milestones ||
                generateDefaultMilestones(crop.crop, getCropDurationDays(crop)),
            };
          });

          const hasAnyCustomCrop = cropsWithMilestones.some((c) => c.milestone_mode === 'custom');

          const newPlanData: CropRotationPlanData = {
            id: activePlanId || generateUUID(),
            version: 1,
            durationMonths: String(Math.round(totalAvailableDays / 30)),
            durationDays: totalAvailableDays,
            season,
            startDate: toDateKey(startDate),
            totalAvailableDays,
            selectedCrops: cropsWithMilestones,
            targetPlots: selectedPlots,
            milestoneMode: hasAnyCustomCrop ? 'custom' : 'system',
          };

          await saveFarmRotationPlan({
            userId: user.id,
            farmId,
            planData: newPlanData,
          });

          const savedPlan = await getFarmSuccessionPlan(farmId);
          if (savedPlan?.planData) {
            const planDataArray = Array.isArray(savedPlan.planData)
              ? savedPlan.planData
              : [savedPlan.planData];
            setAllActivePlans(planDataArray);
          } else {
            setAllActivePlans((prev) => [...prev, newPlanData]);
          }

          await refreshPlots();

          Alert.alert(
            'Success',
            'Your crop succession plan and todos have been successfully generated!',
            [
              {
                text: 'View Active Plans',
                onPress: () => setStep(5),
              },
              {
                text: 'Done',
                onPress: () => router.back(),
              },
            ]
          );
        } catch (error) {
          console.error('Failed to save crop rotation plan:', error);
          Alert.alert('Error', 'Failed to save crop rotation plan.');
        }
      };

      if (activePlanId) {
        Alert.alert(
          'Overwrite Existing Plan',
          'One or more of the selected plots already have an active succession plan. Saving this plan will overwrite the existing schedule and tasks. Do you want to proceed?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Overwrite',
              style: 'destructive',
              onPress: performSave,
            },
          ]
        );
      } else {
        await performSave();
      }
    } catch (error) {
      console.error('Failed to verify existing plans:', error);
      Alert.alert('Error', 'Failed to save crop rotation plan.');
    }
  };

  const handleCreateNew = () => {
    if (totalPlotsCount === 0) {
      Alert.alert(
        'No Garden Plots Found',
        'Before planning crop rotations, you must design your farm layout and add garden plots.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Design Layout',
            onPress: () => router.push(`/farm/layout-designer/${farmId}`),
          },
        ]
      );
      return;
    }

    if (totalPlotsCount !== null && totalPlotsCount > 0 && availablePlots.length === 0) {
      Alert.alert(
        'All Plots Assigned',
        'All available plots on this farm already have an active plan or crop cycle. To create a new plan, please delete an existing plan to free up its plots.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    resetPlanDraft();
    setStep(1);
  };

  const handleResetPlan = () => {
    if (farmId) {
      Alert.alert(
        'Clear All Farm Plans',
        'Are you sure you want to remove ALL crop rotation plans and their associated todo tasks for this entire farm?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear All',
            style: 'destructive',
            onPress: async () => {
              await deleteAllFarmRotationPlans(farmId as string);
              setAllActivePlans([]);
              resetPlanDraft();

              await refreshPlots();
              setStep(1);
            },
          },
        ]
      );
    }
  };

  const handleResetupPlan = (plan: CropRotationPlanData) => {
    if (!permissions.canEditCropPlan) {
      Alert.alert('Permission Denied', 'Only farm owners and administrators can delete crop plans.');
      return;
    }

    const targetPlotNames =
      plan.targetPlots && plan.targetPlots.length > 0
        ? plan.targetPlots.map((id) => allPlotsMap[id] || 'Plot').join(', ')
        : 'assigned plots';

    Alert.alert(
      'Delete Succession Plan',
      `This will remove this active plan, its scheduled milestone tasks, and active mitigation protocols, freeing ${targetPlotNames} for new planting cycles. Do you want to proceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Plan',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsAiGenerating(true);
              const planIdToDelete = plan.id || 'single';
              await deleteFarmRotationPlan(
                farmId as string,
                planIdToDelete,
                user?.id,
                plan.targetPlots
              );

              const updatedSavedPlan = await getFarmSuccessionPlan(farmId as string);
              if (updatedSavedPlan?.planData) {
                const refreshed = Array.isArray(updatedSavedPlan.planData)
                  ? updatedSavedPlan.planData
                  : [updatedSavedPlan.planData];
                const normalizedRefreshed = refreshed.map((p, idx) => ({
                  ...p,
                  id: p.id || `plan-${idx}-${Date.now()}`,
                }));
                setAllActivePlans(normalizedRefreshed);
                if (normalizedRefreshed.length === 0) {
                  setStep(1);
                }
              } else {
                setAllActivePlans([]);
                setStep(1);
              }

              const refreshedHistory = await getFarmCropHistory(farmId as string);
              setHistoricalPlans(refreshedHistory || []);

              await refreshPlots();
              await refreshAiUsage();
            } catch (error) {
              console.error('Failed to remove plan:', error);
              Alert.alert('Error', 'Failed to remove plan. Please try again.');
            } finally {
              setIsAiGenerating(false);
            }
          },
        },
      ]
    );
  };

  const renderBackgroundAiBanner = () => {
    if (activeJob && activeJob.status === 'generating') {
      return (
        <View className="mb-4 rounded-2xl border border-cognac/30 bg-champagne p-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="mr-3 flex-1 flex-row items-center gap-2.5">
              <ActivityIndicator size="small" color="#8C4522" />
              <View className="flex-1">
                <Text className="text-xs font-black text-espresso">
                  AI Agronomist Running in Background ({Math.round(activeJob.progress)}%)
                </Text>
                <Text className="text-[11px] text-taupe" numberOfLines={1}>
                  {activeJob.stage}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-1.5">
              <TouchableOpacity
                onPress={() => setShowAiProgressModal(true)}
                className="rounded-xl bg-cognac px-3 py-1.5 shadow-xs active:opacity-90">
                <Text className="text-[11px] font-bold text-white">View</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  await cancelAiJob(farmId);
                  setActiveJob(null);
                  setIsAiGenerating(false);
                }}
                className="rounded-xl border border-taupe/30 bg-white/80 px-2.5 py-1.5 active:bg-white">
                <Text className="text-[11px] font-bold text-taupe">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    if (completedJob && completedJob.result) {
      return (
        <View className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="mr-3 flex-1 flex-row items-center gap-2.5">
              <Sparkles size={20} color="#047857" />
              <View className="flex-1">
                <Text className="text-xs font-black text-emerald-900">
                  AI Crop Succession Plan Ready!
                </Text>
                <Text className="text-[11px] text-emerald-700" numberOfLines={1}>
                  {completedJob.result.matchedCrops.length} crops recommended for your beds.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => restoreJobIntoPlanner(completedJob)}
              className="rounded-xl bg-emerald-700 px-3.5 py-2 shadow-xs active:opacity-90">
              <Text className="text-xs font-bold text-white">Review Plan</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return null;
  };

  const renderStep1 = () => {
    const parsedDays = Number.parseInt(durationDaysInput, 10);
    const isValidDuration =
      planningMode === 'single' ||
      (!Number.isNaN(parsedDays) && parsedDays >= 10 && parsedDays <= 365);
    const hasPlots = totalPlotsCount !== null && totalPlotsCount > 0;
    const hasAvailablePlots =
      availablePlots.length > 0 || Boolean(previousCropContext && selectedPlots.length > 0);
    const hasSelectedPlots = selectedPlots.length > 0;
    const canProceed =
      permissions.canEditCropPlan &&
      isValidDuration &&
      hasPlots &&
      hasAvailablePlots &&
      hasSelectedPlots;

    const allPlotsSelected =
      availablePlots.length > 0 && selectedPlots.length === availablePlots.length;

    return (
      <ScrollView
        className="flex-1 bg-champagne"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View className="mb-4 flex-row items-center justify-between">
          <BackButton />

          <View className="flex-row items-center gap-2">
            {historicalPlans.length > 0 && (
              <Pressable
                onPress={() => {
                  setActiveStep5Tab('history');
                  setStep(5);
                }}
                className="shadow-2xs flex-row items-center gap-1.5 rounded-full border border-cognac/30 bg-champagne px-3.5 py-2 active:scale-95">
                <History size={14} color="#8C4522" />
                <Text className="text-xs font-bold text-cognac">
                  Plot History ({historicalPlans.length})
                </Text>
              </Pressable>
            )}
            {allActivePlans.length > 0 && (
              <Pressable
                onPress={() => {
                  setActiveStep5Tab('plans');
                  setStep(5);
                }}
                className="shadow-2xs flex-row items-center gap-1.5 rounded-full border border-taupe/20 bg-white px-3.5 py-2 active:scale-95">
                <Layers size={14} color="#1C120C" />
                <Text className="text-xs font-bold text-espresso">
                  Active Plans ({allActivePlans.length})
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <Text className="mb-1 text-3xl font-black tracking-tight text-espresso">
          Crop Planner
        </Text>

        <Text className="mb-4 text-xs text-taupe">
          {planningMode === 'single'
            ? 'Plan a single crop cycle for your plots.'
            : 'Plan your seasonal crop rotation.'}
        </Text>

        {!permissions.canEditCropPlan && (
          <View className="mb-4 flex-row items-center rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5">
            <AlertTriangle size={18} color="#D97706" style={{ marginRight: 10 }} />
            <Text className="flex-1 text-xs font-semibold leading-relaxed text-amber-900">
              <Text className="font-black">View-Only Collaborator Mode: </Text>
              Only farm owners and administrators can configure new succession plans or assign crops.
            </Text>
          </View>
        )}

        {renderBackgroundAiBanner()}

        {previousCropContext && (
          <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-taupe/20 bg-white/90 px-3.5 py-2.5 shadow-2xs">
            <View className="mr-2 flex-1 flex-row items-center gap-2.5">
              <View className="h-7 w-7 items-center justify-center rounded-lg bg-cognac/10">
                <Sprout size={14} color="#8C4522" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-xs font-bold text-espresso" numberOfLines={1}>
                    {contextPlotName || 'Plot'}: {previousCropContext.crop}
                  </Text>
                  {contextPlanStatus === 'terminated' ? (
                    <View className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5">
                      <Text className="text-[9px] font-bold uppercase text-rose-600">Stopped</Text>
                    </View>
                  ) : (
                    <View className="rounded border border-cognac/25 bg-cognac/10 px-1.5 py-0.5">
                      <Text className="text-[9px] font-bold uppercase text-cognac">Harvested</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            <Pressable
              onPress={() => {
                setPreviousCropContext(null);
                setContextPlotName(null);
                setContextPlanStatus(null);
                setContextTerminationReason(null);
                setHasUserDismissedContext(true);
              }}
              className="h-6 w-6 items-center justify-center rounded-full bg-taupe/10 active:scale-95">
              <X size={12} color="#8C7C70" />
            </Pressable>
          </View>
        )}

        {/* San Pablo City Climate Telemetry Indicator */}
        {weatherData && (
          <View className="mb-4 flex-row items-center justify-between rounded-2xl border border-taupe/15 bg-white/80 px-3.5 py-2 shadow-2xs">
            <View className="flex-row items-center gap-2">
              <CloudSun size={15} color="#8C4522" />
              <Text className="text-xs font-medium text-espresso">
                San Pablo: <Text className="font-bold text-cognac">{Math.round(weatherData.data.current.temp)}°C</Text> · {weatherData.data.current.humidity}% Humidity
              </Text>
            </View>
            <View className="rounded-full border border-cognac/20 bg-champagne px-2 py-0.5">
              <Text className="text-[10px] font-semibold text-cognac capitalize">
                {weatherData.data.current.weather?.[0]?.description || 'Tropical'}
              </Text>
            </View>
          </View>
        )}

        <View className="mb-6 rounded-[28px] border border-taupe/20 bg-white/90 p-5 shadow-sm shadow-espresso/10">
          {/* Mode Selector Tabs */}
          <View className={`mb-6 flex-row rounded-2xl bg-taupe/15 p-1 ${isAiGenerating ? 'opacity-50' : ''}`}>
            <Pressable
              disabled={isAiGenerating}
              onPress={() => {
                setPlanningMode('single');
                resetPlanDraft();
              }}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
                planningMode === 'single' ? 'shadow-xs bg-white' : ''
              }`}>
              <Sprout size={16} color={planningMode === 'single' ? '#8C4522' : '#8C7C70'} />
              <Text
                className={`text-xs font-bold ${
                  planningMode === 'single' ? 'text-cognac' : 'text-taupe'
                }`}>
                Single Crop
              </Text>
            </Pressable>

            <Pressable
              disabled={isAiGenerating}
              onPress={() => {
                setPlanningMode('rotation');
                resetPlanDraft();
              }}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
                planningMode === 'rotation' ? 'shadow-xs bg-white' : ''
              }`}>
              <Layers size={16} color={planningMode === 'rotation' ? '#8C4522' : '#8C7C70'} />
              <Text
                className={`text-xs font-bold ${
                  planningMode === 'rotation' ? 'text-cognac' : 'text-taupe'
                }`}>
                Crop Rotation
              </Text>
            </Pressable>
          </View>

          {planningMode === 'single' ? (
            <View className="mb-5 flex-row items-center gap-2 rounded-xl border border-taupe/15 bg-champagne/60 px-3 py-2">
              <Sprout size={14} color="#8C4522" />
              <Text className="flex-1 text-xs text-taupe">
                Duration and tasks are automatically scheduled from your crop choice.
              </Text>
            </View>
          ) : (
            <>
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-espresso">
                  Planting duration in days (10–365)
                </Text>
                <Text className="text-xs font-bold text-cognac">
                  {parsedDays ? `~${(parsedDays / 30).toFixed(1)} mos` : ''}
                </Text>
              </View>

              <TextInput
                value={durationDaysInput}
                onChangeText={handleDurationChange}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="e.g. 30, 45, 60, 90"
                placeholderTextColor="#8C7C70"
                className="mb-2.5 rounded-2xl border border-taupe/30 bg-champagne px-4 py-3.5 text-base font-medium text-espresso"
              />

              {/* Duration Day Presets */}
              <View className="mb-4 flex-row flex-wrap gap-2">
                {DURATION_DAY_PRESETS.map((preset) => {
                  const isSelected = durationDaysInput === String(preset);
                  const isAnnual = preset === 365;
                  return (
                    <Pressable
                      key={preset}
                      onPress={() => setDurationDaysInput(String(preset))}
                      className={`rounded-xl border px-3 py-1.5 active:scale-95 ${
                        isSelected
                          ? 'shadow-xs border-cognac bg-cognac/15'
                          : 'border-taupe/25 bg-champagne/60'
                      }`}>
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-cognac' : 'text-taupe'
                        }`}>
                        {isAnnual ? '365 Days (1 Year)' : `${preset} Days`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {parsedDays > 90 && (
                <View className="mb-4 flex-row items-center gap-2 rounded-xl border border-taupe/15 bg-champagne/60 px-3 py-2">
                  <CloudSun size={14} color="#8C4522" />
                  <Text className="flex-1 text-xs text-taupe">
                    365-day seasonal patterns active across quarterly forecasts.
                  </Text>
                </View>
              )}
            </>
          )}

          <Text className="mb-2 text-sm font-semibold text-espresso">Start date</Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            className="mb-6 rounded-2xl border border-taupe/30 bg-champagne px-4 py-4 active:scale-[0.99]">
            <Text className="text-base font-medium text-espresso">{startDate.toDateString()}</Text>
          </Pressable>
          {showDatePicker ? (
            <DateTimePicker
              value={startDate}
              minimumDate={new Date()}
              mode="date"
              display="default"
              onChange={handleNativeDateChange}
            />
          ) : null}

          <Text className="mb-2 text-sm font-semibold text-espresso">Target season</Text>
          <View className="mb-6 flex-row flex-wrap gap-2">
            {SEASONS.map((seasonOption) => {
              const isSelected = season === seasonOption;

              return (
                <Pressable
                  key={seasonOption}
                  onPress={() => setSeason(seasonOption)}
                  className={`rounded-2xl border px-4 py-2.5 active:scale-95 ${
                    isSelected ? 'border-cognac bg-cognac/15' : 'border-taupe/30 bg-champagne'
                  }`}>
                  <Text
                    className={`text-sm font-semibold ${
                      isSelected ? 'text-cognac' : 'text-taupe'
                    }`}>
                    {seasonOption}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Target Plots Selection Section */}
          <View className="border-t border-taupe/15 pt-5">
            {isLoadingPlots ? (
              <View className="flex-row items-center justify-center py-4">
                <ActivityIndicator size="small" color="#8C7C70" />
                <Text className="ml-2 text-xs font-medium text-taupe">
                  Checking available plots...
                </Text>
              </View>
            ) : totalPlotsCount === 0 ? (
              <View className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4">
                <View className="mb-1.5 flex-row items-center gap-2">
                  <AlertCircle size={18} color="#D97706" />
                  <Text className="text-sm font-bold text-amber-900">No Garden Plots Found</Text>
                </View>
                <Text className="mb-3 text-xs leading-5 text-amber-800">
                  Before planning crop rotations, you need to create garden plots (beds, trellises,
                  or planters) for this farm in the Farm Layout Designer.
                </Text>
                <Pressable
                  onPress={() => router.push(`/farm/layout-designer/${farmId}`)}
                  className="flex-row items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 active:scale-95">
                  <Layers size={15} color="#FFFFFF" />
                  <Text className="text-xs font-bold text-white">Design Farm Layout</Text>
                </Pressable>
              </View>
            ) : availablePlots.length === 0 ? (
              <View className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4">
                <View className="mb-1.5 flex-row items-center gap-2">
                  <AlertCircle size={18} color="#D97706" />
                  <Text className="text-sm font-bold text-amber-900">All Plots Occupied</Text>
                </View>
                <Text className="mb-3 text-xs leading-5 text-amber-800">
                  All {totalPlotsCount} plots on this farm are currently occupied by active crop
                  cycles or succession plans. Free up a plot or delete an existing plan to schedule
                  a new one.
                </Text>
                {allActivePlans.length > 0 && (
                  <Pressable
                    onPress={() => setStep(5)}
                    className="flex-row items-center justify-center gap-1.5 rounded-xl bg-cognac px-4 py-2.5 active:scale-95">
                    <Text className="text-xs font-bold text-white">View Active Plans</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <>
                <View className="mb-3 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-espresso">Target plots</Text>
                    <View className="rounded-full bg-cognac/10 px-2.5 py-0.5">
                      <Text className="text-xs font-bold text-cognac">
                        {`${selectedPlots.length} of ${availablePlots.length}`}
                      </Text>
                    </View>
                  </View>

                  {availablePlots.length > 1 ? (
                    <Pressable
                      onPress={handleToggleSelectAllPlots}
                      className="rounded-full bg-taupe/15 px-3 py-1 active:scale-95">
                      <Text className="text-xs font-bold text-espresso">
                        {allPlotsSelected ? 'Deselect All' : 'Select All'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {availablePlots.length > 6 ? (
                  <View className="max-h-60 rounded-2xl border border-taupe/20 bg-champagne/40 p-3">
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                      <View className="flex-row flex-wrap gap-2">
                        {availablePlots.map((plot) => {
                          const isSelected = selectedPlots.includes(plot.id);
                          return (
                            <Pressable
                              key={plot.id}
                              onPress={() => {
                                setHasUserDismissedContext(false);
                                setSelectedPlots((current) =>
                                  isSelected
                                    ? current.filter((id) => id !== plot.id)
                                    : [...current, plot.id]
                                );
                              }}
                              className={`flex-row items-center gap-1.5 rounded-2xl border px-3.5 py-2.5 active:scale-95 ${
                                isSelected
                                  ? 'border-cognac bg-cognac/15 shadow-sm shadow-cognac/20'
                                  : 'border-taupe/30 bg-white'
                              }`}>
                              <View
                                className={`h-2 w-2 rounded-full ${
                                  isSelected ? 'bg-cognac' : 'bg-taupe/40'
                                }`}
                              />
                              <Text
                                className={`text-sm font-semibold ${
                                  isSelected ? 'text-cognac' : 'text-espresso'
                                }`}>
                                {plot.label || plot.type_name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                ) : (
                  <View className="flex-row flex-wrap gap-2">
                    {availablePlots.map((plot) => {
                      const isSelected = selectedPlots.includes(plot.id);
                      return (
                        <Pressable
                          key={plot.id}
                          onPress={() => {
                            setHasUserDismissedContext(false);
                            setSelectedPlots((current) =>
                              isSelected
                                ? current.filter((id) => id !== plot.id)
                                : [...current, plot.id]
                            );
                          }}
                          className={`flex-row items-center gap-1.5 rounded-2xl border px-3.5 py-2.5 active:scale-95 ${
                            isSelected
                              ? 'border-cognac bg-cognac/15 shadow-sm shadow-cognac/20'
                              : 'border-taupe/30 bg-champagne'
                          }`}>
                          <View
                            className={`h-2 w-2 rounded-full ${
                              isSelected ? 'bg-cognac' : 'bg-taupe/40'
                            }`}
                          />
                          <Text
                            className={`text-sm font-semibold ${
                              isSelected ? 'text-cognac' : 'text-espresso'
                            }`}>
                            {plot.label || plot.type_name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {selectedPlots.length === 0 && (
                  <Text className="mt-2.5 text-xs font-medium text-rose-500">
                    * Please select at least 1 target plot to plan for
                  </Text>
                )}
              </>
            )}
          </View>
        </View>

        {planningMode === 'single' ? (
          <Pressable
            onPress={handleProceedToCropSelection}
            disabled={!canProceed || isAiGenerating}
            className={`mb-12 flex-row items-center justify-center gap-2 rounded-3xl bg-cognac px-4 py-4 active:scale-[0.99] ${
              !canProceed || isAiGenerating ? 'opacity-40' : ''
            }`}>
            {isAiGenerating ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text className="text-center text-base font-bold text-white">
                  Generating AI Recommendations...
                </Text>
              </>
            ) : (
              <>
                <Sprout size={18} color="#FFFFFF" />
                <Text className="text-center text-base font-bold text-white">Select Crop</Text>
              </>
            )}
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={handleGenerateAiPlan}
              disabled={!canProceed || isAiGenerating || !isOnline}
              className={`mb-2 flex-row items-center justify-between rounded-3xl px-5 py-4 active:scale-[0.99] ${
                !isOnline
                  ? 'border border-amber-600/30 bg-amber-500/10'
                  : aiUsage.isLimitReached
                  ? 'border border-taupe/30 bg-taupe/15'
                  : 'bg-cognac shadow-md shadow-cognac/20'
              } ${!canProceed || !isOnline ? 'opacity-50' : ''}`}>
              <View className="flex-1 flex-row items-center gap-3">
                {isAiGenerating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : !isOnline ? (
                  <AlertTriangle size={20} color="#D97706" />
                ) : aiUsage.isLimitReached ? (
                  <Clock size={20} color="#8A7968" />
                ) : (
                  <Sparkles size={20} color="#FFFFFF" />
                )}
                <View className="flex-1">
                  <Text
                    className={`text-base font-bold ${
                      !isOnline
                        ? 'text-amber-700 dark:text-amber-400'
                        : aiUsage.isLimitReached
                        ? 'text-taupe'
                        : 'text-white'
                    }`}>
                    {isAiGenerating
                      ? parsedDays > 90
                        ? 'Analyzing 1-Year Climatology & Successions...'
                        : 'Generating AI Succession Plan...'
                      : !isOnline
                        ? 'AI Smart Plan (Offline)'
                        : aiUsage.isLimitReached
                        ? 'Monthly AI Quota Reached'
                        : 'AI Smart Plan'}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className={`text-xs ${
                      !isOnline
                        ? 'font-medium text-amber-700/80 dark:text-amber-400/80'
                        : aiUsage.isLimitReached
                        ? 'font-medium text-taupe/80'
                        : 'text-white/80'
                    }`}>
                    {!isOnline
                      ? 'Requires internet for OpenRouter AI'
                      : aiUsage.isLimitReached
                      ? 'Resets 1st of next month'
                      : isAiGenerating
                        ? 'Consulting AI agronomist (up to 10m)...'
                        : 'San Pablo microclimate & succession'}
                  </Text>
                </View>
              </View>

              <View
                className={`ml-2 rounded-full px-3 py-1 ${
                  !isOnline
                    ? 'bg-amber-500/20'
                    : aiUsage.isLimitReached
                    ? 'bg-taupe/20'
                    : 'bg-white/20'
                }`}>
                <Text
                  className={`text-xs font-bold ${
                    !isOnline
                      ? 'text-amber-800 dark:text-amber-300'
                      : aiUsage.isLimitReached
                      ? 'text-taupe'
                      : 'text-white'
                  }`}>
                  {!isOnline ? 'Offline' : `${aiUsage.remaining} of ${aiUsage.max} left`}
                </Text>
              </View>
            </Pressable>

            <View className="mb-3 flex-row items-center gap-1.5 px-2">
              <Info size={12} color="#8A7968" />
              <Text className="flex-1 text-[11px] text-taupe">
                {aiUsage.count}/{aiUsage.max} monthly AI plans used.
              </Text>
            </View>

            <Pressable
              onPress={handleGenerateRecommendations}
              disabled={!canProceed || isAiGenerating}
              className={`mb-12 flex-row items-center justify-center gap-2 rounded-3xl border border-cognac/30 bg-white px-4 py-4 active:scale-[0.99] ${
                !canProceed ? 'opacity-40' : ''
              }`}>
              <Leaf size={18} color="#9E5B32" />
              <Text className="text-center text-base font-bold text-cognac">
                Plan Manually (Unlimited)
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    );
  };

  const renderStep2 = () => {
    return (
      <View className="flex-1 bg-champagne">
        <View className="px-5 pb-4 pt-14">
          <BackButton
            className="mb-4"
            onPress={() => {
              setStep(1);
              setSelectedCrops([]);
              if (planningMode === 'single') {
                setTotalAvailableDays(0);
                setRemainingDays(0);
              }
            }}
          />
          <Text className="text-2xl font-black text-espresso">Select Crops</Text>
          {planningMode === 'rotation' ? (
            <Text className="mt-2 text-sm font-medium text-taupe">
              Remaining Days: <Text className="font-bold text-cognac">{remainingDays}</Text> /{' '}
              {totalAvailableDays}
            </Text>
          ) : previousCropContext ? (
            <Text className="mt-2 text-sm font-medium text-taupe">
              Showing best successors for{' '}
              <Text className="font-bold text-espresso">{contextPlotName || 'assigned plot'}</Text>{' '}
              (following <Text className="font-bold text-cognac">{previousCropContext.crop}</Text>).
            </Text>
          ) : (
            <Text className="mt-2 text-sm font-medium text-taupe">
              Select a crop to plant on your plot.
            </Text>
          )}
        </View>

        <ScrollView className="flex-1 px-5 pt-4">
          {renderBackgroundAiBanner()}

          {/* Custom Crop Creator Header Banner */}
          <View className="shadow-xs mb-5 flex-row items-center justify-between rounded-2xl border border-cognac/25 bg-champagne/80 p-4">
            <View className="flex-1 flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-cognac shadow-sm shadow-cognac/30">
                <Sprout size={20} color="#FFFFFF" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-black uppercase tracking-wider text-espresso">
                  Custom Crop Creator
                </Text>
                <Text className="text-[11px] text-taupe">
                  Add specialized crops with custom maturity days & milestones.
                </Text>
              </View>
            </View>
            <View className="ml-2 flex-row items-center gap-1.5">
              <Pressable
                onPress={() => router.push('/custom-crops')}
                className="shadow-xs rounded-xl border border-cognac/30 bg-white px-2.5 py-2 active:scale-95">
                <Text className="text-xs font-bold text-cognac">Manage</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setEditingCrop(null);
                  setCustomCropModalVisible(true);
                }}
                className="flex-row items-center gap-1 rounded-xl bg-cognac px-3 py-2 shadow-sm shadow-cognac/30 active:scale-95">
                <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
                <Text className="text-xs font-bold text-white">Add Crop</Text>
              </Pressable>
            </View>
          </View>

          {(Object.entries(groupedCrops) as [string, Crop[]][]).map(([cropType, cropsOfType]) => (
            <View key={cropType} className="mb-6">
              <Text className="mb-3 text-lg font-bold capitalize text-espresso">{cropType}</Text>
              {cropsOfType.map((crop) => (
                <Pressable
                  key={crop.crop}
                  onPress={() => handleSelectCrop(crop)}
                  className="mb-3 flex-row items-center justify-between rounded-2xl border border-taupe/30 bg-white p-4 shadow-sm">
                  <View className="min-w-0 flex-1 flex-row items-center gap-3">
                    <CropAvatar crop={crop} size="md" />
                    <View className="min-w-0 flex-1">
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        <Text className="text-base font-semibold text-espresso">{crop.crop}</Text>
                        {(crop.is_custom || (crop as any).isCustom) && (
                          <View className="shrink-0 rounded-md border border-cognac/30 bg-cognac/10 px-1.5 py-0.5">
                            <Text className="text-[10px] font-bold uppercase text-cognac">
                              Custom
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text className="mt-0.5 text-xs text-taupe">
                        {crop.maturity_days} days | {crop.season}
                      </Text>
                      <Text className="mt-0.5 text-xs text-cognac" numberOfLines={1}>
                        {crop.soil_benefit || crop.notes}
                      </Text>
                      {(() => {
                        const predecessor =
                          planningMode === 'single'
                            ? previousCropContext
                            : selectedCrops.length > 0
                              ? selectedCrops[selectedCrops.length - 1]
                              : previousCropContext;
                        if (!predecessor) return null;
                        const rel = getSuccessionRelationship(crop, predecessor);
                        return (
                          <View className="mt-1.5 flex-row flex-wrap items-center gap-1">
                            {rel.isDirectSuccessor && (
                              <View className="flex-row items-center gap-1 rounded-md border border-cognac/30 bg-cognac/10 px-1.5 py-0.5">
                                <Sparkles size={10} color="#8C4522" />
                                <Text className="text-[10px] font-bold uppercase tracking-wider text-cognac">
                                  Recommended Next
                                </Text>
                              </View>
                            )}
                            {rel.isNitrogenRestorer && (
                              <View className="flex-row items-center gap-1 rounded-md border border-taupe/25 bg-taupe/10 px-1.5 py-0.5">
                                <Leaf size={10} color="#8C7C70" />
                                <Text className="text-[10px] font-bold uppercase tracking-wider text-espresso">
                                  Fixes Nitrogen
                                </Text>
                              </View>
                            )}
                            {rel.isSameFamily && (
                              <View className="flex-row items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-1.5 py-0.5">
                                <AlertTriangle size={10} color="#D99C2B" />
                                <Text className="text-[10px] font-bold uppercase tracking-wider text-espresso">
                                  Same Family (
                                  {crop.family || inferCropBotanicalProfile(crop.crop)?.family})
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })()}
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    {crop.is_custom && (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          setEditingCrop(crop);
                          setCustomCropModalVisible(true);
                        }}
                        className="h-8 w-8 items-center justify-center rounded-xl bg-taupe/10 active:scale-95">
                        <Pencil size={14} color="#8C7C70" />
                      </Pressable>
                    )}
                    <View className="rounded-full bg-cognac/10 px-3 py-1">
                      <Text className="text-xs font-bold text-cognac">
                        {planningMode === 'single' ? 'Select' : 'Add'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}

          {Object.keys(groupedCrops).length === 0 ? (
            <Text className="mt-10 text-center text-taupe">
              No crops are available for the current succession rules and season.
            </Text>
          ) : null}

          <View className="h-20" />
        </ScrollView>

        {planningMode === 'rotation' && (
          <View className="border-t border-taupe/15 bg-white p-5">
            <Pressable
              onPress={() => setStep(3)}
              disabled={selectedCrops.length === 0}
              className={`rounded-3xl px-4 py-4 ${
                selectedCrops.length === 0 ? 'bg-taupe/50' : 'bg-cognac'
              }`}>
              <Text className="text-center text-base font-bold text-white">
                {remainingDays <= 0 ? 'Finish Selection' : 'Review Plan Early'} (
                {selectedCrops.length} selected)
              </Text>
            </Pressable>
          </View>
        )}

        {/* Custom Crop Modal */}
        <CustomCropModal
          visible={customCropModalVisible}
          onClose={() => {
            setCustomCropModalVisible(false);
            setEditingCrop(null);
          }}
          editCrop={editingCrop}
          userId={user?.id}
          onSaved={(savedCrop) => {
            refreshCrops();
          }}
          onDeleted={(deletedName) => {
            refreshCrops();
            setSelectedCrops((prev) => prev.filter((c) => c.crop !== deletedName));
          }}
        />

        {/* AI Generation Progress Modal */}
        <Modal
          visible={showAiProgressModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAiProgressModal(false)}>
          <View className="backdrop-blur-xs flex-1 items-center justify-center bg-black/65 px-5">
            <Pressable
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onPress={() => setShowAiProgressModal(false)}
            />
            <View className="w-full max-w-md rounded-[32px] border border-cognac/20 bg-champagne p-6 shadow-2xl">
              {/* Header with animated-style badge */}
              <View className="mb-4 items-center">
                <View className="mb-3 h-16 w-16 items-center justify-center rounded-3xl bg-cognac shadow-lg shadow-cognac/30">
                  <Sparkles size={32} color="#FFFFFF" />
                </View>
                <Text className="text-center text-xl font-black text-espresso">
                  AI Organic Succession Engine
                </Text>
                <View className="mt-1.5 flex-row items-center gap-1.5 rounded-full border border-cognac/30 bg-cognac/10 px-3 py-1">
                  <View className="h-2 w-2 rounded-full bg-cognac" />
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-cognac">
                    San Pablo City Agro-Ecology
                  </Text>
                </View>
              </View>

              {/* Dynamic Stage Title & Subtitle */}
              <View className="mb-5 min-h-[58px] items-center justify-center rounded-2xl bg-white/60 p-3">
                <Text className="text-center text-sm font-black text-espresso">
                  {aiProgressStage || 'Preparing Agronomic Engine...'}
                </Text>
                <Text className="mt-1 text-center text-xs leading-4 text-taupe">
                  {aiProgressSubtitle || 'Connecting to microclimate models...'}
                </Text>
              </View>

              {/* Progress Bar Container */}
              <View className="mb-4">
                <View className="mb-1.5 flex-row items-center justify-between">
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-taupe">
                    Generation Progress
                  </Text>
                  <Text className="text-xs font-black text-cognac">
                    {Math.round(aiProgress)}%
                  </Text>
                </View>

                {/* Progress Bar Track */}
                <View className="h-3.5 w-full overflow-hidden rounded-full bg-taupe/20 p-0.5">
                  <View
                    style={{ width: `${Math.min(Math.max(aiProgress, 6), 100)}%` }}
                    className="h-full rounded-full bg-cognac"
                  />
                </View>
              </View>

              {/* Educational Permaculture Tip Box */}
              <View className="rounded-2xl border border-cognac/20 bg-champagne/80 p-3.5">
                <View className="flex-row items-start gap-2.5">
                  <Sprout size={16} color="#8C4522" style={{ marginTop: 2 }} />
                  <View className="flex-1">
                    <Text className="text-[10px] font-black uppercase tracking-wider text-espresso">
                      Why does this take a moment?
                    </Text>
                    <Text className="mt-0.5 text-[11px] leading-4 text-taupe">
                      The AI is cross-referencing your crop catalog with local monsoons and generating custom organic care milestones to prevent pests without synthetic chemicals.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Modal Actions: Run in Background & Cancel */}
              <View className="mt-5 flex-row items-center gap-3">
                <TouchableOpacity
                  onPress={async () => {
                    await cancelAiJob(farmId);
                    setActiveJob(null);
                    setIsAiGenerating(false);
                    setShowAiProgressModal(false);
                  }}
                  className="flex-1 items-center justify-center rounded-2xl border border-taupe/30 bg-white/70 py-3.5 active:bg-white">
                  <Text className="text-xs font-bold text-taupe">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setShowAiProgressModal(false);
                    Alert.alert(
                      'Running in Background',
                      'Our AI Agronomist is analyzing your plots and local weather. Feel free to explore other screens — we will notify you when your succession plan is ready!',
                      [{ text: 'Got it' }]
                    );
                  }}
                  className="flex-2 items-center justify-center rounded-2xl bg-cognac py-3.5 shadow-md shadow-cognac/30 active:opacity-90">
                  <View className="flex-row items-center gap-1.5">
                    <Bell size={14} color="#FFFFFF" />
                    <Text className="text-xs font-bold text-white">Notify When Done</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderPlanStatusBadge = (plan: CropRotationPlanData) => {
    const status = getPlanStatus(plan);

    if (status === 'ongoing') {
      return (
        <View className="flex-row items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100/90 px-2.5 py-0.5">
          <View className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          <Text className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Ongoing
          </Text>
        </View>
      );
    }

    if (status === 'finished') {
      return (
        <View className="flex-row items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2.5 py-0.5">
          <CheckCircle2 size={11} color="#2563EB" />
          <Text className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
            Finished
          </Text>
        </View>
      );
    }

    return (
      <View className="flex-row items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5">
        <Clock size={11} color="#D97706" />
        <Text className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
          Upcoming
        </Text>
      </View>
    );
  };

  const renderPlanRows = (
    plan: CropRotationPlanData,
    planId: string,
    includeMilestones: boolean
  ) => (
    <View className="rounded-[28px] border border-taupe/20 bg-white/90 p-5 shadow-sm shadow-espresso/10">
      {plan.selectedCrops.map((crop, cropIndex) => {
        const startDay = getCropStartDay(plan.selectedCrops, cropIndex);
        const endDay = startDay + getCropDurationDays(crop);
        const planStartDate = dateKeyToDate(plan.startDate);
        const displayDateRange = formatMonthRange(planStartDate, startDay, endDay);
        const cropDetail = includeMilestones ? loadCropDetails(crop) : null;
        const cropId = `${planId}-${cropIndex}`;
        const isExpanded = expandedCropId === cropId;
        const cropStatus = includeMilestones ? getCropStatus(plan, cropIndex) : null;

        return (
          <View
            key={cropId}
            className={`py-4 ${cropIndex !== plan.selectedCrops.length - 1 ? 'border-b border-taupe/15' : ''}`}>
            <Pressable
              disabled={!includeMilestones}
              onPress={() => setExpandedCropId(isExpanded ? null : cropId)}>
              <View className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1 flex-row items-center gap-3">
                  <CropAvatar crop={crop} size="md" />
                  <View className="min-w-0 flex-1">
                    <View className="mb-1 flex-row flex-wrap items-center gap-1.5">
                      <Text className="text-sm font-bold text-cognac">
                        {displayDateRange}
                        {includeMilestones ? ` (Days ${startDay}-${endDay})` : ''}
                      </Text>
                      {cropStatus === 'ongoing' && (
                        <View className="flex-row items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100/90 px-1.5 py-0.5">
                          <View className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                            Current Crop
                          </Text>
                        </View>
                      )}
                      {cropStatus === 'completed' && (
                        <View className="flex-row items-center gap-1 rounded-md border border-taupe/20 bg-champagne/70 px-1.5 py-0.5">
                          <CheckCircle2 size={10} color="#8C7C70" />
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-taupe">
                            Harvested
                          </Text>
                        </View>
                      )}
                      {cropStatus === 'upcoming' && (
                        <View className="flex-row items-center gap-1 rounded-md border border-taupe/30 bg-champagne/70 px-1.5 py-0.5">
                          <Clock size={10} color="#8C7C70" />
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-taupe">
                            Upcoming
                          </Text>
                        </View>
                      )}
                    </View>
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      <Text className="shrink text-lg font-bold text-espresso" numberOfLines={1}>
                        {crop.crop}
                      </Text>
                      {(crop.is_custom || (crop as any).isCustom) && (
                        <View className="shrink-0 rounded-md border border-cognac/30 bg-cognac/10 px-1.5 py-0.5">
                          <Text className="text-[10px] font-bold uppercase text-cognac">
                            Custom
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="mt-1 text-sm text-taupe" numberOfLines={2}>
                      {crop.soil_benefit || crop.notes || 'Selected by user'}
                    </Text>
                  </View>
                </View>

                {/* Right Actions */}
                <View className="shrink-0 flex-row items-center gap-2 self-center">
                  {planId === 'draft' && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        handleRemoveCrop(cropIndex);
                      }}
                      hitSlop={8}
                      accessibilityLabel="Remove draft crop"
                      accessibilityRole="button"
                      className="h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 active:scale-95">
                      <Trash2 size={14} color="#E11D48" />
                    </Pressable>
                  )}

                  {includeMilestones ? (
                    <View className="shrink-0 rounded-full bg-champagne px-3 py-2">
                      <Text className="text-xs font-semibold text-espresso">
                        {isExpanded ? 'Hide' : 'Show'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>

            {includeMilestones && isExpanded && cropDetail ? (
              <View className="mt-4 rounded-2xl bg-champagne p-4">
                <Text className="mb-3 text-sm font-bold text-espresso">Milestone Schedule</Text>
                <View className="border-l-2 border-cognac/30 pl-4">
                  {cropDetail.milestones.map((milestone) => {
                    const milestoneDate = addDays(planStartDate, startDay + milestone.offset_days);

                    return (
                      <View
                        key={`${milestone.offset_days}-${milestone.title}`}
                        className="relative mb-5">
                        <View className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-champagne bg-cognac" />
                        <Text className="text-xs font-bold text-cognac">
                          Day {milestone.offset_days} ({milestoneDate.toLocaleDateString()})
                        </Text>
                        <Text className="text-base font-bold text-espresso">{milestone.title}</Text>
                        <Text className="mt-1 text-sm leading-5 text-taupe">
                          {milestone.description}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );

  const renderStep3 = () => {
    const planStartDate = dateKeyToDate(toDateKey(startDate));
    const isCustomCrop =
      selectedCrops.length > 0 &&
      selectedCrops.some((c) => Boolean(c.is_custom || (c as any).isCustom));

    // Case 1: All crops removed
    if (selectedCrops.length === 0) {
      return (
        <View className="flex-1 bg-champagne px-5 pt-14">
          <BackButton
            className="mb-4"
            onPress={() => {
              if (planningMode === 'single') {
                setSelectedCrops([]);
                setMilestoneMode(null);
                setTotalAvailableDays(0);
                setRemainingDays(0);
                setFormPerCrop({});
              }
              setStep(2);
            }}
          />

          <Text className="mb-1 text-3xl font-black text-espresso">Review & Milestones</Text>
          <View className="flex-1 items-center justify-center py-12">
            <Text className="mb-2 text-base font-bold text-espresso">No crops in plan</Text>
            <Text className="mb-6 text-center text-sm text-taupe">
              All crops have been removed from this plan.
            </Text>
            <Pressable
              onPress={() => {
                if (planningMode === 'single') {
                  setSelectedCrops([]);
                  setMilestoneMode(null);
                  setTotalAvailableDays(0);
                  setRemainingDays(0);
                  setFormPerCrop({});
                }
                setStep(2);
              }}
              className="rounded-2xl bg-cognac px-5 py-3">
              <Text className="font-bold text-white">Select Crops</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    // Case 2: Question before showing milestones (milestoneMode not selected yet)
    if (milestoneMode === null) {
      const isSingleCrop = planningMode === 'single' || selectedCrops.length === 1;

      return (
        <View className="flex-1 bg-champagne px-5 pt-14">
          <View className="mb-4 flex-row items-center justify-between">
            <BackButton
              className="mb-4"
              onPress={() => {
                if (planningMode === 'single') {
                  setSelectedCrops([]);
                  setMilestoneMode(null);
                  setTotalAvailableDays(0);
                  setRemainingDays(0);
                  setFormPerCrop({});
                }
                setStep(2);
              }}
            />

            <View className="rounded-full border border-cognac/30 bg-champagne px-3 py-1.5">
              <Text className="text-xs font-bold text-cognac">
                {planningMode === 'single'
                  ? 'Single Crop Plan'
                  : `${selectedCrops.length} Crops Rotation`}
              </Text>
            </View>
          </View>

          <Text className="mb-1 text-3xl font-black text-espresso">Review & Milestones</Text>
          <Text className="mb-3 text-xs text-taupe">
            {isSingleCrop
              ? 'Choose a milestone setup for your plan.'
              : 'Choose care schedule mode for each crop in your rotation.'}
          </Text>

          <View className="mb-3.5 flex-row items-center gap-1.5 px-1">
            <Layers size={13} color="#8C4522" />
            <Text className="text-xs text-taupe">
              Assigned:{' '}
              <Text className="font-semibold text-cognac">
                {selectedPlots.length > 0
                  ? selectedPlots.map((id) => allPlotsMap[id] || 'Plot').join(', ')
                  : 'Whole Farm'}
              </Text>
            </Text>
          </View>

          {isSingleCrop ? (
            <ScrollView className="mb-4 flex-1" showsVerticalScrollIndicator={false}>
              {/* Single Crop Card with Integrated Schedule Buttons */}
              <View className="shadow-2xs mb-4 rounded-[26px] border border-taupe/20 bg-white/95 p-4">
                {/* Crop Header Info */}
                {selectedCrops[0] && (
                  <View className="flex-row items-center justify-between border-b border-taupe/15 pb-3.5">
                    <View className="mr-2 flex-1 flex-row items-center gap-3">
                      <CropAvatar crop={selectedCrops[0]} size="md" />
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="text-base font-bold text-espresso">
                            {selectedCrops[0].crop}
                          </Text>
                          {isCustomCrop && (
                            <View className="shrink-0 rounded-md border border-cognac/30 bg-cognac/10 px-1.5 py-0.5">
                              <Text className="text-[9px] font-bold uppercase text-cognac">
                                Custom
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="mt-0.5 text-xs text-taupe">
                          {getCropDurationDays(selectedCrops[0])} Days • {selectedCrops[0].type || selectedCrops[0].season}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => handleConfirmRemoveCrop(0)}
                      hitSlop={8}
                      accessibilityLabel="Remove crop"
                      accessibilityRole="button"
                      className="flex-row items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 active:scale-95">
                      <Trash2 size={12} color="#E11D48" />
                      <Text className="text-xs font-bold text-rose-600">Remove</Text>
                    </Pressable>
                  </View>
                )}

                {/* Schedule Options Inside Crop Card: Default Schedule (Left) and Custom Schedule (Right) */}
                <View className="pt-3.5">
                  <Text className="mb-2 text-[11px] font-bold uppercase tracking-wider text-taupe">
                    Choose Schedule Mode
                  </Text>
                  <View className="flex-row gap-2.5">
                    {/* Default Schedule Button (Left) */}
                    <Pressable
                      onPress={() => handleChooseMilestoneMode('system')}
                      className="flex-1 rounded-2xl border border-cognac/40 bg-cognac/10 p-3 shadow-2xs active:scale-[0.98] active:bg-cognac/20">
                      <View className="mb-1.5 flex-row items-center gap-1.5">
                        <View className="h-6 w-6 items-center justify-center rounded-lg bg-cognac/20">
                          <Sparkles size={12} color="#8C4522" />
                        </View>
                        <Text className="text-xs font-extrabold text-cognac">Default</Text>
                      </View>
                      <Text className="text-xs font-bold text-espresso">
                        Default Schedule
                      </Text>
                      <Text className="mt-1 text-[10px] leading-3.5 text-taupe" numberOfLines={2}>
                        {isCustomCrop
                          ? 'Your created crop tasks'
                          : 'System-generated care tasks'}
                      </Text>
                    </Pressable>

                    {/* Custom Schedule Button (Right) */}
                    <Pressable
                      onPress={() => handleChooseMilestoneMode('custom')}
                      className="flex-1 rounded-2xl border border-taupe/25 bg-champagne/60 p-3 shadow-2xs active:scale-[0.98] active:bg-champagne">
                      <View className="mb-1.5 flex-row items-center gap-1.5">
                        <View className="h-6 w-6 items-center justify-center rounded-lg bg-taupe/20">
                          <Pencil size={12} color="#8C4522" />
                        </View>
                        <Text className="text-xs font-bold text-taupe">Custom</Text>
                      </View>
                      <Text className="text-xs font-bold text-espresso">
                        Custom Schedule
                      </Text>
                      <Text className="mt-1 text-[10px] leading-3.5 text-taupe" numberOfLines={2}>
                        Build schedule from scratch for this plan
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </ScrollView>
          ) : (
            <View className="flex-1">
              {/* Apply to All Shortcuts */}
              <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-taupe/20 bg-white/90 px-3.5 py-2.5 shadow-2xs">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-taupe">
                  Apply to All:
                </Text>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => handleSetAllCropsMilestoneMode('system')}
                    className="flex-row items-center gap-1 rounded-xl border border-cognac/30 bg-champagne px-2.5 py-1.5 active:scale-95">
                    <Sparkles size={11} color="#8C4522" />
                    <Text className="text-[11px] font-bold text-cognac">All Default</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleSetAllCropsMilestoneMode('custom')}
                    className="flex-row items-center gap-1 rounded-xl border border-cognac/30 bg-cognac/10 px-2.5 py-1.5 active:scale-95">
                    <Pencil size={11} color="#8C4522" />
                    <Text className="text-[11px] font-bold text-cognac">All Custom</Text>
                  </Pressable>
                </View>
              </View>

              {/* Scrollable list of crops with per-crop toggle */}
              <ScrollView className="mb-2 flex-1" showsVerticalScrollIndicator={false}>
                <View className="gap-3 pb-4">
                  {selectedCrops.map((crop, idx) => {
                    const duration = getCropDurationDays(crop);
                    const startDay = getCropStartDay(selectedCrops, idx);
                    const endDay = startDay + duration;
                    const displayRange = formatMonthRange(planStartDate, startDay, endDay);
                    const cropMode = crop.milestone_mode || 'system';
                    const isCustom = Boolean(crop.is_custom || (crop as any).isCustom);

                    return (
                      <View
                        key={`crop-setup-${idx}-${crop.crop}`}
                        className="rounded-2xl border border-taupe/20 bg-white/95 p-3.5 shadow-2xs">
                        {/* Crop Info Row */}
                        <View className="flex-row items-center justify-between border-b border-taupe/10 pb-2.5">
                          <View className="mr-2 flex-1 flex-row items-center gap-2.5">
                            <CropAvatar crop={crop} size="sm" />
                            <View className="flex-1">
                              <View className="flex-row items-center gap-1.5">
                                <Text className="text-sm font-bold text-espresso">{crop.crop}</Text>
                                {isCustom && (
                                  <View className="rounded border border-cognac/30 bg-cognac/10 px-1.5 py-0.5">
                                    <Text className="text-[9px] font-bold text-cognac">
                                      Custom
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <Text className="text-[11px] font-medium text-taupe">
                                {duration} Days • {displayRange}
                              </Text>
                            </View>
                          </View>
                          <View className="flex-row items-center gap-2">
                            <View className="rounded-md border border-cognac/20 bg-champagne/80 px-2 py-0.5">
                              <Text className="text-[10px] font-bold text-cognac">#{idx + 1}</Text>
                            </View>
                            <Pressable
                              onPress={() => handleConfirmRemoveCrop(idx)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityLabel="Remove crop"
                              accessibilityRole="button"
                              className="flex-row items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 active:scale-95">
                              <Trash2 size={11} color="#E11D48" />
                              <Text className="text-[10px] font-bold text-rose-600">Remove</Text>
                            </Pressable>
                          </View>
                        </View>

                        {/* Mode Selector for this Crop */}
                        <View className="mt-2.5 flex-row gap-2">
                          {/* Default Schedule Option */}
                          <Pressable
                            onPress={() => handleSetCropMilestoneMode(idx, 'system')}
                            className={`flex-1 rounded-xl border p-2.5 active:scale-[0.99] ${
                              cropMode !== 'custom'
                                ? 'border-cognac bg-cognac/10 shadow-2xs'
                                : 'border-taupe/20 bg-champagne/30'
                            }`}>
                            <View className="mb-0.5 flex-row items-center gap-1.5">
                              <Sparkles
                                size={12}
                                color={cropMode !== 'custom' ? '#8C4522' : '#8C7C70'}
                              />
                              <Text
                                className={`text-xs font-bold ${
                                  cropMode !== 'custom' ? 'text-espresso' : 'text-espresso'
                                }`}>
                                Default Schedule
                              </Text>
                            </View>
                            <Text
                              className={`text-[10px] ${
                                cropMode !== 'custom' ? 'text-taupe' : 'text-taupe'
                              }`}
                              numberOfLines={1}>
                              {isCustom ? 'Your created tasks' : 'System-generated tasks'}
                            </Text>
                          </Pressable>

                          {/* Custom Option */}
                          <Pressable
                            onPress={() => handleSetCropMilestoneMode(idx, 'custom')}
                            className={`flex-1 rounded-xl border p-2.5 active:scale-[0.99] ${
                              cropMode === 'custom'
                                ? 'border-cognac bg-champagne shadow-2xs'
                                : 'border-taupe/20 bg-champagne/30'
                            }`}>
                            <View className="mb-0.5 flex-row items-center gap-1.5">
                              <Pencil
                                size={12}
                                color={cropMode === 'custom' ? '#8C4522' : '#8C7C70'}
                              />
                              <Text
                                className={`text-xs font-bold ${
                                  cropMode === 'custom' ? 'text-cognac' : 'text-espresso'
                                }`}>
                                Custom Schedule
                              </Text>
                            </View>
                            <Text
                              className={`text-[10px] ${
                                cropMode === 'custom' ? 'text-cognac/80' : 'text-taupe'
                              }`}
                              numberOfLines={1}>
                              Create from scratch
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Bottom Continue Button */}
              <View className="pb-8 pt-2">
                <Pressable
                  onPress={handleConfirmPerCropModes}
                  className="rounded-3xl bg-cognac px-4 py-4 shadow-sm active:scale-[0.99]">
                  <Text className="text-center text-base font-bold text-white">
                    Continue to Schedule ({selectedCrops.length} Crops) →
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      );
    }

    // Case 3: Milestone Review (milestoneMode is 'system' or 'custom')
    return (
      <View className="flex-1 bg-champagne px-5 pt-14">
        <View className="mb-4 flex-row items-center justify-between">
          <BackButton
            className="mb-4"
            onPress={() => {
              setMilestoneMode(null);
            }}
          />

          <View className="rounded-full border border-cognac/30 bg-champagne px-3 py-1.5">
            <Text className="text-xs font-bold text-cognac">
              {planningMode === 'single'
                ? 'Single Crop Plan'
                : `${selectedCrops.length} Crops Rotation`}
            </Text>
          </View>
        </View>

        <Text className="mb-1 text-3xl font-black text-espresso">Review & Milestones</Text>
        <Text className="mb-3 text-xs text-taupe">Review and adjust tasks before saving.</Text>

        <View className="mb-3.5 flex-row items-center justify-between px-1">
          <View className="flex-row items-center gap-1.5">
            <Layers size={13} color="#8C4522" />
            <Text className="text-xs text-taupe">
              Assigned:{' '}
              <Text className="font-semibold text-cognac">
                {selectedPlots.length > 0
                  ? selectedPlots.map((id) => allPlotsMap[id] || 'Plot').join(', ')
                  : 'Whole Farm'}
              </Text>
            </Text>
          </View>

          {selectedCrops.length > 1 && (
            <Pressable
              onPress={handleToggleAllMilestonesOpen}
              className="flex-row items-center gap-1 rounded-lg bg-taupe/10 px-2.5 py-1 active:scale-95">
              <Text className="text-[11px] font-bold text-cognac">
                {openMilestoneCropIndices.length === selectedCrops.length ? 'Collapse All' : 'Expand All'}
              </Text>
            </Pressable>
          )}
        </View>

        <ScrollView className="mb-4 flex-1" showsVerticalScrollIndicator={false}>
          {/* San Pablo City Climate & Organic Strategy Dropdown (Default Collapsed - Plain Neutral) */}
          {aiClimateSummary ? (
            <View className="mb-2.5 overflow-hidden rounded-2xl border border-taupe/20 bg-white/70 shadow-2xs">
              <Pressable
                onPress={() => setIsClimateStrategyExpanded((prev) => !prev)}
                className="flex-row items-center justify-between p-3 active:bg-taupe/10">
                <View className="flex-1 flex-row items-center gap-2.5">
                  <View className="h-6 w-6 items-center justify-center rounded-lg bg-taupe/15">
                    <Sparkles size={13} color="#8A7968" />
                  </View>
                  <Text className="text-xs font-semibold text-espresso">
                    San Pablo Climate Strategy
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View className="rounded-full border border-taupe/20 bg-taupe/10 px-2 py-0.5">
                    <Text className="text-[9px] font-medium text-taupe">
                      Microclimate
                    </Text>
                  </View>
                  <ChevronDown
                    size={15}
                    color="#8A7968"
                    style={{ transform: [{ rotate: isClimateStrategyExpanded ? '180deg' : '0deg' }] }}
                  />
                </View>
              </Pressable>

              {isClimateStrategyExpanded && (
                <View className="border-t border-taupe/15 px-3.5 pb-3.5 pt-2">
                  <Text className="text-xs leading-5 text-taupe">
                    {aiClimateSummary}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* AI Advisory & Accuracy Notice Dropdown (Default Collapsed - Plain Neutral) */}
          <View className="mb-3.5 overflow-hidden rounded-2xl border border-taupe/20 bg-white/70 shadow-2xs">
            <Pressable
              onPress={() => setIsAiGuidanceExpanded((prev) => !prev)}
              className="flex-row items-center justify-between p-3 active:bg-taupe/10">
              <View className="flex-1 flex-row items-center gap-2.5">
                <View className="h-6 w-6 items-center justify-center rounded-lg bg-taupe/15">
                  <AlertTriangle size={13} color="#8A7968" />
                </View>
                <Text className="text-xs font-semibold text-espresso">
                  AI Guidance & Accuracy Notice
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="rounded-full border border-taupe/20 bg-taupe/10 px-2 py-0.5">
                  <Text className="text-[9px] font-medium text-taupe">Advisory</Text>
                </View>
                <ChevronDown
                  size={15}
                  color="#8A7968"
                  style={{ transform: [{ rotate: isAiGuidanceExpanded ? '180deg' : '0deg' }] }}
                />
              </View>
            </Pressable>

            {isAiGuidanceExpanded && (
              <View className="border-t border-taupe/15 px-3.5 pb-3.5 pt-2">
                <Text className="text-xs leading-5 text-taupe">
                  AI crop rotations and care milestones are advisory predictions based on San Pablo microclimate models and organic agronomy rules. Always verify soil moisture and plant vigor in your field, and adjust milestone tasks before scheduling.
                </Text>
              </View>
            )}
          </View>

          {selectedCrops.map((crop, cropIndex) => {
            const startDay = getCropStartDay(selectedCrops, cropIndex);
            const duration = getCropDurationDays(crop);
            const endDay = startDay + duration;
            const displayDateRange = formatMonthRange(planStartDate, startDay, endDay);
            const cropMilestones = Array.isArray(crop.milestones) ? crop.milestones : [];
            const cropForm = getCropFormState(cropIndex);
            const isMilestonesOpen = openMilestoneCropIndices.includes(cropIndex);

            return (
              <View
                key={`step3-crop-${cropIndex}-${crop.crop}`}
                className="mb-5 rounded-[26px] border border-taupe/20 bg-white/95 p-4 shadow-sm shadow-espresso/10">
                {/* Crop Header */}
                <View className="flex-row items-center justify-between border-b border-taupe/15 pb-3">
                  <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
                    <CropAvatar crop={crop} size="md" />
                    <View className="min-w-0 flex-1">
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        <Text className="text-base font-bold text-espresso">{crop.crop}</Text>
                        {crop.family ? (
                          <View className="shrink-0 rounded-md border border-taupe/20 bg-taupe/10 px-1.5 py-0.5">
                            <Text className="text-[10px] font-medium text-taupe">
                              {crop.family}
                            </Text>
                          </View>
                        ) : null}
                        {(crop.is_custom || (crop as any).isCustom) && (
                          <View className="shrink-0 rounded-md border border-taupe/20 bg-taupe/10 px-1.5 py-0.5">
                            <Text className="text-[10px] font-medium text-taupe">
                              Custom
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-xs font-semibold text-cognac">
                        {displayDateRange} • {duration} Days
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={() => handleConfirmRemoveCrop(cropIndex)}
                    hitSlop={8}
                    accessibilityLabel="Remove crop"
                    accessibilityRole="button"
                    className="flex-row items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 active:scale-95">
                    <Trash2 size={13} color="#E11D48" />
                    <Text className="text-xs font-bold text-rose-600">Remove</Text>
                  </Pressable>
                </View>

                {/* AI Crop Insights Badges (Plain Neutral - Hold or tap to view explanation) */}
                {(crop.soil_benefit || crop.notes) && (
                  <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
                    {crop.soil_benefit ? (
                      <Pressable
                        onLongPress={() =>
                          setExplanationModal({
                            title: 'Organic Succession Rationale',
                            subtitle: crop.crop,
                            explanation: crop.soil_benefit || '',
                            type: 'rationale',
                          })
                        }
                        onPress={() =>
                          setExplanationModal({
                            title: 'Organic Succession Rationale',
                            subtitle: crop.crop,
                            explanation: crop.soil_benefit || '',
                            type: 'rationale',
                          })
                        }
                        delayLongPress={200}
                        accessibilityLabel={`Organic succession rationale for ${crop.crop}. Hold or tap to view.`}
                        className="flex-row items-center gap-1.5 rounded-full border border-taupe/25 bg-taupe/10 px-2.5 py-1 active:scale-95 active:bg-taupe/20">
                        <Sprout size={12} color="#8A7968" />
                        <Text className="text-[11px] font-medium text-espresso">Rationale</Text>
                        <Info size={10} color="#8A7968" opacity={0.6} />
                      </Pressable>
                    ) : null}

                    {crop.notes ? (
                      <Pressable
                        onLongPress={() =>
                          setExplanationModal({
                            title: 'San Pablo Climate Fit',
                            subtitle: crop.crop,
                            explanation: crop.notes || '',
                            type: 'climate',
                          })
                        }
                        onPress={() =>
                          setExplanationModal({
                            title: 'San Pablo Climate Fit',
                            subtitle: crop.crop,
                            explanation: crop.notes || '',
                            type: 'climate',
                          })
                        }
                        delayLongPress={200}
                        accessibilityLabel={`Climate fit for ${crop.crop}. Hold or tap to view.`}
                        className="flex-row items-center gap-1.5 rounded-full border border-taupe/25 bg-taupe/10 px-2.5 py-1 active:scale-95 active:bg-taupe/20">
                        <CloudSun size={12} color="#8A7968" />
                        <Text className="text-[11px] font-medium text-espresso">Climate Fit</Text>
                        <Info size={10} color="#8A7968" opacity={0.6} />
                      </Pressable>
                    ) : null}
                  </View>
                )}

                {/* Per-Crop Mode Switcher */}
                <View className="mb-2.5 mt-3 flex-row items-center rounded-2xl border border-taupe/20 bg-champagne/60 p-1">
                  <Pressable
                    onPress={() => handleToggleCropMilestoneMode(cropIndex, 'system')}
                    className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 ${
                      crop.milestone_mode !== 'custom' ? 'shadow-xs bg-cognac' : 'bg-transparent'
                    }`}>
                    <Sparkles size={13} color={crop.milestone_mode !== 'custom' ? '#FFFFFF' : '#8C7C70'} />
                    <Text
                      className={`text-xs font-bold ${
                        crop.milestone_mode !== 'custom' ? 'text-white' : 'text-taupe'
                      }`}>
                      Default Schedule
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleToggleCropMilestoneMode(cropIndex, 'custom')}
                    className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 ${
                      crop.milestone_mode === 'custom' ? 'shadow-xs bg-cognac' : 'bg-transparent'
                    }`}>
                    <Pencil size={13} color={crop.milestone_mode === 'custom' ? '#FFFFFF' : '#8C7C70'} />
                    <Text
                      className={`text-xs font-bold ${
                        crop.milestone_mode === 'custom' ? 'text-white' : 'text-taupe'
                      }`}>
                      Custom Schedule
                    </Text>
                  </Pressable>
                </View>

                {/* Milestones Accordion Dropdown Header (Default Closed) */}
                <Pressable
                  onPress={() => toggleCropMilestonesOpen(cropIndex)}
                  className="mt-3 flex-row items-center justify-between rounded-2xl border border-taupe/20 bg-champagne/40 px-3.5 py-2.5 active:bg-champagne/70">
                  <View className="flex-row items-center gap-2">
                    <View className="h-6 w-6 items-center justify-center rounded-full bg-taupe/15">
                      <ChevronDown
                        size={14}
                        color="#8C4522"
                        style={{ transform: [{ rotate: isMilestonesOpen ? '180deg' : '0deg' }] }}
                      />
                    </View>
                    <Text className="text-xs font-bold uppercase tracking-wider text-espresso">
                      Milestones
                    </Text>
                    <View className="rounded-full bg-taupe/15 px-2 py-0.5">
                      <Text className="text-[10px] font-bold text-espresso">
                        {cropMilestones.length}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs font-semibold text-cognac">
                      {isMilestonesOpen ? 'Hide Tasks' : 'Show Tasks'}
                    </Text>
                  </View>
                </Pressable>

                {/* Collapsible Milestones Section */}
                {isMilestonesOpen && (
                  <View className="mt-3">
                    {/* Actions row: Reset/Clear and Add Task */}
                    <View className="mb-2.5 flex-row items-center justify-end gap-1.5">
                      {crop.milestone_mode !== 'custom' ? (
                        <Pressable
                          onPress={() => handleResetCropMilestones(cropIndex)}
                          className="flex-row items-center gap-1 rounded-xl bg-taupe/10 px-2.5 py-1 active:scale-95">
                          <RotateCcw size={11} color="#8C7C70" />
                          <Text className="text-[10px] font-bold text-taupe">Reset</Text>
                        </Pressable>
                      ) : cropMilestones.length > 0 ? (
                        <Pressable
                          onPress={() => handleClearCropMilestones(cropIndex)}
                          hitSlop={8}
                          accessibilityLabel="Clear all milestones"
                          accessibilityRole="button"
                          className="flex-row items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 active:scale-95">
                          <Trash2 size={11} color="#E11D48" />
                          <Text className="text-[10px] font-bold text-rose-700">Clear</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => handleOpenAddMilestone(cropIndex)}
                        className="shadow-2xs flex-row items-center gap-1 rounded-xl bg-cognac px-2.5 py-1 active:scale-95">
                        <Plus size={12} color="#FFFFFF" strokeWidth={2.5} />
                        <Text className="text-[11px] font-bold text-white">Add Task</Text>
                      </Pressable>
                    </View>

                    {/* Milestones List */}
                    {cropMilestones.length === 0 ? (
                      <View className="mb-2 items-center justify-center rounded-2xl border border-dashed border-taupe/30 bg-champagne/30 p-3">
                        <Text className="text-center text-xs font-medium text-taupe">
                          {crop.milestone_mode !== 'custom'
                            ? 'No tasks. Tap "Add Task" or "Reset".'
                            : 'No tasks added yet. Fill out form below.'}
                        </Text>
                      </View>
                    ) : (
                      <View className="mb-2 ml-2 mt-1 border-l-2 border-cognac/30 pl-3">
                        {cropMilestones.map((m, mIndex) => {
                          const phaseObj =
                            MILESTONE_PHASE_LABELS.find((p) => p.label === m.label) ||
                            MILESTONE_PHASE_LABELS[1];
                          const milestoneDate = addDays(planStartDate, startDay + m.offset_days);

                          return (
                            <View
                              key={`crop-${cropIndex}-milestone-${mIndex}`}
                              className="relative mb-2 rounded-xl border border-taupe/15 bg-champagne/40 px-3 py-2">
                              {/* Timeline dot */}
                              <View className="absolute -left-[19px] top-3 h-2.5 w-2.5 rounded-full border-2 border-white bg-cognac" />

                              <View className="flex-row items-center justify-between">
                                <View className="mr-2 min-w-0 flex-1">
                                  <View className="mb-0.5 flex-row items-center gap-1.5">
                                    <View className="rounded bg-espresso px-1.5 py-0.5">
                                      <Text className="text-[9px] font-bold uppercase text-white">
                                        Day {m.offset_days}
                                      </Text>
                                    </View>
                                    <View
                                      className={`rounded border px-1.5 py-0.5 ${phaseObj.bg} ${phaseObj.borderColor}`}>
                                      <Text
                                        style={{ color: phaseObj.color }}
                                        className="text-[9px] font-bold uppercase">
                                        {phaseObj.shortName || phaseObj.name}
                                      </Text>
                                    </View>
                                    <Text className="text-[10px] font-medium text-taupe">
                                      {milestoneDate.toLocaleDateString()}
                                    </Text>
                                  </View>
                                  <Text className="text-sm font-bold text-espresso" numberOfLines={1}>
                                    {m.title}
                                  </Text>
                                  {m.description ? (
                                    <Text className="mt-0.5 text-[11px] text-taupe" numberOfLines={1}>
                                      {m.description}
                                    </Text>
                                  ) : null}
                                </View>

                                <View className="shrink-0 flex-row items-center gap-1.5">
                                  <Pressable
                                    onPress={() => handleOpenEditMilestone(cropIndex, mIndex)}
                                    hitSlop={8}
                                    accessibilityLabel="Edit task"
                                    accessibilityRole="button"
                                    className="shadow-2xs h-7 w-7 items-center justify-center rounded-lg border border-taupe/30 bg-white active:scale-95">
                                    <Pencil size={12} color="#8C7C70" />
                                  </Pressable>
                                  <Pressable
                                    onPress={() => handleDeleteMilestone(cropIndex, mIndex)}
                                    hitSlop={8}
                                    accessibilityLabel="Delete task"
                                    accessibilityRole="button"
                                    className="shadow-2xs h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 active:scale-95">
                                    <Trash2 size={12} color="#E11D48" />
                                  </Pressable>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Custom Mode Form (Rendered in Custom Mode for each crop) */}
                    {crop.milestone_mode === 'custom' && (
                      <View className="mt-2 rounded-2xl border border-cognac/25 bg-champagne/35 p-3">
                        <View className="mb-2.5 flex-row items-center gap-2">
                          <View className="h-6 w-6 items-center justify-center rounded-lg bg-cognac/15">
                            <Plus size={13} color="#8C4522" strokeWidth={2.5} />
                          </View>
                          <Text className="text-xs font-bold uppercase tracking-wider text-espresso">
                            Add Task
                          </Text>
                        </View>

                        {/* Day Offset Input & Quick Chips */}
                        <View className="mb-2.5">
                          <Text className="mb-1 text-[11px] font-bold uppercase tracking-wider text-espresso">
                            Day Offset <Text className="text-rose-600">*</Text>
                          </Text>
                          <TextInput
                            value={cropForm.offsetDays}
                            onChangeText={(text) =>
                              updateCropFormField(cropIndex, 'offsetDays', text.replace(/[^0-9]/g, ''))
                            }
                            keyboardType="number-pad"
                            maxLength={5}
                            placeholder="e.g. 0, 7, 14"
                            placeholderTextColor="#8C7C70"
                            className="rounded-xl border border-taupe/30 bg-white px-3 py-2 text-sm font-bold text-espresso"
                          />
                          <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                            {[0, 7, 14, 21, 30, 45].map((presetDay) => {
                              const isSelected = cropForm.offsetDays === String(presetDay);
                              return (
                                <Pressable
                                  key={`crop-${cropIndex}-preset-${presetDay}`}
                                  onPress={() =>
                                    updateCropFormField(cropIndex, 'offsetDays', String(presetDay))
                                  }
                                  className={`rounded-lg border px-2 py-0.5 ${
                                    isSelected
                                      ? 'border-cognac bg-champagne'
                                      : 'border-taupe/20 bg-white'
                                  }`}>
                                  <Text
                                    className={`text-[10px] font-bold ${
                                      isSelected ? 'text-cognac' : 'text-taupe'
                                    }`}>
                                    Day {presetDay}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>

                        {/* Phase Selector */}
                        <View className="mb-2.5">
                          <Text className="mb-1 text-[11px] font-bold uppercase tracking-wider text-espresso">
                            Phase
                          </Text>
                          <View className="flex-row gap-1.5">
                            {MILESTONE_PHASE_LABELS.map((p) => {
                              const isSelected = cropForm.label === p.label;
                              return (
                                <Pressable
                                  key={`crop-${cropIndex}-phase-${p.label}`}
                                  onPress={() => updateCropFormField(cropIndex, 'label', p.label)}
                                  className={`flex-1 items-center justify-center rounded-xl border py-1.5 ${
                                    isSelected ? 'border-cognac bg-cognac' : 'border-taupe/25 bg-white'
                                  }`}>
                                  <Text
                                    className={`text-[11px] font-bold ${
                                      isSelected ? 'text-white' : 'text-espresso'
                                    }`}>
                                    {p.shortName || p.name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>

                        {/* Task Title */}
                        <View className="mb-2.5">
                          <Text className="mb-1 text-[11px] font-bold uppercase tracking-wider text-espresso">
                            Title <Text className="text-rose-600">*</Text>
                          </Text>
                          <TextInput
                            value={cropForm.title}
                            onChangeText={(text) => updateCropFormField(cropIndex, 'title', text)}
                            maxLength={255}
                            placeholder="Task title"
                            placeholderTextColor="#8C7C70"
                            className="rounded-xl border border-taupe/30 bg-white px-3 py-2 text-sm font-medium text-espresso"
                          />
                        </View>

                        {/* Task Description */}
                        <View className="mb-3">
                          <Text className="mb-1 text-[11px] font-bold uppercase tracking-wider text-espresso">
                            Instructions (Optional)
                          </Text>
                          <TextInput
                            value={cropForm.description}
                            onChangeText={(text) => updateCropFormField(cropIndex, 'description', text)}
                            multiline
                            numberOfLines={2}
                            maxLength={3000}
                            placeholder="Task instructions (optional)"
                            placeholderTextColor="#8C7C70"
                            className="rounded-xl border border-taupe/30 bg-white p-2 text-xs text-espresso"
                            style={{ minHeight: 44, textAlignVertical: 'top' }}
                          />
                        </View>

                        {/* Add Task Button */}
                        <Pressable
                          onPress={() => handleAddCustomMilestone(cropIndex)}
                          className="shadow-2xs rounded-xl bg-cognac py-2.5 active:scale-[0.99]">
                          <Text className="text-center text-xs font-bold text-white">+ Add Task</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {selectedCrops.length > 0 && (
          <View className="pb-8">
            <Pressable
              onPress={handleSaveToFarm}
              className="rounded-3xl bg-cognac px-4 py-4 shadow-sm active:scale-[0.99]">
              <Text className="text-center text-base font-bold text-white">Save to Farm</Text>
            </Pressable>
          </View>
        )}

        {/* Milestone Add/Edit Sub-Modal */}
        <Modal
          visible={milestoneModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            Keyboard.dismiss();
            setMilestoneModalVisible(false);
          }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View className="backdrop-blur-xs flex-1 items-center justify-center bg-black/60 px-5">
              <Pressable
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                onPress={() => {
                  Keyboard.dismiss();
                  setMilestoneModalVisible(false);
                }}
              />
              <View className="w-full max-w-md rounded-[32px] border border-taupe/20 bg-champagne p-6 shadow-2xl">
              <View className="mb-4 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2.5">
                  <View className="h-10 w-10 items-center justify-center rounded-2xl bg-cognac/10">
                    <Sprout size={20} color="#8C4522" />
                  </View>
                  <View>
                    <Text className="text-lg font-black text-espresso">
                      {editingMilestoneIndex !== null ? 'Edit Task' : 'Add Task'}
                    </Text>
                    <Text className="text-xs text-taupe">
                      {targetCropIndex !== null && selectedCrops[targetCropIndex]
                        ? selectedCrops[targetCropIndex].crop
                        : 'Crop Cycle'}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setMilestoneModalVisible(false)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-taupe/15">
                  <X size={16} color="#8C7C70" />
                </Pressable>
              </View>

              {/* Day Offset Input with quick presets */}
              <View className="mb-3.5">
                <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-espresso">
                  Day Offset <Text className="text-rose-600">*</Text>
                </Text>
                <TextInput
                  value={mOffsetDays}
                  onChangeText={(text) => setMOffsetDays(text.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={5}
                  placeholder="e.g. 0, 7, 14"
                  placeholderTextColor="#8C7C70"
                  className="rounded-xl border border-taupe/30 bg-white px-3.5 py-2.5 text-base font-bold text-espresso"
                />
                <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                  {[0, 7, 14, 21, 30].map((presetDay) => (
                    <Pressable
                      key={presetDay}
                      onPress={() => setMOffsetDays(String(presetDay))}
                      className={`rounded-lg border px-2.5 py-1 ${
                        mOffsetDays === String(presetDay)
                          ? 'border-cognac bg-champagne'
                          : 'border-taupe/20 bg-white'
                      }`}>
                      <Text
                        className={`text-[11px] font-bold ${
                          mOffsetDays === String(presetDay) ? 'text-cognac' : 'text-espresso'
                        }`}>
                        Day {presetDay}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Phase Label Selector */}
              <View className="mb-3.5">
                <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-espresso">
                  Phase
                </Text>
                <View className="flex-row gap-2">
                  {MILESTONE_PHASE_LABELS.map((p) => {
                    const isSelected = mLabel === p.label;
                    return (
                      <Pressable
                        key={p.label}
                        onPress={() => setMLabel(p.label)}
                        className={`flex-1 items-center justify-center rounded-xl border py-2 active:scale-95 ${
                          isSelected
                            ? 'shadow-2xs border-cognac bg-cognac'
                            : 'border-taupe/25 bg-white'
                        }`}>
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? 'text-white' : 'text-espresso'
                          }`}>
                          {p.shortName || p.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Task Title Input */}
              <View className="mb-3.5">
                <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-espresso">
                  Title <Text className="text-rose-600">*</Text>
                </Text>
                <TextInput
                  value={mTitle}
                  onChangeText={setMTitle}
                  maxLength={255}
                  placeholder="Task title"
                  placeholderTextColor="#8C7C70"
                  className="rounded-xl border border-taupe/30 bg-white px-3.5 py-2.5 text-sm font-medium text-espresso"
                />
              </View>

              {/* Description / Instructions */}
              <View className="mb-4">
                <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-espresso">
                  Instructions (Optional)
                </Text>
                <TextInput
                  value={mDescription}
                  onChangeText={setMDescription}
                  multiline
                  numberOfLines={2}
                  maxLength={3000}
                  placeholder="Task instructions (optional)"
                  placeholderTextColor="#8C7C70"
                  className="rounded-xl border border-taupe/30 bg-white p-3 text-sm text-espresso"
                  style={{ minHeight: 56, textAlignVertical: 'top' }}
                />
              </View>

              {/* Modal Actions */}
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => setMilestoneModalVisible(false)}
                  className="flex-1 rounded-2xl border border-taupe/30 bg-white py-3.5 active:scale-95">
                  <Text className="text-center text-sm font-bold text-espresso">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveMilestone}
                  className="flex-1 rounded-2xl bg-cognac py-3.5 shadow-sm active:scale-95">
                  <Text className="text-center text-sm font-bold text-white">
                    {editingMilestoneIndex !== null ? 'Save' : 'Add Task'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

        {/* Crop Insight Explanation Modal */}
        <Modal
          visible={Boolean(explanationModal)}
          transparent
          animationType="fade"
          onRequestClose={() => setExplanationModal(null)}>
          <Pressable
            onPress={() => setExplanationModal(null)}
            className="backdrop-blur-xs flex-1 items-center justify-center bg-black/60 px-6">
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-[28px] border border-taupe/20 bg-champagne p-5 shadow-2xl">
              <View className="mb-3 flex-row items-center justify-between">
                <View className="flex-1 flex-row items-center gap-2.5">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-taupe/15">
                    {explanationModal?.type === 'rationale' ? (
                      <Sprout size={18} color="#8A7968" />
                    ) : (
                      <CloudSun size={18} color="#8A7968" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-espresso">
                      {explanationModal?.title}
                    </Text>
                    {explanationModal?.subtitle ? (
                      <Text className="text-xs font-semibold text-taupe">
                        {explanationModal.subtitle}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Pressable
                  onPress={() => setExplanationModal(null)}
                  className="h-7 w-7 items-center justify-center rounded-full bg-taupe/15 active:bg-taupe/25">
                  <X size={15} color="#8A7968" />
                </Pressable>
              </View>

              <Text className="text-xs leading-5 text-espresso/85">
                {explanationModal?.explanation}
              </Text>

              <Pressable
                onPress={() => setExplanationModal(null)}
                className="mt-4 w-full rounded-2xl bg-cognac py-2.5 active:bg-cognac/90">
                <Text className="text-center text-xs font-bold text-white">Got it</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  };

  const renderStep5 = () => {
    const generalPlans = allActivePlans.filter((p) => !p.targetPlots || p.targetPlots.length === 0);
    const specificPlans = allActivePlans.filter((p) => p.targetPlots && p.targetPlots.length > 0);

    return (
      <View className="flex-1 bg-champagne px-5 pt-14">
        <View className="mb-6 flex-row items-center justify-between">
          <BackButton />
          {permissions.canEditCropPlan && (
            <Pressable
              onPress={handleCreateNew}
              className="shadow-xs rounded-full border border-black/5 bg-white px-4 py-2.5 active:scale-95">
              <Text className="text-center text-xs font-bold text-cognac">Create New Plan</Text>
            </Pressable>
          )}
        </View>

        <Text className="mb-2 text-3xl font-black text-espresso">Farm Crops & History</Text>
        <Text className="mb-4 text-base leading-6 text-taupe">
          Manage active succession plans and inspect completed or incident-stopped plot history.
        </Text>

        {!permissions.canEditCropPlan && (
          <View className="mb-5 flex-row items-center rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5">
            <AlertTriangle size={18} color="#D97706" style={{ marginRight: 10 }} />
            <Text className="flex-1 text-xs font-semibold leading-relaxed text-amber-900">
              <Text className="font-black">View-Only Collaborator Mode: </Text>
              Only farm owners and administrators can create, edit, or stop planting cycles.
            </Text>
          </View>
        )}

        {/* Segmented Tab: Active Plans vs Plot History */}
        <View className="mb-5 flex-row rounded-2xl bg-taupe/15 p-1">
          <Pressable
            onPress={() => setActiveStep5Tab('plans')}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
              activeStep5Tab === 'plans' ? 'shadow-xs bg-white' : ''
            }`}>
            <Layers size={15} color={activeStep5Tab === 'plans' ? '#8C4522' : '#8C7C70'} />
            <Text
              className={`text-xs font-bold ${
                activeStep5Tab === 'plans' ? 'text-cognac' : 'text-taupe'
              }`}>
              Active Plans ({allActivePlans.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveStep5Tab('history')}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
              activeStep5Tab === 'history' ? 'shadow-xs bg-white' : ''
            }`}>
            <History size={15} color={activeStep5Tab === 'history' ? '#8C4522' : '#8C7C70'} />
            <Text
              className={`text-xs font-bold ${
                activeStep5Tab === 'history' ? 'text-cognac' : 'text-taupe'
              }`}>
              Plot History ({historicalPlans.length})
            </Text>
          </Pressable>
        </View>

        <ScrollView className="mb-6 flex-1">
          {activeStep5Tab === 'plans' ? (
            <>
              {allActivePlans.length === 0 ? (
                <View className="items-center justify-center rounded-[28px] border border-dashed border-taupe/30 bg-white/70 p-8">
                  <Sprout size={36} color="#8C7C70" />
                  <Text className="mt-3 text-base font-bold text-espresso">No Active Plans</Text>
                  <Text className="mt-1 text-center text-xs leading-4 text-taupe">
                    All plots are currently idle. Tap &quot;Create New Plan&quot; to plant a new
                    crop cycle.
                  </Text>
                </View>
              ) : null}

              {generalPlans.length > 0 && (
                <View className="mb-8">
                  <Text className="mb-3 text-lg font-bold text-espresso">General Farm Plans</Text>
                  {generalPlans.map((plan, index) => {
                    const planStatus = getPlanStatus(plan);
                    return (
                      <View key={`general-${index}`} className="mb-6">
                        <View className="mb-2 flex-row items-center justify-between">
                          <View className="flex-row flex-wrap items-center gap-2">
                            <Text className="text-xs font-bold uppercase tracking-wider text-cognac">
                              Whole Farm Succession
                            </Text>
                            {plan.selectedCrops?.length === 1 ? (
                              <View className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5">
                                <Text className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                  Single Crop
                                </Text>
                              </View>
                            ) : (
                              <View className="rounded-md border border-cognac/30 bg-cognac/10 px-2 py-0.5">
                                <Text className="text-[10px] font-bold uppercase tracking-wider text-cognac">
                                  {`${plan.selectedCrops?.length || 0} Crops Rotation`}
                                </Text>
                              </View>
                            )}
                            {renderPlanStatusBadge(plan)}
                          </View>

                          <View className="flex-row items-center gap-2">
                            {permissions.canEditCropPlan && (
                              <>
                                {planStatus === 'ongoing' && (
                                  <Pressable
                                    onPress={() => handleOpenStopPlanModal(plan)}
                                    className="shadow-xs flex-row items-center gap-1 rounded-xl border border-rose-300 bg-rose-50 px-2.5 py-1.5 active:scale-95">
                                    <CircleAlert size={12} color="#E11D48" />
                                    <Text className="text-xs font-bold text-rose-700">Stop Cycle</Text>
                                  </Pressable>
                                )}
                                {planStatus === 'finished' && (
                                  <Pressable
                                    onPress={() => handleContinuePlanting(plan)}
                                    className="shadow-xs flex-row items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-600 px-3 py-1.5 active:scale-95">
                                    <Sprout size={12} color="#FFFFFF" />
                                    <Text className="text-xs font-bold text-white">
                                      Continue Planting
                                    </Text>
                                  </Pressable>
                                )}
                                <Pressable
                                  onPress={() => handleResetupPlan(plan)}
                                  hitSlop={8}
                                  accessibilityLabel="Delete plan"
                                  accessibilityRole="button"
                                  className="shadow-xs flex-row items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 active:scale-95">
                                  <Trash2 size={13} color="#E11D48" />
                                  <Text className="text-xs font-bold text-rose-600">Delete Plan</Text>
                                </Pressable>
                              </>
                            )}
                          </View>
                        </View>
                        {renderPlanRows(plan, `general-${index}`, true)}
                      </View>
                    );
                  })}
                </View>
              )}

              {specificPlans.map((plan, index) => {
                const plotNames = plan
                  .targetPlots!.map((id) => allPlotsMap[id] || 'Unknown Plot')
                  .join(', ');
                const planStatus = getPlanStatus(plan);

                return (
                  <View key={`specific-${index}`} className="mb-8">
                    <View className="mb-3 flex-row items-center justify-between">
                      <View className="flex-1 flex-row flex-wrap items-center gap-2">
                        <Text className="text-lg font-bold text-espresso">Plot: {plotNames}</Text>
                        {plan.selectedCrops?.length === 1 ? (
                          <View className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5">
                            <Text className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                              Single Crop
                            </Text>
                          </View>
                        ) : (
                          <View className="rounded-md border border-cognac/30 bg-cognac/10 px-2 py-0.5">
                            <Text className="text-[10px] font-bold uppercase tracking-wider text-cognac">
                              {`${plan.selectedCrops?.length || 0} Crops Rotation`}
                            </Text>
                          </View>
                        )}
                        {renderPlanStatusBadge(plan)}
                      </View>

                      <View className="ml-2 flex-row items-center gap-1.5">
                        {permissions.canEditCropPlan && (
                          <>
                            {planStatus === 'ongoing' && (
                              <Pressable
                                onPress={() => handleOpenStopPlanModal(plan)}
                                className="shadow-xs flex-row items-center gap-1 rounded-xl border border-rose-300 bg-rose-50 px-2.5 py-1.5 active:scale-95">
                                <CircleAlert size={12} color="#E11D48" />
                                <Text className="text-xs font-bold text-rose-700">Stop Cycle</Text>
                              </Pressable>
                            )}
                            {planStatus === 'finished' && (
                              <Pressable
                                onPress={() => handleContinuePlanting(plan)}
                                className="shadow-xs flex-row items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-600 px-3 py-1.5 active:scale-95">
                                <Sprout size={12} color="#FFFFFF" />
                                <Text className="text-xs font-bold text-white">Continue</Text>
                              </Pressable>
                            )}
                            <Pressable
                              onPress={() => handleResetupPlan(plan)}
                              hitSlop={8}
                              accessibilityLabel="Delete plan cycle"
                              accessibilityRole="button"
                              className="shadow-xs flex-row items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 active:scale-95">
                              <Trash2 size={13} color="#E11D48" />
                              <Text className="text-xs font-bold text-rose-600">Delete</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    </View>
                    <View className="mb-4">{renderPlanRows(plan, `specific-${index}`, true)}</View>
                  </View>
                );
              })}

              {permissions.canEditCropPlan && allActivePlans.length > 1 && (
                <Pressable
                  onPress={handleResetPlan}
                  className="mb-10 mt-4 flex-row items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 py-3.5 active:scale-95">
                  <Trash2 size={15} color="#E11D48" />
                  <Text className="text-xs font-bold text-rose-600">Clear All Farm Plans</Text>
                </Pressable>
              )}
            </>
          ) : (
            /* Historical Plans View */
            <View>
              {historicalPlans.length === 0 ? (
                <View className="items-center justify-center rounded-[28px] border border-dashed border-taupe/30 bg-white/70 p-8">
                  <History size={36} color="#8C7C70" />
                  <Text className="mt-3 text-base font-bold text-espresso">
                    No Crop History Yet
                  </Text>
                  <Text className="mt-1 text-center text-xs leading-4 text-taupe">
                    Completed harvest cycles and stopped plantings will automatically appear here.
                  </Text>
                </View>
              ) : (
                historicalPlans.map((histPlan, hIdx) => {
                  const plotNames =
                    histPlan.targetPlots && histPlan.targetPlots.length > 0
                      ? histPlan.targetPlots
                          .map((id: string) => allPlotsMap[id] || 'Unknown Plot')
                          .join(', ')
                      : 'Whole Farm';
                  const isTerminated = histPlan.status === 'terminated';

                  return (
                    <View
                      key={`hist-${hIdx}`}
                      className="mb-6 rounded-[28px] border border-taupe/20 bg-white/95 p-5 shadow-sm">
                      <View className="mb-3 flex-row items-center justify-between">
                        <View className="flex-1 flex-row flex-wrap items-center gap-2">
                          <Text className="text-base font-bold text-espresso">
                            Plot: {plotNames}
                          </Text>
                          {isTerminated ? (
                            <View className="flex-row items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5">
                              <CircleAlert size={10} color="#E11D48" />
                              <Text className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                                Stopped Early
                              </Text>
                            </View>
                          ) : (
                            <View className="flex-row items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5">
                              <CheckCircle2 size={10} color="#059669" />
                              <Text className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                Completed Harvest
                              </Text>
                            </View>
                          )}
                        </View>

                        <Pressable
                          onPress={() => handleContinuePlanting(histPlan)}
                          className="shadow-2xs flex-row items-center gap-1 rounded-xl border border-cognac/30 bg-champagne px-2.5 py-1.5 active:scale-95">
                          <RotateCcw size={12} color="#8C4522" />
                          <Text className="text-xs font-bold text-cognac">Replant Plot</Text>
                        </Pressable>
                      </View>

                      {isTerminated && histPlan.terminationReason && (
                        <View className="mb-3 flex-row items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/80 p-2.5">
                          <CircleAlert size={14} color="#E11D48" className="mt-0.5" />
                          <View className="flex-1">
                            <Text className="text-[11px] font-bold text-rose-800">
                              Reason for stopping:
                            </Text>
                            <Text className="mt-0.5 text-xs leading-4 text-rose-700">
                              {histPlan.terminationReason}
                            </Text>
                          </View>
                        </View>
                      )}

                      <View className="rounded-2xl bg-champagne/60 p-3">
                        <Text className="mb-1.5 text-xs font-semibold text-taupe">
                          Planted: {histPlan.startDate} · {histPlan.selectedCrops?.length || 1}{' '}
                          Crop(s)
                        </Text>
                        <View className="flex-row flex-wrap gap-1.5">
                          {(histPlan.selectedCrops || []).map((c: any, cIdx: number) => (
                            <View
                              key={cIdx}
                              className="flex-row items-center gap-1 rounded-lg border border-taupe/20 bg-white px-2 py-1">
                              <Sprout size={12} color="#8C4522" />
                              <Text className="text-xs font-bold text-espresso">{c.crop}</Text>
                              {c.family && (
                                <Text className="text-[10px] text-taupe">({c.family})</Text>
                              )}
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>

        {/* Stop Plan Early Modal */}
        <Modal
          visible={Boolean(planToStop)}
          transparent
          animationType="fade"
          onRequestClose={() => setPlanToStop(null)}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View className="backdrop-blur-xs flex-1 items-center justify-center bg-black/60 px-5">
              <Pressable
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                onPress={() => setPlanToStop(null)}
              />
              <View className="w-full max-w-md rounded-[32px] border border-taupe/20 bg-champagne p-6 shadow-2xl">
              <View className="mb-4 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2.5">
                  <View className="h-10 w-10 items-center justify-center rounded-2xl bg-rose-100">
                    <CircleAlert size={22} color="#E11D48" />
                  </View>
                  <View>
                    <Text className="text-xl font-black text-espresso">Stop Crop Cycle</Text>
                    <Text className="text-xs text-taupe">Record incident & free plot</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setPlanToStop(null)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-taupe/15">
                  <X size={16} color="#8C7C70" />
                </Pressable>
              </View>

              <Text className="mb-4 text-xs leading-5 text-taupe">
                Select the reason why this planting cycle is ending early. This incident will be
                permanently logged in your farm&apos;s activity history and the plot will be cleared
                for new planting.
              </Text>

              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-espresso">
                Incident Category
              </Text>
              <View className="mb-4 flex-row flex-wrap gap-2">
                {[
                  'Typhoon / Flood',
                  'Pest / Disease Outbreak',
                  'Drought / Heat Wave',
                  'Crop Failure',
                  'Manual Harvest Early',
                  'Other Reason',
                ].map((tag) => {
                  const isSelected = stopReasonTag === tag;
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => setStopReasonTag(tag)}
                      className={`rounded-xl border px-3 py-1.5 active:scale-95 ${
                        isSelected
                          ? 'shadow-2xs border-rose-400 bg-rose-100/90'
                          : 'border-taupe/25 bg-white'
                      }`}>
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-rose-700' : 'text-espresso'
                        }`}>
                        {tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-espresso">
                Incident Details / Notes
              </Text>
              <TextInput
                value={stopReasonNotes}
                onChangeText={setStopReasonNotes}
                multiline
                numberOfLines={3}
                maxLength={3000}
                placeholder="e.g. Typhoon Enteng flooded Bed 1 and washed away the seedlings."
                placeholderTextColor="#8C7C70"
                className="mb-5 rounded-2xl border border-taupe/30 bg-white p-3.5 text-sm text-espresso"
                style={{ minHeight: 75, textAlignVertical: 'top' }}
              />

              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => setPlanToStop(null)}
                  disabled={isStoppingPlan}
                  className="flex-1 rounded-2xl border border-taupe/30 bg-white py-3.5 active:scale-95">
                  <Text className="text-center text-sm font-bold text-espresso">Keep Plan</Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirmStopPlan}
                  disabled={isStoppingPlan}
                  className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-rose-600 py-3.5 shadow-sm active:scale-95">
                  {isStoppingPlan ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <CircleAlert size={14} color="#FFFFFF" />
                      <Text className="text-center text-sm font-bold text-white">Stop Cycle</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </View>
    );
  };

  if (step === 2) {
    return renderStep2();
  }

  if (step === 3) {
    return renderStep3();
  }

  if (step === 5) {
    return renderStep5();
  }

  return renderStep1();
}
