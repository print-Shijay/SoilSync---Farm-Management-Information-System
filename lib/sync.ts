import AsyncStorage from '@react-native-async-storage/async-storage';

import { getDatabase, initializeLocalDatabase } from './local-db';
import { connectPowerSync, getPowerSyncUploadQueueCount, waitForPowerSync } from './powersync';
import { syncPendingCheckupImages } from './checkup-storage';

const LAST_SYNC_AT_KEY = 'soilsync:last_sync_at';

export async function getLastSyncAt() {
  return AsyncStorage.getItem(LAST_SYNC_AT_KEY);
}

async function setLastSyncAt(timestamp: string) {
  await AsyncStorage.setItem(LAST_SYNC_AT_KEY, timestamp);
}

async function getLocalDatabaseCounts() {
  const db = getDatabase();

  const [
    users,
    farms,
    gardenStructureTypes,
    farmLayouts,
    gardenStructures,
    organicFarmingCrops,
    cropMaintenanceGuides,
    cropCycles,
    farmModules,
    modules,
    moduleQuizzes,
    userLearningProgress,
    todos,
    farmCheckupResults,
    teamMembers,
    auditLogs,
    userSmsSettings,
  ] = await Promise.all([
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM farms'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM garden_structure_types'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM farm_layouts'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM garden_structures'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM organic_farming_crops'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM crop_maintenance_guides'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM crop_cycles'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM farm_modules'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM modules'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM module_quizzes'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM user_learning_progress'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM todos'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM farm_checkup_results'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM team_members'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM audit_logs'),
    db.get<{ count: number }>('SELECT COUNT(*) AS count FROM user_sms_settings'),
  ]);

  return {
    users: Number(users?.count ?? 0),
    farms: Number(farms?.count ?? 0),
    gardenStructureTypes: Number(gardenStructureTypes?.count ?? 0),
    farmLayouts: Number(farmLayouts?.count ?? 0),
    gardenStructures: Number(gardenStructures?.count ?? 0),
    organicFarmingCrops: Number(organicFarmingCrops?.count ?? 0),
    cropMaintenanceGuides: Number(cropMaintenanceGuides?.count ?? 0),
    cropCycles: Number(cropCycles?.count ?? 0),
    farmModules: Number(farmModules?.count ?? 0),
    modules: Number(modules?.count ?? 0),
    moduleQuizzes: Number(moduleQuizzes?.count ?? 0),
    userLearningProgress: Number(userLearningProgress?.count ?? 0),
    todos: Number(todos?.count ?? 0),
    farmCheckupResults: Number(farmCheckupResults?.count ?? 0),
    teamMembers: Number(teamMembers?.count ?? 0),
    auditLogs: Number(auditLogs?.count ?? 0),
    userSmsSettings: Number(userSmsSettings?.count ?? 0),
  };
}

async function tryGetLocalDatabaseCounts(stage: string) {
  try {
    return await getLocalDatabaseCounts();
  } catch (error) {
    console.log(`[Sync] Local database counts unavailable ${stage}.`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function initializeDatabaseForSession() {
  console.log('[Sync][Login] Initializing PowerSync local database...');
  await initializeLocalDatabase();
  await connectPowerSync();

  // Asynchronously sync any pending checkup images in background
  void syncPendingCheckupImages().catch((err) =>
    console.warn('[Sync] Background checkup image sync warning:', err)
  );

  const counts = await tryGetLocalDatabaseCounts('after local DB init');
  console.log('[Sync][Login] Local database ready for queries.', counts);

  const now = new Date().toISOString();
  await setLastSyncAt(now);

  return now;
}

export async function forceSyncNow() {
  const beforeCounts = await tryGetLocalDatabaseCounts('before manual sync');
  const beforeUploadCount = await getPowerSyncUploadQueueCount().catch(() => null);
  console.log('[Sync] Manual PowerSync wait started.', {
    beforeCounts,
    beforeUploadCount,
  });

  const uploadStats = await waitForPowerSync();

  // Asynchronously sync any pending checkup images in background
  void syncPendingCheckupImages().catch((err) =>
    console.warn('[Sync] Background checkup image sync warning:', err)
  );

  const afterCounts = await tryGetLocalDatabaseCounts('after manual sync');
  console.log('[Sync] Manual PowerSync wait completed.', {
    afterCounts,
    uploadQueueCount: uploadStats.count,
  });

  const now = new Date().toISOString();
  await setLastSyncAt(now);

  return now;
}

export const syncLocalAndCloud = forceSyncNow;
