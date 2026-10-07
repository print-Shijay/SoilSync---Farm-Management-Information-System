export { getDatabase, generateUUID, LocalDatabase } from './local-db';
import { getDatabase, generateUUID, LocalDatabase } from './local-db';
import { parseMaturityDays, loadCropDetails, type Crop } from './crop-planner';
import { supabase } from './supabase';
import {
  saveLocalCheckupCopy,
  uploadCheckupImageToSupabase,
  deleteCheckupImage,
  deleteFarmImages,
} from './checkup-storage';
import { deleteFolderImages } from './user-folder-storage';

export const SUCCESSION_PLAN_TODO_NOTE = 'Succession Plan';

export type FarmLayoutStructureKind = 'bed' | 'trellis';

export type FarmLayoutStructureCounts = {
  bed: number;
  trellis: number;
  [key: string]: number;
};

export type FarmLayoutBlueprintData = {
  version?: number;
  widthM?: number;
  heightM?: number;
  bounds?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  items?: {
    id?: string;
    label?: string;
    type: FarmLayoutStructureKind;
    x: number;
    z: number;
    rotationY?: number;
    widthM?: number;
    depthM?: number;
  }[];
  [key: string]: unknown;
};

export type FarmLayoutUnitySavePayload = {
  farmId: string;
  structureCounts: Partial<FarmLayoutStructureCounts>;
  blueprintData?: FarmLayoutBlueprintData;
  blueprintImagePath?: string | null;
  blueprintWidthM?: number | null;
  blueprintHeightM?: number | null;
  snapshotImagePaths?: string[];
  unityState?: Record<string, unknown>;
  debugPayloadPath?: string;
};

export type FarmRecord = {
  id: string;
  user_id: string;
  farm_name: string;
  location: string | null;
  area_sqm: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type FarmLayoutRecord = {
  id: string;
  user_id: string;
  farm_id: string;
  blueprint_data_json: string | null;
  blueprint_image_path: string | null;
  blueprint_width_m: number | null;
  blueprint_height_m: number | null;
  snapshot_image_paths_json: string | null;
  structure_counts_json: string | null;
  unity_state_json: string | null;
  created_at: string;
  updated_at: string;
};

export type TodoRecord = {
  id: string;
  user_id: string;
  farm_id: string;
  garden_structure_id: string | null;
  title: string;
  notes: string | null;
  start_date: string | null;
  due_date: string | null;
  is_completed: number;
  progress?: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TodoItem = Omit<TodoRecord, 'is_completed'> & {
  is_completed: boolean;
  progress: number;
};

export type TodoCommentItem = {
  id: string;
  todo_id: string;
  user_id: string;
  farm_id: string;
  comment: string;
  created_at: string;
  updated_at?: string;
  user_name?: string;
  user_avatar?: string;
  user_profile_icon?: string;
};

export type CropRotationSeason = 'Both' | 'Dry Season' | 'Wet Season';

export type CropRotationPlanData = {
  id?: string;
  version: 1;
  durationMonths: string;
  durationDays?: number;
  season: CropRotationSeason;
  startDate: string;
  totalAvailableDays: number;
  selectedCrops: Crop[];
  targetPlots?: string[];
  milestoneMode?: 'system' | 'custom';
  status?: 'ongoing' | 'finished' | 'completed' | 'terminated';
  completedAt?: string;
  terminatedAt?: string;
  terminationReason?: string;
  archivedAt?: string;
};

type FarmSuccessionPlanRecord = {
  id: string;
  user_id: string;
  farm_id: string;
  plan_data_json: string | CropRotationPlanData | null;
  created_at: string;
  updated_at: string;
};

type CropMilestone = {
  label?: 'preparation' | 'growth' | 'checkup' | string;
  offset_days: number;
  title: string;
  description: string;
};

type CropWithMilestones = Crop & {
  milestones?: CropMilestone[];
};

type CropRotationPlanDataWithMilestones = Omit<CropRotationPlanData, 'selectedCrops'> & {
  selectedCrops: CropWithMilestones[];
};

function parseJsonValue<T>(jsonValue: unknown, fallback: T): T {
  if (jsonValue === null || jsonValue === undefined || jsonValue === '') {
    return fallback;
  }

  if (typeof jsonValue !== 'string') {
    return jsonValue as T;
  }

  try {
    return JSON.parse(jsonValue) as T;
  } catch (error) {
    console.warn('Failed to parse local JSON value:', error);
    return fallback;
  }
}

function normalizeStructureCount(value: unknown) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.floor(numericValue));
}

function normalizeStructureCounts(
  counts?: Partial<FarmLayoutStructureCounts> | null
): FarmLayoutStructureCounts {
  return {
    bed: normalizeStructureCount(counts?.bed),
    trellis: normalizeStructureCount(counts?.trellis),
  };
}

function normalizeFarmLayout(record: FarmLayoutRecord) {
  return {
    ...record,
    blueprintData: parseJsonValue<FarmLayoutBlueprintData>(record.blueprint_data_json, {}),
    snapshotImagePaths: parseJsonValue<string[]>(record.snapshot_image_paths_json, []),
    structureCounts: normalizeStructureCounts(
      parseJsonValue<Partial<FarmLayoutStructureCounts>>(record.structure_counts_json, {
        bed: 0,
        trellis: 0,
      })
    ),
    unityState: parseJsonValue<Record<string, unknown>>(record.unity_state_json, {}),
  };
}

function normalizeTodo(record: TodoRecord): TodoItem {
  const isCompleted = Boolean(record.is_completed);
  const progress =
    typeof record.progress === 'number'
      ? Math.max(0, Math.min(100, Math.round(record.progress)))
      : isCompleted
        ? 100
        : 0;

  return {
    ...record,
    is_completed: isCompleted,
    progress,
  };
}

