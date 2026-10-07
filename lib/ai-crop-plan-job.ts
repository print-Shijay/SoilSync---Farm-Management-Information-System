import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateCropSuccessionPlan, AiCropSuccessionResult } from './gemini';
import {
  Crop,
  Milestone,
  CropRotationSeason,
  findCropByName,
  parseMaturityDays,
  inferCropBotanicalProfile,
  generateDefaultMilestones,
  loadCropDetails,
} from './crop-planner';
import { recordAiGenerationUsage } from './ai-usage-limit';
import { sendInstantNotification } from './notifications/notification-service';

export const STORAGE_AI_JOBS_KEY = 'soilsync:ai_crop_plan_jobs';

export interface AiCropPlanResult {
  aiClimateSummary: string | null;
  matchedCrops: Crop[];
  usedDays: number;
  totalDays: number;
  targetPlots: string[];
  startDate: string;
  season: CropRotationSeason;
}

export interface AiCropPlanJob {
  id: string;
  farmId: string;
  userId?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'cancelled';
  targetPlots: string[];
  targetPlotNames?: string[];
  durationDays: number;
  season: CropRotationSeason;
  startDate: string;
  progress: number;
  stage: string;
  subtitle: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  result?: AiCropPlanResult;
}

export interface StartAiJobParams {
  farmId: string;
  userId?: string;
  durationDays: number;
  season: CropRotationSeason;
  startDate: Date;
  allCrops: Crop[];
  previousCropContext?: Crop | null;
  targetPlots: string[];
  targetPlotNames?: string[];
}

type JobListener = (job: AiCropPlanJob) => void;
const listeners = new Set<JobListener>();

// Active in-memory jobs and cancellation flags
const activeJobsMap = new Map<string, AiCropPlanJob>();
const cancelledJobsSet = new Set<string>();

