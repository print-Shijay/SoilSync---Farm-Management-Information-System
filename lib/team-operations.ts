import { getDatabase, generateUUID } from './db-operations';
import { supabase } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

export type TeamRole = 'owner' | 'admin' | 'member';
export type TeamMemberStatus = 'pending' | 'accepted' | 'declined';

export type TeamRecord = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamMemberRecord = {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  status: TeamMemberStatus;
  created_at: string;
  updated_at: string;
  // Joined from users table
  email?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  profile_icon_url?: string;
};

export type TeamWithStats = TeamRecord & {
  member_count: number;
  farm_count: number;
  folder_count: number;
  my_role: TeamRole;
};

export type FolderAuditLogRecord = {
  id: string;
  folder_id: string;
  user_id: string | null;
  action: string;
  details: string; // JSON string
  created_at: string;
  // Joined from users
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_url?: string;
};

export type EffectivePermissions = {
  role: TeamRole | null;
  isOwner: boolean;
  isAdmin: boolean;
  isMember: boolean;
  // Farm permissions
  canEditFarm: boolean;
  canManageTeam: boolean;
  canAddTasks: boolean;
  canMarkTaskDone: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canAddFacilitySchedule: boolean;
  canUpdateFacilityTools: boolean;
  canDeleteFacility: boolean;
  canSubmitDailyLogs: boolean;
  canEditCropPlan: boolean;
  canEditFarmLayout: boolean;
  // Folder permissions
  canExportFolder: boolean;
  canAddFolderRecord: boolean;
  canEditFolderRecord: boolean;
  canDeleteFolderRecord: boolean;
  canManageFolderColumns: boolean;
};

export function calculatePermissions(role: TeamRole | null): EffectivePermissions {
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin';
  const isMember = role === 'member';
  const hasAdminOrOwner = isOwner || isAdmin;
  const hasAnyAccess = isOwner || isAdmin || isMember;

  return {
    role,
    isOwner,
    isAdmin,
    isMember,
    // Farm handling
    canEditFarm: hasAdminOrOwner,
    canManageTeam: hasAdminOrOwner, // Promotion to Admin is strictly Owner-only via RPC
    canAddTasks: hasAnyAccess,
    canMarkTaskDone: hasAnyAccess,
    canEditTasks: hasAdminOrOwner,
    canDeleteTasks: hasAdminOrOwner,
    canAddFacilitySchedule: hasAnyAccess,
    canUpdateFacilityTools: hasAnyAccess,
    canDeleteFacility: hasAdminOrOwner,
    canSubmitDailyLogs: hasAnyAccess,
    canEditCropPlan: hasAdminOrOwner, // Member is view-only
    canEditFarmLayout: hasAdminOrOwner, // Member is view-only
    // Folder handling
    canExportFolder: hasAnyAccess,
    canAddFolderRecord: hasAnyAccess,
    canEditFolderRecord: hasAdminOrOwner,
    canDeleteFolderRecord: hasAdminOrOwner,
    canManageFolderColumns: hasAdminOrOwner,
  };
}

// ============================================================================
// LOCAL OFFLINE-FIRST OPERATIONS (PowerSync SQLite)
// ============================================================================

export async function createTeam(params: {
  name: string;
  description?: string;
  ownerId: string;
}): Promise<string> {
  const db = getDatabase();
  const teamId = generateUUID();
  const memberId = generateUUID();
  const trimmedName = params.name.trim();
  const desc = params.description?.trim() || null;

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO teams (id, owner_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [teamId, params.ownerId, trimmedName, desc]
    );

    // Automatically add owner as accepted owner member
    await tx.run(
      `INSERT INTO team_members (id, team_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', 'accepted', datetime('now'), datetime('now'))`,
      [memberId, teamId, params.ownerId]
    );
  });

  return teamId;
}

