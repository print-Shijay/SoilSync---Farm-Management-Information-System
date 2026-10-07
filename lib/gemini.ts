import { Crop, filterCropsBySeason, getAvailableCrops, parseMaturityDays, generateDefaultMilestones } from './crop-planner';
import { getWeatherData } from './weather-service';
import { getLongRangeClimateProfile } from './long-range-weather';

const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-v4-flash-0731';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash';

export const AI_REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10-minute timeout for cloud LLM reasoning and JSON generation

export type AiProvider = 'openrouter' | 'gemini';

export interface AiMilestoneItem {
  offsetDays: number;
  label: 'preparation' | 'growth' | 'checkup';
  title: string;
  description: string;
}

export interface AiRotationItem {
  cropName: string;
  reason: string;
  botanicalFamily?: string;
  agronomicReason?: string;
  climateReason?: string;
  maturityDays?: number;
  milestones?: AiMilestoneItem[];
}

export interface AiCropSuccessionResult {
  climateSummary?: string;
  source: 'openrouter' | 'gemini' | 'offline_rule_engine';
  modelName?: string;
  rotationPlan: AiRotationItem[];
}

interface AiRotationResponse {
  climateSummary?: string;
  rotationPlan?: AiRotationItem[];
  plan?: AiRotationItem[];
}

interface OpenRouterResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  error?: {
    message?: string;
    code?: number | string;
  };
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
  error?: {
    message?: string;
    code?: number;
  };
}

function resolveProvider(): AiProvider {
  const configured = process.env.EXPO_PUBLIC_AI_PROVIDER?.trim().toLowerCase();
  if (configured === 'gemini' || configured === 'openrouter') {
    return configured;
  }

  // Auto-detect based on available keys
  const openrouterKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim();
  if (openrouterKey && !openrouterKey.includes('your_openrouter_api_key_here')) {
    return 'openrouter';
  }

  const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
  if (geminiKey && !geminiKey.includes('your_anon_key') && geminiKey.length > 5) {
    return 'gemini';
  }

  return 'openrouter';
}

function parseAiRotationResponse(
  rawText: string,
  providerName: string,
  source: 'openrouter' | 'gemini',
  modelName?: string
): AiCropSuccessionResult {
  let cleaned = rawText.trim();

  // Strip markdown code fences if model wrapped response in ```json ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: any;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Attempt substring extraction if model added conversational preamble or postscript
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch {
        throw new Error(`${providerName} returned invalid JSON. Please try generating the plan again.`);
      }
    } else {
      const firstBracket = cleaned.indexOf('[');
      const lastBracket = cleaned.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        try {
          parsed = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1));
        } catch {
          throw new Error(`${providerName} returned invalid JSON. Please try generating the plan again.`);
        }
      } else {
        throw new Error(`${providerName} returned invalid JSON. Please try generating the plan again.`);
      }
    }
  }

  let climateSummary: string | undefined = undefined;
  if (parsed && typeof parsed.climateSummary === 'string' && parsed.climateSummary.trim().length > 0) {
    climateSummary = parsed.climateSummary.trim();
  }

  let items: unknown[] = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (Array.isArray(parsed.rotationPlan)) {
    items = parsed.rotationPlan;
  } else if (Array.isArray(parsed.plan)) {
    items = parsed.plan;
  } else {
    throw new Error(`${providerName} returned a plan in an unexpected format.`);
  }

  const rotationPlan: AiRotationItem[] = (items as any[])
    .filter((item) => typeof item?.cropName === 'string' && item.cropName.trim().length > 0)
    .map((item) => {
      const cropName = String(item.cropName).trim();
      const agronomicReason =
        typeof item.agronomicReason === 'string' && item.agronomicReason.trim().length > 0
          ? item.agronomicReason.trim()
          : typeof item.reason === 'string' && item.reason.trim().length > 0
            ? item.reason.trim()
            : 'Rotated for organic soil replenishment and botanical disease break.';
      const climateReason =
        typeof item.climateReason === 'string' && item.climateReason.trim().length > 0
          ? item.climateReason.trim()
          : undefined;
      const botanicalFamily =
        typeof item.botanicalFamily === 'string' && item.botanicalFamily.trim().length > 0
          ? item.botanicalFamily.trim()
          : undefined;
      const maturityDays =
        typeof item.maturityDays === 'number' && item.maturityDays > 0 ? item.maturityDays : undefined;

      return {
        cropName,
        reason: agronomicReason,
        botanicalFamily,
        agronomicReason,
        climateReason,
        maturityDays,
      };
    });

  return {
    climateSummary,
    source,
    modelName,
    rotationPlan,
  };
}

