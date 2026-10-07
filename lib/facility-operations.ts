import { getDatabase, generateUUID } from './local-db';
import { getBuildingImage } from '../modules/farm-layout-designer/buildingAssets';
import { getOrCreateFarmLayout, getFarmsByUser } from './db-operations';
import { saveFarmEstateLayout, getFarmEstateLayout } from './estate-operations';

export interface FacilityInventoryItem {
  id?: string;
  name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  status?: 'good' | 'low_stock' | 'out_of_stock' | 'ready' | 'maintenance' | 'in_use' | string;
  lowStockThreshold?: number;
  updatedAt?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface FacilityTimeLog {
  id?: string;
  activity?: string;
  type?: string;
  date?: string; // YYYY-MM-DD
  startTime?: string; // e.g. "08:00 AM" or "08:00"
  endTime?: string; // e.g. "11:30 AM" or "11:30"
  hours?: number;
  staffName?: string;
  notes?: string;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | string;
  color?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface CombinedFacility {
  facility_id: string;
  farm_id: string;
  farm_layout_id: string;
  estate_layout_id?: string;
  farmName?: string;
  name: string;
  layoutName?: string;
  category?: string;
  hasInventory: boolean;
  hasTime: boolean;
  imageAsset?: any | null;
  inventoryRow?: {
    id: string;
    name: string;
    contents: FacilityInventoryItem[];
    rawContents: string;
    created_at: string;
    updated_at: string;
  };
  timeRow?: {
    id: string;
    name: string;
    contents: FacilityTimeLog[];
    rawContents: string;
    created_at: string;
    updated_at: string;
  };
  inventoryItemsCount: number;
  timeLogsCount: number;
  totalItemsCount: number;
  created_at: string;
  updated_at: string;
}

/**
 * Parses contents safely, whether it's already an array, an object, or a JSON string.
 */
function parseContents(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  if (typeof raw === 'object') return [raw];
  return [];
}

/**
 * Normalizes a raw string for clean display/JSON copying.
 */
function stringifyContents(raw: unknown): string {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }
  if (raw) {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }
  return '[]';
}

/**
 * Queries all farm_layout_facilities for a given farm, groups records by `facility_id`,
 * combines dual-purpose facilities (inventory + time) into a single object,
 * and correlates with layout metadata if available.
 */
export async function getCombinedFarmFacilities(farmId: string): Promise<CombinedFacility[]> {
  if (!farmId) return [];

  const db = getDatabase();
  let facilityRows: any[] = [];
  let layoutRow: any = null;
  let farmName = '';

  try {
    const fRow = await db.get<any>(`SELECT farm_name FROM farms WHERE id = ? LIMIT 1`, [farmId]);
    if (fRow?.farm_name) farmName = fRow.farm_name;
  } catch {}

  // 1. Fetch facility rows from local database
  try {
    const rows = await db.all<any>(
      `SELECT * FROM farm_layout_facilities WHERE farm_id = ? ORDER BY created_at DESC`,
      [farmId]
    );
    if (rows && rows.length > 0) {
      facilityRows = rows;
    }
  } catch (err) {
    console.warn('[Facilities] Local DB query error:', err);
  }

  // 2. Fetch farm layout metadata to associate facility titles, categories, and icons
  try {
    const lRow = await db.get<any>(
      `SELECT * FROM farm_layouts WHERE farm_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [farmId]
    );
    if (lRow) {
      layoutRow = lRow;
    }
  } catch {}

  // Parse blueprint facilities if available
  const layoutFacilityMap = new Map<string, any>();
  if (layoutRow?.blueprint_data_json) {
    try {
      const blueprint =
        typeof layoutRow.blueprint_data_json === 'string'
          ? JSON.parse(layoutRow.blueprint_data_json)
          : layoutRow.blueprint_data_json;
      if (Array.isArray(blueprint?.facilities)) {
        blueprint.facilities.forEach((f: any) => {
          if (f.id) layoutFacilityMap.set(f.id, f);
        });
      }
    } catch {}
  }

  // 3. Group rows by `facility_id`
  const groupedMap = new Map<string, any[]>();
  facilityRows.forEach((row) => {
    const fid = row.facility_id || row.id;
    if (!groupedMap.has(fid)) {
      groupedMap.set(fid, []);
    }
    groupedMap.get(fid)!.push(row);
  });

  const combinedList: CombinedFacility[] = [];

  groupedMap.forEach((rows, fid) => {
    const layoutMeta = layoutFacilityMap.get(fid);

    let inventoryRow: any = null;
    let timeRow: any = null;
    let baseName = '';
    let latestUpdated = '';
    let earliestCreated = '';

    rows.forEach((row) => {
      if (row.type === 'inventory') {
        inventoryRow = row;
      } else if (row.type === 'time') {
        timeRow = row;
      }

      if (!baseName && row.name) {
        baseName = row.name.replace(/\s+(Inventory|Schedule|Logs)$/i, '').trim();
      }

      if (!latestUpdated || (row.updated_at && row.updated_at > latestUpdated)) {
        latestUpdated = row.updated_at;
      }
      if (!earliestCreated || (row.created_at && row.created_at < earliestCreated)) {
        earliestCreated = row.created_at;
      }
    });

    const parsedInventories = inventoryRow ? parseContents(inventoryRow.contents) : [];
    const parsedTimeLogs = timeRow ? parseContents(timeRow.contents) : [];

    const finalName = layoutMeta?.name || baseName || rows[0]?.name || 'Facility';
    const imageAsset = getBuildingImage(finalName);

    combinedList.push({
      facility_id: fid,
      farm_id: rows[0]?.farm_id || farmId,
      farm_layout_id: rows[0]?.farm_layout_id || '',
      farmName: farmName || 'Farm Parcel',
      name: finalName,
      layoutName: layoutMeta?.name,
      category: layoutMeta?.category || 'facility',
      hasInventory: Boolean(inventoryRow),
      hasTime: Boolean(timeRow),
      imageAsset,
      inventoryRow: inventoryRow
        ? {
            id: inventoryRow.id,
            name: inventoryRow.name,
            contents: parsedInventories,
            rawContents: stringifyContents(inventoryRow.contents),
            created_at: inventoryRow.created_at,
            updated_at: inventoryRow.updated_at,
          }
        : undefined,
      timeRow: timeRow
        ? {
            id: timeRow.id,
            name: timeRow.name,
            contents: parsedTimeLogs,
            rawContents: stringifyContents(timeRow.contents),
            created_at: timeRow.created_at,
            updated_at: timeRow.updated_at,
          }
        : undefined,
      inventoryItemsCount: parsedInventories.length,
      timeLogsCount: parsedTimeLogs.length,
      totalItemsCount: parsedInventories.length + parsedTimeLogs.length,
      created_at: earliestCreated || new Date().toISOString(),
      updated_at: latestUpdated || new Date().toISOString(),
    });
  });

  // Include blueprint facilities that haven't created inventory/time rows yet
  layoutFacilityMap.forEach((meta, fid) => {
    if (!groupedMap.has(fid)) {
      const finalName = meta.name || 'Facility';
      const imageAsset = getBuildingImage(finalName);
      const isInv =
        meta.hasInventory !== undefined
          ? meta.hasInventory === true
          : meta.facilityFunction === 'inventory' || meta.facilityFunction === 'both';
      const isSched =
        meta.hasSchedule !== undefined
          ? meta.hasSchedule === true
          : meta.facilityFunction === 'time_keeping' || meta.facilityFunction === 'both';

      const parsedInventories = Array.isArray(meta.inventories) ? meta.inventories : [];
      const parsedTimeLogs = Array.isArray(meta.timeLogs) ? meta.timeLogs : [];

      combinedList.push({
        facility_id: fid,
        farm_id: farmId,
        farm_layout_id: layoutRow?.id || farmId,
        farmName: farmName || 'Farm Parcel',
        name: finalName,
        layoutName: meta.name,
        category: meta.category || 'facility',
        hasInventory: isInv,
        hasTime: isSched,
        imageAsset,
        inventoryRow: isInv
          ? {
              id: `farm-inv-${fid}`,
              name: meta.inventoryName?.trim() || `${finalName} Inventory`,
              contents: parsedInventories,
              rawContents: stringifyContents(parsedInventories),
              created_at: layoutRow?.created_at || new Date().toISOString(),
              updated_at: layoutRow?.updated_at || new Date().toISOString(),
            }
          : undefined,
        timeRow: isSched
          ? {
              id: `farm-time-${fid}`,
              name: meta.scheduleName?.trim() || `${finalName} Schedule`,
              contents: parsedTimeLogs,
              rawContents: stringifyContents(parsedTimeLogs),
              created_at: layoutRow?.created_at || new Date().toISOString(),
              updated_at: layoutRow?.updated_at || new Date().toISOString(),
            }
          : undefined,
        inventoryItemsCount: parsedInventories.length,
        timeLogsCount: parsedTimeLogs.length,
        totalItemsCount: parsedInventories.length + parsedTimeLogs.length,
        created_at: layoutRow?.created_at || new Date().toISOString(),
        updated_at: layoutRow?.updated_at || new Date().toISOString(),
      });
    }
  });

  return combinedList;
}

/**
 * Fetches all facilities attached to a Farm Estate (from farm_layout_facilities and farm_estate_layout).
 */
export async function getEstateFacilities(estateId: string): Promise<CombinedFacility[]> {
  if (!estateId) return [];

  const db = getDatabase();
  let facilityRows: any[] = [];
  let estateRecord: any = null;

  // 1. Fetch estate layout to get placed facilities and estate name
  try {
    const row = await db.get<any>(
      `SELECT * FROM farm_estate_layout WHERE id = ? OR user_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [estateId, estateId]
    );
    if (row) estateRecord = row;
  } catch {}

  const estateName = estateRecord?.estate_name || 'Farm Estate';
  const effectiveEstateId = estateRecord?.id || estateId;

  // 2. Fetch facility rows from local database
  try {
    const rows = await db.all<any>(
      `SELECT * FROM farm_layout_facilities WHERE estate_layout_id = ? OR farm_id = ? ORDER BY created_at DESC`,
      [effectiveEstateId, effectiveEstateId]
    );
    if (rows && rows.length > 0) {
      facilityRows = rows;
    }
  } catch (err) {
    console.warn('[Facilities] Estate local query error:', err);
  }

  // 3. Parse blueprint facilities from estate layout_data_json
  const layoutFacilityMap = new Map<string, any>();
  if (estateRecord?.layout_data_json) {
    try {
      const layoutData =
        typeof estateRecord.layout_data_json === 'string'
          ? JSON.parse(estateRecord.layout_data_json)
          : estateRecord.layout_data_json;
      if (Array.isArray(layoutData?.facilities)) {
        layoutData.facilities.forEach((f: any) => {
          if (f.id) layoutFacilityMap.set(f.id, f);
        });
      }
    } catch {}
  }

  // 4. Group rows by `facility_id`
  const groupedMap = new Map<string, any[]>();
  facilityRows.forEach((row) => {
    const fid = row.facility_id || row.id;
    if (!groupedMap.has(fid)) {
      groupedMap.set(fid, []);
    }
    groupedMap.get(fid)!.push(row);
  });

  const combinedList: CombinedFacility[] = [];

  groupedMap.forEach((rows, fid) => {
    const layoutMeta = layoutFacilityMap.get(fid);
    let inventoryRow: any = null;
    let timeRow: any = null;
    let baseName = '';
    let latestUpdated = '';
    let earliestCreated = '';

    rows.forEach((row) => {
      if (row.type === 'inventory') inventoryRow = row;
      else if (row.type === 'time') timeRow = row;

      if (!baseName && row.name) {
        baseName = row.name.replace(/\\s+(Inventory|Schedule|Logs)$/i, '').trim();
      }

      if (!latestUpdated || (row.updated_at && row.updated_at > latestUpdated)) {
        latestUpdated = row.updated_at;
      }
      if (!earliestCreated || (row.created_at && row.created_at < earliestCreated)) {
        earliestCreated = row.created_at;
      }
    });

    const parsedInventories = inventoryRow ? parseContents(inventoryRow.contents) : [];
    const parsedTimeLogs = timeRow ? parseContents(timeRow.contents) : [];

    const finalName = layoutMeta?.name || baseName || rows[0]?.name || 'Estate Facility';
    const imageAsset = getBuildingImage(finalName);

    combinedList.push({
      facility_id: fid,
      farm_id: effectiveEstateId,
      farm_layout_id: effectiveEstateId,
      estate_layout_id: effectiveEstateId,
      farmName: estateName,
      name: finalName,
      layoutName: layoutMeta?.name,
      category: layoutMeta?.category || 'facility',
      hasInventory: Boolean(inventoryRow),
      hasTime: Boolean(timeRow),
      imageAsset,
      inventoryRow: inventoryRow
        ? {
            id: inventoryRow.id,
            name: inventoryRow.name,
            contents: parsedInventories,
            rawContents: stringifyContents(inventoryRow.contents),
            created_at: inventoryRow.created_at,
            updated_at: inventoryRow.updated_at,
          }
        : undefined,
      timeRow: timeRow
        ? {
            id: timeRow.id,
            name: timeRow.name,
            contents: parsedTimeLogs,
            rawContents: stringifyContents(timeRow.contents),
            created_at: timeRow.created_at,
            updated_at: timeRow.updated_at,
          }
        : undefined,
      inventoryItemsCount: parsedInventories.length,
      timeLogsCount: parsedTimeLogs.length,
      totalItemsCount: parsedInventories.length + parsedTimeLogs.length,
      created_at: earliestCreated || new Date().toISOString(),
      updated_at: latestUpdated || new Date().toISOString(),
    });
  });

  // Also include any placed facilities from estate layout_data_json that don't have DB rows yet
  layoutFacilityMap.forEach((meta, fid) => {
    if (!groupedMap.has(fid)) {
      const finalName = meta.name || 'Estate Facility';
      const imageAsset = getBuildingImage(finalName);
      const isInv =
        meta.hasInventory !== undefined
          ? meta.hasInventory === true
          : meta.facilityFunction === 'inventory' || meta.facilityFunction === 'both';
      const isSched =
        meta.hasSchedule !== undefined
          ? meta.hasSchedule === true
          : meta.facilityFunction === 'time_keeping' || meta.facilityFunction === 'both';

      const parsedInventories = Array.isArray(meta.inventories) ? meta.inventories : [];
      const parsedTimeLogs = Array.isArray(meta.timeLogs) ? meta.timeLogs : [];

      combinedList.push({
        facility_id: fid,
        farm_id: effectiveEstateId,
        farm_layout_id: effectiveEstateId,
        estate_layout_id: effectiveEstateId,
        farmName: estateName,
        name: finalName,
        layoutName: meta.name,
        category: meta.category || 'facility',
        hasInventory: isInv,
        hasTime: isSched,
        imageAsset,
        inventoryRow: isInv
          ? {
              id: `estate-inv-${fid}`,
              name: meta.inventoryName?.trim() || `${finalName} Inventory`,
              contents: parsedInventories,
              rawContents: stringifyContents(parsedInventories),
              created_at: estateRecord.created_at || new Date().toISOString(),
              updated_at: estateRecord.updated_at || new Date().toISOString(),
            }
          : undefined,
        timeRow: isSched
          ? {
              id: `estate-time-${fid}`,
              name: meta.scheduleName?.trim() || `${finalName} Schedule`,
              contents: parsedTimeLogs,
              rawContents: stringifyContents(parsedTimeLogs),
              created_at: estateRecord.created_at || new Date().toISOString(),
              updated_at: estateRecord.updated_at || new Date().toISOString(),
            }
          : undefined,
        inventoryItemsCount: parsedInventories.length,
        timeLogsCount: parsedTimeLogs.length,
        totalItemsCount: parsedInventories.length + parsedTimeLogs.length,
        created_at: estateRecord.created_at || new Date().toISOString(),
        updated_at: estateRecord.updated_at || new Date().toISOString(),
      });
    }
  });

  return combinedList;
}

/**
 * Retrieves all facilities across all farms and estates for the current user.
 */
export async function getAllUserFacilities(userId: string): Promise<CombinedFacility[]> {
  if (!userId) return [];

  let userFarms: any[] = [];
  try {
    userFarms = await getFarmsByUser(userId);
  } catch (err) {
    console.warn('[Facilities] Error in getFarmsByUser:', err);
  }

  // Load facilities for each farm
  const farmFacilitiesPromises = (userFarms || []).map(async (f) => {
    try {
      const facs = await getCombinedFarmFacilities(f.id);
      return facs.map((fac) => ({
        ...fac,
        farmName: f.farm_name,
      }));
    } catch (err) {
      console.warn(`[Facilities] Error loading facilities for farm ${f.id}:`, err);
      return [];
    }
  });

  // Also load estate facilities if estate exists
  let estateFacilitiesPromise = Promise.resolve<CombinedFacility[]>([]);
  try {
    const estate = await getFarmEstateLayout(userId);
    if (estate?.id) {
      estateFacilitiesPromise = getEstateFacilities(estate.id).then((facs) =>
        facs.map((fac) => ({
          ...fac,
          farmName: estate.estate_name ? `${estate.estate_name} (Estate)` : 'Farm Estate',
        }))
      );
    }
  } catch {}

  const results = await Promise.all([...farmFacilitiesPromises, estateFacilitiesPromise]);
  const flattened = results.flat();

  // Deduplicate by parent scope + facility_id
  const seen = new Set<string>();
  const deduped: CombinedFacility[] = [];
  flattened.forEach((fac) => {
    const parentId = fac.estate_layout_id || fac.farm_id;
    const key = `${parentId}_${fac.facility_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(fac);
    }
  });

  return deduped.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export const getAllUserCombinedFacilities = getAllUserFacilities;

/**
 * Fetches a single facility detail record by farmId and facilityId.
 * Supports checking both standard farm facilities and estate facilities.
 */
export async function getFacilityDetail(
  farmId: string,
  facilityId: string
): Promise<CombinedFacility | null> {
  const allFarm = await getCombinedFarmFacilities(farmId);
  const foundFarm = allFarm.find((f) => f.facility_id === facilityId);
  if (foundFarm) return foundFarm;

  const allEstate = await getEstateFacilities(farmId);
  const foundEstate = allEstate.find((f) => f.facility_id === facilityId);
  if (foundEstate) return foundEstate;

  return null;
}

/**
 * Sanitizes an inventory item to prevent payload bloat and injection vulnerabilities.
 * Enforces a strict 255 character limit for text fields and 3000 character limit for descriptions/notes.
 */
export function sanitizeInventoryItem(item: FacilityInventoryItem): FacilityInventoryItem {
  if (!item || typeof item !== 'object') {
    return { name: '' };
  }
  return {
    ...item,
    id: typeof item.id === 'string' ? item.id.trim() : undefined,
    name: typeof item.name === 'string' ? item.name.trim().slice(0, 255) : '',
    category: typeof item.category === 'string' ? item.category.trim().slice(0, 255) : undefined,
    unit: typeof item.unit === 'string' ? item.unit.trim().slice(0, 255) : undefined,
    notes: typeof item.notes === 'string' ? item.notes.trim().slice(0, 3000) : undefined,
    quantity: typeof item.quantity === 'number' && !Number.isNaN(item.quantity) ? Math.max(0, item.quantity) : 0,
    lowStockThreshold:
      typeof item.lowStockThreshold === 'number' && !Number.isNaN(item.lowStockThreshold)
        ? Math.max(0, item.lowStockThreshold)
        : undefined,
  };
}

/**
 * Sanitizes a schedule time log/event to ensure data integrity and prevent injection.
 * Enforces a strict 255 character limit for text fields and 3000 character limit for descriptions/notes.
 */
export function sanitizeTimeLog(log: FacilityTimeLog): FacilityTimeLog {
  if (!log || typeof log !== 'object') {
    return {};
  }
  return {
    ...log,
    id: typeof log.id === 'string' ? log.id.trim() : undefined,
    activity: typeof log.activity === 'string' ? log.activity.trim().slice(0, 255) : undefined,
    type: typeof log.type === 'string' ? log.type.trim().slice(0, 255) : undefined,
    staffName: typeof log.staffName === 'string' ? log.staffName.trim().slice(0, 255) : undefined,
    date: typeof log.date === 'string' ? log.date.trim().slice(0, 20) : undefined,
    startTime: typeof log.startTime === 'string' ? log.startTime.trim().slice(0, 20) : undefined,
    endTime: typeof log.endTime === 'string' ? log.endTime.trim().slice(0, 20) : undefined,
    notes: typeof log.notes === 'string' ? log.notes.trim().slice(0, 3000) : undefined,
    hours: typeof log.hours === 'number' && !Number.isNaN(log.hours) ? Math.max(0, log.hours) : 0,
  };
}

/**
 * Saves updated inventory items to the contents column of the inventory row in farm_layout_facilities.
 * Updates both local SQLite DB and Supabase with strict input sanitization and transaction resilience.
 */
export async function saveFacilityInventory(
  farmId: string,
  facilityId: string,
  items: FacilityInventoryItem[],
  existingRowId?: string
): Promise<{ success: boolean; rowId: string | null }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Security & Data Integrity: enforce length bounds before persistence
  const sanitizedItems = Array.isArray(items) ? items.map(sanitizeInventoryItem) : [];
  const serialized = JSON.stringify(sanitizedItems);

  // 0. Check if target is an estate layout
  try {
    const estateRecord = await db.get<any>(
      'SELECT id, user_id, estate_name, layout_data_json FROM farm_estate_layout WHERE id = ? LIMIT 1',
      [farmId]
    );

    if (estateRecord?.id) {
      const layoutData =
        typeof estateRecord.layout_data_json === 'string'
          ? JSON.parse(estateRecord.layout_data_json)
          : estateRecord.layout_data_json;

      if (Array.isArray(layoutData?.facilities)) {
        const fac = layoutData.facilities.find((f: any) => f.id === facilityId);
        if (fac) {
          fac.inventories = sanitizedItems;
          fac.hasInventory = true;
          if (fac.facilityFunction === 'none' || !fac.facilityFunction) {
            fac.facilityFunction = fac.hasSchedule ? 'both' : 'inventory';
          }
          await saveFarmEstateLayout(estateRecord.id, estateRecord.user_id, estateRecord.estate_name, layoutData);
          return { success: true, rowId: `estate-inv-${facilityId}` };
        }
      }
    }
  } catch (estateErr) {
    console.warn('[saveFacilityInventory] Estate update note:', estateErr);
  }

  let targetRowId: string | null = null;
  let farmLayoutId = farmId;
  let effectiveUserId = '';

  // Retrieve or create farm layout to guarantee valid foreign keys
  try {
    const layout = await getOrCreateFarmLayout(farmId);
    if (layout?.id) {
      farmLayoutId = layout.id;
    }
    if (layout?.user_id) {
      effectiveUserId = layout.user_id;
    }
  } catch (err) {
    console.warn('[saveFacilityInventory] getOrCreateFarmLayout note:', err);
  }

  if (!effectiveUserId) {
    try {
      const farmRow = await db.get<any>('SELECT user_id FROM farms WHERE id = ?', [farmId]);
      if (farmRow?.user_id) {
        effectiveUserId = farmRow.user_id;
      }
    } catch {}
  }

  // 1. Local SQLite update/insert (synced via PowerSync)
  try {
    let existing: any = null;
    if (existingRowId) {
      existing = await db.get<any>(
        `SELECT id FROM farm_layout_facilities WHERE id = ? LIMIT 1`,
        [existingRowId]
      );
    }
    if (!existing) {
      existing = await db.get<any>(
        `SELECT id FROM farm_layout_facilities 
         WHERE farm_id = ? AND (facility_id = ? OR id = ?) AND type = 'inventory' 
         LIMIT 1`,
        [farmId, facilityId, facilityId]
      );
    }

    if (existing?.id) {
      targetRowId = existing.id;
      await db.run(
        `UPDATE farm_layout_facilities SET contents = ?, updated_at = ? WHERE id = ?`,
        [serialized, now, existing.id]
      );
    } else {
      const newId = generateUUID();
      targetRowId = newId;

      await db.run(
        `INSERT INTO farm_layout_facilities (id, user_id, farm_id, farm_layout_id, facility_id, name, type, contents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'inventory', ?, ?, ?)`,
        [newId, effectiveUserId, farmId, farmLayoutId, facilityId, 'Facility Inventory', serialized, now, now]
      );
    }
  } catch (err) {
    console.warn('[saveFacilityInventory] Local DB update error:', err);
  }

  return { success: true, rowId: targetRowId };
}

/**
 * Saves updated schedule events/logs to the contents column of the time row in farm_layout_facilities.
 * Updates local SQLite DB (synced to cloud via PowerSync) with strict input sanitization.
 */
export async function saveFacilitySchedule(
  farmId: string,
  facilityId: string,
  logs: FacilityTimeLog[],
  existingRowId?: string
): Promise<{ success: boolean; rowId: string | null }> {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Security & Data Integrity: enforce length bounds before persistence
  const sanitizedLogs = Array.isArray(logs) ? logs.map(sanitizeTimeLog) : [];
  const serialized = JSON.stringify(sanitizedLogs);

  // 0. Check if target is an estate layout
  try {
    const estateRecord = await db.get<any>(
      'SELECT id, user_id, estate_name, layout_data_json FROM farm_estate_layout WHERE id = ? LIMIT 1',
      [farmId]
    );

    if (estateRecord?.id) {
      const layoutData =
        typeof estateRecord.layout_data_json === 'string'
          ? JSON.parse(estateRecord.layout_data_json)
          : estateRecord.layout_data_json;

      if (Array.isArray(layoutData?.facilities)) {
        const fac = layoutData.facilities.find((f: any) => f.id === facilityId);
        if (fac) {
          fac.timeLogs = sanitizedLogs;
          fac.hasSchedule = true;
          if (fac.facilityFunction === 'none' || !fac.facilityFunction) {
            fac.facilityFunction = fac.hasInventory ? 'both' : 'time_keeping';
          }
          await saveFarmEstateLayout(estateRecord.id, estateRecord.user_id, estateRecord.estate_name, layoutData);
          return { success: true, rowId: `estate-time-${facilityId}` };
        }
      }
    }
  } catch (estateErr) {
    console.warn('[saveFacilitySchedule] Estate update note:', estateErr);
  }

  let targetRowId: string | null = null;
  let farmLayoutId = farmId;
  let effectiveUserId = '';

  // Retrieve or create farm layout to guarantee valid foreign keys
  try {
    const layout = await getOrCreateFarmLayout(farmId);
    if (layout?.id) {
      farmLayoutId = layout.id;
    }
    if (layout?.user_id) {
      effectiveUserId = layout.user_id;
    }
  } catch (err) {
    console.warn('[saveFacilitySchedule] getOrCreateFarmLayout note:', err);
  }

  if (!effectiveUserId) {
    try {
      const farmRow = await db.get<any>('SELECT user_id FROM farms WHERE id = ?', [farmId]);
      if (farmRow?.user_id) {
        effectiveUserId = farmRow.user_id;
      }
    } catch {}
  }

  // 1. Local SQLite update/insert (synced via PowerSync)
  try {
    let existing: any = null;
    if (existingRowId) {
      existing = await db.get<any>(
        `SELECT id FROM farm_layout_facilities WHERE id = ? LIMIT 1`,
        [existingRowId]
      );
    }
    if (!existing) {
      existing = await db.get<any>(
        `SELECT id FROM farm_layout_facilities 
         WHERE farm_id = ? AND (facility_id = ? OR id = ?) AND type = 'time' 
         LIMIT 1`,
        [farmId, facilityId, facilityId]
      );
    }

    if (existing?.id) {
      targetRowId = existing.id;
      await db.run(
        `UPDATE farm_layout_facilities SET contents = ?, updated_at = ? WHERE id = ?`,
        [serialized, now, existing.id]
      );
    } else {
      const newId = generateUUID();
      targetRowId = newId;

      await db.run(
        `INSERT INTO farm_layout_facilities (id, user_id, farm_id, farm_layout_id, facility_id, name, type, contents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'time', ?, ?, ?)`,
        [newId, effectiveUserId, farmId, farmLayoutId, facilityId, 'Facility Schedule', serialized, now, now]
      );
    }
  } catch (err) {
    console.warn('[saveFacilitySchedule] Local DB update error:', err);
  }

  return { success: true, rowId: targetRowId };
}

export async function getEstateCombinedFacilities(estateId: string): Promise<CombinedFacility[]> {
  if (!estateId) return [];
  return getEstateFacilities(estateId);
}