export function subscribeToAiJob(callback: JobListener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notifyJobUpdate(job: AiCropPlanJob) {
  activeJobsMap.set(job.farmId, job);
  listeners.forEach((listener) => {
    try {
      listener(job);
    } catch (err) {
      console.warn('[AiCropPlanJob] Error in job listener:', err);
    }
  });
}

/**
 * Load all stored jobs from AsyncStorage
 */
async function loadStoredJobs(): Promise<Record<string, AiCropPlanJob>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_AI_JOBS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Persist a job into AsyncStorage
 */
async function persistJob(job: AiCropPlanJob): Promise<void> {
  try {
    const all = await loadStoredJobs();
    all[job.farmId] = job;
    await AsyncStorage.setItem(STORAGE_AI_JOBS_KEY, JSON.stringify(all));
  } catch (err) {
    console.warn('[AiCropPlanJob] Failed to persist job:', err);
  }
}

/**
 * Processes raw AI rotation items into full Crop models with milestones
 */
export function processAiPlanResult(
  aiResult: AiCropSuccessionResult,
  allCrops: Crop[],
  season: CropRotationSeason,
  durationDays: number,
  targetPlots: string[],
  startDateStr: string
): AiCropPlanResult {
  const matchedCrops: Crop[] = [];
  let usedDays = 0;

  for (const item of aiResult.rotationPlan) {
    let catalogCrop = findCropByName(allCrops, item.cropName);
    const duration =
      item.maturityDays ||
      (catalogCrop ? parseMaturityDays(catalogCrop.maturity_days) || 30 : 45);

    const aiMilestones: Milestone[] =
      Array.isArray(item.milestones) && item.milestones.length > 0
        ? item.milestones.map((m) => ({
            label:
              m.label === 'preparation' || m.label === 'growth' || m.label === 'checkup'
                ? m.label
                : 'growth',
            offset_days: Math.min(Math.max(0, m.offsetDays || 0), duration),
            title: m.title || 'Organic Care Task',
            description: m.description || '',
          }))
        : [];

    if (!catalogCrop) {
      const inferred = inferCropBotanicalProfile(item.cropName);
      catalogCrop = {
        crop: item.cropName,
        family: item.botanicalFamily || inferred?.family || 'Organic Rotation',
        type: 'vegetable',
        maturity_days: `${duration}`,
        season: season || 'Year-round',
        nitrogen_demand: inferred?.nitrogenDemand || 'Medium',
        soil_benefit: item.agronomicReason || item.reason,
        notes: item.climateReason,
        is_custom: true,
        milestone_mode: 'system',
        milestones:
          aiMilestones.length > 0
            ? aiMilestones
            : generateDefaultMilestones(item.cropName, duration),
      };
    } else {
      const detail = loadCropDetails(catalogCrop);
      const baseMilestones =
        aiMilestones.length > 0
          ? aiMilestones
          : catalogCrop.milestones && catalogCrop.milestones.length > 0
            ? catalogCrop.milestones
            : detail?.milestones || generateDefaultMilestones(catalogCrop.crop, duration);

      catalogCrop = {
        ...catalogCrop,
        family: item.botanicalFamily || catalogCrop.family,
        soil_benefit: item.agronomicReason || item.reason || catalogCrop.soil_benefit,
        notes: item.climateReason || catalogCrop.notes,
        milestone_mode: 'system',
        milestones: JSON.parse(JSON.stringify(baseMilestones)),
      };
    }

    const cropDuration = parseMaturityDays(catalogCrop.maturity_days) || 30;
    matchedCrops.push(catalogCrop);
    usedDays += cropDuration;
  }

  return {
    aiClimateSummary: aiResult.climateSummary || null,
    matchedCrops,
    usedDays,
    totalDays: durationDays,
    targetPlots,
    startDate: startDateStr,
    season,
  };
}

/**
 * Starts a new background AI Crop Planner job.
 * Runs asynchronously and persists status to AsyncStorage so the user can navigate away.
 */
export async function startAiCropPlanJob(params: StartAiJobParams): Promise<AiCropPlanJob> {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  cancelledJobsSet.delete(params.farmId);

  const initialJob: AiCropPlanJob = {
    id: jobId,
    farmId: params.farmId,
    userId: params.userId,
    status: 'generating',
    targetPlots: params.targetPlots,
    targetPlotNames: params.targetPlotNames,
    durationDays: params.durationDays,
    season: params.season,
    startDate: params.startDate.toISOString(),
    progress: 10,
    stage: 'Analyzing Laguna Agro-Ecology...',
    subtitle: 'Connecting to microclimate models and seasonal monsoons...',
    startedAt: new Date().toISOString(),
  };

  activeJobsMap.set(params.farmId, initialJob);
  notifyJobUpdate(initialJob);
  await persistJob(initialJob);

  // Background execution runner
  void (async () => {
    let currentProgress = 10;
    const progressInterval = setInterval(() => {
      if (cancelledJobsSet.has(params.farmId)) {
        clearInterval(progressInterval);
        return;
      }

      currentProgress = Math.min(currentProgress + 4, 92);
      let stage = initialJob.stage;
      let subtitle = initialJob.subtitle;

      if (currentProgress >= 25 && currentProgress < 55) {
        stage = 'Balancing Soil Nutrients & Succession Biology...';
        subtitle = 'Evaluating nitrogen replenishment and botanical family rotation...';
      } else if (currentProgress >= 55 && currentProgress < 80) {
        stage = 'Generating Organic Care Milestones...';
        subtitle = 'Formulating biological pest disruptions and task schedules...';
      } else if (currentProgress >= 80) {
        stage = 'Finalizing Crop Succession Plan...';
        subtitle = 'Synthesizing agronomic recommendations for your beds...';
      }

      const updated: AiCropPlanJob = {
        ...initialJob,
        status: 'generating',
        progress: currentProgress,
        stage,
        subtitle,
      };
      notifyJobUpdate(updated);
    }, 2500);

    try {
      console.log(`[AiCropPlanJob] Started generation for farm ${params.farmId} (job ${jobId})...`);

      const aiResult = await generateCropSuccessionPlan(
        params.durationDays,
        params.season,
        params.startDate,
        params.allCrops,
        params.previousCropContext
      );

      clearInterval(progressInterval);

      if (cancelledJobsSet.has(params.farmId)) {
        console.log(`[AiCropPlanJob] Job ${jobId} was cancelled by user.`);
        const cancelledJob: AiCropPlanJob = {
          ...initialJob,
          status: 'cancelled',
          progress: 0,
          stage: 'Cancelled',
          subtitle: 'Generation was cancelled.',
        };
        notifyJobUpdate(cancelledJob);
        await persistJob(cancelledJob);
        return;
      }

      const planResult = processAiPlanResult(
        aiResult,
        params.allCrops,
        params.season,
        params.durationDays,
        params.targetPlots,
        params.startDate.toISOString()
      );

      if (planResult.matchedCrops.length === 0) {
        throw new Error('No matching crops found in catalog for generated rotation.');
      }

      // Record monthly AI quota usage
      try {
        await recordAiGenerationUsage(params.userId);
      } catch (quotaErr) {
        console.warn('[AiCropPlanJob] Quota recording error:', quotaErr);
      }

      const completedJob: AiCropPlanJob = {
        ...initialJob,
        status: 'completed',
        progress: 100,
        stage: 'Succession Plan Ready!',
        subtitle: 'Tap to review recommendations and care milestones.',
        completedAt: new Date().toISOString(),
        result: planResult,
      };

      notifyJobUpdate(completedJob);
      await persistJob(completedJob);

      // Dispatch local push notification
      const plotLabel =
        params.targetPlotNames && params.targetPlotNames.length > 0
          ? ` for ${params.targetPlotNames.join(', ')}`
          : '';

      console.log(`[AiCropPlanJob] Dispatched push notification for farm ${params.farmId}`);
      await sendInstantNotification(
        '🌾 AI Crop Succession Plan Ready!',
        `Your organic crop succession plan${plotLabel} is ready. Tap to review recommendations & care tasks.`,
        {
          type: 'ai_crop_plan_ready',
          farmId: params.farmId,
          jobId: completedJob.id,
        },
        'soilsync-activity'
      );
    } catch (err: any) {
      clearInterval(progressInterval);
      console.error(`[AiCropPlanJob] Error generating crop plan:`, err);

      if (cancelledJobsSet.has(params.farmId)) return;

      const failedJob: AiCropPlanJob = {
        ...initialJob,
        status: 'failed',
        progress: 0,
        stage: 'Generation Failed',
        subtitle: err?.message || 'Could not generate succession plan.',
        error: err?.message || 'Unknown error occurred.',
      };

      notifyJobUpdate(failedJob);
      await persistJob(failedJob);
    }
  })();

  return initialJob;
}

/**
 * Retrieves the active generating job for a farm, if any.
 */
export async function getActiveAiJob(farmId: string): Promise<AiCropPlanJob | null> {
  const inMemory = activeJobsMap.get(farmId);
  if (inMemory && inMemory.status === 'generating') {
    return inMemory;
  }

  const stored = await loadStoredJobs();
  const job = stored[farmId];
  if (job && job.status === 'generating') {
    // Check if job is stale (e.g. older than 15 minutes)
    const started = new Date(job.startedAt).getTime();
    if (Date.now() - started > 15 * 60 * 1000) {
      job.status = 'failed';
      job.error = 'Job timed out in background.';
      await persistJob(job);
      return null;
    }
    activeJobsMap.set(farmId, job);
    return job;
  }

  return null;
}

/**
 * Retrieves the completed job for a farm awaiting user review.
 */
export async function getCompletedAiJob(farmId: string): Promise<AiCropPlanJob | null> {
  const inMemory = activeJobsMap.get(farmId);
  if (inMemory && inMemory.status === 'completed') {
    return inMemory;
  }

  const stored = await loadStoredJobs();
  const job = stored[farmId];
  if (job && job.status === 'completed') {
    activeJobsMap.set(farmId, job);
    return job;
  }

  return null;
}

/**
 * Cancels an active job for a farm.
 */
export async function cancelAiJob(farmId: string): Promise<void> {
  cancelledJobsSet.add(farmId);
  const current = activeJobsMap.get(farmId);
  if (current) {
    const cancelled: AiCropPlanJob = {
      ...current,
      status: 'cancelled',
      progress: 0,
      stage: 'Cancelled',
      subtitle: 'Generation was cancelled.',
    };
    notifyJobUpdate(cancelled);
    await persistJob(cancelled);
  }
}

/**
 * Dismisses/clears a completed or failed job once consumed by the UI.
 */
export async function clearAiJob(farmId: string): Promise<void> {
  activeJobsMap.delete(farmId);
  cancelledJobsSet.delete(farmId);

  try {
    const all = await loadStoredJobs();
    if (all[farmId]) {
      delete all[farmId];
      await AsyncStorage.setItem(STORAGE_AI_JOBS_KEY, JSON.stringify(all));
    }
  } catch (err) {
    console.warn('[AiCropPlanJob] Failed to clear job:', err);
  }
}