/**
 * Deterministic local rule-based fallback generator.
 * Used when all AI cloud providers are busy, rate-limited, or offline.
 */
export function generateLocalRuleBasedPlan(
  duration: number,
  season: string,
  availableCrops: Crop[]
): AiCropSuccessionResult {
  const durationDays = duration > 14 ? duration : duration * 30;
  const seasonCrops = filterCropsBySeason(availableCrops, season);
  const pool = seasonCrops.length >= 3 ? seasonCrops : availableCrops;

  if (pool.length === 0) {
    return {
      source: 'offline_rule_engine',
      climateSummary: 'No compatible crops available for the selected duration and season.',
      rotationPlan: [],
    };
  }

  const plan: AiRotationItem[] = [];
  let currentDays = 0;
  const usedCrops = new Set<string>();

  // Pick an initial starter crop (preferably a high-demand main food crop)
  const starters = pool.filter((c) => c.nitrogen_demand === 'High');
  let currentCrop: Crop | undefined = starters[0] || pool[0];

  while (currentCrop && currentDays < durationDays) {
    const maturity = parseMaturityDays(currentCrop.maturity_days) || 30;
    usedCrops.add(currentCrop.crop);

    const agronomicReason =
      plan.length === 0
        ? `Initial ${currentCrop.season || season} planting (${currentCrop.family || 'main'} family, ${currentCrop.nitrogen_demand || 'Medium'} nitrogen demand).`
        : `Rotated after ${plan[plan.length - 1].cropName} to break pest cycles and replenish nutrients (${currentCrop.family || 'Botanical rotation'}, ${currentCrop.soil_benefit || 'maintains soil vitality'}).`;

    const climateReason = `Calibrated for San Pablo City (${season}): suited to local humidity and volcanic loam drainage.`;

    const defaultM = generateDefaultMilestones(currentCrop.crop, maturity);
    const milestones: AiMilestoneItem[] = defaultM.map((m) => ({
      offsetDays: m.offset_days,
      label: m.label === 'preparation' || m.label === 'checkup' ? m.label : 'growth',
      title: m.title,
      description: m.description,
    }));

    plan.push({
      cropName: currentCrop.crop,
      reason: agronomicReason,
      botanicalFamily: currentCrop.family,
      agronomicReason,
      climateReason,
      maturityDays: maturity,
      milestones,
    });

    currentDays += maturity;
    if (currentDays >= durationDays) {
      break;
    }

    // Find next compatible crop using agronomic succession rules
    const candidates: Crop[] = getAvailableCrops(pool, currentCrop).filter((c: Crop) => {
      // Forbid same family consecutively
      if (currentCrop?.family && c.family && c.family.toLowerCase() === currentCrop.family.toLowerCase()) {
        return false;
      }
      return !usedCrops.has(c.crop);
    });

    if (candidates.length > 0) {
      // If previous crop was a heavy nitrogen feeder, prioritize legumes (Fabaceae) or nitrogen suppliers
      if (currentCrop && currentCrop.nitrogen_demand === 'High') {
        const legume: Crop | undefined = candidates.find(
          (c: Crop) =>
            c.family?.toLowerCase() === 'fabaceae' ||
            c.nitrogen_contribution === 'High' ||
            c.nitrogen_contribution === 'Medium'
        );
        currentCrop = legume || candidates[0];
      } else {
        currentCrop = candidates[0];
      }
    } else {
      // Fallback: pick any unused crop from a different family
      const diffFamily = pool.find(
        (c) =>
          c.crop !== currentCrop?.crop &&
          (!currentCrop?.family || c.family?.toLowerCase() !== currentCrop.family.toLowerCase()) &&
          !usedCrops.has(c.crop)
      );
      currentCrop = diffFamily || pool.find((c) => c.crop !== currentCrop?.crop);
      if (!currentCrop) {
        break;
      }
    }
  }

  const climateSummary =
    durationDays > 90
      ? `365-day annual organic succession calibrated for San Pablo City across all 4 monsoonal quarters, strategically sequencing botanical families to break pest cycles and preserve volcanic soil vitality.`
      : `Organic crop succession plan calibrated for San Pablo City (${season}), sequencing botanical families to break pest cycles and naturally replenish volcanic soil nutrients.`;

  return {
    climateSummary,
    source: 'offline_rule_engine',
    modelName: 'SoilSync Local Permaculture Engine',
    rotationPlan: plan,
  };
}

