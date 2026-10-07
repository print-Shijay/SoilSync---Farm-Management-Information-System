import AsyncStorage from '@react-native-async-storage/async-storage';
import { isHealthModelDownloaded, getActiveHealthModelId } from '../modules/yolo-detector/modelLoader';

export type HealthDetectionModel = 'yolo' | 'rfdetr';

const STORAGE_KEY = 'soilsync:health_detection_model';

export async function getHealthDetectionModel(): Promise<HealthDetectionModel> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'yolo' || stored === 'rfdetr') {
      return stored;
    }
  } catch {
    // Silently fall back to default logic
  }
  
  // If no preference is set, check if the edge model is already downloaded
  try {
    const activeModelId = await getActiveHealthModelId();
    const isDownloaded = activeModelId ? await isHealthModelDownloaded(activeModelId) : false;
    return isDownloaded ? 'yolo' : 'rfdetr';
  } catch {
    return 'rfdetr';
  }
}

export async function setHealthDetectionModel(model: HealthDetectionModel): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, model);
  } catch (error) {
    console.error('Failed to persist health detection model preference:', error);
  }
}
