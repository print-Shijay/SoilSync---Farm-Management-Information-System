import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import { Sparkles, ShieldAlert, Leaf, Layers, Lock } from 'lucide-react-native';
import type { FarmZone } from '../types';

type ZoneContextMenuProps = {
  zone: FarmZone;
  onRename: (zoneId: string, newName: string) => void;
  onResize?: (zoneId: string, newWidthM: number, newHeightM: number) => void;
  onToggleLock?: (zoneId: string) => void;
  onDelete: (zoneId: string) => void;
  onDeselect: () => void;
};

export function ZoneContextMenu({
  zone,
  onRename,
  onResize,
  onToggleLock,
  onDelete,
  onDeselect,
}: ZoneContextMenuProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(zone.name);

  useEffect(() => {
    setIsRenaming(false);
    setRenameValue(zone.name);
  }, [zone.id, zone.name]);

  const handleRenameSubmit = () => {
    // Security & Data Integrity: enforce 255 char limit on naming
    const trimmed = renameValue.trim().slice(0, 255);
    if (trimmed && trimmed !== zone.name) {
      onRename(zone.id, trimmed);
    }
    setIsRenaming(false);
  };

  const isGreenhouse = zone.zoneType === 'greenhouse';
  const isInConversion = zone.organicStatus === 'in_conversion';
  const isCompound = zone.isCompoundAsset;
  const isLocked = zone.isLockedGroup !== false;

  const handleDelete = () => {
    const title = isCompound ? 'Remove Imported Farm' : 'Delete Zone';
    const message = isCompound
      ? `Are you sure you want to remove the imported farm "${zone.name}" and all of its plots and facilities from this layout?`
      : `Are you sure you want to remove "${zone.name}" from the master plan? Plots inside this zone will not be deleted.`;

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDelete(zone.id),
      },
    ]);
  };

  return (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}>
      {/* Header Info */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8 }}>
          <View
            style={{
              backgroundColor: isCompound
                ? '#1E3A8A'
                : isGreenhouse
                ? '#2D6A4F'
                : isInConversion
                ? '#D97706'
                : '#8C4522',
              padding: 5,
              borderRadius: 8,
            }}>
            {isCompound ? (
              <Layers size={16} color="#FFFFFF" strokeWidth={2.4} />
            ) : isGreenhouse ? (
              <Sparkles size={16} color="#FFFFFF" strokeWidth={2.4} />
            ) : isInConversion ? (
              <ShieldAlert size={16} color="#FFFFFF" strokeWidth={2.4} />
            ) : (
              <Leaf size={16} color="#FFFFFF" strokeWidth={2.4} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            {isRenaming ? (
              <TextInput
                value={renameValue}
                onChangeText={setRenameValue}
                maxLength={255}
                onBlur={handleRenameSubmit}
                onSubmitEditing={handleRenameSubmit}
                autoFocus
                selectTextOnFocus
                style={{
                  fontSize: 15,
                  fontWeight: '800',
                  color: '#1C120C',
                  borderBottomWidth: 2,
                  borderBottomColor: '#8C4522',
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                }}
              />
            ) : (
              <Pressable onPress={() => setIsRenaming(true)}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1C120C' }} numberOfLines={1}>
                  {zone.name}
                </Text>
              </Pressable>
            )}
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#8C7C70' }}>
              {zone.widthM}m × {zone.heightM}m ({Math.round(zone.widthM * zone.heightM)} m²)
            </Text>
          </View>
        </View>

        <View
          style={{
            backgroundColor: isCompound
              ? '#DBEAFE'
              : isGreenhouse
              ? '#DCFCE7'
              : isInConversion
              ? '#FEF3C7'
              : '#E0E7FF',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
          }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: '800',
              color: isCompound
                ? '#1E40AF'
                : isGreenhouse
                ? '#15803D'
                : isInConversion
                ? '#B45309'
                : '#3730A3',
              textTransform: 'uppercase',
            }}>
            {isCompound
              ? (isLocked ? 'FARM PARCEL (LOCKED)' : 'FARM PARCEL (UNGROUPED)')
              : isInConversion
              ? 'IN CONVERSION'
              : isGreenhouse
              ? 'GREENHOUSE'
              : 'OPEN FIELD'}
          </Text>
        </View>
      </View>

      {/* Compound Asset Explanatory Banner */}
      {isCompound && (
        <View
          style={{
            backgroundColor: '#EFF6FF',
            borderColor: '#BFDBFE',
            borderWidth: 1,
            borderRadius: 10,
            padding: 8,
            marginBottom: 10,
          }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E40AF' }}>
            {isLocked
              ? '🔒 Movable as One Asset: Dragging moves this entire farm and all its beds together.'
              : '🔓 Ungrouped: Beds inside can now be individually moved or adjusted.'}
          </Text>
        </View>
      )}

      {/* Quick Dimension Steppers */}
      {onResize && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8F6F2',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 12,
            marginBottom: 10,
          }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#524037' }}>
            📐 Boundary (m):
          </Text>

          {/* Width Stepper */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#8C7C70' }}>W</Text>
            <Pressable
              onPress={() => {
                const newW = Math.max(2, Math.round((zone.widthM - 1) * 10) / 10);
                onResize(zone.id, newW, zone.heightM);
              }}
              style={{
                backgroundColor: '#ffffff',
                borderWidth: 1,
                borderColor: '#E2D8CC',
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 2,
              }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#1C120C' }}>-</Text>
            </Pressable>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#1C120C', minWidth: 36, textAlign: 'center' }}>
              {zone.widthM}m
            </Text>
            <Pressable
              onPress={() => {
                const newW = Math.min(60, Math.round((zone.widthM + 1) * 10) / 10);
                onResize(zone.id, newW, zone.heightM);
              }}
              style={{
                backgroundColor: '#ffffff',
                borderWidth: 1,
                borderColor: '#E2D8CC',
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 2,
              }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#1C120C' }}>+</Text>
            </Pressable>
          </View>

          {/* Height Stepper */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#8C7C70' }}>H</Text>
            <Pressable
              onPress={() => {
                const newH = Math.max(2, Math.round((zone.heightM - 1) * 10) / 10);
                onResize(zone.id, zone.widthM, newH);
              }}
              style={{
                backgroundColor: '#ffffff',
                borderWidth: 1,
                borderColor: '#E2D8CC',
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 2,
              }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#1C120C' }}>-</Text>
            </Pressable>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#1C120C', minWidth: 36, textAlign: 'center' }}>
              {zone.heightM}m
            </Text>
            <Pressable
              onPress={() => {
                const newH = Math.min(60, Math.round((zone.heightM + 1) * 10) / 10);
                onResize(zone.id, zone.widthM, newH);
              }}
              style={{
                backgroundColor: '#ffffff',
                borderWidth: 1,
                borderColor: '#E2D8CC',
                borderRadius: 6,
                paddingHorizontal: 7,
                paddingVertical: 2,
              }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#1C120C' }}>+</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {/* Rename Button */}
        <Pressable
          onPress={() => setIsRenaming(true)}
          style={{
            flex: 1,
            paddingVertical: 11,
            borderRadius: 12,
            backgroundColor: '#F5EBE1',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#8C4522' }}>✏️ Rename</Text>
        </Pressable>

        {/* Lock/Ungroup Toggle for Compound Asset */}
        {isCompound && onToggleLock && (
          <Pressable
            onPress={() => onToggleLock(zone.id)}
            style={{
              flex: 1.5,
              paddingVertical: 11,
              borderRadius: 12,
              backgroundColor: isLocked ? '#DBEAFE' : '#FEF3C7',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 5,
            }}>
            {isLocked ? (
              <>
                <Layers size={14} color="#1E40AF" strokeWidth={2.4} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E40AF' }}>Ungroup Beds</Text>
              </>
            ) : (
              <>
                <Lock size={14} color="#B45309" strokeWidth={2.4} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#B45309' }}>Lock as One</Text>
              </>
            )}
          </Pressable>
        )}

        {/* Delete Zone */}
        <Pressable
          onPress={handleDelete}
          style={{
            flex: 1,
            paddingVertical: 11,
            borderRadius: 12,
            backgroundColor: '#fef2f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>🗑 Delete</Text>
        </Pressable>

        {/* Deselect */}
        <Pressable
          onPress={onDeselect}
          style={{
            paddingVertical: 11,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: '#F2ECE4',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#A9927D' }}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}
