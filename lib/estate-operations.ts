/**
 * Farm Estate Operations
 *
 * Manages the unified Estate Farm layout without duplicating constituent plot or structure rows.
 * Stores only reference IDs (farmId) and world coordinates for farm parcels, plus estate-level facilities.
 */

import { getDatabase, generateUUID } from './local-db';

export interface EstatePlacedFarm {
  farmId: string;
  x: number;
  y: number;
  rotation?: number;
  isLocked?: boolean;
}

export type EstateFacilityFunction = 'inventory' | 'time_keeping' | 'both' | 'none';

export interface EstateFacility {
  id: string;
  name: string;
  category: string;
  widthM: number;
  heightM: number;
  x: number;
  y: number;
  color?: string;
  icon?: string;
  facilityFunction?: EstateFacilityFunction;
  hasInventory?: boolean;
  hasSchedule?: boolean;
  inventoryName?: string;
  scheduleName?: string;
  inventories?: any[];
  timeLogs?: any[];
  isLocked?: boolean;
}

export interface EstateLayoutData {
  widthM: number;
  heightM: number;
  placedFarms: EstatePlacedFarm[];
  facilities: EstateFacility[];
}

export interface FarmEstateRecord {
  id: string;
  user_id: string;
  estate_name: string;
  layout_data: EstateLayoutData;
  created_at: string;
  updated_at: string;
}

const DEFAULT_ESTATE_LAYOUT: EstateLayoutData = {
  widthM: 60,
  heightM: 60,
  placedFarms: [],
  facilities: [],
};

function parseEstateLayout(jsonStringOrObj: any): EstateLayoutData {
  if (!jsonStringOrObj) return { ...DEFAULT_ESTATE_LAYOUT };
  try {
    const parsed = typeof jsonStringOrObj === 'string' ? JSON.parse(jsonStringOrObj) : jsonStringOrObj;
    return {
      widthM: Number(parsed.widthM) || 60,
      heightM: Number(parsed.heightM) || 60,
      placedFarms: Array.isArray(parsed.placedFarms)
        ? parsed.placedFarms
        : Array.isArray(parsed.placed_farms)
        ? parsed.placed_farms.map((pf: any) => ({
            farmId: pf.farmId || pf.farm_id,
            x: Number(pf.x) || 0,
            y: Number(pf.y) || 0,
            rotation: pf.rotation || 0,
          }))
        : [],
      facilities: Array.isArray(parsed.facilities)
        ? parsed.facilities.map((f: any) => {
            const hasInv =
              f.hasInventory !== undefined
                ? f.hasInventory === true
                : f.facilityFunction === 'inventory' || f.facilityFunction === 'both';
            const hasSched =
              f.hasSchedule !== undefined
                ? f.hasSchedule === true
                : f.facilityFunction === 'time_keeping' || f.facilityFunction === 'both';
            const fn: EstateFacilityFunction =
              f.facilityFunction ||
              (hasInv && hasSched ? 'both' : hasInv ? 'inventory' : hasSched ? 'time_keeping' : 'none');

            return {
              id: f.id,
              name: f.name || 'Estate Facility',
              category: f.category || 'facility',
              widthM: Number(f.widthM) || 3,
              heightM: Number(f.heightM) || 3,
              x: Number(f.x) || 0,
              y: Number(f.y) || 0,
              color: f.color,
              icon: f.icon,
              facilityFunction: fn,
              hasInventory: hasInv,
              hasSchedule: hasSched,
              inventoryName: f.inventoryName,
              scheduleName: f.scheduleName,
              inventories: Array.isArray(f.inventories) ? f.inventories : [],
              timeLogs: Array.isArray(f.timeLogs) ? f.timeLogs : [],
            };
          })
        : [],
    };
  } catch (err) {
    console.warn('[EstateOps] Failed to parse layout_data_json:', err);
    return { ...DEFAULT_ESTATE_LAYOUT };
  }
}

