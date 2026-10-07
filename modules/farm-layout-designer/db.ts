/**
 * Farm Layout Designer — Database Operations
 *
 * Load, save, and update farm layouts using the existing
 * farm_layouts + garden_structures tables.
 *
 * Reuses getOrCreateFarmLayout and generateUUID from lib/db-operations.
 */

import { getDatabase, generateUUID } from '../../lib/local-db';
import { logFarmAuditAction } from '../../lib/db-operations';
import type { DesignerPlot, BlueprintItem, LoadedLayout, GardenStructureRow, FarmZone, FarmFacility, AvailableFarmForImport } from './types';
import { PLOT_COLORS, CANVAS_WORLD_WIDTH, CANVAS_WORLD_HEIGHT } from './constants';

// ─── Helpers ───────────────────────────────────────────────

function parseJsonSafe<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Convert a DB blueprint item to a DesignerPlot.
 */
function blueprintItemToDesignerPlot(item: BlueprintItem | any, index: number): DesignerPlot {
  return {
    id: item.id || generateUUID(),
    label: item.label || item.name || `Plot ${index + 1}`,
    x: Number(item.x ?? 0),
    y: Number(item.z ?? item.y ?? 0),
    widthM: Number(item.widthM ?? item.width_m ?? item.width ?? 2),
    heightM: Number(item.depthM ?? item.heightM ?? item.height_m ?? item.height ?? item.depth ?? 1),
    color: item.color || PLOT_COLORS[index % PLOT_COLORS.length],
    rotation: Number(item.rotationY ?? item.rotation ?? 0),
    zoneId: item.zoneId || item.zone_id,
  };
}

/**
 * Convert a DesignerPlot to a DB blueprint item.
 */
function designerPlotToBlueprintItem(plot: DesignerPlot): BlueprintItem {
  return {
    id: plot.id,
    label: plot.label,
    type: 'bed',
    x: plot.x,
    z: plot.y,
    rotationY: plot.rotation,
    widthM: plot.widthM,
    depthM: plot.heightM,
    zoneId: plot.zoneId,
  };
}

// ─── In-Memory Cache (SWR) ──────────────────────────────────

export type CachedLayoutEntry = {
  layout: LoadedLayout;
  timestamp: number;
};

export type CachedFarmInfoEntry = {
  name: string;
  location: string;
  areaSqm: number;
  timestamp: number;
};

const layoutMemoryCache = new Map<string, CachedLayoutEntry>();
const farmInfoMemoryCache = new Map<string, CachedFarmInfoEntry>();

export function getCachedFarmLayout(farmId: string): LoadedLayout | null {
  const entry = layoutMemoryCache.get(farmId);
  return entry ? entry.layout : null;
}

export function setCachedFarmLayout(farmId: string, layout: LoadedLayout): void {
  layoutMemoryCache.set(farmId, { layout, timestamp: Date.now() });
}

export function getCachedFarmInfo(farmId: string): { name: string; location: string; areaSqm: number } | null {
  const entry = farmInfoMemoryCache.get(farmId);
  if (!entry) return null;
  return { name: entry.name, location: entry.location, areaSqm: entry.areaSqm };
}

export function setCachedFarmInfo(farmId: string, info: { name: string; location: string; areaSqm: number }): void {
  farmInfoMemoryCache.set(farmId, { ...info, timestamp: Date.now() });
}

export function invalidateFarmLayoutCache(farmId?: string): void {
  if (farmId) {
    layoutMemoryCache.delete(farmId);
    farmInfoMemoryCache.delete(farmId);
  } else {
    layoutMemoryCache.clear();
    farmInfoMemoryCache.clear();
  }
}

/**
 * Prefetches farm layout and farm metadata into RAM in background.
 * Call this ahead of navigation to guarantee instant 0ms open.
 */
export async function prefetchFarmLayout(farmId: string): Promise<void> {
  try {
    const promises: Promise<any>[] = [];
    if (!layoutMemoryCache.has(farmId)) {
      promises.push(loadFarmLayout(farmId));
    }
    if (!farmInfoMemoryCache.has(farmId)) {
      promises.push(getFarmDetails(farmId));
    }
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  } catch (err) {
    console.warn('[LayoutDesigner][Cache] Prefetch error for farm', farmId, err);
  }
}

// ─── Public API ────────────────────────────────────────────

/**
 * Load an existing farm layout and convert it to designer format.
 * Returns null if no layout exists for this farm.
 */
