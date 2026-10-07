import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Users,
  Plus,
  Crown,
  Shield,
  UserCheck,
  Sprout,
  Clock,
  Check,
  X,
  Mail,
  Trash2,
  AlertCircle,
  Info,
  Pencil,
  Folder,
} from 'lucide-react-native';
import { FileText, ChevronDown, RefreshCw } from '../../components/Icons';
import { BackButton } from '../../components/common/BackButton';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { Modal } from '../../components/common/AppModal';
import { useAuth } from '../../lib/AuthContext';
import { useAccessibility } from '../../lib/accessibility';
import { supabase } from '../../lib/supabase';
import {
  getTeam,
  getTeamMembers,
  getTeamAssignedFarms,
  setTeamAssignedFarms,
  getTeamAssignedFolders,
  setTeamAssignedFolders,
  inviteTeamMemberOnline,
  promoteTeamMemberOnline,
  removeTeamMemberOnline,
  updateTeam,
  deleteTeam,
  TeamRecord,
  TeamMemberRecord,
  TeamRole,
} from '../../lib/team-operations';
import {
  getFarmsByUser,
  getOwnedFarmsByUser,
  getUserFolders,
  getOwnedUserFolders,
  FarmRecord,
  UserFolderRecord,
} from '../../lib/db-operations';

