import { ImageSourcePropType } from 'react-native';

export const cropIcons: Record<string, any> = {
  'Broccoli microgreens': require('../assets/images/crops/broccoli.jpg'),
  'Green Ice lettuce': require('../assets/images/crops/green_ice.jpg'),
  'Romaine lettuce': require('../assets/images/crops/romaine.jpg'),
  'Native pechay': require('../assets/images/crops/pechay.jpg'),
  'Upland kangkong': require('../assets/images/crops/kangkong.jpg'),
  'Mint/Yerba Buena': require('../assets/images/crops/mint.jpg'),
  'Cucumber': require('../assets/images/crops/cucumber.jpg'),
  'Okra': require('../assets/images/crops/okra.jpg'),
  'Sitaw': require('../assets/images/crops/sitaw.jpg'),
};

/**
 * Normalizes crop names for robust dictionary lookup
 */
function normalizeName(name?: string | null): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Finds a matching image asset for a crop name with case-insensitive and fuzzy alias matching.
 */
export function getCropImageSource(cropName?: string | null): ImageSourcePropType | null {
  if (!cropName) return null;

  if (cropIcons[cropName]) {
    return cropIcons[cropName];
  }

  const normalized = normalizeName(cropName);
  for (const [key, source] of Object.entries(cropIcons)) {
    if (normalizeName(key) === normalized) {
      return source;
    }
  }

  // Alias checks
  if (normalized.includes('broccoli')) return cropIcons['Broccoli microgreens'];
  if (normalized.includes('greenice')) return cropIcons['Green Ice lettuce'];
  if (normalized.includes('romaine')) return cropIcons['Romaine lettuce'];
  if (normalized.includes('pechay')) return cropIcons['Native pechay'];
  if (normalized.includes('kangkong')) return cropIcons['Upland kangkong'];
  if (normalized.includes('mint') || normalized.includes('yerba')) return cropIcons['Mint/Yerba Buena'];
  if (normalized.includes('cucumber')) return cropIcons['Cucumber'];
  if (normalized.includes('okra')) return cropIcons['Okra'];
  if (normalized.includes('sitaw') || normalized.includes('sitao')) return cropIcons['Sitaw'];

  return null;
}
