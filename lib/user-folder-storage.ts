import * as FileSystem from 'expo-file-system/legacy';
import { FileSystemUploadType } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Network from 'expo-network';
import * as base64 from 'base64-js';
import { AppAlert as Alert } from '../components/common/AppAlert';
import { supabase } from './supabase';
import { generateUUID } from './local-db';
import { isPermissionAllowed, requestAppPermission, openPhoneSettings } from './permissions';

const BASE_DIR = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
const FOLDER_LOCAL_DIR = BASE_DIR.endsWith('/') ? `${BASE_DIR}folder_images/` : `${BASE_DIR}/folder_images/`;

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Ensure local persistent directory exists for folder record images
 */
async function ensureLocalDirExists(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(FOLDER_LOCAL_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(FOLDER_LOCAL_DIR, { intermediates: true });
    }
  } catch (err) {
    console.warn('[UserFolderStorage] Failed to create local folder directory:', err);
  }
}

/**
 * Compresses, resizes, and validates image size to optimize storage and upload speed.
 * Automatically downscales images wider/taller than 1600px and applies 0.75 JPEG compression.
 */
export async function compressAndPrepareFolderImage(
  uri: string,
  maxWidth = 1600
): Promise<{ uri: string; size: number }> {
  try {
    // 1. Manipulate and compress
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      {
        compress: 0.75,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    // 2. Check file size
    const fileInfo = await FileSystem.getInfoAsync(manipResult.uri);
    const size = fileInfo.exists && typeof fileInfo.size === 'number' ? fileInfo.size : 0;

    if (size > MAX_IMAGE_SIZE_BYTES) {
      // Try higher compression if still larger than 5MB
      const reCompressed = await ImageManipulator.manipulateAsync(
        manipResult.uri,
        [{ resize: { width: 1200 } }],
        {
          compress: 0.5,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      const reFileInfo = await FileSystem.getInfoAsync(reCompressed.uri);
      const reSize = reFileInfo.exists && typeof reFileInfo.size === 'number' ? reFileInfo.size : 0;
      if (reSize > MAX_IMAGE_SIZE_BYTES) {
        throw new Error('Image exceeds 5MB limit even after compression. Please choose a smaller image.');
      }
      return { uri: reCompressed.uri, size: reSize };
    }

    return { uri: manipResult.uri, size };
  } catch (err: any) {
    console.warn('[UserFolderStorage] Compression warning:', err.message);
    // Fallback to original URI if manipulation fails
    const originalInfo = await FileSystem.getInfoAsync(uri);
    const size = originalInfo.exists && typeof originalInfo.size === 'number' ? originalInfo.size : 0;
    if (size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error('Selected image is larger than the 5MB size limit.');
    }
    return { uri, size };
  }
}

/**
 * Launches the camera to capture a new photo with compression.
 */
export async function pickFolderImageFromCamera(): Promise<string | null> {
  const isAllowed = await isPermissionAllowed('camera');
  if (!isAllowed) {
    const { granted } = await requestAppPermission('camera');
    if (!granted) {
      Alert.alert(
        'Camera Permission Required',
        'Please grant camera access in your device settings to take photos for your records.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: openPhoneSettings },
        ]
      );
      return null;
    }
  }

  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const rawUri = result.assets[0].uri;
    const compressed = await compressAndPrepareFolderImage(rawUri);
    return compressed.uri;
  } catch (err: any) {
    console.error('[UserFolderStorage] Camera capture error:', err);
    Alert.alert('Camera Error', err.message || 'Could not capture photo.');
    return null;
  }
}

/**
 * Opens the photo library to pick an existing image with compression.
 */
export async function pickFolderImageFromLibrary(): Promise<string | null> {
  const isAllowed = await isPermissionAllowed('storage');
  if (!isAllowed) {
    const { granted } = await requestAppPermission('storage');
    if (!granted) {
      Alert.alert(
        'Gallery Permission Required',
        'Please grant gallery/photos access in your device settings to select photos for your records.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: openPhoneSettings },
        ]
      );
      return null;
    }
  }

  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const rawUri = result.assets[0].uri;
    const compressed = await compressAndPrepareFolderImage(rawUri);
    return compressed.uri;
  } catch (err: any) {
    console.error('[UserFolderStorage] Gallery pick error:', err);
    Alert.alert('Gallery Error', err.message || 'Could not pick image.');
    return null;
  }
}

