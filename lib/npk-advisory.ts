// lib/npk-advisory.ts
// Farmer-friendly agronomic guidance for soil NPK sensor readings.

export type NutrientType = 'N' | 'P' | 'K';
export type NutrientLevel = 'low' | 'optimal' | 'high';

export interface NutrientDetail {
  symbol: NutrientType;
  name: string;
  value: number;
  unit: string;
  level: NutrientLevel;
  label: string;
  badgeBg: string;
  badgeColor: string;
  barColor: string;
  percentage: number;
  targetRange: string;
  simpleRole: string;
}

export interface SoilAdvisory {
  status: 'optimal' | 'low_n' | 'low_p' | 'low_k' | 'depleted' | 'excess' | 'zero';
  title: string;
  badgeBg: string;
  badgeColor: string;
  explanation: string;
  actions: string[];
}

export const NPK_TARGETS = {
  N: { low: 50, high: 120, max: 200, unit: 'mg/kg', role: 'Helps leaves and green growth' },
  P: { low: 20, high: 50, max: 100, unit: 'mg/kg', role: 'Helps roots, flowers, and fruit' },
  K: { low: 100, high: 200, max: 250, unit: 'mg/kg', role: 'Helps plant strength and drought defense' },
};

export const SOIL_BENCHMARKS_GUIDE = {
  authority: 'DA-BSWM (Bureau of Soils and Water Management) & FAO Standards',
  unitDefinition: '1 mg/kg = 1 ppm (parts per million) in dry topsoil',
  ranges: [
    {
      nutrient: 'Nitrogen (N)',
      symbol: 'N',
      ideal: '50 - 120 mg/kg',
      lowDesc: 'Below 50: Leaves turn pale yellow; stunted vegetative growth.',
      highDesc: 'Above 120: Excess leaves, weak stems, delays flowering, attracts pests.',
      bestFor: 'Crucial for leafy greens (pechay, lettuce, kangkong).',
    },
    {
      nutrient: 'Phosphorous (P)',
      symbol: 'P',
      ideal: '20 - 50 mg/kg',
      lowDesc: 'Below 20: Stunted root growth, delayed flowering, purplish tint on veins.',
      highDesc: 'Above 50: Can block zinc and iron absorption (micronutrient lockout).',
      bestFor: 'Crucial for root crops, flowering, and early seedling establishment.',
    },
    {
      nutrient: 'Potassium (K)',
      symbol: 'K',
      ideal: '100 - 200 mg/kg',
      lowDesc: 'Below 100: Leaf edges scorch/brown; weak disease and heat resistance.',
      highDesc: 'Above 200: Can suppress calcium and magnesium uptake.',
      bestFor: 'Crucial for fruiting crops (tomatoes, eggplant) and tuber swelling.',
    },
  ],
  fieldRules: [
    'Soil Must Be Damp: If the ground is dry, water the spot first and wait 2–3 minutes for it to soak before testing. Air or bone-dry soil reads 0.',
    'Full Contact: Push prongs completely into root depth without hitting stones.',
    'Field Guide vs Lab: Handheld IoT sensors give instant relative trends for daily farm decisions; periodic laboratory tests are best for annual baselines.',
  ],
};

/**
 * Returns simple, farmer-friendly nutrient status.
 */
export function getNutrientDetail(type: NutrientType, val: number): NutrientDetail {
  const roundedVal = Math.round(val * 10) / 10;
  const cfg = NPK_TARGETS[type];
  const percentage = Math.min(Math.max((roundedVal / cfg.max) * 100, 5), 100);

  let level: NutrientLevel = 'optimal';
  let label = 'Good';
  let badgeBg = 'bg-emerald-100';
  let badgeColor = 'text-emerald-800';
  let barColor = 'bg-emerald-500';

  if (roundedVal < cfg.low) {
    level = 'low';
    label = 'Low';
    badgeBg = 'bg-amber-100';
    badgeColor = 'text-amber-800';
    barColor = 'bg-amber-500';
  } else if (roundedVal > cfg.high) {
    level = 'high';
    label = 'High';
    badgeBg = 'bg-rose-100';
    badgeColor = 'text-rose-800';
    barColor = 'bg-rose-500';
  }

  const names = {
    N: 'Nitrogen (N)',
    P: 'Phosphorous (P)',
    K: 'Potassium (K)',
  };

  return {
    symbol: type,
    name: names[type],
    value: roundedVal,
    unit: cfg.unit,
    level,
    label,
    badgeBg,
    badgeColor,
    barColor,
    percentage,
    targetRange: `${cfg.low} - ${cfg.high} mg/kg`,
    simpleRole: cfg.role,
  };
}

