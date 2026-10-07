import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncDatabase,
  UpdateType,
} from '@powersync/react-native';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppSchema } from './powersync-schema';
import { supabase, SUPABASE_AUTH_STORAGE_KEY } from './supabase';

const POWERSYNC_URL = process.env.EXPO_PUBLIC_POWERSYNC_URL || '';
const POWERSYNC_DB_FILENAME = 'soilsync-powersync.db';
const DEFAULT_WAIT_TIMEOUT_MS = 15000;

const PRIVATE_UPLOAD_TABLES = new Set([
  'farms',
  'farm_layouts',
  'garden_structures',
  'crop_cycles',
  'todos',
  'todo_comments',
  'farm_succession_plans',
  'farm_checkup_results',
  'farm_daily_reports',
  'teams',
  'team_members',
  'team_farms',
  'team_folders',
  'folder_audit_logs',
  'audit_logs',
  'user_sms_settings',
  'user_action_logs',
  'user_learning_progress',
  'user_folder',
  'farm_facilities',
  'facility_inventories',
  'inventory_transactions',
  'farm_layout_facilities',
  'farm_estate_layout',
  'user_certificates',
  'user_ai_daily_usage',
  'reports',
]);

const JSONB_COLUMNS: Record<string, string[]> = {
  reports: ['device_info'],
  user_folder: ['content_json'],
  farm_layout_facilities: ['contents'],
  farm_estate_layout: ['layout_data_json'],
  farm_layouts: [
    'blueprint_data_json',
    'snapshot_image_paths_json',
    'structure_counts_json',
    'unity_state_json',
  ],
  farm_succession_plans: ['plan_data_json'],
  farm_checkup_results: ['summary_data_json'],
  farm_daily_reports: ['answers_json', 'symptoms_summary_json'],
  audit_logs: ['details'],
  folder_audit_logs: ['details'],
  user_action_logs: ['metadata'],
};

const factory = new OPSqliteOpenFactory({
  dbFilename: POWERSYNC_DB_FILENAME,
});

export const powersync = new PowerSyncDatabase({
  database: factory,
  schema: AppSchema,
});

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseJsonbValue(value: unknown) {
  if (value === null || value === undefined || typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeUploadData(table: string, row: Record<string, unknown>) {
  const normalizedRow: Record<string, unknown> = {};
  const jsonbColumns = JSONB_COLUMNS[table] ?? [];

  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) {
      continue;
    }

    normalizedRow[key] = jsonbColumns.includes(key) ? parseJsonbValue(value) : value;
  }

  // user_sms_settings in Postgres uses user_id as primary key and has no id column
  if (table === 'user_sms_settings') {
    delete normalizedRow.id;
  }

  return normalizedRow;
}

class SoilSyncPowerSyncConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    if (!POWERSYNC_URL) {
      throw new Error('EXPO_PUBLIC_POWERSYNC_URL is missing. Add your PowerSync instance URL.');
    }

    let {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error && error.message.includes('Invalid Refresh Token')) {
      throw error;
    }

    if (!session) {
      const storedStr = await AsyncStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
      if (storedStr) {
        try {
          const storedSession = JSON.parse(storedStr);
          if (storedSession?.user) {
            console.log('[PowerSync] Offline fallback token found, forcing retry loop');
            throw new Error('Offline, cannot refresh token');
          }
        } catch (e) {
          // ignore
        }
      }
      return null;
    }

    return {
      endpoint: POWERSYNC_URL,
      token: session.access_token,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      return;
    }

    try {
      for (const entry of transaction.crud) {
        const table = entry.table;

        if (!PRIVATE_UPLOAD_TABLES.has(table)) {
          console.warn('[PowerSync][Upload] Ignoring non-private table write.', {
            table,
            op: entry.op,
            id: entry.id,
          });
          continue;
        }

        if (entry.op === UpdateType.DELETE) {
          // Proactively nullify image_uri / media references in Supabase prior to delete
          // so PostgreSQL triggers do not attempt direct DELETE FROM storage.objects
          if (table === 'farms') {
            try {
              await supabase.from('farm_checkup_results').update({ image_uri: null }).eq('farm_id', entry.id);
            } catch {}
            try {
              await supabase.from('farm_daily_reports').update({ image_uri: null }).eq('farm_id', entry.id);
            } catch {}
          } else if (table === 'farm_checkup_results' || table === 'farm_daily_reports') {
            try {
              await supabase.from(table).update({ image_uri: null }).eq('id', entry.id);
            } catch {}
          } else if (table === 'user_folder') {
            try {
              await supabase.from(table).update({ content_json: { media: [] } }).eq('id', entry.id);
            } catch {}
          }

          const { error } = await supabase.from(table).delete().eq('id', entry.id);

          if (error) {
            // Check if error is due to Supabase direct storage.objects deletion restriction
            const isStorageDirectDeleteError =
              error.message?.includes('Direct deletion from storage tables is not allowed') ||
              (error.code === '42501' && (error.hint?.includes('Storage API') || error.hint?.includes('orphaned objects')));

            if (isStorageDirectDeleteError) {
              console.warn(
                `[PowerSync][Upload] Suppressed storage trigger restriction on ${table} (${entry.id}): ${error.message}`
              );
              continue;
            }

            throw error;
          }

          continue;
        }

        const row = normalizeUploadData(table, {
          id: entry.id,
          ...(entry.opData ?? {}),
        });

        if (entry.op === UpdateType.PUT) {
          const onConflict =
            table === 'farm_layouts' ? 'farm_id' : table === 'user_sms_settings' ? 'user_id' : 'id';
          let { error } = await supabase.from(table).upsert(row, { onConflict });

          if (error && table === 'farm_layouts' && (error as any).code === '23505') {
            const { id: _id, ...updates } = row;
            const res = await supabase.from('farm_layouts').update(updates).eq('farm_id', row.farm_id);
            error = res.error;
          }

          if (error) {
            if ((error as any).code === '23503' && table === 'farm_layout_facilities') {
              console.warn(
                `[PowerSync][Upload] Suppressed foreign key constraint error on ${table} (${entry.id}):`,
                error.message
              );
              continue;
            }
            throw error;
          }

          continue;
        }

        if (entry.op === UpdateType.PATCH) {
          const { id: _id, ...updates } = row;
          const keyColumn = table === 'user_sms_settings' ? 'user_id' : 'id';
          const { error } = await supabase.from(table).update(updates).eq(keyColumn, entry.id);

          if (error) {
            if ((error as any).code === '23503' && table === 'farm_layout_facilities') {
              console.warn(
                `[PowerSync][Upload] Suppressed foreign key constraint error on ${table} (${entry.id}):`,
                error.message
              );
              continue;
            }
            throw error;
          }
        }
      }

      await transaction.complete();
    } catch (error) {
      console.error('[PowerSync][Upload] Upload failed. PowerSync will retry.', error);
      throw error;
    }
  }
}

export const powerSyncConnector = new SoilSyncPowerSyncConnector();

export async function initializePowerSyncDatabase() {
  await powersync.init();
  await powersync.waitForReady();
}

export async function connectPowerSync() {
  await initializePowerSyncDatabase();

  if (!powersync.connected && !powersync.connecting) {
    await powersync.connect(powerSyncConnector);
  }
}

export async function disconnectPowerSync(options: { clearLocal?: boolean } = {}) {
  const { clearLocal = false } = options;

  if (clearLocal) {
    await powersync.disconnectAndClear({ clearLocal: true });
    return;
  }

  await powersync.disconnect();
}

async function waitForFirstSync(timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await powersync.waitForFirstSync({ signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitForUploadQueue(timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const stats = await powersync.getUploadQueueStats();

    if (stats.count === 0) {
      return stats;
    }

    await delay(500);
  }

  return powersync.getUploadQueueStats();
}

export async function waitForPowerSync(timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) {
  await connectPowerSync();
  await waitForFirstSync(timeoutMs);
  return waitForUploadQueue(timeoutMs);
}

export async function getPowerSyncUploadQueueCount() {
  const stats = await powersync.getUploadQueueStats();
  return stats.count;
}
