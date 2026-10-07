/**
 * Farm Layout Designer — Building & Structure Image Assets
 *
 * Maps facilities, plot beds, and zones to 3D isometric illustrated game assets.
 */

export const BUILDING_IMAGES: Record<string, any> = {
  // Facilities
  'Tools Storage': require('../../assets/images/buildings/tools_storage.jpg'),
  'Nursery & Sowing Area': require('../../assets/images/buildings/nursery.jpg'),
  'Concoction Area': require('../../assets/images/buildings/concoction.jpg'),
  'Vermi Composting Area': require('../../assets/images/buildings/vermi_compost.jpg'),
  'Pig Pen & Poultry': require('../../assets/images/buildings/poultry_livestock.jpg'),
  'Post-Harvest Area & Staff House': require('../../assets/images/buildings/post_harvest.jpg'),
  'Farm House & CR': require('../../assets/images/buildings/farm_house.jpg'),
  'Function Hall': require('../../assets/images/buildings/function_hall.jpg'),
  'Generic Facility': require('../../assets/images/buildings/tools_storage.jpg'),

  // Plots & Beds
  'Standard Bed (2m × 1m)': require('../../assets/images/buildings/crop_bed.jpg'),
  'Standard Bed': require('../../assets/images/buildings/crop_bed.jpg'),
  'Long Field Bed (4m × 1m)': require('../../assets/images/buildings/crop_bed.jpg'),
  'Long Bed': require('../../assets/images/buildings/crop_bed.jpg'),
  'Raised Garden Bed (3m × 1.2m)': require('../../assets/images/buildings/crop_bed.jpg'),
  'Raised Bed': require('../../assets/images/buildings/crop_bed.jpg'),
  'Trellis / Climber Row (3m × 0.8m)': require('../../assets/images/buildings/trellis.jpg'),
  'Trellis Row': require('../../assets/images/buildings/trellis.jpg'),
  'Square Foot Plot (1.5m × 1.5m)': require('../../assets/images/buildings/crop_bed.jpg'),
  'Square Plot': require('../../assets/images/buildings/crop_bed.jpg'),

  // Zones
  'Greenhouse 1': require('../../assets/images/buildings/greenhouse.jpg'),
  'Greenhouse 2': require('../../assets/images/buildings/greenhouse.jpg'),
  'Generic Zone': require('../../assets/images/buildings/greenhouse.jpg'),
  'Area 3 (Open Field)': require('../../assets/images/buildings/crop_bed.jpg'),
  'Area 1 & 2 (In Conversion)': require('../../assets/images/buildings/crop_bed.jpg'),
};

/**
 * Helper to resolve the best image for an element given its name, label, or fallback.
 */
export function getBuildingImage(nameOrLabel?: string): any | null {
  if (!nameOrLabel) return null;
  if (BUILDING_IMAGES[nameOrLabel]) return BUILDING_IMAGES[nameOrLabel];

  // Fuzzy matches
  const lower = nameOrLabel.toLowerCase();
  if (lower.includes('tool')) return BUILDING_IMAGES['Tools Storage'];
  if (lower.includes('nursery') || lower.includes('sowing')) return BUILDING_IMAGES['Nursery & Sowing Area'];
  if (lower.includes('concoct')) return BUILDING_IMAGES['Concoction Area'];
  if (lower.includes('vermi') || lower.includes('compost')) return BUILDING_IMAGES['Vermi Composting Area'];
  if (lower.includes('pig') || lower.includes('poultr') || lower.includes('chicken')) return BUILDING_IMAGES['Pig Pen & Poultry'];
  if (lower.includes('post') || lower.includes('harvest') || lower.includes('crate')) return BUILDING_IMAGES['Post-Harvest Area & Staff House'];
  if (lower.includes('house') || lower.includes('office') || lower.includes('cabin')) return BUILDING_IMAGES['Farm House & CR'];
  if (lower.includes('hall') || lower.includes('pavilion')) return BUILDING_IMAGES['Function Hall'];
  if (lower.includes('trellis')) return BUILDING_IMAGES['Trellis Row'];
  if (lower.includes('greenhouse')) return BUILDING_IMAGES['Greenhouse 1'];
  if (lower.includes('bed') || lower.includes('plot')) return BUILDING_IMAGES['Standard Bed'];

  return null;
}
