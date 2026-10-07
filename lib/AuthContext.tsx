import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { powersync, disconnectPowerSync } from './powersync';
import { clearSupabaseAuthStorage, supabase, SUPABASE_AUTH_STORAGE_KEY } from './supabase';
import { initializeDatabaseForSession, syncLocalAndCloud } from './sync';
import { logUserAction } from './logger';
import { checkIsOrganicFarmPartner } from './partner';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

interface ProfileUpdate {
  email?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profileIconUrl?: string;
}

export interface AccountStatusInfo {
  isSoftDeleted: boolean;
  deletedAt: string | null;
  scheduledPurgeAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  deletionReason: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  databaseReady: boolean;
  isFarmPartner: boolean;
  accountStatus: AccountStatusInfo | null;

  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<any>;

  signIn: (email: string, password: string) => Promise<any>;

  signInWithGoogle: () => Promise<any>;

  verifyMfaLogin: (factorId: string, code: string) => Promise<any>;

  signOut: (options?: { force?: boolean }) => Promise<void>;

  syncNow: () => Promise<void>;

  updateProfile: (updates: ProfileUpdate) => Promise<void>;

  updatePassword: (newPassword: string) => Promise<void>;

  deleteAccount: (reason?: string) => Promise<void>;

  archiveAccount: (reason?: string) => Promise<void>;

  restoreAccount: () => Promise<void>;

  cancelAccountDeletion: () => Promise<void>;

  checkAccountStatus: (targetUserId?: string) => Promise<AccountStatusInfo | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const OFFLINE_USER_CACHE_KEY = 'soilsync:offline_user_cache';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const [session, setSession] = useState<Session | null>(null);

  const [loading, setLoading] = useState(true);
  const [isFarmPartner, setIsFarmPartner] = useState(false);

  const [databaseReady, setDatabaseReady] = useState(false);
  const databaseInitPromiseRef = useRef<Promise<void> | null>(null);
  const databaseUserIdRef = useRef<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatusInfo | null>(null);

