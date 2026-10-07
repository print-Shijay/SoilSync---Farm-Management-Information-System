import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import {
  Wrench,
  FlaskConical,
  Sprout,
  Recycle,
  Home,
  Egg,
  Package,
  Clock,
} from 'lucide-react-native';
import type { FarmFacility } from '../types';

type FacilityContextMenuProps = {
  facility: FarmFacility;
  onRename: (facilityId: string, newName: string) => void;
  onResize?: (facilityId: string, newWidthM: number, newHeightM: number) => void;
  onOpenInventory: (facility: FarmFacility) => void;
  onDelete: (facilityId: string) => void;
  onDeselect: () => void;
};

export function FacilityContextMenu({
  facility,
  onRename,
  onResize,
  onOpenInventory,
  onDelete,
  onDeselect,
}: FacilityContextMenuProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(facility.name);

  useEffect(() => {
    setIsRenaming(false);
    setRenameValue(facility.name);
  }, [facility.id, facility.name]);

  const handleRenameSubmit = () => {
    // Security & Data Integrity: enforce 255 char limit on naming
    const trimmed = renameValue.trim().slice(0, 255);
    if (trimmed && trimmed !== facility.name) {
      onRename(facility.id, trimmed);
    }
    setIsRenaming(false);
  };

  const getIcon = (iconName: string, size = 16, color = '#FFFFFF') => {
    switch (iconName) {
      case 'wrench':
        return <Wrench size={size} color={color} strokeWidth={2.4} />;
      case 'flask':
        return <FlaskConical size={size} color={color} strokeWidth={2.4} />;
      case 'sprout':
        return <Sprout size={size} color={color} strokeWidth={2.4} />;
      case 'recycle':
        return <Recycle size={size} color={color} strokeWidth={2.4} />;
      case 'home':
        return <Home size={size} color={color} strokeWidth={2.4} />;
      case 'egg':
        return <Egg size={size} color={color} strokeWidth={2.4} />;
      default:
        return <Package size={size} color={color} strokeWidth={2.4} />;
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Facility',
      `Are you sure you want to remove "${facility.name}" and all its stored inventory items from this layout?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(facility.id),
        },
      ]
    );
  };

  const inventoryCount = facility.inventories?.length || 0;

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
              backgroundColor: facility.color || '#334155',
              padding: 5,
              borderRadius: 8,
            }}>
            {getIcon(facility.icon, 16)}
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
                  {facility.name}
                </Text>
              </Pressable>
            )}
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#8C7C70' }}>
              {facility.widthM}m × {facility.heightM}m • {inventoryCount} {inventoryCount === 1 ? 'item' : 'items'} stored
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View
            style={{
              backgroundColor:
                facility.facilityFunction === 'time_keeping'
                  ? 'rgba(79, 70, 229, 0.1)'
                  : facility.facilityFunction === 'both'
                  ? 'rgba(5, 150, 105, 0.1)'
                  : 'rgba(217, 119, 6, 0.1)',
              paddingHorizontal: 7,
              paddingVertical: 3,
              borderRadius: 6,
            }}>
            <Text
              style={{
                fontSize: 9,
                fontWeight: '800',
                color:
                  facility.facilityFunction === 'time_keeping'
                    ? '#4338CA'
                    : facility.facilityFunction === 'both'
                    ? '#059669'
                    : '#B45309',
                textTransform: 'uppercase',
              }}>
              {facility.facilityFunction === 'time_keeping'
                ? '⏱️ Time'
                : facility.facilityFunction === 'both'
                ? '🔄 Both'
                : '📦 Inventory'}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: 'rgba(3, 105, 161, 0.1)',
              paddingHorizontal: 7,
              paddingVertical: 3,
              borderRadius: 6,
            }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#0369A1', textTransform: 'uppercase' }}>
              {facility.category}
            </Text>
          </View>
        </View>
      </View>

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
            📐 Size (m):
          </Text>

          {/* Width Stepper */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#8C7C70' }}>W</Text>
            <Pressable
              onPress={() => {
                const newW = Math.max(1.5, Math.round((facility.widthM - 0.5) * 10) / 10);
                onResize(facility.id, newW, facility.heightM);
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
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#1C120C', minWidth: 32, textAlign: 'center' }}>
              {facility.widthM}m
            </Text>
            <Pressable
              onPress={() => {
                const newW = Math.min(25, Math.round((facility.widthM + 0.5) * 10) / 10);
                onResize(facility.id, newW, facility.heightM);
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
                const newH = Math.max(1.5, Math.round((facility.heightM - 0.5) * 10) / 10);
                onResize(facility.id, facility.widthM, newH);
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
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#1C120C', minWidth: 32, textAlign: 'center' }}>
              {facility.heightM}m
            </Text>
            <Pressable
              onPress={() => {
                const newH = Math.min(25, Math.round((facility.heightM + 0.5) * 10) / 10);
                onResize(facility.id, facility.widthM, newH);
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

        {/* Open Facility Hub (Inventory / Time Keeping) */}
        <Pressable
          onPress={() => onOpenInventory(facility)}
          style={{
            flex: 2,
            paddingVertical: 11,
            borderRadius: 12,
            backgroundColor:
              facility.facilityFunction === 'time_keeping'
                ? '#4338CA'
                : facility.facilityFunction === 'both'
                ? '#047857'
                : '#0369A1',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
          }}>
          {facility.facilityFunction === 'time_keeping' ? (
            <>
              <Clock size={15} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                Time Logs
              </Text>
            </>
          ) : facility.facilityFunction === 'both' ? (
            <>
              <Clock size={15} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                Manage Hub
              </Text>
            </>
          ) : (
            <>
              <Package size={15} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                Inventory ({inventoryCount})
              </Text>
            </>
          )}
        </Pressable>

        {/* Delete Facility */}
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
