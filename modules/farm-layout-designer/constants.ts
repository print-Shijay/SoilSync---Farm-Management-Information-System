/**
 * Farm Layout Designer — Constants & Design Tokens
 *
 * Grid configuration, colors, default sizes, and layout parameters.
 */

import type { FacilityFunction } from './types';

/** Units per grid cell. Plots snap to this increment. */
export const GRID_CELL_SIZE = 0.5;

/** Snap threshold in units — plots snap when within this distance of a grid line. */
export const SNAP_THRESHOLD = 0.15;

/** Minimum plot dimensions in units. */
export const MIN_PLOT_WIDTH_M = 0.5;
export const MIN_PLOT_HEIGHT_M = 0.5;

/** Default plot dimensions when adding a new plot (units). */
export const DEFAULT_PLOT_WIDTH_M = 2;
export const DEFAULT_PLOT_HEIGHT_M = 1;

/** Canvas configuration. */
export const CANVAS_PADDING = 32;
export const CANVAS_WORLD_WIDTH = 12;
export const CANVAS_WORLD_HEIGHT = 16;

/** Pixels per unit — how many screen pixels represent one abstract unit on the canvas. */
export const PIXELS_PER_UNIT = 60;

/** Resize handle radius in pixels. */
export const HANDLE_RADIUS = 7;
export const HANDLE_HIT_SLOP = 6;

/**
 * Earth-tone color palette for plots.
 * Each new plot cycles through these colors.
 */
export const PLOT_COLORS = [
  '#8C4522', // cognac
  '#8C7C70', // taupe
  '#D99C2B', // gold
  '#5B7049', // sage
  '#8B5E3C', // warm brown
  '#A67C52', // terra cotta
  '#6B5B45', // espresso taupe
  '#B8860B', // dark gold
] as const;

/** Grid line colors. */
export const GRID_COLOR_MAJOR = '#D4C9BD';
export const GRID_COLOR_MINOR = '#EBE3D9';

/** Canvas background. */
export const CANVAS_BG = '#FBF8F4';
export const CANVAS_BORDER = '#8C7C70';

/** Selected plot highlight. */
export const SELECTED_BORDER_COLOR = '#8C4522';
export const SELECTED_BORDER_WIDTH = 3;
export const DEFAULT_BORDER_COLOR = '#8C7C70';
export const DEFAULT_BORDER_WIDTH = 1.5;

/** Plot label styling. */
export const PLOT_LABEL_COLOR = '#ffffff';
export const PLOT_DIMENSION_COLOR = 'rgba(255,255,255,0.85)';

// ─── Master Plan Facility Presets ─────────────────────────────

export type FacilityTemplate = {
  name: string;
  category: 'storage' | 'processing' | 'livestock' | 'housing' | 'amenity';
  facilityFunction: 'inventory' | 'time_keeping' | 'both';
  icon: string;
  defaultWidthM: number;
  defaultHeightM: number;
  color: string;
  initialItems: {
    name: string;
    category: 'tool' | 'seedling' | 'concoction' | 'fertilizer' | 'harvest' | 'equipment' | 'feed' | 'supplies';
    quantity: number;
    unit: string;
    status: 'good' | 'low_stock' | 'ready' | 'fermenting' | 'maintenance' | 'in_use';
  }[];
};

export const FACILITY_FUNCTION_LABELS: Record<FacilityFunction, { label: string; icon: string; description: string }> = {
  inventory: {
    label: 'Inventory',
    icon: '📦',
    description: 'Physical equipment, tools, seeds, fertilizers & produce storage',
  },
  time_keeping: {
    label: 'Time Keeping',
    icon: '⏱️',
    description: 'Staff attendance, labor check-in, and task duration logging',
  },
  both: {
    label: 'Inventory & Time',
    icon: '🔄',
    description: 'Hybrid facility with supplies storage and labor station',
  },
  none: {
    label: 'Off / None',
    icon: '⚪',
    description: 'Facility without active inventory or time tracking',
  },
};

