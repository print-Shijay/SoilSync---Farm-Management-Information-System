import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import {
  ArrowLeft,
  Search,
  X,
  Sparkles,
  Calendar,
  ChevronRight,
  Bell,
} from 'lucide-react-native';
import { BackButton } from '../../components/common/BackButton';
import { getAllAnnouncements, AnnouncementRecord } from '../../lib/db-operations';
import { AnnouncementModal } from '../../components/homePage/AnnouncementModal';
import { useAccessibility } from '../../lib/accessibility';

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr.slice(0, 10);
  }
}

export default function AnnouncementsScreen() {
  const { fontScale, isGloveMode, isHighContrast, triggerHaptic } = useAccessibility();
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementRecord | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const data = await getAllAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      console.error('Failed to load announcements:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  // Extract unique categories for filter pills
  const categories = useMemo(() => {
    const defaultCats = [
      'All',
      'Insights & Updates',
      'Seasonal Advice',
      'Weather Advisory',
      'Tech in Ag',
      'Community',
    ];
    const fromData = announcements.map((a) => a.category).filter(Boolean);
    return Array.from(new Set([...defaultCats, ...fromData]));
  }, [announcements]);

  // Filter announcements based on search and selected category
  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((ann) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        (ann.category && ann.category.toLowerCase() === selectedCategory.toLowerCase());

      const query = searchQuery.trim().toLowerCase();
      if (!query) return matchesCategory;

      const matchesSearch =
        ann.title.toLowerCase().includes(query) ||
        ann.summary.toLowerCase().includes(query) ||
        (ann.content && ann.content.toLowerCase().includes(query)) ||
        (ann.category && ann.category.toLowerCase().includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [announcements, selectedCategory, searchQuery]);

  return (
    <View className="flex-1 bg-champagne">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header Navigation */}
      <View className="pt-14 pb-4 px-5 bg-champagne border-b border-taupe/10">
        <View className="flex-row items-center justify-between mb-3">
          <BackButton />

          <View className="flex-row items-center gap-1.5 rounded-full bg-cognac/10 border border-cognac/20 px-3 py-1">
            <Bell size={12} color="#8C4522" strokeWidth={2.2} />
            <Text
              style={{ fontSize: Math.round(11 * fontScale) }}
              className="font-bold uppercase tracking-[0.18em] text-cognac">
              News & Notices
            </Text>
          </View>
        </View>

        <Text
          style={{ fontSize: Math.round(28 * fontScale) }}
          className="font-black tracking-tight text-espresso leading-tight">
          Announcements
        </Text>
        <Text
          style={{ fontSize: Math.round(12 * fontScale) }}
          className="font-semibold text-taupe mt-1">
          Official updates, agricultural advisories, and farming tips.
        </Text>

        {/* Search Bar */}
        <View
          style={isGloveMode ? { minHeight: 48 } : undefined}
          className="mt-4 flex-row items-center rounded-2xl bg-white border border-black/5 px-3.5 py-2.5 shadow-xs">
          <Search size={16} color="#8C7C70" strokeWidth={2.2} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            maxLength={255}
            placeholder="Search announcements, tips, or topics..."
            placeholderTextColor="#8C7C70"
            style={{ fontSize: Math.round(14 * fontScale) }}
            className="ml-2.5 flex-1 font-medium text-espresso p-0"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                triggerHaptic('selection');
                setSearchQuery('');
              }}
              hitSlop={isGloveMode ? { top: 8, bottom: 8, left: 8, right: 8 } : { top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color="#8C7C70" strokeWidth={2.2} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Filter Pills (Horizontal Scroll) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="mt-3.5 -mx-5 px-5">
          <View className="flex-row items-center gap-2 pr-6">
            {categories.map((cat) => {
              const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedCategory(cat);
                  }}
                  activeOpacity={0.75}
                  hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                  style={isGloveMode ? { minHeight: 44, justifyContent: 'center' } : undefined}
                  className={`rounded-full px-3.5 py-1.5 border ${
                    isSelected
                      ? 'bg-cognac border-cognac shadow-xs'
                      : 'bg-white/80 border-taupe/15'
                  }`}>
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className={`font-bold ${
                      isSelected ? 'text-white' : 'text-taupe'
                    }`}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Main Feed Content */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#8C4522" />
          <Text
            style={{ fontSize: Math.round(12 * fontScale) }}
            className="font-semibold text-taupe mt-3">
            Loading announcements...
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-5 pt-4"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 60 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8C4522"
              colors={['#8C4522']}
            />
          }>
          {filteredAnnouncements.length > 0 ? (
            <View className="space-y-4">
              {filteredAnnouncements.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedAnnouncement(item);
                  }}
                  activeOpacity={0.85}
                  className="overflow-hidden rounded-[28px] border border-white/90 bg-white shadow-sm shadow-espresso/5">
                  {/* Banner Image (if available) */}
                  {item.banner_url ? (
                    <View className="h-40 w-full overflow-hidden bg-black/5">
                      <Image
                        source={{ uri: item.banner_url }}
                        className="h-full w-full"
                        resizeMode="cover"
                      />
                    </View>
                  ) : null}

                  {/* Card Body */}
                  <View className="p-5">
                    {/* Category Badge & Date */}
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="rounded-full bg-cognac/10 border border-cognac/20 px-2.5 py-0.5 flex-row items-center">
                        <Sparkles size={10} color="#8C4522" strokeWidth={2.5} />
                        <Text
                          style={{ fontSize: Math.round(10 * fontScale) }}
                          className="ml-1 font-bold uppercase tracking-wider text-cognac">
                          {item.category || 'Insights & Updates'}
                        </Text>
                      </View>

                      <View className="flex-row items-center">
                        <Calendar size={12} color="#8C7C70" strokeWidth={2} />
                        <Text
                          style={{ fontSize: Math.round(11 * fontScale) }}
                          className="ml-1 font-semibold text-taupe">
                          {formatDate(item.created_at)}
                        </Text>
                      </View>
                    </View>

                    {/* Title */}
                    <Text
                      style={{ fontSize: Math.round(18 * fontScale) }}
                      className="font-black tracking-tight text-espresso leading-snug mb-1.5">
                      {item.title}
                    </Text>

                    {/* Summary */}
                    <Text
                      numberOfLines={2}
                      style={{ fontSize: Math.round(12 * fontScale) }}
                      className="font-medium leading-relaxed text-espresso/70 mb-3">
                      {item.summary}
                    </Text>

                    {/* Bottom Action Footer */}
                    <View className="flex-row items-center justify-between pt-2.5 border-t border-taupe/10">
                      <Text
                        style={{ fontSize: Math.round(11 * fontScale) }}
                        className="font-bold text-cognac tracking-wide">
                        Read Full Announcement
                      </Text>
                      <View className="h-6 w-6 rounded-full bg-cognac/10 items-center justify-center">
                        <ChevronRight size={14} color="#8C4522" strokeWidth={2.5} />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View className="items-center justify-center py-16 px-6">
              <View className="h-16 w-16 rounded-3xl bg-taupe/10 items-center justify-center mb-4">
                <Bell size={28} color="#8C7C70" strokeWidth={1.8} />
              </View>
              <Text
                style={{ fontSize: Math.round(16 * fontScale) }}
                className="font-black text-espresso tracking-tight text-center">
                {searchQuery || selectedCategory !== 'All'
                  ? 'No matching announcements'
                  : 'No announcements yet'}
              </Text>
              <Text
                style={{ fontSize: Math.round(12 * fontScale) }}
                className="font-medium text-taupe text-center mt-1.5 leading-relaxed max-w-xs">
                {searchQuery || selectedCategory !== 'All'
                  ? 'Try adjusting your search terms or filter to find what you are looking for.'
                  : 'New announcements and seasonal farming advisories will appear here once published.'}
              </Text>
              {(searchQuery.length > 0 || selectedCategory !== 'All') && (
                <TouchableOpacity
                  onPress={() => {
                    triggerHaptic('selection');
                    setSearchQuery('');
                    setSelectedCategory('All');
                  }}
                  activeOpacity={0.75}
                  hitSlop={isGloveMode ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                  style={isGloveMode ? { minHeight: 48, justifyContent: 'center' } : undefined}
                  className="mt-4 rounded-xl bg-cognac px-4 py-2">
                  <Text
                    style={{ fontSize: Math.round(12 * fontScale) }}
                    className="font-bold text-white">
                    Reset Filters
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Detail Modal Reader */}
      <AnnouncementModal
        announcement={selectedAnnouncement}
        visible={!!selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </View>
  );
}
