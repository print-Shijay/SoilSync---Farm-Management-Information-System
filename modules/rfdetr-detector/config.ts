/**
 * RF-DETR / Roboflow configuration constants.
 *
 * Class name mapping ensures Roboflow predictions use the same
 * identifiers as the local YOLO model so the rest of the UI
 * (questionnaire, mitigation, bounding box overlays) works unchanged.
 */

const ROBOFLOW_API_URL = 'https://serverless.roboflow.com';

export function getRoboflowApiKey(): string {
  return process.env.EXPO_PUBLIC_ROBOFLOW_API_KEY ?? '';
}

export function getRoboflowModelId(): string {
  return process.env.EXPO_PUBLIC_ROBOFLOW_MODEL_ID ?? 'soilsync-health-detection/7';
}

export function getRoboflowInferenceUrl(): string {
  return `${ROBOFLOW_API_URL}/${getRoboflowModelId()}`;
}

/**
 * Map Roboflow class names → local YOLO class names.
 *
 * The Roboflow model may use slightly different labels (spaces, casing, etc.)
 * so we normalise them here to match the YOLO `HEALTH_CLASS_MAP` values used
 * throughout the app (questionnaire scores, mitigation lookup, condition labels).
 */
export const ROBOFLOW_TO_YOLO_CLASS: Record<string, string> = {
  // Exact matches (Roboflow label → YOLO key)
  aphid_cluster: 'aphid_cluster',
  'aphid cluster': 'aphid_cluster',
  'Aphid Cluster': 'aphid_cluster',
  caterpillar: 'caterpillar',
  Caterpillar: 'caterpillar',
  leaf_discoloration: 'leaf_discoloration',
  'leaf discoloration': 'leaf_discoloration',
  'Leaf Discoloration': 'leaf_discoloration',
  leaf_hole: 'leaf_hole',
  'leaf hole': 'leaf_hole',
  'Leaf Hole': 'leaf_hole',
  mold_fungus: 'mold_fungus',
  'mold fungus': 'mold_fungus',
  'Mold Fungus': 'mold_fungus',
  'mold / fungus': 'mold_fungus',
  'Mold / Fungus': 'mold_fungus',
  slug_snail: 'slug_snail',
  'slug snail': 'slug_snail',
  'Slug Snail': 'slug_snail',
  'slug / snail': 'slug_snail',
  'Slug / Snail': 'slug_snail',
};

/**
 * Reverse lookup: YOLO className → classIndex (mirrors HEALTH_CLASS_MAP in yolo-detector/constants).
 */
export const YOLO_CLASS_INDEX: Record<string, number> = {
  aphid_cluster: 0,
  caterpillar: 1,
  leaf_discoloration: 2,
  leaf_hole: 3,
  mold_fungus: 4,
  slug_snail: 5,
};

/**
 * Display labels for health condition classes mapped by class key or numeric index.
 */
export const CONDITION_LABELS: Record<string | number, string> = {
  0: 'Aphid Cluster',
  1: 'Caterpillar',
  2: 'Leaf Discoloration',
  3: 'Leaf Hole',
  4: 'Mold / Fungus',
  5: 'Slug / Snail',
  aphid_cluster: 'Aphid Cluster',
  caterpillar: 'Caterpillar',
  leaf_discoloration: 'Leaf Discoloration',
  leaf_hole: 'Leaf Hole',
  mold_fungus: 'Mold / Fungus',
  slug_snail: 'Slug / Snail',
};

export const RFDETR_CONFIDENCE_THRESHOLD = 0.25;
