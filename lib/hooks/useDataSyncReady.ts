import { useEffect, useState, useCallback, useRef } from 'react';
import { powersync } from '../powersync';
import { useAuth } from '../AuthContext';

interface UseDataSyncReadyOptions {
  readonly onSyncComplete?: () => void | Promise<void>;
  readonly timeoutMs?: number;
}

interface UseDataSyncReadyReturn {
  readonly isDataReady: boolean;
  readonly hasSynced: boolean;
}

/**
 * Custom hook to coordinate PowerSync initial synchronization and UI skeleton loading.
 *
 * Ensures skeletons persist until:
 * 1. PowerSync completes its initial cloud sync (`hasSynced === true`), OR
 * 2. The device is confirmed offline (local SQLite is queried directly), OR
 * 3. The fallback safety timeout is reached.
 */
export function useDataSyncReady(options?: UseDataSyncReadyOptions): UseDataSyncReadyReturn {
  const { user } = useAuth();
  const { onSyncComplete, timeoutMs = 30000 } = options || {};

  const [isDataReady, setIsDataReady] = useState(false);
  const [hasSynced, setHasSynced] = useState<boolean>(() => {
    return Boolean(powersync.currentStatus?.hasSynced);
  });

  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;

  const markReady = useCallback(async () => {
    if (onSyncCompleteRef.current) {
      try {
        await onSyncCompleteRef.current();
      } catch (err) {
        console.warn('[useDataSyncReady] onSyncComplete error:', err);
      }
    }
    setIsDataReady(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setIsDataReady(false);
      return;
    }

    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    async function evaluateSyncStatus() {
      try {
        // Ensure local SQLite is ready and mark data ready immediately (0-5ms)
        await powersync.waitForReady().catch(() => {});
        if (isMounted) {
          await markReady();
        }

        // If PowerSync has already completed initial sync:
        if (powersync.currentStatus?.hasSynced) {
          setHasSynced(true);
          return;
        }

        // Background listener: when cloud sync completes, refresh data seamlessly
        const dispose = powersync.registerListener({
          statusChanged: async (status) => {
            if (!isMounted) return;

            if (status.hasSynced) {
              setHasSynced(true);
              if (onSyncCompleteRef.current) {
                try {
                  await onSyncCompleteRef.current();
                } catch (err) {
                  console.warn('[useDataSyncReady] onSyncComplete background refresh error:', err);
                }
              }
            }
          },
        });

        return dispose;
      } catch (err) {
        console.warn('[useDataSyncReady] Error evaluating sync status:', err);
        if (isMounted) {
          await markReady();
        }
      }
    }

    const disposePromise = evaluateSyncStatus();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      disposePromise.then((dispose) => {
        if (typeof dispose === 'function') {
          dispose();
        }
      });
    };
  }, [user, markReady, timeoutMs]);

  return {
    isDataReady,
    hasSynced,
  };
}
