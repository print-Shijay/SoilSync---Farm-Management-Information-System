import AsyncStorage from '@react-native-async-storage/async-storage';
import { type PhaseLabel } from './todo-list-engine';
import { getDatabase } from './local-db';
import cropsDataFallback from '../crops.json';
import { supabase } from './supabase';

export interface Crop {
  id?: string;
  crop: string;
  local_name?: string;
  family?: string;
  type: string;
  maturity_days: string;
  planting_months?: number[];
  season: string;
  nitrogen_contribution?: string | null;
  nitrogen_demand?: string;
  soil_benefit?: string;
  succession_after?: string;
  succession_before?: string;
  organic_compatible?: string;
  notes?: string;
  milestones?: Milestone[];
  is_custom?: boolean;
  created_by?: string;
  milestone_mode?: 'system' | 'custom';
}

export interface Milestone {
  label: PhaseLabel;
  offset_days: number;
  title: string;
  description: string;
}

export interface CropDetail {
  crop: string;
  milestones: Milestone[];
}

export function normalizeCropName(cropName?: string | null): string {
  if (!cropName || typeof cropName !== 'string') {
    return '';
  }
  return cropName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CROP_NAME_ALIASES: Record<string, string> = {
  [normalizeCropName('Broccoli Microgreens')]: normalizeCropName('Broccoli microgreens'),
  [normalizeCropName('Broccoli migrogreens')]: normalizeCropName('Broccoli microgreens'),
  [normalizeCropName('Broccoli microgreens custom')]: normalizeCropName('Broccoli microgreens'),
  [normalizeCropName('Broccoli migrogreens custom')]: normalizeCropName('Broccoli microgreens'),
  [normalizeCropName('Lettuce Green Ice')]: normalizeCropName('Green Ice lettuce'),
  [normalizeCropName('Lettuce (Green Ice)')]: normalizeCropName('Green Ice lettuce'),
  [normalizeCropName('Geen ice lettuce')]: normalizeCropName('Green Ice lettuce'),
  [normalizeCropName('Geen ice lettuce custom')]: normalizeCropName('Green Ice lettuce'),
  [normalizeCropName('Green ice lettuce custom')]: normalizeCropName('Green Ice lettuce'),
  [normalizeCropName('Lettuce Romaine')]: normalizeCropName('Romaine lettuce'),
  [normalizeCropName('Lettuce (Romaine)')]: normalizeCropName('Romaine lettuce'),
  [normalizeCropName('Romaine lettuce custom')]: normalizeCropName('Romaine lettuce'),
  [normalizeCropName('Pechay')]: normalizeCropName('Native pechay'),
  [normalizeCropName('Pechay custom')]: normalizeCropName('Native pechay'),
  [normalizeCropName('Native pechay custom')]: normalizeCropName('Native pechay'),
  [normalizeCropName('Kangkong')]: normalizeCropName('Upland kangkong'),
  [normalizeCropName('Kangkong custom')]: normalizeCropName('Upland kangkong'),
  [normalizeCropName('Mint')]: normalizeCropName('Mint/Yerba Buena'),
  [normalizeCropName('Yerba Buena')]: normalizeCropName('Mint/Yerba Buena'),
  [normalizeCropName('Lady Finger Okra')]: normalizeCropName('Okra'),
  [normalizeCropName("Lady's Finger (Okra)")]: normalizeCropName('Okra'),
  [normalizeCropName('Okra custom')]: normalizeCropName('Okra'),
  [normalizeCropName('Sitao')]: normalizeCropName('Sitaw'),
  [normalizeCropName('Pole sitao')]: normalizeCropName('Sitaw'),
  [normalizeCropName('Bush sitao')]: normalizeCropName('Sitaw'),
  [normalizeCropName('Sitaw custom')]: normalizeCropName('Sitaw'),
};

export interface BotanicalProfile {
  family: string;
  nitrogenDemand: 'Low' | 'Medium' | 'High';
  successionBefore?: string;
  successionAfter?: string;
}

export function inferCropBotanicalProfile(cropName?: string | null): BotanicalProfile | null {
  if (!cropName || typeof cropName !== 'string') return null;
  const lower = cropName.toLowerCase();

  // Brassicaceae (Crucifers / Brassicas)
  if (
    lower.includes('broccoli') ||
    lower.includes('pechay') ||
    lower.includes('pak choi') ||
    lower.includes('bok choy') ||
    lower.includes('cabbage') ||
    lower.includes('repolyo') ||
    lower.includes('mustard') ||
    lower.includes('mustasa') ||
    lower.includes('radish') ||
    lower.includes('labanos') ||
    lower.includes('kale') ||
    lower.includes('cauliflower')
  ) {
    return {
      family: 'Brassicaceae',
      nitrogenDemand: lower.includes('microgreen') || lower.includes('migrogreen') ? 'Low' : 'Medium',
      successionBefore: 'Sitaw, Bush beans, Pole sitao, Cucumber, Okra',
      successionAfter: 'Sitaw, Cucumber, Okra',
    };
  }

  // Asteraceae (Lettuces / Compositae)
  if (
    lower.includes('lettuce') ||
    lower.includes('litsugas') ||
    lower.includes('green ice') ||
    lower.includes('romaine') ||
    lower.includes('sunflower')
  ) {
    return {
      family: 'Asteraceae',
      nitrogenDemand: 'Medium',
      successionBefore: 'Sitaw, Bush beans, Pole sitao, Cucumber, Okra',
      successionAfter: 'Cucumber, Okra',
    };
  }

  // Solanaceae (Nightshades)
  if (
    lower.includes('tomato') ||
    lower.includes('kamatis') ||
    lower.includes('eggplant') ||
    lower.includes('talong') ||
    lower.includes('pepper') ||
    lower.includes('sili') ||
    lower.includes('bell pepper') ||
    lower.includes('potato') ||
    lower.includes('patatas')
  ) {
    return {
      family: 'Solanaceae',
      nitrogenDemand: 'High',
      successionBefore: 'Sitaw, Bush beans, Pole sitao, Native pechay, Green Ice lettuce',
      successionAfter: 'Sitaw, Bush beans',
    };
  }

  // Fabaceae / Leguminosae (Legumes - Nitrogen Fixers)
  if (
    lower.includes('sitaw') ||
    lower.includes('sitao') ||
    lower.includes('bean') ||
    lower.includes('beans') ||
    lower.includes('habichuelas') ||
    lower.includes('mung') ||
    lower.includes('monggo') ||
    lower.includes('mungbean') ||
    lower.includes('peanut') ||
    lower.includes('mani') ||
    lower.includes('bataw') ||
    lower.includes('patani') ||
    lower.includes('pea') ||
    lower.includes('peas')
  ) {
    return {
      family: 'Fabaceae',
      nitrogenDemand: 'Low',
      successionBefore: 'Native pechay, Green Ice lettuce, Romaine lettuce, Tomato, Eggplant, Okra, Cabbage',
      successionAfter: 'Tomato, Eggplant, Native pechay, Cabbage',
    };
  }

  // Malvaceae
  if (lower.includes('okra') || lower.includes('lady finger')) {
    return {
      family: 'Malvaceae',
      nitrogenDemand: 'Medium',
      successionBefore: 'Sitaw, Green Ice lettuce, Native pechay',
      successionAfter: 'Sitaw',
    };
  }

  // Cucurbitaceae (Cucurbits / Gourds)
  if (
    lower.includes('cucumber') ||
    lower.includes('pipino') ||
    lower.includes('squash') ||
    lower.includes('kalabasa') ||
    lower.includes('ampalaya') ||
    lower.includes('bitter melon') ||
    lower.includes('patola') ||
    lower.includes('sayote') ||
    lower.includes('watermelon') ||
    lower.includes('melon') ||
    lower.includes('upo')
  ) {
    return {
      family: 'Cucurbitaceae',
      nitrogenDemand: 'Medium',
      successionBefore: 'Sitaw, Native pechay, Green Ice lettuce',
      successionAfter: 'Sitaw',
    };
  }

  // Convolvulaceae
  if (
    lower.includes('kangkong') ||
    lower.includes('sweet potato') ||
    lower.includes('camote') ||
    lower.includes('kamote')
  ) {
    return {
      family: 'Convolvulaceae',
      nitrogenDemand: 'Low',
      successionBefore: 'Sitaw, Native pechay, Green Ice lettuce',
      successionAfter: 'Sitaw',
    };
  }

  // Amaranthaceae
  if (
    lower.includes('spinach') ||
    lower.includes('kulitis') ||
    lower.includes('alugbati') ||
    lower.includes('beet')
  ) {
    return {
      family: 'Amaranthaceae',
      nitrogenDemand: 'Medium',
      successionBefore: 'Sitaw, Bush beans, Green Ice lettuce',
      successionAfter: 'Sitaw',
    };
  }

  // Lamiaceae
  if (
    lower.includes('mint') ||
    lower.includes('yerba buena') ||
    lower.includes('basil') ||
    lower.includes('oregano')
  ) {
    return {
      family: 'Lamiaceae',
      nitrogenDemand: 'Low',
      successionBefore: 'Sitaw, Native pechay, Green Ice lettuce',
      successionAfter: 'Sitaw',
    };
  }

  // Apiaceae
  if (
    lower.includes('carrot') ||
    lower.includes('karot') ||
    lower.includes('celery') ||
    lower.includes('kinchay') ||
    lower.includes('coriander') ||
    lower.includes('wansoy')
  ) {
    return {
      family: 'Apiaceae',
      nitrogenDemand: 'Medium',
      successionBefore: 'Sitaw, Native pechay, Green Ice lettuce',
      successionAfter: 'Sitaw',
    };
  }

  return null;
}

function getCanonicalCropName(cropName?: string | null): string {
  if (!cropName || typeof cropName !== 'string') {
    return '';
  }
  const normalizedCropName = normalizeCropName(cropName);
  if (!normalizedCropName) {
    return '';
  }
  if (CROP_NAME_ALIASES[normalizedCropName]) {
    return CROP_NAME_ALIASES[normalizedCropName];
  }

  // Keyword stem fallback for custom crop names
  if (normalizedCropName.includes('broccoli')) return normalizeCropName('Broccoli microgreens');
  if (normalizedCropName.includes('green ice')) return normalizeCropName('Green Ice lettuce');
  if (normalizedCropName.includes('romaine')) return normalizeCropName('Romaine lettuce');
  if (normalizedCropName.includes('pechay') || normalizedCropName.includes('pak choi') || normalizedCropName.includes('bok choy')) {
    return normalizeCropName('Native pechay');
  }
  if (normalizedCropName.includes('kangkong')) return normalizeCropName('Upland kangkong');
  if (normalizedCropName.includes('sitao') || normalizedCropName.includes('sitaw')) {
    return normalizeCropName('Sitaw');
  }
  if (normalizedCropName.includes('okra')) return normalizeCropName('Okra');
  if (normalizedCropName.includes('kamatis') || normalizedCropName.includes('tomato')) {
    return normalizeCropName('Tomato');
  }

  return normalizedCropName;
}

export function findCropByName(crops: Crop[], cropName?: string | null): Crop | undefined {
  if (!cropName || !Array.isArray(crops)) {
    return undefined;
  }
  const targetCropName = getCanonicalCropName(cropName);
  if (!targetCropName) {
    return undefined;
  }

  return crops.find((crop) => crop && getCanonicalCropName(crop.crop) === targetCropName);
}

export function parseMaturityDays(daysStr?: string | null): number {
  if (!daysStr || typeof daysStr !== 'string') {
    return 0;
  }

  const parts = daysStr.split('-');
  const lastPart = parts[parts.length - 1];
  const parsed = Number.parseInt(lastPart.replace(/[^0-9]/g, ''), 10);

  return Number.isNaN(parsed) ? 0 : parsed;
}

export function filterCropsBySeason(crops: Crop[], season?: string): Crop[] {
  if (!Array.isArray(crops)) return [];
  if (!season || season === 'Both' || season === 'All') {
    return crops;
  }

  return crops.filter((crop) => {
    if (!crop || !crop.crop) return false;
    if (!crop.season) {
      return true;
    }

    const cropSeason = crop.season.toLowerCase();
    const targetSeason = season.toLowerCase();

    if (cropSeason.includes('both') || cropSeason.includes('year-round')) {
      return true;
    }

    return cropSeason.includes(targetSeason);
  });
}

/**
 * Parse a comma-separated succession field (e.g. "Cucumber, Okra") into
 * a Set of canonical crop names for O(1) lookup.
 *
 * Returns `null` when the field is empty/undefined, which means "no
 * constraint" (accept any crop).
 */
function parseSuccessionCropNames(field?: string | null): Set<string> | null {
  if (!field || typeof field !== 'string' || !field.trim()) {
    return null; // no constraint — accept any crop
  }

  const names = new Set<string>();
  for (const part of field.split(',')) {
    const trimmed = part.trim();
    if (trimmed) {
      const canonical = getCanonicalCropName(trimmed);
      if (canonical) {
        names.add(canonical);
      }
    }
  }

  return names.size > 0 ? names : null;
}

export function getAvailableCrops(
  allCrops: Crop[],
  previousCropOrList?: Crop | Crop[],
  remainingDays?: number,
  season?: string
): Crop[] {
  if (!Array.isArray(allCrops)) return [];

  // Resolve previous crop if an array was passed
  let previousCrop: Crop | undefined;
  if (Array.isArray(previousCropOrList)) {
    previousCrop =
      previousCropOrList.length > 0
        ? previousCropOrList[previousCropOrList.length - 1]
        : undefined;
  } else {
    previousCrop = previousCropOrList;
  }

  // 1. Season filtering
  let pool = filterCropsBySeason(allCrops, season);

  // 2. Succession rules against previous crop
  if (previousCrop && previousCrop.crop) {
    const allowedAfterPrevious = parseSuccessionCropNames(previousCrop.succession_before);
    const previousCanonical = getCanonicalCropName(previousCrop.crop);

    pool = pool.filter((crop) => {
      if (!crop || !crop.crop) return false;
      const candidateCanonical = getCanonicalCropName(crop.crop);

      // Never repeat the same crop back-to-back
      if (candidateCanonical && candidateCanonical === previousCanonical) {
        return false;
      }

      const previousAcceptsCurrent =
        allowedAfterPrevious === null ||
        (candidateCanonical ? allowedAfterPrevious.has(candidateCanonical) : true);

      const allowedBeforeCurrent = parseSuccessionCropNames(crop.succession_after);
      const currentAcceptsPrevious =
        allowedBeforeCurrent === null ||
        (previousCanonical ? allowedBeforeCurrent.has(previousCanonical) : true);

      return previousAcceptsCurrent || currentAcceptsPrevious;
    });
  }

  return pool;
}

export interface SuccessionRelationship {
  isDirectSuccessor: boolean;
  isNitrogenRestorer: boolean;
  isSameFamily: boolean;
  score: number;
}

export function getSuccessionRelationship(
  candidateCrop: Crop,
  previousCrop?: Crop | null
): SuccessionRelationship {
  if (!previousCrop || !previousCrop.crop || !candidateCrop || !candidateCrop.crop) {
    return {
      isDirectSuccessor: false,
      isNitrogenRestorer: false,
      isSameFamily: false,
      score: 0,
    };
  }

  const prevProfile = inferCropBotanicalProfile(previousCrop.crop);
  const candProfile = inferCropBotanicalProfile(candidateCrop.crop);

  const prevFamily = (previousCrop.family || prevProfile?.family || '').trim().toLowerCase();
  const candFamily = (candidateCrop.family || candProfile?.family || '').trim().toLowerCase();

  const prevNitrogenDemand =
    previousCrop.nitrogen_demand || prevProfile?.nitrogenDemand || 'Medium';
  const prevSuccessionBefore =
    previousCrop.succession_before || prevProfile?.successionBefore;
  const candSuccessionAfter =
    candidateCrop.succession_after || candProfile?.successionAfter;

  const previousCanonical = getCanonicalCropName(previousCrop.crop);
  const candidateCanonical = getCanonicalCropName(candidateCrop.crop);

  // 1. Direct succession match
  const allowedAfterPrevious = parseSuccessionCropNames(prevSuccessionBefore);
  const allowedBeforeCurrent = parseSuccessionCropNames(candSuccessionAfter);

  const previousAcceptsCurrent =
    allowedAfterPrevious !== null && candidateCanonical
      ? allowedAfterPrevious.has(candidateCanonical)
      : false;

  const currentAcceptsPrevious =
    allowedBeforeCurrent !== null && previousCanonical
      ? allowedBeforeCurrent.has(previousCanonical)
      : false;

  let isDirectSuccessor = previousAcceptsCurrent || currentAcceptsPrevious;

  // Fallback: Check inferred profiles for companion match
  if (!isDirectSuccessor && prevProfile?.successionBefore && candidateCanonical) {
    const fallbackAllowed = parseSuccessionCropNames(prevProfile.successionBefore);
    if (fallbackAllowed?.has(candidateCanonical)) {
      isDirectSuccessor = true;
    }
  }

  // 2. Nitrogen balancing:
  const prevIsHeavyFeeder =
    prevNitrogenDemand === 'High' || prevNitrogenDemand === 'Medium';
  const currIsNitrogenFixer =
    candFamily === 'fabaceae' ||
    candidateCrop.nitrogen_contribution === 'High' ||
    candidateCrop.nitrogen_contribution === 'Medium';

  const isNitrogenRestorer = prevIsHeavyFeeder && currIsNitrogenFixer;

  // 3. Same botanical family:
  const isSameFamily = Boolean(
    prevFamily &&
      candFamily &&
      prevFamily === candFamily
  );

  let score = 0;
  if (isDirectSuccessor) score += 5;
  if (isNitrogenRestorer) score += 3;
  if (isSameFamily) score -= 10;
  if (candidateCanonical && previousCanonical && candidateCanonical === previousCanonical) score -= 20;

  return {
    isDirectSuccessor,
    isNitrogenRestorer,
    isSameFamily,
    score,
  };
}

export function formatCropFilename(cropName?: string | null): string {
  if (!cropName || typeof cropName !== 'string') return '';
  return cropName.trim().replace(/\s+/g, '_');
}

export function generateSimulatedMilestones(selectedCrop: Crop): CropDetail {
  const totalDays = parseMaturityDays(selectedCrop.maturity_days) || 30;

  return {
    crop: selectedCrop.crop,
    milestones: [
      {
        label: 'preparation',
        offset_days: 0,
        title: 'Sowing & Preparation',
        description: `Prepare the soil and plant the ${selectedCrop.crop} seeds or seedlings.`,
      },
      {
        label: 'growth',
        offset_days: Math.floor(totalDays * 0.25),
        title: 'Early Growth Check',
        description: 'Ensure adequate watering and check for early signs of pests.',
      },
      {
        label: 'growth',
        offset_days: Math.floor(totalDays * 0.5),
        title: 'Mid-Growth Phase',
        description: `Apply fertilizer if needed. The ${selectedCrop.crop} should be well established.`,
      },
      {
        label: 'growth',
        offset_days: Math.floor(totalDays * 0.75),
        title: 'Pre-Harvest Monitoring',
        description:
          'Monitor closely as the crop nears maturity. Reduce watering slightly if nearing final harvest for some crops.',
      },
      {
        label: 'growth',
        offset_days: totalDays,
        title: 'Harvest Window',
        description: `The ${selectedCrop.crop} should be ready for harvest around this time.`,
      },
    ],
  };
}

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'object') {
    return value as T;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function loadCropDetails(selectedCrop: Crop): CropDetail {
  if (selectedCrop.milestones && selectedCrop.milestones.length > 0) {
    return {
      crop: selectedCrop.crop,
      milestones: selectedCrop.milestones,
    };
  }

  // If milestones are missing on the object, attempt lookup by crop name from default dataset
  const fallbackCrop = findCropByName(cropsDataFallback as Crop[], selectedCrop.crop);
  if (fallbackCrop?.milestones && fallbackCrop.milestones.length > 0) {
    return {
      crop: selectedCrop.crop,
      milestones: fallbackCrop.milestones,
    };
  }

  return generateSimulatedMilestones(selectedCrop);
}

let cachedCropsMemory: Crop[] | null = null;

export function invalidateCropsCache(): void {
  cachedCropsMemory = null;
}

const PARTNER_CUSTOM_CROPS_STORAGE_KEY = 'soilsync:partner_custom_crops';
const DELETED_CUSTOM_CROPS_PREFIX = 'soilsync:deleted_custom_crops:';

function getDeletedCropsStorageKey(userId?: string): string {
  if (userId && userId.trim()) {
    return `${DELETED_CUSTOM_CROPS_PREFIX}${userId.trim()}`;
  }
  return `${DELETED_CUSTOM_CROPS_PREFIX}global`;
}

export async function getDeletedCustomCropNames(userId?: string): Promise<Set<string>> {
  try {
    const key = getDeletedCropsStorageKey(userId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((name: string) => normalizeCropName(name)));
    }
  } catch (e) {
    console.warn('[CropPlanner] Failed to load deleted custom crops tombstones:', e);
  }
  return new Set<string>();
}

