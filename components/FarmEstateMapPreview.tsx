import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import Svg, { Polygon, Ellipse, G, Text as SvgText, Line } from 'react-native-svg';
import type { FarmEstateRecord, EstatePlacedFarm, EstateFacility } from '../lib/estate-operations';
import { getFacilityAbbreviation, Building3D } from '../modules/farm-layout-viewer-3d';

// Stylized warm earth aesthetic colors for 3D Isometric View
const COLOR_ESTATE_GROUND = '#5C7B47';
const COLOR_ESTATE_GROUND_LEFT = '#476236';
const COLOR_ESTATE_GROUND_RIGHT = '#364B29';

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

export interface ExtractedFarmElement {
  id: string;
  type: 'bed' | 'trellis' | 'sub_facility';
  relX: number; // offset relative to farm area geometric center
  relZ: number; // offset relative to farm area geometric center
  w: number;
  d: number;
  h: number;
  color?: string;
  name?: string;
}

export interface ParsedFarmArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  widthM: number;
  depthM: number;
  hasElements: boolean;
  elements: ExtractedFarmElement[];
}

/**
 * Accurately extracts elements and computes the exact boundary box of a farm area
 * from its database layout or blueprint.
 */
export function parseFarmAreaLayout(layoutObj: any): ParsedFarmArea {
  if (!layoutObj) {
    return {
      minX: -2.5,
      maxX: 2.5,
      minZ: -2.5,
      maxZ: 2.5,
      centerX: 0,
      centerZ: 0,
      widthM: 6,
      depthM: 6,
      hasElements: false,
      elements: [],
    };
  }

  const blueprintData =
    layoutObj.blueprintData ??
    (typeof layoutObj.blueprint_data_json === 'string'
      ? (() => {
          try {
            return JSON.parse(layoutObj.blueprint_data_json || '{}');
          } catch {
            return {};
          }
        })()
      : layoutObj.blueprint_data_json ?? {});

  type RawItem = {
    id?: string;
    type?: string;
    x?: number;
    z?: number;
    y?: number;
    widthM?: number;
    width_m?: number;
    width?: number;
    depthM?: number;
    heightM?: number;
    height_m?: number;
    height?: number;
    length?: number;
    color?: string;
    label?: string;
    name?: string;
    isFacility?: boolean;
  };

  const rawElements: Array<{
    id: string;
    type: 'bed' | 'trellis' | 'sub_facility';
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    color?: string;
    name?: string;
  }> = [];

  // A. Items or plots
  const bpItems: RawItem[] = Array.isArray(blueprintData?.items)
    ? blueprintData.items
    : Array.isArray(blueprintData?.plots)
    ? blueprintData.plots
    : Array.isArray(layoutObj?.plots)
    ? layoutObj.plots
    : [];

  bpItems.forEach((it, idx) => {
    const isBed = it.type === 'bed' || (!it.type && !it.isFacility);
    const w = Math.max(0.6, Number(it.widthM ?? it.width_m ?? it.width ?? (isBed ? 1.6 : 0.8)));
    const d = Math.max(0.6, Number(it.depthM ?? it.heightM ?? it.height_m ?? it.length ?? it.height ?? (isBed ? 1.6 : 0.8)));
    const x = Number(it.x ?? 0);
    const z = Number(it.z ?? it.y ?? 0);
    const h = isBed ? 0.22 : 1.4;

    rawElements.push({
      id: it.id || `item-${idx}`,
      type: isBed ? 'bed' : 'trellis',
      x,
      z,
      w,
      d,
      h,
      color: it.color,
      name: it.label || it.name,
    });
  });

  // B. Facilities inside farm
  const bpFacilities: RawItem[] = Array.isArray(blueprintData?.facilities)
    ? blueprintData.facilities
    : Array.isArray(layoutObj?.facilities)
    ? layoutObj.facilities
    : [];

  bpFacilities.forEach((fac, idx) => {
    const w = Math.max(1.2, Number(fac.widthM ?? fac.width_m ?? fac.width ?? 2.5));
    const d = Math.max(1.2, Number(fac.heightM ?? fac.depthM ?? fac.height_m ?? fac.height ?? 2.5));
    const x = Number(fac.x ?? 0);
    const z = Number(fac.y ?? fac.z ?? 0);

    rawElements.push({
      id: fac.id || `fac-${idx}`,
      type: 'sub_facility',
      x,
      z,
      w,
      d,
      h: 1.4,
      color: fac.color || '#4A5568',
      name: fac.name,
    });
  });

  if (rawElements.length === 0) {
    const defW = Math.max(5, Math.min(Number(layoutObj.widthM ?? blueprintData.widthM ?? 6), 14));
    const defH = Math.max(5, Math.min(Number(layoutObj.heightM ?? blueprintData.heightM ?? 6), 14));
    return {
      minX: -defW / 2,
      maxX: defW / 2,
      minZ: -defH / 2,
      maxZ: defH / 2,
      centerX: 0,
      centerZ: 0,
      widthM: defW,
      depthM: defH,
      hasElements: false,
      elements: [],
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  rawElements.forEach((el) => {
    const hw = el.w / 2;
    const hd = el.d / 2;
    minX = Math.min(minX, el.x - hw);
    maxX = Math.max(maxX, el.x + hw);
    minZ = Math.min(minZ, el.z - hd);
    maxZ = Math.max(maxZ, el.z + hd);
  });

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const occupiedW = maxX - minX;
  const occupiedD = maxZ - minZ;

  // Clean, generous margin around all plots and structures so they never touch or exceed the border
  const PADDING = 1.3;
  const widthM = Math.max(5.0, Math.ceil((occupiedW + PADDING * 2) * 2) / 2);
  const depthM = Math.max(5.0, Math.ceil((occupiedD + PADDING * 2) * 2) / 2);

  const elements: ExtractedFarmElement[] = rawElements.map((el) => ({
    ...el,
    relX: el.x - centerX,
    relZ: el.z - centerZ,
  }));

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX,
    centerZ,
    widthM,
    depthM,
    hasElements: true,
    elements,
  };
}

interface FarmEstateMapPreviewProps {
  estateRecord: FarmEstateRecord | null;
  farms: any[];
  allLayouts?: any[];
  previewWidth?: number;
  previewHeight?: number;
}

export function FarmEstateMapPreview({
  estateRecord,
  farms,
  allLayouts = [],
  previewWidth = 320,
  previewHeight = 160,
}: FarmEstateMapPreviewProps) {
  const layoutData = estateRecord?.layout_data;
  const placedFarms: EstatePlacedFarm[] = layoutData?.placedFarms || [];
  const facilities: EstateFacility[] = layoutData?.facilities || [];
  const worldWidthM = layoutData?.widthM || 60;
  const worldHeightM = layoutData?.heightM || 60;

  // Farm and layout map lookups & accurate area parsing
  const { farmMap, farmParsedMap } = useMemo(() => {
    const fMap = new Map<string, any>();
    farms.forEach((f) => {
      if (f.id) fMap.set(f.id, f);
    });

    const pMap = new Map<string, ParsedFarmArea>();
    allLayouts.forEach((item) => {
      if (item.farm?.id) {
        pMap.set(item.farm.id, parseFarmAreaLayout(item.layout));
      }
    });

    return { farmMap: fMap, farmParsedMap: pMap };
  }, [farms, allLayouts]);

  // Compute estate bounds in world coordinates
  const bounds = useMemo(() => {
    const hasElements = placedFarms.length > 0 || facilities.length > 0;

    if (!hasElements) {
      return {
        minX: -12,
        maxX: 12,
        minZ: -9,
        maxZ: 9,
        centerX: 0,
        centerZ: 0,
        groundWidth: 26,
        groundDepth: 20,
        hasElements: false,
      };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    placedFarms.forEach((pf) => {
      const parsed = farmParsedMap.get(pf.farmId) || { widthM: 6, depthM: 6 };
      const halfW = parsed.widthM / 2;
      const halfH = parsed.depthM / 2;
      minX = Math.min(minX, pf.x - halfW);
      maxX = Math.max(maxX, pf.x + halfW);
      minZ = Math.min(minZ, pf.y - halfH);
      maxZ = Math.max(maxZ, pf.y + halfH);
    });

    facilities.forEach((fac) => {
      const halfW = (fac.widthM || 3) / 2;
      const halfH = (fac.heightM || 3) / 2;
      minX = Math.min(minX, fac.x - halfW);
      maxX = Math.max(maxX, fac.x + halfW);
      minZ = Math.min(minZ, fac.y - halfH);
      maxZ = Math.max(maxZ, fac.y + halfH);
    });

    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const groundWidth = Math.max(18, (maxX - minX) + 8);
    const groundDepth = Math.max(16, (maxZ - minZ) + 8);

    return {
      minX,
      maxX,
      minZ,
      maxZ,
      centerX,
      centerZ,
      groundWidth,
      groundDepth,
      hasElements: true,
    };
  }, [placedFarms, facilities, farmParsedMap]);

  const { centerX, centerZ, groundWidth, groundDepth, hasElements } = bounds;

  // Isometric projection math (2:1 standard isometric projection)
  const maxSpanX = groundWidth + groundDepth;
  const maxSpanY = (groundWidth + groundDepth) * 0.5 + 4;
  const scale = Math.min(previewWidth / maxSpanX, previewHeight / maxSpanY) * 0.94;

  const cx = previewWidth / 2;
  const cy = previewHeight / 2 + (scale * 2.2);

  const toIso = (wx: number, wz: number, wy: number = 0) => {
    const isoX = (wx - wz) * scale;
    const isoY = (wx + wz) * 0.5 * scale - wy * scale;
    return { x: cx + isoX, y: cy + isoY };
  };

  // Reusable 3D Isometric Box component
  const Box = ({
    x,
    z,
    y,
    w,
    d,
    h,
    colorTop,
    colorLeft,
    colorRight,
  }: {
    x: number;
    z: number;
    y: number;
    w: number;
    d: number;
    h: number;
    colorTop: string;
    colorLeft: string;
    colorRight: string;
  }) => {
    const pTop = toIso(x, z, y + h);
    const pRight = toIso(x + w, z, y + h);
    const pBottom = toIso(x + w, z + d, y + h);
    const pLeft = toIso(x, z + d, y + h);

    const bLeft = toIso(x, z + d, y);
    const bBottom = toIso(x + w, z + d, y);
    const bRight = toIso(x + w, z, y);

    return (
      <G>
        <Polygon
          points={`${pLeft.x},${pLeft.y} ${pBottom.x},${pBottom.y} ${bBottom.x},${bBottom.y} ${bLeft.x},${bLeft.y}`}
          fill={colorLeft}
        />
        <Polygon
          points={`${pBottom.x},${pBottom.y} ${pRight.x},${pRight.y} ${bRight.x},${bRight.y} ${bBottom.x},${bBottom.y}`}
          fill={colorRight}
        />
        <Polygon
          points={`${pTop.x},${pTop.y} ${pRight.x},${pRight.y} ${pBottom.x},${pBottom.y} ${pLeft.x},${pLeft.y}`}
          fill={colorTop}
        />
      </G>
    );
  };

  // Prepare all 3D renderable objects and depth-sort them back-to-front
  const renderables = useMemo(() => {
    const items: any[] = [];

    // 1. Placed Farm Parcels & their internal plots
    placedFarms.forEach((pf, idx) => {
      const farmObj = farmMap.get(pf.farmId);
      const parsed = farmParsedMap.get(pf.farmId) || {
        widthM: 6,
        depthM: 6,
        centerX: 0,
        centerZ: 0,
        elements: [],
      };

      const pw = parsed.widthM;
      const pd = parsed.depthM;
      const parcelCenterX = pf.x - centerX;
      const parcelCenterZ = pf.y - centerZ;
      const borderX = parcelCenterX - pw / 2;
      const borderZ = parcelCenterZ - pd / 2;
      const farmName = farmObj?.farm_name || `Area ${idx + 1}`;

      // A. Ground Boundary Guide Perimeter (rendered early on ground)
      items.push({
        type: 'parcel_base',
        sortDepth: -1000 + idx,
        x: borderX,
        z: borderZ,
        y: 0,
        w: pw,
        d: pd,
        h: 0,
        farmName,
      });

      // B. Floating Farm Area Name Badge (elevated above beds)
      items.push({
        type: 'parcel_label',
        sortDepth: parcelCenterX + parcelCenterZ + 15,
        x: parcelCenterX,
        z: parcelCenterZ,
        y: 0.8,
        farmName,
      });

      // C. Constituent planting beds & trellises & internal facilities
      parsed.elements.forEach((el, elIdx) => {
        const itemCenterX = parcelCenterX + el.relX;
        const itemCenterZ = parcelCenterZ + el.relZ;
        const ix = itemCenterX - el.w / 2;
        const iz = itemCenterZ - el.d / 2;

        items.push({
          type: el.type,
          sortDepth: itemCenterX + itemCenterZ,
          x: ix,
          z: iz,
          y: 0,
          w: el.w,
          d: el.d,
          h: el.h,
          color: el.color,
          name: el.name,
          id: `${el.type}-${pf.farmId}-${elIdx}`,
        });
      });
    });

    // 2. Estate-level Central Facilities
    facilities.forEach((fac, idx) => {
      const fw = Number(fac.widthM || 3);
      const fd = Number(fac.heightM || 3);
      const fx = (fac.x - centerX) - fw / 2;
      const fz = (fac.y - centerZ) - fd / 2;

      items.push({
        type: 'estate_facility',
        sortDepth: (fx + fw / 2) + (fz + fd / 2),
        x: fx,
        z: fz,
        y: 0,
        w: fw,
        d: fd,
        h: 1.5,
        color: fac.color || '#D99C2B',
        name: fac.name || 'Facility',
        category: fac.category,
        id: `est-fac-${fac.id || idx}`,
      });
    });

    // Sort back-to-front by depth
    return items.sort((a, b) => a.sortDepth - b.sortDepth);
  }, [placedFarms, facilities, farmMap, farmParsedMap, centerX, centerZ]);

  return (
    <View
      style={{
        width: '100%',
        height: previewHeight,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#F3EDE4',
        borderWidth: 1,
        borderColor: 'rgba(140, 124, 112, 0.18)',
      }}>
      <Svg width={previewWidth} height={previewHeight}>
        {/* ── 1. 3D Estate Ground Slab ── */}
        <Box
          x={-groundWidth / 2}
          z={-groundDepth / 2}
          y={-0.25}
          w={groundWidth}
          d={groundDepth}
          h={0.25}
          colorTop={COLOR_ESTATE_GROUND}
          colorLeft={COLOR_ESTATE_GROUND_LEFT}
          colorRight={COLOR_ESTATE_GROUND_RIGHT}
        />

        {/* ── 2. Decorative Isometric Grid Strips on Base Slab ── */}
        {(() => {
          const lines = [];
          const step = 6;
          const halfW = groundWidth / 2;
          const halfD = groundDepth / 2;

          for (let gx = -halfW + step; gx < halfW; gx += step) {
            const pStart = toIso(gx, -halfD, 0.01);
            const pEnd = toIso(gx, halfD, 0.01);
            lines.push(
              <Line
                key={`iso-gx-${gx}`}
                x1={pStart.x}
                y1={pStart.y}
                x2={pEnd.x}
                y2={pEnd.y}
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            );
          }

          for (let gz = -halfD + step; gz < halfD; gz += step) {
            const pStart = toIso(-halfW, gz, 0.01);
            const pEnd = toIso(halfW, gz, 0.01);
            lines.push(
              <Line
                key={`iso-gz-${gz}`}
                x1={pStart.x}
                y1={pStart.y}
                x2={pEnd.x}
                y2={pEnd.y}
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            );
          }

          return lines;
        })()}

        {/* ── 3. Depth-Sorted Placed Farms, Beds & Facilities ── */}
        {renderables.map((item, index) => {
          if (item.type === 'parcel_base') {
            const p1 = toIso(item.x, item.z, 0.01);
            const p2 = toIso(item.x + item.w, item.z, 0.01);
            const p3 = toIso(item.x + item.w, item.z + item.d, 0.01);
            const p4 = toIso(item.x, item.z + item.d, 0.01);

            return (
              <G key={`pb-${index}`}>
                {/* Clean dashed boundary perimeter guide mark on the grass ground */}
                <Polygon
                  points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                  fill="rgba(255, 255, 255, 0.04)"
                  stroke="rgba(255, 255, 255, 0.45)"
                  strokeWidth={1.4}
                  strokeDasharray="5,4"
                />
              </G>
            );
          }

          if (item.type === 'parcel_label') {
            const labelPos = toIso(item.x, item.z, item.y);

            return (
              <G key={`pl-${index}`}>
                {/* Floating 3D Farm Parcel Name Badge */}
                <SvgText
                  x={labelPos.x}
                  y={labelPos.y}
                  fontSize="9"
                  fontWeight="900"
                  fill="#FFFFFF"
                  stroke="#2A3D1E"
                  strokeWidth="2.5"
                  textAnchor="middle"
                  alignmentBaseline="middle">
                  {item.farmName.length > 14 ? `${item.farmName.slice(0, 13)}…` : item.farmName}
                </SvgText>
                <SvgText
                  x={labelPos.x}
                  y={labelPos.y}
                  fontSize="9"
                  fontWeight="900"
                  fill="#FFFFFF"
                  textAnchor="middle"
                  alignmentBaseline="middle">
                  {item.farmName.length > 14 ? `${item.farmName.slice(0, 13)}…` : item.farmName}
                </SvgText>
              </G>
            );
          }

          if (item.type === 'bed') {
            const cropCx = Math.max(1, Math.floor(item.w / 0.7));
            const cropCz = Math.max(1, Math.floor(item.d / 0.7));
            const crops = [];

            for (let i = 0; i < cropCx; i++) {
              for (let j = 0; j < cropCz; j++) {
                const ox = item.x + (i + 0.5) * (item.w / cropCx);
                const oz = item.z + (j + 0.5) * (item.d / cropCz);
                const pt = toIso(ox, oz, item.y + item.h);
                crops.push(
                  <Ellipse
                    key={`crop-${index}-${i}-${j}`}
                    cx={pt.x}
                    cy={pt.y - 1.5}
                    rx={Math.max(1.8, scale * 0.14)}
                    ry={Math.max(1.2, scale * 0.09)}
                    fill={COLOR_CROP}
                  />
                );
              }
            }

            return (
              <G key={item.id ?? `bed-${index}`}>
                <Box
                  x={item.x}
                  z={item.z}
                  y={item.y}
                  w={item.w}
                  d={item.d}
                  h={item.h}
                  colorTop={COLOR_DIRT_TOP}
                  colorLeft={COLOR_DIRT_LEFT}
                  colorRight={COLOR_DIRT_RIGHT}
                />
                {crops}
              </G>
            );
          }

          if (item.type === 'trellis') {
            const r = 0.08;
            return (
              <G key={item.id ?? `tr-${index}`}>
                <Box x={item.x} z={item.z} y={item.y} w={r} d={r} h={item.h} colorTop={COLOR_WOOD_TOP} colorLeft={COLOR_WOOD_LEFT} colorRight={COLOR_WOOD_RIGHT} />
                <Box x={item.x + item.w - r} z={item.z} y={item.y} w={r} d={r} h={item.h} colorTop={COLOR_WOOD_TOP} colorLeft={COLOR_WOOD_LEFT} colorRight={COLOR_WOOD_RIGHT} />
                <Box x={item.x} z={item.z + item.d - r} y={item.y} w={r} d={r} h={item.h} colorTop={COLOR_WOOD_TOP} colorLeft={COLOR_WOOD_LEFT} colorRight={COLOR_WOOD_RIGHT} />
                <Box x={item.x + item.w - r} z={item.z + item.d - r} y={item.y} w={r} d={r} h={item.h} colorTop={COLOR_WOOD_TOP} colorLeft={COLOR_WOOD_LEFT} colorRight={COLOR_WOOD_RIGHT} />
                <Box
                  x={item.x - 0.15}
                  z={item.z - 0.15}
                  y={item.y + item.h}
                  w={item.w + 0.3}
                  d={item.d + 0.3}
                  h={0.2}
                  colorTop={COLOR_CANOPY_TOP}
                  colorLeft={COLOR_CANOPY_LEFT}
                  colorRight={COLOR_CANOPY_RIGHT}
                />
              </G>
            );
          }

          if (item.type === 'sub_facility') {
            // Farm area internal facility: Render 3D building ONLY (no text label, so farm area name remains prominent)
            return (
              <Building3D
                key={item.id ?? `subfac-${index}`}
                x={item.x}
                z={item.z}
                y={item.y}
                w={item.w}
                d={item.d}
                h={item.h || 1.4}
                color={item.color}
                showLabel={false}
                toIso={toIso}
              />
            );
          }

          if (item.type === 'estate_facility') {
            // Estate-level central facility: Render 3D building with clean abbreviated name
            const abbrev = getFacilityAbbreviation(item.name, item.category);
            return (
              <Building3D
                key={item.id ?? `estfac-${index}`}
                x={item.x}
                z={item.z}
                y={item.y}
                w={item.w}
                d={item.d}
                h={item.h || 1.6}
                color={item.color}
                name={abbrev}
                category={item.category}
                showLabel={true}
                toIso={toIso}
              />
            );
          }

          return null;
        })}

        {/* ── 4. Empty / Fresh State Overlay ── */}
        {!hasElements && (
          <G>
            {(() => {
              const p1 = toIso(-8, -6, 0.05);
              const p2 = toIso(8, -6, 0.05);
              const p3 = toIso(8, 6, 0.05);
              const p4 = toIso(-8, 6, 0.05);
              const center = toIso(0, 0, 0.4);

              return (
                <G>
                  <Polygon
                    points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                    fill="rgba(255, 255, 255, 0.22)"
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                    strokeDasharray="4,4"
                  />
                  <SvgText
                    x={center.x}
                    y={center.y - 4}
                    fill="#FFFFFF"
                    fontSize={11}
                    fontWeight="900"
                    stroke="#2A3D1E"
                    strokeWidth={2}
                    textAnchor="middle">
                    Design 3D Farm Estate
                  </SvgText>
                  <SvgText
                    x={center.x}
                    y={center.y - 4}
                    fill="#FFFFFF"
                    fontSize={11}
                    fontWeight="900"
                    textAnchor="middle">
                    Design 3D Farm Estate
                  </SvgText>
                  <SvgText
                    x={center.x}
                    y={center.y + 11}
                    fill="#F7F3EC"
                    fontSize={8.5}
                    fontWeight="700"
                    stroke="#2A3D1E"
                    strokeWidth={1.5}
                    textAnchor="middle">
                    Tap to arrange parcels & central facilities
                  </SvgText>
                  <SvgText
                    x={center.x}
                    y={center.y + 11}
                    fill="#F7F3EC"
                    fontSize={8.5}
                    fontWeight="700"
                    textAnchor="middle">
                    Tap to arrange parcels & central facilities
                  </SvgText>
                </G>
              );
            })()}
          </G>
        )}
      </Svg>

      {/* Scale Indicator (Bottom Right Corner) */}
      <View
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderRadius: 8,
          paddingHorizontal: 7,
          paddingVertical: 3,
          borderWidth: 1,
          borderColor: 'rgba(140, 124, 112, 0.2)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 2,
          elevation: 2,
        }}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: '#8C7C70' }}>
          {worldWidthM}m × {worldHeightM}m
        </Text>
      </View>
    </View>
  );
}
