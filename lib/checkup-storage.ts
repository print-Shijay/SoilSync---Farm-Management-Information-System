import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { FileSystemUploadType } from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import * as base64 from 'base64-js';
import { supabase } from './supabase';
import { getDatabase, generateUUID } from './local-db';

const BASE_DIR = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
const CHECKUP_LOCAL_DIR = BASE_DIR.endsWith('/') ? `${BASE_DIR}checkup_images/` : `${BASE_DIR}/checkup_images/`;

/**
 * Ensure persistent local checkup directory exists
 */
async function ensureLocalDirExists(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CHECKUP_LOCAL_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CHECKUP_LOCAL_DIR, { intermediates: true });
    }
  } catch (err) {
    console.warn('[CheckupStorage] Failed to create local checkup directory:', err);
  }
}

/**
 * Save a permanent local copy of a checkup image in persistent device storage.
 * This guarantees 100% offline availability on the mobile device.
 */
export async function saveLocalCheckupCopy(tempUri: string | null): Promise<string | null> {
  if (!tempUri) return null;

  try {
    await ensureLocalDirExists();

    const fileExt = tempUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const filename = `checkup_${Date.now()}_${generateUUID().substring(0, 8)}.${fileExt}`;
    const permanentPath = `${CHECKUP_LOCAL_DIR}${filename}`;

    await FileSystem.copyAsync({
      from: tempUri,
      to: permanentPath,
    });

    return permanentPath;
  } catch (err) {
    console.warn('[CheckupStorage] Failed to save local copy, using original URI:', err);
    return tempUri;
  }
}

/**
 * Upload a checkup image directly to the Supabase Storage 'checkup-images' bucket.
 * Uses native FileSystem.uploadAsync for high performance & reliability,
 * with Supabase JS SDK ArrayBuffer fallback.
 * Returns the public CDN URL on success, or null if offline/failed.
 */
export async function uploadCheckupImageToSupabase(
  localUri: string | null,
  userId?: string
): Promise<string | null> {
  if (!localUri) return null;

  try {
    // 1. Check network connectivity safely - only skip if explicitly disconnected
    try {
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.isConnected === false) {
        console.log('[CheckupStorage] Device is offline - skipping immediate cloud upload.');
        return null;
      }
    } catch {
      // Proceed if network probe throws
    }

    const fileExt = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const mimeType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
    const sanitizedUserId = userId || 'anonymous';
    const filename = `checkup_${Date.now()}_${generateUUID().substring(0, 8)}.${fileExt}`;
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

    // Ensure localUri has file:// schema if needed for native file operations
    const formattedUri =
      localUri.startsWith('file://') || localUri.startsWith('content://')
        ? localUri
        : `file://${localUri}`;

    const uploadEndpoint = `${supabaseUrl}/storage/v1/object/checkup-images/${cloudFilePath}`;
    const expectedPublicUrl = `${supabaseUrl}/storage/v1/object/public/checkup-images/${cloudFilePath}`;

    // Get user token if authenticated
    let authToken = supabaseAnonKey;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        authToken = sessionData.session.access_token;
      }
    } catch {
      // fallback to anon key
    }

    const authHeaders: Record<string, string> = {
      'Content-Type': mimeType,
      'x-upsert': 'true',
    };
    if (authToken) {
      authHeaders['Authorization'] = `Bearer ${authToken}`;
    }
    if (supabaseAnonKey) {
      authHeaders['apikey'] = supabaseAnonKey;
    }

    // Strategy 1: Expo Native FileSystem.uploadAsync (Fast, binary streaming, zero JS-memory overhead)
    try {
      const response = await FileSystem.uploadAsync(uploadEndpoint, formattedUri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        headers: authHeaders,
      });

      if (response.status >= 200 && response.status < 300) {
        console.log('[CheckupStorage] FileSystem.uploadAsync succeeded:', expectedPublicUrl);
        return expectedPublicUrl;
      } else {
        console.warn('[CheckupStorage] uploadAsync returned status:', response.status, response.body);
      }
    } catch (nativeUploadErr) {
      console.warn('[CheckupStorage] Native upload error, attempting binary fetch fallback:', nativeUploadErr);
    }

    // Strategy 2: Direct binary fetch using Base64 decode to ArrayBuffer
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

        console.log(`[CheckupStorage] Uploading ${cloudFilePath} via direct binary fetch...`);
        const fetchRes = await fetch(uploadEndpoint, {
          method: 'POST',
          headers: authHeaders,
          body: arrayBuffer,
        });

        if (fetchRes.ok) {
          console.log('[CheckupStorage] Binary fetch succeeded:', expectedPublicUrl);
          return expectedPublicUrl;
        } else {
          const errText = await fetchRes.text().catch(() => '');
          console.warn('[CheckupStorage] Binary fetch returned error:', fetchRes.status, errText);
        }

        // Strategy 3: Supabase JS SDK upload using ArrayBuffer
        console.log(`[CheckupStorage] Uploading ${cloudFilePath} via Supabase JS SDK ArrayBuffer...`);
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('checkup-images')
          .upload(cloudFilePath, arrayBuffer, {
            contentType: mimeType,
            upsert: true,
          });

        if (!uploadErr && uploadData) {
          console.log('[CheckupStorage] Supabase SDK ArrayBuffer upload succeeded:', expectedPublicUrl);
          return expectedPublicUrl;
        } else if (uploadErr) {
          console.warn('[CheckupStorage] Supabase SDK ArrayBuffer upload error:', uploadErr.message);
        }
      }
    } catch (bufferErr) {
      console.warn('[CheckupStorage] Buffer upload exception:', bufferErr);
    }

    return null;
  } catch (err) {
    console.warn('[CheckupStorage] Upload exception:', err);
    return null;
  }
}

