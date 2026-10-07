import { useCallback, useEffect, useState } from 'react';
import { powersync } from '../powersync';
import { useAuth } from '../AuthContext';
import { respondTeamInviteOnline } from '../team-operations';

export interface PendingInvite {
  id: string;
  team_id?: string;
  farm_id?: string;
  farm_owner_id?: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  inviter_name?: string;
  owner_email?: string;
  owner_first_name?: string;
  owner_last_name?: string;
  farm_name?: string;
}

export function usePendingInvites() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    if (!userId) {
      setInvites([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const result = await powersync.getAll<PendingInvite>(
        `
        SELECT 
          tm.id,
          tm.team_id,
          tm.user_id,
          tm.role,
          tm.status,
          tm.created_at,
          COALESCE(tm.team_name, t.name) as farm_name,
          COALESCE(tm.inviter_name, u.username, u.first_name || ' ' || u.last_name, u.email) as inviter_name,
          t.owner_id as farm_owner_id,
          u.email as owner_email, 
          u.first_name as owner_first_name, 
          u.last_name as owner_last_name
        FROM team_members tm
        LEFT JOIN teams t ON t.id = tm.team_id
        LEFT JOIN users u ON u.id = COALESCE(tm.invited_by, t.owner_id)
        WHERE tm.user_id = ? AND tm.status = 'pending'
        ORDER BY tm.created_at DESC
        `,
        [userId]
      );
      
      setInvites(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchInvites();
    
    if (!userId) return;

    const abortController = new AbortController();
    
    async function watchInvites() {
      for await (const _update of powersync.watch(
        "SELECT * FROM team_members WHERE user_id = ? AND status = 'pending'",
        [userId],
        { signal: abortController.signal }
      )) {
        fetchInvites();
      }
    }
    
    watchInvites().catch(() => {});
    
    return () => {
      abortController.abort();
    };
  }, [fetchInvites, userId]);

  const respondToInvite = async (inviteId: string, status: 'accepted' | 'declined') => {
    try {
      setLoading(true);
      setError(null);
      const invite = invites.find(i => i.id === inviteId);
      const teamId = invite?.team_id;

      if (teamId) {
        const rpcRes = await respondTeamInviteOnline({ teamId, status });
        if (!rpcRes.success) {
          console.warn('[usePendingInvites] Online invite response warning:', rpcRes.error);
        }
      }

      await powersync.execute(
        `UPDATE team_members SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        [status, inviteId]
      );

      await fetchInvites();
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return {
    invites,
    loading,
    error,
    respondToInvite,
    refresh: fetchInvites
  };
}
