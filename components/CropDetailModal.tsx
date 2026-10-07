import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Modal } from './common/AppModal';
import { useAccessibility } from '../lib/accessibility';
import { Crop, loadCropDetails } from '../lib/crop-planner';

type CropDetailModalProps = {
  crop: Crop;
  visible: boolean;
  onClose: () => void;
};

export default function CropDetailModal({ crop, visible, onClose }: CropDetailModalProps) {
  const { fontScale, isGloveMode, triggerHaptic } = useAccessibility();
  const details = useMemo(() => loadCropDetails(crop), [crop]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const selectedMilestone = details.milestones[selectedDayIndex] ?? details.milestones[0];

  const hitSlop = isGloveMode
    ? { top: 12, bottom: 12, left: 12, right: 12 }
    : { top: 6, bottom: 6, left: 6, right: 6 };

  useEffect(() => {
    if (visible) {
      setSelectedDayIndex(0);
    }
  }, [visible, crop]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="h-5/6 rounded-t-[32px] bg-champagne px-5 pb-8 pt-6 shadow-xl">
          <View className="mb-4 flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text
                className="font-black text-espresso"
                style={{ fontSize: Math.round(24 * fontScale) }}
              >
                {crop.crop}
              </Text>
              <Text
                className="font-semibold uppercase text-cognac"
                style={{ fontSize: Math.round(14 * fontScale) }}
              >
                {crop.type}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                triggerHaptic('selection');
                onClose();
              }}
              hitSlop={hitSlop}
              style={{ minHeight: isGloveMode ? 44 : undefined }}
              className="items-center justify-center rounded-full bg-taupe/30 px-4 py-2"
            >
              <Text
                className="font-bold text-espresso"
                style={{ fontSize: Math.round(14 * fontScale) }}
              >
                Close
              </Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View className="mb-6 rounded-[24px] bg-white p-5 shadow-sm shadow-espresso/10">
              <Text
                className="mb-2 font-semibold text-cognac"
                style={{ fontSize: Math.round(14 * fontScale) }}
              >
                Crop Info
              </Text>
              <Text
                className="text-espresso"
                style={{ fontSize: Math.round(16 * fontScale) }}
              >
                <Text className="font-bold">Maturity:</Text> {crop.maturity_days} days
              </Text>
              <Text
                className="text-espresso"
                style={{ fontSize: Math.round(16 * fontScale) }}
              >
                <Text className="font-bold">Season:</Text> {crop.season}
              </Text>
              {crop.soil_benefit ? (
                <Text
                  className="mt-2 text-espresso"
                  style={{ fontSize: Math.round(16 * fontScale) }}
                >
                  <Text className="font-bold">Soil Benefit:</Text> {crop.soil_benefit}
                </Text>
              ) : null}
              {crop.notes ? (
                <Text
                  className="mt-2 text-espresso"
                  style={{ fontSize: Math.round(16 * fontScale) }}
                >
                  <Text className="font-bold">Notes:</Text> {crop.notes}
                </Text>
              ) : null}
            </View>

            <Text
              className="mb-4 font-bold text-espresso"
              style={{ fontSize: Math.round(20 * fontScale) }}
            >
              Milestone Timeline
            </Text>

            {details.milestones.length > 0 ? (
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                  <View className="flex-row px-1 py-1">
                    {details.milestones.map((milestone, index) => {
                      const isSelected = selectedDayIndex === index;

                      return (
                        <Pressable
                          key={`${milestone.offset_days}-${milestone.title}`}
                          hitSlop={hitSlop}
                          onPress={() => {
                            triggerHaptic('selection');
                            setSelectedDayIndex(index);
                          }}
                          className={`mr-3 h-14 w-14 items-center justify-center rounded-full border-2 ${
                            isSelected
                              ? 'border-cognac bg-cognac shadow-md'
                              : 'border-taupe/30 bg-white'
                          }`}>
                          <Text
                            className="font-bold uppercase tracking-wider text-taupe"
                            style={{ fontSize: Math.round(10 * fontScale) }}
                          >
                            Day
                          </Text>
                          <Text
                            className={`font-black ${
                              isSelected ? 'text-white' : 'text-cognac'
                            }`}
                            style={{ fontSize: Math.round(18 * fontScale) }}
                          >
                            {milestone.offset_days}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>

                {selectedMilestone ? (
                  <View className="mb-4 rounded-2xl border border-cognac/20 bg-cognac/10 p-6 shadow-sm">
                    <Text
                      className="mb-2 font-bold uppercase tracking-widest text-cognac"
                      style={{ fontSize: Math.round(12 * fontScale) }}
                    >
                      Day {selectedMilestone.offset_days} Milestone
                    </Text>
                    <Text
                      className="mb-3 font-black text-espresso"
                      style={{ fontSize: Math.round(20 * fontScale) }}
                    >
                      {selectedMilestone.title}
                    </Text>
                    <Text
                      className="text-espresso"
                      style={{
                        fontSize: Math.round(16 * fontScale),
                        lineHeight: Math.round(24 * fontScale),
                      }}
                    >
                      {selectedMilestone.description}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text
                className="rounded-2xl bg-white px-4 py-3 font-semibold text-taupe"
                style={{ fontSize: Math.round(14 * fontScale) }}
              >
                No milestones are available for this crop yet.
              </Text>
            )}

            <View className="h-10" />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
