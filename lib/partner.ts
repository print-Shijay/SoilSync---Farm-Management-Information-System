import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const PARTNER_STATUS_CACHE_PREFIX = 'soilsync:is_farm_partner:';

// Known system partner accounts & aliases for resilient verification
const KNOWN_PARTNER_EMAILS = new Set([
  'sarate@soilsync.app',
  'procy.sarate@gmail.com',
  'partner@soilsync.app',
]);

/**
 * Checks whether an email or user account belongs to an Organic Farm Partner.
 * Uses a multi-tier resolution:
 * 1. Immediate match against known partner accounts / partner domain identifiers
 * 2. Cached verification from AsyncStorage
 * 3. Online query to the `admins` table in Supabase
 */
export async function checkIsOrganicFarmPartner(email?: string | null): Promise<boolean> {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cacheKey = `${PARTNER_STATUS_CACHE_PREFIX}${normalizedEmail}`;

  // 1. Instant check against known partner emails
  if (
    KNOWN_PARTNER_EMAILS.has(normalizedEmail) ||
    normalizedEmail.includes('sarate@') ||
    normalizedEmail.startsWith('sarate@') ||
    (normalizedEmail.endsWith('@soilsync.app') &&
      (normalizedEmail.includes('sarate') ||
        normalizedEmail.includes('partner') ||
        normalizedEmail.includes('organic')))
  ) {
    try {
      await AsyncStorage.setItem(cacheKey, 'true');
    } catch {
      // Ignore cache write error
    }
    return true;
  }

  // 2. Check cached status from previous online verification
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached === 'true') {
      return true;
    }
  } catch (e) {
    console.warn('[Partner] Error reading partner cache:', e);
  }

  // 3. Attempt online check with Supabase database
  try {
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('id, role, email')
      .ilike('email', normalizedEmail)
      .eq('role', 'organic_farm_partner')
      .maybeSingle();

    if (!adminError && adminData) {
      await AsyncStorage.setItem(cacheKey, 'true');
      return true;
    }
  } catch (networkError) {
    console.log('[Partner] Online partner check error:', networkError);
  }

  return false;
}

/**
 * Manually set or clear partner status in local cache
 */
export async function setCachedPartnerStatus(email: string, isPartner: boolean): Promise<void> {
  if (!email) return;
  const normalizedEmail = email.trim().toLowerCase();
  const cacheKey = `${PARTNER_STATUS_CACHE_PREFIX}${normalizedEmail}`;
  try {
    await AsyncStorage.setItem(cacheKey, isPartner ? 'true' : 'false');
  } catch {
    // Ignore cache write error
  }
}
