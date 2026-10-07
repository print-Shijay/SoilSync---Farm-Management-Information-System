import type { TfliteModel } from 'react-native-fast-tflite';
import {
  HEALTH_CLASS_MAP,
  HEALTH_CLASS_LABELS,
  HEALTH_RECOMMENDATIONS,
  HEALTH_CONFIDENCE_THRESHOLD,
  PLANT_CLASS_NAME,
  PLANT_CONFIDENCE_THRESHOLD,
} from './constants';
import type {
  Detection,
  HealthDetectionResult,
  PlantDetectionResult,
  YoloRawOutput,
} from './types';

function computeIoU(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const aX1 = a.x - a.width / 2;
  const aY1 = a.y - a.height / 2;
  const aX2 = a.x + a.width / 2;
  const aY2 = a.y + a.height / 2;

  const bX1 = b.x - b.width / 2;
  const bY1 = b.y - b.height / 2;
  const bX2 = b.x + b.width / 2;
  const bY2 = b.y + b.height / 2;

  const interX1 = Math.max(aX1, bX1);
  const interY1 = Math.max(aY1, bY1);
  const interX2 = Math.min(aX2, bX2);
  const interY2 = Math.min(aY2, bY2);

  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;

  const union = a.width * a.height + b.width * b.height - interArea;
  return union > 0 ? interArea / union : 0;
}

function nonMaxSuppression(detections: Detection[], iouThreshold = 0.45) {
  const sorted = [...detections].sort((left, right) => right.confidence - left.confidence);
  const kept: Detection[] = [];

  for (const detection of sorted) {
    const overlap = kept.some((keptDetection) => computeIoU(detection.bbox, keptDetection.bbox) > iouThreshold);
    if (!overlap) {
      kept.push(detection);
    }
  }

  return kept;
}

function parseYoloOutput(
  rawOutput: ArrayBuffer,
  classMap: Record<number, string>,
  numClasses: number,
  threshold: number
): Detection[] {
  const data = new Float32Array(rawOutput);
  const detections: Detection[] = [];
  const MODEL_SIZE = 640;
  const NUM_ANCHORS = 8400;

  // 1. Check if it's an End-to-End NMS model ([1, 300, 6] = 1800 elements)
  if (data.length === 1800) {
    const MAX_DETECTIONS = 300;
    const ELEMENT_STRIDE = 6;
    for (let i = 0; i < MAX_DETECTIONS; i += 1) {
      const baseIdx = i * ELEMENT_STRIDE;
      if (baseIdx + 5 >= data.length) break;

      const x1 = data[baseIdx + 0];
      const y1 = data[baseIdx + 1];
      const x2 = data[baseIdx + 2];
      const y2 = data[baseIdx + 3];
      const score = data[baseIdx + 4];
      const clsIdx = Math.round(data[baseIdx + 5]);

      if (score === 0 && x1 === 0 && y1 === 0) continue;

      if (score >= threshold) {
        const rw = (x2 - x1) / MODEL_SIZE;
        const rh = (y2 - y1) / MODEL_SIZE;
        const cx = (x1 + x2) / 2 / MODEL_SIZE;
        const cy = (y1 + y2) / 2 / MODEL_SIZE;
        detections.push({
          classIndex: clsIdx,
          className: classMap[clsIdx] ?? `class_${clsIdx}`,
          confidence: score,
          bbox: { x: cx, y: cy, width: rw, height: rh },
        });
      }
    }
    return nonMaxSuppression(detections);
  }

  // 2. Standard YOLOv8 format ([1, numClasses + 4, 8400])
  const numElements = 4 + numClasses;
  if (data.length === numElements * NUM_ANCHORS) {
    for (let anchorIdx = 0; anchorIdx < NUM_ANCHORS; anchorIdx += 1) {
      let cx = data[0 * NUM_ANCHORS + anchorIdx];
      let cy = data[1 * NUM_ANCHORS + anchorIdx];
      let width = data[2 * NUM_ANCHORS + anchorIdx];
      let height = data[3 * NUM_ANCHORS + anchorIdx];

      // TFLite models might output absolute (0-640) or relative (0-1) coordinates.
      // Normalize if they are absolute coordinates.
      if (width > 1.5 || height > 1.5 || cx > 1.5 || cy > 1.5) {
        cx /= MODEL_SIZE;
        cy /= MODEL_SIZE;
        width /= MODEL_SIZE;
        height /= MODEL_SIZE;
      }

      let bestClassIdx = 0;
      let bestProbability = 0;

      for (let classIdx = 0; classIdx < numClasses; classIdx += 1) {
        const probability = data[(4 + classIdx) * NUM_ANCHORS + anchorIdx];
        if (probability > bestProbability) {
          bestProbability = probability;
          bestClassIdx = classIdx;
        }
      }

      if (bestProbability >= threshold) {
        detections.push({
          classIndex: bestClassIdx,
          className: classMap[bestClassIdx] ?? `class_${bestClassIdx}`,
          confidence: bestProbability,
          bbox: { x: cx, y: cy, width, height },
        });
      }
    }
  }

  return nonMaxSuppression(detections);
}

