import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from './local-db';
import { supabase } from './supabase';

const MONTHLY_AI_USAGE_PREFIX = 'soilsync_ai_crop_planner_monthly_usage';
export const MAX_MONTHLY_AI_GENERATIONS = 5;
// Backward compatibility export
export const MAX_DAILY_AI_GENERATIONS = MAX_MONTHLY_AI_GENERATIONS;

interface MonthlyAiUsageCache {
  month: string; // YYYY-MM format
  count: number;
  updatedAt: string;
}

export interface AiUsageStatus {
  count: number;
  remaining: number;
  max: number;
  isLimitReached: boolean;
  verifiedOnline: boolean;
  errorMessage?: string;
}

export interface CheckUsageOptions {
  /**
   * If true, requires successful verification directly against the online Supabase database.
   * If offline or verification fails, the operation is blocked (verifiedOnline = false, isLimitReached = true).
   * Used before calling or making the AI work, because SQLite is untrusted.
   */
  requireOnline?: boolean;
}

/**
 * Computes ISO date strings for current month boundaries and current month key.
 */
export function getCurrentMonthRange(): {
  startOfMonth: string;
  startOfNextMonth: string;
  monthKey: string;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  const startYear = year;
  const startMonthStr = String(month + 1).padStart(2, '0');
  const startOfMonth = `${startYear}-${startMonthStr}-01`;

  const nextMonthDate = new Date(year, month + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonthStr = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
  const startOfNextMonth = `${nextYear}-${nextMonthStr}-01`;

  const monthKey = `${startYear}-${startMonthStr}`;
  return { startOfMonth, startOfNextMonth, monthKey };
}

export function getTodayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolves the authenticated user's ID even if the React state hook hasn't populated yet.
 */
async function resolveEffectiveUserId(userId?: string | null): Promise<string | null> {
  if (userId && userId !== 'anonymous') {
    return userId;
  }
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user?.id) {
      return sessionData.session.user.id;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      return userData.user.id;
    }
  } catch {
    // Ignore session retrieval errors
  }
  return userId && userId !== 'anonymous' ? userId : null;
}

/**
 * Checks the user's monthly AI generation usage.
 *
 * IMPORTANT: Supabase database online is ALWAYS checked first as the single source of truth.
 * Local SQLite is NOT trusted because it can be manipulated, out-of-sync, or cleared on the device.
 */
export async function getMonthlyAiUsage(
  userId?: string | null,
  options?: CheckUsageOptions
): Promise<AiUsageStatus> {
  const requireOnline = !!options?.requireOnline;
  const effectiveUserId = await resolveEffectiveUserId(userId);
  const { startOfMonth, startOfNextMonth, monthKey } = getCurrentMonthRange();

  if (!effectiveUserId) {
    // User is unauthenticated / anonymous
    if (requireOnline) {
      return {
        count: MAX_MONTHLY_AI_GENERATIONS,
        remaining: 0,
        max: MAX_MONTHLY_AI_GENERATIONS,
        isLimitReached: true,
        verifiedOnline: false,
        errorMessage: 'You must be signed in to verify AI usage and generate AI crop plans.',
      };
    }
    return {
      count: 0,
      remaining: MAX_MONTHLY_AI_GENERATIONS,
      max: MAX_MONTHLY_AI_GENERATIONS,
      isLimitReached: false,
      verifiedOnline: false,
    };
  }

  // 1. If online check is NOT strictly required (passive UI rendering/checks), use local SQLite / cache immediately!
  if (!requireOnline) {
    let localCount = 0;
    try {
      const db = getDatabase();
      const rows = await db.all<{ count: number }>(
        `SELECT count FROM user_ai_daily_usage WHERE user_id = ? AND usage_date >= ? AND usage_date < ?`,
        [effectiveUserId, startOfMonth, startOfNextMonth]
      );
      if (rows && rows.length > 0) {
        localCount = rows.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
      } else {
        const storageKey = `${MONTHLY_AI_USAGE_PREFIX}_${effectiveUserId}`;
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          const parsed: MonthlyAiUsageCache = JSON.parse(raw);
          if (parsed.month === monthKey && typeof parsed.count === 'number') {
            localCount = parsed.count;
          }
        }
      }
    } catch {
      // ignore
    }

    const remaining = Math.max(0, MAX_MONTHLY_AI_GENERATIONS - localCount);
    return {
      count: localCount,
      remaining,
      max: MAX_MONTHLY_AI_GENERATIONS,
      isLimitReached: remaining <= 0,
      verifiedOnline: false,
    };
  }

  // 2. Online verification strictly required before generating AI plan (with 3s timeout)
  let onlineCount: number | null = null;
  let onlineFetchError: string | null = null;

  try {
    const fetchPromise = supabase
      .from('user_ai_daily_usage')
      .select('id, count, usage_date')
      .eq('user_id', effectiveUserId)
      .gte('usage_date', startOfMonth)
      .lt('usage_date', startOfNextMonth);

    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'Network timeout' } }), 3000)
    );

    const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

    if (error) {
      console.warn('[AI Usage] Online Supabase check returned error:', error.message);
      onlineFetchError = error.message;
    } else if (Array.isArray(data)) {
      // Sum all recorded usage for the current month
      onlineCount = data.reduce((sum, row) => {
        const countVal = typeof row.count === 'number' ? row.count : 0;
        return sum + countVal;
      }, 0);
    }
  } catch (err: any) {
    console.warn('[AI Usage] Online Supabase check network exception:', err?.message || err);
    onlineFetchError = err?.message || 'Network request failed';
  }

  // If online query succeeded:
  if (onlineCount !== null) {
    const count = onlineCount;
    const remaining = Math.max(0, MAX_MONTHLY_AI_GENERATIONS - count);
    const isLimitReached = remaining <= 0;

    // Cache to AsyncStorage for immediate display on cold app launches
    try {
      const storageKey = `${MONTHLY_AI_USAGE_PREFIX}_${effectiveUserId}`;
      const cache: MonthlyAiUsageCache = {
        month: monthKey,
        count,
        updatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(storageKey, JSON.stringify(cache));
    } catch {
      // Ignore cache write errors
    }

    return {
      count,
      remaining,
      max: MAX_MONTHLY_AI_GENERATIONS,
      isLimitReached,
      verifiedOnline: true,
    };
  }

  // 2. If online check failed:
  // Before making the AI work (requireOnline === true), SQLite or local cache CANNOT be trusted!
  if (requireOnline) {
    return {
      count: MAX_MONTHLY_AI_GENERATIONS,
      remaining: 0,
      max: MAX_MONTHLY_AI_GENERATIONS,
      isLimitReached: true,
      verifiedOnline: false,
      errorMessage:
        'Unable to verify your monthly AI quota online. An active internet connection is required to use AI crop planning.',
    };
  }

  // 3. For passive UI display only (when app is offline and just rendering buttons):
  // Read from AsyncStorage cache (never SQLite, since SQLite is untrusted and prone to view issues)
  let cachedCount = 0;
  try {
    const storageKey = `${MONTHLY_AI_USAGE_PREFIX}_${effectiveUserId}`;
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw) {
      const parsed: MonthlyAiUsageCache = JSON.parse(raw);
      if (parsed.month === monthKey && typeof parsed.count === 'number') {
        cachedCount = parsed.count;
      }
    }
  } catch {
    // Ignore cache read errors
  }

  const remaining = Math.max(0, MAX_MONTHLY_AI_GENERATIONS - cachedCount);
  return {
    count: cachedCount,
    remaining,
    max: MAX_MONTHLY_AI_GENERATIONS,
    isLimitReached: remaining <= 0,
    verifiedOnline: false,
    errorMessage: onlineFetchError || 'Offline mode: Showing cached quota',
  };
}

