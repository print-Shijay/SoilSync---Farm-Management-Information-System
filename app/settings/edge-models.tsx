import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { AppAlert as Alert } from '../../components/common/AppAlert';
import {
  Download,
  Trash2,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react-native';
import {
  getAvailableEdgeModels,
  EdgeModel,
  isHealthModelDownloaded,
  downloadHealthModel,
  cancelHealthModelDownload,
  deleteHealthModel,
  setActiveHealthModelId,
  getActiveHealthModelId,
  getDownloadedModelsStorageUsage,
  clearYoloModelCache,
  formatModelName,
  getTierLabel,
} from '../../modules/yolo-detector/modelLoader';
import {
  getHealthDetectionModel,
  setHealthDetectionModel,
  HealthDetectionModel,
} from '../../lib/detection-preference';
import { useAccessibility } from '../../lib/accessibility';
import { useNetworkStatus } from '../../lib/hooks/useNetworkStatus';

export default function EdgeModelsSettings() {
  const { fontScale, isGloveMode, isHighContrast, triggerHaptic } = useAccessibility();
  const { isOnline } = useNetworkStatus();
  const [models, setModels] = useState<EdgeModel[]>([]);
  const [downloadedMap, setDownloadedMap] = useState<Record<string, boolean>>({});
  const [activeModelId, setActiveModelId] = useState<string>('');
  const [detectionEngine, setDetectionEngine] = useState<HealthDetectionModel>('yolo');
  const [storageUsage, setStorageUsage] = useState({
    count: 0,
    totalBytes: 0,
    formattedSize: '0 MB',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Downloading state
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadBytesWritten, setDownloadBytesWritten] = useState(0);
  const [downloadBytesTotal, setDownloadBytesTotal] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [available, activeId, engine, storage] = await Promise.all([
        getAvailableEdgeModels(),
        getActiveHealthModelId(),
        getHealthDetectionModel(),
        getDownloadedModelsStorageUsage(),
      ]);

      setModels(available);
      setActiveModelId(activeId);
      setDetectionEngine(engine);
      setStorageUsage(storage);

      const statusMap: Record<string, boolean> = {};
      await Promise.all(
        available.map(async (m) => {
          statusMap[m.modelName] = await isHealthModelDownloaded(m.modelName);
        })
      );
      setDownloadedMap(statusMap);
    } catch (error) {
      console.warn('Failed to load edge models data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleStartDownload = async (model: EdgeModel, autoActivate: boolean = false) => {
    if (!isOnline) return;
    if (downloadingModelId) {
      Alert.alert(
        'Download in progress',
        'Please wait for the current model download to finish or cancel it first.'
      );
      return;
    }

    setDownloadingModelId(model.modelName);
    setDownloadProgress(0);
    setDownloadBytesWritten(0);
    setDownloadBytesTotal(0);

    try {
      await downloadHealthModel(model.modelName, (progress, written, total) => {
        setDownloadProgress(progress);
        setDownloadBytesWritten(written);
        setDownloadBytesTotal(total);
      });

      setDownloadedMap((prev) => ({ ...prev, [model.modelName]: true }));
      const updatedStorage = await getDownloadedModelsStorageUsage();
      setStorageUsage(updatedStorage);

      const anyOtherDownloaded = Object.entries(downloadedMap).some(
        ([name, isDown]) => isDown && name !== model.modelName
      );

      if (autoActivate || !anyOtherDownloaded) {
        await setActiveHealthModelId(model.modelName);
        setActiveModelId(model.modelName);
        clearYoloModelCache();
        await setHealthDetectionModel('yolo');
        setDetectionEngine('yolo');
        Alert.alert('Model Ready', `${formatModelName(model.modelName)} is now active.`);
      } else {
        Alert.alert(
          'Download Complete',
          `${formatModelName(model.modelName)} is ready. Would you like to set it as active?`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Set as Active',
              onPress: async () => {
                await setActiveHealthModelId(model.modelName);
                setActiveModelId(model.modelName);
                clearYoloModelCache();
                await setHealthDetectionModel('yolo');
                setDetectionEngine('yolo');
              },
            },
          ]
        );
      }
    } catch (error: any) {
      if (error?.message?.includes('cancelled') || error?.message?.includes('canceled')) {
        return;
      }
      Alert.alert(
        'Download Failed',
        `Unable to download ${formatModelName(model.modelName)}. Please check your internet connection.`
      );
    } finally {
      setDownloadingModelId(null);
      setDownloadProgress(0);
      setDownloadBytesWritten(0);
      setDownloadBytesTotal(0);
    }
  };

  const handleCancelDownload = async (model: EdgeModel) => {
    try {
      await cancelHealthModelDownload(model.modelName);
      setDownloadingModelId(null);
      setDownloadProgress(0);
      setDownloadBytesWritten(0);
      setDownloadBytesTotal(0);
      setDownloadedMap((prev) => ({ ...prev, [model.modelName]: false }));
      const updatedStorage = await getDownloadedModelsStorageUsage();
      setStorageUsage(updatedStorage);
    } catch (e) {
      console.warn('Failed to cancel download:', e);
    }
  };

  const handleSelectActive = async (model: EdgeModel) => {
    const isDownloaded = downloadedMap[model.modelName];

    if (!isDownloaded) {
      Alert.alert(
        'Download Required',
        `Download "${formatModelName(model.modelName)}" (${model.size}) now to set as active?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Download',
            onPress: () => handleStartDownload(model, true),
          },
        ]
      );
      return;
    }

    try {
      await setActiveHealthModelId(model.modelName);
      setActiveModelId(model.modelName);
      clearYoloModelCache();
      await setHealthDetectionModel('yolo');
      setDetectionEngine('yolo');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to update active model.');
    }
  };

  const handleDeleteModel = (model: EdgeModel) => {
    Alert.alert(
      'Uninstall Model',
      `Uninstall "${formatModelName(model.modelName)}" (${model.size}) from device storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Uninstall',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteHealthModel(model.modelName);
              setDownloadedMap((prev) => ({ ...prev, [model.modelName]: false }));

              const updatedStorage = await getDownloadedModelsStorageUsage();
              setStorageUsage(updatedStorage);

              if (model.modelName === activeModelId) {
                clearYoloModelCache();
                const remainingDownloaded = models.find(
                  (m) => m.modelName !== model.modelName && downloadedMap[m.modelName]
                );

                if (remainingDownloaded) {
                  await setActiveHealthModelId(remainingDownloaded.modelName);
                  setActiveModelId(remainingDownloaded.modelName);
                } else {
                  await setActiveHealthModelId('');
                  setActiveModelId('');
                  await setHealthDetectionModel('rfdetr');
                  setDetectionEngine('rfdetr');
                }
              }
            } catch (error: any) {
              Alert.alert('Error', 'Failed to uninstall the model.');
            }
          },
        },
      ]
    );
  };

  const handleToggleEngine = async (engine: HealthDetectionModel) => {
    if (engine === 'rfdetr' && !isOnline) return;
    if (engine === 'yolo') {
      const anyDownloaded = Object.values(downloadedMap).some((v) => v);
      if (!anyDownloaded) {
        Alert.alert(
          'No Offline Models',
          'Please download at least one edge model below before enabling offline mode.'
        );
        return;
      }
    }

    try {
      await setHealthDetectionModel(engine);
      setDetectionEngine(engine);
    } catch (e) {
      console.warn('Failed to switch engine preference:', e);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-champagne">
        <ActivityIndicator size="large" color="#8C4522" />
        <Text
          style={{ fontSize: Math.round(12 * fontScale) }}
          className="mt-3 font-semibold text-taupe">
          Loading Edge Models...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-champagne p-5 pt-3"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={['#8C4522']} />
      }>
      {!isOnline && (
        <View className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <Text className="text-sm text-amber-900">
            Connect to the internet to install models or select Cloud AI. Installed edge models remain available.
          </Text>
        </View>
      )}
      {/* 1. Detection Engine Segmented Switcher */}
      <View className="mb-5">
        <Text
          style={{ fontSize: Math.round(11 * fontScale) }}
          className="mb-2 ml-2 font-bold uppercase tracking-[0.2em] text-taupe">
          Detection Engine
        </Text>
        <View className="flex-row rounded-2xl bg-black/5 p-1">
          <TouchableOpacity
            onPress={() => {
              triggerHaptic('selection');
              handleToggleEngine('yolo');
            }}
            activeOpacity={0.8}
            hitSlop={isGloveMode ? { top: 4, bottom: 4, left: 4, right: 4 } : undefined}
            style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
            className={`flex-1 flex-row items-center justify-center rounded-xl py-2.5 active:scale-[0.99] ${
              detectionEngine === 'yolo' ? 'shadow-xs bg-white' : ''
            }`}>
            <WifiOff size={15} color={detectionEngine === 'yolo' ? '#8C4522' : '#8C7C70'} />
            <Text
              style={{ fontSize: Math.round(12 * fontScale) }}
              className={`ml-1.5 font-bold ${
                detectionEngine === 'yolo' ? 'text-espresso' : 'text-taupe'
              }`}>
              Edge (Offline)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              triggerHaptic('selection');
              handleToggleEngine('rfdetr');
            }}
            disabled={!isOnline}
            activeOpacity={0.8}
            hitSlop={isGloveMode ? { top: 4, bottom: 4, left: 4, right: 4 } : undefined}
            style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
            className={`flex-1 flex-row items-center justify-center rounded-xl py-2.5 active:scale-[0.99] ${!isOnline ? 'opacity-50' : ''} ${
              detectionEngine === 'rfdetr' ? 'shadow-xs bg-white' : ''
            }`}>
            <Wifi size={15} color={detectionEngine === 'rfdetr' ? '#8C4522' : '#8C7C70'} />
            <Text
              style={{ fontSize: Math.round(12 * fontScale) }}
              className={`ml-1.5 font-bold ${
                detectionEngine === 'rfdetr' ? 'text-espresso' : 'text-taupe'
              }`}>
              Cloud AI (DETR)
            </Text>
          </TouchableOpacity>
        </View>
        <Text
          style={{ fontSize: Math.round(11 * fontScale) }}
          className="ml-2 mt-2 leading-4 text-taupe">
          {detectionEngine === 'yolo'
            ? 'Edge mode runs on-device YOLO models without internet.'
            : 'Cloud mode uses remote AI servers and requires internet connection.'}
        </Text>
      </View>

      {/* 2. Storage Overview */}
      <View className="mb-5">
        <Text
          style={{ fontSize: Math.round(11 * fontScale) }}
          className="mb-2 ml-2 font-bold uppercase tracking-[0.2em] text-taupe">
          Device Storage
        </Text>
        <View className="overflow-hidden rounded-[26px] border border-white/90 bg-white shadow-sm shadow-espresso/5">
          <View className="flex-row items-center justify-between px-4 py-3.5">
            <View className="flex-row items-center">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-cognac/10">
                <HardDrive size={18} color="#8C4522" strokeWidth={2.2} />
              </View>
              <Text
                style={{ fontSize: Math.round(15 * fontScale) }}
                className="font-bold text-espresso">
                Downloaded Models
              </Text>
            </View>
            <Text
              style={{ fontSize: Math.round(12 * fontScale) }}
              className="font-semibold text-taupe">
              {storageUsage.count} of {models.length} ({storageUsage.formattedSize})
            </Text>
          </View>
        </View>
      </View>

      {/* 3. Models Inset Group */}
      <View className="mb-8">
        <View className="mb-2 ml-2 flex-row items-center justify-between pr-2">
          <Text
            style={{ fontSize: Math.round(11 * fontScale) }}
            className="font-bold uppercase tracking-[0.2em] text-taupe">
            Available Models ({models.length})
          </Text>
          <TouchableOpacity
            onPress={() => {
              triggerHaptic('selection');
              onRefresh();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="flex-row items-center active:opacity-60">
            <RefreshCw size={11} color="#8C7C70" />
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className="ml-1 font-semibold text-taupe">
              Refresh
            </Text>
          </TouchableOpacity>
        </View>

        <View className="overflow-hidden rounded-[26px] border border-white/90 bg-white shadow-sm shadow-espresso/5">
          {models.map((model, index) => {
            const isDownloaded = downloadedMap[model.modelName];
            const isActive = model.modelName === activeModelId && isDownloaded;
            const isDownloading = downloadingModelId === model.modelName;
            const displayName = formatModelName(model.modelName);
            const tier = getTierLabel(model.modelName, model.url);

            return (
              <React.Fragment key={model.modelName}>
                {index > 0 && <View className="ml-14 mr-4 h-[1px] bg-black/5" />}
                <TouchableOpacity
                  activeOpacity={0.75}
                  disabled={!isDownloaded && !isOnline && !isDownloading}
                  onPress={() => {
                    triggerHaptic('selection');
                    isDownloaded ? handleSelectActive(model) : handleStartDownload(model, true);
                  }}
                  style={isGloveMode ? { minHeight: 60 } : undefined}
                  className={`flex-row items-center px-4 py-3.5 active:scale-[0.99] ${!isDownloaded && !isOnline ? 'opacity-50' : ''}`}>
                  {/* Status / Radio indicator */}
                  <View className="mr-3.5">
                    {isActive ? (
                      <CheckCircle2 size={20} color="#059669" strokeWidth={2.5} />
                    ) : isDownloaded ? (
                      <View className="h-5 w-5 rounded-full border-2 border-black/20" />
                    ) : (
                      <View className="h-5 w-5 rounded-full border border-dashed border-black/25" />
                    )}
                  </View>

                  {/* Model Name & Specs */}
                  <View className="flex-1 pr-2">
                    <Text
                      style={{ fontSize: Math.round(15 * fontScale) }}
                      className="font-bold tracking-tight text-espresso">
                      {displayName}
                    </Text>
                    <Text
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className="font-medium text-taupe">
                      {tier} • {model.size}
                    </Text>

                    {/* Compact Download Progress */}
                    {isDownloading && (
                      <View className="mt-2 pr-2">
                        <View className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                          <View
                            className="h-full rounded-full bg-cognac"
                            style={{
                              width: `${Math.min(100, Math.max(0, downloadProgress * 100))}%`,
                            }}
                          />
                        </View>
                        <Text
                          style={{ fontSize: Math.round(10 * fontScale) }}
                          className="mt-1 font-semibold text-taupe">
                          {Math.round(downloadProgress * 100)}% •{' '}
                          {downloadBytesTotal > 0
                            ? `${formatBytes(downloadBytesWritten)} of ${formatBytes(downloadBytesTotal)}`
                            : 'Downloading...'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Right Action */}
                  {isDownloading ? (
                    <TouchableOpacity
                      onPress={() => {
                        triggerHaptic('selection');
                        handleCancelDownload(model);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      className="h-7 w-7 items-center justify-center rounded-full bg-black/5 active:bg-black/10">
                      <X size={13} color="#8C7C70" strokeWidth={2.5} />
                    </TouchableOpacity>
                  ) : isDownloaded ? (
                    <TouchableOpacity
                      onPress={() => handleDeleteModel(model)}
                      hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : { top: 10, bottom: 10, left: 10, right: 10 }}
                      style={isGloveMode ? { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' } : undefined}
                      activeOpacity={0.7}
                      className="h-8 w-8 items-center justify-center rounded-full bg-red-50/80 active:scale-90 active:bg-red-100">
                      <Trash2 size={15} color="#DC2626" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        triggerHaptic('selection');
                        handleStartDownload(model, false);
                      }}
                      disabled={!isOnline}
                      hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                      style={isGloveMode ? { minHeight: 40, justifyContent: 'center' } : undefined}
                      className="flex-row items-center rounded-full bg-cognac/10 px-3 py-1 active:scale-95 active:bg-cognac/20">
                      <Download size={12} color="#8C4522" strokeWidth={2.4} />
                      <Text
                        style={{ fontSize: Math.round(12 * fontScale) }}
                        className="ml-1 font-bold text-cognac">
                        Install
                      </Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
        <Text
          style={{ fontSize: Math.round(11 * fontScale) }}
          className="ml-2 mt-2 leading-4 text-taupe">
          Tap any downloaded model to select it as your active offline diagnosis engine.
        </Text>
      </View>
    </ScrollView>
  );
}