export const FACILITY_TEMPLATES: FacilityTemplate[] = [
  {
    name: 'Generic Facility',
    category: 'storage',
    facilityFunction: 'inventory',
    icon: 'package',
    defaultWidthM: 3.5,
    defaultHeightM: 3.5,
    color: '#475569', // slate 600
    initialItems: [],
  },
  {
    name: 'Tools Storage',
    category: 'storage',
    facilityFunction: 'inventory',
    icon: 'wrench',
    defaultWidthM: 3.5,
    defaultHeightM: 3.5,
    color: '#334155', // slate 700 (dark gray)
    initialItems: [
      { name: 'Knapsack Sprayer (16L)', category: 'tool', quantity: 2, unit: 'units', status: 'good' },
      { name: 'Pruning Shears', category: 'tool', quantity: 6, unit: 'units', status: 'good' },
      { name: 'Drip Irrigation Kit', category: 'equipment', quantity: 3, unit: 'sets', status: 'good' },
    ],
  },
  {
    name: 'Nursery & Sowing Area',
    category: 'processing',
    facilityFunction: 'inventory',
    icon: 'sprout',
    defaultWidthM: 4.0,
    defaultHeightM: 4.0,
    color: '#BE185D', // pink 700 (magenta/pink like map)
    initialItems: [
      { name: 'Romaine Lettuce Seedlings', category: 'seedling', quantity: 180, unit: 'seedlings', status: 'ready' },
      { name: '104-Hole Germination Trays', category: 'supplies', quantity: 15, unit: 'trays', status: 'in_use' },
      { name: 'Organic Seed Starting Soil Mix', category: 'supplies', quantity: 5, unit: 'sacks', status: 'good' },
    ],
  },
  {
    name: 'Concoction Area',
    category: 'processing',
    facilityFunction: 'inventory',
    icon: 'flask',
    defaultWidthM: 3.5,
    defaultHeightM: 2.5,
    color: '#B91C1C', // red 700
    initialItems: [
      { name: 'Fermented Plant Juice (FPJ)', category: 'concoction', quantity: 15, unit: 'liters', status: 'ready' },
      { name: 'Fish Amino Acid (FAA)', category: 'concoction', quantity: 10, unit: 'liters', status: 'fermenting' },
      { name: 'Blackstrap Molasses', category: 'supplies', quantity: 25, unit: 'kg', status: 'good' },
    ],
  },
  {
    name: 'Vermi Composting Area',
    category: 'processing',
    facilityFunction: 'inventory',
    icon: 'recycle',
    defaultWidthM: 4.0,
    defaultHeightM: 2.5,
    color: '#15803D', // green 700
    initialItems: [
      { name: 'Harvested Vermicast', category: 'fertilizer', quantity: 20, unit: 'sacks (50kg)', status: 'ready' },
      { name: 'African Nightcrawlers (ANC)', category: 'supplies', quantity: 8, unit: 'kg breeders', status: 'good' },
    ],
  },
  {
    name: 'Pig Pen & Poultry',
    category: 'livestock',
    facilityFunction: 'inventory',
    icon: 'egg',
    defaultWidthM: 4.5,
    defaultHeightM: 4.0,
    color: '#0369A1', // sky 700 (blue like map)
    initialItems: [
      { name: 'Organic Grower Feed', category: 'feed', quantity: 10, unit: 'sacks', status: 'good' },
      { name: 'Clean Egg Trays', category: 'supplies', quantity: 30, unit: 'trays', status: 'good' },
    ],
  },
  {
    name: 'Post-Harvest Area & Staff House',
    category: 'housing',
    facilityFunction: 'both',
    icon: 'home',
    defaultWidthM: 4.5,
    defaultHeightM: 3.5,
    color: '#1D4ED8', // blue 700
    initialItems: [
      { name: 'Food Grade Produce Crates', category: 'harvest', quantity: 35, unit: 'crates', status: 'good' },
      { name: 'Digital Hanging Scale (50kg)', category: 'equipment', quantity: 1, unit: 'units', status: 'good' },
    ],
  },
  {
    name: 'Farm House & CR',
    category: 'housing',
    facilityFunction: 'time_keeping',
    icon: 'home',
    defaultWidthM: 4.0,
    defaultHeightM: 3.0,
    color: '#9333EA', // purple 600
    initialItems: [],
  },
  {
    name: 'Function Hall',
    category: 'amenity',
    facilityFunction: 'time_keeping',
    icon: 'home',
    defaultWidthM: 5.0,
    defaultHeightM: 3.5,
    color: '#0D9488', // teal 600
    initialItems: [],
  },
];

// ─── Master Plan Zone Presets ─────────────────────────────────

export type ZoneTemplate = {
  name: string;
  code: string;
  zoneType: 'greenhouse' | 'open_field' | 'nursery' | 'livestock' | 'facility';
  organicStatus: 'certified_organic' | 'in_conversion' | 'conventional';
  defaultWidthM: number;
  defaultHeightM: number;
  color: string;
  fillColor: string;
};