async function recordDeletedCustomCrop(cropName: string, userId?: string): Promise<void> {
  try {
    const key = getDeletedCropsStorageKey(userId);
    const set = await getDeletedCustomCropNames(userId);
    set.add(normalizeCropName(cropName));
    await AsyncStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('[CropPlanner] Failed to record deleted crop tombstone:', e);
  }
}

async function removeDeletedCustomCropTombstone(cropName: string, userId?: string): Promise<void> {
  try {
    const key = getDeletedCropsStorageKey(userId);
    const set = await getDeletedCustomCropNames(userId);
    const norm = normalizeCropName(cropName);
    if (set.has(norm)) {
      set.delete(norm);
      await AsyncStorage.setItem(key, JSON.stringify(Array.from(set)));
    }
  } catch (e) {
    console.warn('[CropPlanner] Failed to remove deleted crop tombstone:', e);
  }
}

export function getCustomCropsStorageKey(userId?: string): string {
  if (userId && userId.trim()) {
    return `soilsync:custom_crops:${userId.trim()}`;
  }
  return PARTNER_CUSTOM_CROPS_STORAGE_KEY;
}

export function duplicateCropForCustomization(baseCrop: Crop): Crop {
  const details = loadCropDetails(baseCrop);
  const duration = parseMaturityDays(baseCrop.maturity_days) || 30;
  const milestones =
    baseCrop.milestones && baseCrop.milestones.length > 0
      ? JSON.parse(JSON.stringify(baseCrop.milestones))
      : JSON.parse(
          JSON.stringify(details?.milestones || generateDefaultMilestones(baseCrop.crop, duration))
        );

  const cleanName = baseCrop.crop.replace(/\s*\(Custom\)\s*$/i, '').trim();
  const newName = `${cleanName} (Custom)`;

  return {
    ...baseCrop,
    crop: newName,
    is_custom: true,
    created_by: 'custom',
    milestones,
  };
}