export default function TeamWorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { isGloveMode, isHighContrast, fontScale, triggerHaptic } = useAccessibility();

  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [members, setMembers] = useState<TeamMemberRecord[]>([]);
  const [assignedFarmIds, setAssignedFarmIds] = useState<string[]>([]);
  const [assignedFolderIds, setAssignedFolderIds] = useState<string[]>([]);
  const [allFarms, setAllFarms] = useState<FarmRecord[]>([]);
  const [allFolders, setAllFolders] = useState<UserFolderRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'farms' | 'folders'>('members');

  // Invite Modal
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  // Member Action Modal (Promote / Remove)
  const [selectedMember, setSelectedMember] = useState<TeamMemberRecord | null>(null);
  const [isMemberActionModalVisible, setIsMemberActionModalVisible] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Edit Team Modal (Owner Only)
  const [isEditTeamModalVisible, setIsEditTeamModalVisible] = useState(false);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamDesc, setEditTeamDesc] = useState('');
  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false);

  // Delete Team Modal (Owner Only with "CONFIRM" validation)
  const [isDeleteTeamModalVisible, setIsDeleteTeamModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);

  const isOwner = useMemo(() => {
    if (!team || !user?.id) return false;
    return team.owner_id.toLowerCase() === user.id.toLowerCase();
  }, [team, user?.id]);

  const myRole = useMemo<TeamRole | null>(() => {
    if (!user?.id) return null;
    if (isOwner) return 'owner';
    const me = members.find((m) => m.user_id.toLowerCase() === user.id.toLowerCase());
    return me ? me.role : null;
  }, [isOwner, members, user?.id]);

  const canManage = isOwner || myRole === 'admin';

  // --- Edit Team Details (Owner Only) ---
  const handleOpenEditTeamModal = () => {
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the team owner can edit this team.');
      return;
    }
    triggerHaptic('selection');
    setEditTeamName(team?.name || '');
    setEditTeamDesc(team?.description || '');
    setIsEditTeamModalVisible(true);
  };

  const handleCloseEditTeamModal = () => {
    if (isUpdatingTeam) return;
    setIsEditTeamModalVisible(false);
    setEditTeamName('');
    setEditTeamDesc('');
  };

  const handleSaveEditTeam = async () => {
    if (!id || !isOwner) {
      Alert.alert('Permission Denied', 'Only the team owner can edit this team.');
      return;
    }
    if (!editTeamName.trim()) {
      Alert.alert('Required', 'Please enter a name for your team.');
      return;
    }

    try {
      setIsUpdatingTeam(true);
      triggerHaptic('selection');
      await updateTeam(id, {
        name: editTeamName.trim(),
        description: editTeamDesc.trim() || undefined,
      });

      setTeam((prev) =>
        prev
          ? {
              ...prev,
              name: editTeamName.trim(),
              description: editTeamDesc.trim() || null,
            }
          : null
      );

      triggerHaptic('success');
      setIsEditTeamModalVisible(false);
      setEditTeamName('');
      setEditTeamDesc('');
      void loadTeamData(false);
      Alert.alert('Success', 'Team updated successfully.');
    } catch (err: any) {
      console.error('[TeamWorkspace] Update error:', err);
      Alert.alert('Error', err?.message || 'Could not update team.');
    } finally {
      setIsUpdatingTeam(false);
    }
  };

  // --- Delete Team with "CONFIRM" validation (Owner Only) ---
  const handleOpenDeleteTeamModal = () => {
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the team owner can delete this team.');
      return;
    }
    triggerHaptic('warning');
    setDeleteConfirmText('');
    setIsDeleteTeamModalVisible(true);
  };

  const handleCloseDeleteTeamModal = () => {
    if (isDeletingTeam) return;
    setIsDeleteTeamModalVisible(false);
    setDeleteConfirmText('');
  };

  const handleConfirmDeleteTeam = async () => {
    if (!id || !isOwner) {
      Alert.alert('Permission Denied', 'Only the team owner can delete this team.');
      setIsDeleteTeamModalVisible(false);
      return;
    }

    if (deleteConfirmText !== 'CONFIRM') {
      triggerHaptic('error');
      Alert.alert(
        'Confirmation Mismatch',
        'You must type "CONFIRM" in exact uppercase to delete this team.'
      );
      return;
    }

    try {
      setIsDeletingTeam(true);
      triggerHaptic('heavy');
      await deleteTeam(id);
      triggerHaptic('success');
      setIsDeleteTeamModalVisible(false);
      setDeleteConfirmText('');
      Alert.alert('Team Deleted', 'The team has been deleted.');
      router.replace('/teams');
    } catch (err: any) {
      console.error('[TeamWorkspace] Delete error:', err);
      Alert.alert('Deletion Failed', err?.message || 'Could not delete team. Please try again.');
    } finally {
      setIsDeletingTeam(false);
    }
  };

  const loadTeamData = useCallback(async (isInitial = false) => {
    if (!id || !user?.id) return;
    try {
      if (isInitial) {
        setLoading(true);
      }
      const [
        loadedTeam,
        loadedMembers,
        loadedFarmIds,
        loadedFolderIds,
        ownedFarms,
        ownedFolders,
        allUserFarms,
        allUserFolders,
      ] = await Promise.all([
        getTeam(id),
        getTeamMembers(id),
        getTeamAssignedFarms(id),
        getTeamAssignedFolders(id),
        getOwnedFarmsByUser(user.id),
        getOwnedUserFolders(user.id),
        getFarmsByUser(user.id),
        getUserFolders(user.id),
      ]);

      setTeam(loadedTeam);
      const filteredMembers = (loadedMembers || []).filter((m) => m.status !== 'declined');
      setMembers(filteredMembers);
      setAssignedFarmIds(loadedFarmIds);
      setAssignedFolderIds(loadedFolderIds);

      const teamIsOwner =
        loadedTeam && user?.id
          ? loadedTeam.owner_id.toLowerCase() === user.id.toLowerCase()
          : false;

      if (teamIsOwner) {
        // Only farms & folders owned by this user can be shared in their own team
        setAllFarms(ownedFarms.filter((f) => f.user_id && f.user_id.toLowerCase() === user.id.toLowerCase()));
        setAllFolders(ownedFolders.filter((f) => f.user_id && f.user_id.toLowerCase() === user.id.toLowerCase()));
      } else {
        // Members only view the farms & folders assigned to this team
        setAllFarms(allUserFarms.filter((f) => loadedFarmIds.includes(f.id)));
        setAllFolders(allUserFolders.filter((f) => loadedFolderIds.includes(f.id)));
      }

      // Direct online reconciliation to instantly catch declines/removals before PowerSync syncs
      try {
        const { data: onlineRows, error } = await supabase
          .from('team_members')
          .select('id, team_id, user_id, role, status, created_at, updated_at')
          .eq('team_id', id)
          .neq('status', 'declined');

        if (!error && Array.isArray(onlineRows)) {
          const onlineMap = new Map(onlineRows.map((r: any) => [r.id, r]));
          setMembers((prev) => {
            const kept = prev.filter((m) => onlineMap.has(m.id) && m.status !== 'declined');
            return kept.map((m) => {
              const online = onlineMap.get(m.id);
              return online ? { ...m, role: online.role, status: online.status } : m;
            });
          });
        }
      } catch {
        // Fallback silently to local SQLite query
      }
    } catch (err) {
      console.warn('[TeamWorkspace] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    loadTeamData(true);
  }, [loadTeamData]);

  const handleRefresh = useCallback(() => {
    triggerHaptic('light');
    setRefreshing(true);
    void loadTeamData(false);
  }, [loadTeamData, triggerHaptic]);

  // Auto-reload handler whenever Invite Member Modal closes (backdrop, cancel, X button, or after invite)
  const handleCloseInviteModal = useCallback(() => {
    if (isInviting) return;
    setIsInviteModalVisible(false);
    setInviteEmail('');
    void loadTeamData(false);
  }, [isInviting, loadTeamData]);

  // --- Invite Member ---
  const handleInvite = async () => {
    const emailToInvite = inviteEmail.trim();
    if (!emailToInvite || !emailToInvite.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (!id) return;

    try {
      setIsInviting(true);
      triggerHaptic('selection');

      // Online-only RPC execution
      const result = await inviteTeamMemberOnline({
        teamId: id,
        email: emailToInvite,
        role: 'member', // Default invited role is strictly 'member'
      });

      if (!result.success) {
        Alert.alert('Invite Failed', result.error || 'Could not send invitation.');
        return;
      }

      triggerHaptic('success');

      // Dismiss the invite modal immediately so it does not conflict with the alert
      setIsInviteModalVisible(false);
      setInviteEmail('');
      void loadTeamData(false);

      setTimeout(() => {
        Alert.alert('Invite Sent', `An invitation has been sent to ${emailToInvite}.`);
      }, 100);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send invite.');
    } finally {
      setIsInviting(false);
    }
  };

  // --- Promote Member (Owner Only) ---
  const handleToggleAdminPromotion = async (member: TeamMemberRecord) => {
    if (!id) return;
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the team Owner can promote or change member roles.');
      return;
    }

    const newRole: 'admin' | 'member' = member.role === 'admin' ? 'member' : 'admin';
    const actionLabel = newRole === 'admin' ? 'Promote to Admin' : 'Demote to Member';

    try {
      setIsActionLoading(true);
      triggerHaptic('selection');

      // Online-only RPC execution
      const result = await promoteTeamMemberOnline({
        teamId: id,
        memberUserId: member.user_id,
        newRole,
      });

      if (!result.success) {
        Alert.alert('Update Failed', result.error || 'Failed to change role.');
        return;
      }

      triggerHaptic('success');
      Alert.alert('Role Updated', `${member.first_name || member.email} is now a ${newRole}.`);
      setIsMemberActionModalVisible(false);
      setSelectedMember(null);
      await loadTeamData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update role.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // --- Remove Member ---
  const handleRemoveMember = async (member: TeamMemberRecord) => {
    if (!id) return;
    if (!canManage) {
      Alert.alert('Permission Denied', 'You do not have permission to remove members.');
      return;
    }

    try {
      setIsActionLoading(true);
      triggerHaptic('heavy');

      // Online-only RPC execution
      const result = await removeTeamMemberOnline({
        teamId: id,
        memberUserId: member.user_id,
      });

      if (!result.success) {
        Alert.alert('Error', result.error || 'Could not remove member.');
        return;
      }

      triggerHaptic('success');
      setIsMemberActionModalVisible(false);
      setSelectedMember(null);
      await loadTeamData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to remove member.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // --- Toggle Farm Assignment (Owner Only, Offline-First) ---
  const handleToggleFarm = async (farmId: string) => {
    if (!id || !isOwner) return;
    triggerHaptic('selection');

    const updated = assignedFarmIds.includes(farmId)
      ? assignedFarmIds.filter((fid) => fid !== farmId)
      : [...assignedFarmIds, farmId];

    setAssignedFarmIds(updated);
    try {
      await setTeamAssignedFarms(id, updated);
    } catch (err) {
      console.warn('[TeamWorkspace] Farm assignment error:', err);
    }
  };

  // --- Toggle Folder Assignment (Owner Only, Offline-First) ---
  const handleToggleFolder = async (folderId: string) => {
    if (!id || !isOwner) return;
    triggerHaptic('selection');

    const updated = assignedFolderIds.includes(folderId)
      ? assignedFolderIds.filter((fid) => fid !== folderId)
      : [...assignedFolderIds, folderId];

    setAssignedFolderIds(updated);
    try {
      await setTeamAssignedFolders(id, updated);
    } catch (err) {
      console.warn('[TeamWorkspace] Folder assignment error:', err);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-champagne items-center justify-center">
        <ActivityIndicator size="large" color="#8C4522" />
        <Text style={{ fontSize: 13 * fontScale }} className="mt-3 font-semibold text-taupe">
          Loading team workspace...
        </Text>
      </SafeAreaView>
    );
  }

  if (!team) {
    return (
      <SafeAreaView className="flex-1 bg-champagne px-5 items-center justify-center">
        <AlertCircle size={40} color="#E11D48" />
        <Text style={{ fontSize: 16 * fontScale }} className="font-bold text-espresso mt-3">
          Team not found
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 rounded-xl bg-cognac px-5 py-2.5">
          <Text className="font-bold text-white">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-champagne" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-black/5 bg-champagne px-5 py-3.5">
        <View className="flex-row items-center gap-3 flex-1">
          <BackButton />
          <View className="flex-1 pr-2">
            <Text
              style={{ fontSize: 18 * fontScale }}
              className={`tracking-tight ${
                isHighContrast ? 'font-black text-black' : 'font-black text-espresso'
              }`}
              numberOfLines={1}>
              {team.name}
            </Text>
            <Text
              style={{ fontSize: 11.5 * fontScale }}
              className={`font-semibold ${
                isHighContrast ? 'text-black' : 'text-taupe'
              }`}
              numberOfLines={1}>
              {team.description || 'Team Workspace'}
            </Text>
          </View>
        </View>

        {/* Right side: Owner actions & Role badge */}
        <View className="flex-row items-center gap-2">
          {isOwner && (
            <View className="flex-row items-center gap-1.5">
              <TouchableOpacity
                onPress={handleOpenEditTeamModal}
                accessibilityLabel="Edit Team"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className={`h-8 w-8 items-center justify-center rounded-xl bg-cognac/10 border border-cognac/25 active:scale-95 ${
                  isGloveMode ? 'h-10 w-10' : ''
                }`}>
                <Pencil
                  size={isGloveMode ? 16 : 13.5}
                  color="#8C4522"
                  strokeWidth={2.4}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleOpenDeleteTeamModal}
                accessibilityLabel="Delete Team"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className={`h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/25 active:scale-95 ${
                  isGloveMode ? 'h-10 w-10' : ''
                }`}>
                <Trash2
                  size={isGloveMode ? 16 : 13.5}
                  color="#E11D48"
                  strokeWidth={2.4}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Current User Role Pill */}
          <View className="flex-row items-center gap-1 rounded-full bg-cognac/10 border border-cognac/25 px-2.5 py-1">
            {isOwner ? (
              <Crown size={12} color="#8C4522" strokeWidth={2.5} />
            ) : myRole === 'admin' ? (
              <Shield size={12} color="#8C4522" strokeWidth={2.5} />
            ) : (
              <UserCheck size={12} color="#8C4522" strokeWidth={2.5} />
            )}
            <Text
              style={{ fontSize: 10.5 * fontScale }}
              className="font-bold uppercase tracking-wider text-cognac">
              {isOwner ? 'Owner' : myRole || 'Member'}
            </Text>
          </View>
        </View>
      </View>

      {/* Segmented Control / Tabs */}
      <View className="flex-row border-b border-black/5 bg-white/60 px-5 pt-2">
        <TouchableOpacity
          onPress={() => {
            triggerHaptic('selection');
            setActiveTab('members');
          }}
          className={`flex-row items-center gap-1.5 pb-2.5 mr-6 border-b-2 ${
            activeTab === 'members' ? 'border-cognac' : 'border-transparent'
          }`}>
          <Users
            size={16}
            color={activeTab === 'members' ? '#8C4522' : '#8C7C70'}
            strokeWidth={activeTab === 'members' ? 2.5 : 2}
          />
          <Text
            style={{ fontSize: 13.5 * fontScale }}
            className={`font-bold ${
              activeTab === 'members' ? 'text-cognac' : 'text-taupe'
            }`}>
            Members ({members.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            triggerHaptic('selection');
            setActiveTab('farms');
          }}
          className={`flex-row items-center gap-1.5 pb-2.5 mr-6 border-b-2 ${
            activeTab === 'farms' ? 'border-cognac' : 'border-transparent'
          }`}>
          <Sprout
            size={16}
            color={activeTab === 'farms' ? '#8C4522' : '#8C7C70'}
            strokeWidth={activeTab === 'farms' ? 2.5 : 2}
          />
          <Text
            style={{ fontSize: 13.5 * fontScale }}
            className={`font-bold ${
              activeTab === 'farms' ? 'text-cognac' : 'text-taupe'
            }`}>
            Farms ({assignedFarmIds.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            triggerHaptic('selection');
            setActiveTab('folders');
          }}
          className={`flex-row items-center gap-1.5 pb-2.5 border-b-2 ${
            activeTab === 'folders' ? 'border-cognac' : 'border-transparent'
          }`}>
          <Folder
            size={16}
            color={activeTab === 'folders' ? '#8C4522' : '#8C7C70'}
            strokeWidth={activeTab === 'folders' ? 2.5 : 2}
          />
          <Text
            style={{ fontSize: 13.5 * fontScale }}
            className={`font-bold ${
              activeTab === 'folders' ? 'text-cognac' : 'text-taupe'
            }`}>
            Folders ({assignedFolderIds.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8C4522"
            colors={['#8C4522']}
          />
        }>
        {/* ==================================================================== */}
        {/* TAB 1: MEMBERS */}
        {/* ==================================================================== */}
        {activeTab === 'members' && (
          <View className="pb-16">
            {/* Team Collaborators Header & Actions */}
            <View className="flex-row items-center justify-between mb-3.5">
              <Text
                style={{ fontSize: 11 * fontScale }}
                className="font-bold uppercase tracking-wider text-taupe">
                Team Collaborators
              </Text>
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={handleRefresh}
                  disabled={refreshing || loading}
                  accessibilityLabel="Reload members list"
                  className="flex-row items-center justify-center h-8 w-8 rounded-xl bg-white/90 border border-black/10 shadow-xs active:scale-95">
                  {refreshing ? (
                    <ActivityIndicator size="small" color="#8C4522" />
                  ) : (
                    <RefreshCw size={14} color="#8C4522" strokeWidth={2.5} />
                  )}
                </TouchableOpacity>

                {canManage && (
                  <TouchableOpacity
                    onPress={() => {
                      triggerHaptic('selection');
                      setIsInviteModalVisible(true);
                    }}
                    className="flex-row items-center gap-1.5 rounded-xl bg-cognac px-3 py-1.5 shadow-xs active:scale-95">
                    <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
                    <Text
                      style={{ fontSize: 11.5 * fontScale }}
                      className="font-bold text-white">
                      Invite Member
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Members List */}
            <View className="gap-2.5">
              {members.map((member) => {
                const isMemberOwner = member.role === 'owner';
                const isMemberAdmin = member.role === 'admin';
                const displayName =
                  [member.first_name, member.last_name].filter(Boolean).join(' ') ||
                  member.email ||
                  'Unknown Member';
                const initials = (displayName[0] || 'U').toUpperCase();

                return (
                  <View
                    key={member.id}
                    className="flex-row items-center justify-between rounded-2xl border border-white/90 bg-white/85 p-3.5 shadow-xs">
                    <View className="flex-row items-center gap-3 flex-1 pr-2">
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-cognac/10 border border-cognac/20">
                        <Text className="font-bold text-cognac text-sm">{initials}</Text>
                      </View>

                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text
                            style={{ fontSize: 14 * fontScale }}
                            className="font-bold text-espresso"
                            numberOfLines={1}>
                            {displayName}
                          </Text>
                          {member.status === 'pending' && (
                            <View className="rounded-full bg-amber-500/15 px-2 py-0.5">
                              <Text className="text-[9.5px] font-bold text-amber-800">
                                Pending
                              </Text>
                            </View>
                          )}
                        </View>
                        {member.email && (
                          <Text
                            style={{ fontSize: 11.5 * fontScale }}
                            className="text-taupe font-medium mt-0.5"
                            numberOfLines={1}>
                            {member.email}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                      {/* Role Badge */}
                      {isMemberOwner ? (
                        <View className="flex-row items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5">
                          <Crown size={10} color="#B45309" strokeWidth={2.5} />
                          <Text className="text-[10px] font-black uppercase text-amber-800">
                            Owner
                          </Text>
                        </View>
                      ) : isMemberAdmin ? (
                        <View className="flex-row items-center gap-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5">
                          <Shield size={10} color="#4338CA" strokeWidth={2.5} />
                          <Text className="text-[10px] font-black uppercase text-indigo-800">
                            Admin
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5">
                          <UserCheck size={10} color="#047857" strokeWidth={2.5} />
                          <Text className="text-[10px] font-black uppercase text-emerald-800">
                            Member
                          </Text>
                        </View>
                      )}

                      {/* Owner controls: Promote/Demote/Remove */}
                      {!isMemberOwner && isOwner && (
                        <TouchableOpacity
                          onPress={() => {
                            triggerHaptic('selection');
                            setSelectedMember(member);
                            setIsMemberActionModalVisible(true);
                          }}
                          className="h-8 w-8 items-center justify-center rounded-xl bg-taupe/10 active:scale-95">
                          <ChevronDown size={16} color="#73655C" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: FARMS ASSIGNED */}
        {/* ==================================================================== */}
        {activeTab === 'farms' && (
          <View className="pb-16">
            <View className="mb-3">
              <Text
                style={{ fontSize: 13.5 * fontScale }}
                className="font-bold text-espresso">
                {isOwner ? 'Assign Handled Farms' : 'Assigned Farms'}
              </Text>
              <Text
                style={{ fontSize: 11.5 * fontScale }}
                className="text-taupe font-medium mt-0.5">
                {isOwner
                  ? 'Check the farms you own that this team is responsible for managing.'
                  : 'Farms shared with this team by the team owner.'}
              </Text>
            </View>

            {allFarms.length === 0 ? (
              <View className="rounded-2xl border border-black/5 bg-white/70 p-6 items-center justify-center my-4">
                <Sprout size={32} color="#8C7C70" />
                <Text className="font-bold text-espresso mt-2">
                  {isOwner ? 'No owned farms found' : 'No farms assigned'}
                </Text>
                <Text className="text-taupe text-xs text-center mt-1">
                  {isOwner
                    ? 'Create a farm first to share it with this team.'
                    : 'The team owner has not shared any farms with this team yet.'}
                </Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {allFarms.map((farm) => {
                  const isAssigned = assignedFarmIds.includes(farm.id);
                  return (
                    <TouchableOpacity
                      key={farm.id}
                      onPress={() => isOwner && handleToggleFarm(farm.id)}
                      disabled={!isOwner}
                      activeOpacity={isOwner ? 0.8 : 1}
                      className={`flex-row items-center justify-between rounded-2xl border p-3.5 shadow-xs ${
                        isAssigned
                          ? 'border-cognac/40 bg-white'
                          : 'border-white/90 bg-white/70'
                      }`}>
                      <View className="flex-row items-center gap-3 flex-1 pr-3">
                        <View
                          className={`h-10 w-10 items-center justify-center rounded-xl ${
                            isAssigned ? 'bg-cognac/15' : 'bg-taupe/10'
                          }`}>
                          <Sprout
                            size={20}
                            color={isAssigned ? '#8C4522' : '#8C7C70'}
                          />
                        </View>
                        <View className="flex-1">
                          <Text
                            style={{ fontSize: 14 * fontScale }}
                            className="font-bold text-espresso"
                            numberOfLines={1}>
                            {farm.farm_name}
                          </Text>
                          {farm.location && (
                            <Text
                              style={{ fontSize: 11.5 * fontScale }}
                              className="text-taupe font-medium mt-0.5"
                              numberOfLines={1}>
                              {farm.location}
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* Checkbox indicator for Owner, or Assigned badge for Member */}
                      {isOwner ? (
                        <View
                          className={`h-6 w-6 items-center justify-center rounded-lg border ${
                            isAssigned
                              ? 'border-cognac bg-cognac'
                              : 'border-black/20 bg-white'
                          }`}>
                          {isAssigned && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                        </View>
                      ) : (
                        <View className="rounded-full bg-cognac/10 border border-cognac/20 px-2.5 py-1">
                          <Text
                            style={{ fontSize: 10.5 * fontScale }}
                            className="font-bold text-cognac">
                            Assigned
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: FOLDERS ASSIGNED */}
        {/* ==================================================================== */}
        {activeTab === 'folders' && (
          <View className="pb-16">
            <View className="mb-3">
              <Text
                style={{ fontSize: 13.5 * fontScale }}
                className="font-bold text-espresso">
                {isOwner ? 'Assign Folders' : 'Assigned Folders'}
              </Text>
              <Text
                style={{ fontSize: 11.5 * fontScale }}
                className="text-taupe font-medium mt-0.5">
                {isOwner
                  ? 'Check the folders you own that this team can view, export, and record into.'
                  : 'Folders shared with this team by the team owner.'}
              </Text>
            </View>

            {allFolders.length === 0 ? (
              <View className="rounded-2xl border border-black/5 bg-white/70 p-6 items-center justify-center my-4">
                <Folder size={32} color="#8C7C70" />
                <Text className="font-bold text-espresso mt-2">
                  {isOwner ? 'No owned folders found' : 'No folders assigned'}
                </Text>
                <Text className="text-taupe text-xs text-center mt-1">
                  {isOwner
                    ? 'Create a folder in User Folders to share with this team.'
                    : 'The team owner has not shared any folders with this team yet.'}
                </Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {allFolders.map((folder) => {
                  const isAssigned = assignedFolderIds.includes(folder.id);
                  return (
                    <TouchableOpacity
                      key={folder.id}
                      onPress={() => isOwner && handleToggleFolder(folder.id)}
                      disabled={!isOwner}
                      activeOpacity={isOwner ? 0.8 : 1}
                      className={`flex-row items-center justify-between rounded-2xl border p-3.5 shadow-xs ${
                        isAssigned
                          ? 'border-indigo-600/40 bg-white'
                          : 'border-white/90 bg-white/70'
                      }`}>
                      <View className="flex-row items-center gap-3 flex-1 pr-3">
                        <View
                          className={`h-10 w-10 items-center justify-center rounded-xl ${
                            isAssigned ? 'bg-indigo-600/15' : 'bg-taupe/10'
                          }`}>
                          <Folder
                            size={20}
                            color={isAssigned ? '#4338CA' : '#8C7C70'}
                          />
                        </View>
                        <View className="flex-1">
                          <Text
                            style={{ fontSize: 14 * fontScale }}
                            className="font-bold text-espresso"
                            numberOfLines={1}>
                            {folder.folder_name}
                          </Text>
                          {folder.farm_name && (
                            <Text
                              style={{ fontSize: 11.5 * fontScale }}
                              className="text-taupe font-medium mt-0.5"
                              numberOfLines={1}>
                              Linked to: {folder.farm_name}
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* Checkbox indicator for Owner, or Assigned badge for Member */}
                      {isOwner ? (
                        <View
                          className={`h-6 w-6 items-center justify-center rounded-lg border ${
                            isAssigned
                              ? 'border-indigo-600 bg-indigo-600'
                              : 'border-black/20 bg-white'
                          }`}>
                          {isAssigned && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                        </View>
                      ) : (
                        <View className="rounded-full bg-indigo-600/10 border border-indigo-600/20 px-2.5 py-1">
                          <Text
                            style={{ fontSize: 10.5 * fontScale }}
                            className="font-bold text-indigo-700">
                            Assigned
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ==================================================================== */}
      {/* MODAL: INVITE MEMBER (ONLINE) */}
      {/* ==================================================================== */}
      <Modal
        visible={isInviteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isInviting) handleCloseInviteModal();
        }}>
        <Pressable
          className="flex-1 justify-center bg-black/50 px-5"
          onPress={() => {
            if (!isInviting) handleCloseInviteModal();
          }}>
          <Pressable
            className="overflow-hidden rounded-3xl border border-white/90 bg-champagne p-6 shadow-xl"
            onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between pb-3 border-b border-black/5">
              <View className="flex-row items-center gap-2.5">
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-cognac/10 border border-cognac/20">
                  <Mail size={18} color="#8C4522" />
                </View>
                <Text
                  style={{ fontSize: 16.5 * fontScale }}
                  className="font-black text-espresso">
                  Invite Team Member
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseInviteModal}
                disabled={isInviting}>
                <X size={18} color="#8C7C70" />
              </TouchableOpacity>
            </View>

            <View className="mt-4 gap-3">
              <View>
                <Text
                  style={{ fontSize: 12 * fontScale }}
                  className="font-bold uppercase tracking-wider text-taupe mb-1.5">
                  Member Email *
                </Text>
                <TextInput
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="name@example.com"
                  placeholderTextColor="#A89F91"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={{ fontSize: 14 * fontScale }}
                  className="rounded-2xl border border-black/10 bg-white px-4 py-3 font-semibold text-espresso"
                />
              </View>

              <View className="flex-row items-center gap-2 rounded-xl bg-amber-500/10 p-3">
                <Info size={16} color="#B45309" />
                <Text
                  style={{ fontSize: 11.5 * fontScale }}
                  className="flex-1 font-medium text-amber-900 leading-relaxed">
                  Invited users receive default Member permissions. Only the Team Owner can
                  promote them to Admin.
                </Text>
              </View>

              <View className="flex-row items-center justify-end gap-2.5 mt-2">
                <TouchableOpacity
                  onPress={handleCloseInviteModal}
                  disabled={isInviting}
                  className="rounded-xl px-4 py-2.5 border border-black/10">
                  <Text className="font-bold text-taupe">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleInvite}
                  disabled={isInviting}
                  className="flex-row items-center gap-1.5 rounded-xl bg-cognac px-5 py-2.5 shadow-sm active:scale-95">
                  {isInviting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="font-bold text-white">Send Invite</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: MEMBER ACTIONS (PROMOTE / DEMOTE / REMOVE) (OWNER ONLY) */}
      {/* ==================================================================== */}
      <Modal
        visible={isMemberActionModalVisible && Boolean(selectedMember)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isActionLoading) setIsMemberActionModalVisible(false);
        }}>
        <Pressable
          className="flex-1 justify-center bg-black/50 px-5"
          onPress={() => {
            if (!isActionLoading) setIsMemberActionModalVisible(false);
          }}>
          <Pressable
            className="overflow-hidden rounded-3xl border border-white/90 bg-champagne p-6 shadow-xl"
            onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between pb-3 border-b border-black/5">
              <View className="flex-1 pr-2">
                <Text
                  style={{ fontSize: 16 * fontScale }}
                  className="font-black text-espresso"
                  numberOfLines={1}>
                  {selectedMember?.first_name || selectedMember?.email || 'Manage Member'}
                </Text>
                <Text
                  style={{ fontSize: 11.5 * fontScale }}
                  className="text-taupe font-medium mt-0.5">
                  Current role: {selectedMember?.role}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsMemberActionModalVisible(false)}
                disabled={isActionLoading}>
                <X size={18} color="#8C7C70" />
              </TouchableOpacity>
            </View>

            <View className="mt-4 gap-2.5">
              {/* Promotion / Demotion Button */}
              {isOwner && (
                <TouchableOpacity
                  onPress={() => selectedMember && handleToggleAdminPromotion(selectedMember)}
                  disabled={isActionLoading}
                  className="flex-row items-center justify-between rounded-2xl border border-black/10 bg-white p-3.5 active:scale-98">
                  <View className="flex-row items-center gap-3">
                    <View
                      className={`h-9 w-9 items-center justify-center rounded-xl ${
                        selectedMember?.role === 'admin'
                          ? 'bg-amber-500/15'
                          : 'bg-indigo-600/15'
                      }`}>
                      {selectedMember?.role === 'admin' ? (
                        <Shield size={18} color="#B45309" />
                      ) : (
                        <Crown size={18} color="#4338CA" />
                      )}
                    </View>
                    <View>
                      <Text
                        style={{ fontSize: 13.5 * fontScale }}
                        className="font-bold text-espresso">
                        {selectedMember?.role === 'admin'
                          ? 'Demote to Member'
                          : 'Promote to Admin'}
                      </Text>
                      <Text
                        style={{ fontSize: 11 * fontScale }}
                        className="text-taupe font-medium">
                        {selectedMember?.role === 'admin'
                          ? 'Reverts to standard field permissions'
                          : 'Grants full planning and management privileges'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* Remove Member Button */}
              <TouchableOpacity
                onPress={() => selectedMember && handleRemoveMember(selectedMember)}
                disabled={isActionLoading}
                className="flex-row items-center justify-between rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5 active:scale-98">
                <View className="flex-row items-center gap-3">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15">
                    <Trash2 size={18} color="#E11D48" />
                  </View>
                  <View>
                    <Text
                      style={{ fontSize: 13.5 * fontScale }}
                      className="font-bold text-rose-800">
                      Remove from Team
                    </Text>
                    <Text
                      style={{ fontSize: 11 * fontScale }}
                      className="text-rose-600 font-medium">
                      Revokes access to all assigned farms & folders
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: EDIT TEAM DETAILS (OWNER ONLY) */}
      {/* ==================================================================== */}
      <Modal
        visible={isEditTeamModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isUpdatingTeam) handleCloseEditTeamModal();
        }}>
        <Pressable
          className="flex-1 justify-center bg-black/50 px-5"
          onPress={() => {
            if (!isUpdatingTeam) handleCloseEditTeamModal();
          }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="w-full">
            <Pressable
              className="overflow-hidden rounded-3xl border border-white/90 bg-champagne p-6 shadow-xl"
              onPress={(e) => e.stopPropagation()}>
              <View className="flex-row items-center justify-between pb-3 border-b border-black/5">
                <View className="flex-row items-center gap-2.5">
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-cognac/10 border border-cognac/20">
                    <Pencil size={17} color="#8C4522" strokeWidth={2.4} />
                  </View>
                  <Text
                    style={{ fontSize: 17 * fontScale }}
                    className="font-black text-espresso">
                    Edit Team Details
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleCloseEditTeamModal}
                  disabled={isUpdatingTeam}>
                  <X size={18} color="#8C7C70" />
                </TouchableOpacity>
              </View>

              <View className="mt-4 gap-3">
                <View>
                  <Text
                    style={{ fontSize: 12 * fontScale }}
                    className="font-bold uppercase tracking-wider text-taupe mb-1.5">
                    Team Name *
                  </Text>
                  <TextInput
                    value={editTeamName}
                    onChangeText={setEditTeamName}
                    placeholder="Enter team name"
                    placeholderTextColor="#A89F91"
                    style={{ fontSize: 14 * fontScale }}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 font-semibold text-espresso"
                  />
                </View>

                <View>
                  <Text
                    style={{ fontSize: 12 * fontScale }}
                    className="font-bold uppercase tracking-wider text-taupe mb-1.5">
                    Description (Optional)
                  </Text>
                  <TextInput
                    value={editTeamDesc}
                    onChangeText={setEditTeamDesc}
                    placeholder="Describe team purpose, assignments, or notes"
                    placeholderTextColor="#A89F91"
                    multiline
                    numberOfLines={2}
                    style={{ fontSize: 13.5 * fontScale }}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 font-medium text-espresso min-h-[70px]"
                  />
                </View>

                <View className="flex-row items-center justify-end gap-2.5 mt-3">
                  <TouchableOpacity
                    onPress={handleCloseEditTeamModal}
                    disabled={isUpdatingTeam}
                    className="rounded-xl px-4 py-2.5 border border-black/10">
                    <Text className="font-bold text-taupe">Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSaveEditTeam}
                    disabled={isUpdatingTeam || !editTeamName.trim()}
                    className={`flex-row items-center gap-1.5 rounded-xl px-5 py-2.5 shadow-sm active:scale-95 ${
                      !editTeamName.trim() || isUpdatingTeam ? 'bg-cognac/50' : 'bg-cognac'
                    }`}>
                    {isUpdatingTeam ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text className="font-bold text-white">Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: DELETE TEAM (OWNER ONLY WITH "CONFIRM" VALIDATION) */}
      {/* ==================================================================== */}
      <Modal
        visible={isDeleteTeamModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeletingTeam) handleCloseDeleteTeamModal();
        }}>
        <Pressable
          className="flex-1 justify-center bg-black/60 px-5"
          onPress={() => {
            if (!isDeletingTeam) handleCloseDeleteTeamModal();
          }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="w-full">
            <Pressable
              className="overflow-hidden rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl"
              style={
                isHighContrast
                  ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                  : undefined
              }
              onPress={(e) => e.stopPropagation()}>
              {/* Warning Icon Badge */}
              <View className="mb-3.5 h-14 w-14 items-center justify-center self-center rounded-2xl border border-rose-200/60 bg-rose-100">
                <Trash2 size={26} color="#E11D48" />
              </View>

              {/* Title & Warning */}
              <Text
                style={{ fontSize: 19 * fontScale }}
                className="text-center font-black tracking-tight text-espresso">
                Delete Team
              </Text>
              <Text
                style={{ fontSize: 12 * fontScale }}
                className="mt-2 text-center leading-5 text-taupe">
                This action <Text className="font-bold text-rose-600">cannot be undone</Text>. Deleting{' '}
                <Text className="font-bold text-espresso">&quot;{team?.name}&quot;</Text> will
                permanently revoke access for all members and remove all farm and folder assignments.
              </Text>

              {/* Instruction Box */}
              <View className="mt-4 rounded-2xl border border-rose-200/80 bg-rose-50/70 p-3.5">
                <Text
                  style={{ fontSize: 12 * fontScale }}
                  className="text-center font-semibold text-rose-900">
                  To proceed, please type{' '}
                  <Text className="font-mono font-black tracking-wider text-rose-700">CONFIRM</Text> below:
                </Text>
              </View>

              {/* Input for CONFIRM */}
              <View className="mt-3">
                <TextInput
                  value={deleteConfirmText}
                  onChangeText={setDeleteConfirmText}
                  placeholder='Type "CONFIRM"'
                  placeholderTextColor={isHighContrast ? '#555555' : '#A89F91'}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={20}
                  editable={!isDeletingTeam}
                  style={{ fontSize: 15 * fontScale }}
                  className={`rounded-2xl border px-4 py-3.5 text-center font-mono text-base font-bold text-espresso ${
                    deleteConfirmText === 'CONFIRM'
                      ? 'border-emerald-500 bg-emerald-50/50 text-emerald-800'
                      : deleteConfirmText.length > 0
                      ? 'border-rose-400 bg-rose-50/20'
                      : 'border-black/15 bg-champagne/30'
                  }`}
                  accessibilityLabel="Type CONFIRM to confirm deletion"
                />

                {/* Live validation feedback */}
                {deleteConfirmText.length > 0 && deleteConfirmText !== 'CONFIRM' ? (
                  <Text className="mt-1.5 text-center text-[11px] font-semibold text-rose-600">
                    Must exactly match uppercase &quot;CONFIRM&quot;
                  </Text>
                ) : deleteConfirmText === 'CONFIRM' ? (
                  <Text className="mt-1.5 text-center text-[11px] font-bold text-emerald-600">
                    Confirmation matched. Ready to delete.
                  </Text>
                ) : null}
              </View>

              {/* Action Buttons */}
              <View className="mt-6 flex-row gap-3">
                <Pressable
                  onPress={handleCloseDeleteTeamModal}
                  disabled={isDeletingTeam}
                  className={`flex-1 items-center justify-center rounded-2xl border border-black/10 bg-champagne/50 py-3.5 active:scale-[0.98] ${
                    isGloveMode ? 'min-h-[50px]' : ''
                  }`}>
                  <Text className="font-bold text-espresso">Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleConfirmDeleteTeam}
                  disabled={deleteConfirmText !== 'CONFIRM' || isDeletingTeam}
                  className={`flex-1 items-center justify-center rounded-2xl py-3.5 shadow-sm active:scale-[0.98] ${
                    deleteConfirmText === 'CONFIRM' && !isDeletingTeam
                      ? 'bg-rose-600 shadow-rose-600/30'
                      : 'bg-rose-300 opacity-60'
                  } ${isGloveMode ? 'min-h-[50px]' : ''}`}>
                  {isDeletingTeam ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="font-bold text-white">Delete Team</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
