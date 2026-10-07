/**
 * Farm Layout Designer Module — Public API
 *
 * All public exports for the farm-layout-designer module.
 * Import from 'modules/farm-layout-designer' to use.
 */

// Main components
export { DesignerCanvas } from './components/DesignerCanvas';
export { EstateDesignerCanvas } from './components/EstateDesignerCanvas';
export { EstatePaletteCarousel } from './components/EstatePaletteCarousel';
export { FacilityInventorySheet } from './components/FacilityInventorySheet';
export { FacilityItem } from './components/FacilityItem';
export { ZoneContainer } from './components/ZoneContainer';
export { AddElementModal } from './components/AddElementModal';
export { BuildingPaletteCarousel } from './components/BuildingPaletteCarousel';
export { BuildingDockCard } from './components/BuildingDockCard';
export { CanvasActionDock } from './components/CanvasActionDock';
export { FacilitySizeModal, FacilitySizeModal as ElementSizeModal } from './components/FacilitySizeModal';
export { CanvasFootprint, FloatingDragGhost } from './components/DragPlacementOverlay';
export { FacilityContextMenu } from './components/FacilityContextMenu';
export { ZoneContextMenu } from './components/ZoneContextMenu';
export { MasterMap2DViewer } from './components/MasterMap2DViewer';
export { BUILDING_IMAGES, getBuildingImage } from './buildingAssets';

// Database operations
export {
  loadFarmLayout,
  saveFarmLayout,
  getAvailableFarmsForImport,
  createMasterFarmFromLayouts,
  isMasterFarmRecord,
  getFarmDetails,
  getCachedFarmLayout,
  getCachedFarmInfo,
  setCachedFarmLayout,
  setCachedFarmInfo,
  invalidateFarmLayoutCache,
  prefetchFarmLayout,
} from './db';

// Types
export type {
  DesignerPlot,
  DesignerState,
  DesignerSavePayload,
  LoadedLayout,
  BlueprintItem,
  FarmZone,
  FarmFacility,
  FacilityInventoryItem,
  ZoneType,
  OrganicStatus,
  FacilityCategory,
  FacilityFunction,
  FacilityTimeLog,
  AvailableFarmForImport,
} from './types';

// Utilities (for external use if needed)
export { createPlot, flipPlotOrientation } from './utils/plot-manager';
export { snapToGrid, formatDimensions, worldToScreen, screenToWorld } from './utils/grid';

// Constants (for external use, e.g. in BlueprintPreview)
export {
  PLOT_COLORS,
  PIXELS_PER_UNIT,
  PLOT_TEMPLATES,
  ZONE_TEMPLATES,
  FACILITY_TEMPLATES,
  FACILITY_FUNCTION_LABELS,
} from './constants';

