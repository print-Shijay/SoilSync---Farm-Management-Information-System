/**
 * Farm Layout Designer — Toolbar
 *
 * Bottom action bar with Add Plot, Save, and navigation controls.
 */

import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, Save, Copy, Building2, Layers } from '../../../components/Icons';

type ToolbarProps = {
  plotCount: number;
  facilityCount?: number;
  zoneCount?: number;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onAddPlot: () => void;
  onOpenAddModal?: () => void;
  onSave: () => void;
  onBack: () => void;
  onDuplicatePlot?: () => void;
  canDuplicate?: boolean;
  isMasterLayout?: boolean;
};

export function Toolbar({
  plotCount,
  facilityCount = 0,
  zoneCount = 0,
  hasUnsavedChanges,
  isSaving,
  onAddPlot,
  onOpenAddModal,
  onSave,
  onBack,
  onDuplicatePlot,
  canDuplicate = false,
  isMasterLayout = true,
}: ToolbarProps) {
  const insets = useSafeAreaInsets();

  const totalElements = plotCount + facilityCount + zoneCount;

  return (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 16),
      }}>
      {/* Counters & Unsaved Badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#8C4522', letterSpacing: 0.5 }}>
            {plotCount} {plotCount === 1 ? 'PLOT' : 'PLOTS'}
          </Text>

          {(facilityCount > 0 || isMasterLayout) && (
            <>
              <Text style={{ fontSize: 11, color: '#A9927D' }}>•</Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#0369A1', letterSpacing: 0.5 }}>
                {facilityCount} {facilityCount === 1 ? 'FACILITY' : 'FACILITIES'}
              </Text>
            </>
          )}

          {zoneCount > 0 && (
            <>
              <Text style={{ fontSize: 11, color: '#A9927D' }}>•</Text>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#15803D', letterSpacing: 0.5 }}>
                {zoneCount} {zoneCount === 1 ? 'ZONE' : 'ZONES'}
              </Text>
            </>
          )}
        </View>

        {hasUnsavedChanges && (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: '#F2ECE4',
              borderWidth: 1,
              borderColor: 'rgba(140, 69, 34, 0.25)',
            }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#8C4522' }}>UNSAVED</Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {/* Back */}
        <Pressable
          onPress={onBack}
          style={{
            flex: 1,
            paddingVertical: 13,
            borderRadius: 16,
            backgroundColor: '#F2ECE4',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <ArrowLeft color="#8C4522" size={20} />
        </Pressable>

        {/* Duplicate */}
        <Pressable
          onPress={onDuplicatePlot}
          disabled={!canDuplicate}
          style={{
            flex: 1,
            paddingVertical: 13,
            borderRadius: 16,
            backgroundColor: canDuplicate ? 'rgba(140, 69, 34, 0.15)' : '#F2ECE4',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canDuplicate ? 1 : 0.6,
          }}>
          <Copy color={canDuplicate ? '#8C4522' : '#8C7C70'} size={20} />
        </Pressable>

        {/* Add Plot Bed */}
        <Pressable
          onPress={onAddPlot}
          style={{
            flex: 1.3,
            paddingVertical: 13,
            borderRadius: 16,
            backgroundColor: 'rgba(217, 156, 43, 0.2)',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 4,
          }}>
          <Plus color="#8C4522" size={18} />
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#8C4522' }}>Plot</Text>
        </Pressable>

        {/* Add Facility or Zone */}
        {onOpenAddModal && (
          <Pressable
            onPress={onOpenAddModal}
            style={{
              flex: 1.5,
              paddingVertical: 13,
              borderRadius: 16,
              backgroundColor: isMasterLayout ? 'rgba(3, 105, 161, 0.15)' : 'rgba(21, 128, 61, 0.15)',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 4,
            }}>
            {isMasterLayout ? (
              <>
                <Building2 color="#0369A1" size={17} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#0369A1' }}>Facility</Text>
              </>
            ) : (
              <>
                <Layers color="#15803D" size={17} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#15803D' }}>Zone</Text>
              </>
            )}
          </Pressable>
        )}

        {/* Save */}
        <Pressable
          onPress={onSave}
          disabled={isSaving || totalElements === 0}
          style={{
            flex: 1.2,
            paddingVertical: 13,
            borderRadius: 16,
            backgroundColor: isSaving || totalElements === 0 ? 'rgba(140, 69, 34, 0.4)' : '#8C4522',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
          }}>
          {isSaving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Save color={totalElements === 0 ? '#8C7C70' : '#ffffff'} size={20} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

