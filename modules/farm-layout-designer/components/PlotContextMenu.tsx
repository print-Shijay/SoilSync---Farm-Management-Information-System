/**
 * Farm Layout Designer — Plot Context Menu
 *
 * Actions overlay shown below the toolbar when a plot is selected.
 * Provides rename, delete, and flip orientation options.
 */

import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import type { DesignerPlot } from '../types';

type PlotContextMenuProps = {
  plot: DesignerPlot;
  onRename: (plotId: string, newLabel: string) => void;
  onDelete: (plotId: string) => void;
  onFlip: (plotId: string) => void;
  onDeselect: () => void;
};

export function PlotContextMenu({
  plot,
  onRename,
  onDelete,
  onFlip,
  onDeselect,
}: PlotContextMenuProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(plot.label);

  // Reset rename state when plot changes
  useEffect(() => {
    setIsRenaming(false);
    setRenameValue(plot.label);
  }, [plot.id, plot.label]);

  const handleRenameSubmit = () => {
    // Security & Data Integrity: enforce 255 char limit on naming
    const trimmed = renameValue.trim().slice(0, 255);
    if (trimmed && trimmed !== plot.label) {
      onRename(plot.id, trimmed);
    }
    setIsRenaming(false);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Plot',
      `Are you sure you want to delete "${plot.label}"? Any crop plans assigned to it will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete(plot.id),
        },
      ]
    );
  };

  const dimensionText = `${Math.round(plot.widthM * 10) / 10}m × ${Math.round(plot.heightM * 10) / 10}m`;

  return (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      {/* Plot info row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            backgroundColor: plot.color,
            marginRight: 8,
          }}
        />
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
              flex: 1,
              fontSize: 15,
              fontWeight: '700',
              color: '#1C120C',
              borderBottomWidth: 2,
              borderBottomColor: '#8C4522',
              paddingVertical: 2,
              paddingHorizontal: 4,
            }}
          />
        ) : (
          <Pressable onPress={() => setIsRenaming(true)} style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1C120C' }}>
              {plot.label}
            </Text>
          </Pressable>
        )}
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#8C7C70' }}>
          {dimensionText}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => setIsRenaming(true)}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: '#F2ECE4',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#8C4522' }}>✏️ Rename</Text>
        </Pressable>

        <Pressable
          onPress={() => onFlip(plot.id)}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: 'rgba(140, 69, 34, 0.1)',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#8C4522' }}>↻ Flip</Text>
        </Pressable>

        <Pressable
          onPress={handleDelete}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: '#fef2f2',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>🗑 Delete</Text>
        </Pressable>

        <Pressable
          onPress={onDeselect}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: '#F2ECE4',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#A9927D' }}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}