async function generateWithOpenRouter(
  systemInstruction: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim();

  if (!apiKey || apiKey.includes('your_openrouter_api_key_here')) {
    throw new Error(
      'OpenRouter API key is missing or invalid. Check EXPO_PUBLIC_OPENROUTER_API_KEY in your .env file.'
    );
  }

  const model = process.env.EXPO_PUBLIC_OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL;

  console.log(`[OpenRouter] Sending crop succession request using model: "${model}"`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, AI_REQUEST_TIMEOUT_MS); // 10-minute timeout limit for cloud LLM reasoning and JSON generation

  try {
    const response = await fetch(OPENROUTER_API_BASE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://soilsync.app',
        'X-Title': 'SoilSync',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemInstruction,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OpenRouter] API request failed:', response.status, errorText);
      throw new Error(`OpenRouter request failed with status ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenRouterResponse;

    if (data.error) {
      console.error('[OpenRouter] API error in response payload:', data.error);
      throw new Error(`OpenRouter error: ${data.error.message || 'Unknown error'}`);
    }

    const contentText = data.choices?.[0]?.message?.content;

    if (!contentText) {
      throw new Error('OpenRouter returned an empty response. Please try again.');
    }

    console.log('[OpenRouter] Successfully received model response.');
    return contentText;
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      throw new Error('OpenRouter request timed out after 10 minutes. Activating fast local succession engine.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateWithGemini(
  systemInstruction: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      'Gemini API key is missing. Add EXPO_PUBLIC_GEMINI_API_KEY to your local .env file and restart Expo.'
    );
  }

  const model = process.env.EXPO_PUBLIC_GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: userPrompt,
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [
        {
          text: systemInstruction,
        },
      ],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          climateSummary: {
            type: 'STRING',
          },
          rotationPlan: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                cropName: {
                  type: 'STRING',
                },
                botanicalFamily: {
                  type: 'STRING',
                },
                maturityDays: {
                  type: 'INTEGER',
                },
                agronomicReason: {
                  type: 'STRING',
                },
                climateReason: {
                  type: 'STRING',
                },
                milestones: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      offsetDays: {
                        type: 'INTEGER',
                      },
                      label: {
                        type: 'STRING',
                      },
                      title: {
                        type: 'STRING',
                      },
                      description: {
                        type: 'STRING',
                      },
                    },
                    required: ['offsetDays', 'label', 'title', 'description'],
                  },
                },
              },
              required: ['cropName', 'agronomicReason'],
            },
          },
        },
        required: ['rotationPlan'],
      },
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, AI_REQUEST_TIMEOUT_MS); // 10-minute timeout limit

  try {
    const response = await fetch(
      `${GEMINI_API_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API request failed:', errorText);
      throw new Error(`Gemini request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as GeminiResponse;

    if (data.error) {
      throw new Error(`Gemini error: ${data.error.message || 'Unknown error'}`);
    }

    const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!contentText) {
      throw new Error('Gemini returned an empty response. Please try again.');
    }

    return contentText;
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      throw new Error('Gemini request timed out after 10 minutes. Activating fast local succession engine.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateCropSuccessionPlan(
  duration: number,
  season: string,
  startDate: Date,
  availableCrops: Crop[],
  previousCrop?: Crop | null
): Promise<AiCropSuccessionResult> {
  const durationDays = duration > 14 ? duration : duration * 30;

  // 1. Fetch live OpenWeather telemetry and 365-day climatology if plan spans an extended cycle
  let weatherContext = '';
  let longRangePromptBlock = '';

  if (durationDays > 90) {
    try {
      console.log(`[Crop Planner] Plan spans ${durationDays}d (>90d). Fetching 365-day climatology (One Call 3.0)...`);
      const longRangeProfile = await getLongRangeClimateProfile(startDate);
      longRangePromptBlock = longRangeProfile.formattedPromptText;
      console.log(`[Crop Planner] 365-day climatology loaded (${longRangeProfile.source}, ${longRangeProfile.samplePointsCount} points).`);
    } catch (err) {
      console.warn('[Crop Planner] Long-range climatology fetch warning:', err);
    }
  }

  try {
    const cachedWeather = await getWeatherData();
    if (cachedWeather?.data) {
      const cur = cachedWeather.data.current;
      const desc = cur.weather?.[0]?.description || 'tropical';
      const temp = Math.round(cur.temp);
      const humidity = cur.humidity;
      const pop = Math.round((cachedWeather.data.daily?.[0]?.pop || 0) * 100);
      weatherContext = `Live Weather Telemetry in San Pablo City: ${temp}°C, ${humidity}% Relative Humidity, Conditions: "${desc}", Rain Probability: ${pop}%.`;
    }
  } catch {
    // Non-blocking fallback
  }

  // 2. Compute seasonal monsoon context for Southern Luzon (Laguna)
  const startMonth = startDate.getMonth() + 1;
  const startMonthName = startDate.toLocaleString('default', { month: 'long' });
  let monsoonPhase = '';
  if (startMonth >= 6 && startMonth <= 10) {
    monsoonPhase = `Habagat (Southwest Monsoon) / Wet Season: High rainfall, overcast skies, and typhoon activity. Soil moisture remains high; prioritize water-resilient crops, trellised climbers, or raised-bed greens with rapid turnaround to prevent waterlogging.`;
  } else if (startMonth >= 11 || startMonth <= 2) {
    monsoonPhase = `Amihan (Northeast Monsoon) / Cool Season: Cooler evening breezes, lower humidity, and gentle precipitation. Favorable for crisp leafy greens (lettuces, pechay, microgreens) and tender vegetables.`;
  } else {
    monsoonPhase = `Tag-init / Hot Dry Season: Intense solar radiation, rapid evaporation, and heat stress. Heat-tolerant varieties (okra, upland kangkong, sitaw) and organic soil mulching/ground cover are essential.`;
  }

  // 3. Compact representation of the farm's available crops (without hardcoded string constraints)
  const catalogSummary = availableCrops
    .map((crop) => {
      const days = parseMaturityDays(crop.maturity_days);
      const fam = crop.family || 'Botanical';
      const nDem = crop.nitrogen_demand || 'Med';
      const nSup = crop.nitrogen_contribution || 'Low';
      return `- ${crop.crop} [Family: ${fam} | Maturity: ~${days}d | N-Demand: ${nDem} | N-Fixer: ${nSup === 'High' ? 'Yes' : 'No'}]`;
    })
    .join('\n');

  const expectedCropCount = Math.max(Math.round(durationDays / 45), 2);

  const systemInstruction = `You are an expert tropical organic agronomist and permaculturist specialized in bio-intensive crop rotation in the Philippines.
Your objective is to generate an optimal sequential organic crop rotation plan tailored specifically for the microclimate of San Pablo City, Laguna.

MANDATORY ORGANIC FARMING LAWS (STRICTLY ENFORCED):
1. BOTANICAL FAMILY ROTATION (MANDATORY): NEVER plant crops from the same botanical family (e.g., Solanaceae, Brassicaceae, Cucurbitaceae, Fabaceae, Convolvulaceae, Asteraceae, Malvaceae, Lamiaceae) consecutively. You MUST rotate botanical families sequentially to sever pest lifecycles and starve soil-borne pathogens without synthetic chemicals.
2. NUTRIENT & RHIZOSPHERE REBALANCING:
   - High nitrogen demanding crops (Heavy Feeders) MUST be followed by nitrogen-fixing legumes (Fabaceae like Sitaw/Beans/Mungbean) or light-feeding crops to biologically regenerate the soil.
   - Alternate root depths (deep taproots vs. shallow fibrous roots) to aerate and preserve San Pablo's volcanic loam soil.
3. HYPER-LOCAL CLIMATE ADAPTATION (SAN PABLO CITY, LAGUNA):
   - Ground your crop succession in the ambient temperature, humidity, and monsoon progression.
   - Select crops that thrive in San Pablo's local weather during each respective growing phase.
${durationDays > 90 ? `4. 365-DAY ANNUAL SUCCESSION STRATEGY:
   - Because this plan spans an extended annual or multi-season timeline (${durationDays} days), you MUST adapt each sequential crop to the 4 seasonal monsoonal quarters provided in the long-range climatological forecast.
   - Align cool-season greens with Amihan, heat-hardy crops and mulched legumes with Tag-init, and water-resilient trellised crops with Habagat peak rainfall.` : ''}
5. DURATION BUDGET:
   - The cumulative maturity days of chosen crops MUST sum up close to ${durationDays} days (target approximately ${expectedCropCount} sequential crops).
7. TAILORED ORGANIC CARE MILESTONES:
   - For EACH crop, provide 4 to 6 sequential organic care milestones from Day 0 (sowing/transplanting) to Day maturityDays (harvest).
   - Include specific organic practices tailored to that crop and San Pablo's climate (e.g., bio-fertilizer application, trellis training, organic neem pest scouting, fruit bagging, compost mulching, harvest residue tilling).

Return ONLY a JSON object with this exact structure:
{
  "climateSummary": "<2-3 sentences explaining San Pablo City's current climate and how this sequential rotation adapts to the local weather and volcanic soil>",
  "rotationPlan": [
    {
      "cropName": "<Crop name>",
      "botanicalFamily": "<Botanical family, e.g. Fabaceae, Brassicaceae, Solanaceae>",
      "maturityDays": <number of days to maturity>,
      "agronomicReason": "<Concise scientific explanation of why this crop follows the predecessor, highlighting botanical family rotation, disease disruption, and soil nutrient replenishment>",
      "climateReason": "<Concise explanation of why this crop is well-suited to San Pablo City's climate and weather during its growth window>",
      "milestones": [
        {
          "offsetDays": 0,
          "label": "preparation",
          "title": "<Milestone title, e.g. Bed Preparation & Direct Sowing>",
          "description": "<Specific organic instructions for this crop in volcanic soil>"
        },
        {
          "offsetDays": 14,
          "label": "growth",
          "title": "<Milestone title, e.g. Trellis Training or Organic Foliar Spray>",
          "description": "<Specific growth maintenance instructions>"
        },
        {
          "offsetDays": 30,
          "label": "checkup",
          "title": "<Milestone title, e.g. Pest Scouting & Leaf Inspection>",
          "description": "<Scouting and organic IPM instructions>"
        },
        {
          "offsetDays": 45,
          "label": "growth",
          "title": "<Milestone title, e.g. Harvesting & Soil Reconditioning>",
          "description": "<Harvesting and root residue incorporation instructions>"
        }
      ]
    }
  ]
}`;

  let userPrompt = `TARGET REGION: San Pablo City, Laguna, Philippines (Volcanic loam soil, 7 crater lakes microclimate).
PLANNING TIMELINE: Duration: ${durationDays} Days, Starting: ${startDate.toDateString()} (${startMonthName}), Target Season: "${season}".
LOCAL CLIMATE CONTEXT:
- Seasonal Monsoon Phase: ${monsoonPhase}
${weatherContext ? `- ${weatherContext}` : ''}
${longRangePromptBlock ? longRangePromptBlock : ''}
`;

  if (previousCrop && previousCrop.crop) {
    userPrompt += `\nCRITICAL PLOT HISTORY:
The bed previously grew "${previousCrop.crop}" (Family: ${previousCrop.family || 'General'}, Nitrogen Demand: ${previousCrop.nitrogen_demand || 'Med'}, Nitrogen Supply: ${previousCrop.nitrogen_contribution || 'Low'}).
MANDATORY: The very first crop in your rotation plan MUST be an ideal successor that rotates away from ${previousCrop.family || 'the previous botanical family'} to break pest/disease cycles and restore soil nutrients.\n`;
  }

  userPrompt += `\nFarm's Available Crop Inventory:\n${catalogSummary}\n`;

  const provider = resolveProvider();
  const providerLabel = provider === 'openrouter' ? 'OpenRouter' : 'Gemini';
  const modelUsed =
    provider === 'openrouter'
      ? process.env.EXPO_PUBLIC_OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL
      : process.env.EXPO_PUBLIC_GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;

  try {
    console.log(`[Crop Planner] Requesting AI crop succession via ${providerLabel} (${modelUsed})...`);
    const rawResponse =
      provider === 'openrouter'
        ? await generateWithOpenRouter(systemInstruction, userPrompt)
        : await generateWithGemini(systemInstruction, userPrompt);

    const planResult = parseAiRotationResponse(rawResponse, providerLabel, provider, modelUsed);

    if (planResult.rotationPlan.length > 0) {
      console.log(
        `[Crop Planner] Successfully received ${planResult.rotationPlan.length}-crop plan from ${providerLabel} (${modelUsed})!`
      );
      return planResult;
    }
  } catch (error) {
    console.warn(`[Crop Planner] Cloud AI (${providerLabel}) error:`, error);
  }

  // Resilient fallback: Generate high-quality rule-based succession plan locally if AI is busy or offline
  console.log('[Crop Planner] Activating local deterministic rule engine...');
  const fallbackPlan = generateLocalRuleBasedPlan(duration, season, availableCrops);
  if (fallbackPlan.rotationPlan.length > 0) {
    return fallbackPlan;
  }

  throw new Error('Unable to generate crop rotation plan. Please verify selected season and crops.');
}