export async function loadFarmLayout(farmId: string): Promise<LoadedLayout | null> {
  const db = getDatabase();

  const layoutRow = await db.get<any>(
    'SELECT * FROM farm_layouts WHERE farm_id = ?',
    [farmId]
  );

  if (!layoutRow) {
    return null;
  }

  const blueprintData = parseJsonSafe<{
    items?: BlueprintItem[];
    zones?: FarmZone[];
    facilities?: FarmFacility[];
    widthM?: number;
    heightM?: number;
  }>(
    layoutRow.blueprint_data_json,
    {}
  );

  const rawItems = Array.isArray(blueprintData.items)
    ? blueprintData.items
    : Array.isArray((blueprintData as any).plots)
    ? (blueprintData as any).plots
    : Array.isArray((blueprintData as any).structures)
    ? (blueprintData as any).structures
    : [];
  let plots = rawItems.map((item: any, index: number) => blueprintItemToDesignerPlot(item, index));
  const zones: FarmZone[] = Array.isArray(blueprintData.zones) ? blueprintData.zones : [];

  // Try loading facilities from dedicated relational table first
  let facilities: FarmFacility[] = [];
  try {
    const facilityRows = await db.all<any>(
      `SELECT * FROM farm_facilities WHERE farm_layout_id = ? OR farm_id = ? ORDER BY created_at ASC`,
      [layoutRow.id, farmId]
    );
    if (facilityRows && facilityRows.length > 0) {
      const facIds = facilityRows.map((f: any) => f.id);
      const placeholders = facIds.map(() => '?').join(',');
      const invRowsByFacility = new Map<string, any[]>();
      try {
        const allInvRows = await db.all<any>(
          `SELECT * FROM facility_inventories WHERE facility_id IN (${placeholders}) ORDER BY category ASC, name ASC`,
          facIds
        );
        for (const inv of allInvRows || []) {
          const list = invRowsByFacility.get(inv.facility_id) || [];
          list.push(inv);
          invRowsByFacility.set(inv.facility_id, list);
        }
      } catch (invErr) {
        console.warn('[DB] facility_inventories batch query failed, falling back:', invErr);
      }

      for (const fRow of facilityRows) {
        const invRows = invRowsByFacility.get(fRow.id) || [];
        facilities.push({
          id: fRow.id,
          name: fRow.name,
          category: fRow.category || 'storage',
          icon: fRow.icon || 'package',
          x: Number(fRow.x ?? 0),
          y: Number(fRow.y ?? 0),
          widthM: Number(fRow.width_m ?? 3),
          heightM: Number(fRow.height_m ?? 2),
          color: fRow.color || '#795548',
          zoneId: fRow.zone_id || undefined,
          inventories: invRows.map((inv: any) => ({
            id: inv.id,
            name: inv.name,
            category: inv.category,
            quantity: Number(inv.quantity ?? 0),
            unit: inv.unit || 'units',
            status: inv.status || 'good',
            notes: inv.notes || undefined,
            updatedAt: inv.updated_at || inv.created_at || new Date().toISOString(),
          })),
        });
      }
    }
  } catch (err) {
    console.warn('[DB] farm_facilities table query skipped or pending migration:', err);
  }

  // Fallback to blueprintData.facilities if relational query produced no rows
  if (facilities.length === 0) {
    facilities = Array.isArray(blueprintData.facilities) ? blueprintData.facilities : [];
  }

  // Resilient sanitize: ensure every facility always has a valid inventories array, timeLogs array, category, and switch states
  facilities = facilities.map((f) => {
    const hasInv =
      f.hasInventory !== undefined
        ? f.hasInventory
        : f.facilityFunction === 'inventory' || f.facilityFunction === 'both';
    const hasSched =
      f.hasSchedule !== undefined
        ? f.hasSchedule
        : f.facilityFunction === 'time_keeping' || f.facilityFunction === 'both';

    return {
      ...f,
      category: f.category || 'storage',
      facilityFunction:
        f.facilityFunction ||
        (hasInv && hasSched ? 'both' : hasInv ? 'inventory' : hasSched ? 'time_keeping' : 'none'),
      hasInventory: hasInv,
      hasSchedule: hasSched,
      icon: f.icon || 'package',
      color: f.color || '#475569',
      inventoryName: f.inventoryName || `${f.name} Inventory`,
      scheduleName: f.scheduleName || `${f.name} Schedule`,
      inventories: Array.isArray(f.inventories) ? f.inventories : [],
      timeLogs: Array.isArray(f.timeLogs) ? f.timeLogs : [],
    };
  });

  // Load custom inventory/schedule names and contents from farm_layout_facilities if available
  try {
    const layoutFacilityRows = await db.all<any>(
      `SELECT * FROM farm_layout_facilities WHERE farm_layout_id = ?`,
      [layoutRow.id]
    );
    if (layoutFacilityRows && layoutFacilityRows.length > 0) {
      for (const fac of facilities) {
        const matchingRows = layoutFacilityRows.filter((r: any) => r.facility_id === fac.id);
        if (matchingRows.length > 0) {
          let foundInv = false;
          let foundSched = false;
          for (const row of matchingRows) {
            if (row.type === 'inventory') {
              foundInv = true;
              fac.hasInventory = true;
              fac.inventoryName = row.name;
              if (row.contents) {
                try {
                  const parsed = JSON.parse(row.contents);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    fac.inventories = parsed;
                  }
                } catch {}
              }
            } else if (row.type === 'time') {
              foundSched = true;
              fac.hasSchedule = true;
              fac.scheduleName = row.name;
              if (row.contents) {
                try {
                  const parsed = JSON.parse(row.contents);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    fac.timeLogs = parsed;
                  }
                } catch {}
              }
            }
          }
          fac.hasInventory = foundInv;
          fac.hasSchedule = foundSched;
          fac.facilityFunction =
            foundInv && foundSched ? 'both' : foundInv ? 'inventory' : foundSched ? 'time_keeping' : 'none';
        }
      }
    }
  } catch (err) {
    console.warn('[DB] farm_layout_facilities query skipped or pending migration:', err);
  }

  const structures = await db.all<GardenStructureRow>(
    `SELECT * FROM garden_structures
     WHERE farm_layout_id = ?
     ORDER BY display_order ASC, created_at ASC`,
    [layoutRow.id]
  );

  // Resilient fallback: If no plots found in blueprint_data_json items, but garden_structures exist:
  if (plots.length === 0 && structures && structures.length > 0) {
    plots = structures.map((s: any, idx) => ({
      id: s.source_item_id || s.id,
      label: s.label || `Plot ${idx + 1}`,
      x: Number(s.x ?? (4 + (idx % 4) * 3.5)),
      y: Number(s.z ?? s.y ?? (4 + Math.floor(idx / 4) * 3.5)),
      widthM: Number(s.width_m ?? s.widthM ?? 2),
      heightM: Number(s.depth_m ?? s.heightM ?? s.height_m ?? 1),
      color: PLOT_COLORS[idx % PLOT_COLORS.length],
      rotation: Number(s.rotation ?? s.rotationY ?? 0),
      zoneId: s.zone_id || s.zoneId || undefined,
    }));
  }

  const loadedResult: LoadedLayout = {
    layoutId: layoutRow.id,
    plots,
    zones,
    facilities,
    structures: structures || [],
    widthM: blueprintData.widthM || layoutRow.blueprint_width_m || CANVAS_WORLD_WIDTH,
    heightM: blueprintData.heightM || layoutRow.blueprint_height_m || CANVAS_WORLD_HEIGHT,
  };

  setCachedFarmLayout(farmId, loadedResult);
  return loadedResult;
}