export function generateDefaultMilestones(cropName: string, maturityDays: number): Milestone[] {
  const days = Math.max(10, maturityDays || 30);
  const midPoint = Math.floor(days * 0.5);
  const checkup1 = Math.floor(days * 0.25);
  const preHarvest = Math.max(1, days - 2);

  return [
    {
      label: 'preparation',
      offset_days: 0,
      title: 'Bed Preparation & Sowing',
      description: `Sow seeds or plant seedlings for ${cropName} in prepared organic soil bed.`,
    },
    {
      label: 'checkup',
      offset_days: 0,
      title: 'Initial Checkup',
      description: `Take a photo baseline and inspect seedbed moisture for ${cropName}.`,
    },
    {
      label: 'growth',
      offset_days: checkup1,
      title: 'Early Growth & Moisture',
      description: `Check sprout vigor and maintain consistent organic watering schedule.`,
    },
    {
      label: 'checkup',
      offset_days: checkup1,
      title: 'Vegetative Checkup',
      description: `Log growth progress and take a checkup photo.`,
    },
    {
      label: 'growth',
      offset_days: midPoint,
      title: 'Organic Nutrient Feeding',
      description: `Apply compost tea or organic liquid fertilizer to support active vegetative expansion.`,
    },
    {
      label: 'growth',
      offset_days: preHarvest,
      title: 'Pre-Harvest Conditioning',
      description: `Reduce heavy feeding and water lightly to prepare ${cropName} for harvest.`,
    },
    {
      label: 'growth',
      offset_days: days,
      title: 'Harvest Day',
      description: `Harvest mature ${cropName} at optimal freshness.`,
    },
    {
      label: 'checkup',
      offset_days: days,
      title: 'Final Harvest Checkup',
      description: `Record yield results and take a final harvest photo.`,
    },
  ];
}

