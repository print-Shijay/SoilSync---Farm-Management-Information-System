import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { powersync } from '../../../lib/powersync';
import { removeTeamMemberOnline } from '../../../lib/team-operations';

export interface FarmMember {
  id: string;
  farm_id: string;
  farm_owner_id: string;
  user_id: string;
  role: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
  team_name?: string;
  // Joined fields from users table
  email?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  profile_icon_url?: string;
}

export function useFarmMembers(farmId: string) {
  const [members, setMembers] = useState<FarmMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Query members assigned to this farm via team_farms and team_members
      const result = await powersync.getAll<FarmMember>(
        `
        SELECT 
          tm.id,
          tf.farm_id,
          t.owner_id as farm_owner_id,
          tm.user_id,
          tm.role,
          tm.status,
          tm.created_at,
          tm.updated_at,
          t.name as team_name,
          u.email, 
          u.first_name, 
          u.last_name, 
          u.avatar_url,
          u.profile_icon_url 
        FROM team_members tm
        JOIN team_farms tf ON tf.team_id = tm.team_id
        JOIN teams t ON t.id = tm.team_id
        LEFT JOIN users u ON u.id = tm.user_id
        WHERE tf.farm_id = ? AND tm.status = 'accepted'
        ORDER BY 
          CASE tm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END ASC,
          tm.created_at DESC
        `,
        [farmId]
      );

      // Fetch owner of the farm
      const ownerResult = (await powersync.getOptional(
        `
        SELECT 
          f.user_id as user_id, 
          u.email, 
          u.first_name, 
          u.last_name, 
          u.avatar_url,
          u.profile_icon_url 
        FROM farms f
        LEFT JOIN users u ON u.id = f.user_id
        WHERE f.id = ?
        `,
        [farmId]
      )) as any;

      if (ownerResult) {
        // Exclude if already in team list as owner
        const existingOwnerIndex = result.findIndex(
          (m) => m.user_id?.toLowerCase() === ownerResult.user_id?.toLowerCase()
        );
        if (existingOwnerIndex >= 0) {
          result[existingOwnerIndex].role = 'owner';
          setMembers(result);
        } else {
          const ownerMember: FarmMember = {
            id: 'owner-' + farmId,
            farm_id: farmId,
            farm_owner_id: ownerResult.user_id,
            user_id: ownerResult.user_id,
            role: 'owner',
            status: 'accepted',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            team_name: 'Farm Owner',
            email: ownerResult.email,
            first_name: ownerResult.first_name,
            last_name: ownerResult.last_name,
            avatar_url: ownerResult.avatar_url,
            profile_icon_url: ownerResult.profile_icon_url,
          };
          setMembers([ownerMember, ...result]);
        }
      } else {
        setMembers(result);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    fetchMembers();

    // Subscribe to changes in team_farms and team_members
    const abortController = new AbortController();

    async function watchMembers() {
      try {
        for await (const _ of powersync.watch(
          `SELECT 1 FROM team_farms WHERE farm_id = ?
           UNION ALL
           SELECT 1 FROM team_members`,
          [farmId],
          { signal: abortController.signal }
        )) {
          fetchMembers();
        }
      } catch {
        // Aborted or local query error
      }
    }

    watchMembers().catch(() => {});

    return () => {
      abortController.abort();
    };
  }, [fetchMembers, farmId]);

  const removeMember = async (memberId: string, memberUserId: string) => {
    try {
      setLoading(true);
      // Find team member record
      const memberRecord = await powersync.getOptional<{ team_id: string }>(
        'SELECT team_id FROM team_members WHERE id = ?',
        [memberId]
      );

      if (memberRecord?.team_id) {
        await removeTeamMemberOnline({
          teamId: memberRecord.team_id,
          memberUserId,
        });
      }

      await fetchMembers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const inviteMember = async (
    _email: string,
    _role: 'member' = 'member'
  ): Promise<{ success: boolean; error?: string }> => {
    return {
      success: false,
      error: 'Please invite members through Teams in Settings.',
    };
  };

  return {
    members,
    loading,
    error,
    inviteMember,
    removeMember,
    refresh: fetchMembers,
  };
}