export function extractRawOutputs(outputs: ArrayBuffer[]): YoloRawOutput[] {
  return outputs.map((output, index) => {
    const values = new Float32Array(output);
    return {
      index,
      byteLength: output.byteLength,
      valueCount: values.length,
      valuesPreview: Array.from(values.slice(0, 18)),
    };
  });
}

export function runPlantDetection(
  rawOutput: ArrayBuffer,
  outputMeta: YoloRawOutput[]
): PlantDetectionResult {
  const nmsDetections = parseYoloOutput(
    rawOutput,
    { 0: PLANT_CLASS_NAME },
    1,
    PLANT_CONFIDENCE_THRESHOLD
  );
  const detection = nmsDetections[0] ?? null;

  return {
    hasPlant: Boolean(detection),
    confidence: detection?.confidence ?? 0,
    detection,
    allDetections: nmsDetections,
    rawOutputs: outputMeta,
    summary: detection
      ? `Plant detected with ${Math.round(detection.confidence * 100)}% confidence.`
      : 'No plant detected.',
  };
}

export function runHealthDetection(
  rawOutput: ArrayBuffer,
  outputMeta: YoloRawOutput[]
): HealthDetectionResult {
  const data = new Float32Array(rawOutput);

  // 🔴 DIAGNOSTIC TELEMETRY CAPTURES
  console.log('=== HEALTH MODEL NEW RUN telemetry ===');
  console.log('Total float elements count:', data.length);
  console.log('First 20 raw float values:', Array.from(data.slice(0, 20)));
  console.log('=======================================');

  const nmsDetections = parseYoloOutput(
    rawOutput,
    HEALTH_CLASS_MAP,
    Object.keys(HEALTH_CLASS_MAP).length,
    HEALTH_CONFIDENCE_THRESHOLD
  );

  // 🩺 HUMAN-READABLE TELEMETRY DETECTIONS LOG
  console.log('====== 🩺 HEALTH DETECTIONS LOG ======');
  if (nmsDetections.length === 0) {
    console.log('Result: AI thinks the plant is 100% HEALTHY');
  } else {
    console.log(`Result: Found ${nmsDetections.length} total anomalies.`);
    nmsDetections.forEach((box, i) => {
      console.log(
        `  👉 Box #${i + 1}: ${box.classIndex} | Conf: ${Math.round(
          box.confidence * 100
        )}% | BBox: [x:${box.bbox.x.toFixed(2)}, y:${box.bbox.y.toFixed(
          2
        )}, w:${box.bbox.width.toFixed(2)}, h:${box.bbox.height.toFixed(2)}]`
      );
    });
  }
  console.log('======================================');

  const detection = nmsDetections[0] ?? null;

  if (!detection) {
    return {
      condition: 'plants',
      conditionLabel: HEALTH_CLASS_LABELS.plants,
      confidence: 1.0,
      recommendation: HEALTH_RECOMMENDATIONS.plants,
      detection: null,
      allDetections: [],
      rawOutputs: outputMeta,
      summary: 'Verified Scan: No disease or insect pest anomalies detected.',
    };
  }

  const condition = detection.className;
  const conditionLabel = HEALTH_CLASS_LABELS[condition] ?? condition;
  const id = detection.classIndex;

  return {
    condition,
    conditionLabel,
    confidence: detection.confidence,
    recommendation: HEALTH_RECOMMENDATIONS[condition] ?? 'Monitor closely.',
    detection,
    allDetections: nmsDetections,
    rawOutputs: outputMeta,
    summary: `${conditionLabel} detected with ${Math.round(
      detection.confidence * 100
    )}% confidence.`,
  };
}

export function runModelAnalysis(model: TfliteModel, inputBuffer: ArrayBuffer) {
  const outputs = model.runSync([inputBuffer]);
  return {
    outputs,
    rawOutputs: extractRawOutputs(outputs),
  };
}