export async function updateTeam(
  teamId: string,
  updates: { name?: string; description?: string }
): Promise<void> {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name.trim());
  }

  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description.trim() || null);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(teamId);

  await db.run(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`, values);

  // Best-effort immediate remote update if online
  try {
    const remoteUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.name !== undefined) remoteUpdates.name = updates.name.trim();
    if (updates.description !== undefined) {
      remoteUpdates.description = updates.description.trim() || null;
    }
    await supabase.from('teams').update(remoteUpdates).eq('id', teamId);
  } catch {
    // Silently continue; PowerSync will sync when connectivity permits
  }
}

export async function deleteTeam(teamId: string): Promise<void> {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM team_farms WHERE team_id = ?', [teamId]);
    await tx.run('DELETE FROM team_folders WHERE team_id = ?', [teamId]);
    await tx.run('DELETE FROM team_members WHERE team_id = ?', [teamId]);
    await tx.run('DELETE FROM teams WHERE id = ?', [teamId]);
  });

  // Best-effort immediate remote deletion if online
  try {
    await supabase.from('teams').delete().eq('id', teamId);
  } catch {
    // Silently continue; PowerSync will sync when connectivity permits
  }
}

export async function getTeam(teamId: string): Promise<TeamRecord | null> {
  const db = getDatabase();
  try {
    const row = await db.get<TeamRecord>('SELECT * FROM teams WHERE id = ?', [teamId]);
    return row || null;
  } catch (err) {
    console.warn('[TeamOperations] getTeam error:', err);
    return null;
  }
}

export async function getUserTeams(userId: string): Promise<TeamWithStats[]> {
  const db = getDatabase();
  try {
    const query = `
      SELECT 
        t.*,
        tm.role as my_role,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id AND status = 'accepted') as member_count,
        (SELECT COUNT(*) FROM team_farms WHERE team_id = t.id) as farm_count,
        (SELECT COUNT(*) FROM team_folders WHERE team_id = t.id) as folder_count
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ? AND tm.status = 'accepted'
      ORDER BY t.created_at DESC
    `;
    const rows = await db.all<any>(query, [userId]);
    return (rows || []).map((r) => ({
      ...r,
      member_count: Number(r.member_count || 0),
      farm_count: Number(r.farm_count || 0),
      folder_count: Number(r.folder_count || 0),
      my_role: r.my_role as TeamRole,
    }));
  } catch (err) {
    console.warn('[TeamOperations] getUserTeams error:', err);
    return [];
  }
}

export async function getTeamMembers(teamId: string): Promise<TeamMemberRecord[]> {
  const db = getDatabase();
  try {
    const query = `
      SELECT 
        tm.*,
        u.email,
        u.first_name,
        u.last_name,
        u.avatar_url,
        u.profile_icon_url
      FROM team_members tm
      LEFT JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ? AND tm.status != 'declined'
      ORDER BY 
        CASE tm.role 
          WHEN 'owner' THEN 1 
          WHEN 'admin' THEN 2 
          ELSE 3 
        END ASC,
        tm.created_at ASC
    `;
    const rows = await db.all<TeamMemberRecord>(query, [teamId]);
    return rows || [];
  } catch (err) {
    console.warn('[TeamOperations] getTeamMembers error:', err);
    return [];
  }
}

export async function getTeamAssignedFarms(teamId: string): Promise<string[]> {
  const db = getDatabase();
  try {
    const rows = await db.all<{ farm_id: string }>(
      'SELECT farm_id FROM team_farms WHERE team_id = ?',
      [teamId]
    );
    return (rows || []).map((r) => r.farm_id);
  } catch (err) {
    console.warn('[TeamOperations] getTeamAssignedFarms error:', err);
    return [];
  }
}

export async function setTeamAssignedFarms(teamId: string, farmIds: string[]): Promise<void> {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM team_farms WHERE team_id = ?', [teamId]);
    for (const farmId of farmIds) {
      const id = generateUUID();
      await tx.run(
        `INSERT INTO team_farms (id, team_id, farm_id, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [id, teamId, farmId]
      );
    }
  });
}

export async function getTeamAssignedFolders(teamId: string): Promise<string[]> {
  const db = getDatabase();
  try {
    const rows = await db.all<{ folder_id: string }>(
      'SELECT folder_id FROM team_folders WHERE team_id = ?',
      [teamId]
    );
    return (rows || []).map((r) => r.folder_id);
  } catch (err) {
    console.warn('[TeamOperations] getTeamAssignedFolders error:', err);
    return [];
  }
}

