import React from 'react';
import { G, Polygon, Line, Text as SvgText } from 'react-native-svg';

export interface Building3DProps {
  x: number;
  z: number;
  y?: number;
  w: number;
  d: number;
  h?: number;
  color?: string;
  name?: string;
  category?: string;
  showLabel?: boolean;
  toIso: (wx: number, wz: number, wy?: number) => { x: number; y: number };
}

/**
 * Derives roof, wall, and accent colors for realistic agricultural buildings.
 * Every building has full 4-sided roof colors so all visible facets (front, right, left, back)
 * are solid and seamless.
 */
function getBuildingPalettes(accentColor?: string, category?: string, name?: string) {
  const lower = (name || category || '').toLowerCase();

  // Silo: Metallic steel / galvanized tones
  if (lower.includes('silo')) {
    return {
      wallLeft: '#B0BEC5',
      wallRight: '#90A4AE',
      roofFront: '#ECEFF1',
      roofRight: '#CFD8DC',
      roofLeft: '#CFD8DC',
      roofBack: '#B0BEC5',
      roofRidge: '#FFFFFF',
      trim: '#546E7A',
      door: '#37474F',
    };
  }

  // Greenhouse: Sage green frame with glass reflections
  if (lower.includes('greenhouse') || lower.includes('green house')) {
    return {
      wallLeft: '#81C784',
      wallRight: '#66BB6A',
      roofFront: '#C8E6C9',
      roofRight: '#A5D6A7',
      roofLeft: '#A5D6A7',
      roofBack: '#81C784',
      roofRidge: '#E8F5E9',
      trim: '#2E7D32',
      door: '#1B5E20',
    };
  }

  // Barn / Livestock Coops: Deep barn red
  if (lower.includes('barn') || lower.includes('coop') || lower.includes('livestock')) {
    return {
      wallLeft: '#A93226',
      wallRight: '#7B241C',
      roofFront: '#E74C3C',
      roofRight: '#C0392B',
      roofLeft: '#C0392B',
      roofBack: '#962D22',
      roofRidge: '#FF8A80',
      trim: '#FFFFFF',
      door: '#281815',
    };
  }

  // Default Agricultural Building (Classic Red Roof with slate/timber walls)
  return {
    wallLeft: accentColor || '#475569',
    wallRight: '#1E293B',
    roofFront: '#E74C3C', // Sunlit bright red front slope
    roofRight: '#C0392B', // Shaded red right slope
    roofLeft: '#C0392B',  // Shaded red left slope
    roofBack: '#962D22',  // Deep shaded red back slope
    roofRidge: '#FF8A80', // Crisp ridge highlight
    trim: '#E2E8F0',
    door: '#2C1B10',
  };
}

/**
 * Renders a complete, fully enclosed 3D isometric agricultural building with:
 * - 4-sided pitched roof (Front, Right, Left, Back slopes fully covered in solid roof colors)
 * - Eaves extending past the walls with shadow lines
 * - Front-facing rustic barn door with diagonal braces
 * - Side-facing framed glass window with reflections
 * - Concrete foundation trim
 * - Floating abbreviation label
 */
