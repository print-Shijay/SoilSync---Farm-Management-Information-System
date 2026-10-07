import { createImageInputTensor, YOLO_INPUT_SIZE } from './imageTensor';
import { runHealthDetection, runModelAnalysis, runPlantDetection } from './detectionPipeline';
import { loadHealthModel, loadPlantModel } from './modelLoader';
import type { YoloImageAnalysisResult, HealthDetectionResult } from './types';
import { PLANT_CONFIDENCE_THRESHOLD } from './constants';

export async function analyzeYoloImage(imageUri: string): Promise<YoloImageAnalysisResult> {
  const plantModel = await loadPlantModel();
  const { inputBuffer, resizedImageUri } = await createImageInputTensor(imageUri, plantModel);

  // 🟢 FIX: Slice a duplicate block for the plant analyzer so it doesn't corrupt the health buffer block memory reference
  const plantAnalysis = runModelAnalysis(plantModel, inputBuffer.slice(0));
  const plantResult = runPlantDetection(plantAnalysis.outputs[0], plantAnalysis.rawOutputs);

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
    const healthModel = await loadHealthModel();
    // 🟢 Pass the uncorrupted main memory channel buffer directly to the health checkup engine
    const healthAnalysis = runModelAnalysis(healthModel, inputBuffer);
    healthResult = runHealthDetection(healthAnalysis.outputs[0], healthAnalysis.rawOutputs);
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
