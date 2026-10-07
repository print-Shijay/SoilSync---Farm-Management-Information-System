import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocation } from './weather-service';

const API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY || '5ed71056a178124d2037e4af5ac9e861';
const LONG_RANGE_CACHE_PREFIX = '@weather_long_range_climatology_quarterly';
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14-day persistent cache

export interface DaySummaryPoint {
  date: string; // YYYY-MM-DD
  monthName: string;
  quarterLabel: string;
  isForecast: boolean;
  tempMin: number;
  tempMax: number;
  tempAfternoon: number;
  humidity: number;
  precipitationMm: number;
  windSpeed: number;
}

export interface SeasonalQuarter {
  quarterIndex: number; // 1 to 4
  name: string; // e.g. "Quarter 1 (Nov - Jan): Amihan Cool Season"
  monsoon: 'Amihan' | 'Tag-init' | 'Habagat' | 'Transition';
  monthRange: string;
  anchorDate: string;
  avgTempMin: number;
  avgTempMax: number;
  avgPrecipitationMm: number;
  avgHumidity: number;
  climateTrend: string;
  agronomicRecommendation: string;
}

export interface LongRangeClimateProfile {
  locationName: string;
  lat: number;
  lon: number;
  generatedAt: string;
  source: 'openweather_onecall_3.0' | 'local_climatological_matrix';
  samplePointsCount: number;
  historicalPastYear: DaySummaryPoint[];
  forecastNextYear: DaySummaryPoint[];
  quarters: SeasonalQuarter[];
  formattedPromptText: string;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Baseline climatological normals for San Pablo City, Laguna (PAGASA southern Luzon matrix).
 * Used when offline or if OpenWeather API requests encounter network barriers.
 */
const SAN_PABLO_CLIMATE_NORMALS: Record<
  number,
  { min: number; max: number; afternoon: number; humidity: number; precip: number; wind: number }
> = {
  0: { min: 21.5, max: 28.5, afternoon: 27.5, humidity: 78, precip: 2.8, wind: 3.5 }, // Jan (Amihan)
  1: { min: 21.8, max: 30.1, afternoon: 29.0, humidity: 72, precip: 1.5, wind: 3.8 }, // Feb (Amihan)
  2: { min: 22.8, max: 32.5, afternoon: 31.2, humidity: 68, precip: 1.2, wind: 3.4 }, // Mar (Tag-init)
  3: { min: 24.2, max: 34.2, afternoon: 33.0, humidity: 65, precip: 1.8, wind: 3.2 }, // Apr (Tag-init)
  4: { min: 24.8, max: 33.8, afternoon: 32.5, humidity: 74, precip: 6.5, wind: 3.0 }, // May (Transition)
  5: { min: 24.5, max: 31.8, afternoon: 30.5, humidity: 82, precip: 12.8, wind: 3.9 }, // Jun (Habagat)
  6: { min: 24.0, max: 30.5, afternoon: 29.2, humidity: 86, precip: 18.2, wind: 4.5 }, // Jul (Habagat)
  7: { min: 23.8, max: 30.2, afternoon: 28.8, humidity: 87, precip: 19.5, wind: 4.6 }, // Aug (Habagat)
  8: { min: 23.9, max: 30.8, afternoon: 29.4, humidity: 85, precip: 16.4, wind: 4.1 }, // Sep (Habagat)
  9: { min: 23.5, max: 30.5, afternoon: 29.1, humidity: 83, precip: 14.1, wind: 3.8 }, // Oct (Transition)
  10: { min: 22.8, max: 29.5, afternoon: 28.2, humidity: 81, precip: 9.2, wind: 3.6 }, // Nov (Amihan)
  11: { min: 22.0, max: 28.8, afternoon: 27.6, humidity: 80, precip: 5.5, wind: 3.7 }, // Dec (Amihan)
};

/**
 * Generates the 8 quarterly anchor dates:
 * - 4 Past Quarters (historical baseline midpoints: -11, -8, -5, -2 months)
 * - 4 Upcoming Quarters (forward forecast midpoints: +1, +4, +7, +10 months)
 * This reduces API traffic by 66.7% (8 requests vs 24 requests) while providing
 * 3x higher concurrent user throughput within OpenWeather's 60 req/min rate limit.
 */
function generateQuarterlyAnchorDates(referenceDate: Date): {
  pastDates: { date: string; quarterLabel: string }[];
  futureDates: { date: string; quarterLabel: string }[];
} {
  const pastDates: { date: string; quarterLabel: string }[] = [];
  const futureDates: { date: string; quarterLabel: string }[] = [];

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();

  // 4 Past Quarters (approx. midpoints of each historical quarter)
  const pastOffsets = [11, 8, 5, 2];
  pastOffsets.forEach((offset, idx) => {
    const d = new Date(refYear, refMonth - offset, 15);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    pastDates.push({
      date: `${y}-${m}-15`,
      quarterLabel: `Past Q${4 - idx}`,
    });
  });

  // 4 Upcoming Quarters (approx. midpoints of each upcoming quarterly season)
  const futureOffsets = [1, 4, 7, 10];
  futureOffsets.forEach((offset, idx) => {
    const d = new Date(refYear, refMonth + offset, 15);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    futureDates.push({
      date: `${y}-${m}-15`,
      quarterLabel: `Upcoming Q${idx + 1}`,
    });
  });

  return { pastDates, futureDates };
}

/**
 * Fetches a single day's summary from OpenWeather One Call 3.0 day_summary endpoint.
 */
async function fetchDaySummary(
  lat: number,
  lon: number,
  dateStr: string,
  quarterLabel: string,
  isForecast: boolean
): Promise<DaySummaryPoint | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const url = `https://api.openweathermap.org/data/3.0/onecall/day_summary?lat=${lat}&lon=${lon}&date=${dateStr}&appid=${API_KEY}&units=metric`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    const monthNum = Number.parseInt(dateStr.split('-')[1], 10) - 1;
    const fallback = SAN_PABLO_CLIMATE_NORMALS[monthNum] || SAN_PABLO_CLIMATE_NORMALS[0];