/**
 * Save the designer's plot layout to the database.
 *
 * - Creates or updates the farm_layouts row with plots, zones, and facilities.
 * - Syncs garden_structures: preserves existing IDs where possible
 *   (so crop_cycles aren't orphaned), creates new ones, deletes removed ones.
 */
export async function saveFarmLayout(
  farmId: string,
  plots: DesignerPlot[],
  worldWidth: number,
  worldHeight: number,
  zones: FarmZone[] = [],
  facilities: FarmFacility[] = []
): Promise<string> {
  const db = getDatabase();

  // Get or create the layout row
  let layoutRow = await db.get<any>(
    'SELECT * FROM farm_layouts WHERE farm_id = ?',
    [farmId]
  );

  const farm = await db.get<any>('SELECT * FROM farms WHERE id = ?', [farmId]);
  if (!farm) {
    throw new Error('Cannot save layout: farm not found.');
  }

  let layoutId = layoutRow?.id || generateUUID();
  const effectiveUserId = farm.user_id;
  const userId = effectiveUserId;

  // Prepare custom facility records for farm_layout_facilities (1 for inventory, 1 for schedule, or 2 if both)
  const layoutFacilityRowsToSync: {
    id: string;
    user_id: string;
    farm_id: string;
    farm_layout_id: string;
    facility_id: string;
    name: string;
    type: 'inventory' | 'time';
    contents: string;
  }[] = [];

  for (const fac of facilities) {
    const isInventory =
      fac.hasInventory !== undefined
        ? fac.hasInventory === true
        : fac.facilityFunction === 'inventory' || fac.facilityFunction === 'both';

    const isTime =
      fac.hasSchedule !== undefined
        ? fac.hasSchedule === true
        : fac.facilityFunction === 'time_keeping' || fac.facilityFunction === 'both';

    if (isInventory) {
      const invName = fac.inventoryName?.trim() || `${fac.name} Inventory`;
      layoutFacilityRowsToSync.push({
        id: generateUUID(),
        user_id: effectiveUserId,
        farm_id: farmId,
        farm_layout_id: layoutId,
        facility_id: fac.id,
        name: invName,
        type: 'inventory',
        contents: JSON.stringify(fac.inventories || []),
      });
    }

    if (isTime) {
      const schedName = fac.scheduleName?.trim() || `${fac.name} Schedule`;
      layoutFacilityRowsToSync.push({
        id: generateUUID(),
        user_id: effectiveUserId,
        farm_id: farmId,
        farm_layout_id: layoutId,
        facility_id: fac.id,
        name: schedName,
        type: 'time',
        contents: JSON.stringify(fac.timeLogs || []),
      });
    }
  }

  // Build blueprint data
  const blueprintItems = plots.map(designerPlotToBlueprintItem);

  // Calculate bounds
  const bounds = plots.length > 0
    ? plots.reduce(
        (acc, p) => ({
          minX: Math.min(acc.minX, p.x - p.widthM / 2),
          maxX: Math.max(acc.maxX, p.x + p.widthM / 2),
          minZ: Math.min(acc.minZ, p.y - p.heightM / 2),
          maxZ: Math.max(acc.maxZ, p.y + p.heightM / 2),
        }),
        { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
      )
    : { minX: 0, maxX: worldWidth, minZ: 0, maxZ: worldHeight };

  const blueprintData = {
    version: 3,
    widthM: worldWidth,
    heightM: worldHeight,
    bounds,
    zones,
    facilities,
    items: blueprintItems,
  };

  const structureCounts = {
    bed: plots.length,
    trellis: 0,
    facility: facilities.length,
    zone: zones.length,
  };

  const existingBp = parseJsonSafe<any>(layoutRow?.blueprint_data_json, null);
  const isFirstTimeLayout =
    !layoutRow ||
    !existingBp ||
    ((existingBp.items?.length ?? 0) === 0 && (existingBp.facilities?.length ?? 0) === 0);

  const layoutAction = isFirstTimeLayout ? 'CREATED_LAYOUT' : 'UPDATED_LAYOUT';

  await db.transaction(async (tx) => {
    if (!layoutRow) {
      // Create new layout row
      await tx.run(
        `INSERT INTO farm_layouts (
          id, user_id, farm_id,
          blueprint_data_json, blueprint_image_path,
          blueprint_width_m, blueprint_height_m,
          snapshot_image_paths_json, structure_counts_json,
          unity_state_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, '[]', ?, '{}', datetime('now'), datetime('now'))`,
        [
          layoutId,
          userId,
          farmId,
          JSON.stringify(blueprintData),
          worldWidth,
          worldHeight,
          JSON.stringify(structureCounts),
        ]
      );
    } else {
      // Update existing layout row
      await tx.run(
        `UPDATE farm_layouts SET
          blueprint_data_json = ?,
          blueprint_width_m = ?,
          blueprint_height_m = ?,
          structure_counts_json = ?,
          updated_at = datetime('now')
        WHERE id = ?`,
        [
          JSON.stringify(blueprintData),
          worldWidth,
          worldHeight,
          JSON.stringify(structureCounts),
          layoutId,
        ]
      );
    }

    // --- Sync garden_structures ---

    // Get existing structures for this layout
    const existingStructures = await tx.all<GardenStructureRow>(
      'SELECT * FROM garden_structures WHERE farm_layout_id = ?',
      [layoutId]
    );
    const existingBySourceId = new Map<string, GardenStructureRow>();
    for (const s of existingStructures || []) {
      if (s.source_item_id) {
        existingBySourceId.set(s.source_item_id, s);
      }
    }

    // Determine which structures to keep, create, or delete
    const plotIds = new Set(plots.map((p) => p.id));
    const structuresToDelete = (existingStructures || []).filter(
      (s) => s.source_item_id && !plotIds.has(s.source_item_id)
    );

    // Delete removed structures (and their crop_cycles)
    for (const structure of structuresToDelete) {
      await tx.run('DELETE FROM crop_cycles WHERE garden_structure_id = ?', [structure.id]);
      await tx.run('DELETE FROM garden_structures WHERE id = ?', [structure.id]);
    }

    // Create or update structures for each plot
    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i];
      const existing = existingBySourceId.get(plot.id);

      if (existing) {
        // Update existing structure
        await tx.run(
          `UPDATE garden_structures SET
            label = ?,
            display_order = ?,
            updated_at = datetime('now')
          WHERE id = ?`,
          [plot.label, i, existing.id]
        );
      } else {
        // Create new structure
        const structureId = generateUUID();
        await tx.run(
          `INSERT INTO garden_structures (
            id, user_id, farm_layout_id,
            structure_type_id, source_item_id,
            label, display_order, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, 1, ?, ?, ?, 'empty', datetime('now'), datetime('now'))`,
          [structureId, userId, layoutId, plot.id, plot.label, i]
        );
      }
    }

    // --- Sync farm_facilities & facility_inventories ---
    try {
      const existingFacilities = await tx.all<any>(
        'SELECT * FROM farm_facilities WHERE farm_layout_id = ?',
        [layoutId]
      );
      const existingFacilityMap = new Map<string, any>();
      for (const f of existingFacilities || []) {
        existingFacilityMap.set(f.id, f);
      }

      const currentFacilityIds = new Set(facilities.map((f) => f.id));
      const facilitiesToDelete = (existingFacilities || []).filter(
        (f: any) => !currentFacilityIds.has(f.id)
      );

      for (const f of facilitiesToDelete) {
        await tx.run('DELETE FROM inventory_transactions WHERE facility_id = ?', [f.id]);
        await tx.run('DELETE FROM facility_inventories WHERE facility_id = ?', [f.id]);
        await tx.run('DELETE FROM farm_facilities WHERE id = ?', [f.id]);
      }

      for (const fac of facilities) {
        const existing = existingFacilityMap.get(fac.id);
        if (existing) {
          await tx.run(
            `UPDATE farm_facilities SET
              name = ?,
              category = ?,
              icon = ?,
              x = ?,
              y = ?,
              width_m = ?,
              height_m = ?,
              color = ?,
              zone_id = ?,
              updated_at = datetime('now')
            WHERE id = ?`,
            [
              fac.name,
              fac.category,
              fac.icon,
              fac.x,
              fac.y,
              fac.widthM,
              fac.heightM,
              fac.color,
              fac.zoneId || null,
              fac.id,
            ]
          );
        } else {
          await tx.run(
            `INSERT INTO farm_facilities (
              id, user_id, farm_id, farm_layout_id, zone_id,
              name, category, icon, x, y, width_m, height_m, color, status,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`,
            [
              fac.id,
              userId,
              farmId,
              layoutId,
              fac.zoneId || null,
              fac.name,
              fac.category,
              fac.icon,
              fac.x,
              fac.y,
              fac.widthM,
              fac.heightM,
              fac.color,
            ]
          );
        }

        // Sync inventories for this facility
        const existingInvs = await tx.all<any>(
          'SELECT * FROM facility_inventories WHERE facility_id = ?',
          [fac.id]
        );
        const existingInvMap = new Map<string, any>();
        for (const inv of existingInvs || []) {
          existingInvMap.set(inv.id, inv);
        }

        const currentInvIds = new Set((fac.inventories || []).map((i) => i.id));
        const invsToDelete = (existingInvs || []).filter((inv: any) => !currentInvIds.has(inv.id));
        for (const inv of invsToDelete) {
          await tx.run('DELETE FROM facility_inventories WHERE id = ?', [inv.id]);
        }

        for (const inv of fac.inventories || []) {
          const existingInv = existingInvMap.get(inv.id);
          if (existingInv) {
            await tx.run(
              `UPDATE facility_inventories SET
                name = ?,
                category = ?,
                quantity = ?,
                unit = ?,
                status = ?,
                notes = ?,
                updated_at = datetime('now')
              WHERE id = ?`,
              [
                inv.name,
                inv.category,
                inv.quantity,
                inv.unit,
                inv.status,
                inv.notes || null,
                inv.id,
              ]
            );
          } else {
            await tx.run(
              `INSERT INTO facility_inventories (
                id, user_id, farm_id, facility_id,
                name, category, quantity, unit, status, notes,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
              [
                inv.id,
                userId,
                farmId,
                fac.id,
                inv.name,
                inv.category,
                inv.quantity,
                inv.unit,
                inv.status,
                inv.notes || null,
              ]
            );
          }
        }
      }
    } catch (err) {
      console.warn('[DB] farm_facilities table sync skipped or pending migration:', err);
    }

    // --- Sync farm_layout_facilities table locally ---
    // Stores 1 row for inventory, 1 row for schedule, or 2 rows if both
    try {
      await tx.run(
        'DELETE FROM farm_layout_facilities WHERE farm_layout_id = ?',
        [layoutId]
      );

      for (const row of layoutFacilityRowsToSync) {
        await tx.run(
          `INSERT INTO farm_layout_facilities (
            id, user_id, farm_id, farm_layout_id, facility_id,
            name, type, contents, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [
            row.id,
            row.user_id,
            row.farm_id,
            row.farm_layout_id,
            row.facility_id,
            row.name,
            row.type,
            row.contents,
          ]
        );
      }
      console.log(`[LayoutDesigner][LocalDB] Synced ${layoutFacilityRowsToSync.length} facility records to farm_layout_facilities.`);
    } catch (err) {
      console.warn('[DB] farm_layout_facilities local SQLite sync skipped or pending migration:', err);
    }

    // Log farm audit action for Farm History and Notification Center
    await logFarmAuditAction(tx, farmId, userId, layoutAction, {
      bedCount: plots.length,
      facilityCount: facilities.length,
      zoneCount: zones.length,
      widthM: worldWidth,
      heightM: worldHeight,
      plotNames: plots.map((p) => p.label).filter(Boolean),
    });
  });



  console.log('[LayoutDesigner][DB] Saved farm layout.', {
    farmId,
    layoutId,
    plotCount: plots.length,
    facilityRecordsCount: layoutFacilityRowsToSync.length,
  });

  const savedResult: LoadedLayout = {
    layoutId,
    plots,
    zones,
    facilities,
    structures: [],
    widthM: worldWidth,
    heightM: worldHeight,
  };
  setCachedFarmLayout(farmId, savedResult);

  return layoutId;
}

/**
 * Query other farms belonging to the user that have layouts,
 * which can be imported into the current designer canvas.
 */
export async function getAvailableFarmsForImport(
  currentFarmId: string
): Promise<AvailableFarmForImport[]> {
  const db = getDatabase();

  const farms = await db.all<any>(
    'SELECT * FROM farms WHERE id != ? ORDER BY farm_name ASC',
    [currentFarmId]
  );

  const results: AvailableFarmForImport[] = [];

  for (const farm of farms || []) {
    const layout = await loadFarmLayout(farm.id);
    if (layout && (layout.plots.length > 0 || layout.facilities.length > 0 || layout.zones.length > 0)) {
      results.push({
        farmId: farm.id,
        farmName: farm.farm_name,
        location: farm.location,
        areaSqm: farm.area_sqm,
        plotCount: layout.plots.length,
        zoneCount: layout.zones.length,
        facilityCount: layout.facilities.length,
        layout,
      });
    }
  }

  return results;
}

/**
 * Creates a brand new Master Farm entry in SQLite, combines all
 * selected farm layouts into a spacious multi-zone estate layout,
 * and returns the new master farm's ID.
 */
export async function createMasterFarmFromLayouts(
  userId: string,
  estateName: string,
  selectedFarmIds: string[]
): Promise<string> {
  const db = getDatabase();
  const newFarmId = generateUUID();

  // 1. Calculate aggregated area and create Master Farm entry
  let totalAreaSqm = 0;
  for (const fId of selectedFarmIds) {
    const f = await db.get<any>('SELECT area_sqm FROM farms WHERE id = ?', [fId]);
    if (f?.area_sqm) totalAreaSqm += Number(f.area_sqm);
  }
  if (totalAreaSqm === 0) totalAreaSqm = 2500;

  await db.run(
    `INSERT INTO farms (
      id, user_id, farm_name, location, area_sqm, description, created_at, updated_at
    ) VALUES (?, ?, ?, 'Master Farm Estate', ?, 'Combined master plan of multiple farm parcels', datetime('now'), datetime('now'))`,
    [newFarmId, userId, estateName, totalAreaSqm]
  );

  // 2. Aggregate layouts into spacious zones
  const allPlots: DesignerPlot[] = [];
  const allZones: FarmZone[] = [];
  const allFacilities: FarmFacility[] = [];

  let currentOffsetX = 4;
  let currentOffsetY = 4;
  let rowMaxHeight = 0;
  let maxDimX = 36;
  let maxDimY = 36;

  const ZONE_PALETTES = [
    { color: '#2D6A4F', fill: 'rgba(45, 106, 79, 0.08)' },
    { color: '#8C4522', fill: 'rgba(140, 69, 34, 0.08)' },
    { color: '#1E40AF', fill: 'rgba(30, 64, 175, 0.08)' },
    { color: '#B45309', fill: 'rgba(180, 83, 9, 0.08)' },
    { color: '#047857', fill: 'rgba(4, 120, 87, 0.08)' },
    { color: '#6D28D9', fill: 'rgba(109, 40, 217, 0.08)' },
  ];

  for (let i = 0; i < selectedFarmIds.length; i++) {
    const fId = selectedFarmIds[i];
    const farm = await db.get<any>('SELECT farm_name FROM farms WHERE id = ?', [fId]);
    const layout = await loadFarmLayout(fId);
    if (!layout) continue;

    const farmName = farm?.farm_name || `Parcel ${i + 1}`;

    // Calculate tight bounding box of occupied items (plots + facilities + internal zones)
    const allItems: { x: number; y: number; w: number; h: number }[] = [
      ...layout.plots.map((p) => ({ x: p.x, y: p.y, w: p.widthM, h: p.heightM })),
      ...layout.facilities.map((f) => ({ x: f.x, y: f.y, w: f.widthM, h: f.heightM })),
      ...layout.zones.map((z) => ({ x: z.x, y: z.y, w: z.widthM, h: z.heightM })),
    ];

    let zoneW = 8;
    let zoneH = 8;
    let contentCenterX = (layout.widthM || 12) / 2;
    let contentCenterY = (layout.heightM || 12) / 2;

    if (allItems.length > 0) {
      const minX = Math.min(...allItems.map((it) => it.x - it.w / 2));
      const maxX = Math.max(...allItems.map((it) => it.x + it.w / 2));
      const minY = Math.min(...allItems.map((it) => it.y - it.h / 2));
      const maxY = Math.max(...allItems.map((it) => it.y + it.h / 2));

      const occupiedW = maxX - minX;
      const occupiedH = maxY - minY;

      const PADDING = 1.0;
      zoneW = Math.max(4, Math.ceil(occupiedW + PADDING * 2));
      zoneH = Math.max(4, Math.ceil(occupiedH + PADDING * 2));
      contentCenterX = (minX + maxX) / 2;
      contentCenterY = (minY + maxY) / 2;
    }

    // If parcel width causes row to exceed ~44m, wrap to next row
    if (currentOffsetX > 4 && currentOffsetX + zoneW > 44) {
      currentOffsetX = 4;
      currentOffsetY += rowMaxHeight + 4;
      rowMaxHeight = 0;
    }

    const zoneId = generateUUID();
    const palette = ZONE_PALETTES[i % ZONE_PALETTES.length];

    // Create enclosing zone for this farm parcel
    const newZone: FarmZone = {
      id: zoneId,
      name: farmName,
      code: farmName.substring(0, 3).toUpperCase(),
      zoneType: layout.zones.length > 0 && layout.zones[0].zoneType ? layout.zones[0].zoneType : 'open_field',
      organicStatus: 'certified_organic',
      x: Math.round((currentOffsetX + zoneW / 2) * 10) / 10,
      y: Math.round((currentOffsetY + zoneH / 2) * 10) / 10,
      widthM: zoneW,
      heightM: zoneH,
      color: palette.color,
      fillColor: palette.fill,
      isCompoundAsset: true,
      isLockedGroup: true,
      sourceFarmId: fId,
    };
    allZones.push(newZone);

    // Map plots into the zone
    layout.plots.forEach((p) => {
      allPlots.push({
        ...p,
        id: generateUUID(),
        label: p.label,
        zoneId: zoneId,
        x: Math.round((newZone.x + (p.x - contentCenterX)) * 10) / 10,
        y: Math.round((newZone.y + (p.y - contentCenterY)) * 10) / 10,
      });
    });

    // Map facilities into the zone
    layout.facilities.forEach((f) => {
      allFacilities.push({
        ...f,
        id: generateUUID(),
        zoneId: zoneId,
        x: Math.round((newZone.x + (f.x - contentCenterX)) * 10) / 10,
        y: Math.round((newZone.y + (f.y - contentCenterY)) * 10) / 10,
      });
    });

    rowMaxHeight = Math.max(rowMaxHeight, zoneH);
    maxDimX = Math.max(maxDimX, currentOffsetX + zoneW + 4);
    maxDimY = Math.max(maxDimY, currentOffsetY + zoneH + 4);

    currentOffsetX += zoneW + 4;
  }

  // 3. Save layout to the new farm with ample world dimensions
  const worldW = Math.max(maxDimX, 36);
  const worldH = Math.max(maxDimY, 36);
  await saveFarmLayout(newFarmId, allPlots, worldW, worldH, allZones, allFacilities);

  return newFarmId;
}

/**
 * Detect whether a farm or layout record represents a Master Estate layout.
 */
export function isMasterFarmRecord(farm: any, layoutRecord?: any): boolean {
  if (!farm && !layoutRecord) return false;
  if (farm) {
    const loc = (farm.location || '').toLowerCase();
    const desc = (farm.description || '').toLowerCase();
    const name = (farm.farm_name || '').toLowerCase();
    if (loc.includes('master farm estate') || loc.includes('master estate')) return true;
    if (desc.includes('combined master plan') || desc.includes('master farm parcel') || desc.includes('master estate')) return true;
    if (name.includes('master') && (desc.includes('master') || loc.includes('master'))) return true;
  }
  if (layoutRecord) {
    if (layoutRecord.blueprint_data_json) {
      try {
        const bp =
          typeof layoutRecord.blueprint_data_json === 'string'
            ? JSON.parse(layoutRecord.blueprint_data_json)
            : layoutRecord.blueprint_data_json;
        if (Array.isArray(bp?.zones) && bp.zones.some((z: any) => z.isCompoundAsset || z.sourceFarmId)) {
          return true;
        }
      } catch {}
    }
    if (Array.isArray(layoutRecord.zones) && layoutRecord.zones.some((z: any) => z.isCompoundAsset || z.sourceFarmId)) {
      return true;
    }
  }
  return false;
}

/**
 * Fetch a single farm record by ID from local SQLite.
 */
export async function getFarmDetails(farmId: string): Promise<any | null> {
  try {
    const db = getDatabase();
    const farm = await db.get<any>('SELECT * FROM farms WHERE id = ?', [farmId]);
    if (farm) {
      setCachedFarmInfo(farmId, {
        name: farm.farm_name || 'Master Farm Map',
        location: farm.location || '',
        areaSqm: Number(farm.area_sqm || 0),
      });
    }
    return farm || null;
  } catch (e) {
    console.warn('[LayoutDesigner][DB] Failed to get farm details:', e);
    return null;
  }
}

/**
 * Delete a specific facility record ('inventory' or 'time') from farm_layout_facilities
 * in local SQLite (synced via PowerSync).
 */
export async function deleteFarmLayoutFacilityRecord(
  facilityId: string,
  type: 'inventory' | 'time'
): Promise<void> {
  try {
    const db = getDatabase();
    await db.run(
      'DELETE FROM farm_layout_facilities WHERE facility_id = ? AND type = ?',
      [facilityId, type]
    );
    console.log(`[LayoutDesigner][LocalDB] Deleted ${type} record for facility ${facilityId}`);
  } catch (err) {
    console.warn('[LayoutDesigner][LocalDB] Failed to delete from local farm_layout_facilities:', err);
  }
}

/**
 * Delete all facility records for a given facilityId (e.g. when facility is removed from layout)
 * in local SQLite (synced via PowerSync).
 */
export async function deleteAllFacilityRecordsForFacility(
  facilityId: string
): Promise<void> {
  try {
    const db = getDatabase();
    await db.run('DELETE FROM farm_layout_facilities WHERE facility_id = ?', [facilityId]);
    console.log(`[LayoutDesigner][LocalDB] Deleted all records for facility ${facilityId}`);
  } catch (err) {
    console.warn('[LayoutDesigner][LocalDB] Failed to delete all facility records:', err);
  }
}