/**
 * Saves a permanent local copy of a folder image in persistent device storage.
 */
export async function saveLocalFolderImageCopy(tempUri: string | null): Promise<string | null> {
  if (!tempUri) return null;

  try {
    await ensureLocalDirExists();

    const fileExt = tempUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const filename = `folder_rec_${Date.now()}_${generateUUID().substring(0, 8)}.${fileExt}`;
    const permanentPath = `${FOLDER_LOCAL_DIR}${filename}`;

    await FileSystem.copyAsync({
      from: tempUri,
      to: permanentPath,
    });

    return permanentPath;
  } catch (err) {
    console.warn('[UserFolderStorage] Failed to save local copy, using original URI:', err);
    return tempUri;
  }
}

/**
 * Uploads a record image directly to the Supabase Storage 'user-folder-media' bucket.
 * Returns the public CDN URL on success, or null if offline/failed.
 */
export async function uploadFolderImageToSupabase(
  localUri: string | null,
  userId?: string
): Promise<string | null> {
  if (!localUri) return null;

  try {
    // 1. Check network connectivity safely
    try {
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.isConnected === false) {
        console.log('[UserFolderStorage] Device is offline - skipping immediate cloud upload.');
        return null;
      }
    } catch {
      // Proceed if network probe throws
    }

    const fileExt = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const mimeType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
    const sanitizedUserId = userId || 'anonymous';
    const filename = `folder_${Date.now()}_${generateUUID().substring(0, 8)}.${fileExt}`;
    const cloudFilePath = `${sanitizedUserId}/${filename}`;

    const rawSupabaseUrl =
      process.env.EXPO_PUBLIC_SUPABASE_URL ||
      (supabase as any)?.supabaseUrl ||
      'https://lhliufagsrbkdpmfltiw.supabase.co';
    const supabaseAnonKey =
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      (supabase as any)?.supabaseKey ||
      '';
    const supabaseUrl = rawSupabaseUrl ? rawSupabaseUrl.replace(/\/+$/, '') : 'https://lhliufagsrbkdpmfltiw.supabase.co';

    const formattedUri =
      localUri.startsWith('file://') || localUri.startsWith('content://')
        ? localUri
        : `file://${localUri}`;

    const uploadEndpoint = `${supabaseUrl}/storage/v1/object/user-folder-media/${cloudFilePath}`;
    const expectedPublicUrl = `${supabaseUrl}/storage/v1/object/public/user-folder-media/${cloudFilePath}`;

    let authToken = supabaseAnonKey;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        authToken = sessionData.session.access_token;
      }
    } catch {
      // fallback
    }

    const authHeaders: Record<string, string> = {
      'Content-Type': mimeType,
    };
    if (authToken) {
      authHeaders['Authorization'] = `Bearer ${authToken}`;
    }
    if (supabaseAnonKey) {
      authHeaders['apikey'] = supabaseAnonKey;
    }

    // Strategy 1: Expo Native FileSystem.uploadAsync
    try {
      const response = await FileSystem.uploadAsync(uploadEndpoint, formattedUri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        headers: authHeaders,
      });

      if (response.status >= 200 && response.status < 300) {
        console.log('[UserFolderStorage] uploadAsync succeeded:', expectedPublicUrl);
        return expectedPublicUrl;
      } else {
        console.warn(`[UserFolderStorage] uploadAsync returned HTTP ${response.status}:`, response.body);
      }
    } catch (nativeErr) {
      console.warn('[UserFolderStorage] Native upload error, attempting binary fallback:', nativeErr);
    }

    // Strategy 2: ArrayBuffer upload via Supabase SDK
    try {
      const base64Data = await FileSystem.readAsStringAsync(formattedUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (base64Data) {
        const binaryData = base64.toByteArray(base64Data);
        const arrayBuffer = binaryData.buffer.slice(
          binaryData.byteOffset,
          binaryData.byteOffset + binaryData.byteLength
        ) as ArrayBuffer;

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('user-folder-media')
          .upload(cloudFilePath, arrayBuffer, {
            contentType: mimeType,
            upsert: false,
          });

        if (!uploadErr && uploadData) {
          console.log('[UserFolderStorage] SDK upload succeeded:', expectedPublicUrl);
          return expectedPublicUrl;
        } else if (uploadErr) {
          console.warn('[UserFolderStorage] Supabase SDK upload error:', uploadErr.message, uploadErr);
        }
      }
    } catch (bufferErr) {
      console.warn('[UserFolderStorage] Buffer upload exception:', bufferErr);
    }

    return null;
  } catch (err) {
    console.warn('[UserFolderStorage] Upload exception:', err);
    return null;
  }
}

