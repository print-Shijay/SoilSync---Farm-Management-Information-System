import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Minus, Plus, BookOpen, Clock, ChevronRight, Check } from 'lucide-react-native';
import { BackButton } from '../../../components/common/BackButton';
import { getModuleById, type ModuleRecord, type FarmModuleRecord } from '../../../lib/db-operations';
import { SproutIcon, TreeIcon, ShieldIcon, DropletIcon, FlaskIcon, LayersIcon } from '../../../components/learning/LearningIcons';
import { RichContentRenderer } from '../../../components/common/RichContentRenderer';
import {
  paginateRichContent,
  getSavedModulePage,
  saveModulePage,
  getSavedReadingFontSize,
  saveReadingFontSize,
} from '../../../lib/contentPaginator';
import { useAccessibility } from '../../../lib/accessibility/AccessibilityContext';

// ──────────────────────────────────────────────
// Apple Design Constants & Theming
// ──────────────────────────────────────────────

const DIFFICULTY_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  Beginner: { bg: '#ECFDF5', text: '#065F46', border: 'rgba(16,185,129,0.2)' },
  Intermediate: { bg: '#FFFBEB', text: '#92400E', border: 'rgba(245,158,11,0.25)' },
  Advanced: { bg: '#FEF2F2', text: '#991B1B', border: 'rgba(239,68,68,0.2)' },
};

function getCategoryIcon(category = '', size = 20) {
  const cat = category.toLowerCase();
  if (cat.includes('soil')) return <LayersIcon size={size} color="#8C4522" />;
  if (cat.includes('compost')) return <SproutIcon size={size} color="#10B981" />;
  if (cat.includes('crop')) return <TreeIcon size={size} color="#10B981" />;
  if (cat.includes('pest')) return <ShieldIcon size={size} color="#F43F5E" />;
  if (cat.includes('water') || cat.includes('irrigation')) return <DropletIcon size={size} color="#3B82F6" />;
  if (cat.includes('npk') || cat.includes('nutrient')) return <FlaskIcon size={size} color="#8B5CF6" />;
  return <BookOpen size={size} color="#8C4522" />;
}

