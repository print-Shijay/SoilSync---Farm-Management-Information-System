/**
 * RF-DETR online health detection via Roboflow Serverless Inference API.
 *
 * This module handles:
 * 1. Reading the image as base64
 * 2. Posting it to the Roboflow serverless endpoint
 * 3. Mapping the response into the same HealthDetectionResult shape
 *    used by the YOLO detector so the UI layer is model-agnostic.
 */

import * as FileSystem from 'expo-file-system/legacy';
import type { HealthDetectionResult, Detection } from '../yolo-detector/types';
import {
  HEALTH_CLASS_LABELS,
  HEALTH_RECOMMENDATIONS,
} from '../yolo-detector/constants';
import {
  getRoboflowApiKey,
  getRoboflowInferenceUrl,
  ROBOFLOW_TO_YOLO_CLASS,
  YOLO_CLASS_INDEX,
  RFDETR_CONFIDENCE_THRESHOLD,
} from './config';
import type { RoboflowResponse, RoboflowPrediction } from './types';

/**
 * Convert a Roboflow prediction to the unified Detection type.
 * Roboflow returns absolute pixel coordinates centered on the box;
 * we normalise to 0-1 ratios to match the YOLO overlay renderer.
 */
function toDetection(pred: RoboflowPrediction, imgWidth: number, imgHeight: number): Detection {
  const yoloClass = ROBOFLOW_TO_YOLO_CLASS[pred.class] ?? pred.class.toLowerCase().replace(/[\s/]+/g, '_');
  const classIndex = YOLO_CLASS_INDEX[yoloClass] ?? pred.class_id;

  return {
    classIndex,
    className: yoloClass,
    confidence: pred.confidence,
    bbox: {
      x: pred.x / imgWidth,
      y: pred.y / imgHeight,
      width: pred.width / imgWidth,
      height: pred.height / imgHeight,
    },
  };
}

/**
 * Run health detection via Roboflow RF-DETR (online).
 *
 * @param imageUri - Local file URI of the image to analyse.
 * @returns A HealthDetectionResult compatible with the YOLO result shape.
 * @throws If the API key is missing or the network request fails.
 */
export async function analyzeRfdetrHealthImage(imageUri: string): Promise<HealthDetectionResult> {
  const apiKey = getRoboflowApiKey();

  if (!apiKey) {
    throw new Error(
      'Roboflow API key not configured. Add EXPO_PUBLIC_ROBOFLOW_API_KEY to your .env file.'
    );
  }

  // Read image as base64
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // POST to Roboflow serverless endpoint
  const url = `${getRoboflowInferenceUrl()}?api_key=${apiKey}&confidence=${RFDETR_CONFIDENCE_THRESHOLD}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: base64Image,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Roboflow API error (${response.status}): ${errorText}`);
  }

  const data: RoboflowResponse = await response.json();

  // Convert predictions to Detection[]
  const imgWidth = data.image?.width || 640;
  const imgHeight = data.image?.height || 640;

  const detections: Detection[] = data.predictions
    .filter((pred) => pred.confidence >= RFDETR_CONFIDENCE_THRESHOLD)
    .map((pred) => toDetection(pred, imgWidth, imgHeight));

  // Sort by confidence descending
  detections.sort((a, b) => b.confidence - a.confidence);

  const detection = detections[0] ?? null;

  if (!detection) {
    return {
      condition: 'plants',
      conditionLabel: HEALTH_CLASS_LABELS.plants,
      confidence: 1.0,
      recommendation: HEALTH_RECOMMENDATIONS.plants,
      detection: null,
      allDetections: [],
      rawOutputs: [],
      summary: 'RF-DETR Scan: No disease or insect pest anomalies detected.',
    };
  }

  const condition = detection.className;
  const conditionLabel = HEALTH_CLASS_LABELS[condition] ?? condition;

  return {
    condition,
    conditionLabel,
    confidence: detection.confidence,
    recommendation: HEALTH_RECOMMENDATIONS[condition] ?? 'Monitor closely.',
    detection,
    allDetections: detections,
    rawOutputs: [],
    summary: `${conditionLabel} detected with ${Math.round(detection.confidence * 100)}% confidence (RF-DETR).`,
  };
}
