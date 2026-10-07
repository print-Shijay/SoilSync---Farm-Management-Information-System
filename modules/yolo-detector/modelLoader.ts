import { loadTensorflowModel } from 'react-native-fast-tflite';
import type { TfliteModel } from 'react-native-fast-tflite';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';


// Lazy flag — notification handler is set up once, on demand (not at import time)
let notificationHandlerConfigured = false;
function ensureNotificationHandler() {
  if (notificationHandlerConfigured) return;
  notificationHandlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

let plantModel: TfliteModel | null = null;
let healthModel: TfliteModel | null = null;

// Helper function to resolve local file path systems across both Dev and Release variants
async function resolveModelPath(moduleRequire: number): Promise<string> {
  const asset = Asset.fromModule(moduleRequire);
  await asset.downloadAsync();

  // Pick localUri if available (typical for standalone builds), fallback to web-based uri
  const rawPath = asset.localUri || asset.uri;

  if (!rawPath) {
    throw new Error(`Failed to resolve system path for model asset ID: ${moduleRequire}`);
  }

  // Release APK fix: If it's a relative asset reference path missing a protocol, enforce file system mapping
  if (
    rawPath.startsWith('http://') ||
    rawPath.startsWith('https://') ||
    rawPath.startsWith('file://') ||
    rawPath.startsWith('content://')
  ) {
    return rawPath;
  }

  return `file://${rawPath}`;
}

export async function loadPlantModel() {
  if (!plantModel) {
    const safePath = await resolveModelPath(require('../../assets/models/soilsyncPlant.tflite'));

    // 🔴 FIX: Wrapped the string path into the required url object structure
    plantModel = await loadTensorflowModel({ url: safePath }, []);
  }

  return plantModel;
}

import { getDatabase } from '../../lib/local-db';

export type EdgeModel = {
  modelName: string;
  url: string;
  version: string;
  size: string;
  description: string;
  createdAt?: string;
};

export const DEFAULT_EDGE_MODELS: EdgeModel[] = [
  {
    modelName: 'SOILSYNC EDGE NANO',
    url: 'https://soilsync.croptap.click/yolo_model/soilsync_yolo26n.tflite',
    version: '1.0.0',
    size: '9.85 MB',
    description: 'Ultra-fast & lightweight model tailored for older hardware and quick offline scans.',
  },
  {
    modelName: 'SOILSYNC EDGE SMALL',
    url: 'https://soilsync.croptap.click/yolo_model/soilsync_yolo26s.tflite',
    version: '1.0.0',
    size: '38.22 MB',
    description: 'Balanced speed and precision suitable for most daily mobile field diagnostics.',
  },
  {
    modelName: 'SOILSYNC EDGE MEDIUM',
    url: 'https://soilsync.croptap.click/yolo_model/soilsync_yolo26m.tflite',
    version: '1.0.0',
    size: '103.64 MB',
    description: 'High-precision architecture designed to distinguish subtle and complex crop symptoms.',
  },
  {
    modelName: 'SOILSYNC EDGE LARGE',
    url: 'https://soilsync.croptap.click/yolo_model/soilsync_yolo26l.tflite',
    version: '1.0.0',
    size: '99.48 MB',
    description: 'Advanced deep feature extraction for dense multi-leaf canopies and shadowed areas.',
  },
  {
    modelName: 'SOILSYNC EDGE MAX',
    url: 'https://soilsync.croptap.click/yolo_model/soilsync_yolo26x.tflite',
    version: '1.0.0',
    size: '223.04 MB',
    description: 'Maximum capacity model with the highest detection confidence for edge inference.',
  },
];

export async function getAvailableEdgeModels(): Promise<EdgeModel[]> {
  try {
    const db = getDatabase();
    const rows = await db.all<any>(
      "SELECT * FROM edge_models WHERE is_active = 1 OR is_active = '1' ORDER BY created_at ASC"
    );
    if (!rows || rows.length === 0) {
      return DEFAULT_EDGE_MODELS;
    }
    const models: EdgeModel[] = rows.map((m) => ({
      modelName: m.model_name || m.modelName || m.name || 'SOILSYNC EDGE',
      url: m.url || '',
      version: m.version || '1.0.0',
      size: m.size || 'Unknown',
      description: m.description || '',
      createdAt: m.created_at,
    }));

    models.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    });

    return models;
  } catch (error) {
    console.warn('[EdgeModelLoader] Falling back to default edge models:', error);
    return DEFAULT_EDGE_MODELS;
  }
}

