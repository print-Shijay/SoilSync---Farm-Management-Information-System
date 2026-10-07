import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

export const BLUEPRINT_PREVIEW_WIDTH = 320;
export const BLUEPRINT_PREVIEW_HEIGHT = 220;
export const BLUEPRINT_PADDING = 22;

export function resolveBlueprintBounds(blueprintData: any) {
  const items = Array.isArray(blueprintData?.items) ? blueprintData.items : [];
  const bounds = blueprintData?.bounds;

  if (blueprintData?.widthM && blueprintData?.heightM) {
    return {
      minX: 0,
      maxX: Number(blueprintData.widthM),
      minZ: 0,
      maxZ: Number(blueprintData.heightM),
    };
  }

  if (
    bounds &&
    Number.isFinite(Number(bounds.minX)) &&
    Number.isFinite(Number(bounds.maxX)) &&
    Number.isFinite(Number(bounds.minZ)) &&
    Number.isFinite(Number(bounds.maxZ))
  ) {
    return {
      minX: Number(bounds.minX),
      maxX: Number(bounds.maxX),
      minZ: Number(bounds.minZ),
      maxZ: Number(bounds.maxZ),
    };
  }

  if (items.length === 0) {
    return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  }

  return items.reduce(
    (currentBounds: any, item: any) => {
      const itemX = Number(item.x ?? 0);
      const itemZ = Number(item.z ?? 0);
      const halfWidth = Number(item.widthM ?? 0.6) / 2;
      const halfDepth = Number(item.depthM ?? 0.6) / 2;

      return {
        minX: Math.min(currentBounds.minX, itemX - halfWidth),
        maxX: Math.max(currentBounds.maxX, itemX + halfWidth),
        minZ: Math.min(currentBounds.minZ, itemZ - halfDepth),
        maxZ: Math.max(currentBounds.maxZ, itemZ + halfDepth),
      };
    },
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  );
}

export function BlueprintPreview({ layout, previewWidth = BLUEPRINT_PREVIEW_WIDTH, previewHeight = BLUEPRINT_PREVIEW_HEIGHT }: { layout: any; previewWidth?: number; previewHeight?: number }) {
  const blueprintData = layout?.blueprintData ?? {};
  const items = Array.isArray(blueprintData.items) ? blueprintData.items : [];
  const bounds = resolveBlueprintBounds(blueprintData);
  const drawableWidth = previewWidth - BLUEPRINT_PADDING * 2;
  const drawableHeight = previewHeight - BLUEPRINT_PADDING * 2;
  const spanX = Math.max(0.2, bounds.maxX - bounds.minX);
  const spanZ = Math.max(0.2, bounds.maxZ - bounds.minZ);
  const scaleX = drawableWidth / spanX;
  const scaleY = drawableHeight / spanZ;

  const mapPoint = (item: any) => {
    const x = BLUEPRINT_PADDING + ((Number(item.x ?? 0) - bounds.minX) / spanX) * drawableWidth;
    const y = BLUEPRINT_PADDING + ((Number(item.z ?? 0) - bounds.minZ) / spanZ) * drawableHeight;
    return { x, y };
  };

  return (
    <View className="mt-4 overflow-hidden rounded-3xl border border-emerald-100 bg-emerald-50">
      <Svg
        width="100%"
        height={previewHeight}
        viewBox={`0 0 ${previewWidth} ${previewHeight}`}>
        <Rect
          x={BLUEPRINT_PADDING}
          y={BLUEPRINT_PADDING}
          width={drawableWidth}
          height={drawableHeight}
          fill="#f8fbf4"
          stroke="#9ac7a2"
          strokeWidth={2}
        />
        {Array.from({ length: 5 }).map((_, index) => {
          const offset = BLUEPRINT_PADDING + (drawableWidth / 4) * index;
          return (
            <Line
              key={`grid-x-${index}`}
              x1={offset}
              x2={offset}
              y1={BLUEPRINT_PADDING}
              y2={previewHeight - BLUEPRINT_PADDING}
              stroke="#d8e8d2"
              strokeWidth={1}
            />
          );
        })}
        {Array.from({ length: 5 }).map((_, index) => {
          const offset = BLUEPRINT_PADDING + (drawableHeight / 4) * index;
          return (
            <Line
              key={`grid-y-${index}`}
              x1={BLUEPRINT_PADDING}
              x2={previewWidth - BLUEPRINT_PADDING}
              y1={offset}
              y2={offset}
              stroke="#d8e8d2"
              strokeWidth={1}
            />
          );
        })}
        {items.map((item: any, index: number) => {
          const point = mapPoint(item);
          const width = Math.max(16, Number(item.widthM ?? 0.6) * scaleX);
          const height = Math.max(16, Number(item.depthM ?? 0.6) * scaleY);
          const isBed = item.type === 'bed';

          return (
            <Rect
              key={item.id ?? `${item.type}-${index}`}
              x={point.x - width / 2}
              y={point.y - height / 2}
              width={width}
              height={height}
              rx={isBed ? 7 : 3}
              fill={isBed ? '#9a5a30' : '#2f9f68'}
              stroke={isBed ? '#62361c' : '#176342'}
              strokeWidth={2}
              transform={`rotate(${Number(item.rotationY ?? 0)} ${point.x} ${point.y})`}
            />
          );
        })}
        {items.map((item: any, index: number) => {
          const point = mapPoint(item);
          const isBed = item.type === 'bed';
          const label = item.label || (isBed ? `Bed ${index + 1}` : `Trellis ${index + 1}`);

          return (
            <SvgText
              key={`label-${item.id ?? `${item.type}-${index}`}`}
              x={point.x}
              y={point.y + 4}
              fill="#ffffff"
              fontSize={10}
              fontWeight="700"
              textAnchor="middle">
              {label.replace('Trellis', 'Tr')}
            </SvgText>
          );
        })}
      </Svg>
      {items.length === 0 && (
        <Text className="px-4 pb-4 text-center text-sm font-semibold text-slate-500">
          Blueprint has no placed items.
        </Text>
      )}
    </View>
  );
}
