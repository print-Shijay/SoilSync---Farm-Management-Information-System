import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
  BackHandler,
  Keyboard,
  Pressable,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import { Modal, KeyboardAvoidingView } from '../../components/common/AppModal';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/AuthContext';
import { useAccessibility } from '../../lib/accessibility';
import {
  getUserFolders,
  createUserFolder,
  updateUserFolder,
  deleteUserFolder,
  getFarmsByUser,
  UserFolderRecord,
  FarmRecord,
  parseFolderContent,
  MAX_USER_FOLDERS,
} from '../../lib/db-operations';
import { powersync } from '../../lib/powersync';
import { BackButton } from '../../components/common/BackButton';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Layers,
  MapPin,
  X,
  FileText,
  Camera,
} from 'lucide-react-native';

export type FolderFilter = 'all' | 'mine' | 'shared';

export default function UserFoldersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { fontScale, isHighContrast, isGloveMode, triggerHaptic } = useAccessibility();

  const [folders, setFolders] = useState<UserFolderRecord[]>([]);
  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFarmFilter, setSelectedFarmFilter] = useState<string | null>(null);

  // Modal State for Create / Edit Folder
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<UserFolderRecord | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Action Menu State
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);

  const handleCloseModal = useCallback(() => {
    Keyboard.dismiss();
    setIsModalVisible(false);
  }, []);

  const handleBack = useCallback(() => {
    triggerHaptic('selection');
    if (isModalVisible) {
      handleCloseModal();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [isModalVisible, handleCloseModal, router, triggerHaptic]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [foldersData, farmsData] = await Promise.all([
        getUserFolders(user.id),
        getFarmsByUser(user.id),
      ]);
      setFolders(foldersData);
      setFarms(farmsData as FarmRecord[]);
    } catch (err) {
      console.error('[UserFolders] Error loading data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      const onBackPress = () => {
        if (isModalVisible) {
          handleCloseModal();
          return true;
        }
        if (router.canGoBack()) {
          router.back();
          return true;
        } else {
          router.replace('/(tabs)');
          return true;
        }
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [isModalVisible, handleCloseModal, router, loadData])
  );

  // Watch for live PowerSync changes to folders and team shares
  useEffect(() => {
    if (!user) return;
    const currentUserId = user.id;
    void loadData();

    const abortController = new AbortController();
    async function watchFolders() {
      try {
        for await (const _update of powersync.watch(
          `SELECT id FROM user_folder WHERE user_id = ? 
           UNION ALL 
           SELECT tf.folder_id as id 
           FROM team_folders tf 
           JOIN team_members tm ON tm.team_id = tf.team_id 
           WHERE tm.user_id = ? AND tm.status = 'accepted'`,
          [currentUserId, currentUserId],
          { signal: abortController.signal }
        )) {
          void loadData();
        }
      } catch (err) {
        // abort handled silently
      }
    }

    watchFolders();

    return () => {
      abortController.abort();
    };
  }, [user, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  const ownedFoldersCount = useMemo(() => {
    if (!user?.id) return 0;
    return folders.filter(
      (f) => f.user_id && f.user_id.toLowerCase() === user.id.toLowerCase()
    ).length;
  }, [folders, user?.id]);

  const sharedFoldersCount = useMemo(() => {
    return Math.max(0, folders.length - ownedFoldersCount);
  }, [folders.length, ownedFoldersCount]);

  const handleOpenCreateModal = () => {
    // Client-side rate limiter / max owned folders validation
    if (ownedFoldersCount >= MAX_USER_FOLDERS) {
      triggerHaptic('warning');
      Alert.alert(
        'Folder Limit Reached',
        `You have reached the maximum limit of ${MAX_USER_FOLDERS} owned folders per account. Please delete an existing folder before creating a new one.`
      );
      return;
    }

    setEditingFolder(null);
    setFolderNameInput('');
    setSelectedFarmId(null);
    setIsModalVisible(true);
  };

  const handleOpenEditModal = (folder: UserFolderRecord) => {
    setMenuFolderId(null);
    setEditingFolder(folder);
    setFolderNameInput(folder.folder_name);
    setSelectedFarmId(folder.farm_id || null);
    setIsModalVisible(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmed = folderNameInput.trim();
    if (!trimmed) {
      triggerHaptic('warning');
      Alert.alert('Validation Error', 'Please enter a folder name.');
      return;
    }

    if (!editingFolder && ownedFoldersCount >= MAX_USER_FOLDERS) {
      triggerHaptic('warning');
      Alert.alert(
        'Folder Limit Reached',
        `You have reached the maximum limit of ${MAX_USER_FOLDERS} owned folders per account.`
      );
      return;
    }

    try {
      setSaving(true);
      if (editingFolder) {
        await updateUserFolder(editingFolder.id, {
          folderName: trimmed,
          farmId: selectedFarmId,
        });
      } else {
        await createUserFolder({
          userId: user.id,
          folderName: trimmed,
          farmId: selectedFarmId,
        });
      }
      triggerHaptic('success');
      handleCloseModal();
      await loadData();
    } catch (err: any) {
      triggerHaptic('warning');
      Alert.alert('Error', err.message || 'Failed to save folder.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (folder: UserFolderRecord) => {
    setMenuFolderId(null);
    triggerHaptic('warning');
    Alert.alert(
      'Delete Folder',
      `Are you sure you want to delete "${folder.folder_name}"? All customizable columns, records, and associated photos will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              triggerHaptic('warning');
              setLoading(true);
              await deleteUserFolder(folder.id, user?.id);
              triggerHaptic('success');
              await loadData();
            } catch (err: any) {
              triggerHaptic('warning');
              Alert.alert('Error', err.message || 'Failed to delete folder.');
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Folders matching selected ownership filter (all / mine / shared)
  const foldersMatchingOwnership = useMemo(() => {
    return folders.filter((f) => {
      const isOwner =
        f.user_id && user?.id && f.user_id.toLowerCase() === user.id.toLowerCase();
      if (folderFilter === 'mine') return isOwner;
      if (folderFilter === 'shared') return !isOwner;
      return true;
    });
  }, [folders, folderFilter, user?.id]);

  // Filtered folders list incorporating ownership, search, and farm selection
  const filteredFolders = useMemo(() => {
    return foldersMatchingOwnership.filter((f) => {
      const matchesSearch =
        f.folder_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.farm_name && f.farm_name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesFarm =
        selectedFarmFilter === null ||
        (selectedFarmFilter === 'none' && !f.farm_id) ||
        f.farm_id === selectedFarmFilter;

      return matchesSearch && matchesFarm;
    });
  }, [foldersMatchingOwnership, searchQuery, selectedFarmFilter]);

  const renderFolderItem = ({ item }: { item: UserFolderRecord }) => {
    const isOwner =
      item.user_id && user?.id && item.user_id.toLowerCase() === user.id.toLowerCase();
    const content = parseFolderContent(item.content_json);
    const columnCount = content.columns.length;
    const recordCount = content.records.length;

    const textCols = content.columns.filter((c) => c.type === 'text').length;
    const numCols = content.columns.filter((c) => c.type === 'number').length;
    const imgCols = content.columns.filter((c) => c.type === 'image').length;

    const isMenuOpen = menuFolderId === item.id;

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => {
          triggerHaptic('selection');
          setMenuFolderId(null);
          router.push(`/user-folders/folders/${item.id}` as any);
        }}
        style={
          isHighContrast
            ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
            : undefined
        }
        className={`mb-4 overflow-hidden rounded-[28px] border border-cognac/15 bg-white ${
          isGloveMode ? 'p-6' : 'p-5'
        } shadow-sm shadow-espresso/5 active:scale-[0.98]`}>
        {/* Header: Icon Avatar + Title & Location + Action Menu */}
        <View className="flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center pr-3">
            {/* Folder Icon Avatar */}
            <View
              style={
                isHighContrast
                  ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#F3F3F3' }
                  : undefined
              }
              className={`mr-3.5 ${
                isGloveMode ? 'h-14 w-14 rounded-2xl' : 'h-12 w-12 rounded-2xl'
              } items-center justify-center border border-cognac/20 bg-cognac/10 shadow-xs`}>
              <Layers
                size={isGloveMode ? 26 : 22}
                color={isHighContrast ? '#000000' : '#8C4522'}
                strokeWidth={2.2}
              />
            </View>

            {/* Title & Farm Subtitle */}
            <View className="flex-1">
              <Text
                style={{ fontSize: Math.round(17 * fontScale) }}
                className={`font-black tracking-tight ${
                  isHighContrast ? 'text-black' : 'text-espresso'
                }`}
                numberOfLines={1}>
                {item.folder_name}
              </Text>

              <View className="mt-1 flex-row items-center flex-wrap gap-1.5">
                {item.farm_name ? (
                  <View className="flex-row items-center">
                    <MapPin
                      size={Math.round(11 * fontScale)}
                      color={isHighContrast ? '#000000' : '#8C4522'}
                      strokeWidth={2.4}
                    />
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className={`ml-1 font-bold ${
                        isHighContrast ? 'text-black' : 'text-cognac'
                      }`}
                      numberOfLines={1}>
                      {item.farm_name}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className={`font-medium ${
                      isHighContrast ? 'text-black font-semibold' : 'text-taupe'
                    }`}>
                    General Data Table
                  </Text>
                )}

                <View
                  className={`flex-row items-center rounded-full px-2 py-0.5 ${
                    isOwner
                      ? 'border border-cognac/25 bg-cognac/10'
                      : 'border border-blue-200 bg-blue-50'
                  }`}
                  style={
                    isHighContrast
                      ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }>
                  <View
                    className="mr-1.5 h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: isHighContrast
                        ? '#000000'
                        : isOwner
                        ? '#8C4522'
                        : '#2563EB',
                    }}
                  />
                  <Text
                    style={{
                      fontSize: Math.round(10 * fontScale),
                      color: isHighContrast ? '#000000' : isOwner ? '#8C4522' : '#2563EB',
                      fontWeight: '800',
                    }}>
                    {isOwner ? 'Owned' : 'Shared'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Action Menu Trigger */}
          <View className="relative">
            <TouchableOpacity
              activeOpacity={0.7}
              hitSlop={
                isGloveMode
                  ? { top: 12, bottom: 12, left: 12, right: 12 }
                  : { top: 8, bottom: 8, left: 8, right: 8 }
              }
              onPress={(e) => {
                e.stopPropagation();
                triggerHaptic('light');
                setMenuFolderId(isMenuOpen ? null : item.id);
              }}
              style={
                isHighContrast
                  ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                  : undefined
              }
              className={`${
                isGloveMode ? 'h-10 w-10' : 'h-8 w-8'
              } items-center justify-center rounded-full border border-cognac/20 bg-cognac/10 active:bg-cognac/20`}>
              <Text
                style={{ fontSize: Math.round((isGloveMode ? 16 : 14) * fontScale) }}
                className={`font-black leading-none ${
                  isHighContrast ? 'text-black' : 'text-cognac'
                }`}>
                ⋮
              </Text>
            </TouchableOpacity>

            {/* Dropdown Popup */}
            {isMenuOpen && (
              <View
                style={{
                  position: 'absolute',
                  top: isGloveMode ? 44 : 36,
                  right: 0,
                  zIndex: 100,
                  elevation: 10,
                  ...(isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : {}),
                }}
                className="w-40 rounded-2xl border border-cognac/20 bg-white p-1.5 shadow-xl shadow-cognac/20">
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    triggerHaptic('selection');
                    handleOpenEditModal(item);
                  }}
                  className={`flex-row items-center rounded-xl px-3 ${
                    isGloveMode ? 'py-3' : 'py-2'
                  } active:bg-cognac/10`}>
                  <Pencil size={15} color={isHighContrast ? '#000000' : '#8C4522'} />
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className={`ml-2.5 font-bold ${
                      isHighContrast ? 'text-black' : 'text-espresso'
                    }`}>
                    Edit Folder
                  </Text>
                </TouchableOpacity>
                {isOwner && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      triggerHaptic('warning');
                      handleDelete(item);
                    }}
                    className={`flex-row items-center rounded-xl px-3 ${
                      isGloveMode ? 'py-3' : 'py-2'
                    } active:bg-red-50`}>
                    <Trash2 size={15} color="#DC2626" />
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className="ml-2.5 font-bold text-red-600">
                      Delete
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Inset Stats Tray: Records & Columns */}
        <View
          style={
            isHighContrast
              ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#F8F8F8' }
              : undefined
          }
          className="mt-4 flex-row items-center justify-between rounded-[20px] border border-cognac/15 bg-cognac/[0.04] px-4 py-3">
          {/* Left: Records */}
          <View>
            <Text
              style={{ fontSize: Math.round(10 * fontScale) }}
              className={`font-extrabold uppercase tracking-wider ${
                isHighContrast ? 'text-black' : 'text-cognac'
              }`}>
              Records
            </Text>
            <View className="mt-0.5 flex-row items-center">
              <Text
                style={{ fontSize: Math.round(14 * fontScale) }}
                className={`font-black ${
                  isHighContrast ? 'text-black' : 'text-espresso'
                }`}>
                {recordCount}
              </Text>
              <Text
                style={{ fontSize: Math.round(12 * fontScale) }}
                className={`ml-1.5 font-semibold ${
                  isHighContrast ? 'text-black/80' : 'text-taupe'
                }`}>
                {recordCount === 1 ? 'entry' : 'entries'}
              </Text>
            </View>
          </View>

          {/* Right: Columns */}
          <View className="items-end">
            <Text
              style={{ fontSize: Math.round(10 * fontScale) }}
              className={`font-extrabold uppercase tracking-wider ${
                isHighContrast ? 'text-black' : 'text-taupe'
              }`}>
              Columns ({columnCount})
            </Text>
            <View className="mt-1 flex-row items-center gap-1.5">
              {columnCount === 0 ? (
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className={`italic ${isHighContrast ? 'text-black/80' : 'text-taupe'}`}>
                  None yet
                </Text>
              ) : (
                <>
                  {textCols > 0 && (
                    <View
                      style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000' } : undefined}
                      className="flex-row items-center rounded-md border border-blue-200/60 bg-blue-50 px-1.5 py-0.5">
                      <FileText size={10} color={isHighContrast ? '#000000' : '#2563EB'} />
                      <Text
                        style={{ fontSize: Math.round(10 * fontScale) }}
                        className={`ml-1 font-bold ${
                          isHighContrast ? 'text-black' : 'text-blue-700'
                        }`}>
                        {textCols}
                      </Text>
                    </View>
                  )}
                  {numCols > 0 && (
                    <View
                      style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000' } : undefined}
                      className="flex-row items-center rounded-md border border-amber-200/60 bg-amber-50 px-1.5 py-0.5">
                      <Text
                        style={{ fontSize: Math.round(10 * fontScale) }}
                        className={`font-black leading-none ${
                          isHighContrast ? 'text-black' : 'text-amber-700'
                        }`}>
                        #
                      </Text>
                      <Text
                        style={{ fontSize: Math.round(10 * fontScale) }}
                        className={`ml-0.5 font-bold ${
                          isHighContrast ? 'text-black' : 'text-amber-700'
                        }`}>
                        {numCols}
                      </Text>
                    </View>
                  )}
                  {imgCols > 0 && (
                    <View
                      style={isHighContrast ? { borderWidth: 1.5, borderColor: '#000000' } : undefined}
                      className="flex-row items-center rounded-md border border-emerald-200/60 bg-emerald-50 px-1.5 py-0.5">
                      <Camera size={10} color={isHighContrast ? '#000000' : '#059669'} />
                      <Text
                        style={{ fontSize: Math.round(10 * fontScale) }}
                        className={`ml-0.5 font-bold ${
                          isHighContrast ? 'text-black' : 'text-emerald-700'
                        }`}>
                        {imgCols}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-champagne">
      <View className="flex-1 pt-14">
        {/* Header Bar */}
        <View className="flex-row items-center justify-between px-5 pb-3">
          <BackButton
            onPress={handleBack}
            style={isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : undefined}
            className={isGloveMode ? 'h-12 w-12' : 'h-10 w-10'}
            size={isGloveMode ? 22 : 20}
            color={isHighContrast ? '#000000' : '#1C120C'}
          />

          <View className="items-center">
            <Text
              style={{ fontSize: Math.round(22 * fontScale) }}
              className={`font-black tracking-tight ${isHighContrast ? 'text-black' : 'text-espresso'}`}>
              My Folders
            </Text>
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className={`mt-0.5 font-bold ${isHighContrast ? 'text-black font-extrabold' : 'text-taupe'}`}>
              {folders.length} tables · {ownedFoldersCount}/{MAX_USER_FOLDERS} owned
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => {
              triggerHaptic('medium');
              handleOpenCreateModal();
            }}
            activeOpacity={0.85}
            hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
            style={
              isHighContrast
                ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                : undefined
            }
            className={`flex-row items-center rounded-2xl bg-cognac ${
              isGloveMode ? 'min-h-[48px] px-4 py-2.5' : 'px-3.5 py-2.5'
            } shadow-sm shadow-cognac/30 active:scale-95`}>
            <Plus size={isGloveMode ? 18 : 16} color="#FFFFFF" strokeWidth={3} />
            <Text
              style={{ fontSize: Math.round(12 * fontScale) }}
              className="ml-1 font-black text-white">
              New
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search & Filter Bar */}
        <View className="px-5 pt-2">
          {/* Segmented Pill Filter (All - Owned - Shared) */}
          <View
            className="mb-3 flex-row rounded-full border border-cognac/20 bg-black/5 p-1"
            style={
              isHighContrast
                ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                : undefined
            }>
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setFolderFilter('all');
                setSelectedFarmFilter(null);
              }}
              className={`flex-1 items-center justify-center rounded-full active:scale-95 ${
                isGloveMode ? 'py-3' : 'py-2'
              } ${
                folderFilter === 'all'
                  ? isHighContrast
                    ? 'bg-black'
                    : 'bg-cognac shadow-sm shadow-cognac/30'
                  : 'bg-transparent'
              }`}>
              <Text
                style={{ fontSize: 12 * fontScale }}
                className={`${
                  folderFilter === 'all'
                    ? 'font-black text-white'
                    : isHighContrast
                    ? 'font-extrabold text-black'
                    : 'font-bold text-taupe'
                }`}>
                All ({folders.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setFolderFilter('mine');
                setSelectedFarmFilter(null);
              }}
              className={`flex-1 items-center justify-center rounded-full active:scale-95 ${
                isGloveMode ? 'py-3' : 'py-2'
              } ${
                folderFilter === 'mine'
                  ? isHighContrast
                    ? 'bg-black'
                    : 'bg-cognac shadow-sm shadow-cognac/30'
                  : 'bg-transparent'
              }`}>
              <Text
                style={{ fontSize: 12 * fontScale }}
                className={`${
                  folderFilter === 'mine'
                    ? 'font-black text-white'
                    : isHighContrast
                    ? 'font-extrabold text-black'
                    : 'font-bold text-taupe'
                }`}>
                Owned ({ownedFoldersCount})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                setFolderFilter('shared');
                setSelectedFarmFilter(null);
              }}
              className={`flex-1 items-center justify-center rounded-full active:scale-95 ${
                isGloveMode ? 'py-3' : 'py-2'
              } ${
                folderFilter === 'shared'
                  ? isHighContrast
                    ? 'bg-black'
                    : 'bg-cognac shadow-sm shadow-cognac/30'
                  : 'bg-transparent'
              }`}>
              <Text
                style={{ fontSize: 12 * fontScale }}
                className={`${
                  folderFilter === 'shared'
                    ? 'font-black text-white'
                    : isHighContrast
                    ? 'font-extrabold text-black'
                    : 'font-bold text-taupe'
                }`}>
                Shared ({sharedFoldersCount})
              </Text>
            </Pressable>
          </View>

          <View
            style={
              isHighContrast
                ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                : undefined
            }
            className={`flex-row items-center rounded-2xl border border-cognac/25 bg-white px-3.5 ${
              isGloveMode ? 'py-3' : 'py-2.5'
            } shadow-xs shadow-cognac/5`}>
            <Search
              size={isGloveMode ? 20 : 18}
              color={isHighContrast ? '#000000' : '#8C4522'}
              strokeWidth={2.2}
            />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              maxLength={255}
              placeholder="Search folders by name or farm..."
              placeholderTextColor={isHighContrast ? '#555555' : '#8C7C70'}
              style={{
                fontSize: Math.round(14 * fontScale),
                color: isHighContrast ? '#000000' : '#2D231E',
              }}
              className="ml-2.5 flex-1 font-semibold"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  triggerHaptic('light');
                  setSearchQuery('');
                }}
                hitSlop={isGloveMode ? { top: 10, bottom: 10, left: 10, right: 10 } : undefined}
                className="rounded-full bg-cognac/10 p-1">
                <X
                  size={14}
                  color={isHighContrast ? '#000000' : '#8C4522'}
                  strokeWidth={2.5}
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Farm Filter Chips */}
          {farms.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 10 }}
              className="mt-1">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  triggerHaptic('selection');
                  setSelectedFarmFilter(null);
                }}
                style={
                  isHighContrast
                    ? selectedFarmFilter === null
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                      : { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                    : undefined
                }
                className={`mr-2 rounded-full active:scale-95 ${
                  isGloveMode ? 'min-h-[42px] px-4 py-2 justify-center' : 'px-3.5 py-1.5'
                } ${
                  selectedFarmFilter === null
                    ? 'border border-cognac bg-cognac shadow-sm shadow-cognac/30'
                    : 'border border-cognac/20 bg-white/90'
                }`}>
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className={`font-bold ${
                    selectedFarmFilter === null
                      ? 'text-white'
                      : isHighContrast
                      ? 'text-black'
                      : 'text-espresso'
                  }`}>
                  All{' '}
                  <Text
                    className={
                      selectedFarmFilter === null
                        ? 'text-white/80 font-bold'
                        : isHighContrast
                        ? 'text-black font-extrabold'
                        : 'text-cognac font-extrabold'
                    }>
                    ({foldersMatchingOwnership.length})
                  </Text>
                </Text>
              </TouchableOpacity>

              {farms.map((farm) => {
                const count = foldersMatchingOwnership.filter((f) => f.farm_id === farm.id).length;
                const isSelected = selectedFarmFilter === farm.id;
                return (
                  <TouchableOpacity
                    key={farm.id}
                    activeOpacity={0.8}
                    onPress={() => {
                      triggerHaptic('selection');
                      setSelectedFarmFilter(isSelected ? null : farm.id);
                    }}
                    style={
                      isHighContrast
                        ? isSelected
                          ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                          : { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                        : undefined
                    }
                    className={`mr-2 rounded-full active:scale-95 ${
                      isGloveMode ? 'min-h-[42px] px-4 py-2 justify-center' : 'px-3.5 py-1.5'
                    } ${
                      isSelected
                        ? 'border border-cognac bg-cognac shadow-sm shadow-cognac/30'
                        : 'border border-cognac/20 bg-white/90'
                    }`}>
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className={`font-bold ${
                        isSelected
                          ? 'text-white'
                          : isHighContrast
                          ? 'text-black'
                          : 'text-espresso'
                      }`}>
                      {farm.farm_name}{' '}
                      <Text
                        className={
                          isSelected
                            ? 'text-white/80 font-bold'
                            : isHighContrast
                            ? 'text-black font-extrabold'
                            : 'text-cognac font-extrabold'
                        }>
                        ({count})
                      </Text>
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  triggerHaptic('selection');
                  setSelectedFarmFilter(selectedFarmFilter === 'none' ? null : 'none');
                }}
                style={
                  isHighContrast
                    ? selectedFarmFilter === 'none'
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                      : { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                    : undefined
                }
                className={`mr-2 rounded-full active:scale-95 ${
                  isGloveMode ? 'min-h-[42px] px-4 py-2 justify-center' : 'px-3.5 py-1.5'
                } ${
                  selectedFarmFilter === 'none'
                    ? 'border border-cognac bg-cognac shadow-sm shadow-cognac/30'
                    : 'border border-cognac/20 bg-white/90'
                }`}>
                <Text
                  style={{ fontSize: Math.round(12 * fontScale) }}
                  className={`font-bold ${
                    selectedFarmFilter === 'none'
                      ? 'text-white'
                      : isHighContrast
                      ? 'text-black'
                      : 'text-espresso'
                  }`}>
                  General{' '}
                  <Text
                    className={
                      selectedFarmFilter === 'none'
                        ? 'text-white/80 font-bold'
                        : isHighContrast
                        ? 'text-black font-extrabold'
                        : 'text-cognac font-extrabold'
                    }>
                    ({foldersMatchingOwnership.filter((f) => !f.farm_id).length})
                  </Text>
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>

        {/* Folders List Content */}
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <View
              style={
                isHighContrast
                  ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                  : undefined
              }
              className="mb-3 h-14 w-14 items-center justify-center rounded-2xl border border-cognac/20 bg-cognac/10">
              <ActivityIndicator size="large" color={isHighContrast ? '#000000' : '#8C4522'} />
            </View>
            <Text
              style={{ fontSize: Math.round(13 * fontScale) }}
              className={`font-bold ${isHighContrast ? 'text-black' : 'text-cognac'}`}>
              Loading folders...
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredFolders}
            renderItem={renderFolderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 60 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={isHighContrast ? '#000000' : '#8C4522'}
                colors={[isHighContrast ? '#000000' : '#8C4522']}
              />
            }
            ListEmptyComponent={
              <View
                style={
                  isHighContrast
                    ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                    : undefined
                }
                className="mt-8 items-center justify-center rounded-[28px] border-2 border-dashed border-cognac/30 bg-white/80 p-8 shadow-sm shadow-cognac/5">
                <View
                  style={
                    isHighContrast
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#F0F0F0' }
                      : undefined
                  }
                  className="rounded-3xl border border-cognac/20 bg-cognac/10 p-5 shadow-inner">
                  <Layers
                    size={40}
                    color={isHighContrast ? '#000000' : '#8C4522'}
                    strokeWidth={2}
                  />
                </View>
                <Text
                  style={{ fontSize: Math.round(18 * fontScale) }}
                  className={`mt-4 text-center font-black ${
                    isHighContrast ? 'text-black' : 'text-espresso'
                  }`}>
                  {searchQuery || selectedFarmFilter
                    ? 'No matching folders found'
                    : folderFilter === 'mine'
                    ? 'No owned folders yet'
                    : folderFilter === 'shared'
                    ? 'No shared folders yet'
                    : 'No custom folders yet'}
                </Text>
                <Text
                  style={{
                    fontSize: Math.round(12 * fontScale),
                    lineHeight: Math.round(18 * fontScale),
                  }}
                  className={`mt-1.5 text-center ${
                    isHighContrast ? 'text-black/80 font-medium' : 'text-taupe'
                  }`}>
                  {searchQuery || selectedFarmFilter
                    ? 'Try adjusting your search keywords or active filters.'
                    : folderFilter === 'mine'
                    ? 'Create your first folder to start recording custom field data and observations.'
                    : folderFilter === 'shared'
                    ? 'Folders shared with you by your team members will appear here.'
                    : 'Create your first folder to start recording custom field data, crop tests, observations, and photos.'}
                </Text>

                {folderFilter !== 'shared' && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      triggerHaptic('medium');
                      handleOpenCreateModal();
                    }}
                    style={
                      isHighContrast
                        ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                        : undefined
                    }
                    className={`mt-6 flex-row items-center rounded-full bg-cognac px-6 ${
                      isGloveMode ? 'min-h-[54px] py-4' : 'py-3.5'
                    } shadow-md shadow-cognac/30 active:scale-95`}>
                    <Plus size={18} color="#fff" strokeWidth={2.8} />
                    <Text
                      style={{ fontSize: Math.round(14 * fontScale) }}
                      className="ml-2 font-black text-white">
                      Create New Folder
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}
      </View>

      {/* Modal: Create / Edit Folder (Apple-styled Bottom Sheet) */}
      <Modal
        visible={isModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseModal}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="flex-1 justify-end bg-black/60">
            <Pressable className="flex-1" onPress={handleCloseModal} />
            <View
              style={
                isHighContrast
                  ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                  : undefined
              }
              className="max-h-[85%] rounded-t-[34px] border-t border-cognac/20 bg-white p-6 pb-8 shadow-2xl">
              {/* Grab Handle Pill */}
              <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-cognac/30" />

              <View className="flex-row items-center justify-between border-b border-cognac/15 pb-3">
                <View className="flex-row items-center flex-1 pr-2">
                  <View
                    style={
                      isHighContrast
                        ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#F3F3F3' }
                        : undefined
                    }
                    className="mr-3 h-10 w-10 items-center justify-center rounded-2xl border border-cognac/20 bg-cognac/10">
                    <Layers
                      size={20}
                      color={isHighContrast ? '#000000' : '#8C4522'}
                      strokeWidth={2.2}
                    />
                  </View>
                  <View className="flex-1">
                    <Text
                      style={{ fontSize: Math.round(20 * fontScale) }}
                      className={`font-black tracking-tight ${
                        isHighContrast ? 'text-black' : 'text-espresso'
                      }`}>
                      {editingFolder ? 'Edit Folder' : 'New Folder'}
                    </Text>
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className={`font-medium ${
                        isHighContrast ? 'text-black font-semibold' : 'text-taupe'
                      }`}>
                      {editingFolder
                        ? 'Update folder name & farm assignment'
                        : `Create a customizable data table (${folders.length}/${MAX_USER_FOLDERS} used)`}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic('light');
                    handleCloseModal();
                  }}
                  hitSlop={isGloveMode ? { top: 12, bottom: 12, left: 12, right: 12 } : undefined}
                  activeOpacity={0.7}
                  style={isHighContrast ? { borderWidth: 2, borderColor: '#000000' } : undefined}
                  className="rounded-full border border-cognac/15 bg-cognac/10 p-2">
                  <X size={18} color={isHighContrast ? '#000000' : '#8C4522'} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                className="mt-4">
                {/* Folder Name Input */}
                <View>
                  <Text
                    style={{ fontSize: Math.round(11 * fontScale) }}
                    className={`font-black uppercase tracking-wider ${
                      isHighContrast ? 'text-black' : 'text-cognac'
                    }`}>
                    Folder Name *
                  </Text>
                  <TextInput
                    value={folderNameInput}
                    onChangeText={setFolderNameInput}
                    maxLength={255}
                    placeholder="e.g. Tomato Yield 2026, Soil pH Logs, Fertilizer Records"
                    placeholderTextColor={isHighContrast ? '#555555' : '#8C7C70'}
                    style={{
                      fontSize: Math.round(14 * fontScale),
                      color: isHighContrast ? '#000000' : '#2D231E',
                    }}
                    className={`mt-1.5 rounded-2xl border border-cognac/25 bg-champagne/90 px-4 ${
                      isGloveMode ? 'py-4' : 'py-3.5'
                    } font-semibold`}
                  />
                </View>

                {/* Farm Association Selector */}
                <View className="mt-4">
                  <Text
                    style={{ fontSize: Math.round(11 * fontScale) }}
                    className={`font-black uppercase tracking-wider ${
                      isHighContrast ? 'text-black' : 'text-cognac'
                    }`}>
                    Associated Farm (Optional)
                  </Text>
                  <Text
                    style={{ fontSize: Math.round(11 * fontScale) }}
                    className={`mt-0.5 ${isHighContrast ? 'text-black/80' : 'text-taupe'}`}>
                    Tag this folder to a specific farm or keep it as a standalone table
                  </Text>

                  {/* Horizontal Selection Pills */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mt-2.5 flex-row">
                    {/* Standalone Pill */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        triggerHaptic('selection');
                        setSelectedFarmId(null);
                      }}
                      style={
                        selectedFarmId === null
                          ? isHighContrast
                            ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                            : undefined
                          : isHighContrast
                          ? { borderWidth: 1.5, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                          : undefined
                      }
                      className={`mr-2 flex-row items-center rounded-2xl border px-3.5 ${
                        isGloveMode ? 'py-3' : 'py-2.5'
                      } ${
                        selectedFarmId === null
                          ? 'border-cognac bg-cognac shadow-xs'
                          : 'border-cognac/20 bg-champagne/70'
                      }`}>
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className={`font-bold ${
                          selectedFarmId === null
                            ? 'text-white'
                            : isHighContrast
                            ? 'text-black'
                            : 'text-espresso'
                        }`}>
                        Personal / Unassigned
                      </Text>
                    </TouchableOpacity>

                    {/* Farms Pills */}
                    {farms.map((farm) => {
                      const isSelected = selectedFarmId === farm.id;
                      return (
                        <TouchableOpacity
                          key={farm.id}
                          activeOpacity={0.8}
                          onPress={() => {
                            triggerHaptic('selection');
                            setSelectedFarmId(farm.id);
                          }}
                          style={
                            isSelected
                              ? isHighContrast
                                ? {
                                    borderWidth: 2,
                                    borderColor: '#000000',
                                    backgroundColor: '#000000',
                                  }
                                : undefined
                              : isHighContrast
                              ? {
                                  borderWidth: 1.5,
                                  borderColor: '#000000',
                                  backgroundColor: '#FFFFFF',
                                }
                              : undefined
                          }
                          className={`mr-2 flex-row items-center rounded-2xl border px-3.5 ${
                            isGloveMode ? 'py-3' : 'py-2.5'
                          } ${
                            isSelected
                              ? 'border-cognac bg-cognac shadow-xs'
                              : 'border-cognac/20 bg-champagne/70'
                          }`}>
                          <MapPin
                            size={12}
                            color={
                              isSelected
                                ? '#FFFFFF'
                                : isHighContrast
                                ? '#000000'
                                : '#8C4522'
                            }
                          />
                          <Text
                            style={{ fontSize: Math.round(12 * fontScale) }}
                            className={`ml-1.5 font-bold ${
                              isSelected
                                ? 'text-white'
                                : isHighContrast
                                ? 'text-black'
                                : 'text-espresso'
                            }`}>
                            {farm.farm_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </ScrollView>

              {/* Save & Cancel Actions */}
              <View className="mt-4 flex-row gap-3 border-t border-cognac/15 pt-3">
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic('light');
                    handleCloseModal();
                  }}
                  activeOpacity={0.7}
                  hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                  style={
                    isHighContrast
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#FFFFFF' }
                      : undefined
                  }
                  className={`flex-1 items-center justify-center rounded-full border border-cognac/20 bg-champagne ${
                    isGloveMode ? 'py-4' : 'py-3.5'
                  }`}>
                  <Text
                    style={{ fontSize: Math.round(14 * fontScale) }}
                    className={`font-bold ${isHighContrast ? 'text-black' : 'text-espresso'}`}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.85}
                  hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
                  style={
                    isHighContrast
                      ? { borderWidth: 2, borderColor: '#000000', backgroundColor: '#000000' }
                      : undefined
                  }
                  className={`flex-1 items-center justify-center rounded-full bg-cognac ${
                    isGloveMode ? 'py-4' : 'py-3.5'
                  } shadow-sm shadow-cognac/30`}>
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text
                      style={{ fontSize: Math.round(14 * fontScale) }}
                      className="text-center font-black text-white">
                      {editingFolder ? 'Save Changes' : 'Create Folder'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
