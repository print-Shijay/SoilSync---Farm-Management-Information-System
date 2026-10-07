import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  Keyboard,
} from 'react-native';
import { AppAlert as Alert } from './common/AppAlert';
import { Modal, KeyboardAvoidingView } from './common/AppModal';
import { X, Send, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react-native';
import { submitProblemReport } from '../lib/pending-uploads';

interface ReportProblemModalProps {
  visible: boolean;
  onClose: () => void;
  userId?: string;
  userEmail?: string;
  pendingUploadCount?: number;
  pendingTables?: string[];
}

const CATEGORIES = [
  'Sync Stuck / Pending Uploads',
  'Sign Out Delay',
  'Data Not Saving / Updating',
  'App Crash or Frozen',
  'Other Problem',
];

export function ReportProblemModal({
  visible,
  onClose,
  userId,
  userEmail,
  pendingUploadCount = 0,
  pendingTables = [],
}: ReportProblemModalProps) {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Missing Description', 'Please provide a brief description of the problem you are experiencing.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitProblemReport({
        userId,
        userEmail,
        category: selectedCategory,
        description: description.trim(),
        pendingUploadCount,
        pendingTables,
      });

      if (result.success) {
        Alert.alert(
          'Report Submitted',
          'Thank you for reporting this issue! Your diagnostic details have been logged.',
          [{ text: 'OK', onPress: () => { setDescription(''); onClose(); } }]
        );
      } else {
        Alert.alert('Submission Error', result.error || 'Failed to submit report. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'An error occurred while submitting report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-1 justify-end bg-black/60">
          <Pressable className="flex-1" onPress={handleClose} />
          <View className="bg-champagne rounded-t-3xl p-6 max-h-[85%] shadow-xl">
            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-row items-center space-x-2">
                <ShieldAlert size={24} color="#8C4522" />
                <Text className="text-2xl font-black text-espresso ml-2">Report a Problem</Text>
              </View>
              <Pressable onPress={handleClose} className="p-2 -mr-2 bg-taupe/10 rounded-full">
                <X size={20} color="#1C120C" />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={false}
              className="mb-4">
              <Text className="text-sm font-semibold text-taupe mb-3">
                Describe what happened so our team can resolve any sync or application issue for you.
              </Text>

              {/* Category Selector */}
              <Text className="text-xs font-bold text-espresso uppercase tracking-wider mb-2">
                Problem Category
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setSelectedCategory(cat)}
                      className={`px-3 py-2 rounded-xl border ${
                        isSelected
                          ? 'bg-espresso border-espresso'
                          : 'bg-white border-taupe/20'
                      }`}>
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-white' : 'text-espresso'
                        }`}>
                        {cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Description Area */}
              <Text className="text-xs font-bold text-espresso uppercase tracking-wider mb-2">
                Details / Description
              </Text>
              <TextInput
                multiline
                numberOfLines={4}
                maxLength={3000}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. My farm layout edits aren't uploading when I click logout..."
                placeholderTextColor="#8C7C70"
                textAlignVertical="top"
                className="bg-white border border-taupe/30 rounded-2xl p-4 text-espresso font-medium text-sm mb-4 min-h-[100px]"
              />

              {/* Diagnostic Details Box */}
              <View className="bg-white/70 border border-taupe/20 rounded-2xl p-4 mb-2">
                <Text className="text-xs font-bold text-espresso uppercase tracking-wider mb-1">
                  Auto-Attached System Info
                </Text>
                <Text className="text-xs text-taupe">
                  User: {userEmail || userId || 'Anonymous'}
                </Text>
                <Text className="text-xs text-taupe mt-0.5">
                  Pending Sync Queue: <Text className="font-bold text-cognac">{pendingUploadCount} item(s)</Text>
                </Text>
                {pendingTables.length > 0 && (
                  <Text className="text-xs text-taupe mt-0.5" numberOfLines={2}>
                    Affected Tables: {pendingTables.join(', ')}
                  </Text>
                )}
              </View>
            </ScrollView>

            {/* Action buttons */}
            <View className="flex-row gap-3 pt-2 border-t border-espresso/10">
              <Pressable
                onPress={onClose}
                disabled={submitting}
                className="flex-1 py-3.5 rounded-xl border border-taupe/30 bg-white items-center justify-center">
                <Text className="text-sm font-bold text-espresso">Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3.5 rounded-xl bg-cognac items-center justify-center flex-row shadow-sm shadow-espresso/20 active:scale-[0.98]">
                {submitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Send size={18} color="#ffffff" className="mr-2" />
                    <Text className="text-sm font-bold text-white ml-2">Submit Report</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