export const ZONE_TEMPLATES: ZoneTemplate[] = [
  {
    name: 'Generic Zone',
    code: 'ZONE',
    zoneType: 'open_field',
    organicStatus: 'certified_organic',
    defaultWidthM: 8,
    defaultHeightM: 8,
    color: '#3B82F6',
    fillColor: 'rgba(59, 130, 246, 0.08)',
  },
  {
    name: 'Greenhouse 1',
    code: 'GH1',
    zoneType: 'greenhouse',
    organicStatus: 'certified_organic',
    defaultWidthM: 10,
    defaultHeightM: 12,
    color: '#2D6A4F',
    fillColor: 'rgba(45, 106, 79, 0.08)',
  },
  {
    name: 'Greenhouse 2',
    code: 'GH2',
    zoneType: 'greenhouse',
    organicStatus: 'certified_organic',
    defaultWidthM: 6,
    defaultHeightM: 12,
    color: '#2D6A4F',
    fillColor: 'rgba(45, 106, 79, 0.08)',
  },
  {
    name: 'Area 3 (Open Field)',
    code: 'A3',
    zoneType: 'open_field',
    organicStatus: 'certified_organic',
    defaultWidthM: 12,
    defaultHeightM: 10,
    color: '#8C4522',
    fillColor: 'rgba(140, 69, 34, 0.06)',
  },
  {
    name: 'Area 1 & 2 (In Conversion)',
    code: 'OA1',
    zoneType: 'open_field',
    organicStatus: 'in_conversion',
    defaultWidthM: 12,
    defaultHeightM: 8,
    color: '#D99C2B',
    fillColor: 'rgba(217, 156, 43, 0.08)',
  },
];

export const INVENTORY_CATEGORY_LABELS: Record<string, string> = {
  tool: 'Tools & Hand Implements',
  equipment: 'Machinery & Systems',
  seedling: 'Seedlings & Germination',
  concoction: 'Organic Concoctions & Extracts',
  fertilizer: 'Fertilizers & Soil Amendments',
  harvest: 'Harvested Produce & Crates',
  feed: 'Animal Feeds & Supplements',
  supplies: 'Farm Supplies & Materials',
};

export const INVENTORY_STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  good: { label: 'In Stock / Good', bg: '#DCFCE7', text: '#15803D' },
  ready: { label: 'Ready for Use', bg: '#DCFCE7', text: '#15803D' },
  low_stock: { label: 'Low Stock Alert', bg: '#FEF3C7', text: '#B45309' },
  fermenting: { label: 'Fermenting / Brewing', bg: '#E0E7FF', text: '#4338CA' },
  maintenance: { label: 'Needs Repair', bg: '#FEE2E2', text: '#B91C1C' },
  in_use: { label: 'Active In Use', bg: '#F3E8FF', text: '#7E22CE' },
};

export type PlotTemplate = {
  name: string;
  label: string;
  widthM: number;
  heightM: number;
  description: string;
  category: 'bed' | 'raised_bed' | 'trellis' | 'square_foot';
};

export const PLOT_TEMPLATES: PlotTemplate[] = [
  {
    name: 'Standard Bed (2m × 1m)',
    label: 'Standard Bed',
    widthM: 2,
    heightM: 1,
    description: 'Standard bio-intensive direct seeding bed',
    category: 'bed',
  },
  {
    name: 'Long Field Bed (4m × 1m)',
    label: 'Long Bed',
    widthM: 4,
    heightM: 1,
    description: 'Extended open-field row bed for greens & root crops',
    category: 'bed',
  },
  {
    name: 'Raised Garden Bed (3m × 1.2m)',
    label: 'Raised Bed',
    widthM: 3,
    heightM: 1.2,
    description: 'Enclosed soil bed with optimal drainage',
    category: 'raised_bed',
  },
  {
    name: 'Trellis / Climber Row (3m × 0.8m)',
    label: 'Trellis Row',
    widthM: 3,
    heightM: 0.8,
    description: 'Vertical support line for beans, tomatoes & cucumbers',
    category: 'trellis',
  },
  {
    name: 'Square Foot Plot (1.5m × 1.5m)',
    label: 'Square Plot',
    widthM: 1.5,
    heightM: 1.5,
    description: 'Intensive grid block for herbs & companion flowers',
    category: 'square_foot',
  },
];


