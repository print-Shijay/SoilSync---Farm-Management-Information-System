/**
 * Farm Layout Designer — CanvasActionDock
 *
 * Human-Centered Design (HCD) bottom control dock displayed when an element
 * (Plot, Facility, or Zone) is actively selected on the farm canvas.
 *
 * For Facilities:
 * - Top Row: Click-to-edit name, Settings (size & role editor), Delete, and Done buttons.
 * - Sub-label: Dimensions (e.g. 4.0m × 4.0m) directly beneath the name.
 * - Main Body: Dynamic "Inventory" and/or "Schedule" naming input fields based on role.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Switch,
} from 'react-native';
import { AppAlert as Alert } from '../../../components/common/AppAlert';
import {
  RefreshCw,
  Trash2,
  Copy,
  Pencil,
  Box,
  Check,
  Layers,
  Settings,
} from '../../../components/Icons';
import { Clock, Lock, LockOpen } from 'lucide-react-native';
import type { DesignerPlot, FarmFacility, FarmZone, FacilityFunction } from '../types';
import { FacilitySizeModal } from './FacilitySizeModal';

type CanvasActionDockProps = {
  selectedPlot?: DesignerPlot | null;
  selectedFacility?: FarmFacility | null;
  selectedZone?: FarmZone | null;
  onFlipPlot?: (plotId: string) => void;
  onDuplicatePlot?: (plotId: string) => void;
  onDeletePlot?: (plotId: string) => void;
  onRenamePlot?: (plotId: string, newLabel: string) => void;
  onResizePlot?: (plotId: string, widthM: number, heightM: number) => void;
  onDeleteFacility?: (facilityId: string) => void;
  onRenameFacility?: (facilityId: string, newName: string) => void;
  onResizeFacility?: (facilityId: string, widthM: number, heightM: number) => void;
  onUpdateFacilityRole?: (facilityId: string, role: FacilityFunction) => void;
  onUpdateFacilityInventoryName?: (facilityId: string, inventoryName: string) => void;
  onUpdateFacilityScheduleName?: (facilityId: string, scheduleName: string) => void;
  onToggleFacilityInventory?: (facilityId: string, enabled: boolean) => void;
  onToggleFacilitySchedule?: (facilityId: string, enabled: boolean) => void;
  onToggleZoneLock?: (zoneId: string) => void;
  onTogglePlotLock?: (plotId: string) => void;
  onToggleFacilityLock?: (facilityId: string) => void;
  onDeleteZone?: (zoneId: string) => void;
  onRenameZone?: (zoneId: string, newName: string) => void;
  onResizeZone?: (zoneId: string, widthM: number, heightM: number) => void;
  minZoneWidthM?: number;
  minZoneHeightM?: number;
  onDeselect: () => void;
};

export function CanvasActionDock({
  selectedPlot,
  selectedFacility,
  selectedZone,
  onFlipPlot,
  onDuplicatePlot,
  onDeletePlot,
  onRenamePlot,
  onResizePlot,
  onDeleteFacility,
  onRenameFacility,
  onResizeFacility,
  onUpdateFacilityRole,
  onUpdateFacilityInventoryName,
  onUpdateFacilityScheduleName,
  onToggleFacilityInventory,
  onToggleFacilitySchedule,
  onToggleZoneLock,
  onTogglePlotLock,
  onToggleFacilityLock,
  onDeleteZone,
  onRenameZone,
  onResizeZone,
  minZoneWidthM,
  minZoneHeightM,
  onDeselect,
}: CanvasActionDockProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const currentTitle =
    selectedPlot?.label || selectedFacility?.name || selectedZone?.name || '';
  const [renameText, setRenameText] = useState(currentTitle);

  // Custom facility inventory and schedule names
  const [inventoryNameText, setInventoryNameText] = useState('');
  const [scheduleNameText, setScheduleNameText] = useState('');

  // Switch toggle states: Default OFF unless explicitly active
  const [isInventoryOn, setIsInventoryOn] = useState(false);
  const [isScheduleOn, setIsScheduleOn] = useState(false);

  // Sync state whenever selected element changes
  useEffect(() => {
    setRenameText(currentTitle);
    setIsRenaming(false);

    if (selectedFacility) {
      setInventoryNameText(
        selectedFacility.inventoryName || `${selectedFacility.name} Inventory`
      );
      setScheduleNameText(
        selectedFacility.scheduleName || `${selectedFacility.name} Schedule`
      );

      // Default is OFF unless explicitly turned on
      const invActive = selectedFacility.hasInventory === true;
      const schedActive = selectedFacility.hasSchedule === true;
      setIsInventoryOn(invActive);
      setIsScheduleOn(schedActive);
    }
  }, [
    selectedPlot?.id,
    selectedFacility?.id,
    selectedZone?.id,
    currentTitle,
    selectedFacility?.inventoryName,
    selectedFacility?.scheduleName,
    selectedFacility?.hasInventory,
    selectedFacility?.hasSchedule,
  ]);

  const handleToggleInventorySwitch = (val: boolean) => {
    if (val) {
      setIsInventoryOn(true);
      if (selectedFacility && onToggleFacilityInventory) {
        onToggleFacilityInventory(selectedFacility.id, true);
      }
    } else {
      Alert.alert(
        'Delete Inventory?',
        'If you turn off this, your inventory will be deleted.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setIsInventoryOn(true);
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              setIsInventoryOn(false);
              if (selectedFacility && onToggleFacilityInventory) {
                onToggleFacilityInventory(selectedFacility.id, false);
              }
            },
          },
        ],
        { cancelable: false }
      );
    }
  };

  const handleToggleScheduleSwitch = (val: boolean) => {
    if (val) {
      setIsScheduleOn(true);
      if (selectedFacility && onToggleFacilitySchedule) {
        onToggleFacilitySchedule(selectedFacility.id, true);
      }
    } else {
      Alert.alert(
        'Delete Schedule?',
        'If you turn off this, your schedule will be deleted.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setIsScheduleOn(true);
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              setIsScheduleOn(false);
              if (selectedFacility && onToggleFacilitySchedule) {
                onToggleFacilitySchedule(selectedFacility.id, false);
              }
            },
          },
        ],
        { cancelable: false }
      );
    }
  };

  if (!selectedPlot && !selectedFacility && !selectedZone) {
    return null;
  }

  const dimensionText = selectedPlot
    ? `${selectedPlot.widthM}m × ${selectedPlot.heightM}m`
    : selectedFacility
    ? `${selectedFacility.widthM}m × ${selectedFacility.heightM}m`
    : selectedZone
    ? `${selectedZone.widthM}m × ${selectedZone.heightM}m`
    : '';

  const handleRenameSubmit = () => {
    // Security & Data Integrity: enforce 255 char limit
    const trimmed = renameText.trim().slice(0, 255);
    if (trimmed && trimmed !== currentTitle) {
      if (selectedPlot && onRenamePlot) {
        onRenamePlot(selectedPlot.id, trimmed);
      } else if (selectedFacility && onRenameFacility) {
        onRenameFacility(selectedFacility.id, trimmed);
      } else if (selectedZone && onRenameZone) {
        onRenameZone(selectedZone.id, trimmed);
      }
    }
    setIsRenaming(false);
  };

  const handleInventoryNameBlur = () => {
    if (selectedFacility && onUpdateFacilityInventoryName) {
      const fallback = `${selectedFacility.name} Inventory`;
      // Security & Data Integrity: enforce 255 char limit
      const val = (inventoryNameText.trim() || fallback).slice(0, 255);
      setInventoryNameText(val);
      onUpdateFacilityInventoryName(selectedFacility.id, val);
    }
  };

  const handleScheduleNameBlur = () => {
    if (selectedFacility && onUpdateFacilityScheduleName) {
      const fallback = `${selectedFacility.name} Schedule`;
      // Security & Data Integrity: enforce 255 char limit
      const val = (scheduleNameText.trim() || fallback).slice(0, 255);
      setScheduleNameText(val);
      onUpdateFacilityScheduleName(selectedFacility.id, val);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Remove Element',
      `Are you sure you want to remove "${currentTitle}" from the layout?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (selectedPlot && onDeletePlot) onDeletePlot(selectedPlot.id);
            if (selectedFacility && onDeleteFacility) onDeleteFacility(selectedFacility.id);
            if (selectedZone && onDeleteZone) onDeleteZone(selectedZone.id);
          },
        },
      ]
    );
  };

  const handleSaveSizeAndRole = (
    facilityId: string,
    widthM: number,
    heightM: number,
    role: FacilityFunction
  ) => {
    if (onResizeFacility) onResizeFacility(facilityId, widthM, heightM);
    if (onUpdateFacilityRole) onUpdateFacilityRole(facilityId, role);
  };

  // Facility Role Identification: inventory, time/schedule, or both
  const facilityRole = selectedFacility?.facilityFunction || 'inventory';
  const showInventorySection =
    selectedFacility && (facilityRole === 'inventory' || facilityRole === 'both');
  const showScheduleSection =
    selectedFacility && (facilityRole === 'time_keeping' || facilityRole === 'both');

  return (
    <View style={styles.container}>
      {/* ─── Top Control Row: Click-to-Edit Name, Settings, Delete, Done ─── */}
      <View style={styles.topControlRow}>
        {/* Left Side: Clickable Title & Size Label Beneath */}
        <View style={styles.titleContainer}>
          {isRenaming ? (
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              maxLength={255}
              onBlur={handleRenameSubmit}
              onSubmitEditing={handleRenameSubmit}
              autoFocus
              selectTextOnFocus
              style={styles.renameInput}
            />
          ) : (
            <Pressable
              onPress={() => {
                setRenameText(currentTitle);
                setIsRenaming(true);
              }}
              style={styles.titlePressable}>
              <Text numberOfLines={1} style={styles.itemTitle}>
                {currentTitle}
              </Text>
              <Pencil size={13} color="#8C4522" strokeWidth={2.4} />
            </Pressable>
          )}

          {/* Size Label Below the Name (Tap to edit dimensions) */}
          <Pressable
            onPress={() => setIsSettingsModalOpen(true)}
            hitSlop={6}
            accessibilityLabel="Adjust Dimensions"
            style={styles.sizeBadge}>
            <Text style={styles.sizeText}>{dimensionText}</Text>
          </Pressable>
        </View>

        {/* Right Side: Action Buttons in the Same Row */}
        <View style={styles.topActionsRow}>
          {/* Plot-specific quick actions */}
          {selectedPlot && onFlipPlot && (
            <Pressable
              onPress={() => onFlipPlot(selectedPlot.id)}
              hitSlop={6}
              style={[styles.iconButton, styles.rotateButton]}
              accessibilityLabel="Rotate Plot">
              <RefreshCw size={15} color="#8C4522" strokeWidth={2.5} />
            </Pressable>
          )}

          {selectedPlot && onDuplicatePlot && (
            <Pressable
              onPress={() => onDuplicatePlot(selectedPlot.id)}
              hitSlop={6}
              style={[styles.iconButton, styles.duplicateButton]}
              accessibilityLabel="Duplicate Plot">
              <Copy size={15} color="#D97706" strokeWidth={2.4} />
            </Pressable>
          )}

          {/* Plot lock toggle */}
          {selectedPlot && onTogglePlotLock && (
            <Pressable
              onPress={() => onTogglePlotLock(selectedPlot.id)}
              hitSlop={6}
              style={[
                styles.iconButton,
                selectedPlot.isLocked ? styles.lockedButton : styles.unlockedButton,
              ]}
              accessibilityLabel="Toggle Plot Lock">
              {selectedPlot.isLocked ? (
                <Lock size={15} color="#D97706" strokeWidth={2.4} />
              ) : (
                <LockOpen size={15} color="#78716C" strokeWidth={2.2} />
              )}
            </Pressable>
          )}

          {/* Facility lock toggle */}
          {selectedFacility && onToggleFacilityLock && (
            <Pressable
              onPress={() => onToggleFacilityLock(selectedFacility.id)}
              hitSlop={6}
              style={[
                styles.iconButton,
                selectedFacility.isLocked ? styles.lockedButton : styles.unlockedButton,
              ]}
              accessibilityLabel="Toggle Facility Lock">
              {selectedFacility.isLocked ? (
                <Lock size={15} color="#D97706" strokeWidth={2.4} />
              ) : (
                <LockOpen size={15} color="#78716C" strokeWidth={2.2} />
              )}
            </Pressable>
          )}

          {/* Zone-specific lock toggle */}
          {selectedZone && onToggleZoneLock && (
            <Pressable
              onPress={() => onToggleZoneLock(selectedZone.id)}
              hitSlop={6}
              style={[
                styles.iconButton,
                selectedZone.isLockedGroup ? styles.lockedButton : styles.unlockedButton,
              ]}
              accessibilityLabel="Toggle Lock">
              <Layers
                size={15}
                color={selectedZone.isLockedGroup ? '#15803D' : '#78716C'}
                strokeWidth={2.4}
              />
            </Pressable>
          )}

          {/* Settings Button (Size & Dimensions for Plot, Facility, or Zone) */}
          {(selectedPlot || selectedFacility || selectedZone) && (
            <Pressable
              onPress={() => setIsSettingsModalOpen(true)}
              hitSlop={6}
              style={[styles.iconButton, styles.settingsButton]}
              accessibilityLabel={
                selectedPlot
                  ? 'Plot Settings'
                  : selectedZone
                  ? 'Zone Settings'
                  : 'Facility Settings'
              }>
              <Settings size={16} color="#475569" strokeWidth={2.4} />
            </Pressable>
          )}

          {/* Delete Button */}
          <Pressable
            onPress={confirmDelete}
            hitSlop={6}
            style={[styles.iconButton, styles.deleteButton]}
            accessibilityLabel="Delete Element">
            <Trash2 size={16} color="#DC2626" strokeWidth={2.4} />
          </Pressable>

          {/* Done Button */}
          <Pressable onPress={onDeselect} style={styles.donePill} hitSlop={6}>
            <Check size={14} color="#FFFFFF" strokeWidth={3} />
            <Text style={styles.donePillText}>Done</Text>
          </Pressable>
        </View>
      </View>

      {/* ─── Main Body: Dynamic Facility Sections with ON/OFF Switches ─── */}
      {selectedFacility && (
        <View style={styles.mainBodyContainer}>
          {/* 1. Inventory Switch Card */}
          <View style={[styles.switchCard, isInventoryOn && styles.switchCardActiveInventory]}>
            <View style={styles.switchHeaderRow}>
              <View style={styles.switchLabelGroup}>
                <View
                  style={[
                    styles.switchIconBadge,
                    isInventoryOn && styles.switchIconBadgeActiveInventory,
                  ]}>
                  <Box size={14} color={isInventoryOn ? '#8C4522' : '#8C7C70'} strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.switchTitle, isInventoryOn && styles.switchTitleActiveInventory]}>
                      Inventory
                    </Text>
                    <View style={[styles.statusPill, isInventoryOn ? styles.statusPillOn : styles.statusPillOff]}>
                      <Text style={[styles.statusPillText, isInventoryOn ? styles.statusPillTextOn : styles.statusPillTextOff]}>
                        {isInventoryOn ? 'ON' : 'OFF'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.switchSubtitle} numberOfLines={1}>
                    {isInventoryOn ? 'Active • Stock & supplies tracking' : 'Disabled • Off by default'}
                  </Text>
                </View>
              </View>

              <Switch
                value={isInventoryOn}
                onValueChange={handleToggleInventorySwitch}
                trackColor={{ false: '#E2D9CE', true: '#F4BA89' }}
                thumbColor={isInventoryOn ? '#8C4522' : '#FFFFFF'}
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            </View>

            {/* If turned on, show the editable naming box */}
            {isInventoryOn && (
              <View style={styles.switchInputWrapper}>
                <Text style={styles.inputHelperLabel}>Inventory Name</Text>
                <TextInput
                  value={inventoryNameText}
                  onChangeText={setInventoryNameText}
                  maxLength={255}
                  onBlur={handleInventoryNameBlur}
                  placeholder={`${selectedFacility.name} Inventory`}
                  placeholderTextColor="#A9927D"
                  style={styles.fieldInput}
                />
              </View>
            )}
          </View>

          {/* 2. Schedule Switch Card */}
          <View style={[styles.switchCard, isScheduleOn && styles.switchCardActiveSchedule]}>
            <View style={styles.switchHeaderRow}>
              <View style={styles.switchLabelGroup}>
                <View
                  style={[
                    styles.switchIconBadge,
                    isScheduleOn && styles.switchIconBadgeActiveSchedule,
                  ]}>
                  <Clock size={14} color={isScheduleOn ? '#4338CA' : '#8C7C70'} strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.switchTitle, isScheduleOn && styles.switchTitleActiveSchedule]}>
                      Schedule
                    </Text>
                    <View style={[styles.statusPill, isScheduleOn ? styles.statusPillOnIndigo : styles.statusPillOff]}>
                      <Text style={[styles.statusPillText, isScheduleOn ? styles.statusPillTextOnIndigo : styles.statusPillTextOff]}>
                        {isScheduleOn ? 'ON' : 'OFF'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.switchSubtitle} numberOfLines={1}>
                    {isScheduleOn ? 'Active • Labor & task logs tracking' : 'Disabled • Off by default'}
                  </Text>
                </View>
              </View>

              <Switch
                value={isScheduleOn}
                onValueChange={handleToggleScheduleSwitch}
                trackColor={{ false: '#E2D9CE', true: '#C7D2FE' }}
                thumbColor={isScheduleOn ? '#4338CA' : '#FFFFFF'}
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            </View>

            {/* If turned on, show the editable naming box */}
            {isScheduleOn && (
              <View style={styles.switchInputWrapper}>
                <Text style={styles.inputHelperLabel}>Schedule Name</Text>
                <TextInput
                  value={scheduleNameText}
                  onChangeText={setScheduleNameText}
                  maxLength={255}
                  onBlur={handleScheduleNameBlur}
                  placeholder={`${selectedFacility.name} Schedule`}
                  placeholderTextColor="#A9927D"
                  style={styles.fieldInput}
                />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Element Size & Role Modal Sheet (Plots, Facilities, and Zones) */}
      {(selectedFacility || selectedPlot || selectedZone) && (
        <FacilitySizeModal
          facility={selectedFacility}
          plot={selectedPlot}
          zone={selectedZone}
          visible={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          onSaveSizeAndFunction={handleSaveSizeAndRole}
          onSaveSize={(id, widthM, heightM) => {
            if (selectedPlot && onResizePlot) {
              onResizePlot(id, widthM, heightM);
            } else if (selectedZone && onResizeZone) {
              onResizeZone(id, widthM, heightM);
            } else if (selectedFacility && onResizeFacility) {
              onResizeFacility(id, widthM, heightM);
            }
          }}
          minWidthM={selectedZone ? minZoneWidthM : undefined}
          minHeightM={selectedZone ? minZoneHeightM : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderTopColor: '#E2D9CE',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleContainer: {
    flex: 1,
    paddingRight: 4,
  },
  titlePressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1C120C',
    letterSpacing: -0.2,
    maxWidth: '85%',
  },
  renameInput: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1C120C',
    borderBottomWidth: 2,
    borderBottomColor: '#8C4522',
    paddingVertical: 1,
    paddingHorizontal: 2,
  },
  sizeBadge: {
    marginTop: 2,
  },
  sizeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8C7C70',
    letterSpacing: 0.1,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButton: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  deleteButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  rotateButton: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  duplicateButton: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FEF08A',
  },
  lockedButton: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  unlockedButton: {
    backgroundColor: '#F5F5F4',
    borderColor: '#E7E5E4',
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  donePillText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  mainBodyContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F2ECE4',
    gap: 8,
  },
  switchCard: {
    backgroundColor: '#FAF7F4',
    borderWidth: 1.2,
    borderColor: '#EAE1D7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  switchCardActiveInventory: {
    backgroundColor: '#FFFBF7',
    borderColor: '#F4BA89',
  },
  switchCardActiveSchedule: {
    backgroundColor: '#F8FAFF',
    borderColor: '#C7D2FE',
  },
  switchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  switchIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#EAE1D7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchIconBadgeActiveInventory: {
    backgroundColor: '#FDEEE2',
  },
  switchIconBadgeActiveSchedule: {
    backgroundColor: '#EEF2FF',
  },
  switchTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#57534E',
  },
  switchTitleActiveInventory: {
    color: '#8C4522',
  },
  switchTitleActiveSchedule: {
    color: '#4338CA',
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  statusPillOff: {
    backgroundColor: '#E7E5E4',
  },
  statusPillOn: {
    backgroundColor: '#FDEEE2',
  },
  statusPillOnIndigo: {
    backgroundColor: '#EEF2FF',
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusPillTextOff: {
    color: '#78716C',
  },
  statusPillTextOn: {
    color: '#8C4522',
  },
  statusPillTextOnIndigo: {
    color: '#4338CA',
  },
  switchSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#A8A29E',
    marginTop: 1,
  },
  switchInputWrapper: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0E8DF',
  },
  inputHelperLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#78716C',
    marginBottom: 4,
  },
  fieldInput: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C120C',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2D9CE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