export interface FolderImageValue {
  localUri?: string | null;
  cloudUrl?: string | null;
}

/**
 * Parses an image field value which may be an object { localUri, cloudUrl } or legacy string
 */
export function parseFolderImageValue(raw: any): {
  localUri: string | null;
  cloudUrl: string | null;
  bestUri: string | null;
} {
  if (!raw) return { localUri: null, cloudUrl: null, bestUri: null };

  let localUri: string | null = null;
  let cloudUrl: string | null = null;

  if (typeof raw === 'object') {
    localUri = raw.localUri || null;
    cloudUrl = raw.cloudUrl || null;
  } else if (typeof raw === 'string') {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      cloudUrl = raw;
    } else if (raw.trim().length > 0) {
      localUri = raw;
    }
  }

  const bestUri = localUri || cloudUrl;
  return { localUri, cloudUrl, bestUri };
}

/**
 * Resolves the best URI to display an image (checks local file first for instant offline rendering, fallbacks to cloud URL).
 */
export async function getDisplayableFolderImageUri(
  imageUri: any,
  cloudFallback?: string | null
): Promise<string | null> {
  const { localUri, cloudUrl } = parseFolderImageValue(imageUri);
  const fallback = cloudFallback || cloudUrl;

  if (localUri) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) {
        return localUri;
      }
    } catch {
      // fallback
    }
  }

  return fallback || localUri || null;
}

export interface ResolvedImageAttachment {
  base64: string; // Clean base64 string without data prefix (ideal for ExcelJS)
  extension: 'jpeg' | 'png';
  mimeType: 'image/jpeg' | 'image/png';
  dataUri: string; // data:image/jpeg;base64,... (ideal for HTML/PDF/Word)
}

/**
 * Fully resolves an image to clean base64 data and data URI for direct embedding into Excel, PDF, and Word documents.
 */
