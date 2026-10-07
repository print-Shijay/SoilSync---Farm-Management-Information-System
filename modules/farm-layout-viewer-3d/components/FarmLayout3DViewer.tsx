import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Polygon, Ellipse, Circle, G, Text as SvgText } from 'react-native-svg';
import { Building3D } from './Building3D';

// Colors for the stylized aesthetic aligned with warm earth theme
const COLOR_GROUND = '#6E8E59'; 
const COLOR_DIRT_TOP = '#8C4522';
const COLOR_DIRT_LEFT = '#5D2E17';
const COLOR_DIRT_RIGHT = '#482311';
const COLOR_CROP = '#D99C2B';
const COLOR_WOOD_TOP = '#8C7C70';
const COLOR_WOOD_LEFT = '#8C7764';
const COLOR_WOOD_RIGHT = '#6F5C4B';
const COLOR_CANOPY_TOP = '#557242';
const COLOR_CANOPY_LEFT = '#425C31';
const COLOR_CANOPY_RIGHT = '#324823';

/**
 * Returns a short, clean abbreviation for facility names across all 3D maps.
 */
export function getFacilityAbbreviation(name?: string, category?: string): string {
  if (!name) return 'FAC';
  const clean = name.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('greenhouse') || lower.includes('green house')) return 'GH';
  if (lower.includes('warehouse')) return 'WHSE';
  if (lower.includes('cold storage')) return 'COLD';
  if (lower.includes('tool shed') || lower === 'shed') return 'SHED';
  if (lower.includes('storage')) return 'STOR';
  if (lower.includes('compost')) return 'COMP';
  if (lower.includes('processing')) return 'PROC';
  if (lower.includes('packing')) return 'PACK';
  if (lower.includes('water') || lower.includes('irrigation')) return 'H2O';
  if (lower.includes('chicken') || lower.includes('coop')) return 'COOP';
  if (lower.includes('livestock') || lower.includes('barn')) return 'BARN';
  if (lower.includes('silo')) return 'SILO';
  if (lower.includes('nursery')) return 'NURS';
  if (lower.includes('workshop')) return 'SHOP';

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 4) {
    const initials = words.map((w) => w[0].toUpperCase()).join('');
    if (initials.length >= 2 && initials.length <= 4) return initials;
  }

  return clean.slice(0, 4).toUpperCase();
}

// Helper to determine bounds
function resolveBlueprintBounds(blueprintData: any) {
  const items = Array.isArray(blueprintData?.items) ? blueprintData.items : [];
  const facilities = Array.isArray(blueprintData?.facilities) ? blueprintData.facilities : [];
  const zones = Array.isArray(blueprintData?.zones) ? blueprintData.zones : [];

  const allElements = [
    ...items.map((it: any) => ({ x: Number(it.x ?? 0), z: Number(it.z ?? 0), w: Number(it.widthM ?? 0.6), d: Number(it.depthM ?? 0.6) })),
    ...facilities.map((f: any) => ({ x: Number(f.x ?? 0), z: Number(f.y ?? 0), w: Number(f.widthM ?? 3), d: Number(f.heightM ?? 3) })),
    ...zones.map((z: any) => ({ x: Number(z.x ?? 0), z: Number(z.y ?? 0), w: Number(z.widthM ?? 8), d: Number(z.heightM ?? 8) })),
  ];

  if (allElements.length === 0) return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };

  return allElements.reduce(
    (currentBounds: any, el: any) => {
      const halfWidth = el.w / 2;
      const halfDepth = el.d / 2;
      return {
        minX: Math.min(currentBounds.minX, el.x - halfWidth),
        maxX: Math.max(currentBounds.maxX, el.x + halfWidth),
        minZ: Math.min(currentBounds.minZ, el.z - halfDepth),
        maxZ: Math.max(currentBounds.maxZ, el.z + halfDepth),
      };
    },
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  );
}

