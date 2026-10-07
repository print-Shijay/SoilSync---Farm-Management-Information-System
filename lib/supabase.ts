import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// 1. Use the || operator to provide a safe fallback instead of the ! operator
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lhliufagsrbkdpmfltiw.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'MISSING-KEY';
const supabaseHost = new URL(supabaseUrl).hostname;

export const SUPABASE_AUTH_STORAGE_KEY = `sb-${supabaseHost.split('.')[0]}-auth-token`;

// 2. Log a loud warning to your terminal so you aren't guessing
if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('⚠️ WARNING: SUPABASE VARIABLES ARE MISSING! Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: async (_name, _acquireTimeout, fn) => await fn(),
  },
});

export async function clearSupabaseAuthStorage() {
  await Promise.all([
    AsyncStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY),
    AsyncStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-user`),
    AsyncStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`),
  ]);
}