export function formatModelName(name?: string | null): string {
  if (!name) return '';
  return name
    .replace(/^SOILSYNC\s+/i, '')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function getTierLabel(name?: string, url?: string): string {
  const target = `${name || ''} ${url || ''}`.toUpperCase();
  if (target.includes('HORIZON O') || target.includes('NANO')) return 'Ultra Fast';
  if (target.includes('HORIZON A') || target.includes('SMALL')) return 'Balanced';
  if (target.includes('HORIZON B') || target.includes('MEDIUM')) return 'High Precision';
  if (target.includes('HORIZON C') || target.includes('LARGE')) return 'Deep Canopy';
  if (target.includes('HORIZON X') || target.includes('MAX') || target.includes('26X'))
    return 'Max Accuracy';
  return 'Optimized';
}

import AsyncStorage from '@react-native-async-storage/async-storage';

let activeHealthModelId: string | null = null;
const EDGE_MODEL_KEY = 'soilsync:active_edge_model';

export async function setActiveHealthModelId(modelId: string | null) {
  activeHealthModelId = modelId;
  healthModel = null; // Reset cached model when switching
  try {
    if (modelId) {
      await AsyncStorage.setItem(EDGE_MODEL_KEY, modelId);
    } else {
      await AsyncStorage.removeItem(EDGE_MODEL_KEY);
    }
  } catch (error) {
    console.error('Failed to persist edge model:', error);
  }
}

export async function getActiveHealthModelId(): Promise<string> {
  if (activeHealthModelId) return activeHealthModelId;
  try {
    const stored = await AsyncStorage.getItem(EDGE_MODEL_KEY);
    if (stored) {
      activeHealthModelId = stored;
      return stored;
    }
  } catch {}

  // Check if any edge model is already downloaded on device
  try {
    const models = await getAvailableEdgeModels();
    for (const m of models) {
      if (await isHealthModelDownloaded(m.modelName)) {
        activeHealthModelId = m.modelName;
        await AsyncStorage.setItem(EDGE_MODEL_KEY, m.modelName);
        return m.modelName;
      }
    }
  } catch {}
  
  return '';
}

export function getLocalModelPath(modelId: string): string {
  const safeName = (modelId || '').replace(/[^a-zA-Z0-9]/g, '_');
  return FileSystem.documentDirectory + `${safeName}.tflite`;
}

export async function isHealthModelDownloaded(modelId: string): Promise<boolean> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(getLocalModelPath(modelId));
    return fileInfo.exists;
  } catch {
    return false;
  }
}

export async function getHealthModelFileInfo(modelId: string): Promise<{ exists: boolean; size?: number; uri: string }> {
  const path = getLocalModelPath(modelId);
  try {
    const info = await FileSystem.getInfoAsync(path);
    return {
      exists: info.exists,
      size: info.exists ? (info as any).size : undefined,
      uri: path,
    };
  } catch {
    return { exists: false, uri: path };
  }
}

export async function getDownloadedModelsStorageUsage(): Promise<{ count: number; totalBytes: number; formattedSize: string }> {
  try {
    const models = await getAvailableEdgeModels();
    let totalBytes = 0;
    let count = 0;
    for (const m of models) {
      const info = await getHealthModelFileInfo(m.modelName);
      if (info.exists && typeof info.size === 'number') {
        totalBytes += info.size;
        count++;
      }
    }
    const mb = totalBytes / (1024 * 1024);
    const formattedSize = mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
    return { count, totalBytes, formattedSize };
  } catch (e) {
    return { count: 0, totalBytes: 0, formattedSize: '0 MB' };
  }
}

export async function deleteHealthModel(modelId: string): Promise<void> {
  const path = getLocalModelPath(modelId);
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
  } catch (e) {
    console.warn(`[EdgeModelLoader] Failed to delete ${modelId}:`, e);
  }
}

// Active download tasks registry to support cancellation
const activeDownloadMap = new Map<string, FileSystem.DownloadResumable>();

export async function cancelHealthModelDownload(modelId: string): Promise<void> {
  const resumable = activeDownloadMap.get(modelId);
  if (resumable) {
    try {
      await resumable.cancelAsync();
    } catch (e) {
      console.warn(`[EdgeModelLoader] Cancel download failed for ${modelId}:`, e);
    }
    activeDownloadMap.delete(modelId);
  }
  // Delete partial file if created
  await deleteHealthModel(modelId);
}

export async function downloadHealthModel(
  modelId: string,
  onProgress?: (progress: number, bytesWritten: number, totalExpected: number) => void
): Promise<string | undefined> {
  // Ensure notification handler is configured before using notifications
  ensureNotificationHandler();

  const models = await getAvailableEdgeModels();
  const model = models.find((m) => m.modelName === modelId);
  if (!model) throw new Error(`Model ${modelId} not found in database`);

  const downloadResumable = FileSystem.createDownloadResumable(
    model.url,
    getLocalModelPath(modelId),
    {
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    },
    (downloadProgress: FileSystem.DownloadProgressData) => {
      const written = downloadProgress.totalBytesWritten;
      const expected = downloadProgress.totalBytesExpectedToWrite;
      const progress = expected > 0 ? written / expected : 0;
      if (onProgress) onProgress(progress, written, expected);
    }
  );

  activeDownloadMap.set(modelId, downloadResumable);

  try {
    const result = await downloadResumable.downloadAsync();
    activeDownloadMap.delete(modelId);

    if (result?.uri) {
      // Check/request notification permissions
      try {
        const existingStatus: any = await Notifications.getPermissionsAsync();
        let isGranted = existingStatus.granted;
        if (!isGranted && existingStatus.canAskAgain) {
          const { granted } = (await Notifications.requestPermissionsAsync()) as any;
          isGranted = granted;
        }

        // Trigger the completion notification if permission granted
        if (isGranted) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Download Complete',
              body: `The ${model.modelName} model has successfully downloaded and is ready for offline use.`,
              sound: true,
            },
            trigger: null, // Send immediately
          });
        }
      } catch (notifErr) {
        console.warn('[EdgeModelLoader] Failed to show download notification:', notifErr);
      }
    }

    return result?.uri;
  } catch (error) {
    activeDownloadMap.delete(modelId);
    throw error;
  }
}

export async function loadHealthModel() {
  if (!healthModel) {
    const currentModelId = await getActiveHealthModelId();
    const isDownloaded = currentModelId ? await isHealthModelDownloaded(currentModelId) : false;
    
    if (!isDownloaded) {
      throw new Error(`Health model (${currentModelId || 'None'}) is not downloaded yet. Please download it first.`);
    }

    const localPath = getLocalModelPath(currentModelId);
    // 🔴 FIX: Wrapped the string path into the required url object structure
    const url = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
    healthModel = await loadTensorflowModel({ url }, []);
  }

  return healthModel;
}

export function clearYoloModelCache() {
  plantModel = null;
  healthModel = null;
}
