// ==========================================
// TYPES & INTERFACES
// ==========================================

export type PhaseLabel = 'preparation' | 'growth' | 'checkup' | 'mitigation';

export interface Milestone {
  label: PhaseLabel;
  offset_days: number;
  title: string;
  description: string;
}

export interface Mitigation {
  label: PhaseLabel;
  day: number;
  title: string;
  description: string;
}

export interface CropSchedule {
  crop_name: string;
  total_growing_days: number;
  milestones: Milestone[];
}

function normalizeCropName(cropName: string): string {
  return cropName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const cropNameAliases: Record<string, string> = {
  [normalizeCropName('Broccoli Microgreens')]: normalizeCropName('broccoli microgreens'),
  [normalizeCropName('Lettuce Green Ice')]: normalizeCropName('green ice lettuce'),
  [normalizeCropName('Lettuce (Green Ice)')]: normalizeCropName('green ice lettuce'),
  [normalizeCropName('Romaine lettuce')]: normalizeCropName('romaine lettuce'),
  [normalizeCropName('Lettuce Romaine')]: normalizeCropName('romaine lettuce'),
  [normalizeCropName('Lettuce (Romaine)')]: normalizeCropName('romaine lettuce'),
  [normalizeCropName('Pechay')]: normalizeCropName('native pechay'),
  [normalizeCropName('Kangkong')]: normalizeCropName('upland kangkong'),
  [normalizeCropName('Mint')]: normalizeCropName('mint/yerba buena'),
  [normalizeCropName('Yerba Buena')]: normalizeCropName('mint/yerba buena'),
  [normalizeCropName('Lady Finger Okra')]: normalizeCropName('okra'),
  [normalizeCropName("Lady's Finger (Okra)")]: normalizeCropName('okra'),
  [normalizeCropName('Sitao')]: normalizeCropName('sitaw'),
};

function getCanonicalCropName(cropName: string): string {
  const normalizedCropName = normalizeCropName(cropName);

  return cropNameAliases[normalizedCropName] ?? normalizedCropName;
}

// Mitigation plans are now fetched from the local SQLite database via db-operations.ts