export async function resolveImageAttachment(raw: any): Promise<ResolvedImageAttachment | null> {
  const { localUri, cloudUrl } = parseFolderImageValue(raw);

  // 1. Try local file first (instant, offline)
  if (localUri) {
    try {
      const normalizedUri =
        localUri.startsWith('file://') || localUri.startsWith('content://')
          ? localUri
          : `file://${localUri}`;

      const fileInfo = await FileSystem.getInfoAsync(normalizedUri);
      if (fileInfo.exists) {
        const base64Data = await FileSystem.readAsStringAsync(normalizedUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (base64Data) {
          const ext = normalizedUri.split('.').pop()?.split('?')[0]?.toLowerCase() === 'png' ? 'png' : 'jpeg';
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          return {
            base64: base64Data,
            extension: ext,
            mimeType: mime,
            dataUri: `data:${mime};base64,${base64Data}`,
          };
        }
      }
    } catch (e) {
      console.warn('[UserFolderStorage] Could not read local file as base64:', e);
    }
  }

  // 2. Try remote cloud URL (download to cache and encode)
  if (cloudUrl) {
    try {
      const tempFilename = `temp_dl_${Date.now()}_${generateUUID().substring(0, 6)}.jpg`;
      const tempUri = `${FileSystem.cacheDirectory}${tempFilename}`;
      const dl = await FileSystem.downloadAsync(cloudUrl, tempUri);
      if (dl && dl.uri) {
        const base64Data = await FileSystem.readAsStringAsync(dl.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        void FileSystem.deleteAsync(dl.uri, { idempotent: true });

        if (base64Data) {
          const ext = cloudUrl.split('.').pop()?.split('?')[0]?.toLowerCase() === 'png' ? 'png' : 'jpeg';
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          return {
            base64: base64Data,
            extension: ext,
            mimeType: mime,
            dataUri: `data:${mime};base64,${base64Data}`,
          };
        }
      }
    } catch (e) {
      console.warn('[UserFolderStorage] Could not download remote cloud image for base64:', e);
    }
  }

  return null;
}

/**
 * Resolves an image value to a base64 data URI (data:image/jpeg;base64,...) for PDF and Word export embedding.
 */
export async function resolveImageBase64(raw: any): Promise<string | null> {
  const att = await resolveImageAttachment(raw);
  return att ? att.dataUri : null;
}

/**
 * Deletes a single record image from both Supabase cloud storage and local device disk.
 */
export async function deleteFolderImage(imageUri: any): Promise<void> {
  if (!imageUri) return;
  const { localUri, cloudUrl } = parseFolderImageValue(imageUri);

  // 1. Delete local file
  if (localUri && localUri.startsWith('file://')) {
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch (e) {
      console.warn('[UserFolderStorage] Failed to delete local image file:', e);
    }
  }

  // 2. Delete cloud storage file
  const cloudToDelete = cloudUrl || (typeof imageUri === 'string' ? imageUri : null);
  if (cloudToDelete && cloudToDelete.includes('/user-folder-media/')) {
    try {
      const parts = cloudToDelete.split('/user-folder-media/');
      if (parts.length > 1) {
        const filePath = decodeURIComponent(parts[1].split('?')[0]);
        const { error } = await supabase.storage
          .from('user-folder-media')
          .remove([filePath]);

        if (error) {
          console.warn('[UserFolderStorage] Supabase storage delete error:', error.message);
        } else {
          console.log('[UserFolderStorage] Successfully removed image from cloud bucket:', filePath);
        }
      }
    } catch (cloudDelErr) {
      console.warn('[UserFolderStorage] Cloud image deletion error:', cloudDelErr);
    }
  }
}

/**
 * Bulk deletes all images associated with records from both cloud & device storage.
 */
export async function deleteFolderImages(imageUris: Array<any>): Promise<void> {
  if (!imageUris || imageUris.length === 0) return;

  const cloudPaths: string[] = [];

  for (const item of imageUris) {
    if (!item) continue;
    const { localUri, cloudUrl } = parseFolderImageValue(item);

    if (localUri && localUri.startsWith('file://')) {
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch {}
    }

    const cloudToDelete = cloudUrl || (typeof item === 'string' ? item : null);
    if (cloudToDelete && cloudToDelete.includes('/user-folder-media/')) {
      const parts = cloudToDelete.split('/user-folder-media/');
      if (parts.length > 1) {
        cloudPaths.push(decodeURIComponent(parts[1].split('?')[0]));
      }
    }
  }

  if (cloudPaths.length > 0) {
    try {
      const { error } = await supabase.storage.from('user-folder-media').remove(cloudPaths);
      if (error) {
        console.warn('[UserFolderStorage] Failed to bulk remove cloud images:', error.message);
      } else {
        console.log(`[UserFolderStorage] Cleaned up ${cloudPaths.length} cloud images from bucket.`);
      }
    } catch (e) {
      console.warn('[UserFolderStorage] Bulk cloud image removal exception:', e);
    }
  }
}
