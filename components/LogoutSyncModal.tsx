import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
  } from 'react-native';
import { AppAlert as Alert } from './common/AppAlert';
import { Modal } from './common/AppModal';
import {
  X,
  RefreshCw,
  LogOut,
  AlertTriangle,
  Database,
  CloudUpload,
  MessageSquareWarning,
  CheckCircle2,
} from 'lucide-react-native';
import { useAuth } from '../lib/AuthContext';
import {
  getPendingUploadDetails,
  PendingUploadItem,
  PendingUploadSummary,
} from '../lib/pending-uploads';
import { forceSyncNow } from '../lib/sync';
import { ReportProblemModal } from './ReportProblemModal';
import { useNetworkStatus } from '../lib/hooks/useNetworkStatus';
import * as Network from 'expo-network';

interface LogoutSyncModalProps {
  visible: boolean;
  onClose: () => void;
  onSignOutSuccess?: () => void;
}

export function LogoutSyncModal({
  visible,
  onClose,
  onSignOutSuccess,
}: LogoutSyncModalProps) {
  const { user, signOut } = useAuth();
  const { isOnline } = useNetworkStatus();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [forcingLogout, setForcingLogout] = useState(false);
  const [summary, setSummary] = useState<PendingUploadSummary>({
    count: 0,
    items: [],
    tableCounts: {},
  });
  const [reportModalVisible, setReportModalVisible] = useState(false);

  // Load pending upload stats whenever modal becomes visible
  useEffect(() => {
    if (visible) {
      loadPendingDetails();
    }
  }, [visible]);

  const loadPendingDetails = async () => {
    setLoading(true);
    try {
      const data = await getPendingUploadDetails();
      setSummary(data);

      // If count is 0, we can complete normal sign out right away
      if (data.count === 0 && visible) {
        await executeNormalSignOut();
      }
    } catch (e) {
      console.warn('[LogoutSyncModal] Error checking upload queue:', e);
    } finally {
      setLoading(false);
    }
  };

  const executeNormalSignOut = async () => {
    try {
      await signOut();
      onClose();
      if (onSignOutSuccess) {
        onSignOutSuccess();
      }
    } catch (e: any) {
      Alert.alert('Sign Out Error', e?.message || 'Failed to sign out.');
    }
  };

  const handleTrySyncAgain = async () => {
    if (!isOnline) return;
    setSyncing(true);
    try {
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected || networkState.isInternetReachable === false) {
        Alert.alert('No Connection', 'Connect to the internet to sync pending changes.');
        return;
      }
      await forceSyncNow();
      const updated = await getPendingUploadDetails();
      setSummary(updated);

      if (updated.count === 0) {
        Alert.alert('Sync Complete', 'All pending data has been synced! Signing out now...', [
          {
            text: 'OK',
            onPress: () => executeNormalSignOut(),
          },
        ]);
      } else {
        Alert.alert(
          'Sync Incomplete',
          `${updated.count} item(s) are still pending upload. Ensure you have a stable network connection, or use Force Logout.`
        );
      }
    } catch (e: any) {
      Alert.alert('Sync Error', e?.message || 'Failed to sync. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleForceLogout = () => {
    Alert.alert(
      'Force Logout Warning',
      `You have ${summary.count} unsynced change(s). Force Logout will clear local data immediately. Unsynced local edits may be lost permanently.\n\nDo you want to force sign out anyway?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Force Sign Out',
          style: 'destructive',
          onPress: async () => {
            setForcingLogout(true);
            try {
              await signOut({ force: true });
              onClose();
              if (onSignOutSuccess) {
                onSignOutSuccess();
              }
            } catch (e: any) {
              Alert.alert('Force Logout Error', e?.message || 'Failed to force sign out.');
            } finally {
              setForcingLogout(false);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: PendingUploadItem }) => (
    <View className="mb-2.5 rounded-2xl border border-taupe/20 bg-white p-3.5 shadow-sm">
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center space-x-2 flex-1">
          <Database size={16} color="#8C4522" strokeWidth={2.2} />
          <Text className="text-sm font-bold text-espresso ml-2 flex-1" numberOfLines={1}>
            {item.label}
          </Text>
        </View>
        <View
          className={`px-2.5 py-1 rounded-full ${
            item.op === 'DELETE' || item.op === '3'
              ? 'bg-red-100'
              : item.op === 'PUT' || item.op === '1'
              ? 'bg-amber-100'
              : 'bg-blue-100'
          }`}>
          <Text
            className={`text-[10px] font-extrabold ${
              item.op === 'DELETE' || item.op === '3'
                ? 'text-red-600'
                : item.op === 'PUT' || item.op === '1'
                ? 'text-amber-700'
                : 'text-blue-700'
            }`}>
            {item.operationText}
          </Text>
        </View>
      </View>
      <Text className="text-xs text-taupe font-medium">{item.details}</Text>
    </View>
  );

  return (
    <>
      <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
        <View className="flex-1 justify-end bg-black/60">
          <Pressable
            className="flex-1"
            onPress={() => {
              if (!syncing && !forcingLogout) onClose();
            }}
          />
          <View className="bg-champagne rounded-t-3xl p-6 max-h-[82%] shadow-2xl">
            {/* Modal Header */}
            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-row items-center">
                <CloudUpload size={24} color="#8C4522" strokeWidth={2.2} />
                <Text className="text-2xl font-black text-espresso ml-2">Sign Out & Sync</Text>
              </View>
              <Pressable
                onPress={onClose}
                disabled={syncing || forcingLogout}
                className="p-2 -mr-2 bg-taupe/10 rounded-full">
                <X size={20} color="#8C7C70" strokeWidth={2.2} />
              </Pressable>
            </View>

            {loading ? (
              <View className="py-12 items-center justify-center">
                <ActivityIndicator size="large" color="#8C4522" />
                <Text className="text-espresso font-bold mt-4">Checking upload queue status...</Text>
              </View>
            ) : summary.count === 0 ? (
              <View className="py-10 items-center justify-center">
                <CheckCircle2 size={48} color="#16a34a" className="mb-2" />
                <Text className="text-espresso font-bold text-lg mb-1">Queue Clear!</Text>
                <Text className="text-taupe text-center text-sm">
                  All local data has been synced to the cloud. Signing out...
                </Text>
              </View>
            ) : (
              <>
                {/* Warning Banner */}
                <View className="mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 flex-row items-start">
                  <AlertTriangle size={22} color="#d97706" className="mr-3 mt-0.5" />
                  <View className="flex-1 ml-2">
                    <Text className="text-sm font-bold text-amber-900 mb-0.5">
                      {summary.count} Unsynced Item{summary.count > 1 ? 's' : ''} Detected
                    </Text>
                    <Text className="text-xs text-amber-800 leading-4">
                      These changes exist locally on your device but haven&apos;t finished uploading to the cloud server yet.
                    </Text>
                  </View>
                </View>

                {!isOnline && (
                  <Text className="mb-3 text-sm text-amber-800">
                    Connect to the internet to sync pending changes before signing out.
                  </Text>
                )}

                {/* Subheader */}
                <View className="flex-row justify-between items-center mb-2 px-1">
                  <Text className="text-xs font-bold text-espresso uppercase tracking-wider">
                    Pending Upload Queue ({summary.count})
                  </Text>
                  <Pressable
                    onPress={loadPendingDetails}
                    disabled={syncing}
                    className="flex-row items-center">
                    <RefreshCw size={12} color="#8C4522" className={syncing ? 'animate-spin' : ''} />
                    <Text className="text-xs font-bold text-cognac ml-1">Refresh</Text>
                  </Pressable>
                </View>

                {/* List of Pending Items */}
                <FlatList
                  data={summary.items}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderItem}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 10 }}
                  style={{ maxHeight: 220 }}
                />

                {/* Action Buttons Stack */}
                <View className="mt-4 gap-2.5 pt-3 border-t border-espresso/10">
                  {/* Try Sync Again */}
                  <Pressable
                    onPress={handleTrySyncAgain}
                    disabled={syncing || forcingLogout || !isOnline}
                    className={`w-full flex-row items-center justify-center rounded-xl py-3.5 shadow-sm shadow-espresso/20 active:scale-[0.98] ${isOnline ? 'bg-cognac' : 'bg-taupe/50'}`}>
                    {syncing ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <>
                        <RefreshCw size={18} color="#ffffff" />
                        <Text className="ml-2 font-bold text-white text-sm">
                          Try Syncing Again
                        </Text>
                      </>
                    )}
                  </Pressable>

                  {/* Force Logout & Report Issue Side-by-Side */}
                  <View className="flex-row gap-2.5">
                    <Pressable
                      onPress={handleForceLogout}
                      disabled={syncing || forcingLogout}
                      className="flex-1 flex-row items-center justify-center rounded-xl bg-red-600 py-3.5 shadow-sm active:scale-[0.98]">
                      {forcingLogout ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <>
                          <LogOut size={16} color="#ffffff" />
                          <Text className="ml-1.5 font-bold text-white text-xs">
                            Force Logout
                          </Text>
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={() => setReportModalVisible(true)}
                      disabled={syncing || forcingLogout}
                      className="flex-1 flex-row items-center justify-center rounded-xl border border-taupe/30 bg-white py-3.5 active:bg-gray-50">
                      <MessageSquareWarning size={16} color="#8C4522" strokeWidth={2.2} />
                      <Text className="ml-1.5 font-bold text-espresso text-xs">
                        Report Problem
                      </Text>
                    </Pressable>
                  </View>

                  {/* Cancel Button */}
                  <Pressable
                    onPress={onClose}
                    disabled={syncing || forcingLogout}
                    className="w-full py-2.5 items-center justify-center">
                    <Text className="text-xs font-bold text-taupe">
                      Cancel and Stay Logged In
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Report Problem Modal */}
      <ReportProblemModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        userId={user?.id}
        userEmail={user?.email}
        pendingUploadCount={summary.count}
        pendingTables={Object.keys(summary.tableCounts)}
      />
    </>
  );
}