// ──────────────────────────────────────────────
// Main Screen Component (Apple Design Reader)
// ──────────────────────────────────────────────
export default function ModuleBookReader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const { fontScale } = useAccessibility();
  const defaultBaseSize = useMemo(() => Math.round(18 * fontScale), [fontScale]);
  const [fontSize, setFontSize] = useState(defaultBaseSize);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [moduleData, setModuleData] = useState<ModuleRecord | FarmModuleRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user's saved reading font size
  useEffect(() => {
    getSavedReadingFontSize(defaultBaseSize).then((saved) => {
      setFontSize(saved);
    });
  }, [defaultBaseSize]);

  const handleFontSizeChange = (newSize: number) => {
    const clamped = Math.max(14, Math.min(24, newSize));
    setFontSize(clamped);
    saveReadingFontSize(clamped);
  };

  // Fetch module from SQLite and restore last read page from local storage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        if (!id) return;
        const result = await getModuleById(id);
        if (!cancelled) {
          setModuleData(result);
          const savedPage = await getSavedModulePage(id);
          if (!cancelled && savedPage > 0) {
            setCurrentChapter(savedPage);
          }
        }
      } catch (error) {
        console.error('Error loading module:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Paginate content into chapters (around 1-2 scrolls per page, preserving complete paragraphs)
  const chapters = useMemo(() => {
    return paginateRichContent(moduleData?.content, 1500);
  }, [moduleData?.content]);

  const progressPercent =
    chapters.length > 0 ? Math.round(((currentChapter + 1) / chapters.length) * 100) : 0;
  const moduleDiff =
    (moduleData as any)?.difficulty || (moduleData as any)?.difficulty_level || 'Beginner';
  const diffConfig = DIFFICULTY_CONFIG[moduleDiff] || DIFFICULTY_CONFIG.Beginner;
  const categoryName =
    (moduleData as any)?.category || (moduleData as any)?.module_category || 'Foundations';
  const moduleTitle =
    (moduleData as any)?.title || (moduleData as any)?.module_title || 'Farming Guide';
  const readingTime = (moduleData as any)?.reading_time_min || 5;

  const goToChapter = (chapter: number) => {
    setCurrentChapter(chapter);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (id) {
      saveModulePage(id, chapter);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#F8F6F0',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color="#8C4522" />
        <Text style={{ marginTop: 14, fontSize: 13, fontWeight: '700', color: '#8C4522' }}>
          Opening Farming Guide...
        </Text>
      </View>
    );
  }

  if (!moduleData) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#F8F6F0',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <BookOpen size={48} color="#8C4522" />
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#2A1610', marginTop: 16 }}>
          Module Not Found
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginTop: 20,
            paddingHorizontal: 24,
            paddingVertical: 12,
            backgroundColor: '#8C4522',
            borderRadius: 14,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF8F4' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FBF8F4" />

      {/* ── Apple Frosted Header ── */}
      <View
        style={{
          backgroundColor: '#FBF8F4',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(0,0,0,0.06)',
          paddingHorizontal: 16,
          paddingVertical: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.03,
          shadowRadius: 8,
          zIndex: 20,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          {/* Back Action + Title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <BackButton style={{ marginRight: 10 }} />

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '800',
                  color: '#8C4522',
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                }}
              >
                {categoryName}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 15,
                  fontWeight: '800',
                  color: '#1C120C',
                  letterSpacing: -0.3,
                }}
              >
                {moduleTitle}
              </Text>
            </View>
          </View>

          {/* Segmented Font Size Adjuster */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.04)',
              borderRadius: 20,
              padding: 3,
            }}
          >
            <TouchableOpacity
              onPress={() => handleFontSizeChange(fontSize - 1)}
              activeOpacity={0.7}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 2,
              }}
            >
              <Minus size={13} color="#523625" strokeWidth={2.8} />
            </TouchableOpacity>

            <Text
              style={{ fontSize: 11, fontWeight: '800', color: '#523625', marginHorizontal: 8 }}
            >
              {fontSize}
            </Text>

            <TouchableOpacity
              onPress={() => handleFontSizeChange(fontSize + 1)}
              activeOpacity={0.7}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 2,
              }}
            >
              <Plus size={13} color="#523625" strokeWidth={2.8} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Apple Slim Progress Ribbon */}
        <View
          style={{
            height: 3,
            backgroundColor: 'rgba(0,0,0,0.05)',
            borderRadius: 1.5,
            marginTop: 10,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              height: '100%',
              backgroundColor: '#8C4522',
              width: `${progressPercent}%`,
              borderRadius: 1.5,
            }}
          />
        </View>
      </View>

      {/* ── Scrollable Editorial Reader ── */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 120 }}
      >
        {/* Module Hero Cover Header (Editorial Style) */}
        {currentChapter === 0 && (
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              padding: 20,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.05)',
              shadowColor: '#2A1610',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.04,
              shadowRadius: 12,
              elevation: 2,
            }}
          >
            {/* Pill Tags */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: diffConfig.bg,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: diffConfig.border,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: diffConfig.text }}>
                  {moduleDiff}
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#FFFBEB',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: 'rgba(245,158,11,0.25)',
                }}
              >
                <Clock size={12} color="#B45309" />
                <Text
                  style={{ marginLeft: 4, fontSize: 11, fontWeight: '800', color: '#92400E' }}
                >
                  {readingTime} Min Read
                </Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(140,69,34,0.08)',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 10,
                }}
              >
                {getCategoryIcon(categoryName, 14)}
                <Text
                  style={{ marginLeft: 4, fontSize: 11, fontWeight: '800', color: '#8C4522' }}
                >
                  {categoryName}
                </Text>
              </View>
            </View>

            <Text
              style={{
                fontSize: 22,
                fontWeight: '900',
                color: '#1E293B',
                letterSpacing: -0.5,
                lineHeight: 28,
              }}
            >
              {moduleTitle}
            </Text>

            {(moduleData as any).description ? (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '500',
                  color: '#64748B',
                  lineHeight: 20,
                  marginTop: 6,
                }}
              >
                {(moduleData as any).description}
              </Text>
            ) : null}
          </View>
        )}

        {/* Paper Surface Reading Container */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            padding: 22,
            borderWidth: 1,
            borderColor: 'rgba(0,0,0,0.05)',
            shadowColor: '#2A1610',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.05,
            shadowRadius: 16,
            elevation: 3,
            minHeight: 380,
          }}
        >
          {/* Chapter Subtitle Indicator */}
          {chapters.length > 1 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 14,
                marginBottom: 16,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(0,0,0,0.05)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <BookOpen size={14} color="#8C4522" />
                <Text
                  style={{ marginLeft: 6, fontSize: 12, fontWeight: '800', color: '#8C4522' }}
                >
                  Part {currentChapter + 1} of {chapters.length}
                </Text>
              </View>

              <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8' }}>
                {Math.round(((currentChapter + 1) / chapters.length) * 100)}% Completed
              </Text>
            </View>
          )}

          {/* Rendered Nodes with Apple Typography & Media */}
          <RichContentRenderer
            content={chapters[currentChapter]}
            baseFontSize={fontSize}
            showImageZoom={true}
          />
        </View>

        {/* Chapter Dot Pills */}
        {chapters.length > 1 && (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: 18,
              gap: 6,
            }}
          >
            {chapters.map((_, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => goToChapter(idx)}
                style={{
                  width: idx === currentChapter ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    idx === currentChapter ? '#8C4522' : 'rgba(140,69,34,0.2)',
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Apple Floating Translucent Bottom Toolbar ── */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderTopWidth: 1,
          borderTopColor: 'rgba(0,0,0,0.06)',
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 24,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
        }}
      >
        <TouchableOpacity
          disabled={currentChapter === 0}
          onPress={() => goToChapter(currentChapter - 1)}
          activeOpacity={0.8}
          style={{
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 16,
            backgroundColor: 'rgba(0,0,0,0.04)',
            opacity: currentChapter === 0 ? 0.3 : 1,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#523625' }}>← Previous</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748B' }}>
          {currentChapter + 1} / {chapters.length}
        </Text>

        <TouchableOpacity
          onPress={() => {
            if (currentChapter < chapters.length - 1) {
              goToChapter(currentChapter + 1);
            } else {
              router.back();
            }
          }}
          activeOpacity={0.85}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 16,
            backgroundColor: currentChapter === chapters.length - 1 ? '#10B981' : '#8C4522',
            shadowColor: currentChapter === chapters.length - 1 ? '#10B981' : '#8C4522',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF', marginRight: 4 }}>
            {currentChapter === chapters.length - 1 ? 'Done' : 'Next'}
          </Text>
          {currentChapter === chapters.length - 1 ? (
            <Check size={14} color="#FFFFFF" strokeWidth={3} />
          ) : (
            <ChevronRight size={14} color="#FFFFFF" strokeWidth={3} />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