/**
 * Background Sync: Scans all local checkup & daily report records that have local URIs
 * and uploads them to Supabase Storage in the background when the device is online.
 */
export async function syncPendingCheckupImages(userId?: string): Promise<number> {
  try {
    try {
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.isConnected === false) {
        return 0;
      }
    } catch {
      // Proceed if network probe throws
    }

    const db = getDatabase();
    let uploadedCount = 0;

    // 1. Sync pending farm_checkup_results
    const checkupQuery = userId
      ? `SELECT id, user_id, farm_id, image_uri, summary_data_json FROM farm_checkup_results WHERE user_id = ? AND image_uri NOT LIKE 'http%' AND image_uri IS NOT NULL`
      : `SELECT id, user_id, farm_id, image_uri, summary_data_json FROM farm_checkup_results WHERE image_uri NOT LIKE 'http%' AND image_uri IS NOT NULL`;

    const pendingCheckups = await db.all<{ id: string; user_id: string; farm_id: string; image_uri: string; summary_data_json: string }>(
      checkupQuery,
      userId ? [userId] : []
    );

    if (pendingCheckups && pendingCheckups.length > 0) {
      console.log(`[CheckupStorage] Found ${pendingCheckups.length} pending local checkup images to sync...`);

      for (const row of pendingCheckups) {
        try {
          const rowUri = row.image_uri.startsWith('file://') || row.image_uri.startsWith('content://')
            ? row.image_uri
            : `file://${row.image_uri}`;
          const fileInfo = await FileSystem.getInfoAsync(rowUri);
          if (!fileInfo.exists) continue;

          const cloudUrl = await uploadCheckupImageToSupabase(rowUri, row.user_id);
          if (cloudUrl) {
            let updatedSummaryDataJson = row.summary_data_json;
            try {
              if (row.summary_data_json) {
                const parsed = typeof row.summary_data_json === 'string'
                  ? JSON.parse(row.summary_data_json)
                  : row.summary_data_json;
                parsed.cloud_image_uri = cloudUrl;
                updatedSummaryDataJson = JSON.stringify(parsed);
              }
            } catch (e) {
              // ignore parse error
            }

            await db.run(
              `UPDATE farm_checkup_results SET image_uri = ?, summary_data_json = ?, updated_at = datetime('now') WHERE id = ?`,
              [cloudUrl, updatedSummaryDataJson, row.id]
            );
            uploadedCount++;
          }
        } catch (uploadErr) {
          console.warn(`[CheckupStorage] Failed to sync checkup image for record ${row.id}:`, uploadErr);
        }
      }
    }

    // 2. Sync pending farm_daily_reports
    const reportQuery = userId
      ? `SELECT id, user_id, farm_id, image_uri FROM farm_daily_reports WHERE user_id = ? AND image_uri NOT LIKE 'http%' AND image_uri IS NOT NULL`
      : `SELECT id, user_id, farm_id, image_uri FROM farm_daily_reports WHERE image_uri NOT LIKE 'http%' AND image_uri IS NOT NULL`;

    const pendingReports = await db.all<{ id: string; user_id: string; farm_id: string; image_uri: string }>(
      reportQuery,
      userId ? [userId] : []
    );

    if (pendingReports && pendingReports.length > 0) {
      console.log(`[CheckupStorage] Found ${pendingReports.length} pending local daily report images to sync...`);

      for (const row of pendingReports) {
        try {
          const rowUri = row.image_uri.startsWith('file://') || row.image_uri.startsWith('content://')
            ? row.image_uri
            : `file://${row.image_uri}`;
          const fileInfo = await FileSystem.getInfoAsync(rowUri);
          if (!fileInfo.exists) continue;

          const cloudUrl = await uploadCheckupImageToSupabase(rowUri, row.user_id);
          if (cloudUrl) {
            await db.run(
              `UPDATE farm_daily_reports SET image_uri = ?, updated_at = datetime('now') WHERE id = ?`,
              [cloudUrl, row.id]
            );
            uploadedCount++;
          }
        } catch (uploadErr) {
          console.warn(`[CheckupStorage] Failed to sync daily report image for record ${row.id}:`, uploadErr);
        }
      }
    }

    if (uploadedCount > 0) {
      console.log(`[CheckupStorage] Successfully synced ${uploadedCount} pending images to Supabase cloud!`);
    }

    return uploadedCount;
  } catch (err) {
    console.warn('[CheckupStorage] syncPendingCheckupImages error:', err);
    return 0;
  }
}