function getDateKey(value: string) {
  const dateKeyMatch = value.match(/^\d{4}-\d{2}-\d{2}/);

  if (dateKeyMatch) {
    return dateKeyMatch[0];
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsedDate.toISOString().slice(0, 10);
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = getDateKey(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function getMilestoneDurationDays(milestones: CropMilestone[], fallbackDays: number) {
  if (milestones.length === 0) {
    return fallbackDays;
  }

  const maxOffset = Math.max(...milestones.map((milestone) => Number(milestone.offset_days) || 0));

  return maxOffset + 1;
}

function normalizeFarmSuccessionPlan(record: FarmSuccessionPlanRecord) {
  const rawPlanData = parseJsonValue<any>(record.plan_data_json, null);

  const enrichPlanCrops = (plan: CropRotationPlanData): CropRotationPlanData => {
    if (!plan || !Array.isArray(plan.selectedCrops)) return plan;
    const isCustomPlan = (plan as any).milestoneMode === 'custom';
    return {
      ...plan,
      selectedCrops: plan.selectedCrops.map((crop) => {
        if (isCustomPlan || crop.milestone_mode === 'custom') {
          return {
            ...crop,
            milestones: Array.isArray(crop.milestones) ? crop.milestones : [],
          };
        }
        if (crop.milestones && crop.milestones.length > 0) return crop;
        const details = loadCropDetails(crop);
        return {
          ...crop,
          milestones: details.milestones ?? [],
        };
      }),
    };
  };

  let planData: any = rawPlanData;
  let historicalPlans: any[] = [];
  if (Array.isArray(rawPlanData)) {
    planData = rawPlanData.map(enrichPlanCrops);
  } else if (rawPlanData && typeof rawPlanData === 'object') {
    if (Array.isArray(rawPlanData.activePlans)) {
      planData = rawPlanData.activePlans.map(enrichPlanCrops);
      historicalPlans = Array.isArray(rawPlanData.historicalPlans)
        ? rawPlanData.historicalPlans.map(enrichPlanCrops)
        : [];
    } else {
      planData = enrichPlanCrops(rawPlanData);
    }
  }

  return {
    ...record,
    planData,
    historicalPlans,
  };
}

function getStructureTypeId(kind: FarmLayoutStructureKind) {
  return kind === 'bed' ? 1 : 2;
}

function getStructureLabel(kind: FarmLayoutStructureKind, index: number) {
  return `${kind === 'bed' ? 'Bed' : 'Trellis'} ${index + 1}`;
}

export async function logFarmAuditAction(
  db: any,
  farmId: string,
  userId: string,
  action: string,
  details: Record<string, unknown> = {}
) {
  try {
    const farm = await db.get('SELECT user_id FROM farms WHERE id = ?', [farmId]);
    const farmOwnerId = farm?.user_id || userId;

    await db.run(
      `INSERT INTO audit_logs (
        id,
        farm_id,
        farm_owner_id,
        user_id,
        action,
        details,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [generateUUID(), farmId, farmOwnerId, userId, action, JSON.stringify(details)]
    );
  } catch (error) {
    console.warn('[LocalDB] Failed to log farm audit action:', error);
  }
}

// ============================================================
// USER OPERATIONS
// ============================================================

export async function createUser(
  userId: string,
  email: string,
  firstName: string,
  lastName: string
) {
  const db = getDatabase();

  await db.run(
    `INSERT OR REPLACE INTO users (id, email, first_name, last_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [userId, email, firstName, lastName]
  );

  console.log('[LocalDB] User stored locally:', userId);
}

export async function getUser(userId: string) {
  const db = getDatabase();
  return db.get('SELECT * FROM users WHERE id = ?', [userId]);
}

// ============================================================
// FARM OPERATIONS
// ============================================================

export const MAX_FARMS_PER_ACCOUNT = 10;

export async function createFarm(
  userId: string,
  farmName: string,
  location?: string,
  areaSqm?: number,
  description?: string
) {
  const db = getDatabase();

  const existingFarms = await getFarmsByUser(userId);
  if (existingFarms.length >= MAX_FARMS_PER_ACCOUNT) {
    throw new Error(
      `Farm limit reached. Maximum allowed is ${MAX_FARMS_PER_ACCOUNT} farms per account.`
    );
  }

  const farmId = generateUUID();

  await db.run(
    `INSERT INTO farms (
      id,
      user_id,
      farm_name,
      location,
      area_sqm,
      description,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [farmId, userId, farmName, location ?? null, areaSqm ?? null, description ?? null]
  );

  await logFarmAuditAction(db, farmId, userId, 'CREATED_FARM', { farmName });

  console.log('[LocalDB] Farm created:', farmId);
  return farmId;
}

export async function getFarmsByUser(userId: string) {
  const db = getDatabase();
  const result = await db.all<FarmRecord>(
    `SELECT DISTINCT f.*
     FROM farms f
     LEFT JOIN team_farms tf ON tf.farm_id = f.id
     LEFT JOIN team_members tm ON tm.team_id = tf.team_id AND tm.user_id = ? AND tm.status = 'accepted'
     WHERE f.user_id = ? OR tm.id IS NOT NULL
     ORDER BY f.created_at DESC`,
    [userId, userId]
  );

  return result || [];
}

export async function getOwnedFarmsByUser(userId: string): Promise<FarmRecord[]> {
  const db = getDatabase();
  try {
    const result = await db.all<FarmRecord>(
      `SELECT * FROM farms WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    return result || [];
  } catch (err) {
    console.warn('[LocalDB] getOwnedFarmsByUser error:', err);
    return [];
  }
}

export async function getFarm(farmId: string) {
  const db = getDatabase();
  return db.get<FarmRecord>('SELECT * FROM farms WHERE id = ?', [farmId]);
}

export async function isUserFarmMemberOrOwner(farmId: string, userId: string): Promise<boolean> {
  if (!farmId || !userId) return false;
  const db = getDatabase();
  try {
    const farm = await db.get<FarmRecord>('SELECT user_id FROM farms WHERE id = ?', [farmId]);
    if (!farm) return false;
    if (farm.user_id && farm.user_id.toLowerCase() === userId.toLowerCase()) {
      return true;
    }

    const member = await db.get<{ id: string }>(
      `SELECT tm.id FROM team_members tm
       JOIN team_farms tf ON tf.team_id = tm.team_id
       WHERE tf.farm_id = ? AND tm.user_id = ? AND tm.status = 'accepted'`,
      [farmId, userId]
    );
    return Boolean(member);
  } catch (err) {
    console.warn('[LocalDB] isUserFarmMemberOrOwner check error:', err);
    return false;
  }
}

export async function updateFarm(
  farmId: string,
  updates: { farmName?: string; location?: string; areaSqm?: number; description?: string }
) {
  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.farmName !== undefined) {
    fields.push('farm_name = ?');
    values.push(updates.farmName);
  }

  if (updates.location !== undefined) {
    fields.push('location = ?');
    values.push(updates.location);
  }

  if (updates.areaSqm !== undefined) {
    fields.push('area_sqm = ?');
    values.push(updates.areaSqm);
  }

  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }

  fields.push('updated_at = datetime("now")');
  values.push(farmId);

  await db.run(`UPDATE farms SET ${fields.join(', ')} WHERE id = ?`, values);

  const farm = await db.get('SELECT user_id FROM farms WHERE id = ?', [farmId]);
  if (farm) {
    // Attempt to log the update. Since we don't know the exact user who triggered this 
    // without changing the function signature, we'll assign the farm owner's ID or system.
    await logFarmAuditAction(db, farmId, farm.user_id, 'UPDATED_FARM', updates);
  }

  console.log('[LocalDB] Farm updated:', farmId);
}

export async function deleteFarm(farmId: string, userId?: string) {
  const db = getDatabase();

  // 1. Collect all checkup and daily report image URIs before deleting records
  let imageUris: string[] = [];
  try {
    const checkupRows = await db.all<{ image_uri: string }>(
      'SELECT image_uri FROM farm_checkup_results WHERE farm_id = ? AND image_uri IS NOT NULL',
      [farmId]
    );
    const reportRows = await db.all<{ image_uri: string }>(
      'SELECT image_uri FROM farm_daily_reports WHERE farm_id = ? AND image_uri IS NOT NULL',
      [farmId]
    );
    imageUris = [
      ...checkupRows.map((r) => r.image_uri),
      ...reportRows.map((r) => r.image_uri),
    ];
  } catch (err) {
    console.warn('[LocalDB] Could not collect farm images for deletion:', err);
  }

  // 2. Perform cascade DB deletion in local SQLite
  await db.transaction(async (tx) => {
    const farm = await tx.get('SELECT user_id FROM farms WHERE id = ?', [farmId]);
    if (farm) {
      await logFarmAuditAction(tx, farmId, userId || farm.user_id, 'DELETED_FARM', {});
    }

    await tx.run(
      `DELETE FROM crop_cycles
       WHERE garden_structure_id IN (
         SELECT gs.id
         FROM garden_structures gs
         INNER JOIN farm_layouts fl ON fl.id = gs.farm_layout_id
         WHERE fl.farm_id = ?
       )`,
      [farmId]
    );
    await tx.run(
      `DELETE FROM garden_structures
       WHERE farm_layout_id IN (SELECT id FROM farm_layouts WHERE farm_id = ?)`,
      [farmId]
    );
    await tx.run('DELETE FROM todos WHERE farm_id = ?', [farmId]);
    await tx.run('DELETE FROM farm_succession_plans WHERE farm_id = ?', [farmId]);
    await tx.run('DELETE FROM farm_checkup_results WHERE farm_id = ?', [farmId]);
    await tx.run('DELETE FROM farm_daily_reports WHERE farm_id = ?', [farmId]);
    try {
      await tx.run('DELETE FROM farm_layout_facilities WHERE farm_id = ?', [farmId]);
    } catch {
      // Table might not exist on older clients
    }
    try {
      await tx.run('DELETE FROM team_farms WHERE farm_id = ?', [farmId]);
    } catch {
      // Table might not exist or already clean
    }
    await tx.run('DELETE FROM farm_layouts WHERE farm_id = ?', [farmId]);
    await tx.run('DELETE FROM farms WHERE id = ?', [farmId]);
  });

  // 3. Asynchronously remove images from Supabase Storage and local disk to free space
  if (imageUris.length > 0) {
    void deleteFarmImages(imageUris);
  }

  console.log('[LocalDB] Farm hard deleted and storage cleaned:', farmId);
}

// ============================================================
// FARM LAYOUT OPERATIONS
// ============================================================

export async function getOrCreateFarmLayout(farmId: string) {
  const db = getDatabase();
  const existingLayout = await db.get<FarmLayoutRecord>(
    'SELECT * FROM farm_layouts WHERE farm_id = ?',
    [farmId]
  );

  if (existingLayout) {
    console.log('[UnitySave][LocalDB] Found existing local farm_layout.', {
      farmId,
      layoutId: existingLayout.id,
    });
    return normalizeFarmLayout(existingLayout);
  }

  const farm = await db.get<FarmRecord>('SELECT * FROM farms WHERE id = ?', [farmId]);

  if (!farm) {
    throw new Error('Cannot create a farm layout for a missing farm.');
  }

  const layoutId = generateUUID();

  await db.run(
    `INSERT INTO farm_layouts (
      id,
      user_id,
      farm_id,
      blueprint_data_json,
      snapshot_image_paths_json,
      structure_counts_json,
      unity_state_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, '{}', '[]', '{"bed":0,"trellis":0}', '{}', datetime('now'), datetime('now'))`,
    [layoutId, farm.user_id, farmId]
  );

  console.log('[UnitySave][LocalDB] Local database stored new farm_layout.', {
    farmId,
    layoutId,
  });

  const createdLayout = await db.get<FarmLayoutRecord>('SELECT * FROM farm_layouts WHERE id = ?', [
    layoutId,
  ]);

  if (!createdLayout) {
    throw new Error('Farm layout was not found after local creation.');
  }

  return normalizeFarmLayout(createdLayout);
}

export async function getFarmLayoutWithStructures(farmId: string) {
  const layout = await getOrCreateFarmLayout(farmId);
  const db = getDatabase();
  const structures = await getGardenStructuresForLayout(db, layout.id);

  return {
    ...layout,
    structures: structures || [],
  };
}

async function getGardenStructuresForLayout(db: LocalDatabase, layoutId: string) {
  return db.all(
    `SELECT
       gs.*,
       gst.type_name,
       gst.default_width_m,
       gst.default_length_m
     FROM garden_structures gs
     LEFT JOIN garden_structure_types gst ON gst.id = gs.structure_type_id
     WHERE gs.farm_layout_id = ?
     ORDER BY gs.display_order ASC, gs.created_at ASC`,
    [layoutId]
  );
}

export async function getExistingFarmLayoutWithStructures(farmId: string) {
  const db = getDatabase();
  const existingLayout = await db.get<FarmLayoutRecord>(
    'SELECT * FROM farm_layouts WHERE farm_id = ?',
    [farmId]
  );

  if (!existingLayout) {
    return null;
  }

  const layout = normalizeFarmLayout(existingLayout);
  const structures = await getGardenStructuresForLayout(db, layout.id);

  return {
    ...layout,
    structures: structures || [],
  };
}

export async function getAvailableFarmPlots(farmId: string) {
  const db = getDatabase();
  const existingLayout = await db.get<FarmLayoutRecord>(
    'SELECT * FROM farm_layouts WHERE farm_id = ?',
    [farmId]
  );

  if (!existingLayout) {
    return [];
  }

  // Fetch garden structures that are NOT currently occupied by an active/planned crop cycle
  return (
    db.all<{ id: string; label: string | null; type_name: string }>(
      `SELECT gs.id, gs.label, gst.type_name
     FROM garden_structures gs
     LEFT JOIN garden_structure_types gst ON gst.id = gs.structure_type_id
     WHERE gs.farm_layout_id = ? 
     AND gs.id NOT IN (
       SELECT garden_structure_id 
       FROM crop_cycles 
       WHERE status IN ('planned', 'active')
       AND garden_structure_id IS NOT NULL
     )
     AND gs.id NOT IN (
       SELECT garden_structure_id
       FROM todos
       WHERE is_completed = 0
       AND garden_structure_id IS NOT NULL
       AND (notes = '${SUCCESSION_PLAN_TODO_NOTE}' OR notes LIKE '%[${SUCCESSION_PLAN_TODO_NOTE}]%')
     )
     ORDER BY gs.display_order ASC, gs.created_at ASC`,
      [existingLayout.id]
    ) || []
  );
}

export async function saveFarmLayoutFromUnity(payload: FarmLayoutUnitySavePayload) {
  const db = getDatabase();
  console.log('[UnitySave][LocalDB] Saving Unity payload to local SQLite database.', {
    farmId: payload.farmId,
    bedCount: payload.structureCounts?.bed ?? 0,
    trellisCount: payload.structureCounts?.trellis ?? 0,
    blueprintItems: payload.blueprintData?.items?.length ?? 0,
    snapshotCount: payload.snapshotImagePaths?.length ?? 0,
  });

  const layout = await getOrCreateFarmLayout(payload.farmId);
  const structureCounts = normalizeStructureCounts(payload.structureCounts);
  const blueprintData = payload.blueprintData ?? {};
  const snapshotImagePaths = Array.isArray(payload.snapshotImagePaths)
    ? payload.snapshotImagePaths
    : [];
  const unityState = payload.unityState ?? {};

  await db.transaction(async (tx) => {
    await tx.run(
      `DELETE FROM crop_cycles
       WHERE garden_structure_id IN (
         SELECT id FROM garden_structures WHERE farm_layout_id = ?
       )`,
      [layout.id]
    );
    await tx.run('DELETE FROM garden_structures WHERE farm_layout_id = ?', [layout.id]);

    await tx.run(
      `UPDATE farm_layouts SET
        blueprint_data_json = ?,
        blueprint_image_path = ?,
        blueprint_width_m = ?,
        blueprint_height_m = ?,
        snapshot_image_paths_json = ?,
        structure_counts_json = ?,
        unity_state_json = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        JSON.stringify(blueprintData),
        payload.blueprintImagePath ?? null,
        payload.blueprintWidthM ?? blueprintData.widthM ?? null,
        payload.blueprintHeightM ?? blueprintData.heightM ?? null,
        JSON.stringify(snapshotImagePaths),
        JSON.stringify(structureCounts),
        JSON.stringify(unityState),
        layout.id,
      ]
    );

    let displayOrder = 0;
    const structureKinds: FarmLayoutStructureKind[] = ['bed', 'trellis'];

    for (const kind of structureKinds) {
      for (let index = 0; index < structureCounts[kind]; index += 1) {
        const gardenStructureId = generateUUID();
        const label = getStructureLabel(kind, index);

        await tx.run(
          `INSERT INTO garden_structures (
            id,
            user_id,
            farm_layout_id,
            structure_type_id,
            label,
            display_order,
            status,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'empty', datetime('now'), datetime('now'))`,
          [
            gardenStructureId,
            layout.user_id,
            layout.id,
            getStructureTypeId(kind),
            label,
            displayOrder,
          ]
        );

        displayOrder += 1;
      }
    }

    await logFarmAuditAction(tx, payload.farmId, layout.user_id, 'UPDATED_LAYOUT', {
      bedCount: structureCounts.bed,
      trellisCount: structureCounts.trellis,
    });
  });

  const savedLayout = await getFarmLayoutWithStructures(payload.farmId);

  console.log('[UnitySave][LocalDB] Completed local farm layout save.', {
    farmId: payload.farmId,
    layoutId: savedLayout.id,
    structureRows: savedLayout.structures?.length ?? 0,
    bedCount: savedLayout.structureCounts?.bed ?? 0,
    trellisCount: savedLayout.structureCounts?.trellis ?? 0,
    snapshotCount: savedLayout.snapshotImagePaths?.length ?? 0,
  });

  return savedLayout;
}

// ============================================================
// FARM SUCCESSION PLAN OPERATIONS
// ============================================================

export async function getFarmSuccessionPlan(farmId: string) {
  const db = getDatabase();
  const row = await db.get<FarmSuccessionPlanRecord>(
    'SELECT * FROM farm_succession_plans WHERE farm_id = ?',
    [farmId]
  );
  if (!row) return null;

  try {
    const raw = parseJsonValue<any>(row.plan_data_json, null);
    if (raw) {
      let needsUpdate = false;
      if (Array.isArray(raw)) {
        raw.forEach((p) => {
          if (!p.id) {
            p.id = generateUUID();
            needsUpdate = true;
          }
        });
      } else if (raw && typeof raw === 'object' && Array.isArray(raw.activePlans)) {
        raw.activePlans.forEach((p: any) => {
          if (!p.id) {
            p.id = generateUUID();
            needsUpdate = true;
          }
        });
      }
      if (needsUpdate) {
        const updatedJson = JSON.stringify(raw);
        await db.run(
          `UPDATE farm_succession_plans SET plan_data_json = ?, updated_at = datetime('now') WHERE farm_id = ?`,
          [updatedJson, farmId]
        );
        row.plan_data_json = updatedJson;
      }
    }
  } catch (err) {
    console.warn('[LocalDB] Failed to backfill plan IDs:', err);
  }

  return normalizeFarmSuccessionPlan(row);
}

export async function deleteFarmSuccessionPlan(farmId: string) {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.run(
      'DELETE FROM todos WHERE farm_id = ? AND (notes = ? OR notes LIKE ? OR notes LIKE ? OR title LIKE ?)',
      [
        farmId,
        SUCCESSION_PLAN_TODO_NOTE,
        `%[${SUCCESSION_PLAN_TODO_NOTE}]%`,
        '%[PlanRef:%',
        'Mitigation:%',
      ]
    );
    await tx.run('DELETE FROM farm_succession_plans WHERE farm_id = ?', [farmId]);
  });
}

// export async function saveFarmRotationPlan(params: {
//   userId: string;
//   farmId: string;
//   planData: CropRotationPlanData;
// }) {
//   const db = getDatabase();
//   const existingPlan = await db.get<FarmSuccessionPlanRecord>(
//     'SELECT * FROM farm_succession_plans WHERE farm_id = ?',
//     [params.farmId]
//   );
//   const planData = {
//     ...params.planData,
//     startDate: getDateKey(params.planData.startDate),
//   };
//   const planDataJson = JSON.stringify(planData);

//   await db.transaction(async (tx) => {
//     await tx.run('DELETE FROM todos WHERE farm_id = ? AND notes = ?', [
//       params.farmId,
//       SUCCESSION_PLAN_TODO_NOTE,
//     ]);

//     let currentOffsetDays = 0;

//     for (const crop of planData.selectedCrops) {
//       const maturityDays = parseMaturityDays(crop.maturity_days) || 30;
//       const startDate = addDaysToDateKey(planData.startDate, currentOffsetDays);
//       const dueDate = addDaysToDateKey(planData.startDate, currentOffsetDays + maturityDays);

//       await tx.run(
//         `INSERT INTO todos (
//           id,
//           user_id,
//           farm_id,
//           garden_structure_id,
//           title,
//           notes,
//           start_date,
//           due_date,
//           is_completed,
//           created_at,
//           updated_at
//         ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
//         [
//           generateUUID(),
//           params.userId,
//           params.farmId,
//           crop.crop,
//           SUCCESSION_PLAN_TODO_NOTE,
//           startDate,
//           dueDate,
//         ]
//       );

//       currentOffsetDays += maturityDays;
//     }

//     if (existingPlan) {
//       await tx.run(
//         `UPDATE farm_succession_plans
//          SET plan_data_json = ?, updated_at = datetime('now')
//          WHERE farm_id = ?`,
//         [planDataJson, params.farmId]
//       );
//     } else {
//       await tx.run(
//         `INSERT INTO farm_succession_plans (
//           id,
//           user_id,
//           farm_id,
//           plan_data_json,
//           created_at,
//           updated_at
//         ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
//         [generateUUID(), params.userId, params.farmId, planDataJson]
//       );
//     }
//   });
// }

// ============================================================
// TODO OPERATIONS
// ============================================================

export async function saveFarmRotationPlan(params: {
  userId: string;
  farmId: string;
  planData: CropRotationPlanDataWithMilestones;
}) {
  const db = getDatabase();
  const existingPlan = await db.get<FarmSuccessionPlanRecord>(
    'SELECT * FROM farm_succession_plans WHERE farm_id = ?',
    [params.farmId]
  );
  const planData: CropRotationPlanDataWithMilestones = {
    ...params.planData,
    id: params.planData.id || generateUUID(),
    startDate: getDateKey(params.planData.startDate),
  };
  const planId = planData.id;

  await db.transaction(async (tx) => {
    // Delete old tasks for specific target plots (or general if none specified)
    if (planData.targetPlots && planData.targetPlots.length > 0) {
      for (const plotId of planData.targetPlots) {
        await tx.run(
          'DELETE FROM todos WHERE farm_id = ? AND garden_structure_id = ? AND (notes = ? OR notes LIKE ? OR notes LIKE ? OR title LIKE ?)',
          [
            params.farmId,
            plotId,
            SUCCESSION_PLAN_TODO_NOTE,
            `%[${SUCCESSION_PLAN_TODO_NOTE}]%`,
            '%[PlanRef:%',
            'Mitigation:%',
          ]
        );
      }
    } else {
      await tx.run(
        'DELETE FROM todos WHERE farm_id = ? AND garden_structure_id IS NULL AND (notes = ? OR notes LIKE ? OR notes LIKE ? OR title LIKE ?)',
        [
          params.farmId,
          SUCCESSION_PLAN_TODO_NOTE,
          `%[${SUCCESSION_PLAN_TODO_NOTE}]%`,
          '%[PlanRef:%',
          'Mitigation:%',
        ]
      );
    }

    let currentPlantingDateOffset = 0;
    const targetPlots =
      planData.targetPlots && planData.targetPlots.length > 0 ? planData.targetPlots : [null];

    for (const [cropIndex, crop] of planData.selectedCrops.entries()) {
      const milestones: CropMilestone[] = Array.isArray(crop.milestones) ? crop.milestones : [];
      const fallbackCropDurationDays = parseMaturityDays(crop.maturity_days) || 30;
      const cropDurationDays = getMilestoneDurationDays(milestones, fallbackCropDurationDays);

      // Preparation tasks rule:
      // For 2nd crop and above, count how many tasks are labeled 'preparation'.
      // Subtract this count from the initial planting date offset so preparation begins before planting.
      // For the first crop (cropIndex === 0), tasks start on the plan's startDate.
      const prepCount =
        cropIndex === 0
          ? 0
          : milestones.filter(
              (m) => String(m.label).trim().toLowerCase() === 'preparation'
            ).length;
      const cropStartOffsetDays = currentPlantingDateOffset - prepCount;

      for (const plotId of targetPlots) {
        if (milestones.length > 0) {
          for (const milestone of milestones) {
            const rawOffset = Number(milestone.offset_days) || 0;
            const milestoneOffsetDays = cropStartOffsetDays + rawOffset;
            const taskDate = addDaysToDateKey(planData.startDate, milestoneOffsetDays);
            const taskTitle =
              milestone.label === 'checkup'
                ? `Check-up : ${milestone.title}`
                : `${crop.crop}: ${milestone.title}`;
            const taskNotes = `${milestone.description}\n\nPhase: ${
              milestone.label ?? 'growth'
            }\n\n[${SUCCESSION_PLAN_TODO_NOTE}]\n[PlanRef:${planId}]`;

            await tx.run(
              `INSERT INTO todos (
                id,
                user_id,
                farm_id,
                garden_structure_id,
                title,
                notes,
                start_date,
                due_date,
                is_completed,
                created_at,
                updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
              [
                generateUUID(),
                params.userId,
                params.farmId,
                plotId,
                taskTitle,
                taskNotes,
                taskDate,
                taskDate,
              ]
            );
          }
        } else {
          const fallbackStartDate = addDaysToDateKey(planData.startDate, cropStartOffsetDays);
          const fallbackDueDate = addDaysToDateKey(
            planData.startDate,
            cropStartOffsetDays + cropDurationDays
          );

          await tx.run(
            `INSERT INTO todos (
               id, user_id, farm_id, garden_structure_id, title, notes, start_date, due_date, is_completed, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
            [
              generateUUID(),
              params.userId,
              params.farmId,
              plotId,
              `Plant ${crop.crop}`,
              `No daily tasks found for this crop.\n\n[${SUCCESSION_PLAN_TODO_NOTE}]\n[PlanRef:${planId}]`,
              fallbackStartDate,
              fallbackDueDate,
            ]
          );
        }
      }

      currentPlantingDateOffset += Math.max(cropDurationDays, 1);
    }

    // Process plan data for JSON storage
    const storedPlanData: CropRotationPlanDataWithMilestones = {
      ...planData,
      id: planData.id || generateUUID(),
      selectedCrops: planData.selectedCrops.map((crop) => ({
        ...crop,
        milestones: Array.isArray(crop.milestones) ? crop.milestones : [],
      })),
    };

    if (existingPlan) {
      let mergedPlanDataList: CropRotationPlanData[] = [];
      let historicalPlans: any[] = [];
      const existingData = existingPlan.plan_data_json
        ? parseJsonValue<any>(existingPlan.plan_data_json, null)
        : null;

      if (Array.isArray(existingData)) {
        mergedPlanDataList = existingData;
      } else if (existingData && typeof existingData === 'object') {
        mergedPlanDataList = Array.isArray(existingData.activePlans)
          ? existingData.activePlans
          : [];
        historicalPlans = Array.isArray(existingData.historicalPlans)
          ? existingData.historicalPlans
          : [];
      } else if (existingData) {
        mergedPlanDataList = [existingData];
      }

      // If this new plan targets specific plots, archive replaced plans to historicalPlans
      if (storedPlanData.targetPlots && storedPlanData.targetPlots.length > 0) {
        const newPlotSet = new Set(storedPlanData.targetPlots);
        const replacedPlans: any[] = [];
        mergedPlanDataList = mergedPlanDataList.filter((p) => {
          if (!p.targetPlots) return true; // Keep old general plans
          const overlaps = p.targetPlots.some((plotId) => newPlotSet.has(plotId));
          if (overlaps) {
            replacedPlans.push({
              ...p,
              status: p.status || 'completed',
              completedAt: p.completedAt || new Date().toISOString(),
              archivedAt: new Date().toISOString(),
            });
            return false;
          }
          return true;
        });
        historicalPlans = [...replacedPlans, ...historicalPlans];
      } else {
        // If this is a general plan, overwrite old general plans
        mergedPlanDataList = mergedPlanDataList.filter(
          (p) => p.targetPlots && p.targetPlots.length > 0
        );
      }

      mergedPlanDataList.push(storedPlanData);
      mergedPlanDataList = mergedPlanDataList.map((p) => ({
        ...p,
        id: p.id || generateUUID(),
      }));

      const container = {
        activePlans: mergedPlanDataList,
        historicalPlans,
      };

      await tx.run(
        `UPDATE farm_succession_plans
         SET plan_data_json = ?, updated_at = datetime('now')
         WHERE farm_id = ?`,
        [JSON.stringify(container), params.farmId]
      );
    } else {
      const container = {
        activePlans: [storedPlanData],
        historicalPlans: [],
      };
      await tx.run(
        `INSERT INTO farm_succession_plans (
          id,
          user_id,
          farm_id,
          plan_data_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [generateUUID(), params.userId, params.farmId, JSON.stringify(container)]
      );
    }

    let plotLabels: string[] = [];
    if (planData.targetPlots && planData.targetPlots.length > 0) {
      const plots = await tx.all(
        `SELECT label FROM garden_structures WHERE id IN (${planData.targetPlots.map(() => '?').join(',')})`,
        planData.targetPlots
      );
      plotLabels = plots.map((p: any) => p.label).filter(Boolean);
    }

    await logFarmAuditAction(tx, params.farmId, params.userId, 'GENERATED_CROP_PLAN', {
      cropsCount: planData.selectedCrops.length,
      season: planData.season,
      durationMonths: planData.durationMonths,
      targetPlots: plotLabels,
    });
  });
}

export async function deleteAllFarmRotationPlans(farmId: string, userId?: string) {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM farm_succession_plans WHERE farm_id = ?', [farmId]);
    await tx.run(
      'DELETE FROM todos WHERE farm_id = ? AND (notes = ? OR notes LIKE ? OR notes LIKE ? OR title LIKE ? OR notes LIKE ?)',
      [
        farmId,
        SUCCESSION_PLAN_TODO_NOTE,
        `%[${SUCCESSION_PLAN_TODO_NOTE}]%`,
        '%[PlanRef:%',
        'Mitigation:%',
        '%Phase: mitigation%',
      ]
    );

    // Also clear planned and active crop_cycles on this farm's layouts to fully free all plots
    const layout = await tx.get<{ id: string }>('SELECT id FROM farm_layouts WHERE farm_id = ?', [farmId]);
    if (layout) {
      await tx.run(
        `DELETE FROM crop_cycles 
         WHERE garden_structure_id IN (
           SELECT id FROM garden_structures WHERE farm_layout_id = ?
         ) AND status IN ('planned', 'active')`,
        [layout.id]
      );
    }

    const farm = await tx.get('SELECT user_id FROM farms WHERE id = ?', [farmId]);
    if (farm) {
      await logFarmAuditAction(tx, farmId, userId || farm.user_id, 'CLEARED_CROP_PLANS', {});
    }
  });
}

export async function deleteFarmRotationPlan(
  farmId: string,
  planId: string,
  userId?: string,
  targetPlots?: string[]
) {
  const db = getDatabase();

  const existingPlan = await db.get<FarmSuccessionPlanRecord>(
    'SELECT * FROM farm_succession_plans WHERE farm_id = ?',
    [farmId]
  );
  if (!existingPlan) return;

  const existingData = existingPlan.plan_data_json
    ? parseJsonValue<any>(existingPlan.plan_data_json, null)
    : null;
  if (!existingData) return;

  let activePlans: CropRotationPlanData[] = [];
  let historicalPlans: any[] = [];

  if (Array.isArray(existingData)) {
    activePlans = existingData;
  } else if (existingData && typeof existingData === 'object') {
    activePlans = Array.isArray(existingData.activePlans)
      ? existingData.activePlans
      : [];
    historicalPlans = Array.isArray(existingData.historicalPlans)
      ? existingData.historicalPlans
      : [];
  } else if (existingData) {
    activePlans = [existingData];
  }

  // Match target plan by:
  // 1. Exact ID
  // 2. Overlapping target plots
  // 3. Temporary index plan-${idx}-
  // 4. Fallback if only 1 plan exists
  let targetPlan: CropRotationPlanData | null = null;
  if (planId) {
    targetPlan = activePlans.find((p) => p.id === planId) || null;
  }
  if (!targetPlan && targetPlots && targetPlots.length > 0) {
    targetPlan =
      activePlans.find((p) =>
        p.targetPlots?.some((plotId) => targetPlots.includes(plotId))
      ) || null;
  }
  if (!targetPlan && planId && planId.startsWith('plan-')) {
    const match = planId.match(/^plan-(\d+)-/);
    if (match) {
      const idx = Number.parseInt(match[1], 10);
      if (activePlans[idx]) {
        targetPlan = activePlans[idx];
      }
    }
  }
  if (!targetPlan && activePlans.length === 1) {
    targetPlan = activePlans[0];
  }

  // Filter out the target plan to delete
  const updatedPlanList = activePlans.filter((p) =>
    targetPlan ? p !== targetPlan : (p.id ? p.id !== planId : true)
  );

  const resolvedPlanId = targetPlan?.id || planId;
  const resolvedTargetPlots = targetPlan?.targetPlots || targetPlots || [];

  await db.transaction(async (tx) => {
    if (updatedPlanList.length === 0 && historicalPlans.length === 0) {
      await tx.run('DELETE FROM farm_succession_plans WHERE farm_id = ?', [farmId]);
      // If no plans remain on the farm, also clean up all succession and mitigation tasks for the farm
      await tx.run(
        'DELETE FROM todos WHERE farm_id = ? AND (notes = ? OR notes LIKE ? OR notes LIKE ? OR title LIKE ? OR notes LIKE ?)',
        [
          farmId,
          SUCCESSION_PLAN_TODO_NOTE,
          `%[${SUCCESSION_PLAN_TODO_NOTE}]%`,
          '%[PlanRef:%',
          'Mitigation:%',
          '%Phase: mitigation%',
        ]
      );

      // Also clear any active or planned crop cycles for the farm
      const layout = await tx.get<{ id: string }>('SELECT id FROM farm_layouts WHERE farm_id = ?', [farmId]);
      if (layout) {
        await tx.run(
          `DELETE FROM crop_cycles 
           WHERE garden_structure_id IN (
             SELECT id FROM garden_structures WHERE farm_layout_id = ?
           ) AND status IN ('planned', 'active')`,
          [layout.id]
        );
      }
    } else {
      const container = {
        activePlans: updatedPlanList,
        historicalPlans,
      };
      await tx.run(
        `UPDATE farm_succession_plans SET plan_data_json = ?, updated_at = datetime('now') WHERE farm_id = ?`,
        [JSON.stringify(container), farmId]
      );

      // 1. Delete tasks associated with this specific plan using PlanRef tag
      if (resolvedPlanId) {
        await tx.run(`DELETE FROM todos WHERE farm_id = ? AND notes LIKE ?`, [
          farmId,
          `%[PlanRef:${resolvedPlanId}]%`,
        ]);
      }
      if (planId && planId !== resolvedPlanId) {
        await tx.run(`DELETE FROM todos WHERE farm_id = ? AND notes LIKE ?`, [
          farmId,
          `%[PlanRef:${planId}]%`,
        ]);
      }

      // 2. Clean up ALL succession and mitigation tasks for the target plots of this plan
      if (resolvedTargetPlots && resolvedTargetPlots.length > 0) {
        for (const plotId of resolvedTargetPlots) {
          await tx.run(
            `DELETE FROM todos 
             WHERE farm_id = ? 
             AND garden_structure_id = ? 
             AND (notes = ? OR notes LIKE ? OR notes LIKE ? OR title LIKE ? OR notes LIKE ?)`,
            [
              farmId,
              plotId,
              SUCCESSION_PLAN_TODO_NOTE,
              `%[${SUCCESSION_PLAN_TODO_NOTE}]%`,
              '%[PlanRef:%',
              'Mitigation:%',
              '%Phase: mitigation%',
            ]
          );

          // 3. Clear active or planned crop cycles on these target plots to immediately free them
          await tx.run(
            `DELETE FROM crop_cycles 
             WHERE garden_structure_id = ? 
             AND status IN ('planned', 'active')`,
            [plotId]
          );
        }
      } else {
        // Whole-farm plan (no specific plot): delete unassigned succession and mitigation tasks
        await tx.run(
          `DELETE FROM todos 
           WHERE farm_id = ? 
           AND garden_structure_id IS NULL 
           AND (notes = ? OR notes LIKE ? OR notes LIKE ? OR title LIKE ? OR notes LIKE ?)`,
          [
            farmId,
            SUCCESSION_PLAN_TODO_NOTE,
            `%[${SUCCESSION_PLAN_TODO_NOTE}]%`,
            '%[PlanRef:%',
            'Mitigation:%',
            '%Phase: mitigation%',
          ]
        );
      }
    }

    let plotLabels: string[] = [];
    if (resolvedTargetPlots.length > 0) {
      const plots = (await tx.all(
        `SELECT label FROM garden_structures WHERE id IN (${resolvedTargetPlots.map(() => '?').join(',')})`,
        resolvedTargetPlots
      )) || [];
      plotLabels = plots.map((p: any) => p.label).filter(Boolean);
    }

    const farm = await tx.get('SELECT user_id FROM farms WHERE id = ?', [farmId]);
    if (farm) {
      await logFarmAuditAction(tx, farmId, userId || farm.user_id, 'REMOVED_CROP_PLAN', {
        planId: resolvedPlanId,
        freedPlots: plotLabels,
      });
    }
  });
}

export async function stopFarmCropPlan(
  farmId: string,
  planId: string,
  reason: string,
  userId?: string,
  targetPlots?: string[]
) {
  const db = getDatabase();

  const existingPlan = await db.get<FarmSuccessionPlanRecord>(
    'SELECT * FROM farm_succession_plans WHERE farm_id = ?',
    [farmId]
  );
  if (!existingPlan) return;

  const rawData = existingPlan.plan_data_json
    ? parseJsonValue<any>(existingPlan.plan_data_json, null)
    : null;
  if (!rawData) return;

  let activePlans: CropRotationPlanData[] = [];
  let historicalPlans: any[] = [];

  if (Array.isArray(rawData)) {
    activePlans = rawData;
  } else if (rawData && typeof rawData === 'object') {
    activePlans = Array.isArray(rawData.activePlans) ? rawData.activePlans : [];
    historicalPlans = Array.isArray(rawData.historicalPlans) ? rawData.historicalPlans : [];
  }

  // Match target plan by:
  // 1. Exact ID
  // 2. Overlapping target plots
  // 3. Temporary index plan-${idx}-
  // 4. Fallback if only 1 plan exists
  let targetPlan: CropRotationPlanData | null = null;
  if (planId) {
    targetPlan = activePlans.find((p) => p.id === planId) || null;
  }
  if (!targetPlan && targetPlots && targetPlots.length > 0) {
    targetPlan =
      activePlans.find((p) =>
        p.targetPlots?.some((plotId) => targetPlots.includes(plotId))
      ) || null;
  }
  if (!targetPlan && planId && planId.startsWith('plan-')) {
    const match = planId.match(/^plan-(\d+)-/);
    if (match) {
      const idx = Number.parseInt(match[1], 10);
      if (activePlans[idx]) {
        targetPlan = activePlans[idx];
      }
    }
  }
  if (!targetPlan && activePlans.length === 1) {
    targetPlan = activePlans[0];
  }

  if (!targetPlan) {
    console.warn('[LocalDB] stopFarmCropPlan: Target plan not found for planId:', planId);
    return;
  }

  const resolvedPlanId = targetPlan.id || generateUUID();
  const resolvedTargetPlots = targetPlan.targetPlots || targetPlots || [];
  const cropNames = targetPlan.selectedCrops?.map((c) => c.crop) || [];

  const updatedActivePlans = activePlans.filter((p) =>
    targetPlan ? p !== targetPlan : (p.id ? p.id !== planId : true)
  );

  const terminatedPlan = {
    ...targetPlan,
    id: resolvedPlanId,
    status: 'terminated',
    terminatedAt: new Date().toISOString(),
    terminationReason: reason,
    archivedAt: new Date().toISOString(),
  };

  const updatedHistoricalPlans = [terminatedPlan, ...historicalPlans];

  await db.transaction(async (tx) => {
    const container = {
      activePlans: updatedActivePlans,
      historicalPlans: updatedHistoricalPlans,
    };

    await tx.run(
      `UPDATE farm_succession_plans SET plan_data_json = ?, updated_at = datetime('now') WHERE farm_id = ?`,
      [JSON.stringify(container), farmId]
    );

    // 1. Delete tasks associated with this specific plan using PlanRef tag
    if (resolvedPlanId) {
      await tx.run(`DELETE FROM todos WHERE farm_id = ? AND notes LIKE ?`, [
        farmId,
        `%[PlanRef:${resolvedPlanId}]%`,
      ]);
    }
    if (planId && planId !== resolvedPlanId) {
      await tx.run(`DELETE FROM todos WHERE farm_id = ? AND notes LIKE ?`, [
        farmId,
        `%[PlanRef:${planId}]%`,
      ]);
    }

    // 2. Clean up succession and mitigation tasks for target plots
    if (resolvedTargetPlots.length > 0) {
      for (const plotId of resolvedTargetPlots) {
        await tx.run(
          `DELETE FROM todos 
           WHERE farm_id = ? 
           AND garden_structure_id = ? 
           AND (notes = ? OR notes LIKE ? OR notes LIKE ? OR title LIKE ? OR notes LIKE ?)`,
          [
            farmId,
            plotId,
            SUCCESSION_PLAN_TODO_NOTE,
            `%[${SUCCESSION_PLAN_TODO_NOTE}]%`,
            '%[PlanRef:%',
            'Mitigation:%',
            '%Phase: mitigation%',
          ]
        );

        // 3. Mark active crop cycles as terminated
        await tx.run(
          `UPDATE crop_cycles 
           SET status = 'terminated', cycle_notes = ?, updated_at = datetime('now')
           WHERE garden_structure_id = ? 
           AND status IN ('planned', 'active')`,
          [reason, plotId]
        );
      }
    } else {
      await tx.run(
        `DELETE FROM todos 
         WHERE farm_id = ? 
         AND garden_structure_id IS NULL 
         AND (notes = ? OR notes LIKE ? OR notes LIKE ? OR title LIKE ? OR notes LIKE ?)`,
        [
          farmId,
          SUCCESSION_PLAN_TODO_NOTE,
          `%[${SUCCESSION_PLAN_TODO_NOTE}]%`,
          '%[PlanRef:%',
          'Mitigation:%',
          '%Phase: mitigation%',
        ]
      );
    }

    // 4. Fetch plot names for audit log
    let plotLabels: string[] = [];
    if (resolvedTargetPlots.length > 0) {
      const plots = (await tx.all(
        `SELECT label FROM garden_structures WHERE id IN (${resolvedTargetPlots.map(() => '?').join(',')})`,
        resolvedTargetPlots
      )) || [];
      plotLabels = plots.map((p: any) => p.label).filter(Boolean);
    }

    const farm = await tx.get('SELECT user_id FROM farms WHERE id = ?', [farmId]);
    await logFarmAuditAction(tx, farmId, userId || farm?.user_id, 'STOPPED_CROP_PLAN', {
      planId: resolvedPlanId,
      plotNames: plotLabels,
      crops: cropNames,
      reason,
      stoppedDate: new Date().toISOString(),
    });
  });
}

export async function getFarmCropHistory(farmId: string): Promise<any[]> {
  const db = getDatabase();
  const row = await db.get<FarmSuccessionPlanRecord>(
    'SELECT plan_data_json FROM farm_succession_plans WHERE farm_id = ?',
    [farmId]
  );
  if (!row || !row.plan_data_json) return [];

  const raw = parseJsonValue<any>(row.plan_data_json, null);
  if (!raw) return [];

  if (raw && typeof raw === 'object' && Array.isArray(raw.historicalPlans)) {
    return raw.historicalPlans;
  }
  return [];
}

export async function fetchMitigationPlanFromDB(problemClass: string) {
  const db = getDatabase();
  const rows = await db.all<{ day: number; title: string; description: string }>(
    `SELECT day, title, description FROM mitigation_plans 
     WHERE problem_class = ? AND is_active = 1 
     ORDER BY day ASC`,
    [problemClass]
  );

  return (rows || []).map((row) => ({
    label: 'mitigation' as const,
    day: row.day,
    title: row.title,
    description: row.description,
  }));
}

export interface ProblemClassItem {
  id: string;
  name: string;
  category: string;
  questions: string[];
}

export const DEFAULT_PROBLEM_CLASSES: ProblemClassItem[] = [
  {
    id: 'aphid_cluster',
    name: 'Aphid Cluster',
    category: 'pest',
    questions: [
      'Do you see small clusters of tiny insects crowded on the underside of leaves or new shoots?',
      'Is there a sticky, shiny residue (honeydew) on the leaves or stems?',
    ],
  },
  {
    id: 'caterpillar',
    name: 'Caterpillar',
    category: 'pest',
    questions: [
      'Are there visible caterpillars or worm-like larvae crawling on the plant?',
      'Do the leaves show large, irregular chewed edges or missing sections?',
    ],
  },
  {
    id: 'leaf_discoloration',
    name: 'Leaf Discoloration',
    category: 'disease',
    questions: [
      'Are the leaves showing yellow, brown, or discolored patches or spots?',
      'Is the discoloration spreading from the older, lower leaves upward?',
    ],
  },
  {
    id: 'leaf_hole',
    name: 'Leaf Hole',
    category: 'disease',
    questions: [
      'Are there visible holes punched through the leaf surface?',
      'Do the holes have ragged or uneven edges rather than a clean cut?',
    ],
  },
  {
    id: 'mold_fungus',
    name: 'Mold / Fungus',
    category: 'disease',
    questions: [
      'Is there a white, gray, or powdery coating visible on the leaves or stems?',
      'Does the affected area feel damp, fuzzy, or smell musty?',
    ],
  },
  {
    id: 'slug_snail',
    name: 'Slug / Snail',
    category: 'pest',
    questions: [
      'Do you see silvery slime trails on the leaves or soil surface?',
      'Are leaf edges or seedlings missing large, smooth chunks, mostly noticeable in the morning?',
    ],
  },
];

export async function fetchDynamicProblemClassesFromDB(): Promise<ProblemClassItem[]> {
  try {
    const db = getDatabase();
    const rows = await db.all<{ slug: string; name: string; category: string; questions_json: any }>(
      `SELECT slug, name, category, questions_json FROM problem_classes WHERE status = 'active' ORDER BY name ASC`
    );

    if (rows && rows.length > 0) {
      const parsed: ProblemClassItem[] = rows.map((row) => {
        let questions: string[] = [];
        if (row.questions_json) {
          if (Array.isArray(row.questions_json)) {
            questions = row.questions_json;
          } else if (typeof row.questions_json === 'string') {
            try {
              const res = JSON.parse(row.questions_json);
              questions = Array.isArray(res) ? res : [];
            } catch (e) {
              console.error('Failed to parse questions_json for slug:', row.slug, e);
            }
          }
        }
        return {
          id: row.slug,
          name: row.name,
          category: row.category,
          questions: questions,
        };
      });

      return parsed.map((p) => {
        if (p.questions.length === 0) {
          const fallback = DEFAULT_PROBLEM_CLASSES.find((df) => df.id === p.id);
          if (fallback) {
            return { ...p, questions: fallback.questions };
          }
        }
        return p;
      });
    }
  } catch (err) {
    console.error('Error fetching problem classes from DB:', err);
  }

  return DEFAULT_PROBLEM_CLASSES;
}

export async function saveMitigationTodos(params: {
  userId: string;
  farmId: string;
  problemName: string;
  mitigationSteps: { title: string; description: string; day?: number }[];
  gardenStructureId?: string | null;
  planId?: string | null;
}) {
  const db = getDatabase();
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = addDaysToDateKey(today, 7);

  let resolvedPlanId = params.planId || null;
  let resolvedGardenStructureId = params.gardenStructureId || null;

  if (!resolvedPlanId) {
    try {
      const existingPlan = await db.get<FarmSuccessionPlanRecord>(
        'SELECT * FROM farm_succession_plans WHERE farm_id = ?',
        [params.farmId]
      );
      if (existingPlan?.plan_data_json) {
        const plans = parseJsonValue<any>(existingPlan.plan_data_json, null);
        const planList: CropRotationPlanData[] = Array.isArray(plans) ? plans : plans ? [plans] : [];
        if (resolvedGardenStructureId) {
          const matchingPlan = planList.find((p) =>
            p.targetPlots?.includes(resolvedGardenStructureId!)
          );
          if (matchingPlan?.id) {
            resolvedPlanId = matchingPlan.id;
          }
        }
        if (!resolvedPlanId && planList.length === 1 && planList[0]?.id) {
          resolvedPlanId = planList[0].id;
          if (!resolvedGardenStructureId && planList[0].targetPlots?.length === 1) {
            resolvedGardenStructureId = planList[0].targetPlots[0];
          }
        }
      }
    } catch (e) {
      console.warn('Error resolving planId for mitigation:', e);
    }
  }

  await db.transaction(async (tx) => {
    for (const step of params.mitigationSteps) {
      const taskTitle = `Mitigation: ${step.title}`;
      let taskNotes = `This task is a mitigation for: ${params.problemName}\n\n${step.description}\n\nPhase: mitigation\n\n[${SUCCESSION_PLAN_TODO_NOTE}]`;
      if (resolvedPlanId) {
        taskNotes += `\n[PlanRef:${resolvedPlanId}]`;
      }

      await tx.run(
        `INSERT INTO todos (
          id,
          user_id,
          farm_id,
          garden_structure_id,
          title,
          notes,
          start_date,
          due_date,
          is_completed,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
        [
          generateUUID(),
          params.userId,
          params.farmId,
          resolvedGardenStructureId ?? null,
          taskTitle,
          taskNotes,
          today,
          dueDate,
        ]
      );
    }

    await logFarmAuditAction(tx, params.farmId, params.userId, 'GENERATED_MITIGATION_TASKS', {
      problemName: params.problemName,
      taskCount: params.mitigationSteps.length,
      planId: resolvedPlanId,
      gardenStructureId: resolvedGardenStructureId,
    });
  });
}
export async function createTodo(params: {
  userId: string;
  farmId: string;
  title: string;
  notes?: string;
  startDate?: string;
  dueDate?: string;
  gardenStructureId?: string | null;
}) {
  const db = getDatabase();
  const todoId = generateUUID();

  await db.run(
    `INSERT INTO todos (
      id,
      user_id,
      farm_id,
      garden_structure_id,
      title,
      notes,
      start_date,
      due_date,
      is_completed,
      progress,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'))`,
    [
      todoId,
      params.userId,
      params.farmId,
      params.gardenStructureId ?? null,
      params.title,
      params.notes ?? null,
      params.startDate ?? null,
      params.dueDate ?? null,
    ]
  );

  await logFarmAuditAction(db, params.farmId, params.userId, 'CREATED_TODO', {
    todoId,
    title: params.title,
  });

  return todoId;
}

export async function getTodosByUser(userId: string) {
  const db = getDatabase();
  const result = await db.all<TodoRecord>(
    `SELECT *
     FROM todos
     WHERE user_id = ?
     ORDER BY
       COALESCE(start_date, due_date, created_at) ASC,
       created_at DESC`,
    [userId]
  );

  return (result || []).map((record) => normalizeTodo(record));
}

export async function getTodosByFarm(farmId: string) {
  const db = getDatabase();
  const result = await db.all<TodoRecord>(
    `SELECT *
     FROM todos
     WHERE farm_id = ?
     ORDER BY
       COALESCE(start_date, due_date, created_at) ASC,
       created_at DESC`,
    [farmId]
  );

  return (result || []).map((record) => normalizeTodo(record));
}

export async function updateTodo(
  todoId: string,
  updates: {
    title?: string;
    notes?: string;
    startDate?: string | null;
    dueDate?: string | null;
    gardenStructureId?: string | null;
    isCompleted?: boolean;
    progress?: number;
  }
) {
  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }

  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes);
  }

  if (updates.startDate !== undefined) {
    fields.push('start_date = ?');
    values.push(updates.startDate);
  }

  if (updates.dueDate !== undefined) {
    fields.push('due_date = ?');
    values.push(updates.dueDate);
  }

  if (updates.gardenStructureId !== undefined) {
    fields.push('garden_structure_id = ?');
    values.push(updates.gardenStructureId);
  }

  if (updates.progress !== undefined) {
    const clampedProgress = Math.max(0, Math.min(100, Math.round(updates.progress)));
    fields.push('progress = ?');
    values.push(clampedProgress);

    if (updates.isCompleted === undefined) {
      if (clampedProgress >= 100) {
        fields.push('is_completed = 1');
        fields.push('completed_at = datetime("now")');
      } else {
        fields.push('is_completed = 0');
        fields.push('completed_at = NULL');
      }
    }
  }

  if (updates.isCompleted !== undefined) {
    fields.push('is_completed = ?');
    values.push(updates.isCompleted ? 1 : 0);
    fields.push(updates.isCompleted ? 'completed_at = datetime("now")' : 'completed_at = NULL');
    if (updates.progress === undefined) {
      fields.push(`progress = ${updates.isCompleted ? 100 : 0}`);
    }
  }

  fields.push('updated_at = datetime("now")');
  values.push(todoId);

  await db.transaction(async (tx) => {
    await tx.run(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`, values);
    
    if (updates.isCompleted !== undefined || updates.progress !== undefined) {
      const todo = await tx.get(
        'SELECT farm_id, user_id, title, garden_structure_id, is_completed, progress FROM todos WHERE id = ?',
        [todoId]
      );
      if (todo) {
        let plotNames: string[] = [];
        if (todo.garden_structure_id) {
          const struct = await tx.get(
            `SELECT gs.label, gst.type_name 
             FROM garden_structures gs 
             LEFT JOIN garden_structure_types gst ON gs.structure_type_id = gst.id 
             WHERE gs.id = ?`,
            [todo.garden_structure_id]
          );
          if (struct) {
            plotNames = [struct.label || struct.type_name || 'Plot'];
          }
        }
        await logFarmAuditAction(
          tx, 
          todo.farm_id, 
          todo.user_id, 
          todo.is_completed === 1 ? 'COMPLETED_TODO' : 'UPDATED_TODO_PROGRESS', 
          {
            todoId,
            todoIds: [todoId],
            title: todo.title,
            progress: todo.progress ?? (todo.is_completed === 1 ? 100 : 0),
            plotsCount: 1,
            plotNames,
          }
        );
      }
    } else {
      const todo = await tx.get('SELECT farm_id, user_id, title FROM todos WHERE id = ?', [todoId]);
      if (todo) {
        await logFarmAuditAction(tx, todo.farm_id, todo.user_id, 'UPDATED_TODO', { todoId, title: todo.title });
      }
    }
  });
}

export async function batchUpdateTodosCompletion(params: {
  todoIds: string[];
  isCompleted: boolean;
  userId?: string;
  plotNames?: string[];
}): Promise<void> {
  const { todoIds, isCompleted, userId, plotNames: providedPlotNames } = params;
  if (!todoIds || todoIds.length === 0) return;

  const db = getDatabase();

  await db.transaction(async (tx: any) => {
    const placeholders = todoIds.map(() => '?').join(',');
    const todos = await tx.all(
      `SELECT id, farm_id, user_id, title, garden_structure_id FROM todos WHERE id IN (${placeholders})`,
      todoIds
    );

    if (!todos || todos.length === 0) return;

    const completedAtValue = isCompleted ? "datetime('now')" : 'NULL';
    const progressValue = isCompleted ? 100 : 0;
    await tx.run(
      `UPDATE todos 
       SET is_completed = ?, 
           progress = ?,
           completed_at = ${completedAtValue}, 
           updated_at = datetime('now') 
       WHERE id IN (${placeholders})`,
      [isCompleted ? 1 : 0, progressValue, ...todoIds]
    );

    // Group by farm_id & title to produce clean, single audit log entries
    const groups = new Map<
      string,
      {
        farmId: string;
        title: string;
        userId: string;
        structureIds: string[];
        ids: string[];
      }
    >();

    for (const todo of todos) {
      const groupKey = `${todo.farm_id}:::${todo.title}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          farmId: todo.farm_id,
          title: todo.title,
          userId: userId || todo.user_id,
          structureIds: [],
          ids: [],
        });
      }
      const g = groups.get(groupKey)!;
      g.ids.push(todo.id);
      if (todo.garden_structure_id && !g.structureIds.includes(todo.garden_structure_id)) {
        g.structureIds.push(todo.garden_structure_id);
      }
    }

    for (const group of groups.values()) {
      let plotNames = providedPlotNames;
      if (!plotNames && group.structureIds.length > 0) {
        const structPlaceholders = group.structureIds.map(() => '?').join(',');
        const structures = await tx.all(
          `SELECT gs.id, gs.label, gst.type_name 
           FROM garden_structures gs 
           LEFT JOIN garden_structure_types gst ON gs.structure_type_id = gst.id 
           WHERE gs.id IN (${structPlaceholders})`,
          group.structureIds
        );
        plotNames = (structures || []).map((s: any) => s.label || s.type_name || 'Plot');
      }

      await logFarmAuditAction(
        tx,
        group.farmId,
        group.userId,
        isCompleted ? 'COMPLETED_TODO' : 'UNCOMPLETED_TODO',
        {
          todoId: group.ids[0],
          todoIds: group.ids,
          title: group.title,
          plotsCount: group.ids.length,
          plotNames: plotNames || [],
        }
      );
    }
  });
}

export async function batchUpdateTodosProgress(params: {
  todoIds: string[];
  progress: number;
  userId?: string;
  plotNames?: string[];
}): Promise<void> {
  const { todoIds, progress, userId, plotNames: providedPlotNames } = params;
  if (!todoIds || todoIds.length === 0) return;

  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const isCompleted = clampedProgress >= 100;
  const db = getDatabase();

  await db.transaction(async (tx: any) => {
    const placeholders = todoIds.map(() => '?').join(',');
    const todos = await tx.all(
      `SELECT id, farm_id, user_id, title, garden_structure_id FROM todos WHERE id IN (${placeholders})`,
      todoIds
    );

    if (!todos || todos.length === 0) return;

    const completedAtValue = isCompleted ? "datetime('now')" : 'NULL';
    await tx.run(
      `UPDATE todos 
       SET progress = ?, 
           is_completed = ?, 
           completed_at = ${completedAtValue}, 
           updated_at = datetime('now') 
       WHERE id IN (${placeholders})`,
      [clampedProgress, isCompleted ? 1 : 0, ...todoIds]
    );

    const groups = new Map<
      string,
      {
        farmId: string;
        title: string;
        userId: string;
        structureIds: string[];
        ids: string[];
      }
    >();

    for (const todo of todos) {
      const groupKey = `${todo.farm_id}:::${todo.title}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          farmId: todo.farm_id,
          title: todo.title,
          userId: userId || todo.user_id,
          structureIds: [],
          ids: [],
        });
      }
      const g = groups.get(groupKey)!;
      g.ids.push(todo.id);
      if (todo.garden_structure_id && !g.structureIds.includes(todo.garden_structure_id)) {
        g.structureIds.push(todo.garden_structure_id);
      }
    }

    for (const group of groups.values()) {
      let plotNames = providedPlotNames;
      if (!plotNames && group.structureIds.length > 0) {
        const structPlaceholders = group.structureIds.map(() => '?').join(',');
        const structures = await tx.all(
          `SELECT gs.id, gs.label, gst.type_name 
           FROM garden_structures gs 
           LEFT JOIN garden_structure_types gst ON gs.structure_type_id = gst.id 
           WHERE gs.id IN (${structPlaceholders})`,
          group.structureIds
        );
        plotNames = (structures || []).map((s: any) => s.label || s.type_name || 'Plot');
      }

      await logFarmAuditAction(
        tx,
        group.farmId,
        group.userId,
        isCompleted ? 'COMPLETED_TODO' : 'UPDATED_TODO_PROGRESS',
        {
          todoId: group.ids[0],
          todoIds: group.ids,
          title: group.title,
          progress: clampedProgress,
          plotsCount: group.ids.length,
          plotNames: plotNames || [],
        }
      );
    }
  });
}

// TODO COMMENTS OPERATIONS
export async function getTodoComments(todoIds: string | string[]): Promise<TodoCommentItem[]> {
  const ids = Array.isArray(todoIds) ? todoIds.filter(Boolean) : [todoIds].filter(Boolean);
  if (ids.length === 0) return [];

  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(',');

  try {
    const rows = await db.all<any>(
      `SELECT 
         tc.id,
         tc.todo_id,
         tc.user_id,
         tc.farm_id,
         tc.comment,
         tc.created_at,
         tc.updated_at,
         u.first_name,
         u.last_name,
         u.username,
         u.avatar_url,
         u.profile_icon_url
       FROM todo_comments tc
       LEFT JOIN users u ON tc.user_id = u.id
       WHERE tc.todo_id IN (${placeholders})
       ORDER BY tc.created_at ASC`,
      ids
    );

    return (rows || []).map((row: any) => {
      const nameParts = [row.first_name, row.last_name].filter(Boolean);
      const userName = nameParts.length > 0 ? nameParts.join(' ') : row.username || 'Team Member';
      return {
        id: row.id,
        todo_id: row.todo_id,
        user_id: row.user_id,
        farm_id: row.farm_id,
        comment: row.comment,
        created_at: row.created_at,
        updated_at: row.updated_at,
        user_name: userName,
        user_avatar: row.avatar_url ?? undefined,
        user_profile_icon: row.profile_icon_url ?? undefined,
      };
    });
  } catch (err) {
    console.warn('[db-operations] getTodoComments query error:', err);
    return [];
  }
}

export async function addTodoComment(params: {
  todoId: string;
  farmId?: string;
  userId: string;
  comment: string;
}): Promise<TodoCommentItem> {
  const db = getDatabase();
  const commentId = generateUUID();
  const now = new Date().toISOString();

  let resolvedFarmId = params.farmId || '';
  if (!resolvedFarmId) {
    try {
      const todoRow = await db.get<any>('SELECT farm_id FROM todos WHERE id = ?', [params.todoId]);
      resolvedFarmId = todoRow?.farm_id || '';
    } catch {}
  }

  await db.run(
    `INSERT INTO todo_comments (
       id,
       todo_id,
       user_id,
       farm_id,
       comment,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [commentId, params.todoId, params.userId, resolvedFarmId, params.comment.trim(), now, now]
  );

  let userName = 'You';
  let userAvatar: string | undefined;
  let userProfileIcon: string | undefined;

  try {
    const userRow = await db.get<any>(
      'SELECT first_name, last_name, username, avatar_url, profile_icon_url FROM users WHERE id = ?',
      [params.userId]
    );

    if (userRow) {
      const nameParts = [userRow.first_name, userRow.last_name].filter(Boolean);
      userName = nameParts.length > 0 ? nameParts.join(' ') : userRow.username || 'You';
      userAvatar = userRow.avatar_url ?? undefined;
      userProfileIcon = userRow.profile_icon_url ?? undefined;
    }
  } catch {}

  if (resolvedFarmId) {
    await logFarmAuditAction(db, resolvedFarmId, params.userId, 'COMMENTED_ON_TODO', {
      todoId: params.todoId,
      commentId,
    });
  }

  return {
    id: commentId,
    todo_id: params.todoId,
    user_id: params.userId,
    farm_id: resolvedFarmId,
    comment: params.comment.trim(),
    created_at: now,
    updated_at: now,
    user_name: userName,
    user_avatar: userAvatar,
    user_profile_icon: userProfileIcon,
  };
}

export async function deleteTodoComment(commentId: string, userId?: string): Promise<void> {
  const db = getDatabase();
  const comment = await db.get<any>('SELECT farm_id, user_id, todo_id FROM todo_comments WHERE id = ?', [commentId]);
  if (comment && comment.farm_id) {
    await logFarmAuditAction(db, comment.farm_id, userId || comment.user_id, 'DELETED_TODO_COMMENT', {
      todoId: comment.todo_id,
      commentId,
    });
  }
  await db.run('DELETE FROM todo_comments WHERE id = ?', [commentId]);
}

export async function deleteTodo(todoId: string, userId?: string) {
  const db = getDatabase();
  const todo = await db.get('SELECT farm_id, user_id, title FROM todos WHERE id = ?', [todoId]);
  if (todo) {
    await logFarmAuditAction(db, todo.farm_id, userId || todo.user_id, 'DELETED_TODO', { title: todo.title });
  }
  await db.run('DELETE FROM todos WHERE id = ?', [todoId]);
}

export async function getAllGardenStructures() {
  const db = getDatabase();
  const results = await db.all('SELECT * FROM garden_structures');
  return results;
}

// SUCCESSION PLAN OPERATIONS
export async function saveFarmCheckUpResults(params: {
  userId: string;
  farmId: string;
  imageUri: string | null;
  summaryData: any;
}) {
  const db = getDatabase();
  const id = generateUUID();

  // 1. Save permanent local copy for guaranteed offline availability
  const permanentLocalUri = await saveLocalCheckupCopy(params.imageUri);

  // Preserve local URI in summaryData
  const enrichedSummaryData = {
    ...params.summaryData,
    local_image_uri: permanentLocalUri,
    cloud_image_uri: null,
  };

  // 2. Store record in SQLite immediately (0-10ms)
  await db.run(
    `INSERT INTO farm_checkup_results (
      id,
      user_id,
      farm_id,
      image_uri,
      summary_data_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, params.userId, params.farmId, permanentLocalUri ?? null, JSON.stringify(enrichedSummaryData)]
  );

  await logFarmAuditAction(db, params.farmId, params.userId, 'RECORDED_CHECKUP', {
    hasImage: !!permanentLocalUri,
    score: params.summaryData?.score,
  });

  // 3. Fire-and-forget background cloud upload when online
  if (permanentLocalUri) {
    void (async () => {
      try {
        const cloudUrl = await uploadCheckupImageToSupabase(permanentLocalUri, params.userId);
        if (cloudUrl) {
          const updatedSummary = {
            ...enrichedSummaryData,
            cloud_image_uri: cloudUrl,
          };
          await db.run(
            `UPDATE farm_checkup_results SET image_uri = ?, summary_data_json = ?, updated_at = datetime('now') WHERE id = ?`,
            [cloudUrl, JSON.stringify(updatedSummary), id]
          );
        }
      } catch (cloudErr) {
        console.warn('[CheckupStorage] Background cloud upload deferred:', cloudErr);
      }
    })();
  }

  return id;
}

export type FarmCheckupResultRecord = {
  id: string;
  user_id: string;
  farm_id: string;
  image_uri: string | null;
  summary_data_json: string | null;
  created_at: string;
  updated_at: string;
};

export async function getLatestFarmCheckUpResult(farmId: string): Promise<{
  id: string;
  image_uri: string | null;
  summary_data: any;
  created_at: string;
} | null> {
  try {
    const db = getDatabase();
    const row = await db.get<FarmCheckupResultRecord>(
      'SELECT * FROM farm_checkup_results WHERE farm_id = ? ORDER BY created_at DESC LIMIT 1',
      [farmId]
    );
    if (!row) return null;

    let summary_data = null;
    if (row.summary_data_json) {
      try {
        summary_data =
          typeof row.summary_data_json === 'string'
            ? JSON.parse(row.summary_data_json)
            : row.summary_data_json;
      } catch (e) {
        console.warn('Failed to parse summary_data_json:', e);
      }
    }

    const resolvedImageUri =
      row.image_uri || summary_data?.cloud_image_uri || summary_data?.local_image_uri || null;

    return {
      id: row.id,
      image_uri: resolvedImageUri,
      summary_data,
      created_at: row.created_at,
    };
  } catch (err) {
    console.warn('Error fetching latest checkup result:', err);
    return null;
  }
}

export async function getAllFarmCheckUpResults(farmId: string): Promise<
  Array<{
    id: string;
    user_id: string;
    farm_id: string;
    image_uri: string | null;
    summary_data: any;
    created_at: string;
    updated_at: string;
  }>
> {
  try {
    const db = getDatabase();
    const rows = await db.all<FarmCheckupResultRecord>(
      'SELECT * FROM farm_checkup_results WHERE farm_id = ? ORDER BY created_at DESC',
      [farmId]
    );

    return rows.map((row) => {
      let summary_data = null;
      if (row.summary_data_json) {
        try {
          summary_data =
            typeof row.summary_data_json === 'string'
              ? JSON.parse(row.summary_data_json)
              : row.summary_data_json;
        } catch (e) {
          console.warn('Failed to parse summary_data_json:', e);
        }
      }

      const resolvedImageUri =
        row.image_uri || summary_data?.cloud_image_uri || summary_data?.local_image_uri || null;

      return {
        id: row.id,
        user_id: row.user_id,
        farm_id: row.farm_id,
        image_uri: resolvedImageUri,
        summary_data,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });
  } catch (err) {
    console.warn('Error fetching checkup results for farm:', farmId, err);
    return [];
  }
}

export async function deleteFarmCheckUpResult(resultId: string): Promise<void> {
  const db = getDatabase();
  try {
    const row = await db.get<{ image_uri: string }>(
      'SELECT image_uri FROM farm_checkup_results WHERE id = ?',
      [resultId]
    );
    if (row?.image_uri) {
      void deleteCheckupImage(row.image_uri);
    }
  } catch (err) {
    console.warn('[LocalDB] Failed to retrieve image for deletion:', err);
  }
  await db.run('DELETE FROM farm_checkup_results WHERE id = ?', [resultId]);
}

// ==========================================
// FARM DAILY OBSERVATION REPORT OPERATIONS
// ==========================================

export type DailyReportAnswerItem = {
  questionId: string;
  questionText: string;
  category: string;
  answer: 'yes' | 'no';
};

export type DailyReportInput = {
  userId: string;
  farmId: string;
  gardenStructureId?: string | null;
  plotName?: string;
  answers: Record<string, 'yes' | 'no'>;
  symptomsSummary: Array<{ category: string; question: string }>;
  notes?: string | null;
  imageUri?: string | null;
};

export type FarmDailyReportRecord = {
  id: string;
  user_id: string;
  farm_id: string;
  garden_structure_id: string | null;
  plot_name: string | null;
  answers_json: Record<string, 'yes' | 'no'>;
  symptoms_summary_json: Array<{ category: string; question: string }>;
  notes: string | null;
  image_uri: string | null;
  report_date: string;
  created_at: string;
  updated_at: string;
};

export async function saveDailyReport(params: DailyReportInput): Promise<string> {
  const db = getDatabase();
  const id = generateUUID();
  const todayDate = new Date().toISOString().split('T')[0];

  // If there's an image, save permanent local copy
  let permanentLocalUri: string | null = null;
  if (params.imageUri) {
    try {
      permanentLocalUri = (await saveLocalCheckupCopy(params.imageUri)) || params.imageUri;
    } catch (imgErr) {
      console.warn('[DailyReport] Image local copy note:', imgErr);
      permanentLocalUri = params.imageUri;
    }
  }

  await db.run(
    `INSERT INTO farm_daily_reports (
      id,
      user_id,
      farm_id,
      garden_structure_id,
      plot_name,
      answers_json,
      symptoms_summary_json,
      notes,
      image_uri,
      report_date,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      id,
      params.userId,
      params.farmId,
      params.gardenStructureId ?? null,
      params.plotName || 'General Farm Field',
      JSON.stringify(params.answers),
      JSON.stringify(params.symptomsSummary),
      params.notes?.trim() || null,
      permanentLocalUri,
      todayDate,
    ]
  );

  // Background upload if there is an image
  if (permanentLocalUri) {
    const uriToUpload = permanentLocalUri;
    void (async () => {
      try {
        const cloudUrl = await uploadCheckupImageToSupabase(uriToUpload, params.userId);
        if (cloudUrl) {
          await db.run(
            `UPDATE farm_daily_reports SET image_uri = ?, updated_at = datetime('now') WHERE id = ?`,
            [cloudUrl, id]
          );
        }
      } catch (imgErr) {
        console.warn('[DailyReport] Background image upload deferred:', imgErr);
      }
    })();
  }

  // Log audit action
  await logFarmAuditAction(db, params.farmId, params.userId, 'SUBMITTED_DAILY_REPORT', {
    plotName: params.plotName || 'General Farm Field',
    symptomsCount: params.symptomsSummary.length,
    hasNotes: Boolean(params.notes?.trim()),
    hasImage: Boolean(permanentLocalUri),
  });

  return id;
}

export async function getFarmDailyReports(farmId: string): Promise<FarmDailyReportRecord[]> {
  try {
    const db = getDatabase();
    const rows = await db.all<any>(
      `SELECT * FROM farm_daily_reports WHERE farm_id = ? ORDER BY created_at DESC`,
      [farmId]
    );

    if (!rows || rows.length === 0) return [];

    return rows.map((row) => {
      let answers_json: Record<string, 'yes' | 'no'> = {};
      let symptoms_summary_json: Array<{ category: string; question: string }> = [];

      try {
        answers_json =
          typeof row.answers_json === 'string'
            ? JSON.parse(row.answers_json)
            : row.answers_json || {};
      } catch {
        answers_json = {};
      }

      try {
        symptoms_summary_json =
          typeof row.symptoms_summary_json === 'string'
            ? JSON.parse(row.symptoms_summary_json)
            : row.symptoms_summary_json || [];
      } catch {
        symptoms_summary_json = [];
      }

      return {
        id: row.id,
        user_id: row.user_id,
        farm_id: row.farm_id,
        garden_structure_id: row.garden_structure_id,
        plot_name: row.plot_name,
        answers_json,
        symptoms_summary_json,
        notes: row.notes,
        image_uri: row.image_uri,
        report_date: row.report_date,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });
  } catch (err) {
    console.warn('Error fetching daily reports for farm:', farmId, err);
    return [];
  }
}

export async function hasSubmittedDailyReportToday(farmId: string, userId: string): Promise<boolean> {
  try {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const row = await db.get<any>(
      `SELECT id FROM farm_daily_reports WHERE farm_id = ? AND user_id = ? AND (report_date = ? OR date(created_at) = ?) LIMIT 1`,
      [farmId, userId, today, today]
    );
    return Boolean(row && row.id);
  } catch (err) {
    console.warn('Error checking today daily report submission:', err);
    return false;
  }
}

export async function deleteDailyReport(reportId: string): Promise<void> {
  const db = getDatabase();
  try {
    const row = await db.get<{ image_uri: string }>(
      'SELECT image_uri FROM farm_daily_reports WHERE id = ?',
      [reportId]
    );
    if (row?.image_uri) {
      void deleteCheckupImage(row.image_uri);
    }
  } catch (err) {
    console.warn('[LocalDB] Failed to retrieve daily report image for deletion:', err);
  }
  await db.run('DELETE FROM farm_daily_reports WHERE id = ?', [reportId]);
}

// FARM MODULE OPERATIONS
export type FarmModuleRecord = {
  id: string;
  module_title: string;
  module_category: string;
  content: string;
  difficulty_level: string;
  thumbnail_url: string | null;
  is_published: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// ==========================================
// NEW MODULES & GAMIFIED QUIZ OPERATIONS
// ==========================================

export type ModuleRecord = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  content: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | string;
  sort_order: number;
  reading_time_min: number;
  thumbnail_url: string | null;
  is_published: number;
  created_at: string;
  updated_at: string;
};

export type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

export type ModuleQuizRecord = {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  passing_score: number;
  questions_json: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type UserLearningProgressRecord = {
  id: string;
  user_id: string;
  item_id: string;
  item_type: 'module' | 'quiz' | 'finish_line';
  is_completed: number;
  score: number;
  stars: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

// Fallback seed modules in case database is freshly created / offline
export const FALLBACK_SEED_MODULES: ModuleRecord[] = [
  {
    id: 'mod-001-soil-foundations',
    title: 'Soil Science & Health Fundamentals',
    description: 'Learn how soil composition, texture, and organic matter drive healthy plant nutrition.',
    category: 'Soil Science',
    content: `# Understanding Soil Foundations

Soil is the living skin of our planet and the foundation of all organic agriculture. Healthy soil produces resilient plants, enhances water retention, and resists erosion.

## 1. The Components of Soil
Healthy agricultural soil consists of four primary components:
- **Mineral Particles (45%)**: Sand, silt, and clay. The ratio of these three determines soil texture and drainage.
- **Organic Matter (5%)**: Decomposed plant and animal tissues, humus, and billions of active microorganisms.
- **Water (25%)**: Soil solution containing dissolved mineral ions required by plant roots.
- **Air / Pore Space (25%)**: Oxygen essential for root respiration and aerobic bacterial activity.

## 2. Soil Texture Types
- **Sandy Soil**: Large particles with large pore spaces. Drains water rapidly but struggles to hold dissolved nutrients.
- **Clay Soil**: Extremely tiny, flat particles that pack tightly. Excellent nutrient holding capacity (CEC), but drains poorly and can compact easily.
- **Loam Soil**: The agricultural sweet spot! A balanced mix of sand, silt, and clay that balances moisture retention with aeration.

## 3. The Role of pH in Nutrient Uptake
Soil pH measures acidity or alkalinity on a 0–14 scale:
- Most vegetables thrive between **pH 6.0 and 7.0**.
- In overly acidic soils (below 5.5), phosphorus and calcium become chemically locked out, while aluminum toxicity increases.
- In alkaline soils (above 7.5), micronutrients like iron, manganese, and zinc precipitate into insoluble forms.

> **Key Rule**: Regularly test your soil pH before applying fertilizers or amendments!`,
    difficulty: 'Beginner',
    sort_order: 1,
    reading_time_min: 4,
    thumbnail_url: null,
    is_published: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mod-002-organic-composting',
    title: 'Organic Composting & Microbial Life',
    description: 'Master the science of thermal composting and nurturing beneficial soil biology.',
    category: 'Composting',
    content: `# The Art & Science of Composting

Composting transforms farm and kitchen waste into rich, dark humus teeming with beneficial biology. It is nature’s ultimate recycling mechanism.

## 1. The Carbon to Nitrogen (C:N) Ratio
The secret to rapid, odor-free composting is the ratio of carbon ("Browns") to nitrogen ("Greens"):
- **Target Ratio**: 25:1 to 30:1.
- **Browns (Carbon-rich)**: Dry leaves, straw, untreated wood chips, cardboard, sawdust. Provides energy for microbes.
- **Greens (Nitrogen-rich)**: Fresh grass clippings, vegetable scraps, green crop residues, manure. Provides protein and nitrogen for microbial reproduction.

## 2. Moisture and Aeration
- **Moisture**: Your compost pile should feel like a wrung-out sponge (approx 50–60% moisture). If too dry, decomposition stops; if too wet, the pile turns anaerobic and smelly.
- **Aeration**: Turn the pile every 1–2 weeks to introduce oxygen. Aerobic bacteria produce clean, earthy compost without foul odors.

## 3. The 3 Phases of Thermal Composting
1. **Mesophilic Phase (20–40°C)**: Initial breakdown by moderate-temperature bacteria.
2. **Thermophilic Phase (45–65°C)**: High-heat phase that kills weed seeds and plant pathogens.
3. **Curing / Maturation Phase (20–35°C)**: Fungi and earthworms finish converting the material into stable humus.

> **Pro Tip**: Never add meat, grease, or diseased tomato/potato vines into regular domestic compost piles.`,
    difficulty: 'Beginner',
    sort_order: 2,
    reading_time_min: 5,
    thumbnail_url: null,
    is_published: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mod-003-crop-rotation',
    title: 'Crop Rotation & Companion Planting',
    description: 'Break pest cycles, prevent soil nutrient depletion, and maximize bed productivity.',
    category: 'Crop Planning',
    content: `# Crop Rotation & Companion Planting

Planting the same crop in the same bed season after season depletes specific nutrients and invites pests to multiply. Crop rotation and companion planting create a diversified, balanced ecosystem.

## 1. The Four-Season Family Rotation
To rotate effectively, group crops by plant family:
1. **Heavy Feeders (Solanaceae / Brassicas)**: Tomatoes, eggplants, peppers, cabbages, broccoli. They consume large quantities of nitrogen and potassium.
2. **Light Feeders (Alliums / Root Crops)**: Onions, garlic, carrots, beets. They need moderate potassium and phosphorus.
3. **Soil Builders (Legumes)**: Beans, peas, cowpeas, clover. Through rhizobia bacteria, they fix atmospheric nitrogen into the soil.
4. **Rest / Cover Crop**: Buckwheat, rye, or sunn hemp to add biomass and suppress weeds.

## 2. Dynamic Companion Planting
Certain plants provide mutual benefits when grown close together:
- **The Three Sisters**: Corn (provides vertical trellis), Beans (climbs corn and fixes nitrogen), Squash (broad leaves shade soil to prevent weed growth and conserve moisture).
- **Marigolds & Tomatoes**: Marigold roots exude natural chemicals that repel root-knot nematodes.
- **Basil & Peppers**: Basil improves vigor, attracts beneficial pollinators, and repels thrips and hornworms.

> **Rule of Thumb**: Wait at least 3 years before planting members of the same botanical family in the exact same garden bed.`,
    difficulty: 'Intermediate',
    sort_order: 3,
    reading_time_min: 6,
    thumbnail_url: null,
    is_published: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mod-004-natural-pest-mgmt',
    title: 'Natural & Biological Pest Management (IPM)',
    description: 'Protect your farm without synthetic chemicals using Integrated Pest Management.',
    category: 'Pest Control',
    content: `# Integrated Pest Management (IPM)

Integrated Pest Management focuses on prevention, biological control, and targeted organic remedies rather than blanket chemical spraying.

## 1. The IPM Pyramid of Defense
1. **Cultural Controls**: Crop spacing, sanitation, resistant seed varieties, drip irrigation to keep foliage dry.
2. **Physical / Mechanical Controls**: Row covers, insect netting, yellow sticky traps, handpicking caterpillars.
3. **Biological Controls**: Encouraging natural predators like ladybugs, hoverflies, parasitic wasps, and praying mantises.
4. **Organic Chemical Controls**: Targeted use of neem oil, insecticidal soap, Bacillus thuringiensis (Bt), or diatomaceous earth as a last resort.

## 2. Beneficial Insects to Attract
- **Ladybugs (Coccinellidae)**: Both larvae and adults can consume up to 50 aphids per day!
- **Lacewings**: Known as "aphid lions", their voracious larvae devour aphids, mites, and thrips.
- **Parasitic Wasps**: Tiny non-stinging wasps that lay eggs inside hornworms and cabbage loopers.

## 3. Organic Sprays & Formulations
- **Neem Oil (Azadirachtin)**: Disrupts insect hormonal systems and feeding behaviors. Spray during early morning or dusk to avoid harming foraging honeybees.
- **Bacillus thuringiensis (Bt)**: A natural soil bacterium specific to caterpillars without harming beneficial bugs.

> **Safety Notice**: Always spray any organic pesticide in the cool hours of early morning or sunset.`,
    difficulty: 'Intermediate',
    sort_order: 4,
    reading_time_min: 5,
    thumbnail_url: null,
    is_published: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mod-005-water-irrigation',
    title: 'Smart Water Management & Drip Systems',
    description: 'Optimize irrigation efficiency, reduce fungal disease risk, and conserve water.',
    category: 'Irrigation',
    content: `# Efficient Water Management

Water is precious in agriculture. Overwatering causes root rot, nutrient leaching, and fungal leaf spot, while underwatering stunts crop yields.

## 1. Drip Irrigation vs. Overhead Sprinklers
- **Drip Irrigation**: Delivers water directly to the root zone at low pressure. Achieves **90–95% water efficiency**, minimizes evaporation, and keeps plant foliage dry to prevent fungal spores from germinating.
- **Overhead Sprinklers**: 60–70% efficiency due to wind drift and evaporation. Wet foliage drastically increases blight and powdery mildew.

## 2. Mulching for Moisture Conservation
Applying a 2–3 inch layer of organic mulch (straw, shredded leaves, or wood chips) offers massive benefits:
- Cuts soil surface evaporation by up to **70%**.
- Moderates root temperature during scorching afternoons.
- Breaks down slowly into valuable organic matter.

## 3. When and How Much to Water
- Water deeply and infrequently rather than shallowly every day. This encourages root systems to plunge deep into the soil profile.
- The best time to irrigate is **early morning (5:00 AM to 8:00 AM)** so plants are fully hydrated before midday heat.

> **Diagnostic Check**: Stick your index finger 2 inches into the soil. If it feels cool and damp, your plants have sufficient moisture!`,
    difficulty: 'Advanced',
    sort_order: 5,
    reading_time_min: 5,
    thumbnail_url: null,
    is_published: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'mod-006-npk-soil-nutrition',
    title: 'NPK Dynamics & Organic Soil Nutrition',
    description: 'Decode nitrogen, phosphorus, and potassium pathways for peak crop vitality.',
    category: 'Soil Science',
    content: `# Soil Nutrition & NPK Mastery

Plants require 17 essential elements for growth, categorized into Primary Macronutrients (N, P, K), Secondary Nutrients (Ca, Mg, S), and Micronutrients (Fe, Zn, B, Cu, Mn, Mo).

## 1. The Big Three: N-P-K
1. **Nitrogen (N) — "Up" (Foliage & Stems)**:
   - Fuels chlorophyll production, vegetative leaf growth, and lush green color.
   - *Deficiency sign*: Older bottom leaves turn pale yellow (chlorosis).
   - *Organic sources*: Blood meal, fish emulsion, feather meal, legume green manure.

2. **Phosphorus (P) — "Down" (Roots & Blooms)**:
   - Drives ATP energy transfer, deep root development, flower setting, and seed formation.
   - *Deficiency sign*: Purplish/reddish tint along leaf veins and stunted roots.
   - *Organic sources*: Bone meal, soft rock phosphate, composted animal manure.

3. **Potassium (K) — "All Around" (Resilience & Fruit Quality)**:
   - Regulates stomatal opening, water pressure, enzyme activation, and disease resistance.
   - *Deficiency sign*: Browning or scorched margins along outer leaf edges.
   - *Organic sources*: Wood ash, kelp meal, potassium sulfate, greensand.

## 2. Secondary Essentials: Calcium & Magnesium
- **Calcium (Ca)**: Builds rigid cell walls. Deficiency causes **Blossom End Rot** in tomatoes and tip burn in lettuce.
- **Magnesium (Mg)**: The central atom of the chlorophyll molecule. Deficiency causes interveinal yellowing with green veins.

> **Balance is Key**: Over-fertilizing with nitrogen causes rapid soft vegetative growth that invites severe aphid outbreaks and suppresses fruit set!`,
    difficulty: 'Advanced',
    sort_order: 6,
    reading_time_min: 6,
    thumbnail_url: null,
    is_published: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const FALLBACK_SEED_QUIZZES: Record<string, ModuleQuizRecord> = {
  'mod-001-soil-foundations': {
    id: 'quiz-001-soil-foundations',
    module_id: 'mod-001-soil-foundations',
    title: 'Soil Foundations Checkpoint',
    description: 'Test your understanding of soil components, textures, and pH balance.',
    passing_score: 70,
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    questions_json: JSON.stringify([
      {
        id: 'q1_1',
        question: 'What is the ideal soil pH range for most common organic vegetables?',
        options: ['pH 4.0 to 5.0', 'pH 6.0 to 7.0', 'pH 8.0 to 9.0', 'pH 9.5 to 11.0'],
        correct_index: 1,
        explanation: 'A pH between 6.0 and 7.0 provides optimal nutrient solubility and bioavailability for vegetable roots.',
      },
      {
        id: 'q1_2',
        question: 'Which soil texture type has the largest mineral particles and fastest drainage?',
        options: ['Clay', 'Silt', 'Sandy', 'Peat'],
        correct_index: 2,
        explanation: 'Sandy soil consists of large particles that allow water to drain rapidly with low nutrient retention.',
      },
      {
        id: 'q1_3',
        question: 'In a healthy agricultural soil, pore space (air + water) ideally occupies what percentage?',
        options: ['10%', '25%', '50%', '90%'],
        correct_index: 2,
        explanation: 'Healthy soil is roughly 50% solid matter (mineral + organic) and 50% pore space (25% air, 25% water).',
      },
    ]),
  },
  'mod-002-organic-composting': {
    id: 'quiz-002-organic-composting',
    module_id: 'mod-002-organic-composting',
    title: 'Composting Mastery Quiz',
    description: 'Prove your knowledge of C:N ratios, aeration, and thermal composting phases.',
    passing_score: 70,
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    questions_json: JSON.stringify([
      {
        id: 'q2_1',
        question: 'What is the ideal Carbon to Nitrogen (C:N) ratio for an active compost pile?',
        options: ['5:1 to 10:1', '25:1 to 30:1', '60:1 to 80:1', '100:1 to 150:1'],
        correct_index: 1,
        explanation: 'A 25:1 to 30:1 C:N ratio balances microbial energy needs (carbon) with cellular protein synthesis (nitrogen).',
      },
      {
        id: 'q2_2',
        question: 'Which material is classified as a "Brown" (Carbon-rich) input?',
        options: ['Fresh grass clippings', 'Kitchen vegetable scraps', 'Dry shredded leaves', 'Chicken manure'],
        correct_index: 2,
        explanation: 'Dry leaves, straw, and cardboard are classic carbon-rich Brown materials.',
      },
      {
        id: 'q2_3',
        question: 'Why is turning the compost pile periodically critical?',
        options: ['To cool it down to 0°C', 'To introduce oxygen for aerobic microbes', 'To compact the soil tightly', 'To kill earthworms'],
        correct_index: 1,
        explanation: 'Aeration supplies oxygen so beneficial aerobic bacteria can thrive without producing foul anaerobic odors.',
      },
    ]),
  },
  'mod-003-crop-rotation': {
    id: 'quiz-003-crop-rotation',
    module_id: 'mod-003-crop-rotation',
    title: 'Crop Rotation & Guilds Challenge',
    description: 'Validate your crop family rotation and companion planting strategies.',
    passing_score: 70,
    sort_order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    questions_json: JSON.stringify([
      {
        id: 'q3_1',
        question: 'Which crop family fixes atmospheric nitrogen directly into the soil?',
        options: ['Solanaceae (Nightshades)', 'Legumes (Beans & Peas)', 'Brassicas (Cabbage family)', 'Alliums (Onions & Garlic)'],
        correct_index: 1,
        explanation: 'Legumes form a symbiotic relationship with rhizobia bacteria on their root nodules to fix nitrogen.',
      },
      {
        id: 'q3_2',
        question: 'In the indigenous "Three Sisters" guild, what role does Corn play?',
        options: ['Provides a vertical structural trellis for beans', 'Shades the soil from sunlight', 'Repels all insect pests', 'Fixes potassium in soil'],
        correct_index: 0,
        explanation: 'Corn grows tall and sturdy, providing a living stalk trellis for climbing pole beans.',
      },
      {
        id: 'q3_3',
        question: 'How long should you wait before planting the same botanical family in the same bed?',
        options: ['1 month', '6 months', 'At least 3 years', '10 years'],
        correct_index: 2,
        explanation: 'A 3-year rotation breaks recurring soil-borne fungal pathogens and nematode infestation cycles.',
      },
    ]),
  },
  'mod-004-natural-pest-mgmt': {
    id: 'quiz-004-natural-pest-mgmt',
    module_id: 'mod-004-natural-pest-mgmt',
    title: 'Integrated Pest Management Exam',
    description: 'Test your tactical understanding of biological controls and organic treatments.',
    passing_score: 70,
    sort_order: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    questions_json: JSON.stringify([
      {
        id: 'q4_1',
        question: 'What is the primary food source for beneficial Ladybug larvae and adults?',
        options: ['Plant roots', 'Aphids and soft-bodied pests', 'Leaf foliage', 'Tree bark'],
        correct_index: 1,
        explanation: 'Ladybugs are voracious predators of aphids, scale insects, and spider mites.',
      },
      {
        id: 'q4_2',
        question: 'Why should organic neem oil spray be applied in early morning or sunset?',
        options: ['It only works in darkness', 'To protect active diurnal pollinators like honeybees', 'It evaporates in 1 second', 'It needs frost to activate'],
        correct_index: 1,
        explanation: 'Spraying during off-foraging hours protects beneficial bees and prevents leaf sun-scald under midday UV.',
      },
      {
        id: 'q4_3',
        question: 'Which natural bacterium specifically targets caterpillar pests without harming beneficial bugs?',
        options: ['E. coli', 'Bacillus thuringiensis (Bt)', 'Streptococcus', 'Salmonella'],
        correct_index: 1,
        explanation: 'Bt produces crystal proteins that specifically affect the digestive system of lepidopteran larvae (caterpillars).',
      },
    ]),
  },
  'mod-005-water-irrigation': {
    id: 'quiz-005-water-irrigation',
    module_id: 'mod-005-water-irrigation',
    title: 'Smart Irrigation Knowledge Check',
    description: 'Assess your mastery of drip efficiency, mulching, and watering timing.',
    passing_score: 70,
    sort_order: 5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    questions_json: JSON.stringify([
      {
        id: 'q5_1',
        question: 'What efficiency rating does drip irrigation achieve compared to overhead sprinklers?',
        options: ['30–40%', '50–60%', '90–95%', '100% with zero loss'],
        correct_index: 2,
        explanation: 'Drip systems deliver water directly to root zones at 90–95% efficiency, reducing evaporation and wind drift.',
      },
      {
        id: 'q5_2',
        question: 'How does applying organic mulch reduce irrigation frequency?',
        options: ['It absorbs all rain before it reaches roots', 'It cuts soil surface evaporation by up to 70%', 'It turns water into fertilizer', 'It heats the soil to 100°C'],
        correct_index: 1,
        explanation: 'A 2-3 inch organic mulch blanket prevents solar evaporation and keeps root zones consistently moist.',
      },
      {
        id: 'q5_3',
        question: 'Why is early morning watering superior to late evening watering?',
        options: ['Leaves stay wet all night, promoting fungal diseases if watered late', 'Water turns sour at night', 'Roots sleep at night', 'Morning water has more nitrogen'],
        correct_index: 0,
        explanation: 'Watering early lets foliage dry during the day, preventing spore germination for powdery mildew and blight.',
      },
    ]),
  },
  'mod-006-npk-soil-nutrition': {
    id: 'quiz-006-npk-soil-nutrition',
    module_id: 'mod-006-npk-soil-nutrition',
    title: 'NPK & Soil Chemistry Final Quiz',
    description: 'Demonstrate your command of primary macronutrients and deficiency diagnostics.',
    passing_score: 70,
    sort_order: 6,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    questions_json: JSON.stringify([
      {
        id: 'q6_1',
        question: 'What primary plant function does Nitrogen (N) support?',
        options: ['Flower and fruit size only', 'Vegetative foliage growth and chlorophyll synthesis', 'Root cellular structure only', 'Bark hardening'],
        correct_index: 1,
        explanation: 'Nitrogen is the cornerstone of amino acids and chlorophyll, driving lush green leaf and stem growth.',
      },
      {
        id: 'q6_2',
        question: 'A tomato plant exhibits black sunken leathery spots at the bottom of its fruits. What nutrient deficiency is this?',
        options: ['Iron deficiency', 'Calcium deficiency (Blossom End Rot)', 'Nitrogen toxicity', 'Boron excess'],
        correct_index: 1,
        explanation: 'Blossom End Rot is caused by localized calcium deficiency during rapid fruit cell wall elongation.',
      },
      {
        id: 'q6_3',
        question: 'Which macronutrient governs root growth, seed formation, and ATP energy transfer?',
        options: ['Nitrogen (N)', 'Phosphorus (P)', 'Potassium (K)', 'Chlorine (Cl)'],
        correct_index: 1,
        explanation: 'Phosphorus drives cellular energy storage (ATP), robust root architecture, and prolific flowering.',
      },
    ]),
  },
};

/**
 * Get all modules from the new `modules` table ordered by `sort_order ASC`.
 * Falls back to seeding / fallback list if the table has not yet synced.
 */
export async function getAllModules(): Promise<ModuleRecord[]> {
  try {
    const db = getDatabase();
    const records = await db.all<ModuleRecord>(
      'SELECT * FROM modules WHERE is_published = 1 ORDER BY sort_order ASC'
    );
    if (records && records.length > 0) {
      return records;
    }

    // Try selecting all without is_published filter
    const allRecords = await db.all<ModuleRecord>(
      'SELECT * FROM modules ORDER BY sort_order ASC'
    );
    if (allRecords && allRecords.length > 0) {
      return allRecords;
    }

    // Seed into local SQLite if empty so user has immediate offline access
    for (const mod of FALLBACK_SEED_MODULES) {
      await db.run(
        `INSERT OR IGNORE INTO modules (id, title, description, category, content, difficulty, sort_order, reading_time_min, thumbnail_url, is_published, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mod.id,
          mod.title,
          mod.description,
          mod.category,
          mod.content,
          mod.difficulty,
          mod.sort_order,
          mod.reading_time_min,
          mod.thumbnail_url,
          mod.is_published,
          mod.created_at,
          mod.updated_at,
        ]
      );
    }

    // Also seed quizzes if empty
    for (const quiz of Object.values(FALLBACK_SEED_QUIZZES)) {
      await db.run(
        `INSERT OR IGNORE INTO module_quizzes (id, module_id, title, description, passing_score, questions_json, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quiz.id,
          quiz.module_id,
          quiz.title,
          quiz.description,
          quiz.passing_score,
          quiz.questions_json,
          quiz.sort_order,
          quiz.created_at,
          quiz.updated_at,
        ]
      );
    }

    const seeded = await db.all<ModuleRecord>(
      'SELECT * FROM modules ORDER BY sort_order ASC'
    );
    return seeded.length > 0 ? seeded : FALLBACK_SEED_MODULES;
  } catch (error) {
    console.warn('[DB Operations] Error querying modules table, using fallback:', error);
    return FALLBACK_SEED_MODULES;
  }
}

/**
 * Fetch a single module by its id
 */
export async function getModuleById(moduleId: string): Promise<ModuleRecord | null> {
  try {
    const db = getDatabase();
    const result = await db.get<ModuleRecord>('SELECT * FROM modules WHERE id = ?', [moduleId]);
    if (result) return result;

    const fallback = FALLBACK_SEED_MODULES.find((m) => m.id === moduleId);
    return fallback ?? null;
  } catch (error) {
    console.warn('[DB Operations] Error querying module by id:', error);
    return FALLBACK_SEED_MODULES.find((m) => m.id === moduleId) ?? null;
  }
}

/**
 * Fetch the quiz for a given module ID
 */
export async function getQuizByModuleId(moduleId: string): Promise<ModuleQuizRecord | null> {
  try {
    const db = getDatabase();
    const result = await db.get<ModuleQuizRecord>(
      'SELECT * FROM module_quizzes WHERE module_id = ? ORDER BY sort_order ASC LIMIT 1',
      [moduleId]
    );
    if (result) return result;

    return FALLBACK_SEED_QUIZZES[moduleId] ?? null;
  } catch (error) {
    console.warn('[DB Operations] Error querying quiz for module:', error);
    return FALLBACK_SEED_QUIZZES[moduleId] ?? null;
  }
}

/**
 * Fetch all user learning progress records for a user
 */
export async function getUserLearningProgress(
  userId: string
): Promise<UserLearningProgressRecord[]> {
  try {
    const db = getDatabase();
    return await db.all<UserLearningProgressRecord>(
      'SELECT * FROM user_learning_progress WHERE user_id = ?',
      [userId]
    );
  } catch (error) {
    console.warn('[DB Operations] Error querying user learning progress:', error);
    return [];
  }
}

/**
 * Save / update module completion for a user
 */
export async function saveUserModuleProgress(
  userId: string,
  moduleId: string
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.get<UserLearningProgressRecord>(
    'SELECT * FROM user_learning_progress WHERE user_id = ? AND item_id = ? AND item_type = ?',
    [userId, moduleId, 'module']
  );

  if (existing) {
    await db.run(
      'UPDATE user_learning_progress SET is_completed = 1, completed_at = ?, updated_at = ? WHERE id = ?',
      [now, now, existing.id]
    );
  } else {
    const newId = generateUUID();
    await db.run(
      `INSERT INTO user_learning_progress (id, user_id, item_id, item_type, is_completed, score, stars, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'module', 1, 100, 3, ?, ?, ?)`,
      [newId, userId, moduleId, now, now, now]
    );
  }
}

/**
 * Save / update quiz completion and score for a user
 */
export async function saveUserQuizProgress(
  userId: string,
  quizId: string,
  score: number,
  stars: number
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.get<UserLearningProgressRecord>(
    'SELECT * FROM user_learning_progress WHERE user_id = ? AND item_id = ? AND item_type = ?',
    [userId, quizId, 'quiz']
  );

  const isCompleted = score >= 70 ? 1 : 0;

  if (existing) {
    // Keep highest score/stars
    const bestScore = Math.max(existing.score, score);
    const bestStars = Math.max(existing.stars, stars);
    const completed = existing.is_completed === 1 || isCompleted === 1 ? 1 : 0;
    await db.run(
      'UPDATE user_learning_progress SET is_completed = ?, score = ?, stars = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      [completed, bestScore, bestStars, now, now, existing.id]
    );
  } else {
    const newId = generateUUID();
    await db.run(
      `INSERT INTO user_learning_progress (id, user_id, item_id, item_type, is_completed, score, stars, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'quiz', ?, ?, ?, ?, ?, ?)`,
      [newId, userId, quizId, isCompleted, score, stars, now, now, now]
    );
  }
}

/**
 * Save / mark Finish Line completion
 */
export async function saveUserFinishLineProgress(
  userId: string,
  finishLineId = 'finish-line-milestone'
): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.get<UserLearningProgressRecord>(
    'SELECT * FROM user_learning_progress WHERE user_id = ? AND item_id = ? AND item_type = ?',
    [userId, finishLineId, 'finish_line']
  );

  if (existing) {
    await db.run(
      'UPDATE user_learning_progress SET is_completed = 1, completed_at = ?, updated_at = ? WHERE id = ?',
      [now, now, existing.id]
    );
  } else {
    const newId = generateUUID();
    await db.run(
      `INSERT INTO user_learning_progress (id, user_id, item_id, item_type, is_completed, score, stars, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'finish_line', 1, 100, 3, ?, ?, ?)`,
      [newId, userId, finishLineId, now, now, now]
    );
  }
}

/**
 * Reset learning progress for the current user (useful for replaying levels)
 */
export async function resetUserLearningProgress(userId: string): Promise<void> {
  const db = getDatabase();
  await db.run('DELETE FROM user_learning_progress WHERE user_id = ?', [userId]);
}

// Legacy helper for backwards compatibility
export async function getAllPublishedModules(): Promise<FarmModuleRecord[]> {
  const db = getDatabase();
  const published = await db.all<FarmModuleRecord>(
    'SELECT * FROM farm_modules WHERE is_published = 1 ORDER BY sort_order ASC'
  );
  if (published.length > 0) {
    return published;
  }
  return await db.all<FarmModuleRecord>('SELECT * FROM farm_modules ORDER BY sort_order ASC');
}

export async function getModuleCategories(): Promise<string[]> {
  const db = getDatabase();
  const results = await db.all<{ category: string }>(
    'SELECT DISTINCT category FROM modules WHERE category IS NOT NULL AND category != "" ORDER BY category ASC'
  );
  if (results.length > 0) {
    return results.map((r) => r.category);
  }
  return ['Soil Science', 'Composting', 'Crop Planning', 'Pest Control', 'Irrigation'];
}

// ANNOUNCEMENTS OPERATIONS
export type AnnouncementRecord = {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string | null;
  banner_url: string | null;
  priority: number;
  is_active: number | boolean;
  status: string;
  created_at: string;
  updated_at?: string;
};

export async function getActiveAnnouncements(): Promise<AnnouncementRecord[]> {
  try {
    const db = getDatabase();
    const localRecords = await db.all<AnnouncementRecord>(
      `SELECT * FROM announcements WHERE status = 'active' AND (is_active = 1 OR is_active = 'true' OR is_active IS NULL OR is_active != 0) ORDER BY priority DESC, created_at DESC LIMIT 10`
    );

    return localRecords || [];
  } catch (err) {
    // If local table not ready yet or running without PowerSync
    return [];
  }
}

export async function getAllAnnouncements(): Promise<AnnouncementRecord[]> {
  try {
    const db = getDatabase();
    const localRecords = await db.all<AnnouncementRecord>(
      `SELECT * FROM announcements WHERE status = 'active' AND (is_active = 1 OR is_active = 'true' OR is_active IS NULL OR is_active != 0) ORDER BY priority DESC, created_at DESC`
    );

    return localRecords || [];
  } catch (err) {
    // If local table not ready yet or running without PowerSync
    return [];
  }
}

// ──────────────────────────────────────────────
// CERTIFICATE OPERATIONS
// ──────────────────────────────────────────────

export type UserCertificateRecord = {
  id: string;
  user_id: string;
  recipient_name: string;
  first_name: string;
  last_name: string;
  email: string;
  certificate_code: string;
  total_modules: number;
  total_stars: number;
  issue_date: string;
  status: string;
  created_at: string;
  updated_at?: string;
};

export async function getUserCertificate(userId: string): Promise<UserCertificateRecord | null> {
  try {
    const db = getDatabase();
    const cert = await db.get<UserCertificateRecord>(
      'SELECT * FROM user_certificates WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    if (cert) return cert;
  } catch (err) {
    // local table query error
  }

  return null;
}

export async function saveUserCertificate(params: {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  totalModules: number;
  totalStars: number;
}): Promise<UserCertificateRecord> {
  const { userId, firstName, lastName, email, totalModules, totalStars } = params;
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || 'Organic Agriculture Practitioner';
  const now = new Date().toISOString();
  const certCode = `SOIL-CERT-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${new Date().getFullYear()}`;
  const id = generateUUID();

  const record: UserCertificateRecord = {
    id,
    user_id: userId,
    recipient_name: fullName,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email.trim(),
    certificate_code: certCode,
    total_modules: totalModules,
    total_stars: totalStars,
    issue_date: now,
    status: 'issued',
    created_at: now,
    updated_at: now,
  };

  // 1. Save locally in SQLite / PowerSync
  try {
    const db = getDatabase();
    await db.run(
      `INSERT OR REPLACE INTO user_certificates 
       (id, user_id, recipient_name, first_name, last_name, email, certificate_code, total_modules, total_stars, issue_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        fullName,
        record.first_name,
        record.last_name,
        record.email,
        certCode,
        totalModules,
        totalStars,
        now,
        'issued',
        now,
        now,
      ]
    );
  } catch (err) {
    console.warn('[Certificate] Local save warn:', err);
  }

  return record;
}

export async function sendCertificateEmailViaResend(
  cert: UserCertificateRecord
): Promise<{ success: boolean; message?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('certificate', {
      body: {
        action: 'send_email',
        certificate: cert,
      },
    });

    if (error) {
      console.warn('[Certificate] Resend Edge Function invocation error:', error.message);
      return { success: false, message: error.message };
    }

    return { success: true, message: data?.message || 'Email sent successfully via Resend' };
  } catch (err: any) {
    console.warn('[Certificate] Send email error:', err);
    return { success: false, message: err?.message || String(err) };
  }
}

// ============================================================
// USER FOLDERS & CUSTOM RECORD TABLES
// ============================================================

export type ColumnType = 'text' | 'number' | 'image' | 'date';

export interface FolderColumn {
  id: string;
  name: string;
  type: ColumnType;
  order: number;
}

export interface FolderRecordItem {
  id: string;
  created_at: string;
  updated_at?: string;
  [columnId: string]: any;
}

export interface FolderContentJson {
  columns: FolderColumn[];
  records: FolderRecordItem[];
}

export interface UserFolderRecord {
  id: string;
  user_id: string;
  farm_id: string | null;
  folder_name: string;
  content_json: string | FolderContentJson;
  created_at: string;
  updated_at: string;
  farm_name?: string | null;
}

export function parseFolderContent(content: string | FolderContentJson | null | undefined): FolderContentJson {
  if (!content) {
    return { columns: [], records: [] };
  }
  if (typeof content === 'object') {
    return {
      columns: Array.isArray(content.columns) ? content.columns : [],
      records: Array.isArray(content.records) ? content.records : [],
    };
  }
  try {
    const parsed = JSON.parse(content);
    return {
      columns: Array.isArray(parsed?.columns) ? parsed.columns : [],
      records: Array.isArray(parsed?.records) ? parsed.records : [],
    };
  } catch {
    return { columns: [], records: [] };
  }
}

export async function getUserFolders(userId: string): Promise<UserFolderRecord[]> {
  const db = getDatabase();
  try {
    const rows = await db.all<UserFolderRecord>(
      `SELECT DISTINCT uf.*, f.farm_name
       FROM user_folder uf
       LEFT JOIN farms f ON uf.farm_id = f.id
       LEFT JOIN team_folders tf ON tf.folder_id = uf.id
       LEFT JOIN team_members tm ON tm.team_id = tf.team_id AND tm.user_id = ? AND tm.status = 'accepted'
       WHERE uf.user_id = ? OR tm.id IS NOT NULL
       ORDER BY uf.created_at DESC`,
      [userId, userId]
    );
    return rows || [];
  } catch (err) {
    console.warn('[UserFolder] Local query error:', err);
    return [];
  }
}

export async function getOwnedUserFolders(userId: string): Promise<UserFolderRecord[]> {
  const db = getDatabase();
  try {
    const rows = await db.all<UserFolderRecord>(
      `SELECT uf.*, f.farm_name
       FROM user_folder uf
       LEFT JOIN farms f ON uf.farm_id = f.id
       WHERE uf.user_id = ?
       ORDER BY uf.created_at DESC`,
      [userId]
    );
    return rows || [];
  } catch (err) {
    console.warn('[UserFolder] getOwnedUserFolders error:', err);
    return [];
  }
}

export async function getUserFolder(folderId: string): Promise<UserFolderRecord | null> {
  const db = getDatabase();
  try {
    const row = await db.get<UserFolderRecord>(
      `SELECT uf.*, f.farm_name
       FROM user_folder uf
       LEFT JOIN farms f ON uf.farm_id = f.id
       WHERE uf.id = ?`,
      [folderId]
    );
    if (row) return row;
  } catch (err) {
    console.warn('[UserFolder] Local get error:', err);
  }

  return null;
}

export const MAX_USER_FOLDERS = 30;

export async function getUserFolderCount(userId: string): Promise<number> {
  const db = getDatabase();
  try {
    const row = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM user_folder WHERE user_id = ?`,
      [userId]
    );
    if (row && typeof row.count === 'number') {
      return row.count;
    }
  } catch (err) {
    console.warn('[UserFolder] Local count query error:', err);
  }

  return 0;
}

export async function createUserFolder(params: {
  userId: string;
  folderName: string;
  farmId?: string | null;
  initialColumns?: FolderColumn[];
}): Promise<string> {
  // Server-side rate limiter / limit check
  const currentCount = await getUserFolderCount(params.userId);
  if (currentCount >= MAX_USER_FOLDERS) {
    throw new Error(
      `Folder limit reached. You can only create up to ${MAX_USER_FOLDERS} folders per account.`
    );
  }

  const db = getDatabase();
  const folderId = generateUUID();
  const initialContent: FolderContentJson = {
    columns: params.initialColumns || [],
    records: [],
  };
  const contentStr = JSON.stringify(initialContent);

  try {
    await db.run(
      `INSERT INTO user_folder (
        id,
        user_id,
        farm_id,
        folder_name,
        content_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [folderId, params.userId, params.farmId || null, params.folderName.trim(), contentStr]
    );
  } catch (localErr) {
    console.warn('[UserFolder] Local insert error:', localErr);
    throw localErr;
  }

  return folderId;
}

export async function updateUserFolder(
  folderId: string,
  updates: { folderName?: string; farmId?: string | null; content?: FolderContentJson }
): Promise<void> {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.folderName !== undefined) {
    fields.push('folder_name = ?');
    values.push(updates.folderName.trim());
  }

  if (updates.farmId !== undefined) {
    fields.push('farm_id = ?');
    values.push(updates.farmId || null);
  }

  if (updates.content !== undefined) {
    fields.push('content_json = ?');
    values.push(JSON.stringify(updates.content));
  }

  if (fields.length === 0) return;

  fields.push("updated_at = datetime('now')");
  values.push(folderId);

  try {
    await db.run(`UPDATE user_folder SET ${fields.join(', ')} WHERE id = ?`, values);
  } catch (localErr) {
    console.warn('[UserFolder] Local update error:', localErr);
  }
}

export async function deleteUserFolder(folderId: string, userId?: string): Promise<void> {
  const db = getDatabase();

  // 1. First extract any images in content_json to clean them up from storage
  try {
    const existing = await getUserFolder(folderId);
    if (existing) {
      const parsed = parseFolderContent(existing.content_json);
      const imageUris: string[] = [];
      const imageColumnIds = new Set(
        parsed.columns.filter((c) => c.type === 'image').map((c) => c.id)
      );

      for (const record of parsed.records) {
        for (const colId of imageColumnIds) {
          const val = record[colId];
          if (val && typeof val === 'string') {
            imageUris.push(val);
          }
        }
      }

      if (imageUris.length > 0) {
        void deleteFolderImages(imageUris);
      }
    }
  } catch (err) {
    console.warn('[UserFolder] Failed to pre-clean folder images:', err);
  }

  // 2. Delete local row (synced via PowerSync)
  try {
    await db.run('DELETE FROM user_folder WHERE id = ?', [folderId]);
  } catch (localErr) {
    console.warn('[UserFolder] Local delete error:', localErr);
  }
}

export async function saveFolderColumns(
  folderId: string,
  columns: FolderColumn[],
  userId?: string
): Promise<void> {
  const existing = await getUserFolder(folderId);
  if (!existing) throw new Error('Folder not found');

  const content = parseFolderContent(existing.content_json);
  content.columns = columns;

  await updateUserFolder(folderId, { content });

  if (userId) {
    const db = getDatabase();
    const id = generateUUID();
    try {
      await db.run(
        `INSERT INTO folder_audit_logs (id, folder_id, user_id, action, details, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [id, folderId, userId, 'COLUMNS_UPDATED', JSON.stringify({ count: columns.length })]
      );
    } catch (e) {
      console.warn('[FolderAuditLog] Failed to log columns update:', e);
    }
  }
}

export async function saveFolderRecord(
  folderId: string,
  record: FolderRecordItem,
  userId?: string
): Promise<void> {
  const existing = await getUserFolder(folderId);
  if (!existing) throw new Error('Folder not found');

  const content = parseFolderContent(existing.content_json);
  const existingIndex = content.records.findIndex((r) => r.id === record.id);
  const isUpdate = existingIndex >= 0;

  if (isUpdate) {
    // Update existing record
    // Check if old image was replaced and clean up old image
    const oldRecord = content.records[existingIndex];
    const imageColumns = content.columns.filter((c) => c.type === 'image');
    const imagesToDelete: string[] = [];

    for (const imgCol of imageColumns) {
      const oldImg = oldRecord[imgCol.id];
      const newImg = record[imgCol.id];
      if (oldImg && oldImg !== newImg && typeof oldImg === 'string') {
        imagesToDelete.push(oldImg);
      }
    }

    if (imagesToDelete.length > 0) {
      void deleteFolderImages(imagesToDelete);
    }

    content.records[existingIndex] = {
      ...oldRecord,
      ...record,
      updated_at: new Date().toISOString(),
    };
  } else {
    // Add new record at beginning
    content.records.unshift({
      ...record,
      created_at: record.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  await updateUserFolder(folderId, { content });

  if (userId) {
    const db = getDatabase();
    const id = generateUUID();
    try {
      await db.run(
        `INSERT INTO folder_audit_logs (id, folder_id, user_id, action, details, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [
          id,
          folderId,
          userId,
          isUpdate ? 'RECORD_UPDATED' : 'RECORD_ADDED',
          JSON.stringify({ recordId: record.id }),
        ]
      );
    } catch (e) {
      console.warn('[FolderAuditLog] Failed to log record save:', e);
    }
  }
}

export async function deleteFolderRecord(
  folderId: string,
  recordId: string,
  userId?: string
): Promise<void> {
  const existing = await getUserFolder(folderId);
  if (!existing) throw new Error('Folder not found');

  const content = parseFolderContent(existing.content_json);
  const recordIndex = content.records.findIndex((r) => r.id === recordId);

  if (recordIndex >= 0) {
    const record = content.records[recordIndex];
    const imageColumns = content.columns.filter((c) => c.type === 'image');
    const imagesToDelete: string[] = [];

    for (const imgCol of imageColumns) {
      const imgVal = record[imgCol.id];
      if (imgVal && typeof imgVal === 'string') {
        imagesToDelete.push(imgVal);
      }
    }

    if (imagesToDelete.length > 0) {
      void deleteFolderImages(imagesToDelete);
    }

    content.records.splice(recordIndex, 1);
    await updateUserFolder(folderId, { content });

    if (userId) {
      const db = getDatabase();
      const id = generateUUID();
      try {
        await db.run(
          `INSERT INTO folder_audit_logs (id, folder_id, user_id, action, details, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          [id, folderId, userId, 'RECORD_DELETED', JSON.stringify({ recordId })]
        );
      } catch (e) {
        console.warn('[FolderAuditLog] Failed to log record delete:', e);
      }
    }
  }
}

// ============================================================
// FARM FACILITY & INVENTORY OPERATIONS
// ============================================================

export type FacilityRecord = {
  id: string;
  user_id: string;
  farm_id: string | null;
  farm_layout_id: string | null;
  zone_id: string | null;
  name: string;
  category: string;
  icon: string;
  x: number;
  y: number;
  width_m: number;
  height_m: number;
  color: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type FacilityInventoryRecord = {
  id: string;
  user_id: string;
  farm_id: string;
  facility_id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  status: string;
  batch_code: string | null;
  ready_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryTransactionRecord = {
  id: string;
  user_id: string;
  inventory_id: string;
  facility_id: string;
  crop_cycle_id: string | null;
  garden_structure_id: string | null;
  action_type: 'intake' | 'deduction' | 'harvest_deposit' | 'spoilage' | 'adjustment';
  quantity_change: number;
  reason: string | null;
  created_at: string;
};

/**
 * Fetch all facilities belonging to a farm (or estate-level if farmId is null).
 */
export async function getFarmFacilitiesFromDB(farmId: string): Promise<FacilityRecord[]> {
  const db = getDatabase();
  try {
    return await db.all<FacilityRecord>(
      `SELECT * FROM farm_facilities WHERE farm_id = ? ORDER BY created_at ASC`,
      [farmId]
    );
  } catch (error) {
    console.warn('[DB] Failed to query farm_facilities table:', error);
    return [];
  }
}

/**
 * Fetch all inventory items stored inside a specific facility.
 */
export async function getFacilityInventoriesFromDB(facilityId: string): Promise<FacilityInventoryRecord[]> {
  const db = getDatabase();
  try {
    return await db.all<FacilityInventoryRecord>(
      `SELECT * FROM facility_inventories WHERE facility_id = ? ORDER BY category ASC, name ASC`,
      [facilityId]
    );
  } catch (error) {
    console.warn('[DB] Failed to query facility_inventories table:', error);
    return [];
  }
}

/**
 * Fetch low stock inventory items across a farm to trigger alerts.
 */
export async function getLowStockInventoryItems(farmId: string): Promise<FacilityInventoryRecord[]> {
  const db = getDatabase();
  try {
    return await db.all<FacilityInventoryRecord>(
      `SELECT * FROM facility_inventories WHERE farm_id = ? AND (status = 'low_stock' OR quantity <= 1) ORDER BY quantity ASC`,
      [farmId]
    );
  } catch (error) {
    console.warn('[DB] Failed to query low stock items:', error);
    return [];
  }
}

/**
 * Record an inventory transaction (audit trail) and update current quantity.
 */
export async function recordInventoryTransaction(payload: {
  userId: string;
  inventoryId: string;
  facilityId: string;
  cropCycleId?: string | null;
  gardenStructureId?: string | null;
  actionType: 'intake' | 'deduction' | 'harvest_deposit' | 'spoilage' | 'adjustment';
  quantityChange: number;
  reason?: string;
}): Promise<void> {
  const db = getDatabase();
  const txId = generateUUID();

  await db.transaction(async (tx) => {
    // 1. Insert transaction log
    await tx.run(
      `INSERT INTO inventory_transactions (
        id, user_id, inventory_id, facility_id,
        crop_cycle_id, garden_structure_id,
        action_type, quantity_change, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        txId,
        payload.userId,
        payload.inventoryId,
        payload.facilityId,
        payload.cropCycleId || null,
        payload.gardenStructureId || null,
        payload.actionType,
        payload.quantityChange,
        payload.reason || null,
      ]
    );

    // 2. Adjust current inventory quantity
    const existing = await tx.get<FacilityInventoryRecord>(
      `SELECT * FROM facility_inventories WHERE id = ?`,
      [payload.inventoryId]
    );

    if (existing) {
      const newQty = Math.max(0, Number(existing.quantity || 0) + payload.quantityChange);
      const newStatus = newQty === 0 ? 'depleted' : newQty <= 2 ? 'low_stock' : existing.status;

      await tx.run(
        `UPDATE facility_inventories SET
          quantity = ?,
          status = ?,
          updated_at = datetime('now')
        WHERE id = ?`,
        [newQty, newStatus, payload.inventoryId]
      );
    }
  });

  console.log('[DB] Recorded inventory transaction:', payload);
}

/**
 * Convenience helper: Deposit harvested crop yield directly into a storage facility.
 */
export async function depositHarvestToFacilityStorage(params: {
  userId: string;
  farmId: string;
  facilityId: string;
  cropCycleId: string;
  cropName: string;
  yieldKg: number;
  gardenStructureId?: string;
  notes?: string;
}): Promise<string> {
  const db = getDatabase();

  // Find if an existing harvest entry for this crop exists in the storage facility
  const existing = await db.get<FacilityInventoryRecord>(
    `SELECT * FROM facility_inventories WHERE facility_id = ? AND name = ? AND category = 'harvest'`,
    [params.facilityId, `${params.cropName} Harvest`]
  );

  let inventoryId = existing?.id || generateUUID();

  if (!existing) {
    await db.run(
      `INSERT INTO facility_inventories (
        id, user_id, farm_id, facility_id,
        name, category, quantity, unit,
        status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'harvest', 0, 'kg', 'good', ?, datetime('now'), datetime('now'))`,
      [
        inventoryId,
        params.userId,
        params.farmId,
        params.facilityId,
        `${params.cropName} Harvest`,
        params.notes || `Harvested from plot`,
      ]
    );
  }

  // Record transaction
  await recordInventoryTransaction({
    userId: params.userId,
    inventoryId,
    facilityId: params.facilityId,
    cropCycleId: params.cropCycleId,
    gardenStructureId: params.gardenStructureId,
    actionType: 'harvest_deposit',
    quantityChange: params.yieldKg,
    reason: `Harvest deposit from crop cycle ${params.cropCycleId}`,
  });

  return inventoryId;
}

// ============================================================================
// FARM MEMBERS & AUDIT LOGS (OFFLINE-FIRST)
// ============================================================================

export type CreateAuditLogParams = {
  farmId: string;
  farmOwnerId: string;
  userId: string;
  action: string;
  details?: Record<string, unknown>;
};

export async function createAuditLog(params: CreateAuditLogParams): Promise<string> {
  const db = getDatabase();
  const id = generateUUID();
  await db.run(
    `INSERT INTO audit_logs (id, farm_id, farm_owner_id, user_id, action, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      id,
      params.farmId,
      params.farmOwnerId,
      params.userId,
      params.action,
      JSON.stringify(params.details ?? {}),
    ]
  );
  return id;
}

export type DeleteFarmMemberParams = {
  memberId: string;
  farmId: string;
  farmOwnerId: string;
  currentUserId?: string;
  removedUserId?: string;
};

export async function deleteFarmMember(params: DeleteFarmMemberParams): Promise<void> {
  const db = getDatabase();
  try {
    await db.run(`DELETE FROM team_members WHERE id = ?`, [params.memberId]);
  } catch {
    // Fallback if legacy
  }

  if (params.currentUserId) {
    await createAuditLog({
      farmId: params.farmId,
      farmOwnerId: params.farmOwnerId,
      userId: params.currentUserId,
      action: 'MEMBER_REMOVED',
      details: params.removedUserId ? { removed_user_id: params.removedUserId } : {},
    });
  }
}

export type UpdateFarmMemberStatusParams = {
  memberId: string;
  status: 'pending' | 'accepted' | 'declined';
  farmId?: string;
  farmOwnerId?: string;
  currentUserId?: string;
};

export async function updateFarmMemberStatus(params: UpdateFarmMemberStatusParams): Promise<void> {
  const db = getDatabase();
  try {
    await db.run(
      `UPDATE team_members SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      [params.status, params.memberId]
    );
  } catch {
    // Fallback if legacy
  }

  if (params.farmId && params.farmOwnerId && params.currentUserId) {
    await createAuditLog({
      farmId: params.farmId,
      farmOwnerId: params.farmOwnerId,
      userId: params.currentUserId,
      action: params.status === 'accepted' ? 'MEMBER_JOINED' : 'MEMBER_DECLINED',
      details: {},
    });
  }
}

// ============================================================================
// USER SMS SETTINGS (OFFLINE-FIRST)
// ============================================================================

export type UserSmsSettingsRecord = {
  id?: string;
  user_id: string;
  is_subscribed: number;
  wants_weather_sms: number;
  preferred_time: string | null;
  timezone: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function getUserSmsSettings(userId: string): Promise<UserSmsSettingsRecord | null> {
  const db = getDatabase();
  return db.get<UserSmsSettingsRecord>(
    'SELECT * FROM user_sms_settings WHERE user_id = ?',
    [userId]
  );
}

export type UpsertUserSmsSettingsParams = {
  userId: string;
  isSubscribed: boolean;
  wantsWeatherSms: boolean;
  preferredTime: string;
  timezone: string;
};

export async function upsertUserSmsSettings(params: UpsertUserSmsSettingsParams): Promise<void> {
  const db = getDatabase();
  const formattedTime = params.preferredTime.includes(':')
    ? `${params.preferredTime.split(':').slice(0, 2).map((part) => part.padStart(2, '0')).join(':')}:00`
    : '08:00:00';

  const existing = await getUserSmsSettings(params.userId);
  if (existing) {
    await db.run(
      `UPDATE user_sms_settings
       SET is_subscribed = ?, wants_weather_sms = ?, preferred_time = ?, timezone = ?, updated_at = datetime('now')
       WHERE user_id = ?`,
      [
        params.isSubscribed ? 1 : 0,
        params.wantsWeatherSms ? 1 : 0,
        formattedTime,
        params.timezone,
        params.userId,
      ]
    );
  } else {
    const id = params.userId;
    await db.run(
      `INSERT INTO user_sms_settings (
         id, user_id, is_subscribed, wants_weather_sms, preferred_time, timezone, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        id,
        params.userId,
        params.isSubscribed ? 1 : 0,
        params.wantsWeatherSms ? 1 : 0,
        formattedTime,
        params.timezone,
      ]
    );
  }
}

/**
 * @deprecated User identity and security credentials (phone number, email, password, name)
 * are strictly online-only operations requiring verified telecom carrier OTP or auth sessions.
 * Never stage unverified identity mutations into local SQLite.
 */
export async function updateUserPhoneNumber(userId: string, phoneNumber: string): Promise<void> {
  console.warn(
    '[LocalDB Security] Phone number updates are strictly online-only via carrier OTP verification and cannot be staged offline.'
  );
}

export type SupportReportRecord = {
  id: string;
  user_id: string;
  subject: string;
  note: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  device_info?: any;
  created_at: string;
  updated_at: string;
};

export type CreateSupportReportParams = {
  id?: string;
  userId: string;
  subject: string;
  note: string;
  status?: string;
  deviceInfo?: Record<string, unknown>;
};

export async function createSupportReport(params: CreateSupportReportParams): Promise<string> {
  const db = getDatabase();
  const id = params.id || generateUUID();
  const status = params.status || 'pending';
  const now = new Date().toISOString();
  const deviceInfoStr = params.deviceInfo ? JSON.stringify(params.deviceInfo) : '{}';

  await db.run(
    `INSERT INTO reports (id, user_id, subject, note, status, device_info, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.userId, params.subject, params.note, status, deviceInfoStr, now, now]
  );

  return id;
}

export async function getUserSupportReports(userId: string): Promise<SupportReportRecord[]> {
  const db = getDatabase();
  const rows = await db.all<any>(
    `SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map((r) => {
    let parsedDeviceInfo = {};
    if (r.device_info) {
      if (typeof r.device_info === 'string') {
        try {
          parsedDeviceInfo = JSON.parse(r.device_info);
        } catch {
          parsedDeviceInfo = {};
        }
      } else {
        parsedDeviceInfo = r.device_info;
      }
    }
    return {
      ...r,
      device_info: parsedDeviceInfo,
    };
  });
}