export async function syncCustomCropsWithCloud(userId: string, localCrops: Crop[]): Promise<Crop[]> {
  try {
    const deletedSet = await getDeletedCustomCropNames(userId);
    const { data, error } = await supabase
      .from('user_custom_crops')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      return localCrops.filter((c) => !deletedSet.has(normalizeCropName(c.crop)));
    }

    const cloudMap = new Map<string, Crop>();
    const toCleanFromCloud: string[] = [];

    for (const row of data || []) {
      const cropObj = row.crop_data as Crop;
      if (cropObj && cropObj.crop) {
        const norm = normalizeCropName(cropObj.crop);
        if (deletedSet.has(norm)) {
          toCleanFromCloud.push(row.id);
          continue;
        }
        cloudMap.set(norm, {
          ...cropObj,
          id: row.id,
          is_custom: true,
          created_by: userId,
        });
      }
    }

    if (toCleanFromCloud.length > 0) {
      (async () => {
        try {
          await supabase
            .from('user_custom_crops')
            .delete()
            .in('id', toCleanFromCloud);
        } catch (cleanErr) {
          console.warn('[CropPlanner] Error purging deleted crops from cloud:', cleanErr);
        }
      })();
    }

    // Find local crops not in cloud and upload them (excluding tombstones)
    const uploads = [];
    for (const localCrop of localCrops) {
      const norm = normalizeCropName(localCrop.crop);
      if (deletedSet.has(norm)) continue;

      if (!cloudMap.has(norm)) {
        cloudMap.set(norm, localCrop);
        uploads.push({
          id: localCrop.id || `${userId}-${norm}`,
          user_id: userId,
          crop_name: localCrop.crop,
          crop_data: localCrop,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (uploads.length > 0) {
      try {
        await supabase
          .from('user_custom_crops')
          .upsert(uploads, { onConflict: 'user_id,crop_name' });
      } catch (upsertErr) {
        console.warn('[CropPlanner] Cloud upsert error:', upsertErr);
      }
    }

    const merged = Array.from(cloudMap.values());
    const key = getCustomCropsStorageKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(merged));
    return merged;
  } catch (e) {
    console.warn('[CropPlanner] syncCustomCropsWithCloud failed:', e);
    return localCrops;
  }
}

export async function getCustomCrops(userId?: string): Promise<Crop[]> {
  try {
    const key = getCustomCropsStorageKey(userId);
    let raw = await AsyncStorage.getItem(key);

    // If user-scoped storage has nothing yet, check legacy partner key and migrate
    if (!raw && userId && key !== PARTNER_CUSTOM_CROPS_STORAGE_KEY) {
      const legacyRaw = await AsyncStorage.getItem(PARTNER_CUSTOM_CROPS_STORAGE_KEY);
      if (legacyRaw) {
        raw = legacyRaw;
        try {
          await AsyncStorage.setItem(key, legacyRaw);
        } catch (migErr) {
          console.warn('[CropPlanner] Failed to migrate legacy custom crops:', migErr);
        }
      }
    }

    const deletedSet = await getDeletedCustomCropNames(userId);
    let localList: Crop[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localList = parsed.filter((c) => c && c.crop && !deletedSet.has(normalizeCropName(c.crop)));
        }
      } catch {}
    }

    // Safety Net: Recover custom crops from local farm_succession_plans in SQLite if local list is empty
    if (userId && localList.length === 0) {
      try {
        const db = getDatabase();
        if (db && typeof db.all === 'function') {
          const plans = await db.all<{ plan_data_json: string }>(
            'SELECT plan_data_json FROM farm_succession_plans WHERE user_id = ?',
            [userId]
          );
          const recoveredMap = new Map<string, Crop>();
          for (const row of plans || []) {
            if (row.plan_data_json) {
              const parsed = JSON.parse(row.plan_data_json);
              const list = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed?.activePlans)
                ? parsed.activePlans
                : [parsed];
              for (const p of list) {
                for (const c of p.selectedCrops || []) {
                  if (c.is_custom && c.crop) {
                    const norm = normalizeCropName(c.crop);
                    if (!deletedSet.has(norm)) {
                      recoveredMap.set(norm, {
                        ...c,
                        is_custom: true,
                        created_by: userId,
                      });
                    }
                  }
                }
              }
            }
          }
          if (recoveredMap.size > 0) {
            const recovered = Array.from(recoveredMap.values());
            await AsyncStorage.setItem(key, JSON.stringify(recovered));
            localList = recovered;
          }
        }
      } catch (planRecoveryErr) {
        // Ignore if SQLite isn't ready
      }

      // Background cloud sync to pull from Supabase without blocking local UI
      void (async () => {
        try {
          const { data, error } = await supabase
            .from('user_custom_crops')
            .select('*')
            .eq('user_id', userId);

          if (!error && data && data.length > 0) {
            const cloudCrops: Crop[] = data
              .map((row: any) => ({
                ...(row.crop_data || {}),
                id: row.id,
                crop: row.crop_name || row.crop_data?.crop,
                is_custom: true,
                created_by: userId,
              }))
              .filter((c: Crop) => c && c.crop && !deletedSet.has(normalizeCropName(c.crop)));

            if (cloudCrops.length > 0) {
              await AsyncStorage.setItem(key, JSON.stringify(cloudCrops));
              invalidateCropsCache();
            }
          }
        } catch {}
      })();
    } else if (userId && localList.length > 0) {
      // Trigger background sync with cloud to pull any updates from other devices
      void (async () => {
        try {
          await syncCustomCropsWithCloud(userId, localList);
        } catch (e) {
          console.warn('[CropPlanner] Background cloud sync error:', e);
        }
      })();
    }

    return localList;
  } catch (e) {
    console.warn('[CropPlanner] Error loading custom crops:', e);
    return [];
  }
}

