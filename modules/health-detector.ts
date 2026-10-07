/**
 * Unified health detection orchestrator.
 *
 * Delegates to either the local YOLO pipeline or the online RF-DETR
 * (Roboflow) pipeline based on the caller's model selection.
 *
 * Plant identification ALWAYS runs locally via YOLO — only the
 * health/disease detection step switches between models.
 */

import { createImageInputTensor, YOLO_INPUT_SIZE } from './yolo-detector/imageTensor';
import { runModelAnalysis, runPlantDetection, runHealthDetection } from './yolo-detector/detectionPipeline';
import { loadHealthModel, loadPlantModel } from './yolo-detector/modelLoader';
import { PLANT_CONFIDENCE_THRESHOLD } from './yolo-detector/constants';
import { analyzeRfdetrHealthImage } from './rfdetr-detector';
import type { YoloImageAnalysisResult, HealthDetectionResult } from './yolo-detector/types';
import type { HealthDetectionModel } from '../lib/detection-preference';

/**
 * Analyse an image for plant presence and health issues.
 *
 * @param imageUri  Local file URI of the captured/uploaded image.
 * @param model     Which model to use for the health detection step.
 * @returns         Unified result object consumed by the check-up modal.
 */
export async function analyzeHealthImage(
  imageUri: string,
  model: HealthDetectionModel
): Promise<YoloImageAnalysisResult> {
  // ── Step 1: Plant verification (always local YOLO) ──────────────
  const plantModel = await loadPlantModel();
  const { inputBuffer, resizedImageUri } = await createImageInputTensor(imageUri, plantModel);

  const plantAnalysis = runModelAnalysis(plantModel, inputBuffer.slice(0));
  const plantResult = runPlantDetection(plantAnalysis.outputs[0], plantAnalysis.rawOutputs);

  // ── Step 2: Health detection (model-dependent) ──────────────────
  let healthResult: HealthDetectionResult = {
    condition: 'skipped',
    conditionLabel: 'Analysis Halted',
    confidence: 0,
    recommendation: 'Ensure you are scanning an actual agricultural crop.',
    detection: null,
    allDetections: [],
    rawOutputs: [],
    summary: 'Health model skipped because plant verification failed.',
  };

  if (plantResult.hasPlant && plantResult.confidence >= PLANT_CONFIDENCE_THRESHOLD) {
    if (model === 'rfdetr') {
      // Online — RF-DETR via Roboflow
      healthResult = await analyzeRfdetrHealthImage(imageUri);
    } else {
      // Offline — local YOLO TFLite
      const healthModel = await loadHealthModel();
      const healthAnalysis = runModelAnalysis(healthModel, inputBuffer);
      healthResult = runHealthDetection(healthAnalysis.outputs[0], healthAnalysis.rawOutputs);
    }
  } else {
    plantResult.summary = 'No crop subject detected.';
    plantResult.confidence = 0;
    plantResult.hasPlant = false;
    plantResult.detection = null;
  }

  return {
    imageUri,
    resizedImageUri,
    inputSize: YOLO_INPUT_SIZE,
    timestamp: new Date().toISOString(),
    plant: plantResult,
    health: healthResult,
  };
}
