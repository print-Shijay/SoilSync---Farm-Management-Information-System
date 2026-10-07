/**
 * Farm Layout Designer — Type Definitions
 *
 * All TypeScript types/interfaces for the drag-and-resize plot designer.
 * Kept separate for clean imports across the module.
 */

/** A plot as it exists in the designer's working state (screen-friendly). */
export type DesignerPlot = {
  /** Unique ID — matches garden_structures.source_item_id when saved. */
  id: string;
  /** User-facing label, e.g. "Plot 1" or "GH1-P1". */
  label: string;
  /** Center X position in meters (world coordinates). */
  x: number;
  /** Center Y position in meters (world coordinates, maps to Z in blueprint). */
  y: number;
  /** Width in meters. */
  widthM: number;
  /** Height (depth) in meters. */
  heightM: number;
  /** Hex color for the plot fill. */
  color: string;
  /** Rotation in degrees (0 or 90 for simple flip). */
  rotation: number;
  /** Optional zone this plot belongs to (e.g. Greenhouse 1, Area 3). */
  zoneId?: string;
  /** Whether the plot is locked from moving/resizing. */
  isLocked?: boolean;
};

// ─── Master Plan: Environmental Zones & Boundaries ───────────

export type ZoneType = 'greenhouse' | 'open_field' | 'nursery' | 'livestock' | 'facility';
export type OrganicStatus = 'certified_organic' | 'in_conversion' | 'conventional';

export type FarmZone = {
  id: string;
  name: string;             // e.g. "Greenhouse 1", "Area 3", "Open Area 1"
  code: string;             // e.g. "GH1", "A3", "OA1"
  zoneType: ZoneType;
  organicStatus: OrganicStatus;
  x: number;                // Center X (meters)
  y: number;                // Center Y (meters)
  widthM: number;           // Width in meters
  heightM: number;          // Height in meters
  color: string;            // Border / badge color
  fillColor: string;        // Translucent container fill
  /** True if this zone represents an imported farm parcel as a single asset */
  isCompoundAsset?: boolean;
  /** When true, moving/tapping any contained element moves the entire compound parcel as one asset */
  isLockedGroup?: boolean;
  /** ID of the source farm if imported */
  sourceFarmId?: string;
  /** Whether the zone is locked from moving/resizing. */
  isLocked?: boolean;
};

// ─── Master Plan: Facilities & Non-Planting Structures ────────

export type FacilityCategory = 'storage' | 'processing' | 'livestock' | 'housing' | 'amenity';

/** Primary functional role for a facility: physical stock, labor time keeping, both, or none (switches off) */
export type FacilityFunction = 'inventory' | 'time_keeping' | 'both' | 'none';

export type FacilityInventoryItem = {
  id: string;
  name: string;             // e.g. "Knapsack Sprayer (16L)", "Romaine Seedling Trays", "FPJ Concoction"
  category: 'tool' | 'seedling' | 'concoction' | 'fertilizer' | 'harvest' | 'equipment' | 'feed' | 'supplies';
  quantity: number;
  unit: string;             // "units", "liters", "trays", "sacks", "kg"
  status: 'good' | 'low_stock' | 'ready' | 'fermenting' | 'maintenance' | 'in_use';
  notes?: string;
  updatedAt: string;
};

/** Staff labor, attendance, or task log entry recorded at a facility station */
export type FacilityTimeLog = {
  id: string;
  workerName: string;
  taskDescription: string;
  hours: number;
  date: string;             // YYYY-MM-DD
  areaTarget?: string;      // e.g. "Area 1", "Greenhouse 1", "Plot 4"
  notes?: string;
  createdAt: string;
};

export type FarmFacility = {
  id: string;
  name: string;             // e.g. "Tools Storage", "Concoction Area", "Farm House & CR"
  category: FacilityCategory;
  facilityFunction?: FacilityFunction; // 'inventory' | 'time_keeping' | 'both' | 'none'
  /** Toggle switch for inventory tracking: false by default */
  hasInventory?: boolean;
  /** Toggle switch for schedule/time tracking: false by default */
  hasSchedule?: boolean;
  icon: string;             // 'wrench' | 'flask' | 'sprout' | 'recycle' | 'home' | 'egg' | 'package'
  x: number;
  y: number;
  widthM: number;
  heightM: number;
  color: string;
  inventories: FacilityInventoryItem[];
  timeLogs?: FacilityTimeLog[];
  /** Custom name for the Inventory record, e.g. "Post Harvest Inventory" */
  inventoryName?: string;
  /** Custom name for the Schedule / Time record, e.g. "Post Harvest Schedule" */
  scheduleName?: string;
  /** Optional zone this facility belongs to. */
  zoneId?: string;
  /** Whether the facility is locked from moving/resizing. */
  isLocked?: boolean;
};

/**
 * Record structure for the farm_layout_facilities database table.
 * Stores 1 row for inventory, 1 row for schedule, or 2 rows if both.
 */
export type FarmLayoutFacilityRecord = {
  id: string;
  user_id: string;
  farm_id: string;
  farm_layout_id: string;
  facility_id: string;
  name: string;
  type: 'inventory' | 'time';
  contents: string; // JSON serialized array
  created_at?: string;
  updated_at?: string;
};

// ─── Designer State ──────────────────────────────────────────

export type SelectedElementType = 'plot' | 'zone' | 'facility';

/** The full designer state managed by DesignerCanvas. */
export type DesignerState = {
  plots: DesignerPlot[];
  zones: FarmZone[];
  facilities: FarmFacility[];
  selectedId: string | null;
  selectedType: SelectedElementType | null;
  hasUnsavedChanges: boolean;
};

/** Shape of a single item in blueprint_data_json.items (DB format). */
export type BlueprintItem = {
  id: string;
  label: string;
  type: 'bed' | 'trellis';
  x: number;
  z: number;
  rotationY: number;
  widthM: number;
  depthM: number;
  zoneId?: string;
};

/** Existing garden_structure row shape (read from DB). */
export type GardenStructureRow = {
  id: string;
  user_id: string;
  farm_layout_id: string;
  structure_type_id: number;
  source_item_id: string | null;
  label: string;
  display_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

/** Payload passed from the designer to the save function. */
export type DesignerSavePayload = {
  farmId: string;
  plots: DesignerPlot[];
  zones?: FarmZone[];
  facilities?: FarmFacility[];
};

/** Result from loading an existing layout. */
export type LoadedLayout = {
  layoutId: string;
  plots: DesignerPlot[];
  zones: FarmZone[];
  facilities: FarmFacility[];
  structures: GardenStructureRow[];
  widthM?: number;
  heightM?: number;
};

/** Which resize handle the user is dragging. */
export type ResizeDirection =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left';

/** Summary metadata of another farm available for import. */
export type AvailableFarmForImport = {
  farmId: string;
  farmName: string;
  location?: string;
  areaSqm?: number;
  plotCount: number;
  zoneCount: number;
  facilityCount: number;
  layout: LoadedLayout;
};

