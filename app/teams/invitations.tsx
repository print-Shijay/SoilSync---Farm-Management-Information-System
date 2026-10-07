import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import {
  Users,
  Check,
  X,
  Mail,
  Shield,
  UserCheck,
  Sprout,
  Layers,
  ChevronRight,
  Clock,
} from 'lucide-react-native';
import { BackButton } from '../../components/common/BackButton';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { useAuth } from '../../lib/AuthContext';
import { useAccessibility } from '../../lib/accessibility';
import {
  getUserPendingInvites,
  respondToTeamInvitation,
  TeamPendingInvite,
} from '../../lib/team-operations';
import { powersync } from '../../lib/powersync';

export default function TeamInvitationsScreen() {
  const { user } = useAuth();
  const { isGloveMode, isHighContrast, fontScale, triggerHaptic } = useAccessibility();

  const [invites, setInvites] = useState<TeamPendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    if (!user?.id) return;
    try {
      const list = await getUserPendingInvites(user.id);
      setInvites(list);
    } catch (err: any) {
      console.warn('[TeamInvitationsScreen] Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchInvites();
    }, [fetchInvites])
  );

  // Watch for real-time changes to team_members
  useEffect(() => {
    if (!user?.id) return;
    const currentUserId = user.id;

    const abortController = new AbortController();
    async function watchPending() {
      try {
        for await (const _update of powersync.watch(
          "SELECT id FROM team_members WHERE user_id = ? AND status = 'pending'",
          [currentUserId],
          { signal: abortController.signal }
        )) {
          void fetchInvites();
        }
      } catch (err) {
        // silent
      }
    }

    watchPending();

    return () => {
      abortController.abort();
    };
  }, [user?.id, fetchInvites]);

  const handleRefresh = () => {
    triggerHaptic('light');
    setRefreshing(true);
    fetchInvites();
  };

  const handleConfirm = async (invite: TeamPendingInvite) => {
    triggerHaptic('selection');
    setProcessingId(invite.id);
    try {
      const res = await respondToTeamInvitation({
        inviteId: invite.id,
        teamId: invite.team_id,
        status: 'accepted',
      });

      if (!res.success) {
        triggerHaptic('warning');
        Alert.alert('Notice', res.error || 'Failed to accept invitation.');
        return;
      }

      triggerHaptic('success');
      Alert.alert(
        'Invitation Confirmed!',
        `You have joined "${invite.team_name}". Its shared farms and folders are now accessible.`,
        [
          {
            text: 'View Team',
            onPress: () => router.push(`/teams/${invite.team_id}`),
          },
          {
            text: 'OK',
            style: 'cancel',
          },
        ]
      );
      await fetchInvites();
    } catch (err: any) {
      triggerHaptic('warning');
      Alert.alert('Error', err?.message || 'Could not accept invitation.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = (invite: TeamPendingInvite) => {
    triggerHaptic('warning');
    Alert.alert(
      'Decline Invitation',
      `Are you sure you want to decline the invitation to join "${invite.team_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(invite.id);
            try {
              const res = await respondToTeamInvitation({
                inviteId: invite.id,
                teamId: invite.team_id,
                status: 'declined',
              });

              if (!res.success) {
                triggerHaptic('warning');
                Alert.alert('Notice', res.error || 'Failed to decline invitation.');
                return;
              }

              triggerHaptic('success');
              await fetchInvites();
            } catch (err: any) {
              triggerHaptic('warning');
              Alert.alert('Error', err?.message || 'Could not decline invitation.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  const renderRoleBadge = (role: string) => {
    if (role === 'admin') {
      return (
        <View className="flex-row items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5">
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
      <View className="flex-row items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5">
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
      {/* Header Bar */}
      <View className="flex-row items-center justify-between border-b border-black/5 bg-champagne px-5 py-3.5">
        <View className="flex-row items-center gap-3 flex-1">
          <BackButton />
          <View className="flex-1">
            <Text
              style={{ fontSize: 19 * fontScale }}
              className={`tracking-tight ${
                isHighContrast ? 'font-black text-black' : 'font-black text-espresso'
              }`}>
              Team Invitations
            </Text>
            <Text
              style={{ fontSize: 11.5 * fontScale }}
              className={`font-semibold ${
                isHighContrast ? 'text-black font-bold' : 'text-taupe'
              }`}>
              {invites.length} pending invitation{invites.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8C4522"
            colors={['#8C4522']}
          />
        }>
        {loading ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#8C4522" />
            <Text
              style={{ fontSize: 13 * fontScale }}
              className="mt-3 font-bold text-taupe">
              Loading invitations...
            </Text>
          </View>
        ) : invites.length === 0 ? (
          /* Empty State */
          <View
            style={
              isHighContrast
                ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                : undefined
            }
            className="mt-6 items-center justify-center rounded-[28px] border-2 border-dashed border-cognac/30 bg-white/80 p-8 shadow-xs">
            <View
              style={
                isHighContrast
                  ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#F0F0F0' }
                  : undefined
              }
              className="h-16 w-16 items-center justify-center rounded-3xl border border-cognac/20 bg-cognac/10 shadow-inner">
              <Mail size={32} color={isHighContrast ? '#000000' : '#8C4522'} strokeWidth={2} />
            </View>
            <Text
              style={{ fontSize: Math.round(18 * fontScale) }}
              className={`mt-4 text-center font-black ${
                isHighContrast ? 'text-black' : 'text-espresso'
              }`}>
              No Pending Invitations
            </Text>
            <Text
              style={{
                fontSize: Math.round(12.5 * fontScale),
                lineHeight: Math.round(18 * fontScale),
              }}
              className={`mt-1.5 text-center ${
                isHighContrast ? 'text-black/80 font-medium' : 'text-taupe'
              }`}>
              You are all caught up! When a team owner or admin invites you to collaborate, their request will appear here for you to confirm or decline.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                triggerHaptic('selection');
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/teams');
                }
              }}
              className={`mt-6 flex-row items-center rounded-full bg-cognac px-6 ${
                isGloveMode ? 'min-h-[52px] py-3.5' : 'py-3'
              } shadow-md shadow-cognac/30 active:scale-95`}>
              <Users size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text
                style={{ fontSize: Math.round(13 * fontScale) }}
                className="ml-2 font-black text-white">
                View Your Teams
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Invitations List */
          <View className="space-y-3.5">
            {invites.map((invite) => {
              const isProcessing = processingId === invite.id;

              return (
                <View
                  key={invite.id}
                  style={
                    isHighContrast
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }
                  className="mb-4 rounded-[28px] border border-cognac/15 bg-white p-5 shadow-sm shadow-espresso/5">
                  {/* Top Row: Team Avatar & Info */}
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 flex-row items-center pr-2">
                      <View
                        style={
                          isHighContrast
                            ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#F3F3F3' }
                            : undefined
                        }
                        className={`mr-3.5 ${
                          isGloveMode ? 'h-13 w-13' : 'h-11 w-11'
                        } items-center justify-center rounded-2xl border border-cognac/20 bg-cognac/10 shadow-xs`}>
                        <Users
                          size={isGloveMode ? 22 : 20}
                          color={isHighContrast ? '#000000' : '#8C4522'}
                          strokeWidth={2.4}
                        />
                      </View>

                      <View className="flex-1">
                        <Text
                          style={{ fontSize: Math.round(16.5 * fontScale) }}
                          className={`font-black tracking-tight ${
                            isHighContrast ? 'text-black' : 'text-espresso'
                          }`}
                          numberOfLines={1}>
                          {invite.team_name}
                        </Text>
                        <Text
                          style={{ fontSize: Math.round(12 * fontScale) }}
                          className={`mt-0.5 font-semibold ${
                            isHighContrast ? 'text-black/80' : 'text-taupe'
                          }`}
                          numberOfLines={1}>
                          Invited by {invite.inviter_name || 'Team Administrator'}
                        </Text>
                      </View>
                    </View>

                    {renderRoleBadge(invite.role)}
                  </View>

                  {/* Resource Access Preview */}
                  <View
                    style={
                      isHighContrast
                        ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#F8F8F8' }
                        : undefined
                    }
                    className="mt-3.5 flex-row items-center justify-between rounded-[18px] border border-cognac/15 bg-cognac/[0.04] px-3.5 py-2.5">
                    <View className="flex-row items-center gap-4">
                      <View className="flex-row items-center gap-1.5">
                        <Sprout size={13} color="#047857" strokeWidth={2.2} />
                        <Text
                          style={{ fontSize: Math.round(11 * fontScale) }}
                          className="font-bold text-espresso">
                          {invite.farm_count || 0} Farm{(invite.farm_count || 0) !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <Layers size={13} color="#4338CA" strokeWidth={2.2} />
                        <Text
                          style={{ fontSize: Math.round(11 * fontScale) }}
                          className="font-bold text-espresso">
                          {invite.folder_count || 0} Folder{(invite.folder_count || 0) !== 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-1">
                      <Clock size={11} color="#8C7C70" strokeWidth={2} />
                      <Text
                        style={{ fontSize: Math.round(10.5 * fontScale) }}
                        className="font-semibold text-taupe">
                        Pending response
                      </Text>
                    </View>
                  </View>

                  {/* Action Buttons: Confirm & Decline */}
                  <View className="mt-4 flex-row items-center gap-2.5">
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={isProcessing}
                      onPress={() => handleDecline(invite)}
                      style={
                        isHighContrast
                          ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                          : undefined
                      }
                      className={`flex-1 flex-row items-center justify-center rounded-2xl border border-black/10 bg-black/[0.03] ${
                        isGloveMode ? 'min-h-[50px] py-3' : 'py-2.5'
                      } active:bg-black/10`}>
                      <X size={15} color={isHighContrast ? '#000000' : '#8C7C70'} strokeWidth={2.5} />
                      <Text
                        style={{ fontSize: Math.round(12.5 * fontScale) }}
                        className={`ml-1.5 font-bold ${
                          isHighContrast ? 'text-black' : 'text-taupe'
                        }`}>
                        Decline
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      disabled={isProcessing}
                      onPress={() => handleConfirm(invite)}
                      style={
                        isHighContrast
                          ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                          : undefined
                      }
                      className={`flex-[1.5] flex-row items-center justify-center rounded-2xl bg-cognac ${
                        isGloveMode ? 'min-h-[50px] py-3' : 'py-2.5'
                      } shadow-sm shadow-cognac/30 active:scale-[0.98]`}>
                      {isProcessing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Check size={16} color="#FFFFFF" strokeWidth={2.8} />
                          <Text
                            style={{ fontSize: Math.round(12.5 * fontScale) }}
                            className="ml-1.5 font-black text-white">
                            Confirm & Join
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
