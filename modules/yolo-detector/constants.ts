export const PLANT_CONFIDENCE_THRESHOLD = 0.5;
export const HEALTH_CONFIDENCE_THRESHOLD = 0.25; // Matches Hugging Face threshold gate
export const INPUT_SIZE = 640;

// 🟢 VERIFIED MODEL INDEX MATCHES
export const HEALTH_CLASS_MAP: Record<number, string> = {
  0: 'aphid_cluster',
  1: 'caterpillar',
  2: 'leaf_discoloration',
  3: 'leaf_hole',
  4: 'mold_fungus',
  5: 'slug_snail',
};

export const NUM_HEALTH_CLASSES = Object.keys(HEALTH_CLASS_MAP).length;

export const HEALTH_CLASS_LABELS: Record<string, string> = {
  aphid_cluster: 'Aphid Cluster',
  caterpillar: 'Caterpillar',
  leaf_discoloration: 'Leaf Discoloration',
  leaf_hole: 'Leaf Holes',
  mold_fungus: 'Mold / Fungus',
  slug_snail: 'Slug / Snail',
  plants: 'Healthy Plant',
};

export const HEALTH_RECOMMENDATIONS: Record<string, string> = {
  aphid_cluster: 'Apply neem oil spray or introduce natural predators like ladybugs.',
  caterpillar: 'Hand-pick caterpillars or apply Bacillus thuringiensis (BT) spray.',
  leaf_discoloration: 'Check soil pH and nutrient levels. Apply balanced fertilizer.',
  leaf_hole: 'Check for pests like beetles or caterpillars feeding on the crop leaves.',
  mold_fungus: 'Improve air circulation around plants. Apply fungicide if needed.',
  slug_snail: 'Set up beer traps or copper barriers. Apply diatomaceous earth.',
  plants: 'Plant appears healthy. Continue regular care and monitoring.',
};

export const PLANT_CLASS_NAME = 'plant';