export async function saveCustomCrop(newCrop: Crop, userId?: string): Promise<Crop> {
  const maturityDaysNum = parseMaturityDays(newCrop.maturity_days) || 30;
  const customCrop: Crop = {
    ...newCrop,
    is_custom: true,
    created_by: userId || newCrop.created_by || 'custom',
    milestones:
      newCrop.milestones && newCrop.milestones.length > 0
        ? newCrop.milestones
        : generateDefaultMilestones(newCrop.crop, maturityDaysNum),
  };

  try {
    const key = getCustomCropsStorageKey(userId);
    const existing = await getCustomCrops(userId);
    const filtered = existing.filter(
      (c) => normalizeCropName(c.crop) !== normalizeCropName(customCrop.crop)
    );
    const updated = [customCrop, ...filtered];
    await AsyncStorage.setItem(key, JSON.stringify(updated));

    // Also sync to legacy key for backward compatibility
    if (key !== PARTNER_CUSTOM_CROPS_STORAGE_KEY) {
      try {
        await AsyncStorage.setItem(PARTNER_CUSTOM_CROPS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
    }

    // Background sync to Supabase user_custom_crops without blocking or throwing
    if (userId) {
      const normName = normalizeCropName(customCrop.crop);
      (async () => {
        try {
          await supabase
            .from('user_custom_crops')
            .upsert(
              {
                id: customCrop.id || `${userId}-${normName}`,
                user_id: userId,
                crop_name: customCrop.crop,
                crop_data: customCrop,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,crop_name' }
            );
        } catch (err) {
          console.warn('[CropPlanner] Background Supabase save error:', err);
        }
      })();
    }

    // Clear any tombstone for this crop name since it was intentionally created/saved
    await removeDeletedCustomCropTombstone(customCrop.crop, userId);

    invalidateCropsCache();
    return customCrop;
  } catch (e) {
    console.error('[CropPlanner] Failed to save custom crop:', e);
    throw e;
  }
}

export async function deleteCustomCrop(cropName: string, userId?: string): Promise<void> {
  try {
    const key = getCustomCropsStorageKey(userId);
    const existing = await getCustomCrops(userId);
    const normalizedTarget = normalizeCropName(cropName);
    const updated = existing.filter((c) => normalizeCropName(c.crop) !== normalizedTarget);
    await AsyncStorage.setItem(key, JSON.stringify(updated));

    if (key !== PARTNER_CUSTOM_CROPS_STORAGE_KEY) {
      try {
        await AsyncStorage.setItem(PARTNER_CUSTOM_CROPS_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
    }

    // Record tombstone so this crop cannot be resurrected by cloud merge or succession plan recovery
    await recordDeletedCustomCrop(cropName, userId);

    // Synchronize delete to Supabase user_custom_crops in background
    if (userId) {
      void (async () => {
        try {
          const norm = normalizeCropName(cropName);
          const { error } = await supabase
            .from('user_custom_crops')
            .delete()
            .eq('user_id', userId)
            .or(`crop_name.eq."${cropName}",crop_name.ilike."${cropName}",id.eq."${userId}-${norm}"`);

          if (error) {
            console.warn('[CropPlanner] Supabase delete warning:', error);
          }
        } catch (err) {
          console.warn('[CropPlanner] Supabase delete error:', err);
        }
      })();
    }

    invalidateCropsCache();
  } catch (e) {
    console.error('[CropPlanner] Failed to delete custom crop:', e);
    throw e;
  }
}

export async function getCrops(forceRefresh = false, userId?: string): Promise<Crop[]> {
  if (!forceRefresh && cachedCropsMemory && cachedCropsMemory.length > 0) {
    return cachedCropsMemory;
  }

  let systemCrops: Crop[] = [];

  try {
    const db = getDatabase();
    const rows = await db.all<any>(
      "SELECT * FROM organic_farming_crops WHERE is_active = 1 AND (status = 'active' OR status IS NULL OR status = '')"
    );
    if (rows && rows.length > 0) {
      systemCrops = rows.map((row) => {
        const parsedMilestones = safeParseJson<Milestone[]>(row.milestones, []);
        // If DB row does not yet have milestones populated, resolve from static dataset
        const milestones =
          parsedMilestones.length > 0
            ? parsedMilestones
            : findCropByName(cropsDataFallback as Crop[], row.common_name)?.milestones ?? [];

        return {
          crop: row.common_name,
          local_name: row.local_name ?? undefined,
          family: row.crop_family ?? undefined,
          type: row.crop_type,
          maturity_days:
            row.days_to_maturity_min !== null && row.days_to_maturity_max !== null
              ? `${row.days_to_maturity_min}-${row.days_to_maturity_max}`
              : '30',
          planting_months: safeParseJson<number[]>(row.planting_months, []),
          season: row.season ?? 'Year-round',
          nitrogen_contribution: row.nitrogen_contribution ?? null,
          nitrogen_demand: row.nitrogen_demand ?? 'Medium',
          soil_benefit: row.soil_benefit ?? undefined,
          succession_after: row.succession_after ?? undefined,
          succession_before: row.succession_before ?? undefined,
          organic_compatible: row.organic_compatible ?? 'Yes',
          notes: row.notes ?? undefined,
          milestones,
          is_custom: false,
        };
      });
    }
  } catch (error) {
    console.error('Failed to load crops from SQLite database, using fallback:', error);
  }

  if (systemCrops.length === 0) {
    systemCrops = (cropsDataFallback as Crop[]).map((c) => ({ ...c, is_custom: false }));
  }

  // Load any custom partner crops
  const customCrops = await getCustomCrops(userId);
  const validCustomCrops = (customCrops || []).filter(
    (c) => c && typeof c.crop === 'string' && c.crop.trim().length > 0
  );
  const validSystemCrops = (systemCrops || []).filter(
    (c) => c && typeof c.crop === 'string' && c.crop.trim().length > 0
  );

  // Merge custom crops with system crops, ensuring custom crops take priority or appear at the top
  const systemNames = new Set(
    validCustomCrops.map((c) => normalizeCropName(c.crop)).filter(Boolean)
  );
  const nonDuplicateSystemCrops = validSystemCrops.filter(
    (c) => !systemNames.has(normalizeCropName(c.crop))
  );

  const combined = [...validCustomCrops, ...nonDuplicateSystemCrops];
  cachedCropsMemory = combined;
  return combined;
}

export async function getSystemCrops(): Promise<Crop[]> {
  const all = await getCrops(false);
  return all
    .filter((c) => !c.is_custom)
    .map((c) => {
      const details = loadCropDetails(c);
      const duration = parseMaturityDays(c.maturity_days) || 30;
      const milestones =
        c.milestones && c.milestones.length > 0
          ? c.milestones
          : details?.milestones || generateDefaultMilestones(c.crop, duration);
      return {
        ...c,
        is_custom: false,
        milestones,
      };
    })
    .sort((a, b) => a.crop.localeCompare(b.crop));
}
