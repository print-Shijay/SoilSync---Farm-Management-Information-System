/**
 * Farm Layout Designer — Resize Handle
 *
 * Small draggable circles rendered at plot corners and edges
 * when a plot is selected.
 */

import { View } from 'react-native';
import { HANDLE_RADIUS, HANDLE_HIT_SLOP, SELECTED_BORDER_COLOR } from '../constants';
import type { ResizeDirection } from '../types';

type ResizeHandleProps = {
  direction: ResizeDirection;
  /** Pixel position relative to the plot's top-left corner. */
  offsetX: number;
  offsetY: number;
};

/**
 * A small circle handle for resizing a plot.
 * Positioned absolutely within the plot container.
 */
export function ResizeHandle({ direction, offsetX, offsetY }: ResizeHandleProps) {
  const isCorner = direction.includes('-');
  const size = isCorner ? HANDLE_RADIUS * 2 : HANDLE_RADIUS * 1.6;

  return (
    <View
      style={{
        position: 'absolute',
        left: offsetX - size / 2,
        top: offsetY - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#ffffff',
        borderWidth: isCorner ? 2.5 : 2,
        borderColor: SELECTED_BORDER_COLOR,
        // Increase hit area
        padding: HANDLE_HIT_SLOP,
        margin: -HANDLE_HIT_SLOP,
        // Shadow for corner handles
        ...(isCorner
          ? {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.2,
              shadowRadius: 2,
              elevation: 3,
            }
          : {}),
      }}
    />
  );
}

/**
 * Calculate handle positions for a plot of given pixel dimensions.
 * Returns an array of { direction, offsetX, offsetY } for all 8 handles.
 */
export function getHandlePositions(
  widthPx: number,
  heightPx: number
): { direction: ResizeDirection; offsetX: number; offsetY: number }[] {
  const midX = widthPx / 2;
  const midY = heightPx / 2;

  return [
    { direction: 'top-left', offsetX: 0, offsetY: 0 },
    { direction: 'top', offsetX: midX, offsetY: 0 },
    { direction: 'top-right', offsetX: widthPx, offsetY: 0 },
    { direction: 'right', offsetX: widthPx, offsetY: midY },
    { direction: 'bottom-right', offsetX: widthPx, offsetY: heightPx },
    { direction: 'bottom', offsetX: midX, offsetY: heightPx },
    { direction: 'bottom-left', offsetX: 0, offsetY: heightPx },
    { direction: 'left', offsetX: 0, offsetY: midY },
  ];
}
