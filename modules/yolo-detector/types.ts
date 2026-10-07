import type { Tensor } from 'react-native-fast-tflite';

export type YoloModelName = 'plant' | 'health';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  classIndex: number;
  className: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface YoloRawOutput {
  index: number;
  byteLength: number;
  valueCount: number;
  valuesPreview: number[];
}

export interface YoloModelRunResult {
  model: YoloModelName;
  inputs: Tensor[];
  outputs: Tensor[];
  rawOutputs: YoloRawOutput[];
  detections: Detection[];
  bestDetection: Detection | null;
  summary: string;
}

export interface PlantDetectionResult {
  hasPlant: boolean;
  confidence: number;
  detection: Detection | null;
  allDetections: Detection[];
  rawOutputs: YoloRawOutput[];
  summary: string;
}

export interface HealthDetectionResult {
  condition: string;
  conditionLabel: string;
  confidence: number;
  recommendation: string;
  detection: Detection | null;
  allDetections: Detection[];
  rawOutputs: YoloRawOutput[];
  summary: string;
}

export interface YoloImageAnalysisResult {
  imageUri: string;
  resizedImageUri: string;
  inputSize: number;
  timestamp: string;
  plant: PlantDetectionResult;
  health: HealthDetectionResult;
}
