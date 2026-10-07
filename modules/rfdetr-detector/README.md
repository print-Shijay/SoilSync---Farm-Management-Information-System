# RF-DETR Detector Module

Online plant health detection powered by the **Roboflow Serverless Inference API** using an RF-DETR model.

---

## Overview

This module provides an alternative to the local YOLO TFLite health detection pipeline. Instead of running inference on-device, it uploads the captured image to Roboflow's cloud endpoint and returns detection results in the same format the rest of the app expects.

| Feature | Detail |
|---------|--------|
| **Model** | RF-DETR (via Roboflow) |
| **Mode** | Online (requires internet) |
| **Endpoint** | `https://serverless.roboflow.com` |
| **Default Model ID** | `soilsync-health-detection/7` |
| **Workspace** | `juliuss-workspace-eibz0` |

> **Note:** Plant identification (the "is this actually a plant?" gate) always runs locally via the YOLO module. Only the health/disease detection step uses this module when RF-DETR is selected.

---

## Module Structure

```
modules/rfdetr-detector/
├── README.md        ← You are here
├── config.ts        ← API URL builder, env var accessors, class name mapping
├── index.ts         ← Main entry — analyzeRfdetrHealthImage()
└── types.ts         ← Roboflow API response types
```

### `config.ts`

- **`getRoboflowApiKey()`** — Reads `EXPO_PUBLIC_ROBOFLOW_API_KEY` from env
- **`getRoboflowModelId()`** — Reads `EXPO_PUBLIC_ROBOFLOW_MODEL_ID` (defaults to `soilsync-health-detection/7`)
- **`getRoboflowInferenceUrl()`** — Builds the full inference endpoint URL
- **`ROBOFLOW_TO_YOLO_CLASS`** — Maps Roboflow class labels → YOLO class names so the UI (questionnaire, mitigation, bounding boxes) works identically
- **`YOLO_CLASS_INDEX`** — Reverse lookup from YOLO class name → numeric index
- **`RFDETR_CONFIDENCE_THRESHOLD`** — Minimum confidence to accept a detection (0.25)

### `index.ts`

Exports a single function:

```ts
analyzeRfdetrHealthImage(imageUri: string): Promise<HealthDetectionResult>
```

**Pipeline:**
1. Reads the image as **base64** via `expo-file-system`
2. POSTs it to the Roboflow serverless endpoint with the API key and confidence threshold
3. Parses the response — an array of predictions with `class`, `confidence`, `x`, `y`, `width`, `height`
4. Converts absolute pixel coordinates to **normalised 0–1 ratios** (matching YOLO's output format)
5. Maps Roboflow class names → YOLO class names via `ROBOFLOW_TO_YOLO_CLASS`
6. Returns a `HealthDetectionResult` identical in shape to the YOLO pipeline output

### `types.ts`

TypeScript interfaces for the Roboflow API response:

- **`RoboflowPrediction`** — A single detected object (class, confidence, bounding box)
- **`RoboflowResponse`** — Full API response (image dimensions, predictions array, inference time)

---

## Environment Setup

Add the following to your `.env` file:

```env
EXPO_PUBLIC_ROBOFLOW_API_KEY=your_api_key_here
EXPO_PUBLIC_ROBOFLOW_WORKSPACE=juliuss-workspace-eibz0
EXPO_PUBLIC_ROBOFLOW_MODEL_ID=soilsync-health-detection/7
```

> **Important:** Without `EXPO_PUBLIC_ROBOFLOW_API_KEY`, selecting RF-DETR in the check-up modal will display an error prompting the user to configure the key.

---

## How It Integrates

This module is **not called directly** by the UI. Instead, the unified orchestrator at `modules/health-detector.ts` delegates to it:

```
Check-up Modal
  └─► health-detector.ts (orchestrator)
        ├─► yolo-detector/   (plant verification — always)
        └─► rfdetr-detector/ (health detection — when RF-DETR selected)
```

The user toggles between YOLO and RF-DETR via a pill selector on Step 1 of the check-up modal. Their preference is persisted in AsyncStorage via `lib/detection-preference.ts`.

---

## Detected Classes

Both the RF-DETR and YOLO models detect the same 6 health conditions:

| Index | YOLO Class Name | Display Label |
|-------|----------------|---------------|
| 0 | `aphid_cluster` | Aphid Cluster |
| 1 | `caterpillar` | Caterpillar |
| 2 | `leaf_discoloration` | Leaf Discoloration |
| 3 | `leaf_hole` | Leaf Holes |
| 4 | `mold_fungus` | Mold / Fungus |
| 5 | `slug_snail` | Slug / Snail |

The `ROBOFLOW_TO_YOLO_CLASS` mapping in `config.ts` handles any label variations (casing, spacing, slashes) that the Roboflow model may return.