export const FarmLayout3DViewer = React.memo(function FarmLayout3DViewer({
  layout,
  width = 300,
  height = 300,
  showLabels = false,
  plotColors = {},
}: {
  layout: any;
  width?: number;
  height?: number;
  showLabels?: boolean;
  plotColors?: Record<number, string>;
}) {
  const blueprintData = layout?.blueprintData ?? (typeof layout?.blueprint_data_json === 'string' ? JSON.parse(layout.blueprint_data_json || '{}') : (layout?.blueprint_data_json ?? {}));
  const items = Array.isArray(blueprintData.items) ? blueprintData.items : [];
  const facilities = Array.isArray(blueprintData.facilities) ? blueprintData.facilities : [];
  const zones = Array.isArray(blueprintData.zones) ? blueprintData.zones : [];
  
  // Attach a legend character (A, B, C...) to each item before sorting
  const itemsWithLegends = items.map((item: any, index: number) => ({
    ...item,
    originalIndex: index,
    legendChar: String.fromCharCode(65 + (index % 26)), // A, B, C...
    isFacility: false,
  }));

  const facilitiesWithData = facilities.map((fac: any, index: number) => ({
    ...fac,
    z: fac.y,
    depthM: fac.heightM,
    originalIndex: index,
    isFacility: true,
  }));
  
  const bounds = useMemo(() => resolveBlueprintBounds(blueprintData), [blueprintData]);
  const groundWidth = Math.max(10, (bounds.maxX - bounds.minX) + 4);
  const groundDepth = Math.max(10, (bounds.maxZ - bounds.minZ) + 4);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  // Isometric projection math
  const maxSpanX = groundWidth + groundDepth;
  const maxSpanY = (groundWidth + groundDepth) * 0.5 + 4; 
  const scale = Math.min(width / maxSpanX, height / maxSpanY) * 0.9;
  
  const cx = width / 2;
  const cy = height / 2 + (scale * 2); 

  const toIso = (wx: number, wz: number, wy: number = 0) => {
    // 2:1 isometric projection
    const isoX = (wx - wz) * scale;
    const isoY = (wx + wz) * 0.5 * scale - wy * scale;
    return { x: cx + isoX, y: cy + isoY };
  };

  const Box = ({ x, z, y, w, d, h, colorTop, colorLeft, colorRight }: any) => {
    const pTop = toIso(x, z, y + h);
    const pRight = toIso(x + w, z, y + h);
    const pBottom = toIso(x + w, z + d, y + h);
    const pLeft = toIso(x, z + d, y + h);
    
    const bTop = toIso(x, z, y);
    const bRight = toIso(x + w, z, y);
    const bBottom = toIso(x + w, z + d, y);
    const bLeft = toIso(x, z + d, y);

    return (
      <G>
        <Polygon points={`${pLeft.x},${pLeft.y} ${pBottom.x},${pBottom.y} ${bBottom.x},${bBottom.y} ${bLeft.x},${bLeft.y}`} fill={colorLeft} />
        <Polygon points={`${pBottom.x},${pBottom.y} ${pRight.x},${pRight.y} ${bRight.x},${bRight.y} ${bBottom.x},${bBottom.y}`} fill={colorRight} />
        <Polygon points={`${pTop.x},${pTop.y} ${pRight.x},${pRight.y} ${pBottom.x},${pBottom.y} ${pLeft.x},${pLeft.y}`} fill={colorTop} />
      </G>
    );
  };

  // Combine items and facilities, sort back-to-front (depth sorting)
  const allRenderables = [...itemsWithLegends, ...facilitiesWithData];
  const sortedItems = allRenderables.sort((a, b) => {
    const depthA = Number(a.x ?? 0) + Number(a.z ?? 0);
    const depthB = Number(b.x ?? 0) + Number(b.z ?? 0);
    return depthA - depthB;
  });

  return (
    <View style={{ width, height, overflow: 'hidden', borderRadius: 24, backgroundColor: '#FBF8F4' }}>
      <Svg width={width} height={height}>
        {/* Ground */}
        <Box 
          x={-groundWidth/2} z={-groundDepth/2} y={-0.2} w={groundWidth} d={groundDepth} h={0.2} 
          colorTop={COLOR_GROUND} colorLeft="#567244" colorRight="#435C33"
        />
        
        {/* Items */}
        {sortedItems.map((item, index) => {
          const isFacility = Boolean(item.isFacility);
          const isBed = item.type === 'bed';
          const w = Number(item.widthM ?? (isFacility ? 3 : 0.6));
          const d = Number(item.depthM ?? (isFacility ? 3 : 0.6));
          const h = isFacility ? 1.6 : (isBed ? 0.3 : 2.0); 
          
          const ix = Number(item.x ?? 0) - centerX - w/2;
          const iz = Number(item.z ?? 0) - centerZ - d/2;
          const labelPt = toIso(ix + w/2, iz + d/2, h + (isBed ? 0.3 : 0.5));

          if (isFacility) {
            const abbrev = getFacilityAbbreviation(item.name, item.category);
            return (
              <Building3D
                key={`fac-${item.id ?? index}`}
                x={ix}
                z={iz}
                y={0}
                w={w}
                d={d}
                h={1.8}
                color={item.color}
                name={abbrev}
                category={item.category}
                showLabel={true}
                toIso={toIso}
              />
            );
          }

          if (isBed) {
            const cropCx = Math.min(6, Math.max(1, Math.floor(w / 0.5)));
            const cropCz = Math.min(6, Math.max(1, Math.floor(d / 0.5)));
            const crops = [];
            for (let i = 0; i < cropCx; i++) {
              for (let j = 0; j < cropCz; j++) {
                const ox = ix + (i + 0.5) * (w / cropCx);
                const oz = iz + (j + 0.5) * (d / cropCz);
                const pt = toIso(ox, oz, h);
                crops.push(
                  <Ellipse 
                    key={`crop-${i}-${j}`} 
                    cx={pt.x} cy={pt.y - 2} 
                    rx={Math.max(2, scale * 0.15)} ry={Math.max(1.5, scale * 0.1)} 
                    fill={COLOR_CROP} 
                  />
                );
              }
            }

            return (
              <G key={item.id ?? index}>
                <Box x={ix} z={iz} y={0} w={w} d={d} h={h} colorTop={COLOR_DIRT_TOP} colorLeft={COLOR_DIRT_LEFT} colorRight={COLOR_DIRT_RIGHT} />
                {crops}
                {showLabels && (() => {
                  const plotColor = plotColors[item.originalIndex];
                  const hasColor = Boolean(plotColor);
                  const isLight = (hex?: string) => {
                    if (!hex) return false;
                    const clean = hex.replace('#', '');
                    if (clean.length !== 6) return false;
                    const r = parseInt(clean.substring(0, 2), 16);
                    const g = parseInt(clean.substring(2, 4), 16);
                    const b = parseInt(clean.substring(4, 6), 16);
                    return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
                  };
                  const badgeBg = hasColor ? plotColor : '#FFFFFF';
                  const badgeBorder = hasColor ? '#FFFFFF' : '#8C4522';
                  const textColor = hasColor ? (isLight(plotColor) ? '#1E293B' : '#FFFFFF') : '#8C4522';

                  return (
                    <G>
                      <Circle cx={labelPt.x} cy={labelPt.y + 1} r={9.5} fill="rgba(0, 0, 0, 0.35)" />
                      <Circle cx={labelPt.x} cy={labelPt.y} r={9} fill={badgeBg} stroke={badgeBorder} strokeWidth={1.8} />
                      <SvgText
                        x={labelPt.x}
                        y={labelPt.y + 3.5}
                        fontSize="11"
                        fontWeight="900"
                        fill={textColor}
                        textAnchor="middle"
                      >
                        {item.legendChar}
                      </SvgText>
                    </G>
                  );
                })()}
              </G>
            );
          } else {
            const r = 0.08;
            return (
              <G key={item.id ?? index}>
                <Box x={ix} z={iz} y={0} w={r} d={r} h={h} colorTop={COLOR_WOOD_TOP} colorLeft={COLOR_WOOD_LEFT} colorRight={COLOR_WOOD_RIGHT} />
                <Box x={ix + w - r} z={iz} y={0} w={r} d={r} h={h} colorTop={COLOR_WOOD_TOP} colorLeft={COLOR_WOOD_LEFT} colorRight={COLOR_WOOD_RIGHT} />
                <Box x={ix} z={iz + d - r} y={0} w={r} d={r} h={h} colorTop={COLOR_WOOD_TOP} colorLeft={COLOR_WOOD_LEFT} colorRight={COLOR_WOOD_RIGHT} />
                <Box x={ix + w - r} z={iz + d - r} y={0} w={r} d={r} h={h} colorTop={COLOR_WOOD_TOP} colorLeft={COLOR_WOOD_LEFT} colorRight={COLOR_WOOD_RIGHT} />
                <Box x={ix - 0.2} z={iz - 0.2} y={h} w={w + 0.4} d={d + 0.4} h={0.3} colorTop={COLOR_CANOPY_TOP} colorLeft={COLOR_CANOPY_LEFT} colorRight={COLOR_CANOPY_RIGHT} />
                {showLabels && (() => {
                  const plotColor = plotColors[item.originalIndex];
                  const hasColor = Boolean(plotColor);
                  const isLight = (hex?: string) => {
                    if (!hex) return false;
                    const clean = hex.replace('#', '');
                    if (clean.length !== 6) return false;
                    const r = parseInt(clean.substring(0, 2), 16);
                    const g = parseInt(clean.substring(2, 4), 16);
                    const b = parseInt(clean.substring(4, 6), 16);
                    return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
                  };
                  const badgeBg = hasColor ? plotColor : '#FFFFFF';
                  const badgeBorder = hasColor ? '#FFFFFF' : '#8C4522';
                  const textColor = hasColor ? (isLight(plotColor) ? '#1E293B' : '#FFFFFF') : '#8C4522';

                  return (
                    <G>
                      <Circle cx={labelPt.x} cy={labelPt.y + 1} r={9.5} fill="rgba(0, 0, 0, 0.35)" />
                      <Circle cx={labelPt.x} cy={labelPt.y} r={9} fill={badgeBg} stroke={badgeBorder} strokeWidth={1.8} />
                      <SvgText
                        x={labelPt.x}
                        y={labelPt.y + 3.5}
                        fontSize="11"
                        fontWeight="900"
                        fill={textColor}
                        textAnchor="middle"
                      >
                        {item.legendChar}
                      </SvgText>
                    </G>
                  );
                })()}
              </G>
            );
          }
        })}
      </Svg>
    </View>
  );
});
