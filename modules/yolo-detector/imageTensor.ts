import { toByteArray } from 'base64-js';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import type { TfliteModel } from 'react-native-fast-tflite';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jpeg = require('jpeg-js');

export const YOLO_INPUT_SIZE = 640;

type DecodedJpeg = {
  width: number;
  height: number;
  data: Uint8Array;
};

function getInputElementCount(model: TfliteModel) {
  const input = model.inputs[0];
  return input.shape.reduce((total, dimension) => total * Math.max(1, dimension), 1);
}

function assertRgbInputShape(model: TfliteModel) {
  const input = model.inputs[0];
  const count = getInputElementCount(model);

  if (count !== YOLO_INPUT_SIZE * YOLO_INPUT_SIZE * 3) {
    throw new Error(
      `Unexpected YOLO input shape ${JSON.stringify(input.shape)}. Expected 1x640x640x3.`
    );
  }
}

function writeFloatInput(decoded: DecodedJpeg, model: TfliteModel) {
  const input = new Float32Array(getInputElementCount(model));

  const numPixels = decoded.width * decoded.height;

  // 🟢 CHW Stride Markers: Create offsets for the separate R, G, and B planes
  const rOffset = 0;
  const gOffset = numPixels;
  const bOffset = numPixels * 2;

  for (let i = 0; i < numPixels; i += 1) {
    const rgbaIndex = i * 4;

    const rVal = decoded.data[rgbaIndex] / 255;
    const gVal = decoded.data[rgbaIndex + 1] / 255;
    const bVal = decoded.data[rgbaIndex + 2] / 255;

    // 📦 Pack each channel into its own distinct contiguous memory block
    input[rOffset + i] = rVal;
    input[gOffset + i] = gVal;
    input[bOffset + i] = bVal;
  }

  return input.buffer;
}

function writeUint8Input(decoded: DecodedJpeg, model: TfliteModel) {
  const input = new Uint8Array(getInputElementCount(model));
  let outputIndex = 0;

  for (let pixelIndex = 0; pixelIndex < decoded.width * decoded.height; pixelIndex += 1) {
    const rgbaIndex = pixelIndex * 4;
    input[outputIndex++] = decoded.data[rgbaIndex]; // R
    input[outputIndex++] = decoded.data[rgbaIndex + 1]; // G
    input[outputIndex++] = decoded.data[rgbaIndex + 2]; // B
  }

  return input.buffer;
}

export async function createImageInputTensor(
  imageUri: string,
  model: TfliteModel
): Promise<{ inputBuffer: ArrayBuffer; resizedImageUri: string }> {
  assertRgbInputShape(model);

  const resized = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: YOLO_INPUT_SIZE, height: YOLO_INPUT_SIZE } }],
    {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: false,
    }
  );

  const base64Image = await FileSystem.readAsStringAsync(resized.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const decoded = jpeg.decode(toByteArray(base64Image), { useTArray: true }) as DecodedJpeg;

  if (decoded.width !== YOLO_INPUT_SIZE || decoded.height !== YOLO_INPUT_SIZE) {
    throw new Error(`Image preprocessing produced ${decoded.width}x${decoded.height}.`);
  }

  // Extract data type string and normalize it to lowercase
  const inputType = model.inputs[0].dataType.toLowerCase();

  // 🔴 FIX: Check for 'float32' OR 'float' to catch the new LiteRT metadata strings
  if (inputType === 'float32' || inputType === 'float') {
    return {
      inputBuffer: writeFloatInput(decoded, model),
      resizedImageUri: resized.uri,
    };
  }

  if (inputType === 'uint8' || inputType === 'int8') {
    return {
      inputBuffer: writeUint8Input(decoded, model),
      resizedImageUri: resized.uri,
    };
  }

  // 🔴 DIAGNOSTIC FALLBACK: If it still bypasses, let's look at what string the native layer is spitting out
  console.warn(
    `[Tensor Warning] Forcing float32 pipeline. Native model input type was: "${inputType}"`
  );
  return {
    inputBuffer: writeFloatInput(decoded, model),
    resizedImageUri: resized.uri,
  };
}
