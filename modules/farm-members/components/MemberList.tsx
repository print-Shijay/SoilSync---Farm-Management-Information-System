import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import {
  User,
  Trash2,
  Users,
  CheckCircle2,
  Clock,
  Crown,
  Search,
  X,
  Shield,
  UserCheck,
} from 'lucide-react-native';
import { FarmMember, useFarmMembers } from '../hooks/useFarmMembers';

interface MemberListProps {
  farmId: string;
  isOwner: boolean;
  onClose?: () => void;
}

const getDisplayName = (firstName?: string, lastName?: string, email?: string) => {
  if (firstName || lastName) {
    return `${firstName || ''} ${lastName || ''}`.trim();
  }
  if (email) {
    const namePart = email.split('@')[0];
    return namePart
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return 'Collaborator';
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
  { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200' },
  { bg: 'bg-cognac/15', text: 'text-cognac', border: 'border-cognac/30' },
];

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash];
}

export function MemberList({ farmId, isOwner, onClose }: MemberListProps) {
  const { members, loading, error, removeMember } = useFarmMembers(farmId);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);

  // Automatically reset navigating state when the screen/tab gains focus again
  useFocusEffect(
    useCallback(() => {
      setIsNavigating(false);
    }, [])
  );

  const handleManageGroups = () => {
    if (isNavigating) return;
    setIsNavigating(true);

    try {
      // Exit modal upon redirection
      if (onClose) {
        onClose();
      }
      router.push('/teams');
    } catch (err) {
      console.error('[MemberList] Redirection error:', err);
      setIsNavigating(false);
    }
  };

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase().trim();
    return members.filter((m) => {
      const name = getDisplayName(m.first_name, m.last_name, m.email).toLowerCase();
      const email = (m.email || '').toLowerCase();
      const role = (m.role || '').toLowerCase();
      const team = (m.team_name || '').toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q) || team.includes(q);
    });
  }, [members, searchQuery]);

  const handleRemove = (member: FarmMember) => {
    const memberName = getDisplayName(member.first_name, member.last_name, member.email);
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName} from this team? They will lose access to this farm.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeMember(member.id, member.user_id),
        },
      ]
    );
  };

  const renderMember = ({ item }: { item: FarmMember }) => {
    const isPending = item.status === 'pending';
    const isFarmOwner = item.role === 'owner';
    const isTeamAdmin = item.role === 'admin';
    const displayName = getDisplayName(item.first_name, item.last_name, item.email);
    const initials = getInitials(displayName);
    const avatarColor = getAvatarColor(displayName);

    return (
      <View className="mb-2.5 flex-row items-center justify-between rounded-2xl border border-white/80 bg-white/90 p-3.5 shadow-sm shadow-espresso/5">
        <View className="flex-row items-center flex-1 pr-2">
          {/* Avatar */}
          <View
            className={`mr-3 h-10 w-10 items-center justify-center rounded-2xl border ${avatarColor.bg} ${avatarColor.border}`}>
            <Text className={`text-xs font-black ${avatarColor.text}`}>{initials}</Text>
          </View>

          {/* User Info */}
          <View className="flex-1 pr-2">
            <View className="flex-row items-center gap-1.5 flex-wrap">
              <Text className="text-sm font-bold text-espresso" numberOfLines={1}>
                {displayName}
              </Text>
              {isFarmOwner && (
                <View className="flex-row items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5">
                  <Crown size={10} color="#B45309" strokeWidth={2.5} />
                  <Text className="text-[9.5px] font-black uppercase tracking-wider text-amber-800">
                    Owner
                  </Text>
                </View>
              )}
              {isTeamAdmin && !isFarmOwner && (
                <View className="flex-row items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5">
                  <Shield size={10} color="#4338CA" strokeWidth={2.5} />
                  <Text className="text-[9.5px] font-black uppercase tracking-wider text-indigo-800">
                    Admin
                  </Text>
                </View>
              )}
            </View>

            {item.email && item.email !== displayName && (
              <Text className="text-xs text-taupe mt-0.5" numberOfLines={1}>
                {item.email}
              </Text>
            )}

            {/* Status & Team badges */}
            <View className="mt-1.5 flex-row items-center gap-1.5 flex-wrap">
              {item.team_name && (
                <View className="rounded-md bg-cognac/10 border border-cognac/20 px-1.5 py-0.5">
                  <Text className="text-[9.5px] font-bold text-cognac" numberOfLines={1}>
                    {item.team_name}
                  </Text>
                </View>
              )}

              {!isFarmOwner && (
                <View className="rounded-md bg-taupe/10 px-1.5 py-0.5">
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-taupe">
                    {item.role || 'Member'}
                  </Text>
                </View>
              )}

              {!isFarmOwner &&
                (isPending ? (
                  <View className="flex-row items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5">
                    <Clock size={10} color="#D97706" className="mr-1" />
                    <Text className="text-[10px] font-bold text-amber-700">Pending</Text>
                  </View>
                ) : (
                  <View className="flex-row items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5">
                    <CheckCircle2 size={10} color="#059669" className="mr-1" />
                    <Text className="text-[10px] font-bold text-emerald-700">Active</Text>
                  </View>
                ))}
            </View>
          </View>
        </View>

        {/* Remove action for owner */}
        {isOwner && !isFarmOwner && (
          <Pressable
            onPress={() => handleRemove(item)}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 active:scale-90">
            <Trash2 size={15} color="#E11D48" />
          </Pressable>
        )}
      </View>
    );
  };

  if (loading && members.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-12 bg-champagne">
        <ActivityIndicator size="large" color="#8C4522" />
        <Text className="mt-3 text-xs font-bold uppercase tracking-wider text-taupe">
          Loading team roster...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-champagne">
      {/* Header controls */}
      <View className="px-5 pt-3 pb-2">
        {/* Search bar */}
        <View className="mb-3 flex-row items-center rounded-2xl border border-black/5 bg-white px-3.5 py-2 shadow-sm shadow-espresso/5">
          <Search size={15} color="#8C7C70" className="mr-2" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            maxLength={255}
            placeholder="Search collaborators..."
            placeholderTextColor="#8C7C70"
            className="flex-1 text-sm font-medium text-espresso"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} className="p-1">
              <X size={14} color="#8C7C70" />
            </Pressable>
          )}
        </View>

        {/* Top Summary & Action Bar */}
        <View className="flex-row items-center justify-between border-b border-black/5 pb-2.5">
          <View>
            <Text className="text-[11px] font-bold uppercase tracking-[0.2em] text-cognac">
              Team Roster
            </Text>
            <Text className="text-xs font-medium text-taupe mt-0.5">
              {members.length} {members.length === 1 ? 'person' : 'people'} collaborating
            </Text>
          </View>

          {isOwner && (
            <Pressable
              onPress={handleManageGroups}
              disabled={isNavigating}
              hitSlop={6}
              accessibilityLabel="Manage Groups"
              accessibilityRole="button"
              accessibilityState={{ disabled: isNavigating }}
              className={`flex-row items-center gap-1.5 rounded-xl px-3.5 py-2 shadow-sm ${
                isNavigating
                  ? 'bg-cognac/60 opacity-70'
                  : 'bg-cognac active:scale-95'
              }`}>
              {isNavigating ? (
                <ActivityIndicator
                  size="small"
                  color="white"
                  style={{ transform: [{ scale: 0.75 }] }}
                />
              ) : (
                <Users size={14} color="white" />
              )}
              <Text className="text-xs font-bold text-white">
                {isNavigating ? 'Opening...' : 'Manage Groups'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Error banner */}
      {error && (
        <View className="mx-5 mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <Text className="text-xs font-semibold text-rose-700">{error}</Text>
        </View>
      )}

      {/* Members list */}
      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        ListEmptyComponent={
          <View className="mt-8 items-center justify-center rounded-3xl border border-dashed border-taupe/30 bg-white/70 p-8 shadow-sm">
            <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-cognac/10">
              <User size={24} color="#8C4522" />
            </View>
            <Text className="text-base font-bold text-espresso">No Collaborators Yet</Text>
            <Text className="mt-1 text-center text-xs leading-5 text-taupe">
              {isOwner
                ? 'Create a Team in Teams and assign it to this farm.'
                : 'No other team members are currently assigned to this farm.'}
            </Text>
            {isOwner && (
              <Pressable
                onPress={handleManageGroups}
                disabled={isNavigating}
                accessibilityLabel="Open Teams"
                accessibilityRole="button"
                accessibilityState={{ disabled: isNavigating }}
                className={`mt-4 flex-row items-center gap-2 rounded-2xl px-4 py-2.5 shadow-sm ${
                  isNavigating
                    ? 'bg-cognac/60 opacity-70'
                    : 'bg-cognac active:scale-95'
                }`}>
                {isNavigating ? (
                  <ActivityIndicator
                    size="small"
                    color="white"
                    style={{ transform: [{ scale: 0.8 }] }}
                  />
                ) : (
                  <Users size={16} color="white" />
                )}
                <Text className="text-xs font-bold text-white">
                  {isNavigating ? 'Opening...' : 'Open Teams'}
                </Text>
              </Pressable>
            )}
          </View>
        }
      />
    </View>
  );
}