/**
 * React Hook: Automatically watches app state & internet connectivity
 * and triggers background photo upload whenever internet is available.
 */
export function useBackgroundCheckupImageSync(userId?: string) {
  useEffect(() => {
    // 1. Run sync immediately on component mount
    void syncPendingCheckupImages(userId);

    // 2. Sync whenever app comes to foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        void syncPendingCheckupImages(userId);
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // 3. Periodic background check every 45 seconds
    const interval = setInterval(() => {
      void syncPendingCheckupImages(userId);
    }, 45000);

    return () => {
      appStateSub.remove();
      clearInterval(interval);
    };
  }, [userId]);
}

/**
 * Resolves the best URI to display an image:
 * If a local file exists, uses the local file for instant offline loading.
 * If local file is missing, loads from the cloud URL.
 */
export async function getDisplayableCheckupImageUri(imageUri: string | null, cloudFallback?: string | null): Promise<string | null> {
  if (!imageUri) return cloudFallback || null;

  if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
    return imageUri;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (fileInfo.exists) {
      return imageUri;
    }
  } catch {
    // If local check throws, fallback
  }

  return cloudFallback || imageUri;
}

/**
 * Deletes a single checkup or daily report image from both Supabase cloud storage and local disk.
 */
export async function deleteCheckupImage(imageUri: string | null): Promise<void> {
  if (!imageUri) return;

  // 1. If it's a local file URI, delete from device storage
  if (imageUri.startsWith('file://')) {
    try {
      await FileSystem.deleteAsync(imageUri, { idempotent: true });
      console.log('[CheckupStorage] Deleted local image file:', imageUri);
    } catch (e) {
      console.warn('[CheckupStorage] Failed to delete local image file:', e);
    }
    return;
  }

  // 2. If it's a Supabase storage URL, extract file path and delete from bucket
  if (imageUri.includes('/checkup-images/')) {
    try {
      const parts = imageUri.split('/checkup-images/');
      if (parts.length > 1) {
        const filePath = decodeURIComponent(parts[1].split('?')[0]);
        const { error } = await supabase.storage
          .from('checkup-images')
          .remove([filePath]);

        if (error) {
          console.warn('[CheckupStorage] Supabase storage delete error:', error.message);
        } else {
          console.log('[CheckupStorage] Successfully removed image from cloud bucket:', filePath);
        }
      }
    } catch (cloudDelErr) {
      console.warn('[CheckupStorage] Cloud image deletion error:', cloudDelErr);
    }
  }
}

/**
 * Bulk deletes all checkup and daily report images associated with a farm from both cloud & device storage.
 */
export async function deleteFarmImages(imageUris: Array<string | null>): Promise<void> {
  const validUris = imageUris.filter((u): u is string => Boolean(u && u.trim()));
  if (validUris.length === 0) return;

  const cloudPaths: string[] = [];

  for (const uri of validUris) {
    if (uri.startsWith('file://')) {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {}
    } else if (uri.includes('/checkup-images/')) {
      const parts = uri.split('/checkup-images/');
      if (parts.length > 1) {
        cloudPaths.push(decodeURIComponent(parts[1].split('?')[0]));
      }
    }
  }

  if (cloudPaths.length > 0) {
    try {
      const { error } = await supabase.storage.from('checkup-images').remove(cloudPaths);
      if (error) {
        console.warn('[CheckupStorage] Failed to bulk remove cloud images:', error.message);
      } else {
        console.log(`[CheckupStorage] Cleaned up ${cloudPaths.length} cloud images from bucket.`);
      }
    } catch (e) {
      console.warn('[CheckupStorage] Bulk cloud image removal exception:', e);
    }
  }
}