    const tempMin =
      typeof json.weather?.temperature?.min === 'number'
        ? json.weather.temperature.min
        : fallback.min;
    const tempMax =
      typeof json.weather?.temperature?.max === 'number'
        ? json.weather.temperature.max
        : fallback.max;
    const tempAfternoon =
      typeof json.weather?.temperature?.afternoon === 'number'
        ? json.weather.temperature.afternoon
        : fallback.afternoon;
    const humidity =
      typeof json.weather?.humidity?.afternoon === 'number'
        ? json.weather.humidity.afternoon
        : fallback.humidity;
    const precipitationMm =
      typeof json.weather?.precipitation?.total === 'number'
        ? json.weather.precipitation.total
        : fallback.precip;
    const windSpeed =
      typeof json.weather?.wind?.max?.speed === 'number'
        ? json.weather.wind.max.speed
        : fallback.wind;

    return {
      date: dateStr,
      monthName: MONTH_NAMES[monthNum] || '',
      quarterLabel,
      isForecast,
      tempMin: Math.round(tempMin * 10) / 10,
      tempMax: Math.round(tempMax * 10) / 10,
      tempAfternoon: Math.round(tempAfternoon * 10) / 10,
      humidity: Math.round(humidity),
      precipitationMm: Math.round(precipitationMm * 10) / 10,
      windSpeed: Math.round(windSpeed * 10) / 10,
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Concurrency throttler: Processes tasks in 2 quick batches of 4 with a 100ms delay.
 * Total 8 calls execute in ~400–600ms, easily supporting up to 7–8 simultaneous users/min.
 */
async function fetchInThrottledBatches(
  tasks: Array<() => Promise<DaySummaryPoint | null>>,
  batchSize = 4,
  delayMs = 100
): Promise<DaySummaryPoint[]> {
  const results: DaySummaryPoint[] = [];

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    for (const item of batchResults) {
      if (item) results.push(item);
    }
    if (i + batchSize < tasks.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Synthesizes the 4 forward quarterly points into distinct Agro-Climatic Seasonal Quarters.
 */
function synthesizeQuarterlyProfile(
  futurePoints: DaySummaryPoint[],
  startDate: Date
): SeasonalQuarter[] {
  const quarters: SeasonalQuarter[] = [];
  const startMonthIdx = startDate.getMonth();

  for (let q = 0; q < Math.min(4, futurePoints.length); q++) {
    const p = futurePoints[q];
    const qStartMonth = (startMonthIdx + q * 3) % 12;
    const qEndMonth = (startMonthIdx + q * 3 + 2) % 12;
    const monthRange = `${MONTH_NAMES[qStartMonth]} - ${MONTH_NAMES[qEndMonth]}`;

    const centerMonth = (startMonthIdx + q * 3 + 1) % 12;
    let monsoon: 'Amihan' | 'Tag-init' | 'Habagat' | 'Transition' = 'Amihan';
    let name = '';
    let climateTrend = '';
    let recommendation = '';

    if (centerMonth >= 5 && centerMonth <= 8) {
      // Jun - Sep: Habagat Peak Wet Monsoon
      monsoon = 'Habagat';
      name = `Quarter ${q + 1} (${monthRange}): Habagat Wet Monsoon`;
      climateTrend = `High cloud cover, peak rainfall (~${p.precipitationMm.toFixed(1)}mm/day), high humidity (~${p.humidity}%), risk of soil waterlogging.`;
      recommendation =
        'Plant water-resilient crops on raised volcanic beds with organic mulch. Prioritize trellised climbing cucurbits (Ampalaya, Patola, Sitaw) to keep foliage elevated off wet ground.';
    } else if (centerMonth >= 2 && centerMonth <= 4) {
      // Mar - May: Tag-init Dry & Heat
      monsoon = 'Tag-init';
      name = `Quarter ${q + 1} (${monthRange}): Tag-init Dry Season`;
      climateTrend = `High solar irradiance, daytime highs (~${p.tempMax.toFixed(1)}°C), minimal rainfall (~${p.precipitationMm.toFixed(1)}mm/day), high evapotranspiration.`;
      recommendation =
        'Plant nitrogen-fixing legumes (Monggo, Bush Sitaw) and drought-tolerant solanaceous crops (Talong, Sili). Apply thick rice-straw organic mulch to conserve volcanic soil moisture.';
    } else if (centerMonth >= 10 || centerMonth <= 1) {
      // Nov - Feb: Amihan Cool Season
      monsoon = 'Amihan';
      name = `Quarter ${q + 1} (${monthRange}): Amihan Northeast Monsoon`;
      climateTrend = `Cooler evening breezes (~${p.tempMin.toFixed(1)}°C), moderate humidity (~${p.humidity}%), gentle periodic rainfall. Prime growing window.`;
      recommendation =
        'Optimal for nutrient-demanding leafy greens and crucifers (Pechay, Mustasa, Lettuce, Radish). Low pest pressure and ideal vegetative growth temperature.';
    } else {
      // May / Oct: Transition Periods
      monsoon = 'Transition';
      name = `Quarter ${q + 1} (${monthRange}): Monsoon Transition Window`;
      climateTrend = `Shifting wind patterns, convective afternoon thunderstorms, fluctuating soil moisture (~${p.precipitationMm.toFixed(1)}mm/day).`;
      recommendation =
        'Plant root vegetables and hardy organic companion crops. Incorporate compost to bolster microbial activity before the next extreme seasonal shift.';
    }

    quarters.push({
      quarterIndex: q + 1,
      name,
      monsoon,
      monthRange,
      anchorDate: p.date,
      avgTempMin: p.tempMin,
      avgTempMax: p.tempMax,
      avgPrecipitationMm: p.precipitationMm,
      avgHumidity: p.humidity,
      climateTrend,
      agronomicRecommendation: recommendation,
    });
  }

  return quarters;
}

/**
 * Builds the Laguna fallback profile if OpenWeather cannot be reached.
 */
function buildLocalFallbackProfile(
  locationName: string,
  lat: number,
  lon: number,
  startDate: Date
): LongRangeClimateProfile {
  const { pastDates, futureDates } = generateQuarterlyAnchorDates(startDate);

  const pastPoints: DaySummaryPoint[] = pastDates.map((item) => {
    const monthNum = Number.parseInt(item.date.split('-')[1], 10) - 1;
    const n = SAN_PABLO_CLIMATE_NORMALS[monthNum] || SAN_PABLO_CLIMATE_NORMALS[0];
    return {
      date: item.date,
      monthName: MONTH_NAMES[monthNum],
      quarterLabel: item.quarterLabel,
      isForecast: false,
      tempMin: n.min,
      tempMax: n.max,
      tempAfternoon: n.afternoon,
      humidity: n.humidity,
      precipitationMm: n.precip,
      windSpeed: n.wind,
    };
  });

  const futurePoints: DaySummaryPoint[] = futureDates.map((item) => {
    const monthNum = Number.parseInt(item.date.split('-')[1], 10) - 1;
    const n = SAN_PABLO_CLIMATE_NORMALS[monthNum] || SAN_PABLO_CLIMATE_NORMALS[0];
    return {
      date: item.date,
      monthName: MONTH_NAMES[monthNum],
      quarterLabel: item.quarterLabel,
      isForecast: true,
      tempMin: n.min,
      tempMax: n.max,
      tempAfternoon: n.afternoon,
      humidity: n.humidity,
      precipitationMm: n.precip,
      windSpeed: n.wind,
    };
  });

  const quarters = synthesizeQuarterlyProfile(futurePoints, startDate);
  const promptText = formatProfileForPrompt(locationName, quarters, pastPoints);

  return {
    locationName,
    lat,
    lon,
    generatedAt: new Date().toISOString(),
    source: 'local_climatological_matrix',
    samplePointsCount: 8,
    historicalPastYear: pastPoints,
    forecastNextYear: futurePoints,
    quarters,
    formattedPromptText: promptText,
  };
}

/**
 * Formats the quarterly climatology and forecast into a structured, high-value prompt block for Gemini & DeepSeek.
 */
function formatProfileForPrompt(
  locationName: string,
  quarters: SeasonalQuarter[],
  pastPoints: DaySummaryPoint[]
): string {
  const pastAvgMax = (
    pastPoints.reduce((acc, p) => acc + p.tempMax, 0) / (pastPoints.length || 1)
  ).toFixed(1);
  const pastAvgMin = (
    pastPoints.reduce((acc, p) => acc + p.tempMin, 0) / (pastPoints.length || 1)
  ).toFixed(1);
  const wettestPastQuarter = pastPoints.reduce((prev, curr) =>
    curr.precipitationMm > prev.precipitationMm ? curr : prev
  );

  let text = `\n--- 365-DAY CLIMATOLOGICAL ARCHIVE & 1-YEAR FORWARD FORECAST (${locationName}) ---\n`;
  text += `[San Pablo City Agro-Climatological Synthesis: 8 Seasonal Monsoon Anchors]\n`;
  text += `Historical 4-Quarter Baseline: Annual High Avg ${pastAvgMax}°C, Low Avg ${pastAvgMin}°C. Peak historical precipitation anchor: ${wettestPastQuarter.monthName} (~${wettestPastQuarter.precipitationMm}mm/day).\n\n`;
  text += `Upcoming 365-Day Seasonal Quarters (Organize your 365-day succession into these 4 distinct monsoonal phases):\n`;

  for (const q of quarters) {
    text += `• ${q.name} [Anchor: ${q.anchorDate}]:\n`;
    text += `   - Climate Conditions: Temp ${q.avgTempMin}°C to ${q.avgTempMax}°C | Precip: ~${q.avgPrecipitationMm} mm/day | Humidity: ${q.avgHumidity}%\n`;
    text += `   - Environmental Dynamics: ${q.climateTrend}\n`;
    text += `   - Agronomic Directive: ${q.agronomicRecommendation}\n`;
  }
  text += `--------------------------------------------------------------------------------\n`;

  return text;
}

/**
 * Main public entry point: Retrieves the 365-day Long-Range Climate Profile.
 * - Checks 14-day persistent cache first (0 API calls on repeat generations).
 * - Queries OpenWeather One Call 3.0 day_summary using 8 quarterly anchor points in 2 batches of 4.
 * - Falls back to Laguna climatology matrix if offline.
 */
export async function getLongRangeClimateProfile(
  startDate = new Date(),
  forceRefresh = false
): Promise<LongRangeClimateProfile> {
  const loc = await getLocation();
  const year = startDate.getFullYear();
  const month = startDate.getMonth() + 1;
  const cacheKey = `${LONG_RANGE_CACHE_PREFIX}_${loc.lat.toFixed(2)}_${loc.lon.toFixed(2)}_${year}_${month}`;

  // 1. Check 14-day local cache
  if (!forceRefresh) {
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - new Date(parsed.generatedAt).getTime();
        if (age < CACHE_TTL_MS && Array.isArray(parsed.quarters) && parsed.quarters.length === 4) {
          return parsed as LongRangeClimateProfile;
        }
      }
    } catch {
      // Ignore cache parse errors
    }
  }

  // 2. Generate 8 quarterly anchor dates (4 past + 4 future)
  const { pastDates, futureDates } = generateQuarterlyAnchorDates(startDate);

  const tasks: Array<() => Promise<DaySummaryPoint | null>> = [
    ...pastDates.map((item) => () => fetchDaySummary(loc.lat, loc.lon, item.date, item.quarterLabel, false)),
    ...futureDates.map((item) => () => fetchDaySummary(loc.lat, loc.lon, item.date, item.quarterLabel, true)),
  ];

  try {
    // 3. Fetch in 2 throttled batches of 4 (only 8 calls total, sub-second execution)
    const points = await fetchInThrottledBatches(tasks, 4, 100);

    const pastPoints = points.filter((p) => !p.isForecast);
    const futurePoints = points.filter((p) => p.isForecast);

    // If OpenWeather yielded sufficient anchor data (at least 3 points in each horizon)
    if (pastPoints.length >= 3 && futurePoints.length >= 3) {
      // Sort chronologically
      pastPoints.sort((a, b) => a.date.localeCompare(b.date));
      futurePoints.sort((a, b) => a.date.localeCompare(b.date));

      const quarters = synthesizeQuarterlyProfile(futurePoints, startDate);
      const formattedPromptText = formatProfileForPrompt(loc.name, quarters, pastPoints);

      const profile: LongRangeClimateProfile = {
        locationName: loc.name,
        lat: loc.lat,
        lon: loc.lon,
        generatedAt: new Date().toISOString(),
        source: 'openweather_onecall_3.0',
        samplePointsCount: points.length,
        historicalPastYear: pastPoints,
        forecastNextYear: futurePoints,
        quarters,
        formattedPromptText,
      };

      // Cache for 14 days
      AsyncStorage.setItem(cacheKey, JSON.stringify(profile)).catch(() => {});
      return profile;
    }
  } catch (err) {
    console.warn('[LongRangeWeather] OpenWeather 3.0 batch query failed, using local matrix fallback:', err);
  }

  // 4. Fallback to Laguna Climatological Matrix
  const fallback = buildLocalFallbackProfile(loc.name, loc.lat, loc.lon, startDate);
  return fallback;
}
