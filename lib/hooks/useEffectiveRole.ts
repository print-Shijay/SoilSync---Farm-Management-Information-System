import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { powersync } from '../powersync';
import {
  calculatePermissions,
  EffectivePermissions,
  getEffectiveFarmRole,
  getEffectiveFolderRole,
  TeamRole,
} from '../team-operations';

export function useEffectiveRole(options: { farmId?: string; folderId?: string }) {
  const { user } = useAuth();
  const [role, setRole] = useState<TeamRole | null>(null);
  const [permissions, setPermissions] = useState<EffectivePermissions>(calculatePermissions(null));
  const [loading, setLoading] = useState<boolean>(true);

  const checkRole = useCallback(async () => {
    if (!user?.id) {
      setRole(null);
      setPermissions(calculatePermissions(null));
      setLoading(false);
      return;
    }

    try {
      let resolvedRole: TeamRole | null = null;

      if (options.farmId) {
        resolvedRole = await getEffectiveFarmRole(options.farmId, user.id);
      } else if (options.folderId) {
        resolvedRole = await getEffectiveFolderRole(options.folderId, user.id);
      }

      setRole(resolvedRole);
      setPermissions(calculatePermissions(resolvedRole));
    } catch (err) {
      console.warn('[useEffectiveRole] Error resolving role:', err);
      setRole(null);
      setPermissions(calculatePermissions(null));
    } finally {
      setLoading(false);
    }
  }, [options.farmId, options.folderId, user?.id]);

  useEffect(() => {
    checkRole();

    const abortController = new AbortController();

    async function watchChanges() {
      try {
        for await (const _ of powersync.watch(
          `SELECT 1 FROM team_members WHERE user_id = ?
           UNION ALL
           SELECT 1 FROM team_farms
           UNION ALL
           SELECT 1 FROM team_folders`,
          [user?.id || ''],
          { signal: abortController.signal }
        )) {
          checkRole();
        }
      } catch {
        // Aborted or local query error
      }
    }

    if (user?.id) {
      watchChanges();
    }

    return () => {
      abortController.abort();
    };
  }, [checkRole, user?.id]);

  return {
    role,
    permissions,
    loading,
    refreshRole: checkRole,
  };
}
