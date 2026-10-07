import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

export type PermissionFeature = 'camera' | 'location' | 'storage' | 'notifications';

const PERM_KEYS: Record<PermissionFeature, string> = {
  camera: 'soilsync_perm_camera',
  location: 'soilsync_perm_location',
  storage: 'soilsync_perm_storage',
  notifications: 'soilsync_perm_notifications',
};

export interface PermissionStatus {
  granted: boolean;
  userDisabled: boolean;
  sysPermissionGranted: boolean;
  canAskAgain: boolean;
}

/**
 * Get OS level system permission status for a given feature.
 */
export async function getSystemPermission(feature: PermissionFeature): Promise<{ granted: boolean; canAskAgain: boolean }> {
  try {
    if (feature === 'camera') {
      const res = await ImagePicker.getCameraPermissionsAsync();
      return { granted: res.granted, canAskAgain: res.canAskAgain ?? true };
    }
    if (feature === 'location') {
      const res = await Location.getForegroundPermissionsAsync();
      return { granted: res.granted, canAskAgain: res.canAskAgain ?? true };
    }
    if (feature === 'storage') {
      const res = await ImagePicker.getMediaLibraryPermissionsAsync();
      return { granted: res.granted, canAskAgain: res.canAskAgain ?? true };
    }
    if (feature === 'notifications') {
      const res = await Notifications.getPermissionsAsync();
      return { granted: res.granted, canAskAgain: res.canAskAgain ?? true };
    }
  } catch (error) {
    console.warn(`Error checking system permission for ${feature}:`, error);
  }
  return { granted: false, canAskAgain: true };
}

/**
 * Get combined app-level and OS-level permission state.
 * If the user manually enabled permission in Phone Settings, it automatically syncs as GRANTED.
 */
export async function getAppPermissionState(feature: PermissionFeature): Promise<PermissionStatus> {
  const sys = await getSystemPermission(feature);
  const storedVal = await AsyncStorage.getItem(PERM_KEYS[feature]);

  // If OS system permission is granted (e.g. manually allowed in Phone Settings),
  // prioritize OS status and sync app preference
  if (sys.granted) {
    if (storedVal !== 'true') {
      await AsyncStorage.setItem(PERM_KEYS[feature], 'true');
    }
    return {
      granted: true,
      userDisabled: false,
      sysPermissionGranted: true,
      canAskAgain: sys.canAskAgain,
    };
  }

  // If OS permission is NOT granted
  const userDisabled = storedVal === 'false';
  return {
    granted: false,
    userDisabled,
    sysPermissionGranted: false,
    canAskAgain: sys.canAskAgain,
  };
}

/**
 * Set user preference in AsyncStorage.
 */
export async function setAppPermissionPreference(feature: PermissionFeature, enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(PERM_KEYS[feature], enabled ? 'true' : 'false');
}

/**
 * Trigger system permission request for a feature and save preference.
 */
export async function requestAppPermission(feature: PermissionFeature): Promise<{ granted: boolean; sysGranted: boolean; canAskAgain: boolean }> {
  let granted = false;
  let canAskAgain = true;

  try {
    if (feature === 'camera') {
      const res = await ImagePicker.requestCameraPermissionsAsync();
      granted = res.granted;
      canAskAgain = res.canAskAgain ?? true;
    } else if (feature === 'location') {
      const res = await Location.requestForegroundPermissionsAsync();
      granted = res.granted;
      canAskAgain = res.canAskAgain ?? true;
    } else if (feature === 'storage') {
      const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
      granted = res.granted;
      canAskAgain = res.canAskAgain ?? true;
    } else if (feature === 'notifications') {
      const res = await Notifications.requestPermissionsAsync();
      granted = res.granted;
      canAskAgain = res.canAskAgain ?? true;
    }
  } catch (error) {
    console.warn(`Error requesting system permission for ${feature}:`, error);
  }

  // Update app preference
  await setAppPermissionPreference(feature, granted);

  return { granted, sysGranted: granted, canAskAgain };
}

/**
 * Helper function for any component in the app to check if a feature is allowed.
 * Returns false immediately if user disabled it in privacy settings, or if OS permission is not granted.
 */
export async function isPermissionAllowed(feature: PermissionFeature): Promise<boolean> {
  const state = await getAppPermissionState(feature);
  return state.granted;
}

/**
 * Open Phone System Settings menu for SoilSync.
 */
export async function openPhoneSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (error) {
    console.warn('Failed to open system settings:', error);
  }
}