export async function setTeamAssignedFolders(teamId: string, folderIds: string[]): Promise<void> {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM team_folders WHERE team_id = ?', [teamId]);
    for (const folderId of folderIds) {
      const id = generateUUID();
      await tx.run(
        `INSERT INTO team_folders (id, team_id, folder_id, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [id, teamId, folderId]
      );
    }
  });
}

// ============================================================================
// FOLDER AUDIT LOGS
// ============================================================================

export async function logFolderAuditAction(
  folderId: string,
  userId: string | null | undefined,
  action: string,
  details: Record<string, unknown> = {}
): Promise<string> {
  const db = getDatabase();
  const id = generateUUID();
  try {
    await db.run(
      `INSERT INTO folder_audit_logs (id, folder_id, user_id, action, details, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [id, folderId, userId || null, action, JSON.stringify(details)]
    );
  } catch (err) {
    console.warn('[FolderAuditLog] Local insert error:', err);
  }
  return id;
}

export async function getFolderAuditLogs(folderId: string): Promise<FolderAuditLogRecord[]> {
  const db = getDatabase();
  try {
    const query = `
      SELECT 
        fal.*,
        u.email,
        u.first_name,
        u.last_name,
        u.avatar_url
      FROM folder_audit_logs fal
      LEFT JOIN users u ON u.id = fal.user_id
      WHERE fal.folder_id = ?
      ORDER BY fal.created_at DESC
      LIMIT 100
    `;
    const rows = await db.all<FolderAuditLogRecord>(query, [folderId]);
    return rows || [];
  } catch (err) {
    console.warn('[FolderAuditLog] getFolderAuditLogs error:', err);
    return [];
  }
}

// ============================================================================
// ROLE RESOLUTION HELPERS
// ============================================================================

export async function getEffectiveFarmRole(
  farmId: string,
  userId: string
): Promise<TeamRole | null> {
  if (!farmId || !userId) return null;
  const db = getDatabase();
  try {
    // 1. Is Farm Owner?
    const farm = await db.get<{ user_id: string }>('SELECT user_id FROM farms WHERE id = ?', [
      farmId,
    ]);
    if (farm && farm.user_id?.toLowerCase() === userId.toLowerCase()) {
      return 'owner';
    }

    // 2. Query highest team role assigned to this farm
    const row = await db.get<{ role: TeamRole }>(
      `SELECT tm.role FROM team_members tm
       JOIN team_farms tf ON tf.team_id = tm.team_id
       WHERE tf.farm_id = ? AND tm.user_id = ? AND tm.status = 'accepted'
       ORDER BY CASE tm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
       LIMIT 1`,
      [farmId, userId]
    );

    return row ? row.role : null;
  } catch (err) {
    console.warn('[TeamOperations] getEffectiveFarmRole error:', err);
    return null;
  }
}

export async function getEffectiveFolderRole(
  folderId: string,
  userId: string
): Promise<TeamRole | null> {
  if (!folderId || !userId) return null;
  const db = getDatabase();
  try {
    // 1. Is Folder Owner?
    const folder = await db.get<{ user_id: string }>(
      'SELECT user_id FROM user_folder WHERE id = ?',
      [folderId]
    );
    if (folder && folder.user_id?.toLowerCase() === userId.toLowerCase()) {
      return 'owner';
    }

    // 2. Query highest team role assigned to this folder
    const row = await db.get<{ role: TeamRole }>(
      `SELECT tm.role FROM team_members tm
       JOIN team_folders tf ON tf.team_id = tm.team_id
       WHERE tf.folder_id = ? AND tm.user_id = ? AND tm.status = 'accepted'
       ORDER BY CASE tm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
       LIMIT 1`,
      [folderId, userId]
    );

    return row ? row.role : null;
  } catch (err) {
    console.warn('[TeamOperations] getEffectiveFolderRole error:', err);
    return null;
  }
}

// ============================================================================
// ONLINE-ONLY SECURITY OPERATIONS (Direct Supabase RPCs)
// ============================================================================

export async function inviteTeamMemberOnline(params: {
  teamId: string;
  email: string;
  role?: 'admin' | 'member';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('invite_user_to_team', {
      p_team_id: params.teamId,
      p_email: params.email.trim(),
      p_role: params.role || 'member',
    });

    if (error) throw error;
    if (data && !data.success) {
      return { success: false, error: data.error };
    }
    return { success: true };
  } catch (err: any) {
    const msg =
      err?.message && (err.message.includes('fetch') || err.message.includes('network'))
        ? 'Internet connection required to invite team members.'
        : err?.message || 'Failed to send invite.';
    return { success: false, error: msg };
  }
}

export async function promoteTeamMemberOnline(params: {
  teamId: string;
  memberUserId: string;
  newRole: 'admin' | 'member';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('promote_team_member', {
      p_team_id: params.teamId,
      p_member_user_id: params.memberUserId,
      p_new_role: params.newRole,
    });

    if (error) throw error;
    if (data && !data.success) {
      return { success: false, error: data.error };
    }
    return { success: true };
  } catch (err: any) {
    const msg =
      err?.message && (err.message.includes('fetch') || err.message.includes('network'))
        ? 'Internet connection required to update roles.'
        : err?.message || 'Failed to update member role.';
    return { success: false, error: msg };
  }
}

export async function respondTeamInviteOnline(params: {
  teamId: string;
  status: 'accepted' | 'declined';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('respond_to_team_invite', {
      p_team_id: params.teamId,
      p_status: params.status,
    });

    if (error) throw error;
    if (data && !data.success) {
      return { success: false, error: data.error };
    }
    return { success: true };
  } catch (err: any) {
    const msg =
      err?.message && (err.message.includes('fetch') || err.message.includes('network'))
        ? 'Internet connection required to respond to invitation.'
        : err?.message || 'Failed to update invitation status.';
    return { success: false, error: msg };
  }
}

export async function removeTeamMemberOnline(params: {
  teamId: string;
  memberUserId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('remove_team_member', {
      p_team_id: params.teamId,
      p_member_user_id: params.memberUserId,
    });

    if (error) throw error;
    if (data && !data.success) {
      return { success: false, error: data.error };
    }
    return { success: true };
  } catch (err: any) {
    const msg =
      err?.message && (err.message.includes('fetch') || err.message.includes('network'))
        ? 'Internet connection required to remove member.'
        : err?.message || 'Failed to remove member.';
    return { success: false, error: msg };
  }
}

// ============================================================================
// PENDING INVITATIONS OPERATIONS
// ============================================================================

export type TeamPendingInvite = {
  id: string; // team_member id
  team_id: string;
  user_id: string;
  role: TeamRole;
  status: TeamMemberStatus;
  invited_by?: string;
  inviter_name?: string;
  team_name?: string;
  created_at: string;
  farm_count?: number;
  folder_count?: number;
};

export async function getUserPendingInvites(userId: string): Promise<TeamPendingInvite[]> {
  const db = getDatabase();
  try {
    const query = `
      SELECT 
        tm.id,
        tm.team_id,
        tm.user_id,
        tm.role,
        tm.status,
        tm.invited_by,
        COALESCE(tm.inviter_name, u.first_name || ' ' || u.last_name, u.username, u.email, 'Team Admin') as inviter_name,
        COALESCE(tm.team_name, t.name, 'Group Collaboration') as team_name,
        tm.created_at,
        (SELECT COUNT(*) FROM team_farms WHERE team_id = tm.team_id) as farm_count,
        (SELECT COUNT(*) FROM team_folders WHERE team_id = tm.team_id) as folder_count
      FROM team_members tm
      LEFT JOIN teams t ON t.id = tm.team_id
      LEFT JOIN users u ON u.id = tm.invited_by
      WHERE tm.user_id = ? AND tm.status = 'pending'
      ORDER BY tm.created_at DESC
    `;
    const rows = await db.all<any>(query, [userId]);
    return (rows || []).map((r) => ({
      ...r,
      farm_count: Number(r.farm_count || 0),
      folder_count: Number(r.folder_count || 0),
    }));
  } catch (err) {
    console.warn('[TeamOperations] getUserPendingInvites error:', err);
    return [];
  }
}

export async function respondToTeamInvitation(params: {
  inviteId: string;
  teamId: string;
  status: 'accepted' | 'declined';
}): Promise<{ success: boolean; error?: string }> {
  const db = getDatabase();

  // 1. If online, invoke the RPC so Supabase handles notifications & server triggers
  try {
    const rpcRes = await respondTeamInviteOnline({
      teamId: params.teamId,
      status: params.status,
    });
    if (!rpcRes.success) {
      console.warn('[TeamOperations] Online respond notice:', rpcRes.error);
    }
  } catch (err) {
    console.warn('[TeamOperations] Network error during invite response:', err);
  }

  // 2. Commit update locally to SQLite (PowerSync will sync when online)
  try {
    await db.run(
      `UPDATE team_members SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      [params.status, params.inviteId]
    );
    return { success: true };
  } catch (localErr: any) {
    console.error('[TeamOperations] Local invite status update error:', localErr);
    return { success: false, error: localErr?.message || 'Failed to update invitation status.' };
  }
}