/**
 * Backward compatibility alias for existing callers.
 */
export const getDailyAiUsage = getMonthlyAiUsage;

/**
 * Records an AI generation usage count directly to Supabase online database.
 * SQLite is updated only as an auxiliary local sync mirror inside a safe try-catch.
 */
export async function recordAiGenerationUsage(userId?: string | null): Promise<AiUsageStatus> {
  const effectiveUserId = await resolveEffectiveUserId(userId);
  if (!effectiveUserId) {
    throw new Error('User must be authenticated online to record AI usage.');
  }

  const today = getTodayKey();
  const compositeId = `${effectiveUserId}_${today}`;
  const nowIso = new Date().toISOString();

  // 1. Fetch current today's usage row from Supabase online
  let todayCount = 0;
  try {
    const { data: todayRow } = await supabase
      .from('user_ai_daily_usage')
      .select('count')
      .eq('id', compositeId)
      .maybeSingle();

    if (todayRow && typeof todayRow.count === 'number') {
      todayCount = todayRow.count;
    }
  } catch (err) {
    console.warn('[AI Usage] Error fetching today row from Supabase before increment:', err);
  }

  const newTodayCount = todayCount + 1;

  // 2. Persist directly to Supabase online database (AWAITED)
  const { error: upsertError } = await supabase
    .from('user_ai_daily_usage')
    .upsert({
      id: compositeId,
      user_id: effectiveUserId,
      usage_date: today,
      count: newTodayCount,
      updated_at: nowIso,
    });

  if (upsertError) {
    console.error('[AI Usage] Failed to save usage to Supabase online:', upsertError);
    throw new Error(`Failed to record AI usage online: ${upsertError.message}`);
  }

  // 3. Immediately re-query online Supabase to get the exact monthly total
  const updatedStatus = await getMonthlyAiUsage(effectiveUserId, { requireOnline: true });

  // 4. Update auxiliary local SQLite DB in a safe try-catch for PowerSync consistency
  try {
    const db = getDatabase();
    const existing = await db.get<{ id: string }>(
      'SELECT id FROM user_ai_daily_usage WHERE id = ?',
      [compositeId]
    );

    if (existing) {
      await db.run(
        'UPDATE user_ai_daily_usage SET count = ?, updated_at = ? WHERE id = ?',
        [newTodayCount, nowIso, compositeId]
      );
    } else {
      await db.run(
        'INSERT INTO user_ai_daily_usage (id, user_id, usage_date, count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [compositeId, effectiveUserId, today, newTodayCount, nowIso, nowIso]
      );
    }
  } catch (err) {
    // Non-fatal: PowerSync views or SQLite view triggers may throw UPSERT/view warnings
    console.warn('[AI Usage] Local SQLite mirror update skipped:', err);
  }

  return updatedStatus;
}