/**
 * Returns a short, plain-language explanation and action plan for farmers.
 */
export function generateSoilAdvisory(n: number, p: number, k: number): SoilAdvisory {
  // Case 0: Sensor reads 0
  if (n === 0 && p === 0 && k === 0) {
    return {
      status: 'zero',
      title: 'Sensor Not Detecting Soil',
      badgeBg: 'bg-amber-100',
      badgeColor: 'text-amber-800',
      explanation: 'The sensor is reading 0. Make sure the 3 metal prongs are pushed firmly into damp soil.',
      actions: [
        'Push the prongs deep into moist soil (air or dry dust reads 0).',
        'Check that the sensor power wire is connected.',
      ],
    };
  }

  const nDetail = getNutrientDetail('N', n);
  const pDetail = getNutrientDetail('P', p);
  const kDetail = getNutrientDetail('K', k);

  const lows = [nDetail, pDetail, kDetail].filter((d) => d.level === 'low');
  const highs = [nDetail, pDetail, kDetail].filter((d) => d.level === 'high');

  // Case 1: All nutrients in good range
  if (lows.length === 0 && highs.length === 0) {
    return {
      status: 'optimal',
      title: 'Soil is in Good Condition',
      badgeBg: 'bg-emerald-100',
      badgeColor: 'text-emerald-800',
      explanation: 'Your soil nutrients are well balanced for healthy crop growth.',
      actions: [
        'No heavy fertilizer needed right now.',
        'Keep soil moist and add light compost mulch to protect roots.',
      ],
    };
  }

  // Case 2: All 3 are low
  if (lows.length === 3) {
    return {
      status: 'depleted',
      title: 'Nutrients are Very Low',
      badgeBg: 'bg-rose-100',
      badgeColor: 'text-rose-800',
      explanation: 'The soil is running out of food. Plants will grow slowly and look pale without fertilizer.',
      actions: [
        'Mix in aged compost, decomposed manure, or complete 14-14-14 fertilizer.',
        'Water thoroughly after applying fertilizer so roots can absorb it.',
      ],
    };
  }

  // Case 3: Low Nitrogen only
  if (nDetail.level === 'low' && pDetail.level !== 'low' && kDetail.level !== 'low') {
    return {
      status: 'low_n',
      title: 'Needs Nitrogen',
      badgeBg: 'bg-amber-100',
      badgeColor: 'text-amber-800',
      explanation: 'Nitrogen is low. Older leaves may turn pale yellow and plant growth will slow down.',
      actions: [
        'Add composted chicken manure, organic compost, or a small amount of urea.',
        'Water well so nitrogen moves down to the roots.',
      ],
    };
  }

  // Case 4: Low Phosphorus
  if (pDetail.level === 'low') {
    return {
      status: 'low_p',
      title: 'Needs Phosphorous',
      badgeBg: 'bg-amber-100',
      badgeColor: 'text-amber-800',
      explanation: 'Phosphorous is low. Root development and flowering will be weak.',
      actions: [
        'Add bone meal, rock phosphate, or superphosphate near the root zone.',
        'Ensure the soil is moist to help roots absorb nutrients.',
      ],
    };
  }

  // Case 5: Low Potassium
  if (kDetail.level === 'low') {
    return {
      status: 'low_k',
      title: 'Needs Potassium',
      badgeBg: 'bg-amber-100',
      badgeColor: 'text-amber-800',
      explanation: 'Potassium is low. Plants may wilt easily and leaf edges can turn brown or burnt.',
      actions: [
        'Add wood ash, potash, or banana peel compost to strengthen plant stems.',
        'Mulch soil to prevent dry heat stress.',
      ],
    };
  }

  // Case 6: High nutrients
  if (highs.length > 0) {
    return {
      status: 'excess',
      title: 'Nutrient Level is High',
      badgeBg: 'bg-purple-100',
      badgeColor: 'text-purple-800',
      explanation: 'Nutrient levels are higher than needed. Adding more fertilizer may burn the plant roots.',
      actions: [
        'Do not add fertilizer for the next few weeks.',
        'Water with clean water to help flush excess nutrients through the soil.',
      ],
    };
  }

  // General low / imbalance
  return {
    status: 'low_n',
    title: 'Soil Needs Attention',
    badgeBg: 'bg-amber-100',
    badgeColor: 'text-amber-800',
    explanation: 'Some nutrients are lower than recommended for best crop yield.',
    actions: [
      'Apply balanced organic compost to gently restore nutrients.',
      'Check soil moisture before fertilizing.',
    ],
  };
}
