import React from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Modal } from './common/AppModal';
import { AlertTriangle, Save, Trash2, X } from 'lucide-react-native';

export interface UnsavedChangesModalProps {
  visible: boolean;
  onSave: () => void | Promise<void>;
  onDisregard: () => void;
  onKeepEditing: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  title?: string;
  description?: string;
  saveButtonText?: string;
  disregardButtonText?: string;
  keepEditingButtonText?: string;
}

export function UnsavedChangesModal({
  visible,
  onSave,
  onDisregard,
  onKeepEditing,
  saving = false,
  saveDisabled = false,
  title = 'Unsaved Changes',
  description = 'You have unsaved changes on this page. Would you like to save your changes before leaving, or disregard them?',
  saveButtonText = 'Save Changes',
  disregardButtonText = 'Disregard Changes',
  keepEditingButtonText = 'Keep Editing',
}: UnsavedChangesModalProps) {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onKeepEditing}
    >
      <View className="flex-1 justify-center items-center bg-black/55 px-6">
        <View className="w-full max-w-sm bg-champagne rounded-[28px] p-6 shadow-2xl border border-white/60">
          {/* Header Icon & Close Button */}
          <View className="flex-row justify-between items-start mb-4">
            <View className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-600/20 flex items-center justify-center shadow-sm">
              <AlertTriangle size={24} color="#B85D19" />
            </View>
            <Pressable
              onPress={onKeepEditing}
              disabled={saving}
              className="p-2 -mr-1.5 bg-taupe/10 active:bg-taupe/20 active:scale-95 rounded-full transition-transform"
            >
              <X size={18} color="#1C120C" />
            </Pressable>
          </View>

          {/* Title & Description with Apple Type System */}
          <Text className="text-xl font-black text-espresso tracking-tight mb-2">
            {title}
          </Text>
          <Text className="text-[14px] text-taupe leading-5 mb-6 font-medium">
            {description}
          </Text>

          {/* Action Buttons Stack */}
          <View className="gap-2.5">
            {/* Primary Save Button */}
            <Pressable
              onPress={onSave}
              disabled={saving || saveDisabled}
              className={`w-full flex-row items-center justify-center rounded-[18px] py-3.5 ${saveDisabled ? 'bg-taupe opacity-60' : 'bg-cognac shadow-md shadow-cognac/30 active:scale-[0.98] active:opacity-90'}`}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Save size={18} color="#ffffff" />
                  <Text className="ml-2 font-bold text-white text-[15px] tracking-wide">
                    {saveButtonText}
                  </Text>
                </>
              )}
            </Pressable>

            {/* Destructive Disregard Button */}
            <Pressable
              onPress={onDisregard}
              disabled={saving}
              className="w-full flex-row items-center justify-center rounded-[18px] border border-red-200/80 bg-red-50/80 py-3.5 active:scale-[0.98] active:bg-red-100/90"
            >
              <Trash2 size={18} color="#dc2626" />
              <Text className="ml-2 font-bold text-red-600 text-[15px] tracking-wide">
                {disregardButtonText}
              </Text>
            </Pressable>

            {/* Cancel / Keep Editing Button */}
            <Pressable
              onPress={onKeepEditing}
              disabled={saving}
              className="w-full py-2.5 items-center justify-center active:opacity-60"
            >
              <Text className="text-[14px] font-bold text-taupe">
                {keepEditingButtonText}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