export function Building3D({
  x,
  z,
  y = 0,
  w,
  d,
  h = 1.8,
  color,
  name,
  category,
  showLabel = true,
  toIso,
}: Building3DProps) {
  const palette = getBuildingPalettes(color, category, name);
  const wallH = Math.max(0.85, h * 0.62);
  const roofPeakH = Math.max(wallH + 0.45, h * 1.12);
  const overhang = Math.min(0.2, Math.min(w, d) * 0.12);

  // ── 1. Base corners (Ground) ──
  const bLeft = toIso(x, z + d, y);
  const bBottom = toIso(x + w, z + d, y);
  const bRight = toIso(x + w, z, y);

  // ── 2. Wall top corners ──
  const wLeft = toIso(x, z + d, y + wallH);
  const wBottom = toIso(x + w, z + d, y + wallH);
  const wRight = toIso(x + w, z, y + wallH);

  // Foundation trim (0.08m high)
  const fLeft = toIso(x, z + d, y + 0.08);
  const fBottom = toIso(x + w, z + d, y + 0.08);
  const fRight = toIso(x + w, z, y + 0.08);

  // ── 3. Four Eaves Corners (Overhanging past walls) ──
  const efLeft = toIso(x - overhang, z + d + overhang, y + wallH);
  const efRight = toIso(x + w + overhang, z + d + overhang, y + wallH);
  const ebRight = toIso(x + w + overhang, z - overhang, y + wallH);
  const ebLeft = toIso(x - overhang, z - overhang, y + wallH);

  // ── 4. Central Roof Ridge ──
  const ridgeLen = Math.max(0.5, w * 0.45);
  const ridgeStartX = x + (w - ridgeLen) / 2;
  const ridgeEndX = ridgeStartX + ridgeLen;
  const ridgeZ = z + d / 2;

  const rLeft = toIso(ridgeStartX, ridgeZ, y + roofPeakH);
  const rRight = toIso(ridgeEndX, ridgeZ, y + roofPeakH);

  // ── 5. Doorway on Front-Left Wall ──
  const doorW = Math.min(1.1, w * 0.42);
  const doorH = wallH * 0.76;
  const doorStartX = x + (w - doorW) / 2;
  const doorEndX = doorStartX + doorW;

  const d1 = toIso(doorStartX, z + d + 0.01, y);
  const d2 = toIso(doorEndX, z + d + 0.01, y);
  const d3 = toIso(doorEndX, z + d + 0.01, y + doorH);
  const d4 = toIso(doorStartX, z + d + 0.01, y + doorH);

  // ── 6. Window on Side-Right Wall ──
  const winD = Math.min(0.9, d * 0.38);
  const winH = Math.min(0.65, wallH * 0.42);
  const winStartZ = z + (d - winD) / 2;
  const winEndZ = winStartZ + winD;
  const winStartY = y + wallH * 0.36;
  const winEndY = winStartY + winH;

  const wn1 = toIso(x + w + 0.01, winStartZ, winStartY);
  const wn2 = toIso(x + w + 0.01, winEndZ, winStartY);
  const wn3 = toIso(x + w + 0.01, winEndZ, winEndY);
  const wn4 = toIso(x + w + 0.01, winStartZ, winEndY);

  // Center position for floating abbreviation label
  const labelPos = toIso(x + w / 2, z + d / 2, y + roofPeakH + 0.36);

  return (
    <G>
      {/* ── Left Wall (Facing camera down-left) ── */}
      <Polygon
        points={`${wLeft.x},${wLeft.y} ${wBottom.x},${wBottom.y} ${bBottom.x},${bBottom.y} ${bLeft.x},${bLeft.y}`}
        fill={palette.wallLeft}
      />

      {/* Concrete Foundation Trim on Left Wall */}
      <Polygon
        points={`${fLeft.x},${fLeft.y} ${fBottom.x},${fBottom.y} ${bBottom.x},${bBottom.y} ${bLeft.x},${bLeft.y}`}
        fill="#64748B"
      />

      {/* ── Right Wall (Facing camera down-right) ── */}
      <Polygon
        points={`${wBottom.x},${wBottom.y} ${wRight.x},${wRight.y} ${bRight.x},${bRight.y} ${bBottom.x},${bBottom.y}`}
        fill={palette.wallRight}
      />

      {/* Concrete Foundation Trim on Right Wall */}
      <Polygon
        points={`${fBottom.x},${fBottom.y} ${fRight.x},${fRight.y} ${bRight.x},${bRight.y} ${bBottom.x},${bBottom.y}`}
        fill="#475569"
      />

      {/* ── Rustic Barn Door on Left Wall ── */}
      <Polygon
        points={`${d4.x},${d4.y} ${d3.x},${d3.y} ${d2.x},${d2.y} ${d1.x},${d1.y}`}
        fill={palette.door}
        stroke="#1E1B18"
        strokeWidth={0.8}
      />
      <Line x1={d4.x} y1={d4.y} x2={d2.x} y2={d2.y} stroke="rgba(255, 255, 255, 0.22)" strokeWidth={0.7} />
      <Line x1={d1.x} y1={d1.y} x2={d3.x} y2={d3.y} stroke="rgba(255, 255, 255, 0.22)" strokeWidth={0.7} />

      {/* ── Framed Glass Window on Right Wall ── */}
      <Polygon
        points={`${wn4.x},${wn4.y} ${wn3.x},${wn3.y} ${wn2.x},${wn2.y} ${wn1.x},${wn1.y}`}
        fill="#7FB3D5"
        stroke="#FFFFFF"
        strokeWidth={0.9}
      />
      <Line
        x1={toIso(x + w + 0.01, winStartZ + winD / 2, winStartY).x}
        y1={toIso(x + w + 0.01, winStartZ + winD / 2, winStartY).y}
        x2={toIso(x + w + 0.01, winStartZ + winD / 2, winEndY).x}
        y2={toIso(x + w + 0.01, winStartZ + winD / 2, winEndY).y}
        stroke="#FFFFFF"
        strokeWidth={0.7}
      />

      {/* ── 4-SIDED SOLID ROOF ── */}

      {/* Face 1: Back Roof Slope (North / Back-Right) */}
      <Polygon
        points={`${rLeft.x},${rLeft.y} ${rRight.x},${rRight.y} ${ebRight.x},${ebRight.y} ${ebLeft.x},${ebLeft.y}`}
        fill={palette.roofBack}
      />

      {/* Face 2: Left Roof Slope (West / Back-Left) */}
      <Polygon
        points={`${rLeft.x},${rLeft.y} ${ebLeft.x},${ebLeft.y} ${efLeft.x},${efLeft.y}`}
        fill={palette.roofLeft}
      />

      {/* Face 3: Right Roof Slope (East / Front-Right) */}
      <Polygon
        points={`${rRight.x},${rRight.y} ${efRight.x},${efRight.y} ${ebRight.x},${ebRight.y}`}
        fill={palette.roofRight}
      />

      {/* Face 4: Front Roof Slope (South / Sunlit Front) */}
      <Polygon
        points={`${rLeft.x},${rLeft.y} ${rRight.x},${rRight.y} ${efRight.x},${efRight.y} ${efLeft.x},${efLeft.y}`}
        fill={palette.roofFront}
        stroke="rgba(0, 0, 0, 0.12)"
        strokeWidth={0.6}
      />

      {/* Texture Line across front slope */}
      <Line
        x1={toIso(x - overhang, ridgeZ + (d / 2 + overhang) * 0.5, y + (roofPeakH + wallH) / 2).x}
        y1={toIso(x - overhang, ridgeZ + (d / 2 + overhang) * 0.5, y + (roofPeakH + wallH) / 2).y}
        x2={toIso(x + w + overhang, ridgeZ + (d / 2 + overhang) * 0.5, y + (roofPeakH + wallH) / 2).x}
        y2={toIso(x + w + overhang, ridgeZ + (d / 2 + overhang) * 0.5, y + (roofPeakH + wallH) / 2).y}
        stroke="rgba(255, 255, 255, 0.22)"
        strokeWidth={0.8}
      />

      {/* Eave Underhang Shadows */}
      <Line x1={efLeft.x} y1={efLeft.y} x2={efRight.x} y2={efRight.y} stroke="rgba(0, 0, 0, 0.35)" strokeWidth={1.2} />
      <Line x1={efRight.x} y1={efRight.y} x2={ebRight.x} y2={ebRight.y} stroke="rgba(0, 0, 0, 0.35)" strokeWidth={1.2} />

      {/* Hip Ridges (Highlight lines between slopes) */}
      <Line x1={rLeft.x} y1={rLeft.y} x2={efLeft.x} y2={efLeft.y} stroke={palette.roofRidge} strokeWidth={0.9} />
      <Line x1={rRight.x} y1={rRight.y} x2={efRight.x} y2={efRight.y} stroke={palette.roofRidge} strokeWidth={0.9} />
      <Line x1={rRight.x} y1={rRight.y} x2={ebRight.x} y2={ebRight.y} stroke={palette.roofRidge} strokeWidth={0.9} />

      {/* Central Roof Ridge Cap */}
      <Line x1={rLeft.x} y1={rLeft.y} x2={rRight.x} y2={rRight.y} stroke={palette.roofRidge} strokeWidth={1.8} />

      {/* ── Floating Abbreviation Label ── */}
      {showLabel && Boolean(name) && (
        <G>
          <SvgText
            x={labelPos.x}
            y={labelPos.y}
            fontSize="9"
            fontWeight="900"
            fill="#FFFFFF"
            stroke="#0F172A"
            strokeWidth="2.4"
            textAnchor="middle"
            alignmentBaseline="middle">
            {name}
          </SvgText>
          <SvgText
            x={labelPos.x}
            y={labelPos.y}
            fontSize="9"
            fontWeight="900"
            fill="#FFFFFF"
            textAnchor="middle"
            alignmentBaseline="middle">
            {name}
          </SvgText>
        </G>
      )}
    </G>
  );
}