  const fetchAccountStatus = useCallback(async (userId: string): Promise<AccountStatusInfo | null> => {
    try {
      // 1. Check public.users database table
      const { data, error } = await supabase
        .from('users')
        .select('deleted_at, scheduled_purge_at, is_archived, archived_at, deletion_reason')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        const isSoftDeleted = Boolean(data.deleted_at);
        const isArchived = Boolean(data.is_archived);

        if (isSoftDeleted || isArchived) {
          return {
            isSoftDeleted,
            deletedAt: data.deleted_at ?? null,
            scheduledPurgeAt: data.scheduled_purge_at ?? null,
            isArchived,
            archivedAt: data.archived_at ?? null,
            deletionReason: data.deletion_reason ?? null,
          };
        }

        // Database record is active and authoritative
        return null;
      }

      // 2. Fallback: check Supabase Auth user metadata
      try {
        const { data: authUserData } = await supabase.auth.getUser();
        const meta = authUserData?.user?.user_metadata;
        if (meta?.is_soft_deleted || meta?.is_archived) {
          return {
            isSoftDeleted: Boolean(meta.is_soft_deleted),
            deletedAt: meta.deleted_at ?? null,
            scheduledPurgeAt: meta.scheduled_purge_at ?? null,
            isArchived: Boolean(meta.is_archived),
            archivedAt: meta.archived_at ?? null,
            deletionReason: meta.deletion_reason ?? null,
          };
        }
      } catch {
        // Ignore auth metadata check error
      }

      return null;
    } catch (err) {
      console.warn('[Auth] Error fetching account status:', err);
      return null;
    }
  }, []);

  const saveOfflineSessionCache = useCallback(async (sess: Session | null) => {
    if (sess?.user) {
      try {
        await AsyncStorage.setItem(OFFLINE_USER_CACHE_KEY, JSON.stringify(sess));
      } catch (e) {
        console.error('[Auth] Failed to cache offline session:', e);
      }
    }
  }, []);

  const clearOfflineSessionCache = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(OFFLINE_USER_CACHE_KEY);
    } catch (e) {
      console.error('[Auth] Failed to clear offline session cache:', e);
    }
  }, []);

  const initializeDatabase = useCallback(async (nextSession: Session) => {
    const nextUserId = nextSession.user.id;

    if (!databaseInitPromiseRef.current) {
      databaseUserIdRef.current = nextUserId;
      databaseInitPromiseRef.current = (async () => {
        try {
          console.log('[Auth][Database] Opening cloud-backed local database...', {
            userId: nextUserId,
          });
          setDatabaseReady(false);

          await initializeDatabaseForSession();

          setDatabaseReady(true);
          console.log('[Auth][Database] Cloud-backed local database ready.', {
            userId: nextUserId,
          });
        } catch (error) {
          console.error(
            '[Auth][Database] Failed to initialize cloud-backed local database:',
            error
          );
          setDatabaseReady(false);
          databaseInitPromiseRef.current = null;
          databaseUserIdRef.current = null;
          throw error;
        }
      })();
    } else if (databaseUserIdRef.current !== nextUserId) {
      databaseInitPromiseRef.current = null;
      databaseUserIdRef.current = null;
      return initializeDatabase(nextSession);
    }

    await databaseInitPromiseRef.current;
  }, []);

  const clearInvalidStoredSession = useCallback(
    async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);

      console.log('[Auth] Clearing invalid or deleted stored Supabase session.', { message });
      await clearOfflineSessionCache();
      await clearSupabaseAuthStorage();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      await disconnectPowerSync({ clearLocal: true }).catch((err) =>
        console.error('[Auth] Failed to clear local PowerSync database on invalid session:', err)
      );
      setSession(null);
      setUser(null);
      setDatabaseReady(false);
      databaseInitPromiseRef.current = null;
      databaseUserIdRef.current = null;
      return true;
    },
    [clearOfflineSessionCache]
  );

  const initialize = useCallback(async () => {
    try {
      let activeSession: Session | null = null;
      let isOnline = true;

      try {
        const netState = await Network.getNetworkStateAsync();
        isOnline = Boolean(netState.isConnected && netState.isInternetReachable !== false);
      } catch {
        isOnline = true;
      }

      const hasStoredSessionKey = Boolean(
        (await AsyncStorage.getItem(SUPABASE_AUTH_STORAGE_KEY)) ||
        (await AsyncStorage.getItem(OFFLINE_USER_CACHE_KEY))
      );

      if (isOnline) {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.log('[Auth] Online getSession error:', error.message);
            await clearInvalidStoredSession(error);
            return;
          }

          if (data.session) {
            // When online, validate with Supabase backend server that the user account still exists in auth.users
            try {
              const { data: userData, error: userError } = await Promise.race([
                supabase.auth.getUser(),
                new Promise<{ data: { user: null }; error: Error }>((_, reject) =>
                  setTimeout(() => reject(new Error('Validation timeout')), 5000)
                ),
              ]);

              if (userError || !userData?.user) {
                console.log(
                  '[Auth] Online user validation failed (account deleted or session revoked):',
                  userError?.message
                );
                await clearInvalidStoredSession(
                  userError || new Error('User account no longer exists in database/authentication')
                );
                return;
              }
            } catch (validationErr) {
              const msg =
                validationErr instanceof Error ? validationErr.message : String(validationErr);
              if (
                !msg.includes('Network') &&
                !msg.includes('timeout') &&
                !msg.includes('Failed to fetch')
              ) {
                console.log('[Auth] Server rejected user validation:', msg);
                await clearInvalidStoredSession(validationErr);
                return;
              }
            }

            activeSession = data.session;
          } else if (hasStoredSessionKey) {
            console.log('[Auth] Online session missing for stored token, clearing session.');
            await clearInvalidStoredSession(new Error('Invalid or deleted user session'));
            return;
          }
        } catch (err) {
          console.log(
            '[Auth] Network error getting session online, falling back to offline cache:',
            err
          );
        }
      }

      // Offline fallback: ONLY read cached session from disk if device is TRULY OFFLINE
      if (!activeSession && !isOnline) {
        const cachedStr = await AsyncStorage.getItem(OFFLINE_USER_CACHE_KEY);
        if (cachedStr) {
          try {
            const cachedSession = JSON.parse(cachedStr);
            if (cachedSession?.user) {
              console.log(
                '[Auth] Offline mode active: Using cached user session',
                cachedSession.user.email
              );
              activeSession = cachedSession;
            }
          } catch (e) {
            console.error('[Auth] Failed to parse cached offline session:', e);
          }
        }

        if (!activeSession) {
          const storedStr = await AsyncStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
          if (storedStr) {
            try {
              const storedSession = JSON.parse(storedStr);
              if (storedSession?.user) {
                console.log('[Auth] Offline fallback: Using Supabase stored session');
                activeSession = storedSession;
              }
            } catch (e) {
              console.error('[Auth] Failed to parse stored session:', e);
            }
          }
        }
      }

      if (activeSession?.user) {
        await saveOfflineSessionCache(activeSession);
      }

      setSession(activeSession);
      setUser(activeSession?.user ?? null);

      if (activeSession?.user?.email) {
        checkIsOrganicFarmPartner(activeSession.user.email)
          .then((status) => setIsFarmPartner(status))
          .catch(() => setIsFarmPartner(false));
      } else {
        setIsFarmPartner(false);
      }

      if (activeSession?.user) {
        const statusInfo = await fetchAccountStatus(activeSession.user.id);
        if (statusInfo) {
          console.log('[Auth] Active session belongs to an archived or pending deletion account.');
          setAccountStatus(statusInfo);
        } else {
          setAccountStatus(null);
          await initializeDatabase(activeSession).catch((err) => {
            console.log('[Auth] Database init offline notice:', err);
          });
        }
      }
    } catch (error) {
      console.error('Initial auth setup failed:', error);
      await clearInvalidStoredSession(error);
    } finally {
      setLoading(false);
    }
  }, [clearInvalidStoredSession, initializeDatabase, saveOfflineSessionCache, fetchAccountStatus]);

  useEffect(() => {
    let isMounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    const startAuth = async () => {
      await initialize();

      if (!isMounted) {
        return;
      }

      const authListener = supabase.auth.onAuthStateChange((event, currentSession) => {
        console.log('[Auth] Auth state changed:', event);

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);

          if (currentSession.user.email) {
            checkIsOrganicFarmPartner(currentSession.user.email)
              .then((status) => setIsFarmPartner(status))
              .catch(() => setIsFarmPartner(false));
          }

          // Defer async checks and side effects to next event loop tick
          // to prevent holding Supabase Auth SDK lock during updateUser()
          setTimeout(async () => {
            const statusInfo = await fetchAccountStatus(currentSession.user.id);
            if (statusInfo) {
              console.log('[Auth] User account is deactivated or scheduled for deletion. Pausing database initialization.');
              setAccountStatus(statusInfo);
              return;
            } else {
              setAccountStatus(null);
            }

            let mfaRequired = false;
            if (event !== 'MFA_CHALLENGE_VERIFIED' && event !== 'USER_UPDATED') {
              try {
                const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
                if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
                  mfaRequired = true;
                }
              } catch {
                // Ignore error
              }
            }

            if (mfaRequired) {
              console.log(
                '[Auth] AAL1 session active, waiting for AAL2 MFA verification before initializing database.'
              );
              return;
            }

            await saveOfflineSessionCache(currentSession).catch((err) =>
              console.error('[Auth] Cache save error:', err)
            );

            initializeDatabase(currentSession).catch((error) => {
              console.error('[Auth][Database] Auth state database initialization failed:', error);
            });
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          setTimeout(async () => {
            await clearOfflineSessionCache();
            await disconnectPowerSync({ clearLocal: true }).catch((error) => {
              console.error('[Auth][Database] Failed to clear local database on sign-out:', error);
            });
            setSession(null);
            setUser(null);
            setIsFarmPartner(false);
            setDatabaseReady(false);
            databaseInitPromiseRef.current = null;
            databaseUserIdRef.current = null;
          }, 0);
        }
      });

      subscription = authListener.data.subscription;
    };

    void startAuth();

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [initialize, initializeDatabase, saveOfflineSessionCache, clearOfflineSessionCache]);

  async function syncNow() {
    try {
      await syncLocalAndCloud();

      console.log('Manual sync completed');
    } catch (error) {
      console.error('Manual sync failed:', error);

      throw error;
    }
  }

  async function signUp(email: string, password: string, firstName: string, lastName: string) {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });
  }

  async function updateProfile(updates: ProfileUpdate) {
    // Helper to wrap promises with a timeout so requests never hang infinitely
    const withTimeout = <T,>(promise: Promise<T>, ms: number, stepName: string): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`[Auth] ${stepName} timed out after ${ms}ms`)), ms)
        ),
      ]);
    };

    // 1. Update Supabase Auth (email + metadata)
    const authUpdates: { email?: string; data?: Record<string, string> } = {};
    if (updates.email) {
      authUpdates.email = updates.email;
    }
    const metaData: Record<string, string> = {};
    if (updates.firstName !== undefined) {
      metaData.first_name = updates.firstName;
    }
    if (updates.lastName !== undefined) {
      metaData.last_name = updates.lastName;
    }
    if (updates.profileIconUrl !== undefined) {
      metaData.profile_icon_url = updates.profileIconUrl;
    }
    if (Object.keys(metaData).length > 0) {
      authUpdates.data = metaData;
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await withTimeout(
        supabase.auth.updateUser(authUpdates),
        10000,
        'supabase.auth.updateUser'
      );
      if (authError) {
        throw new Error(authError.message);
      }
    }

    // 2. Update public.users table (first_name, last_name, phone_number, email, profile_icon_url)
    if (user) {
      const dbUpdates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.firstName !== undefined) dbUpdates.first_name = updates.firstName;
      if (updates.lastName !== undefined) dbUpdates.last_name = updates.lastName;
      if (updates.phoneNumber !== undefined) dbUpdates.phone_number = updates.phoneNumber;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.profileIconUrl !== undefined) dbUpdates.profile_icon_url = updates.profileIconUrl;

      if (Object.keys(dbUpdates).length > 1) {
        const dbRes = (await withTimeout(
          Promise.resolve(
            supabase
              .from('users')
              .update(dbUpdates)
              .eq('id', user.id)
          ),
          10000,
          'public.users update'
        ).catch((err) => {
          console.warn('[Auth][updateProfile] Step 2 error/timeout:', err);
          return { error: err };
        })) as { error?: any };
        if (dbRes?.error) {
          console.warn('[Auth][updateProfile] Failed to update public.users table:', dbRes.error);
        }
      }
    }

    // 3. Refresh the local user state
    try {
      const {
        data: { user: refreshedUser },
      } = await withTimeout(
        supabase.auth.getUser(),
        5000,
        'supabase.auth.getUser'
      );
      if (refreshedUser) {
        setUser(refreshedUser);
      }
    } catch (refreshErr) {
      console.warn('[Auth][updateProfile] User refresh timed out or failed:', refreshErr);
    }
  }

  async function updatePassword(newPassword: string) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { has_password: true },
    });
    if (error) {
      throw new Error(error.message);
    }
    if (data?.user) {
      setUser(data.user);
      if (session) {
        await saveOfflineSessionCache({
          ...session,
          user: data.user,
        });
      }
    }
  }

  async function deleteAccount(reason?: string) {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession) {
      throw new Error('No active session. Please sign in again.');
    }

    const nowIso = new Date().toISOString();
    const scheduledPurgeIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. First attempt safe RPC function
    const { error: rpcErr } = await supabase.rpc('soft_delete_account', {
      reason: reason || null,
    });

    // 2. If RPC is not available, execute direct update on public.users table
    if (rpcErr) {
      const { error: updateErr } = await supabase
        .from('users')
        .update({
          deleted_at: nowIso,
          scheduled_purge_at: scheduledPurgeIso,
          deletion_reason: reason || null,
          is_archived: false,
          archived_at: null,
          updated_at: nowIso,
        })
        .eq('id', currentSession.user.id);

      if (updateErr) {
        throw new Error(
          'Failed to schedule account deletion: ' +
            (updateErr.message || 'Database update failed. Please ensure the migration is executed.')
        );
      }
    }

    // 3. Update Supabase Auth user metadata
    await supabase.auth
      .updateUser({
        data: {
          is_soft_deleted: true,
          deleted_at: nowIso,
          scheduled_purge_at: scheduledPurgeIso,
          is_archived: false,
        },
      })
      .catch((err) => console.warn('[Auth] Metadata update notice:', err));

    await logUserAction('ACCOUNT_DELETION_SCHEDULED', { reason }).catch(() => undefined);

    // 4. Clear local state and session
    await disconnectPowerSync({ clearLocal: true }).catch((err) =>
      console.error('[Auth] Failed to clear PowerSync on account deletion:', err)
    );
    await clearOfflineSessionCache();
    await clearSupabaseAuthStorage();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

    setDatabaseReady(false);
    setUser(null);
    setSession(null);
    setAccountStatus(null);
    databaseInitPromiseRef.current = null;
    databaseUserIdRef.current = null;

    console.log('[Auth] Account scheduled for deletion in 30 days and local state cleared.');
  }

  async function archiveAccount(reason?: string) {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession) {
      throw new Error('No active session. Please sign in again.');
    }

    const nowIso = new Date().toISOString();

    // 1. First attempt safe RPC function
    const { error: rpcErr } = await supabase.rpc('archive_account', {
      reason: reason || null,
    });

    // 2. If RPC is not available, execute direct update on public.users table
    if (rpcErr) {
      const { error: updateErr } = await supabase
        .from('users')
        .update({
          is_archived: true,
          archived_at: nowIso,
          deleted_at: null,
          scheduled_purge_at: null,
          deletion_reason: reason || null,
          updated_at: nowIso,
        })
        .eq('id', currentSession.user.id);

      if (updateErr) {
        throw new Error(
          'Failed to archive account: ' +
            (updateErr.message || 'Database update failed. Please ensure the migration is executed.')
        );
      }
    }

    // 3. Update Supabase Auth user metadata
    await supabase.auth
      .updateUser({
        data: {
          is_archived: true,
          archived_at: nowIso,
          is_soft_deleted: false,
        },
      })
      .catch((err) => console.warn('[Auth] Metadata update notice:', err));

    await logUserAction('ACCOUNT_ARCHIVED', { reason }).catch(() => undefined);

    // 4. Clear local state and session
    await disconnectPowerSync({ clearLocal: true }).catch((err) =>
      console.error('[Auth] Failed to clear PowerSync on account archival:', err)
    );
    await clearOfflineSessionCache();
    await clearSupabaseAuthStorage();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

    setDatabaseReady(false);
    setUser(null);
    setSession(null);
    setAccountStatus(null);
    databaseInitPromiseRef.current = null;
    databaseUserIdRef.current = null;

    console.log('[Auth] Account archived and local state cleared.');
  }

  async function restoreAccount() {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession) {
      throw new Error('No active session. Please sign in again.');
    }

    const nowIso = new Date().toISOString();

    // 1. First attempt safe RPC function
    const { error: rpcErr } = await supabase.rpc('restore_account');

    // 2. If RPC is not available, execute direct update on public.users table
    if (rpcErr) {
      const { error: updateErr } = await supabase
        .from('users')
        .update({
          deleted_at: null,
          scheduled_purge_at: null,
          deletion_reason: null,
          is_archived: false,
          archived_at: null,
          updated_at: nowIso,
        })
        .eq('id', currentSession.user.id);

      if (updateErr) {
        throw new Error(
          'Failed to restore account: ' +
            (updateErr.message || 'Database update failed. Please ensure the migration is executed.')
        );
      }
    }

    // 3. Update Supabase Auth user metadata
    await supabase.auth
      .updateUser({
        data: {
          is_soft_deleted: false,
          is_archived: false,
          deleted_at: null,
          scheduled_purge_at: null,
          archived_at: null,
        },
      })
      .catch((err) => console.warn('[Auth] Metadata update notice:', err));

    setAccountStatus(null);

    await logUserAction('ACCOUNT_RESTORED', { method: 'reactivation_modal' }).catch(() => undefined);

    // 4. Initialize database for the restored session
    await initializeDatabase(currentSession);

    console.log('[Auth] Account successfully restored and database initialized.');
  }

  const cancelAccountDeletion = restoreAccount;

  const checkAccountStatus = useCallback(
    async (targetUserId?: string) => {
      const uid = targetUserId || user?.id || session?.user?.id;
      if (!uid) return null;
      const status = await fetchAccountStatus(uid);
      setAccountStatus(status);
      return status;
    },
    [user?.id, session?.user?.id, fetchAccountStatus]
  );

  async function signIn(email: string, password: string) {
    const response = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (response.error) {
      return response;
    }

    // Check if MFA (AAL2) is required for this user
    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totpFactor = factors?.totp?.find((f) => f.status === 'verified');
        if (totpFactor) {
          return {
            ...response,
            requiresMfa: true,
            factorId: totpFactor.id,
          };
        }
      }
    } catch (mfaCheckErr) {
      console.warn('[Auth] Error checking MFA status:', mfaCheckErr);
    }

    // Check if user account is deactivated or scheduled for deletion
    if (response.data.user) {
      const statusInfo = await fetchAccountStatus(response.data.user.id);
      if (statusInfo) {
        setAccountStatus(statusInfo);
        return {
          ...response,
          requiresReactivation: true,
          accountStatus: statusInfo,
        };
      }
    }

    if (response.data.session) {
      initializeDatabase(response.data.session).catch((err) => {
        console.warn('[Auth] Database background init notice:', err);
      });
    }

    return response;
  }

  async function signInWithGoogle() {
    try {
      const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
      if (!webClientId) {
        return {
          error: {
            message:
              'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing in your .env file. Please restart Metro or add it.',
          },
        };
      }

      GoogleSignin.configure({
        webClientId,
      });

      // Clear any cached Google account session so the account chooser modal is always presented
      await GoogleSignin.signOut().catch(() => undefined);

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();

      if (!userInfo.data?.idToken) {
        return { error: { message: 'No ID token returned from Google Sign-In.' } };
      }

      const response = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: userInfo.data.idToken,
      });

      if (response.error) {
        return response;
      }

      // Check if MFA (AAL2) is required for this user
      try {
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalData && aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          const totpFactor = factors?.totp?.find((f) => f.status === 'verified');
          if (totpFactor) {
            return {
              ...response,
              requiresMfa: true,
              factorId: totpFactor.id,
            };
          }
        }
      } catch (mfaCheckErr) {
        console.warn('[Auth] Error checking MFA status for Google login:', mfaCheckErr);
      }

      // Check if user account is deactivated or scheduled for deletion
      if (response.data.user) {
        const statusInfo = await fetchAccountStatus(response.data.user.id);
        if (statusInfo) {
          setAccountStatus(statusInfo);
          return {
            ...response,
            requiresReactivation: true,
            accountStatus: statusInfo,
          };
        }
      }

      if (response.data.session) {
        initializeDatabase(response.data.session).catch((err) => {
          console.warn('[Auth] Database background init notice:', err);
        });
      }

      return response;
    } catch (err: any) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        return { error: { message: 'Google sign-in was cancelled.' } };
      } else if (err.code === statusCodes.IN_PROGRESS) {
        return { error: { message: 'Google sign-in is already in progress.' } };
      } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { error: { message: 'Google Play Services not available or outdated.' } };
      } else {
        return {
          error: {
            message: err?.message || 'An unexpected error occurred during Google Sign-In.',
          },
        };
      }
    }
  }

  async function verifyMfaLogin(factorId: string, code: string) {
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) {
      return { error: challengeError };
    }

    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });

    if (verifyError) {
      return { error: verifyError };
    }

    const currentSession =
      (verifyData as any)?.session || (await supabase.auth.getSession()).data.session;

    if (currentSession) {
      setSession(currentSession);
      setUser(currentSession.user);
      await saveOfflineSessionCache(currentSession);

      const statusInfo = await fetchAccountStatus(currentSession.user.id);
      if (statusInfo) {
        setAccountStatus(statusInfo);
        return {
          data: verifyData,
          error: null,
          requiresReactivation: true,
          accountStatus: statusInfo,
        };
      }

      // Initialize database with a safety timeout so login never hangs
      try {
        await Promise.race([
          initializeDatabase(currentSession),
          new Promise((resolve) => setTimeout(resolve, 6000)),
        ]);
      } catch (err) {
        console.warn('[Auth] Database init notice after MFA verification:', err);
      }
    }

    return { data: verifyData, error: null };
  }

  async function signOut(options?: { force?: boolean }) {
    await logUserAction('LOGOUT');
    const isForce = options?.force === true;

    if (!isForce) {
      // Attempt to wait for any pending uploads to finish before signing out
      try {
        console.log('Waiting for pending uploads before sign out...');
        let stats = await powersync.getUploadQueueStats();
        let retries = 0;
        // Wait up to 5 seconds for uploads to finish
        while (stats.count > 0 && retries < 10) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          stats = await powersync.getUploadQueueStats();
          retries++;
        }
        if (stats.count > 0) {
          console.warn('Sign out proceeding with pending uploads. Some local data may be lost.');
        }
      } catch (e) {
        console.warn('Error while waiting for uploads on sign out:', e);
      }
    } else {
      console.log('Force sign out initiated. Bypassing upload queue wait...');
    }

    await clearOfflineSessionCache();
    await supabase.auth.signOut().catch(() => undefined);
    await GoogleSignin.signOut().catch(() => undefined);

    await disconnectPowerSync({ clearLocal: true }).catch((error) => {
      console.error('[Auth][Database] Failed to clear local database on sign-out:', error);
    });

    setDatabaseReady(false);
    setUser(null);
    setSession(null);
    setAccountStatus(null);
    databaseInitPromiseRef.current = null;
    databaseUserIdRef.current = null;

    console.log(isForce ? 'Force signed out' : 'Signed out');
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        databaseReady,
        isFarmPartner,
        accountStatus,

        signUp,
        signIn,
        signInWithGoogle,
        verifyMfaLogin,
        signOut,

        syncNow,

        updateProfile,
        updatePassword,
        deleteAccount,
        archiveAccount,
        restoreAccount,
        cancelAccountDeletion,
        checkAccountStatus,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}

/**
 * Determines whether the user has a password configured.
 * Users who signed up via Google OAuth without ever setting a password do not have a password.
 */
export function userHasPassword(user: User | null): boolean {
  if (!user) return false;

  // 1. Explicit metadata flag set when user creates a password
  if (user.user_metadata?.has_password === true) {
    return true;
  }

  // 2. Check identities if available
  const identities = user.identities || [];
  const hasEmailIdentity = identities.some((id: any) => id.provider === 'email');
  if (hasEmailIdentity) {
    return true;
  }

  // 3. Check app_metadata providers
  const appMeta = user.app_metadata || {};
  const providers = (appMeta.providers as string[]) || [];
  if (providers.includes('email') || appMeta.provider === 'email') {
    return true;
  }

  // If the user's primary provider is 'google' and there's no email provider/identity or password flag:
  return false;
}
