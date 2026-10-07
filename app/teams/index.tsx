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
import { router, useFocusEffect } from 'expo-router';
import {
  Users,
  Plus,
  Search,
  X,
  ChevronRight,
  Shield,
  Crown,
  UserCheck,
  Sprout,
  Layers,
  Sparkles,
  Mail,
  Pencil,
  Trash2,
  Folder,
} from 'lucide-react-native';
import { FileText } from '../../components/Icons';
import { BackButton } from '../../components/common/BackButton';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { Modal } from '../../components/common/AppModal';
import { useAuth } from '../../lib/AuthContext';
import { useAccessibility } from '../../lib/accessibility';
import {
  createTeam,
  updateTeam,
  deleteTeam,
  getUserTeams,
  getUserPendingInvites,
  TeamWithStats,
  TeamRole,
} from '../../lib/team-operations';
import { powersync } from '../../lib/powersync';

export default function TeamsOverviewScreen() {
  const { user } = useAuth();
  const { isGloveMode, isHighContrast, fontScale, triggerHaptic } = useAccessibility();

  const [teams, setTeams] = useState<TeamWithStats[]>([]);
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Team Modal
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit Team Modal (Owner Only)
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [selectedTeamForEdit, setSelectedTeamForEdit] = useState<TeamWithStats | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamDesc, setEditTeamDesc] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete Team Modal (Owner Only with "CONFIRM" validation)
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [selectedTeamForDelete, setSelectedTeamForDelete] = useState<TeamWithStats | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTeams = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [list, pending] = await Promise.all([
        getUserTeams(user.id),
        getUserPendingInvites(user.id),
      ]);
      setTeams(list);
      setPendingInvitesCount(pending.length);
    } catch (err: any) {
      console.warn('[TeamsScreen] Failed to fetch teams:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchTeams();
    }, [fetchTeams])
  );

  // Watch for real-time changes to teams and pending invitations
  useEffect(() => {
    if (!user?.id) return;
    const currentUserId = user.id;

    const abortController = new AbortController();
    async function watchTeamsAndInvites() {
      try {
        for await (const _update of powersync.watch(
          `SELECT id FROM teams WHERE owner_id = ?
           UNION ALL
           SELECT id FROM team_members WHERE user_id = ?`,
          [currentUserId, currentUserId],
          { signal: abortController.signal }
        )) {
          void fetchTeams();
        }
      } catch (err) {
        // silent
      }
    }

    watchTeamsAndInvites();

    return () => {
      abortController.abort();
    };
  }, [user?.id, fetchTeams]);

  const handleRefresh = () => {
    triggerHaptic('light');
    setRefreshing(true);
    fetchTeams();
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      Alert.alert('Required', 'Please enter a name for your team.');
      return;
    }
    if (!user?.id) return;

    try {
      setIsCreating(true);
      triggerHaptic('selection');
      const teamId = await createTeam({
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || undefined,
        ownerId: user.id,
      });

      setIsCreateModalVisible(false);
      setNewTeamName('');
      setNewTeamDesc('');
      triggerHaptic('success');
      await fetchTeams();

      // Navigate to the newly created team
      router.push(`/teams/${teamId}`);
    } catch (err: any) {
      console.error('[TeamsScreen] Create error:', err);
      Alert.alert('Error', err?.message || 'Could not create team.');
    } finally {
      setIsCreating(false);
    }
  };

  // --- Edit Team (Owner Only) ---
  const handleOpenEditModal = (teamItem: TeamWithStats) => {
    const isOwner = teamItem.my_role === 'owner' || (user?.id && teamItem.owner_id === user.id);
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the team owner can edit this team.');
      return;
    }
    triggerHaptic('selection');
    setSelectedTeamForEdit(teamItem);
    setEditTeamName(teamItem.name);
    setEditTeamDesc(teamItem.description || '');
    setIsEditModalVisible(true);
  };

  const handleCloseEditModal = () => {
    if (isUpdating) return;
    setIsEditModalVisible(false);
    setSelectedTeamForEdit(null);
    setEditTeamName('');
    setEditTeamDesc('');
  };

  const handleSaveEditTeam = async () => {
    if (!selectedTeamForEdit) return;
    const isOwner =
      selectedTeamForEdit.my_role === 'owner' ||
      (user?.id && selectedTeamForEdit.owner_id === user.id);
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the team owner can edit this team.');
      return;
    }
    if (!editTeamName.trim()) {
      Alert.alert('Required', 'Please enter a name for your team.');
      return;
    }

    try {
      setIsUpdating(true);
      triggerHaptic('selection');
      await updateTeam(selectedTeamForEdit.id, {
        name: editTeamName.trim(),
        description: editTeamDesc.trim() || undefined,
      });

      triggerHaptic('success');
      setIsEditModalVisible(false);
      setSelectedTeamForEdit(null);
      setEditTeamName('');
      setEditTeamDesc('');
      await fetchTeams();
      Alert.alert('Success', 'Team updated successfully.');
    } catch (err: any) {
      console.error('[TeamsScreen] Update error:', err);
      Alert.alert('Error', err?.message || 'Could not update team.');
    } finally {
      setIsUpdating(false);
    }
  };

  // --- Delete Team with "CONFIRM" Validation (Owner Only) ---
  const handleOpenDeleteModal = (teamItem: TeamWithStats) => {
    const isOwner = teamItem.my_role === 'owner' || (user?.id && teamItem.owner_id === user.id);
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the team owner can delete this team.');
      return;
    }
    triggerHaptic('warning');
    setSelectedTeamForDelete(teamItem);
    setDeleteConfirmText('');
    setIsDeleteModalVisible(true);
  };

  const handleCloseDeleteModal = () => {
    if (isDeleting) return;
    setIsDeleteModalVisible(false);
    setSelectedTeamForDelete(null);
    setDeleteConfirmText('');
  };

  const handleConfirmDeleteTeam = async () => {
    if (!selectedTeamForDelete) return;
    const isOwner =
      selectedTeamForDelete.my_role === 'owner' ||
      (user?.id && selectedTeamForDelete.owner_id === user.id);
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the team owner can delete this team.');
      setIsDeleteModalVisible(false);
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
      setIsDeleting(true);
      triggerHaptic('heavy');
      await deleteTeam(selectedTeamForDelete.id);
      triggerHaptic('success');
      setIsDeleteModalVisible(false);
      setSelectedTeamForDelete(null);
      setDeleteConfirmText('');
      await fetchTeams();
      Alert.alert('Team Deleted', 'The team has been deleted.');
    } catch (err: any) {
      console.error('[TeamsScreen] Delete error:', err);
      Alert.alert('Deletion Failed', err?.message || 'Could not delete team. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return teams;
    const q = searchQuery.toLowerCase();
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }, [teams, searchQuery]);

  const totalMembers = useMemo(
    () => teams.reduce((acc, t) => acc + (t.member_count || 1), 0),
    [teams]
  );
  const totalFarms = useMemo(
    () => teams.reduce((acc, t) => acc + (t.farm_count || 0), 0),
    [teams]
  );
  const totalFolders = useMemo(
    () => teams.reduce((acc, t) => acc + (t.folder_count || 0), 0),
    [teams]
  );

  const renderRoleBadge = (role: TeamRole) => {
    if (role === 'owner') {
      return (
        <View className="flex-row items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5">
          <Crown size={11} color="#B45309" strokeWidth={2.5} />
          <Text
            style={{ fontSize: 10 * fontScale }}
            className="font-black uppercase tracking-wider text-amber-800">
            Owner
          </Text>
        </View>
      );
    }
    if (role === 'admin') {
      return (
        <View className="flex-row items-center gap-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5">
          <Shield size={11} color="#4338CA" strokeWidth={2.5} />
          <Text
            style={{ fontSize: 10 * fontScale }}
            className="font-black uppercase tracking-wider text-indigo-800">
            Admin
          </Text>
        </View>
      );
    }
    return (
      <View className="flex-row items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5">
        <UserCheck size={11} color="#047857" strokeWidth={2.5} />
        <Text
          style={{ fontSize: 10 * fontScale }}
          className="font-black uppercase tracking-wider text-emerald-800">
          Member
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-champagne" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-black/5 bg-champagne px-5 py-3.5">
        <View className="flex-row items-center gap-3 flex-1">
          <BackButton />
          <View className="flex-1">
            <Text
              style={{ fontSize: 19 * fontScale }}
              className={`tracking-tight ${
                isHighContrast ? 'font-black text-black' : 'font-black text-espresso'
              }`}>
              Teams
            </Text>
            <Text
              style={{ fontSize: 11.5 * fontScale }}
              className={`font-semibold ${
                isHighContrast ? 'text-black' : 'text-taupe'
              }`}>
              Collaborator & resource management
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => {
              triggerHaptic('selection');
              router.push('/teams/invitations');
            }}
            style={
              isHighContrast
                ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                : undefined
            }
            className={`flex-row items-center justify-center rounded-2xl border border-cognac/25 bg-cognac/10 ${
              isGloveMode ? 'min-h-[48px] px-3.5' : 'h-10 px-3'
            } active:scale-95`}>
            <Mail size={16} color={isHighContrast ? '#000000' : '#8C4522'} strokeWidth={2.4} />
            {pendingInvitesCount > 0 && (
              <View className="ml-1.5 rounded-full bg-cognac px-1.5 py-0.5">
                <Text
                  style={{ fontSize: 10 * fontScale }}
                  className="font-black text-white">
                  {pendingInvitesCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              triggerHaptic('selection');
              setIsCreateModalVisible(true);
            }}
            className={`flex-row items-center gap-1.5 rounded-2xl bg-cognac px-3.5 py-2.5 shadow-sm active:scale-95 ${
              isGloveMode ? 'min-h-[48px]' : ''
            }`}>
            <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text
              style={{ fontSize: 12.5 * fontScale }}
              className="font-bold text-white tracking-wide">
              New Team
            </Text>
          </TouchableOpacity>
        </View>
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
        {/* Pending Invitations Alert Banner */}
        {pendingInvitesCount > 0 && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              triggerHaptic('selection');
              router.push('/teams/invitations');
            }}
            style={
              isHighContrast
                ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                : undefined
            }
            className="mb-4 flex-row items-center justify-between rounded-2xl border border-amber-300 bg-amber-50/95 p-3.5 shadow-xs active:scale-[0.99]">
            <View className="flex-row items-center gap-3 flex-1 pr-2">
              <View
                style={
                  isHighContrast
                    ? { borderWidth: 1.5, borderColor: '#000000' }
                    : undefined
                }
                className="h-10 w-10 items-center justify-center rounded-xl border border-amber-300 bg-amber-100">
                <Mail size={18} color="#B45309" strokeWidth={2.4} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text
                    style={{ fontSize: 13.5 * fontScale }}
                    className="font-black text-amber-950">
                    {pendingInvitesCount} Pending Invitation{pendingInvitesCount !== 1 ? 's' : ''}
                  </Text>
                  <View className="rounded-full bg-amber-500 px-1.5 py-0.5">
                    <Text
                      style={{ fontSize: 9 * fontScale }}
                      className="font-black text-white uppercase tracking-wider">
                      Action Required
                    </Text>
                  </View>
                </View>
                <Text
                  style={{ fontSize: 11 * fontScale }}
                  className="font-medium text-amber-800/90 mt-0.5"
                  numberOfLines={1}>
                  You have been invited to collaborate. Tap to confirm or decline.
                </Text>
              </View>
            </View>
            <View className="h-7 w-7 items-center justify-center rounded-full bg-amber-200/70">
              <ChevronRight size={14} color="#B45309" strokeWidth={2.5} />
            </View>
          </TouchableOpacity>
        )}
        {/* Metric Cards Banner */}
        <View className="flex-row items-center gap-2.5 mb-4">
          <View className="flex-1 rounded-2xl border border-white/90 bg-white/80 p-3 shadow-xs">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Users size={14} color="#8C4522" />
              <Text
                style={{ fontSize: 10 * fontScale }}
                className="font-bold uppercase tracking-wider text-taupe">
                Teams
              </Text>
            </View>
            <Text
              style={{ fontSize: 18 * fontScale }}
              className="font-black text-espresso">
              {teams.length}
            </Text>
          </View>

          <View className="flex-1 rounded-2xl border border-white/90 bg-white/80 p-3 shadow-xs">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Sprout size={14} color="#047857" />
              <Text
                style={{ fontSize: 10 * fontScale }}
                className="font-bold uppercase tracking-wider text-taupe">
                Farms
              </Text>
            </View>
            <Text
              style={{ fontSize: 18 * fontScale }}
              className="font-black text-espresso">
              {totalFarms}
            </Text>
          </View>

          <View className="flex-1 rounded-2xl border border-white/90 bg-white/80 p-3 shadow-xs">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Folder size={14} color="#4338CA" />
              <Text
                style={{ fontSize: 10 * fontScale }}
                className="font-bold uppercase tracking-wider text-taupe">
                Folders
              </Text>
            </View>
            <Text
              style={{ fontSize: 18 * fontScale }}
              className="font-black text-espresso">
              {totalFolders}
            </Text>
          </View>
        </View>

        {/* Search Bar */}
        {teams.length > 0 && (
          <View className="relative mb-4">
            <View className="flex-row items-center rounded-2xl border border-black/5 bg-white/80 px-3.5 py-2.5 shadow-xs">
              <Search size={16} color="#8C7C70" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search teams by name..."
                placeholderTextColor="#A89F91"
                style={{ fontSize: 13.5 * fontScale }}
                className="flex-1 ml-2 font-medium text-espresso"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={15} color="#8C7C70" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Teams List */}
        {loading ? (
          <View className="py-16 items-center justify-center">
            <ActivityIndicator size="large" color="#8C4522" />
            <Text
              style={{ fontSize: 12 * fontScale }}
              className="mt-3 font-medium text-taupe">
              Loading teams...
            </Text>
          </View>
        ) : filteredTeams.length === 0 ? (
          <View className="items-center justify-center rounded-3xl border border-black/5 bg-white/70 p-8 my-6 text-center shadow-xs">
            <View className="h-16 w-16 items-center justify-center rounded-2xl bg-cognac/10 border border-cognac/20 mb-4">
              <Users size={32} color="#8C4522" />
            </View>
            <Text
              style={{ fontSize: 17 * fontScale }}
              className="font-black tracking-tight text-espresso text-center">
              {searchQuery ? 'No matching teams' : 'No Teams Yet'}
            </Text>
            <Text
              style={{ fontSize: 12.5 * fontScale }}
              className="mt-2 text-center text-taupe max-w-xs leading-relaxed">
              {searchQuery
                ? 'Try a different search keyword.'
                : 'Create teams to manage collaborators across multiple farms and folders without repetitive invitations.'}
            </Text>

            {!searchQuery && (
              <TouchableOpacity
                onPress={() => setIsCreateModalVisible(true)}
                className="mt-6 flex-row items-center gap-2 rounded-2xl bg-cognac px-5 py-3 shadow-sm active:scale-95">
                <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text
                  style={{ fontSize: 13.5 * fontScale }}
                  className="font-bold text-white">
                  Create Your First Team
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View className="gap-3 pb-16">
            {filteredTeams.map((team) => {
              const isTeamOwner =
                team.my_role === 'owner' || (user?.id && team.owner_id === user.id);

              return (
                <TouchableOpacity
                  key={team.id}
                  onPress={() => {
                    triggerHaptic('selection');
                    router.push(`/teams/${team.id}`);
                  }}
                  activeOpacity={0.85}
                  className={`overflow-hidden rounded-3xl border border-white/90 bg-white/85 p-4 shadow-sm active:scale-[0.99] ${
                    isGloveMode ? 'p-5' : ''
                  }`}>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                        <Text
                          style={{ fontSize: 16 * fontScale }}
                          className="font-black tracking-tight text-espresso"
                          numberOfLines={1}>
                          {team.name}
                        </Text>
                        {renderRoleBadge(team.my_role)}
                      </View>

                      {team.description ? (
                        <Text
                          style={{ fontSize: 12 * fontScale }}
                          className="text-taupe font-medium leading-relaxed mb-3"
                          numberOfLines={2}>
                          {team.description}
                        </Text>
                      ) : (
                        <View className="h-1 mb-2" />
                      )}

                      {/* Quick Resources Chips */}
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <View className="flex-row items-center gap-1 rounded-xl bg-cognac/10 px-2.5 py-1">
                          <Users size={12} color="#8C4522" />
                          <Text
                            style={{ fontSize: 11 * fontScale }}
                            className="font-bold text-cognac">
                            {team.member_count} {team.member_count === 1 ? 'member' : 'members'}
                          </Text>
                        </View>

                        <View className="flex-row items-center gap-1 rounded-xl bg-emerald-600/10 px-2.5 py-1">
                          <Sprout size={12} color="#047857" />
                          <Text
                            style={{ fontSize: 11 * fontScale }}
                            className="font-bold text-emerald-800">
                            {team.farm_count} {team.farm_count === 1 ? 'farm' : 'farms'}
                          </Text>
                        </View>

                        <View className="flex-row items-center gap-1 rounded-xl bg-indigo-600/10 px-2.5 py-1">
                          <Folder size={12} color="#4338CA" />
                          <Text
                            style={{ fontSize: 11 * fontScale }}
                            className="font-bold text-indigo-800">
                            {team.folder_count} {team.folder_count === 1 ? 'folder' : 'folders'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Action Controls & Navigation */}
                    <View className="flex-row items-center gap-1.5 self-start pt-0.5">
                      {isTeamOwner && (
                        <>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(team);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel={`Edit ${team.name}`}
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
                            onPress={(e) => {
                              e.stopPropagation();
                              handleOpenDeleteModal(team);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel={`Delete ${team.name}`}
                            className={`h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/25 active:scale-95 ${
                              isGloveMode ? 'h-10 w-10' : ''
                            }`}>
                            <Trash2
                              size={isGloveMode ? 16 : 13.5}
                              color="#E11D48"
                              strokeWidth={2.4}
                            />
                          </TouchableOpacity>
                        </>
                      )}

                      <View
                        className={`h-8 w-8 items-center justify-center rounded-xl bg-taupe/10 ${
                          isGloveMode ? 'h-10 w-10' : ''
                        }`}>
                        <ChevronRight size={16} color="#8C7C70" strokeWidth={2.2} />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal: Create Team */}
      <Modal
        visible={isCreateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isCreating) setIsCreateModalVisible(false);
        }}>
        <Pressable
          className="flex-1 justify-center bg-black/50 px-5"
          onPress={() => {
            if (!isCreating) setIsCreateModalVisible(false);
          }}>
          <Pressable
            className="overflow-hidden rounded-3xl border border-white/90 bg-champagne p-6 shadow-xl"
            onPress={(e) => e.stopPropagation()}>
            <View className="flex-row items-center justify-between pb-3 border-b border-black/5">
              <View className="flex-row items-center gap-2.5">
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-cognac/10 border border-cognac/20">
                  <Sparkles size={18} color="#8C4522" />
                </View>
                <Text
                  style={{ fontSize: 17 * fontScale }}
                  className="font-black text-espresso">
                  Create New Team
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsCreateModalVisible(false)}
                disabled={isCreating}>
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
                  value={newTeamName}
                  onChangeText={setNewTeamName}
                  placeholder="e.g. Field Operations, Irrigation Crew"
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
                  value={newTeamDesc}
                  onChangeText={setNewTeamDesc}
                  placeholder="e.g. Handles daily watering, field logs and maintenance"
                  placeholderTextColor="#A89F91"
                  multiline
                  numberOfLines={2}
                  style={{ fontSize: 13.5 * fontScale }}
                  className="rounded-2xl border border-black/10 bg-white px-4 py-3 font-medium text-espresso min-h-[70px]"
                />
              </View>

              <View className="flex-row items-center justify-end gap-2.5 mt-3">
                <TouchableOpacity
                  onPress={() => setIsCreateModalVisible(false)}
                  disabled={isCreating}
                  className="rounded-xl px-4 py-2.5 border border-black/10">
                  <Text className="font-bold text-taupe">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreateTeam}
                  disabled={isCreating}
                  className="flex-row items-center gap-1.5 rounded-xl bg-cognac px-5 py-2.5 shadow-sm active:scale-95">
                  {isCreating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="font-bold text-white">Create Team</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: EDIT TEAM (OWNER ONLY) */}
      {/* ==================================================================== */}
      <Modal
        visible={isEditModalVisible && Boolean(selectedTeamForEdit)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isUpdating) handleCloseEditModal();
        }}>
        <Pressable
          className="flex-1 justify-center bg-black/50 px-5"
          onPress={() => {
            if (!isUpdating) handleCloseEditModal();
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
                  onPress={handleCloseEditModal}
                  disabled={isUpdating}>
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
                    onPress={handleCloseEditModal}
                    disabled={isUpdating}
                    className="rounded-xl px-4 py-2.5 border border-black/10">
                    <Text className="font-bold text-taupe">Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSaveEditTeam}
                    disabled={isUpdating || !editTeamName.trim()}
                    className={`flex-row items-center gap-1.5 rounded-xl px-5 py-2.5 shadow-sm active:scale-95 ${
                      !editTeamName.trim() || isUpdating ? 'bg-cognac/50' : 'bg-cognac'
                    }`}>
                    {isUpdating ? (
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
        visible={isDeleteModalVisible && Boolean(selectedTeamForDelete)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeleting) handleCloseDeleteModal();
        }}>
        <Pressable
          className="flex-1 justify-center bg-black/60 px-5"
          onPress={() => {
            if (!isDeleting) handleCloseDeleteModal();
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
                <Text className="font-bold text-espresso">&quot;{selectedTeamForDelete?.name}&quot;</Text> will
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
                  editable={!isDeleting}
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
                  onPress={handleCloseDeleteModal}
                  disabled={isDeleting}
                  className={`flex-1 items-center justify-center rounded-2xl border border-black/10 bg-champagne/50 py-3.5 active:scale-[0.98] ${
                    isGloveMode ? 'min-h-[50px]' : ''
                  }`}>
                  <Text className="font-bold text-espresso">Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleConfirmDeleteTeam}
                  disabled={deleteConfirmText !== 'CONFIRM' || isDeleting}
                  className={`flex-1 items-center justify-center rounded-2xl py-3.5 shadow-sm active:scale-[0.98] ${
                    deleteConfirmText === 'CONFIRM' && !isDeleting
                      ? 'bg-rose-600 shadow-rose-600/30'
                      : 'bg-rose-300 opacity-60'
                  } ${isGloveMode ? 'min-h-[50px]' : ''}`}>
                  {isDeleting ? (
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