/**
 * Fetch the user's primary Estate Farm layout from local SQLite.
 */
export async function getFarmEstateLayout(userId: string): Promise<FarmEstateRecord | null> {
  if (!userId) return null;

  const db = getDatabase();
  try {
    const row = await db.get<any>(
      'SELECT * FROM farm_estate_layout WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      [userId]
    );
    if (row) {
      return {
        id: row.id,
        user_id: row.user_id,
        estate_name: row.estate_name || 'Farm Estate',
        layout_data: parseEstateLayout(row.layout_data_json),
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }
  } catch (err) {
    console.warn('[EstateOps] Local fetch error:', err);
  }

  return null;
}

/**
 * Saves or updates a Farm Estate layout in local SQLite (synced via PowerSync).
 */
export async function saveFarmEstateLayout(
  estateId: string | null | undefined,
  userId: string,
  estateName: string,
  layoutData: EstateLayoutData
): Promise<FarmEstateRecord> {
  const db = getDatabase();
  const id = estateId || generateUUID();
  const now = new Date().toISOString();
  const layoutJson = JSON.stringify(layoutData);
  const name = estateName.trim() || 'Farm Estate';

  try {
    const existing = await db.get<any>('SELECT id FROM farm_estate_layout WHERE id = ?', [id]);
    if (existing) {
      await db.run(
        'UPDATE farm_estate_layout SET estate_name = ?, layout_data_json = ?, updated_at = ? WHERE id = ?',
        [name, layoutJson, now, id]
      );
    } else {
      await db.run(
        'INSERT INTO farm_estate_layout (id, user_id, estate_name, layout_data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, userId, name, layoutJson, now, now]
      );
    }

    // Clean up any orphaned or legacy farm_layout_facilities rows mistakenly associated with estate IDs
    try {
      await db.run(
        'DELETE FROM farm_layout_facilities WHERE estate_layout_id IS NOT NULL OR farm_id = ? OR farm_id NOT IN (SELECT id FROM farms)',
        [id]
      );
    } catch (facilityDbErr) {
      console.warn('[EstateOps] Local farm_layout_facilities cleanup note:', facilityDbErr);
    }
  } catch (err) {
    console.warn('[EstateOps] Local save error:', err);
  }

  return {
    id,
    user_id: userId,
    estate_name: name,
    layout_data: layoutData,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Validates placed farm parcels in the estate against currently active user farms.
 * If any farm was deleted or missing, prunes it from placedFarms.
 */
export function validateAndSyncEstateLayout(
  estate: FarmEstateRecord,
  activeFarms: any[]
): {
  syncedEstate: FarmEstateRecord;
  hasChanges: boolean;
  removedFarmCount: number;
} {
  const activeFarmIds = new Set(activeFarms.map((f) => f.id));
  const currentPlaced = estate.layout_data.placedFarms || [];

  const validPlaced = currentPlaced.filter((pf) => activeFarmIds.has(pf.farmId));
  const removedCount = currentPlaced.length - validPlaced.length;

  if (removedCount > 0) {
    const updatedData: EstateLayoutData = {
      ...estate.layout_data,
      placedFarms: validPlaced,
    };
    return {
      syncedEstate: {
        ...estate,
        layout_data: updatedData,
      },
      hasChanges: true,
      removedFarmCount: removedCount,
    };
  }

  return {
    syncedEstate: estate,
    hasChanges: false,
    removedFarmCount: 0,
  };
}

/**
 * Deletes a Farm Estate layout without touching any individual farms.
 */
export async function deleteFarmEstate(estateId: string, userId?: string): Promise<void> {
  if (!estateId) return;

  const db = getDatabase();

  try {
    await db.run('DELETE FROM farm_estate_layout WHERE id = ?', [estateId]);
    await db.run('DELETE FROM farm_layout_facilities WHERE estate_layout_id = ?', [estateId]);
  } catch (err) {
    console.warn('[EstateOps] Local delete error:', err);
  }
}
